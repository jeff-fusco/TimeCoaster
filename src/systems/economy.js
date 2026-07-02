export function hasResearchKey(done, key) {
  return !!done?.[key];
}

export function featureUnlocked(feat, done = {}) {
  if (feat === 'loop') return hasResearchKey(done, 'loop');
  if (feat === 'corkscrew') return hasResearchKey(done, 'cork');
  if (feat === 'brake') return hasResearchKey(done, 'brakes');
  return true;
}

export function applyResearchEffects(upgrades, done = {}) {
  if (upgrades.train) {
    upgrades.train.max = hasResearchKey(done, 'train3') ? 8 : 4;
  }
  return upgrades;
}

export function baseLap() {
  return 10;
}

export function upgradeCost(upgrade) {
  return Math.floor(upgrade.base * Math.pow(upgrade.growth, upgrade.level));
}

export function researchEfficiency(fundingPct = 0) {
  const pct = Math.max(0, Math.min(100, fundingPct));
  return 1 / (1 + (pct / 100) * 0.45);
}

// Staff effect coefficients — hiring adds coverage, training adds skill.
// Read by deriveEconomy, maintenance (install speed) and the staff panel's
// live status lines, so the whole balance lives here.
export const STAFF_FX = {
  operatorBoard: 0.35,   // boarding speed per operator hired
  operatorLaunch: 0.5,   // auto-launch delay reduction per training level
  entertainArrive: 0.10, // guest arrival bonus per entertainer hired
  entertainQueue: 5,     // queue capacity per entertainer training level
  mechanicInstall: 0.45, // install speed per mechanic hired
  mechanicIncome: 0.04,  // ride income per mechanic training level
  janitorSnack: 0.06,    // snack sales per janitor hired
  janitorAppeal: 0.02,   // ride rating income per janitor training level
  photoBase: 3,          // $ per dispatched train per photographer hired
  photoSkill: 0.6,       // photo value bonus per training level
};

const NO_STAFF = { hired: 0, trained: 0 };

export function deriveEconomy({
  upgrades,
  pathStats,
  simQueue = 0,
  researchDone = {},
  staff = {},          // { role: { hired, trained } }
  station,
  fallbackMaxSpeed = 4,
}) {
  const U = upgrades;
  const FX = STAFF_FX;
  const seatsPerCar = 4 + U.seats.level * 2;
  const cars = 1 + U.car.level;
  const seatsCap = cars * seatsPerCar;
  const ticket = 2 + U.ticket.level;
  const express = U.express.level * 5;
  const hype = Math.pow(1.12, U.hype.level);
  const st = pathStats || {
    excitement: 0,
    lapTime: baseLap(),
    maxSpeed: fallbackMaxSpeed,
    length: 0,
  };
  // Hired counts add coverage; training levels add skill — different levers.
  const op = staff.operators || NO_STAFF;
  const ent = staff.entertainers || NO_STAFF;
  const mech = staff.mechanics || NO_STAFF;
  const jan = staff.janitors || NO_STAFF;
  const photo = staff.photographers || NO_STAFF;
  const upkeepMult = 1 + FX.mechanicIncome * mech.trained;   // trained mechanics: smoother ride
  const cleanMult = 1 + FX.janitorAppeal * jan.trained;      // trained janitors: park appeal
  const janitorMult = 1 + FX.janitorSnack * jan.hired;       // hired janitors: snack sales

  const marketMult = 1 + U.market.level * 0.18;
  const ratingMult = (1 + (st.excitement / 55) * marketMult) * cleanMult;
  const researchMult = hasResearchKey(researchDone, 'photo') ? 1.15 : 1;
  const perRider = (ticket + express) * hype * ratingMult * researchMult * upkeepMult;
  const perRideFull = Math.round(seatsCap * perRider);
  const trains = 1 + U.train.level;

  // Hired operators crew the platform (faster boarding, first enables
  // auto-launch); training drills them to launch sooner.
  const loadDiv = 1 + FX.operatorBoard * op.hired;
  const unloadTime = station.baseUnload / loadDiv;
  const loadTime = station.baseLoad / loadDiv;
  const dwellTime = unloadTime + loadTime;
  const lapTravel = Math.max(2, st.lapTime);

  const autoDispatch = op.hired >= 1;
  const dispatchDelay = Math.max(0.3, (station.baseDispatch ?? 3) / (1 + FX.operatorLaunch * op.trained));
  // manual dispatch estimate assumes the player launches promptly (best case)
  const cycle = lapTravel + dwellTime + (autoDispatch ? dispatchDelay : 0);

  const queueCap =
    station.queueBase +
    U.queue.level * station.queueStep +
    FX.entertainQueue * ent.trained +
    (hasResearchKey(researchDone, 'queue2') ? 30 : 0);
  const arrivalRate =
    station.arrivalBase *
    (1 + st.excitement / 30) *
    (1 + U.market.level * 0.25) *
    (1 + FX.entertainArrive * ent.hired);

  // photographers sell a photo package on every dispatched (non-empty) train
  const photoPerRide = photo.hired * FX.photoBase * (1 + FX.photoSkill * photo.trained) * (1 + st.excitement / 60);

  const estBoard =
    Math.min(seatsCap, queueCap, arrivalRate * cycle * trains) / Math.max(1, trains);
  const snackPerMin =
    Math.min(Math.round(simQueue), station.snackCap) *
    U.snacks.level *
    station.snackPerGuest *
    janitorMult;
  const photoPerMin = estBoard > 0.5 ? photoPerRide * (60 / cycle) * trains : 0;
  const ridePerMin = Math.round(estBoard * perRider * (60 / cycle) * trains + photoPerMin);
  const ratePerMin = ridePerMin + snackPerMin;

  return {
    cars,
    seatsCap,
    seatsPerCar,
    ticket,
    hype,
    perRider,
    perRideFull,
    trains,
    unloadTime,
    loadTime,
    dwellTime,
    lapTravel,
    cycle,
    autoDispatch,
    dispatchDelay,
    queueCap,
    arrivalRate,
    photoPerRide,
    snackPerMin,
    janitorMult,
    ridePerMin,
    ratingMult,
    ratePerMin,
  };
}

export function gradeFor(excitement) {
  if (excitement >= 90) return 'Legendary';
  if (excitement >= 65) return 'Thrilling';
  if (excitement >= 42) return 'Exciting';
  if (excitement >= 22) return 'Fun';
  return 'Gentle';
}

export function formatMoney(value) {
  const n = Math.floor(value);
  if (n < 10000) return n.toLocaleString();
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e5 ? 1 : 0)}k`;
  if (n < 1e9) return `${(n / 1e6).toFixed(2)}M`;
  return `${(n / 1e9).toFixed(2)}B`;
}
