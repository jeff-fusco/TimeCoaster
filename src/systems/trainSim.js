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
// it) or automatically once trained operators are running launches. Ride income is
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
// Photographers add a flat photo-sales bonus per dispatched (non-empty) train,
// and the Exit Shop skims a merch share. Hats/balloons are NO LONGER credited
// here — guests buy those at the point of sale (see the Concessions stream).
export function dispatchTrain(tr, { economy, state, onDeposit = () => {} }) {
  if (tr.mode !== 'dwell' || tr.phase !== 'ready') return false;
  const photos = tr.cycleBoard > 0 ? Math.round(economy.photoPerRide || 0) : 0;
  const merch = Math.round(tr.cycleBoard * economy.perRider * (economy.merchRate || 0));
  const income = Math.round(tr.cycleBoard * economy.perRider) + photos + merch;
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
  stalled = false,
  stallS = -1,
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

  // ── hard stall: the track has a crest the train can't clear. One running
  //    train demonstrates the failure — climbs to the stall point, runs out of
  //    steam, slides back to the station — and every train ends parked in mode
  //    'stalled' with nobody aboard. No boarding, no dispatch, no ride income
  //    until the caller passes stalled=false (the track validates again).
  const inStall = tr => tr.mode === 'stalled' || tr.mode === 'stall-climb' || tr.mode === 'stall-slide';
  if (stalled) {
    // choose one demonstrator: a running train on the approach (between the
    // platform and the crest) closest to the stall — it's the one about to hit
    // the wall. If none is on the approach, no climb theatre; everyone freezes.
    let climber = null;
    if (stallS > stopS + 2) {
      for (const tr of trains) {
        if (tr.mode === 'run' && tr.s >= stopS && tr.s <= stallS && (!climber || tr.s > climber.s)) climber = tr;
      }
    }
    for (const tr of trains) {
      if (inStall(tr)) continue;
      tr.boarded = 0;
      tr.cycleBoard = 0;
      tr.startBoard = 0;
      tr.timer = 0;
      if (tr === climber) {
        tr.mode = 'stall-climb';   // this one shows why the ride is broken
      } else {
        // everyone else stops where they are — trains rest in their block
        // sections when the ride goes down, exactly like the real thing
        tr.mode = 'stalled';
        tr.phase = null;
        tr.berth = null;
      }
    }
  } else {
    for (const tr of trains) {
      if (!inStall(tr)) continue;
      // track fixed: wake the fleet from wherever it parked
      tr.mode = 'run';
      tr.phase = null;
      tr.slideV = 0;
      tr.prevS = tr.s;
    }
  }

  for (const tr of trains) {
    if (tr.mode === 'stall-climb') {
      // ease toward the crest and die there — speed bleeds to a stop
      tr.prevS = tr.s;
      const remaining = Math.max(0, stallS - tr.s);
      const v = Math.max(0.6, Math.min(speedAt(tr.s), remaining * 1.1));
      tr.s = Math.min(stallS - 0.05, tr.s + v * dt);
      if (tr.s >= stallS - 0.1) {
        tr.mode = 'stall-slide';
        tr.slideV = 0;
      }
      placeTrain(tr);
      setOccupancy(tr, 0);
      continue;
    }
    if (tr.mode === 'stall-slide') {
      // gravity rolls the demonstrator back down to the empty platform
      tr.prevS = tr.s;
      tr.slideV = Math.min(9, (tr.slideV || 0) + 6 * dt);
      tr.s -= tr.slideV * dt;
      if (tr.s <= stopS) {
        tr.s = stopS;
        tr.mode = 'stalled';
        tr.phase = null;
      }
      placeTrain(tr);
      setOccupancy(tr, 0);
      continue;
    }
    if (tr.mode === 'stalled') {
      placeTrain(tr);
      setOccupancy(tr, 0);
      continue;
    }
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
