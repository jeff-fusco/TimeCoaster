import assert from 'node:assert/strict';
import { dispatchTrain, stepTrains } from '../src/systems/trainSim.js';

const ECONOMY = { unloadTime: 1, loadTime: 1, seatsCap: 8, perRider: 2 };
const PATH_LEN = 100;
const STOP_S = 5;
const DT = 0.1;

function makeTrain(overrides = {}) {
  return {
    s: 0,
    prevS: 0,
    L: PATH_LEN,
    cars: [{}],
    mode: 'run',
    phase: '',
    timer: 0,
    boarded: 0,
    startBoard: 0,
    cycleBoard: 0,
    ...overrides,
  };
}

function run(args) {
  stepTrains({
    pathLen: PATH_LEN,
    stopS: STOP_S,
    economy: ECONOMY,
    dt: DT,
    speedAt: () => 10, // 1 unit of travel per tick
    ...args,
  });
}

// Boarding fills the train but does NOT pay out — income comes at dispatch.
{
  const trains = [makeTrain()];
  const sim = { queue: 10 };
  const state = { money: 0, rides: 0 };

  let guard = 0;
  while (trains[0].phase !== 'ready' && guard++ < 200) run({ trains, sim, state });

  assert.equal(trains[0].phase, 'ready', 'train waits at the platform when full');
  assert.equal(trains[0].boarded, 8, 'departs full once dispatched');
  assert.equal(state.money, 0, 'no income credited just for boarding');
  assert.equal(state.rides, 0);
  assert.equal(sim.queue, 2, 'queue drained by seatsCap (8 of 10)');

  // manual dispatch pays out and sends it running again
  const deposits = [];
  const launched = dispatchTrain(trains[0], { economy: ECONOMY, state, onDeposit: (t, i) => deposits.push(i) });
  assert.equal(launched, true);
  assert.equal(state.money, 16, '8 boarded * $2 per rider');
  assert.equal(state.rides, 1);
  assert.deepEqual(deposits, [16]);
  assert.equal(trains[0].mode, 'run');
}

// Auto Dispatch launches a ready train after the delay, no click needed.
{
  const trains = [makeTrain()];
  const sim = { queue: 10 };
  const state = { money: 0, rides: 0 };
  const stepArgs = { trains, sim, state, autoDispatch: true, dispatchDelay: 0.5 };

  let guard = 0;
  while (state.rides === 0 && guard++ < 400) run(stepArgs);

  assert.equal(state.rides, 1, 'auto-dispatch completed a ride without manual input');
  assert.ok(state.money > 0);
  assert.equal(trains[0].mode, 'run');
}

// Block sections: a following train stops short of the train ahead (no overlap).
{
  const carLen = 1.7;
  const blockGap = 2.4;
  const front = makeTrain({ s: 10, mode: 'dwell', phase: 'ready', cycleBoard: 4, boarded: 4, cars: [{}, {}, {}] });
  const rear = makeTrain({ s: 0, cars: [{}, {}, {}] });
  const trains = [front, rear];
  const sim = { queue: 0 };
  const state = { money: 0, rides: 0 };

  for (let i = 0; i < 80; i++) {
    run({ trains, sim, state, stopS: 80, carLen, blockGap });
  }

  const frontRear = front.s - (front.cars.length - 1) * carLen; // 10 - 3.4 = 6.6
  assert.equal(front.s, 10, 'a stationary train ahead does not move');
  assert.ok(rear.s <= frontRear - blockGap + 1e-6, 'follower keeps a full block gap');
  assert.ok(Math.abs(rear.s - (frontRear - blockGap)) < 1e-6, 'follower settles right at the gap');
}

// Two trains cannot both occupy the station at once.
{
  const boarding = makeTrain({ mode: 'dwell', phase: 'load', timer: 0, cycleBoard: 4, boarded: 4 });
  const approaching = makeTrain({ s: STOP_S - 0.5, prevS: STOP_S - 0.5 });
  const trains = [boarding, approaching];
  const sim = { queue: 10 };
  const state = { money: 0, rides: 0 };
  const stationBusy = () => trains.some(t => t.mode === 'dwell');

  run({ trains, sim, state, stationBusy });
  assert.equal(approaching.mode, 'run', 'second train keeps running past a busy platform');
}

console.log('trainSim tests passed');
