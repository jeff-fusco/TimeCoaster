export function hasResearchKey(done, key) {
  return !!done?.[key];
}

export function featureUnlocked(feat, done = {}) {
  if (feat === 'loop') return hasResearchKey(done, 'loop');
  if (feat === 'corkscrew') return hasResearchKey(done, 'cork');
  if (feat === 'brake') return hasResearchKey(done, 'brakes');
  if (feat === 'spiral') return hasResearchKey(done, 'spiral');
  if (feat === 'giantLoop') return hasResearchKey(done, 'giantLoop');
  if (feat === 'vertical') return hasResearchKey(done, 'verticalTrack');
  if (feat === 'tunnel') return hasResearchKey(done, 'tunnels');
  if (feat === 'teleporter') return hasResearchKey(done, 'teleporters');
  return true;
}

export function applyResearchEffects(upgrades, done = {}) {
  if (upgrades.train) {
    upgrades.train.max = hasResearchKey(done, 'predictiveDispatch') ? 12 : hasResearchKey(done, 'train3') ? 8 : 4;
  }
  return upgrades;
}

// Tallest track height the player may build, raised by the Structures research
// path. `tiers` is HEIGHT_TIERS from gameData (highest-first); `base` is the
// starting cap. Kept here so buildControls and load-clamping share one source.
export function maxTrackHeight(researchDone = {}, tiers = [], base = 18) {
  for (const tier of tiers) {
    if (hasResearchKey(researchDone, tier.research)) return tier.height;
  }
  return base;
}

export function baseLap() {
  return 10;
}

export function upgradeCost(upgrade) {
  return Math.floor(upgrade.base * Math.pow(upgrade.growth, upgrade.level));
}

// Vendor carts: what fraction of riders buy, and at what price.
export const VENDOR = {
  hatFracPerLevel: 0.06,
  hatFracMax: 0.48,
  hatPrice: 12,
  balloonFracPerLevel: 0.08,
  balloonFracMax: 0.64,
  balloonPrice: 6,
};

// Deterministic per-guest roll in [0,1) — the same seed always buys (or not),
// so hats/balloons stay on the same guests across frames and rebuilds.
export function guestBuyerRoll(seed) {
  return (((seed + 1) * 2654435761) >>> 0) % 1000 / 1000;
}

// Staff effect coefficients — hiring adds coverage, training adds skill.
// Read by deriveEconomy, maintenance (install speed) and the staff panel's
// live status lines, so the whole balance lives here.
export const STAFF_FX = {
  operatorBoard: 0.18,   // boarding speed per operator hired
  operatorLaunch: 0.8,   // auto-launch delay reduction per training level
  entertainArrive: 0.05, // guest arrival bonus per entertainer hired
  entertainQueue: 8,     // queue capacity per entertainer training level
  mechanicInstall: 0.22, // install speed per mechanic hired
  mechanicIncome: 0.075, // ride income per mechanic training level
  janitorSnack: 0.025,   // snack sales per janitor hired
  janitorAppeal: 0.04,   // ride rating income per janitor training level
  photoBase: 1.5,        // $ per dispatched train per photographer hired
  photoSkill: 1.0,       // photo value bonus per training level
  scientistSkill: 0.18,  // research efficiency per scientist training level
  // marketer numbers live in marketing.js (MARKETER_BUDGET_PCT / MARKETER_SKILL)
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
  demandMult = 1,      // park-wide guest-arrival multiplier (Renown perk × marketing channels)
  snackMult = 1,       // biome snack-income multiplier (Desert)
  ticketMult = 1,      // Ride Spotlight campaign: ticket premium (scaled by excitement upstream)
  vendorMult = 1,      // Family Package campaign: per-guest snack/vendor spend
}) {
  const U = upgrades;
  const FX = STAFF_FX;
  const seatsPerCar = 4 + U.seats.level * 2;
  const cars = 1 + U.car.level;
  const seatsCap = cars * seatsPerCar;
  const st = pathStats || {
    excitement: 0,
    lapTime: baseLap(),
    maxSpeed: fallbackMaxSpeed,
    length: 0,
  };
  const premiumTicket = hasResearchKey(researchDone, 'premiumTickets')
    ? 1 + Math.min(1.35, ((st.excitement || 0) / 160) + ((st.length || 0) / 1800))
    : 1;
  const ticket = (2 + U.ticket.level) * premiumTicket * Math.max(0, ticketMult);
  const express = U.express.level * 5;
  const hype = Math.pow(1.12, U.hype.level);
  // Hired counts add coverage; training levels add skill — different levers.
  // Staff v2: `skill` (innate talent + crew traits + tenure, ≈1.0 for an
  // average fresh crew) scales the per-body effects. Old counter fixtures
  // carry no skill field and read as exactly 1.0 — the balance anchor.
  const sk = entry => (Number.isFinite(entry.skill) && entry.hired > 0 ? entry.skill : 1);
  const op = staff.operators || NO_STAFF;
  const ent = staff.entertainers || NO_STAFF;
  const mech = staff.mechanics || NO_STAFF;
  const jan = staff.janitors || NO_STAFF;
  const photo = staff.photographers || NO_STAFF;
  const upkeepMult = 1 + FX.mechanicIncome * mech.trained;   // trained mechanics: smoother ride
  const cleanMult = 1 + FX.janitorAppeal * jan.trained;      // trained janitors: park appeal
  const janitorMult = 1 + FX.janitorSnack * jan.hired * sk(jan);  // hired janitors: snack sales

  // Reputation coupling: a well-marketed park's excitement pays better. Driven
  // by the Marketing Department's Demand (via demandMult) since M5 retired the
  // flat 'market' upgrade.
  const marketMult = 1 + (Math.max(1, demandMult) - 1) * 0.25;
  const ratingMult = (1 + (st.excitement / 55) * marketMult) * cleanMult;
  const researchMult = hasResearchKey(researchDone, 'photo') ? 1.15 : 1;
  const perRider = (ticket + express) * hype * ratingMult * researchMult * upkeepMult;
  const perRideFull = Math.round(seatsCap * perRider);
  const trains = 1 + U.train.level;

  // Hired operators crew the platform (faster boarding, first enables
  // auto-launch); training drills them to launch sooner.
  const stationResearchDiv =
    (hasResearchKey(researchDone, 'stationCrew') ? 1.25 : 1) *
    (hasResearchKey(researchDone, 'movingPlatform') ? 1.45 : 1);
  // queue-tab upgrades (older saves/fixtures may not carry the newer keys)
  const canopyLvl = U.canopy?.level || 0;
  const comfortLvl = U.comfort?.level || 0;
  const turnstileLvl = U.turnstiles?.level || 0;
  const hatFrac = Math.min(VENDOR.hatFracMax, VENDOR.hatFracPerLevel * (U.hats?.level || 0));
  const balloonFrac = Math.min(VENDOR.balloonFracMax, VENDOR.balloonFracPerLevel * (U.balloons?.level || 0));
  const vendorPerRider = (hatFrac * VENDOR.hatPrice + balloonFrac * VENDOR.balloonPrice) * Math.max(0, vendorMult);
  const loadDiv = (1 + FX.operatorBoard * op.hired * sk(op)) * stationResearchDiv * (1 + 0.06 * turnstileLvl);
  const unloadTime = station.baseUnload / loadDiv;
  const loadTime = station.baseLoad / loadDiv;
  // Dual-Berth Station: the rear berth unloads while the front berth loads, so
  // unload drops out of the throughput cycle; only the load plus the short
  // berth-advance shuttle remain. Drilled operators marshal the shuttle faster.
  const dualBerth = hasResearchKey(researchDone, 'dualBerth');
  const advanceTime = 1.15 / ((1 + 0.1 * op.trained) * (hasResearchKey(researchDone, 'movingPlatform') ? 1.25 : 1));
  const dwellTime = dualBerth ? loadTime + advanceTime : unloadTime + loadTime;
  const lapTravel = Math.max(2, st.lapTime);

  const autoDispatch = op.hired >= 1;
  const dispatchResearchDiv = hasResearchKey(researchDone, 'predictiveDispatch') ? 1.85 : 1;
  const dispatchDelay = Math.max(0.3, (station.baseDispatch ?? 3) / ((1 + FX.operatorLaunch * op.trained) * dispatchResearchDiv));
  // manual dispatch estimate assumes the player launches promptly (best case)
  const cycle = lapTravel + dwellTime + (autoDispatch ? dispatchDelay : 0);

  const queueCap =
    station.queueBase +
    U.queue.level * station.queueStep +
    FX.entertainQueue * ent.trained +
    (hasResearchKey(researchDone, 'queue2') ? 30 : 0) +
    (hasResearchKey(researchDone, 'queueEntertainment') ? 45 : 0) +
    (hasResearchKey(researchDone, 'virtualQueue') ? 140 : 0) +
    (hasResearchKey(researchDone, 'pocketQueue') ? 650 : 0);
  // Guest arrivals: excitement draws crowds; entertainers and queue comfort
  // help; the big multiplier is Demand from the Marketing Department (campaign
  // tiers researched in the marketing path set how high demandMult can reach).
  const arrivalRate =
    station.arrivalBase *
    (1 + st.excitement / 30) *
    (1 + FX.entertainArrive * ent.hired * sk(ent)) *
    (1 + 0.08 * comfortLvl) *
    Math.max(0, demandMult) *
    (hasResearchKey(researchDone, 'queueEntertainment') ? 1.12 : 1);

  // photographers sell a photo package on every dispatched (non-empty) train
  const photoPerRide = photo.hired * sk(photo) * FX.photoBase * (1 + FX.photoSkill * photo.trained) * (1 + st.excitement / 60);

  // Boarded per dispatch: each train grabs up to its seats, capped by the line
  // and by how many guests arrive between consecutive dispatches (cycle/trains).
  // Seat-bound throughput therefore scales with the train count, and arrival
  // boosters only pay off when arrivals are the true bottleneck.
  const estBoard =
    Math.min(seatsCap, queueCap, arrivalRate * cycle / Math.max(1, trains));
  const snackCap = station.snackCap + canopyLvl * 15;
  // snack spend per guest rises with ticket prestige and theming, so stands
  // stay a relevant income line beyond the early game
  const snackPerGuest = station.snackPerGuest + 0.4 * U.ticket.level;
  const snackPerMin =
    Math.min(Math.round(simQueue), snackCap) *
    U.snacks.level *
    snackPerGuest *
    janitorMult *
    hype *
    Math.max(0, snackMult) *
    Math.max(0, vendorMult);
  const trainCyclesPerMin = (60 / cycle) * trains;
  const photoPerMin = estBoard > 0.5 ? photoPerRide * trainCyclesPerMin : 0;
  // Merch Exit Shop skims a share of every trainload's ride take (credited at
  // dispatch via merchRate); royalties scale with theming so they stay relevant.
  const merchRate = hasResearchKey(researchDone, 'merchExit') ? 0.06 : 0;
  const merchPerTrain = merchRate * estBoard * perRider;
  const royaltyPerMin = hasResearchKey(researchDone, 'realityLicensing')
    ? Math.max(0, st.excitement - 75) * Math.max(1, st.length / 100) * 6 * hype
    : 0;
  const ridePerMin = Math.round(estBoard * (perRider + vendorPerRider) * trainCyclesPerMin + photoPerMin + merchPerTrain * trainCyclesPerMin + royaltyPerMin);
  const ratePerMin = ridePerMin + snackPerMin;

  return {
    cars,
    seatsCap,
    seatsPerCar,
    ticket,
    express,
    hype,
    perRider,
    perRideFull,
    trains,
    unloadTime,
    loadTime,
    dwellTime,
    berths: dualBerth ? 2 : 1,
    advanceTime,
    lapTravel,
    cycle,
    autoDispatch,
    dispatchDelay,
    queueCap,
    arrivalRate,
    photoPerRide,
    merchRate,
    merchPerTrain,
    royaltyPerMin,
    hatFrac,
    balloonFrac,
    vendorPerRider,
    snackCap,
    snackPerMin,
    janitorMult,
    ridePerMin,
    ratingMult,
    researchMult,
    upkeepMult,
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
