// Train dwell/boarding state machine + block-section spacing.
//
// Advances every train one tick through the cycle:
//   run -> dwell(unload -> load -> ready) -> [dispatch] -> run
//
// With the Dual-Berth Station research (`berths: 2`) the station splits into a
// rear unload berth and a front load berth, pipelining two trains:
//   run -> dwell(rear: unload -> waitBerth -> advance) -> (front: load -> ready)
// A train that finds the station empty still docks straight at the front berth
// and runs the classic unload -> load there.
//
// A train that finishes boarding enters the `ready` phase and waits at the
// platform. It departs only when dispatched — either manually (the player clicks
// it) or automatically once the Auto Dispatch research is owned. Ride income is
// credited at dispatch, so launching is a real action with economic weight.
//
// Block sections: a following train slows/stops so its lead car never gets
// within `blockGap` (arc length) of the rear car of the train ahead, preventing
// overlap and keeping trains from draining the queue all at once.
//
// The core logic is pure (mutates only the train objects, `sim`, `state`); all
// rendering is injected as callbacks: placeTrain, setOccupancy, onDeposit.

// forward arc-length distance from a to b around a loop of length L
function forwardDist(a, b, L) {
  return ((b - a) % L + L) % L;
}

// how far this train may advance before its lead car reaches `blockGap` behind
// the rear car of the nearest train ahead (Infinity when nothing is ahead)
function allowedAdvance(tr, trains, L, carLen, blockGap) {
  let maxAdv = Infinity;
  for (const other of trains) {
    if (other === tr) continue;
    const otherRear = other.s - (other.cars.length - 1) * carLen;
    const gap = forwardDist(tr.s, otherRear, L) - blockGap;
    if (gap < maxAdv) maxAdv = gap;
  }
  return Math.max(0, maxAdv);
}

// Credit a ready train's ride and send it back out. Returns true if it launched.
// Photographers add a flat photo-sales bonus per dispatched (non-empty) train;
// vendor carts (hats/balloons) add per-rider merch bought while queueing.
export function dispatchTrain(tr, { economy, state, onDeposit = () => {} }) {
  if (tr.mode !== 'dwell' || tr.phase !== 'ready') return false;
  const photos = tr.cycleBoard > 0 ? Math.round(economy.photoPerRide || 0) : 0;
  const vendors = Math.round(tr.cycleBoard * (economy.vendorPerRider || 0));
  const merch = Math.round(tr.cycleBoard * economy.perRider * (economy.merchRate || 0));
  const income = Math.round(tr.cycleBoard * economy.perRider) + photos + vendors + merch;
  if (income > 0) {
    state.money += income;
    state.rides += 1;
    onDeposit(tr, income);
  }
  tr.mode = 'run';
  tr.phase = '';
  tr.timer = 0;
  tr.prevS = tr.s;
  return true;
}

export function stepTrains({
  trains,
  dt,
  economy,
  pathLen,
  stopS,
  sim,
  state,
  speedAt,
  stationBusy = () => false,
  carLen = 1.7,
  blockGap = 2.4,
  berths = 1,
  advanceTime = 1.1,
  autoDispatch = false,
  dispatchDelay = Infinity,
  placeTrain = () => {},
  setOccupancy = () => {},
  onDeposit = () => {},
}) {
  // Berth occupancy — legacy trains without a `berth` field count as front.
  const frontClaimed = () => trains.some(t => t.mode === 'dwell' && t.berth !== 'rear');
  const rearClaimed = () => trains.some(t => t.mode === 'dwell' && t.berth === 'rear');
  // reserve guests from the line immediately so two trains can't grab the same people
  const beginLoad = tr => {
    tr.phase = 'load';
    tr.timer = 0;
    tr.cycleBoard = Math.min(economy.seatsCap, Math.floor(sim.queue));
    sim.queue = Math.max(0, sim.queue - tr.cycleBoard);
  };
  for (const tr of trains) {
    if (tr.mode === 'run') {
      tr.prevS = tr.s;
      const rawAdv = speedAt(tr.s) * dt;
      // Block sections only govern forward motion; rollback is physics-driven.
      const adv = rawAdv > 0 ? Math.min(rawAdv, allowedAdvance(tr, trains, pathLen, carLen, blockGap)) : rawAdv;
      tr.s += adv;
      if (tr.s >= pathLen) {
        tr.s -= pathLen;
        tr.prevS -= pathLen;
      } else if (tr.s < 0) {
        tr.s += pathLen;
        tr.prevS += pathLen;
      }
      // arrive at the platform and begin unloading (unless another train is boarding)
      if (adv > 0 && tr.prevS < stopS && tr.s >= stopS && !(berths > 1 ? frontClaimed() : stationBusy())) {
        tr.s = stopS;
        tr.mode = 'dwell';
        tr.phase = 'unload';
        tr.berth = 'front';
        tr.timer = 0;
        tr.startBoard = tr.boarded;
      } else if (berths > 1 && adv > 0) {
        // front berth busy: dock at the rear berth and unload there. Block
        // sections already rest a follower exactly at this point, so the
        // crossing test lines up with where the train would stop anyway.
        const rearStop = stopS - (tr.cars.length - 1) * carLen - blockGap;
        if (tr.prevS < rearStop && tr.s >= rearStop && frontClaimed() && !rearClaimed()) {
          tr.s = rearStop;
          tr.mode = 'dwell';
          tr.phase = 'unload';
          tr.berth = 'rear';
          tr.timer = 0;
          tr.startBoard = tr.boarded;
        }
      }
    } else if (tr.phase === 'unload') {
      tr.timer += dt;
      const ut = Math.max(0.15, economy.unloadTime);
      tr.boarded = Math.round(tr.startBoard * (1 - Math.min(1, tr.timer / ut)));
      if (tr.timer >= ut) {
        tr.boarded = 0;
        tr.timer = 0;
        if (tr.berth === 'rear') tr.phase = 'waitBerth';
        else beginLoad(tr);
      }
    } else if (tr.phase === 'waitBerth') {
      // emptied at the rear berth; roll forward once the front berth clears
      if (!frontClaimed()) {
        tr.phase = 'advance';
        tr.berth = 'front'; // claim it now so a third train can dock rear behind us
        tr.timer = 0;
      }
    } else if (tr.phase === 'advance') {
      tr.prevS = tr.s;
      const speed = Math.max(2, ((tr.cars.length - 1) * carLen + blockGap) / Math.max(0.3, advanceTime));
      const step = Math.min(
        speed * dt,
        allowedAdvance(tr, trains, pathLen, carLen, blockGap),
        Math.max(0, stopS - tr.s),
      );
      tr.s += step;
      if (tr.s >= stopS - 1e-3) {
        tr.s = stopS;
        beginLoad(tr);
      }
    } else if (tr.phase === 'load') {
      tr.timer += dt;
      const lt = Math.max(0.15, economy.loadTime);
      tr.boarded = Math.round(tr.cycleBoard * Math.min(1, tr.timer / lt));
      if (tr.timer >= lt) {
        tr.boarded = tr.cycleBoard;
        tr.phase = 'ready'; // full & waiting for dispatch — no income until it launches
        tr.timer = 0;
      }
    } else if (tr.phase === 'ready') {
      tr.timer += dt;
      tr.boarded = tr.cycleBoard;
      if (autoDispatch && tr.timer >= dispatchDelay) {
        dispatchTrain(tr, { economy, state, onDeposit });
      }
    }

    placeTrain(tr);
    setOccupancy(tr, Math.round(tr.boarded));
  }
}
