export const CURRENT_SAVE_KEY = 'tc3d_v5';
export const SAVE_KEYS = [CURRENT_SAVE_KEY, 'tc3d_v4', 'tc3d_v3'];

export function createSaveData({
  state,
  sim,
  upgrades,
  research,
  staff,
  maintenance,
  property,
  decorations,
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
      fundingPct: research.fundingPct,
      points: research.points,
      done: { ...research.done },
    },
    staff: staff ? Object.fromEntries(Object.entries(staff).map(([role, v]) => [role, { hired: v.hired, trained: v.trained }])) : {},
    maintenance: maintenance ? {
      installed: { ...maintenance.installed },
      queue: maintenance.queue.map(job => ({ ...job })),
      current: maintenance.current ? { ...maintenance.current } : null,
    } : undefined,
    property: property ? {
      chunkSize: property.chunkSize,
      baseCost: property.baseCost,
      growth: property.growth,
      distanceScale: property.distanceScale,
      owned: [...property.owned],
    } : undefined,
    decorations: Array.isArray(decorations) ? decorations.map(d => ({ ...d })) : [],
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
const INSTALL_TYPES = new Set(['car', 'train']);

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
    if (finite(data.research.fundingPct)) research.fundingPct = Math.max(0, Math.min(100, data.research.fundingPct));
    else if (finite(data.research.budget)) research.fundingPct = Math.max(0, Math.min(80, Math.round(data.research.budget / 10)));
    if (finite(data.research.points)) research.points = data.research.points;
    if (data.research.done) research.done = { ...data.research.done };
  }

  if (data.maintenance?.installed) {
    const queue = Array.isArray(data.maintenance.queue)
      ? data.maintenance.queue.filter(job => INSTALL_TYPES.has(job?.type) && finite(job.duration)).map(job => ({ type: job.type, duration: job.duration }))
      : [];
    const current = data.maintenance.current;
    restored.maintenance = {
      installed: {
        car: finite(data.maintenance.installed.car) ? data.maintenance.installed.car : 0,
        train: finite(data.maintenance.installed.train) ? data.maintenance.installed.train : 0,
      },
      queue,
      current: INSTALL_TYPES.has(current?.type) && finite(current.duration) && finite(current.progress)
        ? { type: current.type, duration: current.duration, progress: current.progress }
        : null,
    };
  }

  if (data.property && Array.isArray(data.property.owned)) {
    restored.property = {
      chunkSize: finite(data.property.chunkSize) ? data.property.chunkSize : undefined,
      baseCost: finite(data.property.baseCost) ? data.property.baseCost : undefined,
      growth: finite(data.property.growth) ? data.property.growth : undefined,
      distanceScale: finite(data.property.distanceScale) ? data.property.distanceScale : undefined,
      owned: data.property.owned.filter(key => typeof key === 'string'),
    };
  }

  if (Array.isArray(data.decorations)) {
    restored.decorations = data.decorations.filter(
      d => d && typeof d.type === 'string' && finite(d.x) && finite(d.z),
    ).map(d => ({ type: d.type, x: d.x, z: d.z }));
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
