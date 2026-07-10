import assert from 'node:assert/strict';
import { computeOfflineProgress, formatDuration, OFFLINE_CAP_SEC, OFFLINE_EFFICIENCY } from '../src/systems/offline.js';
import { createResearchState } from '../src/systems/research.js';
import { RESEARCH, RESEARCH_PATHS } from '../src/config/gameData.js';

const noResearch = () => createResearchState(RESEARCH_PATHS);

// short/no absences earn nothing
{
  const r = computeOfflineProgress({ awaySeconds: 5, rate: 600, research: noResearch(), researchPaths: RESEARCH_PATHS, projects: RESEARCH });
  assert.equal(r.money, 0, 'under the min-seconds floor: nothing');
  const z = computeOfflineProgress({ awaySeconds: 3600, rate: 0, research: noResearch(), researchPaths: RESEARCH_PATHS, projects: RESEARCH });
  assert.equal(z.money, 0, 'no rate: nothing');
}

// steady earning at the discounted rate
{
  const r = computeOfflineProgress({ awaySeconds: 600, rate: 600, research: noResearch(), researchPaths: RESEARCH_PATHS, projects: RESEARCH });
  // 600 $/min = 10 $/s, × 600s × 0.5 efficiency = 3000
  assert.ok(Math.abs(r.money - 3000) < 1e-6, `expected 3000, got ${r.money}`);
  assert.equal(r.activeGross, 3000);
  assert.equal(r.legacyGross, 0);
  assert.equal(r.seconds, 600);
  assert.equal(r.researchSpent, 0, 'no scientist funding → all to money');
}

{
  const r = computeOfflineProgress({
    awaySeconds: 600,
    activeRate: 600,
    legacyRate: 120,
    research: noResearch(),
    researchPaths: RESEARCH_PATHS,
    projects: RESEARCH,
  });
  assert.ok(Math.abs(r.activeGross - 3000) < 1e-6, 'active coaster is discounted');
  assert.ok(Math.abs(r.legacyGross - 1200) < 1e-6, 'monument income is full-rate');
  assert.ok(Math.abs(r.money - 4200) < 1e-6);
}

// payroll is netted out of what the park banks while away
{
  const r = computeOfflineProgress({
    awaySeconds: 600, activeRate: 600, payrollPerMin: 120,
    research: noResearch(), researchPaths: RESEARCH_PATHS, projects: RESEARCH,
  });
  // gross 3000, payroll 120 $/min × 600s = 1200, net 1800
  assert.ok(Math.abs(r.payroll - 1200) < 1e-6, `payroll ${r.payroll}`);
  assert.ok(Math.abs(r.money - 1800) < 1e-6, `net after wages ${r.money}`);

  // wages never make the welcome-back negative — an idle park breaks even
  const broke = computeOfflineProgress({
    awaySeconds: 600, activeRate: 100, payrollPerMin: 9999,
    research: noResearch(), researchPaths: RESEARCH_PATHS, projects: RESEARCH,
  });
  assert.equal(broke.money, 0, 'payroll cannot bank a loss');
}

// away time is capped
{
  const r = computeOfflineProgress({ awaySeconds: 100 * 3600, rate: 60, research: noResearch(), researchPaths: RESEARCH_PATHS, projects: RESEARCH });
  assert.equal(r.seconds, OFFLINE_CAP_SEC, 'capped to 8h');
  assert.equal(r.cappedFrom, 100 * 3600);
  // 60 $/min = 1 $/s × 8h × 0.5
  assert.ok(Math.abs(r.money - (1 * OFFLINE_CAP_SEC * OFFLINE_EFFICIENCY)) < 1e-6);
}

// with a funded scientist, a slice of income becomes research progress and can unlock
{
  const research = noResearch();
  research.activePath = 'track';
  research.fundingPct = 50;
  const staff = { scientists: { hired: 2, trained: 1 } };
  // long enough + high rate to blow past the first track project (Block Brakes, $600)
  const r = computeOfflineProgress({
    awaySeconds: OFFLINE_CAP_SEC, rate: 100000,
    research, researchPaths: RESEARCH_PATHS, projects: RESEARCH, staff,
  });
  assert.ok(r.researchSpent > 0, 'scientist funding diverts income to research');
  assert.ok(Math.abs((r.money + r.researchSpent) - r.gross) < 1e-6, 'money + research = gross');
  assert.ok(r.unlocked.includes('brakes'), 'unlocked the first track project offline');
  assert.equal(research.done.brakes, true, 'research state mutated');
}

// duration formatting
{
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(600), '10m');
  assert.equal(formatDuration(3660), '1h 1m');
  assert.equal(formatDuration(7200), '2h');
}

console.log('offline tests passed');
