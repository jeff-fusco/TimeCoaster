// Staff system: hiring adds bodies (coverage), training raises the whole
// role's skill (a different effect per role — see STAFF_FX in economy.js).
// Kept separate from the upgrade shop: costs climb steeply per role so staff
// is a long-arc investment, not a one-session buyout.
import { STAFF, STN } from '../config/gameData.js?v=20260703-14';
import { STAFF_FX } from './economy.js?v=20260703-14';
import { campaignEfficiency, marketingBudgetCap } from './marketing.js?v=20260703-14';
import { researchFundingCap } from './research.js?v=20260703-14';

export function createStaffState() {
  const state = {};
  for (const role of Object.keys(STAFF)) state[role] = { hired: 0, trained: 0 };
  return state;
}

export function hireCost(role, state) {
  const cfg = STAFF[role];
  return Math.floor(cfg.hireBase * Math.pow(cfg.hireGrowth, state[role].hired));
}

export function trainCost(role, state) {
  const cfg = STAFF[role];
  return Math.floor(cfg.trainBase * Math.pow(cfg.trainGrowth, state[role].trained));
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

const pct = v => `${Math.round(v * 100)}%`;

// One live status line per role showing what the current crew actually does —
// pure math over STAFF_FX so the panel, balance and tests stay in sync.
export function staffStatus(role, entry) {
  const FX = STAFF_FX;
  const { hired, trained } = entry;
  switch (role) {
    case 'operators': {
      if (!hired) return 'No crew — dispatch trains yourself';
      const delay = Math.max(0.3, (STN.baseDispatch ?? 3) / (1 + FX.operatorLaunch * trained));
      return `Boarding +${pct(FX.operatorBoard * hired)} faster · auto-launch after ${delay.toFixed(1)}s`;
    }
    case 'entertainers': {
      if (!hired) return 'No shows scheduled';
      return `Guest arrivals +${pct(FX.entertainArrive * hired)} · queue capacity +${FX.entertainQueue * trained}`;
    }
    case 'mechanics': {
      if (!hired) return 'Installs crawl along unassisted';
      return `Installs +${pct(FX.mechanicInstall * hired)} faster · ride income +${pct(FX.mechanicIncome * trained)}`;
    }
    case 'janitors': {
      if (!hired) return 'Litter is piling up out there';
      return `Snack sales +${pct(FX.janitorSnack * hired)} · park appeal +${pct(FX.janitorAppeal * trained)}`;
    }
    case 'photographers': {
      if (!hired) return 'No photo booth crew yet';
      const base = hired * FX.photoBase * (1 + FX.photoSkill * trained);
      return `~$${Math.round(base)} photo sales per launch · scales with excitement`;
    }
    case 'scientists': {
      if (!hired) return 'R&D Lab locked';
      const efficiency = 1 + FX.scientistSkill * trained;
      return `R&D budget up to ${researchFundingCap({ scientists: entry })}% · efficiency ×${efficiency.toFixed(2)}`;
    }
    case 'marketers': {
      if (!hired) return 'Marketing HQ locked';
      return `Campaign budget up to ${marketingBudgetCap({ marketers: entry })}% - efficiency x${campaignEfficiency(12, { marketers: entry }).toFixed(2)}`;
    }
    default:
      return '';
  }
}
