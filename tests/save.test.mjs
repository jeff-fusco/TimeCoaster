import assert from 'node:assert/strict';
import {
  CURRENT_SAVE_KEY,
  applySaveData,
  createSaveData,
  readSave,
  writeSave,
} from '../src/systems/save.js';

class MemoryStorage {
  constructor(initial = {}) {
    this.items = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }
}

function makeGameState() {
  return {
    state: { money: 1234.5, rides: 9 },
    sim: { queue: 7.25 },
    upgrades: {
      car: { level: 1 },
      seats: { level: 2 },
      train: { level: 0, max: 2 },
    },
    research: {
      fundingPct: 25,
      activePath: 'track',
      progress: { track: 175 },
      done: { loop: true },
    },
    maintenance: {
      installed: { car: 1, train: 0 },
      queue: [{ type: 'car', duration: 8 }],
      current: { type: 'train', duration: 12, progress: 5 },
    },
    property: {
      chunkSize: 24,
      baseCost: 900,
      growth: 1.72,
      distanceScale: 0.32,
      sizeGrowth: 0.35,
      farGrowth: 1.28,
      owned: ['0,0', '1,0'],
    },
    ctrlPts: [
      { x: 1, y: 2, z: 3, station: true, seg: 'station' },
      { x: 4, y: 5, z: 6, station: true },
      { x: 7, y: 8, z: 9, seg: 'lift' },
    ],
    paidLength: 55.5,
    frustum: 42,
    azimuth: 1.25,
  };
}

{
  const game = makeGameState();
  const data = createSaveData(game);
  assert.equal(data.money, 1234.5);
  assert.equal(data.queue, 7.25);
  assert.deepEqual(data.upgrades, { car: 1, seats: 2, train: 0 });
  assert.equal(data.research.fundingPct, 25);
  assert.equal(data.research.activePath, 'track');
  assert.deepEqual(data.research.progress, { track: 175 });
  assert.deepEqual(data.research.done, { loop: true });
  assert.deepEqual(data.maintenance.installed, { car: 1, train: 0 });
  assert.deepEqual(data.maintenance.queue, [{ type: 'car', duration: 8 }]);
  assert.deepEqual(data.maintenance.current, { type: 'train', duration: 12, progress: 5 });
  assert.deepEqual(data.property.owned, ['0,0', '1,0']);
  assert.equal(data.property.sizeGrowth, 0.35);
  assert.equal(data.property.farGrowth, 1.28);

  game.ctrlPts[2].seg = 'plain';
  game.research.done.loop = false;
  assert.equal(data.ctrlPts[2].seg, 'lift');
  assert.equal(data.research.done.loop, true);
}

{
  const target = {
    state: { money: 0, rides: 0 },
    sim: { queue: 0 },
    upgrades: {},
    research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  applySaveData({ research: { budget: 90, points: 5, done: {} } }, target);
  assert.equal(target.research.fundingPct, 9, 'legacy fixed $90/min budget migrates to a percent');
  assert.equal(target.research.progress.track, 50, 'legacy RP migrates into path progress');
}

{
  const storage = new MemoryStorage();
  assert.equal(writeSave(storage, makeGameState()), true);
  const saved = JSON.parse(storage.getItem(CURRENT_SAVE_KEY));
  assert.equal(saved.money, 1234.5);
  assert.equal(saved.ctrlPts.length, 3);
}

{
  const legacy = { money: 500, upgrades: { capacity: 3 }, ctrlPts: makeGameState().ctrlPts };
  const storage = new MemoryStorage({ tc3d_v4: JSON.stringify(legacy) });
  assert.deepEqual(readSave(storage), legacy);
}

{
  const target = {
    state: { money: 0, rides: 0 },
    sim: { queue: 0 },
    upgrades: {
      seats: { level: 0 },
      speed: { level: 0 },
    },
    research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData({
    money: 777,
    rides: 4,
    queue: 12,
    upgrades: { capacity: 5, speed: 2, unknown: 99 },
    research: { fundingPct: 30, activePath: 'operations', points: 44, done: { train3: true } },
    maintenance: {
      installed: { car: 2, train: 1 },
      queue: [{ type: 'car', duration: 8 }, { type: 'bad', duration: 2 }],
      current: { type: 'train', duration: 12, progress: 3 },
    },
    property: {
      chunkSize: 24,
      baseCost: 900,
      growth: 1.72,
      distanceScale: 0.32,
      sizeGrowth: 0.4,
      farGrowth: 1.35,
      owned: ['0,0', '0,1'],
    },
    ctrlPts: [
      { x: 1, y: 1, z: 1, seg: 'plain' },
      { x: 2, y: 2, z: 2 },
      { x: 3, y: 3, z: 3 },
    ],
    paidLength: 12.5,
    frustum: 80,
    azimuth: 0.5,
  }, target);

  assert.equal(target.state.money, 777);
  assert.equal(target.state.rides, 4);
  assert.equal(target.sim.queue, 12);
  assert.equal(target.upgrades.seats.level, 5);
  assert.equal(target.upgrades.speed.level, 2);
  assert.equal(target.research.fundingPct, 30);
  assert.equal(target.research.activePath, 'operations');
  assert.equal(target.research.progress.operations, 440);
  assert.deepEqual(target.research.done, { train3: true });
  assert.equal(restored.ctrlPts[0].seg, 'station');
  assert.equal(restored.ctrlPts[1].seg, 'plain');
  assert.equal(restored.paidLength, 12.5);
  assert.equal(restored.frustum, 80);
  assert.equal(restored.azimuth, 0.5);
  assert.deepEqual(restored.maintenance, {
    installed: { car: 2, train: 1 },
    queue: [{ type: 'car', duration: 8 }],
    current: { type: 'train', duration: 12, progress: 3 },
  });
  assert.deepEqual(restored.property.owned, ['0,0', '0,1']);
  assert.equal(restored.property.sizeGrowth, 0.4);
  assert.equal(restored.property.farGrowth, 1.35);
}

{
  const storage = new MemoryStorage({ tc3d_v5: '{broken json' });
  assert.equal(readSave(storage), null);
  const target = {
    state: { money: 1, rides: 2 },
    sim: { queue: 3 },
    upgrades: {},
    research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  assert.deepEqual(applySaveData(null, target), {});
  assert.deepEqual(target.state, { money: 1, rides: 2 });
}

{
  const target = {
    state: { money: 1, rides: 2 },
    sim: { queue: 3 },
    upgrades: { speed: { level: 0 } },
    research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData({
    money: Number.NaN,
    rides: Infinity,
    queue: -Infinity,
    upgrades: { speed: Number.NaN },
    research: { fundingPct: Infinity, points: Number.NaN, done: { loop: true } },
    ctrlPts: [
      { x: 1, y: 1, z: 1 },
      { x: Number.NaN, y: 2, z: 2 },
      { x: 3, y: 3, z: 3 },
    ],
    paidLength: -1,
    frustum: Number.NaN,
    azimuth: Infinity,
  }, target);

  assert.deepEqual(target.state, { money: 1, rides: 2 });
  assert.equal(target.sim.queue, 3);
  assert.equal(target.upgrades.speed.level, 0);
  assert.equal(target.research.fundingPct, 0);
  assert.deepEqual(target.research.progress, {});
  assert.deepEqual(target.research.done, { loop: true });
  assert.deepEqual(restored, {});
}

console.log('save tests passed');
