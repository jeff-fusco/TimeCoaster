// Offline progress: while the tab is closed the park keeps earning at a
// capped, discounted rate. Pure and testable — it mirrors the live tick's
// steady-state (income accrues, and if research funding is set, Scientists
// keep converting a slice of it into research progress).
import {
  clampResearchFundingPct,
  hasScientist,
  pathProjectState,
  stepResearch,
} from './research.js?v=20260703-14';

export const OFFLINE_CAP_SEC = 8 * 3600;   // never credit more than 8 hours away
export const OFFLINE_EFFICIENCY = 0.5;     // the park runs at half pace unattended
export const OFFLINE_MIN_SEC = 30;         // ignore blips (refreshes, quick tab-outs)

// awaySeconds: wall-clock time since the save was written.
// rate: legacy fallback for $/min the park was earning at save time.
// activeRate: active coaster $/min, credited at unattended efficiency.
// legacyRate: monument $/min, credited at full rate ("the classics" never sleep).
// Mutates `research` (progress/done) exactly like the live loop would.
export function computeOfflineProgress({
  awaySeconds,
  rate,
  activeRate,
  legacyRate = 0,
  research,
  researchPaths = {},
  projects = {},
  staff = {},
  payrollPerMin = 0,   // wage bill ($/min) — netted out of what the park banks
  capSeconds = OFFLINE_CAP_SEC,
  efficiency = OFFLINE_EFFICIENCY,
  minSeconds = OFFLINE_MIN_SEC,
}) {
  const rawSeconds = Math.max(0, Math.floor(awaySeconds || 0));
  const seconds = Math.min(capSeconds, rawSeconds);
  const empty = { seconds, cappedFrom: rawSeconds, gross: 0, activeGross: 0, legacyGross: 0, money: 0, researchSpent: 0, unlocked: [] };
  const activePerSec = Math.max(0, Number.isFinite(activeRate) ? activeRate : (rate || 0)) / 60;
  const legacyPerSec = Math.max(0, legacyRate || 0) / 60;
  if (seconds < minSeconds || activePerSec + legacyPerSec <= 0) return empty;

  const activeGross = activePerSec * seconds * efficiency;
  const legacyGross = legacyPerSec * seconds;
  const gross = activeGross + legacyGross;
  let researchSpent = 0;
  let unlocked = [];

  const fundingPct = research ? clampResearchFundingPct(research.fundingPct || 0, staff) : 0;
  const active = research ? pathProjectState(research, researchPaths, projects) : null;
  if (fundingPct > 0 && hasScientist(staff) && active && !active.complete) {
    researchSpent = activeGross * fundingPct / 100;
    unlocked = stepResearch({ research, researchPaths, projects, staff, spend: researchSpent, fundingPct });
  }

  // Payroll runs the whole time the park is open, at full rate (staff don't
  // work half-shifts while you're away). Never let wages turn the welcome-back
  // negative — an idle park at worst breaks even.
  const payroll = Math.max(0, payrollPerMin) / 60 * seconds;
  const money = Math.max(0, gross - researchSpent - payroll);

  return {
    seconds,
    cappedFrom: rawSeconds,
    gross,
    activeGross,
    legacyGross,
    payroll,
    money,
    researchSpent,
    unlocked,
  };
}

// "2h 14m", "9m", "45s" — compact away-time label for the welcome-back card.
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
