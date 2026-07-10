// Decorations: bought from the Decor shop tab and placed anywhere on owned
// land. Pure state + rules — rendering lives in render/decorations.js.
import { DECOR } from '../config/gameData.js?v=20260703-13';
import { pointInOwnedLand } from './property.js?v=20260703-13';

// Pieces may overlap and clip through each other on purpose — stacking and
// clipping is how structures get built. Only an exact same-spot duplicate is
// rejected (it would be an invisible double-purchase).
export const DECOR_MIN_SPACING = 0.05;
export const DECOR_LAND_MARGIN = 0.6;   // stay clear of the slab edge
export const DECOR_MAX_HEIGHT = 14;     // stacking ceiling
// pieces raised above head height clear the station/queue/track blockers, so
// roofs and decks can span the plaza without burying the walking crowd
export const DECOR_CLEARANCE_Y = 1.8;

export function createDecorationsState() {
  return [];
}

export function decorationCost(type) {
  return DECOR[type] ? DECOR[type].cost : Infinity;
}

function hitsBlocker(blocker, x, z) {
  const margin = blocker.margin ?? 0;
  if (blocker.type === 'circle') {
    const radius = (blocker.radius ?? 0) + margin;
    return (x - blocker.cx) ** 2 + (z - blocker.cz) ** 2 <= radius * radius;
  }
  if (blocker.type === 'oriented-box') {
    const basisX = blocker.basisX || { x: 1, z: 0 };
    const basisZ = blocker.basisZ || { x: 0, z: 1 };
    const origin = blocker.origin || { x: 0, z: 0 };
    const dx = x - origin.x;
    const dz = z - origin.z;
    const localX = dx * basisX.x + dz * basisX.z;
    const localZ = dx * basisZ.x + dz * basisZ.z;
    return (
      Math.abs(localX - blocker.cx) <= (blocker.halfX ?? 0) + margin &&
      Math.abs(localZ - blocker.cz) <= (blocker.halfZ ?? 0) + margin
    );
  }
  return false;
}

export function canPlaceDecoration({
  property,
  decorations,
  type,
  x,
  z,
  y = 0,
  minSpacing = DECOR_MIN_SPACING,
  blockers = [],
}) {
  if (!DECOR[type]) return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (y < 0 || y > DECOR_MAX_HEIGHT) return false;
  if (!pointInOwnedLand(property, x, z, DECOR_LAND_MARGIN)) return false;
  // blockers protect the walking crowd at ground level; raised pieces span over
  if (y < DECOR_CLEARANCE_Y && blockers.some(blocker => hitsBlocker(blocker, x, z))) return false;
  // 3D dupe check: same footprint at a different height is a legit stack
  const minSq = minSpacing * minSpacing;
  return decorations.every(d => (d.x - x) ** 2 + (d.z - z) ** 2 + ((d.y || 0) - y) ** 2 >= minSq);
}

// Pays for and records a decoration. Returns the cost spent, or 0 if the spot
// is invalid or funds are short.
export function placeDecoration({ decorations, property, state, type, x, z, y = 0, rot = 0, blockers = [] }) {
  if (!canPlaceDecoration({ property, decorations, type, x, z, y, blockers })) return 0;
  const cost = decorationCost(type);
  if (state.money < cost) return 0;
  state.money -= cost;
  decorations.push({
    type,
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
    y: Math.round((y || 0) * 100) / 100,
    rot: Math.round((rot || 0) * 1000) / 1000,
  });
  return cost;
}

// Removes the piece at `index`, refunding half its cost. Returns the refund.
export function removeDecoration({ decorations, state, index, refundRate = 0.5 }) {
  const d = decorations[index];
  if (!d) return 0;
  const refund = Math.floor(decorationCost(d.type) * refundRate);
  decorations.splice(index, 1);
  state.money += refund;
  return refund;
}

// Drop malformed entries from a loaded save.
export function normalizeDecorations(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(d => d && DECOR[d.type] && Number.isFinite(d.x) && Number.isFinite(d.z))
    .map(d => ({
      type: d.type,
      x: d.x,
      z: d.z,
      y: Number.isFinite(d.y) ? Math.max(0, Math.min(DECOR_MAX_HEIGHT, d.y)) : 0,
      ...(Number.isFinite(d.rot) ? { rot: d.rot } : {}),
    }));
}

// ── theming: decor near the track raises the ride's excitement ──────────────
// Each piece within THEME_RADIUS of the track contributes its weight, scaled
// down toward the edge of the radius. The total converts to excitement with
// hard diminishing returns, so carpeting the park in flower beds can't be
// min-maxed — variety and placement along the ride is what pays.
export const THEME_RADIUS = 7;
export const THEME_CAP = 45;   // asymptotic max excitement from theming
export const DECOR_THEME_WEIGHTS = {
  flowers: 1,
  lamp: 0.8,
  topiary: 1.5,
  statue: 2.5,
  fountain: 3.6,
  // nature & flair
  rock: 0.9,
  pine: 1.3,
  torch: 1.1,
  banner: 1.2,
  // construction pieces theme lightly per piece — structures earn through bulk
  wall: 0.5,
  pillar: 0.5,
  deck: 0.4,
  roof: 0.8,
  arch: 1.8,
  fence: 0.3,
  // biome signature props — solid on their own, extra in-biome (see matchTypes)
  cactus: 1.6,
  iceSpire: 1.6,
  lavaRock: 1.6,
  moonCrystal: 2.0,
};

// how much extra a piece themes when it matches the active biome
export const BIOME_MATCH_MULT = 1.6;

// trackPts: array of {x, z} (a sampled track centreline). Sampling stride keeps
// this cheap enough to re-run on every path rebuild or decoration placed.
// matchTypes: decor types that match the active biome — they theme extra.
// mult: a flat multiplier on the whole result (e.g. Volcano's theming ×1.3).
export function themingBonus(decorations, trackPts, {
  radius = THEME_RADIUS,
  cap = THEME_CAP,
  stride = 6,
  matchTypes = null,
  matchMult = BIOME_MATCH_MULT,
  mult = 1,
} = {}) {
  if (!Array.isArray(decorations) || !decorations.length || !trackPts?.length) return 0;
  const r2 = radius * radius;
  let points = 0;
  for (const d of decorations) {
    let weight = DECOR_THEME_WEIGHTS[d.type] || 0;
    if (!weight) continue;
    if (matchTypes && matchTypes.has(d.type)) weight *= matchMult;
    let best = Infinity;
    for (let i = 0; i < trackPts.length; i += stride) {
      const p = trackPts[i];
      const dx = p.x - d.x;
      const dz = p.z - d.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 < best) best = dist2;
      if (best < 1) break;
    }
    if (best <= r2) {
      const near = 1 - Math.sqrt(best) / radius;   // 1 at the rails → 0 at the edge
      points += weight * (0.45 + 0.55 * near);
    }
  }
  if (points <= 0) return 0;
  return +(cap * (1 - Math.exp(-points / 16)) * mult).toFixed(1);
}
