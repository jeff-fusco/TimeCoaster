// Staff system: hire members of a role and train the whole role to make each
// member more effective. Kept separate from the upgrade shop.
//
//   power(role) = hired * (1 + 0.4 * trained)
//
// The park's economy (economy.js) reads these powers, not the raw counts, so the
// hire/train balance is expressed in one place.
import { STAFF } from '../config/gameData.js';

export function createStaffState() {
  const state = {};
  for (const role of Object.keys(STAFF)) state[role] = { hired: 0, trained: 0 };
  return state;
}

export function staffPower(entry) {
  if (!entry) return 0;
  return entry.hired * (1 + 0.4 * entry.trained);
}

// map of role -> effective power, for deriveEconomy()
export function staffPowers(state) {
  const powers = {};
  for (const role of Object.keys(state)) powers[role] = staffPower(state[role]);
  return powers;
}

export function hireCost(role, state) {
  return Math.floor(STAFF[role].hireBase * Math.pow(1.6, state[role].hired));
}

export function trainCost(role, state) {
  return Math.floor(STAFF[role].trainBase * Math.pow(1.8, state[role].trained));
}

export function canHire(role, state) {
  return state[role].hired < STAFF[role].hireMax;
}

// training a role only makes sense once at least one member is on the payroll
export function canTrain(role, state) {
  return state[role].hired > 0 && state[role].trained < STAFF[role].trainMax;
}

// Attempt a purchase against `money`; returns the amount spent (0 if it couldn't).
export function hire(role, state, money) {
  if (!canHire(role, state)) return 0;
  const cost = hireCost(role, state);
  if (money < cost) return 0;
  state[role].hired += 1;
  return cost;
}

export function train(role, state, money) {
  if (!canTrain(role, state)) return 0;
  const cost = trainCost(role, state);
  if (money < cost) return 0;
  state[role].trained += 1;
  return cost;
}
