const DEFAULT_PATH = 'track';
export const SCIENTIST_BUDGET_PCT = 7;

export function createResearchState(paths = {}) {
  return {
    fundingPct: 0,
    activePath: Object.keys(paths)[0] || DEFAULT_PATH,
    progress: {},
    done: {},
  };
}

export function normalizeResearchState(research, paths = {}) {
  if (!research.progress || typeof research.progress !== 'object') research.progress = {};
  if (!research.done || typeof research.done !== 'object') research.done = {};
  const pathKeys = Object.keys(paths);
  if (!pathKeys.includes(research.activePath)) research.activePath = pathKeys[0] || DEFAULT_PATH;
  pathKeys.forEach(path => {
    if (!Number.isFinite(research.progress[path]) || research.progress[path] < 0) research.progress[path] = 0;
  });
  research.fundingPct = Number.isFinite(research.fundingPct)
    ? Math.max(0, Math.min(100, research.fundingPct))
    : 0;
  return research;
}

export function hasScientist(staff = {}) {
  return (staff.scientists?.hired || 0) > 0;
}

export function researchFundingCap(staff = {}) {
  return Math.min(100, Math.max(0, staff.scientists?.hired || 0) * SCIENTIST_BUDGET_PCT);
}

export function clampResearchFundingPct(fundingPct = 0, staff = {}) {
  const pct = Number.isFinite(fundingPct) ? fundingPct : 0;
  return Math.max(0, Math.min(researchFundingCap(staff), pct));
}

export function scientistMultiplier(staff = {}) {
  const scientists = staff.scientists || { hired: 0, trained: 0 };
  if (!scientists.hired) return 0;
  return 1 + scientists.trained * 0.18;
}

export function fundingEfficiency(fundingPct = 0, staff = {}) {
  const pct = Math.max(0, Math.min(100, fundingPct));
  const scientists = staff.scientists || { hired: 0, trained: 0 };
  const diminishing = 1 / (1 + (pct / 100) * 0.45);
  return diminishing * (1 + scientists.trained * 0.04);
}

export function currentProjectKey(research, researchPaths = {}) {
  const path = researchPaths[research.activePath];
  if (!path) return null;
  return path.projects.find(key => !research.done?.[key]) || null;
}

export function pathProjectState(research, researchPaths = {}, projects = {}, pathKey = research.activePath) {
  const path = researchPaths[pathKey];
  if (!path) return null;
  const currentKey = path.projects.find(key => !research.done?.[key]) || null;
  const project = currentKey ? projects[currentKey] : null;
  const progress = Math.max(0, research.progress?.[pathKey] || 0);
  const cost = project?.cost || 0;
  return {
    pathKey,
    path,
    currentKey,
    project,
    progress,
    cost,
    ratio: cost > 0 ? Math.max(0, Math.min(1, progress / cost)) : 1,
    complete: !currentKey,
  };
}

export function stepResearch({
  research,
  researchPaths,
  projects,
  staff,
  spend,
  fundingPct,
}) {
  normalizeResearchState(research, researchPaths);
  if (!hasScientist(staff) || spend <= 0) return [];
  const unlocked = [];
  let progressGain = spend * scientistMultiplier(staff) * fundingEfficiency(fundingPct, staff);
  while (progressGain > 0) {
    const state = pathProjectState(research, researchPaths, projects);
    if (!state || state.complete || !state.project) break;
    const remaining = Math.max(0, state.cost - state.progress);
    if (progressGain < remaining) {
      research.progress[state.pathKey] = state.progress + progressGain;
      progressGain = 0;
      break;
    }
    research.done[state.currentKey] = true;
    unlocked.push(state.currentKey);
    progressGain -= remaining;
    research.progress[state.pathKey] = 0;
  }
  return unlocked;
}
