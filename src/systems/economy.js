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
    upgrades.train.max = hasResearchKey(done, 'train3') ? 3 : 2;
  }
  return upgrades;
}

export function baseLap() {
  return 10;
}

export function upgradeCost(upgrade) {
  return Math.floor(upgrade.base * Math.pow(upgrade.growth, upgrade.level));
}

export function deriveEconomy({
  upgrades,
  pathStats,
  simQueue = 0,
  researchDone = {},
  station,
  fallbackMaxSpeed = 4,
}) {
  const U = upgrades;
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
  const marketMult = 1 + U.market.level * 0.18;
  const ratingMult = 1 + (st.excitement / 55) * marketMult;
  const researchMult = hasResearchKey(researchDone, 'photo') ? 1.15 : 1;
  const perRider = (ticket + express) * hype * ratingMult * researchMult;
  const perRideFull = Math.round(seatsCap * perRider);
  const trains = 1 + U.train.level;

  const loadDiv = 1 + U.loading.level * 0.6;
  const unloadTime = station.baseUnload / loadDiv;
  const loadTime = station.baseLoad / loadDiv;
  const dwellTime = unloadTime + loadTime;
  const lapTravel = Math.max(2, st.lapTime);

  // dispatch: manual until Auto Dispatch is researched, then auto-launch after a
  // delay shortened by the Dispatch Speed upgrade.
  const autoDispatch = hasResearchKey(researchDone, 'autodispatch');
  const dispatchDelay = Math.max(0.25, (station.baseDispatch ?? 3) / (1 + (U.dispatch?.level || 0) * 0.6));
  // manual dispatch estimate assumes the player launches promptly (best case)
  const cycle = lapTravel + dwellTime + (autoDispatch ? dispatchDelay : 0);

  const queueCap =
    station.queueBase +
    U.queue.level * station.queueStep +
    (hasResearchKey(researchDone, 'queue2') ? 30 : 0);
  const arrivalRate =
    station.arrivalBase * (1 + st.excitement / 30) * (1 + U.market.level * 0.25);

  const estBoard =
    Math.min(seatsCap, queueCap, arrivalRate * cycle * trains) / Math.max(1, trains);
  const snackPerMin =
    Math.min(Math.round(simQueue), station.snackCap) *
    U.snacks.level *
    station.snackPerGuest;
  const ridePerMin = Math.round(estBoard * perRider * (60 / cycle) * trains);
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
    snackPerMin,
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
