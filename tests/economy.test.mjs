import assert from 'node:assert/strict';
import {
  applyResearchEffects,
  deriveEconomy,
  featureUnlocked,
  formatMoney,
  gradeFor,
  researchEfficiency,
  upgradeCost,
} from '../src/systems/economy.js';

function makeUpgrades() {
  return {
    car: { base: 60, growth: 1.78, level: 0, max: 16 },
    seats: { base: 95, growth: 1.82, level: 0, max: 24 },
    speed: { base: 80, growth: 1.76, level: 0, max: 30 },
    train: { base: 500, growth: 4.15, level: 0, max: 4 },
    queue: { base: 110, growth: 1.82, level: 0, max: 24 },
    snacks: { base: 200, growth: 2.28, level: 0, max: 18 },
    express: { base: 350, growth: 2.05, level: 0, max: 18 },
    ticket: { base: 50, growth: 1.68, level: 0, max: 30 },
    market: { base: 160, growth: 2.05, level: 0, max: 18 },
    hype: { base: 120, growth: 1.95, level: 0, max: 24 },
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
  baseDispatch: 3.0,
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
  assert.equal(upgrades.train.max, 4);
  applyResearchEffects(upgrades, { train3: true });
  assert.equal(upgrades.train.max, 8);
}

{
  assert.equal(upgradeCost({ base: 80, growth: 1.5, level: 0 }), 80);
  assert.equal(upgradeCost({ base: 80, growth: 1.5, level: 2 }), 180);
  assert.equal(formatMoney(9999), '9,999');
  assert.equal(formatMoney(12500), '12.5k');
  assert.equal(formatMoney(1250000), '1.25M');
}

{
  assert.equal(researchEfficiency(0), 1);
  assert.ok(researchEfficiency(50) < researchEfficiency(10), 'higher funding % has lower RP per dollar');
  assert.ok(1000 * 0.05 * researchEfficiency(5) > 100 * 0.5 * researchEfficiency(50), 'larger actual spend still wins');
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
  const derive = (staff = {}) =>
    deriveEconomy({ upgrades: withSnacks(), pathStats, simQueue: 20, researchDone: {}, staff, station, fallbackMaxSpeed: 4 });

  const baseline = derive();
  assert.equal(baseline.autoDispatch, false, 'no operators -> manual dispatch');
  assert.equal(baseline.photoPerRide, 0, 'no photographers -> no photo sales');

  // hiring and training drive DIFFERENT levers per role
  const hiredOps = derive({ operators: { hired: 2, trained: 0 } });
  assert.equal(hiredOps.autoDispatch, true, 'first operator hire enables auto-launch');
  assert.ok(hiredOps.dwellTime < baseline.dwellTime, 'operator hires speed up boarding');
  assert.equal(hiredOps.dispatchDelay, station.baseDispatch, 'untrained crews launch at base delay');

  const trainedOps = derive({ operators: { hired: 2, trained: 4 } });
  assert.equal(trainedOps.dwellTime, hiredOps.dwellTime, 'training does not change boarding');
  assert.ok(trainedOps.dispatchDelay < hiredOps.dispatchDelay, 'training shortens the launch delay');

  const hiredEnt = derive({ entertainers: { hired: 3, trained: 0 } });
  assert.ok(hiredEnt.arrivalRate > baseline.arrivalRate, 'entertainer hires raise arrivals');
  assert.equal(hiredEnt.queueCap, baseline.queueCap, 'hires alone do not extend the queue');
  const trainedEnt = derive({ entertainers: { hired: 3, trained: 2 } });
  assert.equal(trainedEnt.queueCap, baseline.queueCap + 10, 'training adds queue capacity');

  const mech = derive({ mechanics: { hired: 3, trained: 0 } });
  assert.equal(mech.perRider, baseline.perRider, 'mechanic hires do not change income (they speed installs)');
  const trainedMech = derive({ mechanics: { hired: 3, trained: 3 } });
  assert.ok(trainedMech.perRider > baseline.perRider, 'mechanic training raises ride income');

  const jan = derive({ janitors: { hired: 4, trained: 0 } });
  assert.ok(jan.snackPerMin > baseline.snackPerMin, 'janitor hires raise snack sales');
  assert.equal(jan.perRider, baseline.perRider, 'untrained janitors do not change ride income');
  const trainedJan = derive({ janitors: { hired: 4, trained: 3 } });
  assert.ok(trainedJan.perRider > baseline.perRider, 'janitor training raises park appeal income');

  const photo = derive({ photographers: { hired: 2, trained: 0 } });
  assert.ok(photo.photoPerRide > 0, 'photographers sell photos per launch');
  const trainedPhoto = derive({ photographers: { hired: 2, trained: 3 } });
  assert.ok(trainedPhoto.photoPerRide > photo.photoPerRide, 'photo training raises photo value');
  assert.ok(photo.ratePerMin > baseline.ratePerMin, 'photo sales show up in the income estimate');
}

{
  assert.equal(gradeFor(10), 'Gentle');
  assert.equal(gradeFor(22), 'Fun');
  assert.equal(gradeFor(42), 'Exciting');
  assert.equal(gradeFor(65), 'Thrilling');
  assert.equal(gradeFor(90), 'Legendary');
}

console.log('economy tests passed');
