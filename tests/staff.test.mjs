import assert from 'node:assert/strict';
import {
  canHire,
  canTrain,
  createStaffState,
  hire,
  hireCost,
  staffPower,
  staffPowers,
  train,
  trainCost,
} from '../src/systems/staff.js';
import { STAFF } from '../src/config/gameData.js';

// fresh state has every role at zero
{
  const s = createStaffState();
  assert.deepEqual(Object.keys(s).sort(), Object.keys(STAFF).sort());
  for (const role of Object.keys(s)) {
    assert.deepEqual(s[role], { hired: 0, trained: 0 });
    assert.equal(staffPower(s[role]), 0);
  }
}

// power = hired * (1 + 0.4 * trained)
{
  assert.equal(staffPower({ hired: 3, trained: 0 }), 3);
  assert.equal(staffPower({ hired: 2, trained: 5 }), 2 * 3); // 1 + 0.4*5 = 3
  const powers = staffPowers({ a: { hired: 1, trained: 0 }, b: { hired: 0, trained: 0 } });
  assert.deepEqual(powers, { a: 1, b: 0 });
}

// hiring costs grow and require enough money; training needs a hired member first
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
  assert.ok(hireCost('operators', s) > c0, 'next hire costs more');
  assert.equal(canTrain('operators', s), true, 'can train once hired');

  const t0 = trainCost('operators', s);
  assert.equal(train('operators', s, t0), t0);
  assert.equal(s.operators.trained, 1);
  assert.ok(Math.abs(staffPower(s.operators) - 1.4) < 1e-9); // 1 * (1 + 0.4)
}

// hiring is capped at hireMax
{
  const s = createStaffState();
  for (let i = 0; i < STAFF.operators.hireMax; i++) hire('operators', s, 1e9);
  assert.equal(s.operators.hired, STAFF.operators.hireMax);
  assert.equal(canHire('operators', s), false);
  assert.equal(hire('operators', s, 1e9), 0, 'no hire past the cap');
}

console.log('staff tests passed');
