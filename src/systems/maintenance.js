import { STAFF_FX } from './economy.js';

export const INSTALL_TIMES = {
  car: 8,
  train: 12,
};

export function createMaintenanceState(installed = {}) {
  return {
    installed: {
      car: installed.car ?? 0,
      train: installed.train ?? 0,
    },
    queue: [],
    current: null,
  };
}

export function enqueueInstall(state, type) {
  if (!INSTALL_TIMES[type]) return false;
  state.queue.push({ type, duration: INSTALL_TIMES[type] });
  return true;
}

// hired mechanics work the install queue; speed comes from headcount
export function installSpeed(mechanicsHired = 0) {
  return 1 + mechanicsHired * STAFF_FX.mechanicInstall;
}

export function pendingCount(state, type) {
  return state.queue.filter(job => job.type === type).length + (state.current?.type === type ? 1 : 0);
}

export function stepMaintenance(state, dt, mechanics = 0, onInstall = () => {}) {
  let completed = 0;
  let remaining = Math.max(0, dt) * installSpeed(mechanics);

  while (remaining > 0) {
    if (!state.current) {
      const next = state.queue.shift();
      if (!next) break;
      state.current = { ...next, progress: 0 };
    }

    const job = state.current;
    const needed = Math.max(0, job.duration - job.progress);
    const work = Math.min(remaining, needed);
    job.progress += work;
    remaining -= work;

    if (job.progress < job.duration) break;

    state.installed[job.type] += 1;
    state.current = null;
    completed += 1;
    onInstall(job.type, state.installed[job.type]);
  }

  return completed;
}
