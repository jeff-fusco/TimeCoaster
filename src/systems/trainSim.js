// Train dwell/boarding state machine + block-section spacing.
//
// Advances every train one tick through the cycle:
//   run -> dwell(unload -> load -> ready) -> [dispatch] -> run
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
export function dispatchTrain(tr, { economy, state, onDeposit = () => {} }) {
  if (tr.mode !== 'dwell' || tr.phase !== 'ready') return false;
  const income = Math.round(tr.cycleBoard * economy.perRider);
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
  autoDispatch = false,
  dispatchDelay = Infinity,
  placeTrain = () => {},
  setOccupancy = () => {},
  onDeposit = () => {},
}) {
  for (const tr of trains) {
    if (tr.mode === 'run') {
      tr.prevS = tr.s;
      // block sections: never advance past the safe gap behind the train ahead
      const adv = Math.min(speedAt(tr.s) * dt, allowedAdvance(tr, trains, pathLen, carLen, blockGap));
      tr.s += adv;
      if (tr.s >= pathLen) {
        tr.s -= pathLen;
        tr.prevS -= pathLen;
      }
      // arrive at the platform and begin unloading (unless another train is boarding)
      if (tr.prevS < stopS && tr.s >= stopS && !stationBusy()) {
        tr.s = stopS;
        tr.mode = 'dwell';
        tr.phase = 'unload';
        tr.timer = 0;
        tr.startBoard = tr.boarded;
      }
    } else if (tr.phase === 'unload') {
      tr.timer += dt;
      const ut = Math.max(0.15, economy.unloadTime);
      tr.boarded = Math.round(tr.startBoard * (1 - Math.min(1, tr.timer / ut)));
      if (tr.timer >= ut) {
        tr.boarded = 0;
        tr.phase = 'load';
        tr.timer = 0;
        // reserve guests from the line immediately so two trains can't grab the same people
        tr.cycleBoard = Math.min(economy.seatsCap, Math.floor(sim.queue));
        sim.queue = Math.max(0, sim.queue - tr.cycleBoard);
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
