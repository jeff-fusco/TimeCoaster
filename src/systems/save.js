import { createLegacyState, normalizeLegacy } from './legacy.js?v=20260703-13';
import { createMarketingState, normalizeMarketingState } from './marketing.js?v=20260703-13';
import { migrateCountsToRoster, normalizeRoster } from './staffPeople.js?v=20260703-13';

// v6 nests the park into { legacy, active }. `active` is the v5 flat shape (the
// current coaster + park); `legacy` holds Fame, perks, generation and the
// retired-coaster monuments that persist across generations. Older flat saves
// are migrated by wrapping them as `active` with a fresh legacy.
export const CURRENT_SAVE_KEY = 'tc3d_v6';
export const SAVE_KEYS = [CURRENT_SAVE_KEY, 'tc3d_v5', 'tc3d_v4', 'tc3d_v3'];
export const SAVE_VERSION = 6;

// Build the flat "active coaster" payload (v5 shape + biome).
function createActiveData({
  state, sim, upgrades, research, staff, roster, marketing, maintenance, property, decorations, ctrlPts, paidLength, frustum, azimuth, biome,
}) {
  return {
    money: state.money,
    rides: state.rides,
    queue: sim.queue,
    plaza: sim.plaza,
    biome: typeof biome === 'string' ? biome : 'meadow',
    upgrades: Object.fromEntries(Object.entries(upgrades).map(([key, value]) => [key, value.level])),
    research: {
      fundingPct: research.fundingPct,
      activePath: research.activePath,
      progress: { ...research.progress },
      done: { ...research.done },
    },
    // staff v2: the roster of individuals is the source of truth (each member
    // is just { seed, level } — the person re-derives from the seed on load).
    // The aggregate counts are still written for back-compat / older readers.
    roster: roster ? Object.fromEntries(Object.entries(roster).map(
      ([role, members]) => [role, (members || []).map(m => ({
        seed: m.seed, level: m.level,
        ...(Number.isFinite(m.gen) ? { gen: m.gen } : {}),   // tenure clock
      }))])) : undefined,
    staff: staff ? Object.fromEntries(Object.entries(staff).map(([role, v]) => [role, { hired: v.hired, trained: v.trained }])) : {},
    marketing: marketing ? {
      fundingPct: marketing.fundingPct,
      channels: Object.fromEntries(Object.entries(marketing.channels || {}).map(
        ([key, c]) => [key, { weight: c.weight, demand: c.demand }])),
    } : createMarketingState(),
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
      sizeGrowth: property.sizeGrowth,
      farGrowth: property.farGrowth,
      owned: [...property.owned],
    } : undefined,
    decorations: Array.isArray(decorations) ? decorations.map(d => ({ ...d })) : [],
    ctrlPts: ctrlPts.map(point => ({ ...point })),
    paidLength,
    frustum,
    azimuth,
  };
}

export function createSaveData(gameState) {
  const { legacy, savedAt, lastRate, lastActiveRate, lastLegacyRate } = gameState;
  return {
    version: SAVE_VERSION,
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    lastRate: Number.isFinite(lastRate) ? lastRate : 0,
    lastActiveRate: Number.isFinite(lastActiveRate) ? lastActiveRate : undefined,
    lastLegacyRate: Number.isFinite(lastLegacyRate) ? lastLegacyRate : undefined,
    legacy: legacy ? {
      fame: legacy.fame,
      generation: legacy.generation,
      perks: { ...legacy.perks },
      capstone: legacy.capstone ? { ...legacy.capstone } : null,
      monuments: (legacy.monuments || []).map(m => ({
        ...m,
        stats: { ...m.stats },
        ctrlPts: m.ctrlPts.map(p => ({ ...p })),
        decorations: (m.decorations || []).map(d => ({ ...d })),
      })),
    } : createLegacyState(),
    active: createActiveData(gameState),
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

// Normalize any stored shape into v6 { version, savedAt, lastRate, legacy, active }.
// A flat v5 save (no `active` field) becomes the active coaster with fresh legacy.
export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.active && typeof raw.active === 'object') {
    return {
      version: SAVE_VERSION,
      savedAt: raw.savedAt,
      lastRate: raw.lastRate,
      lastActiveRate: raw.lastActiveRate,
      lastLegacyRate: raw.lastLegacyRate,
      legacy: raw.legacy || createLegacyState(),
      active: raw.active,
    };
  }
  // pre-v6 flat save: the whole thing is the active coaster
  return {
    version: SAVE_VERSION,
    savedAt: raw.savedAt,
    lastRate: raw.lastRate,
    lastActiveRate: raw.lastActiveRate,
    lastLegacyRate: raw.lastLegacyRate,
    legacy: createLegacyState(),
    active: raw,
  };
}

const finite = value => Number.isFinite(value);
const validPoint = point => point && finite(point.x) && finite(point.y) && finite(point.z);
const STAFF_ROLES = new Set(['operators', 'entertainers', 'mechanics', 'janitors', 'photographers', 'scientists', 'marketers']);
const INSTALL_TYPES = new Set(['car', 'train']);

// Apply the active-coaster payload into the live objects; returns the parts
// that the caller reconstructs itself (maintenance/property/decor/ctrlPts/...).
function applyActiveData(data, { state, sim, upgrades, research }) {
  const restored = {};
  if (!data) return restored;

  if (finite(data.money)) state.money = data.money;
  if (finite(data.rides)) state.rides = data.rides;
  if (finite(data.queue)) sim.queue = data.queue;
  if (finite(data.plaza)) sim.plaza = data.plaza;   // absent in older saves → refills live
  if (typeof data.biome === 'string') restored.biome = data.biome;   // active coaster's biome

  // Staff v2 folds old counter saves into a roster of generated people. Collect
  // whatever headcounts the save implies (legacy upgrade remaps + data.staff),
  // then either restore the modern roster or migrate the counts into people.
  const staffCounts = {};
  for (const role of STAFF_ROLES) staffCounts[role] = { hired: 0, trained: 0 };

  if (data.upgrades) {
    Object.entries(data.upgrades).forEach(([key, level]) => {
      if (!finite(level)) return;
      if (key === 'capacity' && upgrades.seats) upgrades.seats.level = level;       // legacy: Queue Capacity -> Roomier Cars
      else if (key === 'loading') staffCounts.operators.hired = level;              // legacy: Fast Boarding -> Ride Operators
      else if (key === 'market') {
        // legacy flat Marketing upgrade -> durable Broadcast presence
        restored.marketing = createMarketingState();
        restored.marketing.channels.broadcast.demand = Math.max(0, Math.floor(level)) * 8;
      }
      else if (STAFF_ROLES.has(key)) staffCounts[key].hired = level;                // legacy: staff-as-upgrade -> hired count
      else if (upgrades[key]) upgrades[key].level = level;
    });
  }

  if (data.staff) {
    Object.entries(data.staff).forEach(([role, entry]) => {
      if (!staffCounts[role] || !entry) return;
      if (finite(entry.hired)) staffCounts[role].hired = entry.hired;
      if (finite(entry.trained)) staffCounts[role].trained = entry.trained;
    });
  }

  restored.roster = data.roster
    ? normalizeRoster(data.roster)
    : migrateCountsToRoster(staffCounts);

  if (data.research) {
    if (!research.progress || typeof research.progress !== 'object') research.progress = {};
    if (!research.done || typeof research.done !== 'object') research.done = {};
    if (finite(data.research.fundingPct)) research.fundingPct = Math.max(0, Math.min(100, data.research.fundingPct));
    else if (finite(data.research.budget)) research.fundingPct = Math.max(0, Math.min(80, Math.round(data.research.budget / 10)));
    if (typeof data.research.activePath === 'string') research.activePath = data.research.activePath;
    if (data.research.progress && typeof data.research.progress === 'object') {
      Object.entries(data.research.progress).forEach(([path, progress]) => {
        if (finite(progress)) research.progress[path] = Math.max(0, progress);
      });
    } else if (finite(data.research.points)) {
      const path = typeof research.activePath === 'string' ? research.activePath : 'track';
      research.progress[path] = Math.max(0, data.research.points * 10);
    }
    if (data.research.done) research.done = { ...data.research.done };
  }

  if (data.marketing && typeof data.marketing === 'object') {
    const normalized = normalizeMarketingState(data.marketing);
    // keep whichever Broadcast presence is stronger: the saved portfolio
    // (normalizeMarketingState migrates v1 scalar demand there) or a
    // just-migrated `market` upgrade seed
    const seeded = restored.marketing?.channels?.broadcast?.demand || 0;
    normalized.channels.broadcast.demand = Math.max(normalized.channels.broadcast.demand, seeded);
    restored.marketing = normalized;
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
      sizeGrowth: finite(data.property.sizeGrowth) ? data.property.sizeGrowth : undefined,
      farGrowth: finite(data.property.farGrowth) ? data.property.farGrowth : undefined,
      owned: data.property.owned.filter(key => typeof key === 'string'),
    };
  }

  if (Array.isArray(data.decorations)) {
    restored.decorations = data.decorations.filter(
      d => d && typeof d.type === 'string' && finite(d.x) && finite(d.z),
    ).map(d => ({
      type: d.type,
      x: d.x,
      z: d.z,
      // stacking height and rotation from the decor construction kit
      ...(finite(d.y) ? { y: d.y } : {}),
      ...(finite(d.rot) ? { rot: d.rot } : {}),
    }));
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

export function applySaveData(raw, ctx) {
  const migrated = migrateSave(raw);
  if (!migrated) return {};
  const restored = applyActiveData(migrated.active, ctx);
  // metadata for offline progress: when the save was written and the $/min the
  // park was earning at that moment (measured if available, else projected)
  if (finite(migrated.savedAt) && migrated.savedAt > 0) restored.savedAt = migrated.savedAt;
  if (finite(migrated.lastRate) && migrated.lastRate >= 0) restored.lastRate = migrated.lastRate;
  if (finite(migrated.lastActiveRate) && migrated.lastActiveRate >= 0) restored.lastActiveRate = migrated.lastActiveRate;
  if (finite(migrated.lastLegacyRate) && migrated.lastLegacyRate >= 0) restored.lastLegacyRate = migrated.lastLegacyRate;
  restored.legacy = normalizeLegacy(migrated.legacy);
  return restored;
}
