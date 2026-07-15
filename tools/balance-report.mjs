// Balance analyzer: payback time (cost / marginal $-per-min) for every next
// purchase at representative game stages. Run: node tools/balance-report.mjs
//
// Payback guide (idle-game feel): <0.5 min = underpriced, 0.5–3 min = snappy,
// 3–10 min = considered, 10–30 min = long-arc, >30 min = wall.
import { deriveEconomy, upgradeCost, applyResearchEffects } from '../src/systems/economy.js';
import { hireCost, trainCost } from '../src/systems/staff.js';
import { RESEARCH, RESEARCH_PATHS, STAFF, STN, UPGRADES } from '../src/config/gameData.js';
import { buyLand, chunkKey, createPropertyState, expansionCandidates } from '../src/systems/property.js';
import { personSalary, _makeTestPerson } from '../src/systems/staffPeople.js';

const clone = obj => JSON.parse(JSON.stringify(obj));

function makeUpgrades(levels = {}) {
  const up = clone(UPGRADES);
  Object.keys(up).forEach(k => { up[k].level = levels[k] || 0; });
  return up;
}

function makeStaff(counts = {}) {
  const staff = {};
  Object.keys(STAFF).forEach(role => {
    staff[role] = { hired: counts[role]?.[0] || 0, trained: counts[role]?.[1] || 0 };
  });
  return staff;
}

// stage snapshots: [upgrades levels, staff [hired,trained], research done, pathStats]
const STAGES = {
  early: {
    upgrades: { car: 1, ticket: 2 },
    staff: { operators: [1, 0] },
    research: {},
    stats: { excitement: 22, lapTime: 10, maxSpeed: 12, length: 65 },
  },
  mid: {
    upgrades: {
      car: 4, seats: 3, speed: 4, train: 1, queue: 6, snacks: 3, ticket: 8,
      market: 4, hype: 5, express: 1, canopy: 1, comfort: 1, hats: 1, balloons: 2,
    },
    staff: { operators: [3, 1], entertainers: [2, 1], mechanics: [2, 1], janitors: [1, 0], scientists: [1, 0] },
    research: { brakes: true, loop: true, launch: true, queue2: true, photo: true, flyers: true },
    stats: { excitement: 85, lapTime: 25, maxSpeed: 22, length: 300 },
  },
  late: {
    upgrades: {
      car: 8, seats: 8, speed: 10, train: 3, queue: 12, snacks: 8, ticket: 15,
      market: 9, hype: 12, express: 6, canopy: 5, comfort: 6, turnstiles: 4, hats: 4, balloons: 5,
    },
    staff: { operators: [5, 3], entertainers: [4, 3], mechanics: [4, 2], janitors: [3, 2], photographers: [2, 1], scientists: [2, 2] },
    research: {
      brakes: true, loop: true, cork: true, launch: true, train3: true, stationCrew: true, dualBerth: true,
      queue2: true, queueEntertainment: true, virtualQueue: true, photo: true, premiumTickets: true,
      flyers: true, radio: true, spiral: true,
    },
    stats: { excitement: 250, lapTime: 50, maxSpeed: 55, length: 1200 },
  },
  endgame: {
    upgrades: {
      car: 16, seats: 19, speed: 20, train: 6, queue: 20, snacks: 12, ticket: 22,
      market: 14, hype: 18, express: 12, canopy: 9, comfort: 11, turnstiles: 8, hats: 8, balloons: 8,
    },
    staff: { operators: [8, 6], entertainers: [6, 4], mechanics: [6, 4], janitors: [4, 3], photographers: [4, 3], scientists: [4, 4] },
    research: {
      brakes: true, loop: true, cork: true, spiral: true, giantLoop: true, verticalTrack: true,
      launch: true, train3: true, stationCrew: true, dualBerth: true, movingPlatform: true, predictiveDispatch: true,
      queue2: true, queueEntertainment: true, virtualQueue: true, pocketQueue: true,
      photo: true, premiumTickets: true, merchExit: true,
      flyers: true, radio: true, viral: true,
    },
    stats: { excitement: 427, lapTime: 67.6, maxSpeed: 78, length: 2649 },
  },
};

function econFor(stage, { upgrades, staff, research }) {
  const up = makeUpgrades(upgrades);
  applyResearchEffects(up, research);
  const d = deriveEconomy({
    upgrades: up,
    pathStats: stage.stats,
    simQueue: 1e9, // assume the line is full: best-case snack/queue value
    researchDone: research,
    staff: makeStaff(staff),
    station: STN,
  });
  // clamp simQueue to the real cap for snack income
  return deriveEconomy({
    upgrades: up,
    pathStats: stage.stats,
    simQueue: d.queueCap,
    researchDone: research,
    staff: makeStaff(staff),
    station: STN,
  });
}

function rateFor(stage, base) {
  return econFor(stage, base).ratePerMin;
}

// payroll estimate for a stage: median-competence, trait-free person per role,
// paid at the stage's trained level, times the headcount. (Real rosters vary by
// trait/tenure; this is the honest ballpark for "how big is the wage drain".)
function payrollFor(staffCounts) {
  return Object.keys(STAFF).reduce((sum, role) => {
    const [hired, trained] = staffCounts[role] || [0, 0];
    if (!hired) return sum;
    return sum + hired * personSalary(_makeTestPerson(role), trained);
  }, 0);
}

const fmtMin = m => (m === Infinity ? '  ∞' : m >= 100 ? `${Math.round(m)}m` : `${m.toFixed(1)}m`);
const fmtMoney = v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}k` : `$${Math.round(v)}`;
const pct = (part, whole) => whole > 0 ? `${Math.round(100 * part / whole)}%` : '—';

// ── Income mix: where the money comes from at each stage. This is the "support
//    systems get buried" picture — ride tickets scale multiplicatively while
//    concessions/photos stay linear and crowd-capped.
console.log('INCOME MIX BY SOURCE  (gross $/min; % of gross in parens)');
console.log('stage      tickets          photos        merch+royalty   concessions      | payroll     net/min');
for (const [name, stage] of Object.entries(STAGES)) {
  const d = econFor(stage, { upgrades: stage.upgrades, staff: stage.staff, research: stage.research });
  const ticket = d.ticketPerMin;
  const photo = d.photoPerMin;
  const merchRoy = d.merchPerMin + d.royaltyPerMin;
  const conc = d.concessions.perMin;
  const gross = ticket + photo + merchRoy + conc;
  const pay = payrollFor(stage.staff);
  const cell = v => `${fmtMoney(v)} (${pct(v, gross)})`.padEnd(15);
  console.log(
    `${name.padEnd(9)}  ${cell(ticket)}  ${cell(photo)}  ${cell(merchRoy)}  ${cell(conc)}  | ${fmtMoney(pay).padStart(8)}   ${fmtMoney(gross - pay).padStart(8)}`
  );
}

for (const [name, stage] of Object.entries(STAGES)) {
  const base = { upgrades: stage.upgrades, staff: stage.staff, research: stage.research };
  const baseRate = rateFor(stage, base);
  const rows = [];

  // shop upgrades: next level
  for (const key of Object.keys(UPGRADES)) {
    const lvl = stage.upgrades[key] || 0;
    if (lvl >= UPGRADES[key].max) continue;
    const cost = upgradeCost({ ...UPGRADES[key], level: lvl });
    const next = rateFor(stage, { ...base, upgrades: { ...stage.upgrades, [key]: lvl + 1 } });
    const delta = next - baseRate;
    rows.push({ kind: 'shop', name: UPGRADES[key].name, cost, delta, payback: delta > 0 ? cost / delta : Infinity });
  }

  // staff: next hire / next training
  for (const role of Object.keys(STAFF)) {
    const [h, t] = stage.staff[role] || [0, 0];
    const staffState = makeStaff(stage.staff);
    if (h < STAFF[role].hireMax) {
      const cost = hireCost(role, staffState);
      const next = rateFor(stage, { ...base, staff: { ...stage.staff, [role]: [h + 1, t] } });
      const delta = next - baseRate;
      rows.push({ kind: 'hire', name: `${STAFF[role].name} hire`, cost, delta, payback: delta > 0 ? cost / delta : Infinity });
    }
    if (h > 0 && t < STAFF[role].trainMax) {
      const cost = trainCost(role, staffState);
      const next = rateFor(stage, { ...base, staff: { ...stage.staff, [role]: [h, t + 1] } });
      const delta = next - baseRate;
      rows.push({ kind: 'train', name: `${STAFF[role].name} train`, cost, delta, payback: delta > 0 ? cost / delta : Infinity });
    }
  }

  // research: next project on each path
  for (const [pathKey, path] of Object.entries(RESEARCH_PATHS)) {
    const nextKey = path.projects.find(k => !stage.research[k]);
    if (!nextKey) continue;
    const cost = RESEARCH[nextKey].cost;
    const next = rateFor(stage, { ...base, research: { ...stage.research, [nextKey]: true } });
    const delta = next - baseRate;
    rows.push({ kind: 'R&D', name: `${RESEARCH[nextKey].name} (${pathKey})`, cost, delta, payback: delta > 0 ? cost / delta : Infinity });
  }

  rows.sort((a, b) => a.payback - b.payback);
  console.log(`\n═══ ${name.toUpperCase()}  (income ${fmtMoney(baseRate)}/min) ═══`);
  console.log('payback   cost      Δ$/min     what');
  for (const r of rows) {
    const flag = r.payback < 0.5 ? ' ◄◄ UNDERPRICED' : r.payback > 30 && r.payback !== Infinity ? ' ◄ wall' : '';
    console.log(`${fmtMin(r.payback).padStart(7)}  ${fmtMoney(r.cost).padStart(8)}  ${fmtMoney(r.delta).padStart(9)}  [${r.kind}] ${r.name}${flag}`);
  }
}

function buyIfCandidate(property, key) {
  const candidate = expansionCandidates(property).find(plot => plot.key === key);
  if (!candidate) return false;
  buyLand(property, key, { money: Number.MAX_SAFE_INTEGER });
  return true;
}

function frontierProperty(distance) {
  const property = createPropertyState();
  for (let x = 1; x < distance; x += 1) buyIfCandidate(property, chunkKey(x, 0));
  return property;
}

console.log('\nLAND CURVE  (cost / stage income; guide: 3-10m considered, 10-30m long-arc, >30m wall)');
console.log('plot       size       area      cost      early     mid       late      endgame');
for (let distance = 1; distance <= 14; distance += 1) {
  const property = frontierProperty(distance);
  const candidate = expansionCandidates(property).find(plot => plot.key === chunkKey(distance, 0));
  if (!candidate) continue;
  const paybacks = Object.values(STAGES).map(stage => {
    const rate = rateFor(stage, { upgrades: stage.upgrades, staff: stage.staff, research: stage.research });
    return candidate.cost / Math.max(1, rate);
  });
  console.log(
    `${candidate.key.padEnd(8)} ` +
    `${`${Math.round(candidate.width)}x${Math.round(candidate.depth)}`.padStart(8)} ` +
    `${`${Math.round(candidate.area)}m2`.padStart(8)} ` +
    `${fmtMoney(candidate.cost).padStart(9)} ` +
    `${paybacks.map(v => fmtMin(v).padStart(8)).join(' ')}`
  );
}
