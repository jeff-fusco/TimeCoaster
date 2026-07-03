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

// Photographers add flat photo sales when a non-empty train launches.
{
  const state = { money: 0, rides: 0 };
  const economy = { ...ECONOMY, photoPerRide: 12 };
  const full = makeTrain({ mode: 'dwell', phase: 'ready', cycleBoard: 4, boarded: 4 });
  dispatchTrain(full, { economy, state });
  assert.equal(state.money, 4 * ECONOMY.perRider + 12, 'ride income + photo sales');

  const empty = makeTrain({ mode: 'dwell', phase: 'ready', cycleBoard: 0, boarded: 0 });
  dispatchTrain(empty, { economy, state });
  assert.equal(state.money, 4 * ECONOMY.perRider + 12, 'no photos sold on an empty train');
}

// Vendor carts (hats/balloons) add per-rider merch income at dispatch.
{
  const state = { money: 0, rides: 0 };
  const economy = { ...ECONOMY, vendorPerRider: 2.5 };
  const full = makeTrain({ mode: 'dwell', phase: 'ready', cycleBoard: 4, boarded: 4 });
  dispatchTrain(full, { economy, state });
  assert.equal(state.money, 4 * ECONOMY.perRider + Math.round(4 * 2.5), 'ride income + vendor sales');
}

// Merch Exit Shop research skims a share of each trainload's ride income.
{
  const state = { money: 0, rides: 0 };
  const economy = { ...ECONOMY, merchRate: 0.06 };
  const full = makeTrain({ mode: 'dwell', phase: 'ready', cycleBoard: 100, boarded: 100 });
  dispatchTrain(full, { economy, state });
  const ride = Math.round(100 * ECONOMY.perRider);
  assert.equal(state.money, ride + Math.round(100 * ECONOMY.perRider * 0.06), 'ride income + merch share');
}

// Dual-Berth Station: a second train docks at the rear berth to unload while
// the front berth loads, then advances forward and loads once the front clears.
{
  const carLen = 1.7;
  const blockGap = 2.4;
  const front = makeTrain({ s: STOP_S, mode: 'dwell', phase: 'load', berth: 'front', cycleBoard: 4 });
  const rear = makeTrain({ s: 1.5, prevS: 1.5, boarded: 6 });
  const trains = [front, rear];
  const sim = { queue: 10 };
  const state = { money: 0, rides: 0 };
  const rearStop = STOP_S - blockGap; // single car: trainLen 0

  // rear train crosses the rear-berth point and docks to unload
  let guard = 0;
  while (rear.mode !== 'dwell' && guard++ < 50) run({ trains, sim, state, berths: 2, carLen, blockGap });
  assert.equal(rear.mode, 'dwell', 'second train docks while the front berth is busy');
  assert.equal(rear.berth, 'rear');
  assert.equal(rear.phase, 'unload');
  assert.ok(Math.abs(rear.s - rearStop) < 1e-6, 'docks exactly at the rear berth point');

  // unload completes at the rear berth while the front train is still boarding
  guard = 0;
  while (rear.phase === 'unload' && guard++ < 50) run({ trains, sim, state, berths: 2, carLen, blockGap });
  assert.equal(rear.boarded, 0, 'riders got off at the rear berth');
  assert.ok(rear.phase === 'waitBerth' || rear.phase === 'advance', 'waits for the front berth');

  // dispatch the front train; the rear train advances and starts loading
  guard = 0;
  while (front.phase !== 'ready' && guard++ < 100) run({ trains, sim, state, berths: 2, carLen, blockGap });
  dispatchTrain(front, { economy: ECONOMY, state });
  guard = 0;
  while (rear.phase !== 'load' && guard++ < 300) run({ trains, sim, state, berths: 2, carLen, blockGap });
  assert.equal(rear.phase, 'load', 'advanced to the front berth and began loading');
  assert.equal(rear.berth, 'front');
  assert.ok(Math.abs(rear.s - STOP_S) < 1e-6, 'loads at the front berth point');
  assert.equal(rear.cycleBoard, 8, 'reserved guests from the queue on arrival at the front berth');
}

// Dual-Berth: an empty station still lets a train dock straight at the front.
{
  const trains = [makeTrain({ boarded: 3 })];
  const sim = { queue: 5 };
  const state = { money: 0, rides: 0 };
  let guard = 0;
  while (trains[0].mode !== 'dwell' && guard++ < 50) run({ trains, sim, state, berths: 2 });
  assert.equal(trains[0].berth, 'front', 'empty station: dock directly at the front berth');
  assert.equal(trains[0].phase, 'unload');
  assert.ok(Math.abs(trains[0].s - STOP_S) < 1e-6);
}

// Negative path speed rolls a train backward and wraps around the loop cleanly.
{
  const trains = [makeTrain({ s: 0.2, prevS: 0.2 })];
  const sim = { queue: 0 };
  const state = { money: 0, rides: 0 };

  run({ trains, sim, state, speedAt: () => -10 });
  assert.equal(trains[0].s, 99.2);
  assert.equal(trains[0].prevS, 100.2);
  assert.equal(trains[0].mode, 'run');
}

console.log('trainSim tests passed');
