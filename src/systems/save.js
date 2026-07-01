export const CURRENT_SAVE_KEY = 'tc3d_v5';
export const SAVE_KEYS = [CURRENT_SAVE_KEY, 'tc3d_v4', 'tc3d_v3'];

export function createSaveData({
  state,
  sim,
  upgrades,
  research,
  staff,
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
    staff: staff ? Object.fromEntries(Object.entries(staff).map(([role, v]) => [role, { hired: v.hired, trained: v.trained }])) : {},
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

const finite = value => Number.isFinite(value);
const validPoint = point => point && finite(point.x) && finite(point.y) && finite(point.z);
const STAFF_ROLES = new Set(['operators', 'entertainers', 'mechanics', 'janitors']);

export function applySaveData(data, { state, sim, upgrades, research, staff }) {
  const restored = {};
  if (!data) return restored;

  if (finite(data.money)) state.money = data.money;
  if (finite(data.rides)) state.rides = data.rides;
  if (finite(data.queue)) sim.queue = data.queue;

  if (data.upgrades) {
    Object.entries(data.upgrades).forEach(([key, level]) => {
      if (!finite(level)) return;
      if (key === 'capacity' && upgrades.seats) upgrades.seats.level = level;       // legacy: Queue Capacity -> Roomier Cars
      else if (key === 'loading' && staff?.operators) staff.operators.hired = level; // legacy: Fast Boarding -> Ride Operators
      else if (STAFF_ROLES.has(key) && staff?.[key]) staff[key].hired = level;       // legacy: staff-as-upgrade -> hired count
      else if (upgrades[key]) upgrades[key].level = level;
    });
  }

  if (staff && data.staff) {
    Object.entries(data.staff).forEach(([role, entry]) => {
      if (!staff[role] || !entry) return;
      if (finite(entry.hired)) staff[role].hired = entry.hired;
      if (finite(entry.trained)) staff[role].trained = entry.trained;
    });
  }

  if (data.research) {
    if (finite(data.research.budget)) research.budget = data.research.budget;
    if (finite(data.research.points)) research.points = data.research.points;
    if (data.research.done) research.done = { ...data.research.done };
  }

  if (Array.isArray(data.ctrlPts) && data.ctrlPts.length >= 3 && data.ctrlPts.every(validPoint)) {
    restored.ctrlPts = data.ctrlPts.map(point => ({ seg: point.seg || 'plain', ...point }));
    if (restored.ctrlPts[0]) restored.ctrlPts[0].seg = 'station';
  }

  if (finite(data.paidLength) && data.paidLength >= 0) restored.paidLength = data.paidLength;
  if (finite(data.frustum) && data.frustum > 0) restored.frustum = data.frustum;
  if (finite(data.azimuth)) restored.azimuth = data.azimuth;

  return restored;
}
