export const CURRENT_SAVE_KEY = 'tc3d_v5';
export const SAVE_KEYS = [CURRENT_SAVE_KEY, 'tc3d_v4', 'tc3d_v3'];

export function createSaveData({
  state,
  sim,
  upgrades,
  research,
  ctrlPts,
  paidLength,
  frustum,
  azimuth,
}) {
  return {
    money: state.money,
    rides: state.rides,
    queue: sim.queue,
    upgrades: Object.fromEntries(Object.entries(upgrades).map(([key, value]) => [key, value.level])),
    research: {
      budget: research.budget,
      points: research.points,
      done: { ...research.done },
    },
    ctrlPts: ctrlPts.map(point => ({ ...point })),
    paidLength,
    frustum,
    azimuth,
  };
}

export function writeSave(storage, gameState) {
  try {
    storage.setItem(CURRENT_SAVE_KEY, JSON.stringify(createSaveData(gameState)));
    return true;
  } catch (_) {
    return false;
  }
}

export function readSave(storage) {
  try {
    for (const key of SAVE_KEYS) {
      const raw = storage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {
    return null;
  }
  return null;
}

export function applySaveData(data, { state, sim, upgrades, research }) {
  const restored = {};
  if (!data) return restored;

  if (typeof data.money === 'number') state.money = data.money;
  if (typeof data.rides === 'number') state.rides = data.rides;
  if (typeof data.queue === 'number') sim.queue = data.queue;

  if (data.upgrades) {
    Object.entries(data.upgrades).forEach(([key, level]) => {
      if (key === 'capacity' && upgrades.seats) upgrades.seats.level = level;
      else if (upgrades[key]) upgrades[key].level = level;
    });
  }

  if (data.research) {
    if (typeof data.research.budget === 'number') research.budget = data.research.budget;
    if (typeof data.research.points === 'number') research.points = data.research.points;
    if (data.research.done) research.done = { ...data.research.done };
  }

  if (Array.isArray(data.ctrlPts) && data.ctrlPts.length >= 3) {
    restored.ctrlPts = data.ctrlPts.map(point => ({ seg: point.seg || 'plain', ...point }));
    if (restored.ctrlPts[0]) restored.ctrlPts[0].seg = 'station';
  }

  if (typeof data.paidLength === 'number') restored.paidLength = data.paidLength;
  if (typeof data.frustum === 'number') restored.frustum = data.frustum;
  if (typeof data.azimuth === 'number') restored.azimuth = data.azimuth;

  return restored;
}
