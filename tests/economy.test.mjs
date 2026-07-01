import assert from 'node:assert/strict';
import {
  applyResearchEffects,
  deriveEconomy,
  featureUnlocked,
  formatMoney,
  gradeFor,
  upgradeCost,
} from '../src/systems/economy.js';

function makeUpgrades() {
  return {
    car: { base: 60, growth: 1.55, level: 0 },
    seats: { base: 95, growth: 1.6, level: 0, max: 8 },
    speed: { base: 80, growth: 1.5, level: 0 },
    train: { base: 500, growth: 3.2, level: 0, max: 2 },
    queue: { base: 110, growth: 1.55, level: 0, max: 8 },
    snacks: { base: 200, growth: 2, level: 0, max: 6 },
    express: { base: 350, growth: 1.8, level: 0 },
    ticket: { base: 50, growth: 1.45, level: 0 },
    market: { base: 160, growth: 1.75, level: 0, max: 6 },
    hype: { base: 120, growth: 1.7, level: 0 },
  };
}

const station = {
  arrivalBase: 0.6,
  baseUnload: 1.8,
  baseLoad: 2.2,
  snackPerGuest: 3,
  snackCap: 30,
  queueBase: 10,
  queueStep: 10,
};

{
  assert.equal(featureUnlocked('plain'), true);
  assert.equal(featureUnlocked('lift'), true);
  assert.equal(featureUnlocked('brake'), false);
  assert.equal(featureUnlocked('brake', { brakes: true }), true);
  assert.equal(featureUnlocked('loop', { loop: true }), true);
  assert.equal(featureUnlocked('corkscrew', { cork: true }), true);
}

{
  const upgrades = makeUpgrades();
  applyResearchEffects(upgrades, {});
  assert.equal(upgrades.train.max, 2);
  applyResearchEffects(upgrades, { train3: true });
  assert.equal(upgrades.train.max, 3);
}

{
  assert.equal(upgradeCost({ base: 80, growth: 1.5, level: 0 }), 80);
  assert.equal(upgradeCost({ base: 80, growth: 1.5, level: 2 }), 180);
  assert.equal(formatMoney(9999), '9,999');
  assert.equal(formatMoney(12500), '12.5k');
  assert.equal(formatMoney(1250000), '1.25M');
}

{
  const economy = deriveEconomy({
    upgrades: makeUpgrades(),
    pathStats: null,
    simQueue: 8,
    researchDone: {},
    station,
    fallbackMaxSpeed: 4,
  });

  assert.equal(economy.seatsCap, 4);
  assert.equal(economy.trains, 1);
  assert.equal(economy.queueCap, 10);
  assert.equal(economy.perRideFull, 8);
  assert.equal(economy.ridePerMin, 34);
  assert.equal(economy.ratePerMin, 34);
}

{
  const upgrades = makeUpgrades();
  upgrades.car.level = 1;
  upgrades.seats.level = 2;
  upgrades.queue.level = 1;
  upgrades.snacks.level = 1;
  upgrades.ticket.level = 2;
  const economy = deriveEconomy({
    upgrades,
    pathStats: { excitement: 55, lapTime: 20, maxSpeed: 8, length: 100 },
    simQueue: 12,
    researchDone: { photo: true, queue2: true },
    station,
    fallbackMaxSpeed: 4,
  });

  assert.equal(economy.cars, 2);
  assert.equal(economy.seatsPerCar, 8);
  assert.equal(economy.seatsCap, 16);
  assert.equal(economy.queueCap, 50);
  assert.equal(economy.snackPerMin, 36);
  assert.ok(economy.perRideFull > 140);
}

// Staff powers each drive a different lever of the pipeline.
{
  const pathStats = { excitement: 40, lapTime: 15, maxSpeed: 8, length: 80 };
  const withSnacks = () => { const u = makeUpgrades(); u.snacks.level = 1; return u; };
  const derive = (staffPowers = {}) =>
    deriveEconomy({ upgrades: withSnacks(), pathStats, simQueue: 20, researchDone: {}, staffPowers, station, fallbackMaxSpeed: 4 });

  const baseline = derive();
  assert.equal(baseline.autoDispatch, false, 'no operators -> manual dispatch');

  const staffed = derive({ operators: 2, entertainers: 3, mechanics: 4, janitors: 5 });
  assert.equal(staffed.autoDispatch, true, 'Ride Operators enable auto-launch');
  assert.ok(staffed.dwellTime < baseline.dwellTime, 'operators speed up boarding');
  assert.ok(staffed.arrivalRate > baseline.arrivalRate, 'entertainers raise arrivals');
  assert.ok(staffed.perRider > baseline.perRider, 'mechanics raise ride income');
  assert.ok(staffed.snackPerMin > baseline.snackPerMin, 'janitors raise snack income');

  // one operator (power 1) is enough to enable auto-dispatch
  assert.equal(derive({ operators: 1 }).autoDispatch, true);
}

{
  assert.equal(gradeFor(10), 'Gentle');
  assert.equal(gradeFor(22), 'Fun');
  assert.equal(gradeFor(42), 'Exciting');
  assert.equal(gradeFor(65), 'Thrilling');
  assert.equal(gradeFor(90), 'Legendary');
}

console.log('economy tests passed');
