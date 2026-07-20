// Progression simulator: a greedy idle-player model for pacing analysis.
// Run: node tools/progression-sim.mjs
//
// The player starts broke, always saves for the purchase with the best payback
// (cost / marginal $-per-min), buys it, and repeats until nothing is left to
// buy. The output is the run's timeline: when each income decade falls, where
// the long waits (walls) sit, and when gen-1 certification unlocks.
//
// Modeling notes (v1, deliberately simple but deterministic):
//  · The coaster itself can't be "built" by the sim, so ride stats interpolate
//    through four era anchors as TRACK research completes — the same anchors
//    the balance report's stages use.
//  · Research requires a Scientist: the first project on each path folds the
//    first hire into its cost bundle.
//  · Marketing Demand is approximated as ×(1 + 0.4·marketers hired) — crude,
//    but it gives marketer hires a measurable payback for the greedy loop.
//  · Payroll (median-competence salaries) drains net income, so staffing is
//    never free.
import { deriveEconomy, upgradeCost, applyResearchEffects } from '../src/systems/economy.js';
import { hireCost, trainCost } from '../src/systems/staff.js';
import { personSalary, _makeTestPerson } from '../src/systems/staffPeople.js';
import { certificationBar } from '../src/systems/legacy.js';
import { RESEARCH, RESEARCH_PATHS, STAFF, STN, UPGRADES } from '../src/config/gameData.js';

const clone = obj => JSON.parse(JSON.stringify(obj));

// ── ride stats as a function of track-research progress ──────────────────────
const STAT_ANCHORS = [
  { p: 0.0, excitement: 22, lapTime: 10, maxSpeed: 12, length: 65 },
  { p: 0.33, excitement: 85, lapTime: 25, maxSpeed: 22, length: 300 },
  { p: 0.66, excitement: 250, lapTime: 50, maxSpeed: 55, length: 1200 },
  { p: 1.0, excitement: 427, lapTime: 67.6, maxSpeed: 78, length: 2649 },
];

export function statsForProgress(p) {
  const t = Math.max(0, Math.min(1, p));
  let a = STAT_ANCHORS[0];
  let b = STAT_ANCHORS[STAT_ANCHORS.length - 1];
  for (let i = 0; i < STAT_ANCHORS.length - 1; i++) {
    if (t >= STAT_ANCHORS[i].p && t <= STAT_ANCHORS[i + 1].p) {
      a = STAT_ANCHORS[i];
      b = STAT_ANCHORS[i + 1];
      break;
    }
  }
  const k = b.p > a.p ? (t - a.p) / (b.p - a.p) : 0;
  const lerp = (x, y) => x + (y - x) * k;
  return {
    excitement: lerp(a.excitement, b.excitement),
    lapTime: lerp(a.lapTime, b.lapTime),
    maxSpeed: lerp(a.maxSpeed, b.maxSpeed),
    length: lerp(a.length, b.length),
  };
}

// ── sim state ────────────────────────────────────────────────────────────────
function freshState() {
  const up = {};
  Object.keys(UPGRADES).forEach(k => { up[k] = 0; });
  const staff = {};
  Object.keys(STAFF).forEach(role => { staff[role] = { hired: 0, trained: 0 }; });
  return { money: 0, up, staff, research: {} };
}

const TRACK_PROJECTS = RESEARCH_PATHS.track.projects;

function trackProgress(research) {
  const done = TRACK_PROJECTS.filter(k => research[k]).length;
  return done / TRACK_PROJECTS.length;
}

function makeUpgrades(levels, research) {
  const up = clone(UPGRADES);
  Object.keys(up).forEach(k => { up[k].level = levels[k] || 0; });
  applyResearchEffects(up, research);
  return up;
}

function makeStaffView(staff) {
  const view = {};
  Object.keys(staff).forEach(role => {
    view[role] = { hired: staff[role].hired, trained: staff[role].trained };
  });
  return view;
}

function payrollFor(staff) {
  return Object.keys(STAFF).reduce((sum, role) => {
    const { hired, trained } = staff[role];
    if (!hired) return sum;
    return sum + hired * personSalary(_makeTestPerson(role), trained);
  }, 0);
}

export function netIncome(state) {
  const stats = statsForProgress(trackProgress(state.research));
  const up = makeUpgrades(state.up, state.research);
  const demandMult = 1 + 0.4 * state.staff.marketers.hired;
  const base = {
    upgrades: up,
    pathStats: stats,
    researchDone: state.research,
    staff: makeStaffView(state.staff),
    station: STN,
    demandMult,
  };
  const probe = deriveEconomy({ ...base, simQueue: 1e9 });
  const d = deriveEconomy({ ...base, simQueue: probe.queueCap });
  return { gross: d.ratePerMin, net: d.ratePerMin - payrollFor(state.staff), stats, derived: d };
}

// ── the purchase menu, with marginal payback for each option ─────────────────
function buildPurchases(state, baseNet) {
  const rows = [];
  const tryDelta = mutate => {
    const next = clone(state);
    mutate(next);
    return netIncome(next).net - baseNet;
  };

  for (const key of Object.keys(UPGRADES)) {
    const lvl = state.up[key] || 0;
    if (lvl >= UPGRADES[key].max) continue;
    const cost = upgradeCost({ ...UPGRADES[key], level: lvl });
    const delta = tryDelta(s => { s.up[key] = lvl + 1; });
    rows.push({
      kind: 'shop', name: `${UPGRADES[key].name} ${lvl + 1}`, cost, delta,
      apply: s => { s.up[key] = lvl + 1; },
    });
  }

  for (const role of Object.keys(STAFF)) {
    const entry = state.staff[role];
    const staffState = makeStaffView(state.staff);
    if (entry.hired < STAFF[role].hireMax) {
      const cost = hireCost(role, staffState);
      const delta = tryDelta(s => { s.staff[role].hired += 1; });
      rows.push({
        kind: 'hire', name: `${STAFF[role].name} hire ${entry.hired + 1}`, cost, delta,
        apply: s => { s.staff[role].hired += 1; },
      });
    }
    if (entry.hired > 0 && entry.trained < STAFF[role].trainMax) {
      const cost = trainCost(role, staffState);
      const delta = tryDelta(s => { s.staff[role].trained += 1; });
      rows.push({
        kind: 'train', name: `${STAFF[role].name} train ${entry.trained + 1}`, cost, delta,
        apply: s => { s.staff[role].trained += 1; },
      });
    }
  }

  for (const [pathKey, path] of Object.entries(RESEARCH_PATHS)) {
    const nextKey = path.projects.find(k => !state.research[k]);
    if (!nextKey) continue;
    // research needs a scientist on staff — fold the first hire into the bundle
    const needScientist = state.staff.scientists.hired === 0;
    const bundleCost = RESEARCH[nextKey].cost + (needScientist ? hireCost('scientists', makeStaffView(state.staff)) : 0);
    const delta = tryDelta(s => {
      if (needScientist) s.staff.scientists.hired = 1;
      s.research[nextKey] = true;
    });
    rows.push({
      kind: 'R&D', name: `${RESEARCH[nextKey].name} (${pathKey})`, cost: bundleCost, delta,
      apply: s => {
        if (needScientist) s.staff.scientists.hired = 1;
        s.research[nextKey] = true;
      },
    });
  }

  for (const row of rows) {
    row.payback = row.delta > 0.01 ? row.cost / row.delta : Infinity;
  }
  return rows;
}

// ── the greedy run ───────────────────────────────────────────────────────────
export function simulate({ maxMinutes = 6000, log = () => {} } = {}) {
  const state = freshState();
  let t = 0;
  const timeline = [];
  const decades = [1e3, 1e4, 1e5, 1e6, 1e7];
  const decadeTimes = {};
  const eraSnapshots = [];
  let certTime = null;

  for (let step = 0; step < 800 && t < maxMinutes; step++) {
    const { net, gross, stats, derived: d } = netIncome(state);
    if (certTime === null && stats.excitement >= certificationBar(1)) certTime = t;
    for (const dec of decades) {
      if (!(dec in decadeTimes) && net >= dec) {
        decadeTimes[dec] = t;
        eraSnapshots.push({
          t,
          gross,
          ridePct: gross > 0 ? Math.round(100 * d.ridePerMin / gross) : 0,
          concPct: gross > 0 ? Math.round(100 * d.concessions.perMin / gross) : 0,
          payrollPct: gross > 0 ? 100 * (gross - net) / gross : 0,
          excitement: stats.excitement,
        });
      }
    }

    const rows = buildPurchases(state, net);
    const buyable = rows.filter(r => Number.isFinite(r.payback));
    if (!buyable.length) break;   // nothing left improves income
    buyable.sort((a, b) => a.payback - b.payback);
    let pick = buyable[0];

    // opportunistic fill: while saving for the best item, real players grab an
    // affordable decent one instead of idling — a filler within 4× the best
    // payback always; ANY productive filler once the projected wait tops 2min.
    // Without this the sim reports phantom walls no player would sit through.
    if (state.money < pick.cost) {
      const projectedWait = net > 0 ? (pick.cost - state.money) / net : Infinity;
      const filler = buyable.find(r =>
        r.cost <= state.money && (r.payback <= pick.payback * 4 || projectedWait > 2));
      if (filler) pick = filler;
    }

    let wait = 0;
    if (state.money < pick.cost) {
      if (net <= 0) { timeline.push({ t, name: 'STUCK: no income to save with', cost: 0, wait: Infinity, net }); break; }
      wait = (pick.cost - state.money) / net;
      // advance only to the moment the next-cheapest option unlocks, then
      // re-decide — otherwise the whole save happens in one atomic wait and
      // the filler rule can never fire mid-save
      const nextAffordable = buyable
        .filter(r => r.cost > state.money)
        .reduce((min, r) => Math.min(min, (r.cost - state.money) / net), Infinity);
      if (nextAffordable < wait - 1e-9) {
        const hop = nextAffordable + 0.01;
        t += hop;
        state.money += hop * net;
        continue;
      }
    }
    t += wait;
    if (t > maxMinutes) break;
    state.money = Math.max(0, state.money + wait * net - pick.cost);
    pick.apply(state);
    const after = netIncome(state).net;
    timeline.push({ t, name: `[${pick.kind}] ${pick.name}`, cost: pick.cost, wait, net: after });
    log({ t, pick, after });
  }

  const { net, stats } = netIncome(state);
  if (certTime === null && stats.excitement >= certificationBar(1)) certTime = t;
  for (const dec of decades) {
    if (!(dec in decadeTimes) && net >= dec) decadeTimes[dec] = t;
  }
  return { timeline, decadeTimes, eraSnapshots, certTime, finalNet: net, finalState: state, minutes: t };
}

// ── report ───────────────────────────────────────────────────────────────────
const fmtMoney = v => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}k` : `$${Math.round(v)}`;
const fmtMin = m => m >= 90 ? `${(m / 60).toFixed(1)}h` : `${m.toFixed(1)}m`;

export function report(run) {
  const lines = [];
  lines.push(`GREEDY RUN — ${run.timeline.length} purchases over ${fmtMin(run.minutes)}, final ${fmtMoney(run.finalNet)}/min`);
  lines.push('');
  lines.push('INCOME DECADES (time to sustain $X/min)');
  for (const [dec, at] of Object.entries(run.decadeTimes)) {
    lines.push(`  ${fmtMoney(Number(dec)).padStart(6)}/min at ${fmtMin(at)}`);
  }
  lines.push(`  gen-1 certification (exc ${certificationBar(1)}) at ${run.certTime === null ? 'never' : fmtMin(run.certTime)}`);

  // pacing health per phase: purchases per 10min window early, per hour late —
  // dead zones show up as windows with 0 buys
  lines.push('');
  lines.push('LONGEST WAITS (the walls)');
  [...run.timeline].sort((a, b) => b.wait - a.wait).slice(0, 10).forEach(e => {
    lines.push(`  ${fmtMin(e.wait).padStart(7)} saving for ${e.name} (${fmtMoney(e.cost)}) at ${fmtMin(e.t)}`);
  });

  lines.push('');
  lines.push('ERA SNAPSHOTS (income mix + payroll share as the run passes each decade)');
  for (const snap of run.eraSnapshots) {
    lines.push(
      `  ${fmtMin(snap.t).padStart(7)}  gross ${fmtMoney(snap.gross).padStart(9)}/min` +
      `  rides ${String(snap.ridePct).padStart(3)}%  concessions ${String(snap.concPct).padStart(3)}%` +
      `  payroll ${snap.payrollPct.toFixed(1).padStart(5)}%  exc ${Math.round(snap.excitement)}`
    );
  }

  lines.push('');
  lines.push('TIMELINE (first 30 purchases)');
  run.timeline.slice(0, 30).forEach(e => {
    lines.push(`  ${fmtMin(e.t).padStart(7)}  ${fmtMoney(e.net).padStart(9)}/min  ${e.name}${e.wait > 3 ? `  (waited ${fmtMin(e.wait)})` : ''}`);
  });
  return lines.join('\n');
}

if (process.argv[1] && /progression-sim\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  console.log(report(simulate()));
}
