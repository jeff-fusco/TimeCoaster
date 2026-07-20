import assert from 'node:assert/strict';
import { simulate, statsForProgress, netIncome } from '../tools/progression-sim.mjs';

// stats interpolation: monotone through the era anchors, clamped at the ends
{
  const s0 = statsForProgress(0);
  const s5 = statsForProgress(0.5);
  const s1 = statsForProgress(1);
  assert.equal(s0.excitement, 22, 'zero progress = starter stats');
  assert.equal(s1.excitement, 427, 'full progress = endgame stats');
  assert.ok(s5.excitement > s0.excitement && s5.excitement < s1.excitement, 'interpolates between');
  assert.ok(statsForProgress(-1).excitement === 22 && statsForProgress(2).excitement === 427, 'clamps outside [0,1]');
  for (const key of ['excitement', 'lapTime', 'maxSpeed', 'length']) {
    let prev = -Infinity;
    for (let p = 0; p <= 1.001; p += 0.1) {
      const v = statsForProgress(p)[key];
      assert.ok(v >= prev - 1e-9, `${key} is monotone in progress`);
      prev = v;
    }
  }
}

// the greedy run: deterministic, bounded, and economically sane throughout
{
  const a = simulate();
  const b = simulate();
  assert.equal(JSON.stringify(a.timeline), JSON.stringify(b.timeline), 'the sim is fully deterministic');

  assert.ok(a.timeline.length > 50, `a real run makes many purchases (got ${a.timeline.length})`);
  assert.ok(Number.isFinite(a.minutes) && a.minutes > 30, 'the run spans real time');
  assert.ok(Number.isFinite(a.finalNet) && a.finalNet > 0, 'ends with positive income');

  let prevT = 0;
  for (const e of a.timeline) {
    assert.ok(Number.isFinite(e.t) && e.t >= prevT - 1e-9, 'time only moves forward');
    assert.ok(Number.isFinite(e.net), `income is always finite (${e.name})`);
    assert.ok(e.cost >= 0 && Number.isFinite(e.cost), 'costs are sane');
    prevT = e.t;
  }

  // income decades arrive in order, and certification unlocks inside the run
  const decs = Object.entries(a.decadeTimes).map(([d, t]) => [Number(d), t]).sort((x, y) => x[0] - y[0]);
  assert.ok(decs.length >= 4, 'the run crosses at least four income decades');
  for (let i = 1; i < decs.length; i++) {
    assert.ok(decs[i][1] >= decs[i - 1][1] - 1e-9, 'bigger decades take longer');
  }
  assert.ok(a.certTime !== null && a.certTime < 90, `gen-1 certification within 90min (got ${a.certTime?.toFixed(1)}m)`);
  assert.equal(a.eraSnapshots.length, decs.length, 'one era snapshot per decade crossed');
  for (const snap of a.eraSnapshots) {
    assert.ok(snap.payrollPct >= 0 && snap.payrollPct <= 100, 'payroll share is a sane percentage');
    assert.ok(snap.ridePct + snap.concPct <= 101, 'income mix shares add up');
  }
}

// netIncome on a fresh state: the starter park earns something and pays nobody
{
  const up = {};
  const staff = {};
  for (const k of ['car', 'seats', 'speed', 'train', 'queue', 'snacks', 'canopy', 'foodCourt', 'comfort', 'turnstiles', 'hats', 'balloons', 'express', 'ticket', 'hype']) up[k] = 0;
  for (const r of ['operators', 'entertainers', 'mechanics', 'janitors', 'photographers', 'scientists', 'marketers']) staff[r] = { hired: 0, trained: 0 };
  const fresh = netIncome({ money: 0, up, staff, research: {} });
  assert.ok(fresh.gross > 0, 'a bare starter park still sells tickets');
  assert.equal(fresh.gross, fresh.net, 'no staff → no payroll');
}

console.log('progression tests passed');
