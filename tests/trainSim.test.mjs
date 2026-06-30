import assert from 'node:assert/strict';
import { stepTrains } from '../src/systems/trainSim.js';

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

// A train runs to the platform, unloads, boards from the queue, and departs paid.
{
  const trains = [makeTrain()];
  const sim = { queue: 10 };
  const state = { money: 0, rides: 0 };
  const deposits = [];

  // run until it reaches the stop and switches to dwell
  let guard = 0;
  while (trains[0].mode === 'run' && guard++ < 50) {
    run({ trains, sim, state, onDeposit: (t, income) => deposits.push(income) });
  }
  assert.equal(trains[0].mode, 'dwell');
  assert.equal(trains[0].phase, 'unload');
  assert.ok(Math.abs(trains[0].s - STOP_S) < 1e-9);

  // advance through unload + load until it departs again
  guard = 0;
  while (state.rides === 0 && guard++ < 100) {
    run({ trains, sim, state, onDeposit: (t, income) => deposits.push(income) });
  }

  assert.equal(state.rides, 1, 'one completed ride');
  assert.equal(state.money, 16, '8 boarded * $2 per rider');
  assert.deepEqual(deposits, [16], 'deposit callback fired with income');
  assert.equal(sim.queue, 2, 'queue drained by seatsCap (8 of 10)');
  assert.equal(trains[0].mode, 'run', 'returns to running after boarding');
  assert.equal(trains[0].boarded, 8, 'departs full');
}

// A short queue only fills part of the train and earns proportionally less.
{
  const trains = [makeTrain()];
  const sim = { queue: 3 };
  const state = { money: 0, rides: 0 };
  let guard = 0;
  while (state.rides === 0 && guard++ < 200) {
    run({ trains, sim, state });
  }
  assert.equal(trains[0].cycleBoard, 3, 'boards only the 3 waiting');
  assert.equal(state.money, 6, '3 * $2');
  assert.equal(sim.queue, 0, 'whole short line boarded');
}

// While one train is boarding, a second train must not also enter the station.
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

// No income is credited when the queue is empty (empty train departs free).
{
  const trains = [makeTrain()];
  const sim = { queue: 0 };
  const state = { money: 0, rides: 0 };
  let guard = 0;
  while (trains[0].mode === 'run' && guard++ < 50) run({ trains, sim, state });
  guard = 0;
  while (trains[0].phase !== '' && guard++ < 100) run({ trains, sim, state });
  assert.equal(state.money, 0);
  assert.equal(state.rides, 0, 'empty boarding is not counted as a ride');
}

console.log('trainSim tests passed');
