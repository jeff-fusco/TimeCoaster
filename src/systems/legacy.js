// Legacy ascension: retire the active coaster into a standing monument, bank
// Fame scaled by how good it was, and start the next generation fresh. Pure and
// testable — retired coasters render as snowglobe trophies (render/snowglobe.js)
//
// Design (see ROADMAP.md): building quality is the prestige currency. Fame
// scales superlinearly with effective excitement (path excitement + decor
// theming), so over-building before retiring is the optimization. Research and
// staff persist across generations; money, shop upgrades and the track reset.

export const PERKS = {
  nestEgg:   { name: 'Nest Egg',  icon: '🥚', desc: 'Bigger grant when a new coaster opens', baseCost: 5, growth: 1.7, max: 8 },
  landmarks: { name: 'Landmarks', icon: '🏛️', desc: 'Retired coasters draw more tourists ($)', baseCost: 6, growth: 1.8, max: 8 },
  renown:    { name: 'Renown',    icon: '⭐', desc: 'Your reputation pulls more guests', baseCost: 8, growth: 1.9, max: 8 },
};
export const PERK_ORDER = ['nestEgg', 'landmarks', 'renown'];

export function createLegacyState() {
  return { fame: 0, generation: 1, perks: {}, monuments: [], capstone: null };
}

const lvl = (perks, key) => Math.max(0, Math.floor(perks?.[key] || 0));
export const nestEggMult   = perks => 1 + 0.6 * lvl(perks, 'nestEgg');
export const landmarksMult = perks => 1 + 0.3 * lvl(perks, 'landmarks');
export const renownMult     = perks => 1 + 0.08 * lvl(perks, 'renown');

// Park reputation combines what the player has banked, the history visible in
// the park, and the quality of today's headline ride. Each source is capped so
// no single axis can carry a park to five stars on its own.
export function parkRating(fame = 0, retiredCount = 0, excitement = 0) {
  const fameStars = Math.min(1.5, Math.max(0, fame) / 40);
  const historyStars = Math.min(1.25, Math.max(0, retiredCount) * 0.35);
  const rideStars = Math.min(1.25, Math.max(0, excitement) / 160);
  const raw = 1 + fameStars + historyStars + rideStars;
  return Math.max(1, Math.min(5, Math.round(raw * 2) / 2));
}

export function ratingDemandMult(rating) {
  return 0.92 + Math.max(1, Math.min(5, rating || 1)) * 0.04;
}

export function perkCost(key, level) {
  const p = PERKS[key];
  if (!p) return Infinity;
  return Math.floor(p.baseCost * Math.pow(p.growth, level));
}

export function canBuyPerk(legacy, key) {
  const p = PERKS[key];
  if (!p) return false;
  const level = lvl(legacy.perks, key);
  return level < p.max && legacy.fame >= perkCost(key, level);
}

// Spend Fame on the next level of a perk. Returns the cost paid, or 0.
export function buyPerk(legacy, key) {
  if (!canBuyPerk(legacy, key)) return 0;
  const level = lvl(legacy.perks, key);
  const cost = perkCost(key, level);
  legacy.fame -= cost;
  legacy.perks[key] = level + 1;
  return cost;
}

// Effective excitement is what the economy and the certification bar both use.
export function effectiveExcitement(stats, themeBonus = 0) {
  return Math.max(0, (stats?.excitement || 0) + (themeBonus || 0));
}

export const MONUMENT_NEAR_MISS_RADIUS = 4.2;
export const MONUMENT_NEAR_MISS_CAP = 28;

// Bonus for new track weaving close to retired coaster track. This is the
// "thread through your own history" reward: close passes pay, but repeated
// sampling and multiple monuments have hard diminishing returns.
export function monumentNearMissBonus(activePts, monumentPaths, {
  radius = MONUMENT_NEAR_MISS_RADIUS,
  cap = MONUMENT_NEAR_MISS_CAP,
  activeStride = 5,
  monumentStride = 7,
} = {}) {
  if (!Array.isArray(activePts) || !activePts.length || !Array.isArray(monumentPaths) || !monumentPaths.length) return 0;
  const r2 = radius * radius;
  let score = 0;
  for (let i = 0; i < activePts.length; i += activeStride) {
    const a = activePts[i];
    if (!a) continue;
    let best = Infinity;
    for (const monumentPts of monumentPaths) {
      if (!Array.isArray(monumentPts)) continue;
      for (let j = 0; j < monumentPts.length; j += monumentStride) {
        const m = monumentPts[j];
        if (!m) continue;
        const dx = (a.x || 0) - (m.x || 0);
        const dy = (a.y || 0) - (m.y || 0);
        const dz = (a.z || 0) - (m.z || 0);
        const dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 < best) best = dist2;
        if (best < 0.25) break;
      }
      if (best < 0.25) break;
    }
    if (best <= r2) {
      const near = 1 - Math.sqrt(best) / radius;
      score += 0.35 + near * 0.9;
    }
  }
  return +(cap * (1 - Math.exp(-score / 14))).toFixed(1);
}

// Retirement should certify a coaster, not a decorated oval. This score looks
// at ride craft: meaningful drops, airtime, special elements, and lateral
// pacing. It intentionally ignores raw length and decor.
export function qualityScore(stats = {}) {
  const counts = stats?.featureCounts || {};
  const specialTypes = ['loop', 'corkscrew', 'spiral', 'giantLoop', 'vertical', 'tunnel', 'teleporter'];
  const featureCount = specialTypes.reduce((sum, key) => sum + Math.max(0, counts[key] || 0), 0);
  const featureVariety = specialTypes.reduce((sum, key) => sum + ((counts[key] || 0) > 0 ? 1 : 0), 0);
  const dropScore = Math.min(42, Math.max(0, stats?.maxDrop || 0) * 1.55);
  const airtimeScore = Math.min(24, Math.max(0, stats?.airCount || 0) / 5);
  const featureScore = Math.min(36, featureCount * 7 + featureVariety * 3);
  const pacingScore = Math.min(12, Math.max(0, stats?.dirChanges || 0) * 1.2);
  const historyScore = Math.min(16, Math.max(0, stats?.monumentNearMiss || 0) * 0.65);
  const rollbackPenalty = stats?.rollback ? 10 : 0;
  return Math.max(0, +(dropScore + airtimeScore + featureScore + pacingScore + historyScore - rollbackPenalty).toFixed(1));
}

// The craft bar rises more gently than excitement: later generations can still
// use theming and tech to clear the headline EXC number, but each retirement
// needs a ride with real shape.
export function qualityBar(generation) {
  return Math.round(14 * Math.pow(1.28, Math.max(1, generation) - 1));
}

// Excitement a coaster must reach before it can be certified & retired. Rises
// each generation, so every new coaster has to categorically out-do the last.
export function certificationBar(generation) {
  return Math.round(40 * Math.pow(1.45, Math.max(1, generation) - 1));
}

export function canRetire(stats, themeBonus, generation) {
  return (
    effectiveExcitement(stats, themeBonus) >= certificationBar(generation) &&
    qualityScore(stats) >= qualityBar(generation)
  );
}

export const CAPSTONE_EXCITEMENT = 650;
export const CAPSTONE_CRAFT = 115;

// The Impossible Coaster is a permanent trophy above the retirement ladder.
// It demands a five-star park plus near-ceiling ride craft; earning it does not
// reset or end the active park.
export function canAchieveCapstone(legacy, stats, themeBonus = 0) {
  if (legacy?.capstone) return false;
  const eff = effectiveExcitement(stats, themeBonus);
  return (
    parkRating(legacy?.fame, legacy?.monuments?.length, eff) >= 5 &&
    eff >= CAPSTONE_EXCITEMENT &&
    qualityScore(stats) >= CAPSTONE_CRAFT
  );
}

export function achieveCapstone(legacy, { name = 'Impossible Coaster', achievedAt = Date.now() } = {}) {
  if (!legacy || legacy.capstone) return null;
  legacy.capstone = {
    name: String(name || 'Impossible Coaster').slice(0, 40),
    achievedAt: Number.isFinite(achievedAt) ? achievedAt : Date.now(),
  };
  return legacy.capstone;
}

// Fame banked for retiring a coaster at these stats. Superlinear in excitement,
// with a theming kicker — never rewards raw length directly.
export function fameFor(stats, themeBonus = 0) {
  const eff = effectiveExcitement(stats, themeBonus);
  if (eff <= 0) return 0;
  const craftMult = 0.75 + Math.min(0.8, qualityScore(stats) / 90);
  return Math.max(1, Math.round(Math.pow(eff, 1.15) / 12 * craftMult * (1 + (themeBonus || 0) / 120)));
}

// Starting cash for a new generation — build capital, scaled by Fame + Nest Egg.
export function openingGrant(fame, perks) {
  return Math.round((800 + Math.max(0, fame) * 120) * nestEggMult(perks));
}

// Passive $/min a single retired coaster earns ("tourists visit the classics").
export function monumentIncome(monument, perks) {
  const eff = effectiveExcitement(monument?.stats, monument?.themeBonus);
  if (eff <= 0) return 0;
  return Math.round(Math.sqrt(eff) * 8 * landmarksMult(perks));
}

export function totalLegacyIncome(monuments, perks) {
  if (!Array.isArray(monuments)) return 0;
  return monuments.reduce((sum, m) => sum + monumentIncome(m, perks), 0);
}

// Snapshot the active coaster into an immutable monument record.
export function createMonument({ name, ctrlPts, decorations = [], stats, themeBonus = 0, biome = 'meadow', generation, retiredAt = Date.now() }) {
  return {
    name: String(name || `Coaster ${generation}`).slice(0, 40),
    generation,
    biome,
    retiredAt,
    themeBonus: +(themeBonus || 0),
    stats: {
      excitement: stats?.excitement || 0,
      intensity: stats?.intensity || 0,
      nausea: stats?.nausea || 0,
      length: stats?.length || 0,
      maxSpeed: stats?.maxSpeed || 0,
      monumentNearMiss: stats?.monumentNearMiss || 0,
    },
    ctrlPts: (ctrlPts || []).map(p => ({ ...p })),
    decorations: (decorations || []).map(d => ({ ...d })),
  };
}

const finite = v => Number.isFinite(v);

// Validate/normalize a legacy blob loaded from a save.
export function normalizeLegacy(raw) {
  const legacy = createLegacyState();
  if (!raw || typeof raw !== 'object') return legacy;
  if (finite(raw.fame) && raw.fame >= 0) legacy.fame = raw.fame;
  if (finite(raw.generation) && raw.generation >= 1) legacy.generation = Math.floor(raw.generation);
  if (raw.perks && typeof raw.perks === 'object') {
    for (const key of PERK_ORDER) {
      const v = raw.perks[key];
      if (finite(v) && v > 0) legacy.perks[key] = Math.min(PERKS[key].max, Math.floor(v));
    }
  }
  if (Array.isArray(raw.monuments)) {
    legacy.monuments = raw.monuments
      .filter(m => m && Array.isArray(m.ctrlPts) && m.ctrlPts.length >= 3)
      .map(m => createMonument({
        name: m.name,
        ctrlPts: m.ctrlPts.filter(p => p && finite(p.x) && finite(p.y) && finite(p.z)),
        decorations: Array.isArray(m.decorations) ? m.decorations.filter(d => d && finite(d.x) && finite(d.z)) : [],
        stats: m.stats || {},
        themeBonus: m.themeBonus,
        biome: m.biome,
        generation: finite(m.generation) ? m.generation : 1,
        retiredAt: finite(m.retiredAt) ? m.retiredAt : Date.now(),
      }))
      .filter(m => m.ctrlPts.length >= 3);
  }
  if (raw.capstone && typeof raw.capstone === 'object') {
    legacy.capstone = {
      name: String(raw.capstone.name || 'Impossible Coaster').slice(0, 40),
      achievedAt: finite(raw.capstone.achievedAt) ? raw.capstone.achievedAt : Date.now(),
    };
  }
  return legacy;
}
