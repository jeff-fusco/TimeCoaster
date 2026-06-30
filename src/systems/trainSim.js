// Train dwell/boarding state machine.
//
// Advances every train one tick through the run -> dwell(unload -> load) -> run
// cycle, draining the queue and crediting ride income. The core logic is pure
// (it only mutates the train objects, `sim`, and `state`), so it is unit-testable
// without THREE or the DOM. Rendering side effects are injected as callbacks:
//
//   placeTrain(train)        position the train's cars along the track
//   setOccupancy(train, n)   show n filled seats
//   onDeposit(train, income) ride paid out (e.g. spawn a floating coin)
//
// `economy` is the object returned by deriveEconomy() (needs unloadTime,
// loadTime, seatsCap, perRider). `stationBusy()` returns true while any train is
// already boarding, so a second train waits a lap instead of overlapping.
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
  placeTrain = () => {},
  setOccupancy = () => {},
  onDeposit = () => {},
}) {
  for (const tr of trains) {
    if (tr.mode === 'run') {
      tr.prevS = tr.s;
      tr.s += speedAt(tr.s) * dt;
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
    } else {
      tr.timer += dt;
      if (tr.phase === 'unload') {
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
      } else {
        const lt = Math.max(0.15, economy.loadTime);
        tr.boarded = Math.round(tr.cycleBoard * Math.min(1, tr.timer / lt));
        if (tr.timer >= lt) {
          tr.boarded = tr.cycleBoard;
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
        }
      }
    }

    placeTrain(tr);
    setOccupancy(tr, Math.round(tr.boarded));
  }
}
