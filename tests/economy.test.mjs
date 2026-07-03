import assert from 'node:assert/strict';
import {
  applyResearchEffects,
  deriveEconomy,
  featureUnlocked,
  formatMoney,
  gradeFor,
  upgradeCost,
} from '../src/systems/economy.js';
import {
  clampResearchFundingPct,
  createResearchState,
  fundingEfficiency,
  researchFundingCap,
  stepResearch,
} from '../src/systems/research.js';
import { RESEARCH, RESEARCH_PATHS } from '../src/config/gameData.js';

function makeUpgrades() {
  return {
    car: { base: 90, growth: 2.05, level: 0, max: 16 },
    seats: { base: 130, growth: 2.05, level: 0, max: 24 },
    speed: { base: 120, growth: 2.08, level: 0, max: 30 },
    train: { base: 2500, growth: 5.8, level: 0, max: 4 },
    queue: { base: 170, growth: 2.08, level: 0, max: 24 },
    snacks: { base: 320, growth: 2.55, level: 0, max: 18 },
    express: { base: 650, growth: 2.35, level: 0, max: 18 },
    ticket: { base: 85, growth: 1.92, level: 0, max: 30 },
    market: { base: 260, growth: 2.3, level: 0, max: 18 },
    hype: { base: 260, growth: 2.35, level: 0, max: 24 },
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
  assert.equal(featureUnlocked('spiral'), false);
  assert.equal(featureUnlocked('spiral', { spiral: true }), true);
  assert.equal(featureUnlocked('giantLoop', { giantLoop: true }), true);
  assert.equal(featureUnlocked('vertical', { verticalTrack: true }), true);
  assert.equal(featureUnlocked('tunnel', { tunnels: true }), true);
  assert.equal(featureUnlocked('teleporter', { teleporters: true }), true);
}

{
  const upgrades = makeUpgrades();
  applyResearchEffects(upgrades, {});
  assert.equal(upgrades.train.max, 4);
  applyResearchEffects(upgrades, { train3: true });
  assert.equal(upgrades.train.max, 8);
  applyResearchEffects(upgrades, { train3: true, predictiveDispatch: true });
  assert.equal(upgrades.train.max, 12);
}

{
  assert.equal(upgradeCost({ base: 80, growth: 1.5, level: 0 }), 80);
  assert.equal(upgradeCost({ base: 80, growth: 1.5, level: 2 }), 180);
  assert.equal(upgradeCost(makeUpgrades().train), 2500, 'first extra train is a mid-game purchase');
  const trainCurve = makeUpgrades().train;
  trainCurve.level = 2;
  assert.equal(upgradeCost(trainCurve), 84100, 'extra trains ramp hard after the first');
  assert.equal(formatMoney(9999), '9,999');
  assert.equal(formatMoney(12500), '12.5k');
  assert.equal(formatMoney(1250000), '1.25M');
}

{
  assert.equal(RESEARCH.brakes.cost, 600, 'first research unlock is no longer nearly free');
  assert.ok(RESEARCH.teleporters.cost >= 10000000, 'late track research is a true long-arc target');
  assert.deepEqual(RESEARCH_PATHS.track.projects.slice(0, 3), ['brakes', 'loop', 'cork']);
}

{
  const scientists = { scientists: { hired: 1, trained: 0 } };
  assert.equal(fundingEfficiency(0, scientists), 1);
  assert.ok(fundingEfficiency(50, scientists) < fundingEfficiency(10, scientists), 'higher funding % has lower progress per dollar');
  assert.ok(1000 * 0.05 * fundingEfficiency(5, scientists) > 100 * 0.5 * fundingEfficiency(50, scientists), 'larger actual spend still wins');
  assert.equal(researchFundingCap({ scientists: { hired: 0, trained: 0 } }), 0);
  assert.equal(researchFundingCap(scientists), 7, 'first scientist unlocks a 7% R&D budget');
  assert.equal(researchFundingCap({ scientists: { hired: 3, trained: 0 } }), 21);
  assert.equal(clampResearchFundingPct(50, { scientists: { hired: 2, trained: 0 } }), 14);
}

{
  const research = createResearchState(RESEARCH_PATHS);
  const noStaff = stepResearch({
    research,
    researchPaths: RESEARCH_PATHS,
    projects: RESEARCH,
    staff: {},
    spend: RESEARCH.brakes.cost * 2,
    fundingPct: 20,
  });
  assert.deepEqual(noStaff, [], 'research is gated behind Scientists');
  assert.equal(research.done.brakes, undefined);

  const unlocked = stepResearch({
    research,
    researchPaths: RESEARCH_PATHS,
    projects: RESEARCH,
    staff: { scientists: { hired: 1, trained: 0 } },
    spend: RESEARCH.brakes.cost,
    fundingPct: 0,
  });
  assert.deepEqual(unlocked, ['brakes']);
  assert.equal(research.done.brakes, true);
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
  // 12 in line × snacks lv1 × ($3 base + $0.4 × ticket lv2) per guest
  assert.ok(Math.abs(economy.snackPerMin - 12 * (3 + 0.8)) < 1e-9);
  assert.ok(economy.perRideFull > 140);
}

{
  const upgrades = makeUpgrades();
  upgrades.car.level = 1;
  upgrades.ticket.level = 2;
  const pathStats = { excitement: 90, lapTime: 30, maxSpeed: 12, length: 240 };
  const baseline = deriveEconomy({ upgrades, pathStats, simQueue: 20, researchDone: {}, station, fallbackMaxSpeed: 4 });
  const researched = deriveEconomy({
    upgrades,
    pathStats,
    simQueue: 20,
    researchDone: {
      stationCrew: true,
      movingPlatform: true,
      predictiveDispatch: true,
      queueEntertainment: true,
      virtualQueue: true,
      pocketQueue: true,
      premiumTickets: true,
      merchExit: true,
      realityLicensing: true,
      flyers: true,
      radio: true,
      viral: true,
      mythicReputation: true,
    },
    station,
    fallbackMaxSpeed: 4,
  });
  assert.ok(researched.loadTime < baseline.loadTime, 'operations research speeds station loading');
  assert.ok(researched.dispatchDelay < baseline.dispatchDelay, 'predictive dispatch tightens launch delay');
  assert.ok(researched.queueCap > baseline.queueCap + 700, 'guest research adds major queue capacity');
  assert.ok(researched.arrivalRate > baseline.arrivalRate * 2, 'marketing research increases demand');
  assert.ok(researched.perRider > baseline.perRider, 'premium tickets increase rider value');
  assert.ok(researched.merchPerTrain > 0, 'merch exit adds per-train revenue');
  assert.ok(researched.royaltyPerMin > 0, 'reality licensing adds impossible-ride royalties');
  assert.ok(researched.ratePerMin > baseline.ratePerMin);
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
  assert.equal(trainedEnt.queueCap, baseline.queueCap + 16, 'training adds queue capacity');

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

// Queue-tab upgrades: Shade Canopies extend snack reach, Queue Comfort raises
// arrivals, Smart Turnstiles speed boarding.
{
  const base = makeUpgrades();
  base.snacks.level = 2;
  const args = { pathStats: null, station, simQueue: 200, researchDone: {} };
  const plain = deriveEconomy({ ...args, upgrades: base });
  assert.equal(plain.snackCap, station.snackCap, 'base snack cap comes from station config');
  assert.equal(plain.snackPerMin, 30 * 2 * station.snackPerGuest);

  const withCanopy = deriveEconomy({ ...args, upgrades: { ...base, canopy: { level: 4 } } });
  assert.equal(withCanopy.snackCap, station.snackCap + 60, 'each canopy level serves +15 guests');
  assert.ok(withCanopy.snackPerMin > plain.snackPerMin, 'canopies raise snack income with a long line');

  const withComfort = deriveEconomy({ ...args, upgrades: { ...base, comfort: { level: 5 } } });
  assert.ok(Math.abs(withComfort.arrivalRate / plain.arrivalRate - 1.4) < 1e-9, 'comfort adds 8% arrivals per level');

  const withTurnstiles = deriveEconomy({ ...args, upgrades: { ...base, turnstiles: { level: 3 } } });
  assert.ok(withTurnstiles.loadTime < plain.loadTime, 'turnstiles speed boarding');
  assert.ok(Math.abs(plain.loadTime / withTurnstiles.loadTime - 1.18) < 1e-9, '6% per level, multiplicative');
}

// Vendor carts: a level-scaled fraction of riders buy hats/balloons.
{
  const args = { pathStats: null, station, researchDone: {} };
  const plain = deriveEconomy({ ...args, upgrades: makeUpgrades() });
  assert.equal(plain.hatFrac, 0);
  assert.equal(plain.vendorPerRider, 0);

  const carts = deriveEconomy({
    ...args,
    upgrades: { ...makeUpgrades(), hats: { level: 4 }, balloons: { level: 5 } },
  });
  assert.ok(Math.abs(carts.hatFrac - 0.24) < 1e-9, '6% of riders per hat level');
  assert.ok(Math.abs(carts.balloonFrac - 0.4) < 1e-9, '8% per balloon level');
  assert.ok(Math.abs(carts.vendorPerRider - (0.24 * 12 + 0.4 * 6)) < 1e-9, 'hats $12, balloons $6');
  assert.ok(carts.ridePerMin > plain.ridePerMin, 'vendor sales raise projected income');

  const maxed = deriveEconomy({
    ...args,
    upgrades: { ...makeUpgrades(), hats: { level: 99 }, balloons: { level: 99 } },
  });
  assert.ok(Math.abs(maxed.hatFrac - 0.48) < 1e-9, 'hat uptake caps at 48%');
  assert.ok(Math.abs(maxed.balloonFrac - 0.64) < 1e-9, 'balloon uptake caps at 64%');
}

// Dual-Berth Station drops unload from the throughput cycle; operator training
// speeds the berth-advance shuttle on top.
{
  const args = { upgrades: makeUpgrades(), pathStats: null, station };
  const single = deriveEconomy({ ...args, researchDone: {} });
  const dual = deriveEconomy({ ...args, researchDone: { dualBerth: true } });
  assert.equal(single.berths, 1);
  assert.equal(dual.berths, 2);
  assert.ok(dual.dwellTime < single.dwellTime, 'dual berth shortens the station dwell');
  assert.ok(Math.abs(dual.dwellTime - (dual.loadTime + dual.advanceTime)) < 1e-9, 'dual dwell = load + advance shuttle');

  const trainedOps = deriveEconomy({
    ...args,
    researchDone: { dualBerth: true },
    staff: { operators: { hired: 0, trained: 3 } },
  });
  assert.ok(trainedOps.advanceTime < dual.advanceTime, 'operator training speeds the berth shuttle');
  const movingPlat = deriveEconomy({ ...args, researchDone: { dualBerth: true, movingPlatform: true } });
  assert.ok(movingPlat.advanceTime < dual.advanceTime, 'moving platforms speed the berth shuttle');
}

console.log('economy tests passed');
