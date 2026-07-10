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
    marketing: {
      fundingPct: 6,
      channels: {
        streetTeam: { weight: 2, demand: 12 },
        broadcast: { weight: 8, demand: 123.5 },
        spotlight: { weight: 5, demand: 0 },
        family: { weight: 5, demand: 0 },
        heritage: { weight: 5, demand: 0 },
      },
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
  const data = createSaveData({ ...game, savedAt: 1700000000000, lastRate: 4200, lastActiveRate: 3800, lastLegacyRate: 400 });
  assert.equal(data.version, 6, 'save carries the v6 version marker');
  assert.equal(data.savedAt, 1700000000000, 'offline timestamp persisted');
  assert.equal(data.lastRate, 4200, 'rate-at-save persisted');
  assert.equal(data.lastActiveRate, 3800, 'active rate persisted separately');
  assert.equal(data.lastLegacyRate, 400, 'legacy monument rate persisted separately');
  assert.ok(data.legacy, 'v6 nests a legacy blob');
  assert.equal(data.legacy.generation, 1);
  const a = data.active;
  assert.equal(a.money, 1234.5);
  assert.equal(a.queue, 7.25);
  assert.deepEqual(a.upgrades, { car: 1, seats: 2, train: 0 });
  assert.equal(a.research.fundingPct, 25);
  assert.equal(a.research.activePath, 'track');
  assert.deepEqual(a.research.progress, { track: 175 });
  assert.deepEqual(a.research.done, { loop: true });
  assert.equal(a.marketing.fundingPct, 6);
  assert.deepEqual(a.marketing.channels.broadcast, { weight: 8, demand: 123.5 });
  assert.deepEqual(a.marketing.channels.streetTeam, { weight: 2, demand: 12 });
  assert.deepEqual(a.maintenance.installed, { car: 1, train: 0 });
  assert.deepEqual(a.maintenance.queue, [{ type: 'car', duration: 8 }]);
  assert.deepEqual(a.maintenance.current, { type: 'train', duration: 12, progress: 5 });
  assert.deepEqual(a.property.owned, ['0,0', '1,0']);
  assert.equal(a.property.sizeGrowth, 0.35);
  assert.equal(a.property.farGrowth, 1.28);

  game.ctrlPts[2].seg = 'plain';
  game.research.done.loop = false;
  assert.equal(a.ctrlPts[2].seg, 'lift');
  assert.equal(a.research.done.loop, true);
}

// v6 legacy round trip: monuments, fame and perks persist
{
  const storage = new MemoryStorage();
  const game = {
    ...makeGameState(),
    savedAt: 1700000000001,
    lastRate: 900,
    lastActiveRate: 800,
    lastLegacyRate: 100,
    legacy: {
      fame: 42, generation: 3, perks: { nestEgg: 2 },
      monuments: [{
        name: 'Twister', generation: 1, biome: 'meadow', retiredAt: 123, themeBonus: 12,
        stats: { excitement: 88, intensity: 40, nausea: 20, length: 300, maxSpeed: 20 },
        ctrlPts: [{ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 2 }],
        decorations: [{ type: 'fountain', x: 1, z: 1 }],
      }],
    },
  };
  writeSave(storage, game);
  const target = {
    state: { money: 0, rides: 0 }, sim: { queue: 0 },
    upgrades: {}, research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData(readSave(storage), target);
  assert.equal(restored.legacy.fame, 42);
  assert.equal(restored.savedAt, 1700000000001);
  assert.equal(restored.lastRate, 900);
  assert.equal(restored.lastActiveRate, 800);
  assert.equal(restored.lastLegacyRate, 100);
  assert.equal(restored.marketing.fundingPct, 6);
  assert.equal(restored.marketing.channels.broadcast.demand, 123.5);
  assert.equal(restored.marketing.channels.streetTeam.weight, 2, 'channel weights survive the round trip');
  assert.equal(restored.legacy.generation, 3);
  assert.equal(restored.legacy.perks.nestEgg, 2);
  assert.equal(restored.legacy.monuments.length, 1);
  assert.equal(restored.legacy.monuments[0].name, 'Twister');
  assert.equal(restored.legacy.monuments[0].stats.excitement, 88);
}

// a flat v5 save migrates: its data becomes the active coaster, legacy starts fresh
{
  const v5 = { version: 5, money: 500, rides: 3, queue: 6, upgrades: { car: 2 },
    ctrlPts: makeGameState().ctrlPts, research: { done: {} } };
  const storage = new MemoryStorage({ tc3d_v5: JSON.stringify(v5) });
  const target = {
    state: { money: 0, rides: 0 }, sim: { queue: 0 },
    upgrades: { car: { level: 0 } }, research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData(readSave(storage), target);
  assert.equal(target.state.money, 500, 'v5 active data applied');
  assert.equal(target.upgrades.car.level, 2);
  assert.equal(restored.legacy.generation, 1, 'fresh legacy for a migrated save');
  assert.equal(restored.legacy.monuments.length, 0);
}

// old flat marketing upgrade becomes starter Broadcast presence in the HQ model
{
  const v5 = { version: 5, money: 500, upgrades: { market: 3 },
    ctrlPts: makeGameState().ctrlPts, research: { done: {} } };
  const storage = new MemoryStorage({ tc3d_v5: JSON.stringify(v5) });
  const target = {
    state: { money: 0, rides: 0 }, sim: { queue: 0 },
    upgrades: {}, research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData(readSave(storage), target);
  assert.equal(restored.marketing.fundingPct, 0);
  assert.equal(restored.marketing.channels.broadcast.demand, 24);
}

// staff v2: the individual roster round-trips; old counter saves migrate to people
{
  const storage = new MemoryStorage();
  const game = {
    ...makeGameState(),
    roster: {
      operators: [{ seed: 111, level: 1 }, { seed: 222, level: 0 }],
      scientists: [{ seed: 333, level: 1 }],
    },
  };
  writeSave(storage, game);
  const saved = JSON.parse(storage.getItem(CURRENT_SAVE_KEY));
  assert.equal(saved.active.roster.operators.length, 2, 'roster serialized');
  assert.deepEqual(saved.active.roster.operators[0], { seed: 111, level: 1 });

  const target = {
    state: { money: 0, rides: 0 }, sim: { queue: 0 },
    upgrades: {}, research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData(readSave(storage), target);
  assert.equal(restored.roster.operators.length, 2, 'roster restored as individuals');
  assert.equal(restored.roster.operators[0].seed, 111);
  assert.equal(restored.roster.scientists.length, 1);
  assert.equal(restored.roster.entertainers.length, 0, 'untouched roles are empty crews');
}

// an old counter save (data.staff) migrates into a roster of that headcount
{
  const target = {
    state: { money: 0, rides: 0 }, sim: { queue: 0 },
    upgrades: {}, research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData({
    staff: { mechanics: { hired: 3, trained: 2 }, scientists: { hired: 1, trained: 4 } },
    research: { done: {} },
  }, target);
  assert.equal(restored.roster.mechanics.length, 3, 'counts became three people');
  assert.equal(restored.roster.scientists.length, 1);
  for (const m of restored.roster.mechanics) assert.ok(Number.isFinite(m.seed) && m.level >= 0);
}

// v1 marketing saves (single scalar demand) migrate into the Broadcast channel
{
  const target = {
    state: { money: 0, rides: 0 }, sim: { queue: 0 },
    upgrades: {}, research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  };
  const restored = applySaveData({ marketing: { fundingPct: 9, demand: 60 }, research: { done: {} } }, target);
  assert.equal(restored.marketing.fundingPct, 9);
  assert.equal(restored.marketing.channels.broadcast.demand, 60);
  assert.equal(restored.marketing.channels.streetTeam.demand, 0);
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
  assert.equal(saved.active.money, 1234.5);
  assert.equal(saved.active.marketing.fundingPct, 6);
  assert.equal(saved.active.marketing.channels.broadcast.demand, 123.5);
  assert.equal(saved.active.ctrlPts.length, 3);
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
  // malformed active fields are all ignored; a fresh legacy is still returned
  assert.equal(restored.ctrlPts, undefined);
  assert.equal(restored.paidLength, undefined);
  assert.equal(restored.legacy.generation, 1);
  assert.equal(restored.legacy.monuments.length, 0);
}

// decor construction kit: stacking height and rotation survive the round trip
{
  const storage = new MemoryStorage();
  const saved = {
    ...makeGameState(),
    decorations: [
      { type: 'pillar', x: 1, z: 2, y: 2.6, rot: 0.785 },
      { type: 'flowers', x: -3, z: 4 },   // legacy entry without y/rot
    ],
  };
  writeSave(storage, saved);
  const restored = applySaveData(readSave(storage), {
    state: { money: 0, rides: 0 },
    sim: { queue: 0 },
    upgrades: { car: { level: 0 }, seats: { level: 0 }, train: { level: 0 } },
    research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
  });
  assert.deepEqual(restored.decorations[0], { type: 'pillar', x: 1, z: 2, y: 2.6, rot: 0.785 });
  assert.deepEqual(restored.decorations[1], { type: 'flowers', x: -3, z: 4 });
}

console.log('save tests passed');
