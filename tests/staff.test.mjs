import assert from 'node:assert/strict';
import {
  canHire,
  canTrain,
  createStaffState,
  hire,
  hireCost,
  staffStatus,
  train,
  trainCost,
} from '../src/systems/staff.js';
import { STAFF, STAFF_ORDER } from '../src/config/gameData.js';

// fresh state has every role at zero — including photographers and scientists
{
  const s = createStaffState();
  assert.deepEqual(Object.keys(s).sort(), Object.keys(STAFF).sort());
  assert.ok(STAFF_ORDER.includes('photographers'));
  assert.ok(STAFF_ORDER.includes('scientists'));
  assert.ok(STAFF_ORDER.includes('marketers'));
  assert.equal(STAFF_ORDER.length, 7);
  for (const role of Object.keys(s)) {
    assert.deepEqual(s[role], { hired: 0, trained: 0 });
  }
}

// hiring costs grow per-role and require enough money; training needs a hire first
{
  const s = createStaffState();
  assert.equal(canTrain('operators', s), false, 'cannot train with nobody hired');

  const c0 = hireCost('operators', s);
  assert.equal(c0, STAFF.operators.hireBase);
  assert.equal(hire('operators', s, c0 - 1), 0, 'too little money -> no hire');
  assert.equal(s.operators.hired, 0);

  const spent = hire('operators', s, c0);
  assert.equal(spent, c0);
  assert.equal(s.operators.hired, 1);
  assert.equal(hireCost('operators', s), Math.floor(c0 * STAFF.operators.hireGrowth), 'per-role growth');
  assert.equal(canTrain('operators', s), true, 'can train once hired');

  const t0 = trainCost('operators', s);
  assert.equal(t0, STAFF.operators.trainBase);
  assert.equal(train('operators', s, t0), t0);
  assert.equal(s.operators.trained, 1);
  assert.equal(trainCost('operators', s), Math.floor(t0 * STAFF.operators.trainGrowth));
}

// staff should be a long-arc sink: maxing any role's hires costs well into
// five figures, so it cannot be bought out in one early-game session
{
  for (const role of STAFF_ORDER) {
    const s = createStaffState();
    let total = 0;
    while (canHire(role, s)) total += hire(role, s, 1e12);
    assert.equal(s[role].hired, STAFF[role].hireMax);
    assert.ok(total > 25000, `${role} full hire arc costs $${total} (> $25k)`);
    assert.ok(hire(role, s, 1e12) === 0, 'no hire past the cap');
  }
}

// status lines: hire and train drive different, visible numbers
{
  const s = createStaffState();
  assert.match(staffStatus('operators', s.operators), /dispatch trains yourself/i);

  s.operators.hired = 2;
  const hiredOnly = staffStatus('operators', s.operators);
  assert.match(hiredOnly, /Boarding \+36%/, 'hires drive modest boarding speed');
  assert.match(hiredOnly, /3\.0s/, 'untrained crews launch at the base delay');

  s.operators.trained = 2;
  assert.match(staffStatus('operators', s.operators), /1\.2s/, 'training shortens the launch delay');

  s.entertainers = { hired: 3, trained: 2 };
  const ent = staffStatus('entertainers', s.entertainers);
  assert.match(ent, /\+15%/, 'hires lightly drive arrivals');
  assert.match(ent, /\+16\b/, 'training adds stronger queue capacity');

  s.photographers = { hired: 2, trained: 1 };
  assert.match(staffStatus('photographers', s.photographers), /\$6 photo sales/, '2 * 1.5 * 2.0 = $6');

  assert.match(staffStatus('scientists', s.scientists), /R&D Lab locked/i);
  s.scientists = { hired: 2, trained: 2 };
  assert.match(staffStatus('scientists', s.scientists), /budget up to 14%/, 'scientists raise the R&D budget cap');
  assert.match(staffStatus('scientists', s.scientists), /efficiency ×1\.36/, 'training improves research efficiency');
  assert.match(staffStatus('marketers', s.marketers), /Marketing HQ locked/i);
  s.marketers = { hired: 2, trained: 2 };
  assert.match(staffStatus('marketers', s.marketers), /budget up to 12%/, 'marketers raise the campaign budget cap');
  assert.match(staffStatus('marketers', s.marketers), /efficiency x1\.23/, 'training improves campaign efficiency after budget drag');
}

console.log('staff tests passed');
