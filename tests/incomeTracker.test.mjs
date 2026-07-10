import assert from 'node:assert/strict';
import { createIncomeTracker } from '../src/systems/incomeTracker.js';

// Needs ~10s of observation before reporting, then averages over the window.
{
  const t = createIncomeTracker(60);
  assert.equal(t.ratePerMin(0), null, 'no data yet');
  t.record(10, 1);
  assert.equal(t.ratePerMin(2), null, 'too little signal to trust');
  for (let s = 2; s <= 12; s++) t.record(10, s);
  const rate = t.ratePerMin(12);
  // $120 over 12 observed seconds → $600/min
  assert.ok(Math.abs(rate - 600) < 1e-9, `expected 600, got ${rate}`);
}

// Old seconds fall out of the rolling window.
{
  const t = createIncomeTracker(60);
  t.record(600, 0); // one big burst at t=0
  assert.ok(t.ratePerMin(30) > 0, 'burst still inside the window');
  assert.equal(t.ratePerMin(120), 0, 'burst aged out after 60s');
}

// Multiple records in the same second accumulate; zero/negative are ignored.
{
  const t = createIncomeTracker(60);
  for (let i = 0; i < 5; i++) t.record(2, 100.2);
  t.record(0, 100.5);
  t.record(-5, 100.9);
  for (let s = 101; s <= 111; s++) t.record(1, s);
  const rate = t.ratePerMin(111);
  // $10 at t=100 + $11 over 101..111 = $21 over 12 observed seconds
  assert.ok(Math.abs(rate - (21 / 12) * 60) < 1e-9, `got ${rate}`);
}

console.log('incomeTracker tests passed');
