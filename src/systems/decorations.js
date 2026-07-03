// Decorations: bought from the Decor shop tab and placed anywhere on owned
// land. Pure state + rules — rendering lives in render/decorations.js.
import { DECOR } from '../config/gameData.js?v=20260703-12';
import { pointInOwnedLand } from './property.js?v=20260703-12';

export const DECOR_MIN_SPACING = 1.1;   // decorations keep a little breathing room
export const DECOR_LAND_MARGIN = 0.6;   // and stay clear of the slab edge

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
  minSpacing = DECOR_MIN_SPACING,
  blockers = [],
}) {
  if (!DECOR[type]) return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (!pointInOwnedLand(property, x, z, DECOR_LAND_MARGIN)) return false;
  if (blockers.some(blocker => hitsBlocker(blocker, x, z))) return false;
  const minSq = minSpacing * minSpacing;
  return decorations.every(d => (d.x - x) ** 2 + (d.z - z) ** 2 >= minSq);
}

// Pays for and records a decoration. Returns the cost spent, or 0 if the spot
// is invalid or funds are short.
export function placeDecoration({ decorations, property, state, type, x, z, blockers = [] }) {
  if (!canPlaceDecoration({ property, decorations, type, x, z, blockers })) return 0;
  const cost = decorationCost(type);
  if (state.money < cost) return 0;
  state.money -= cost;
  decorations.push({ type, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
  return cost;
}

// Drop malformed entries from a loaded save.
export function normalizeDecorations(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(d => d && DECOR[d.type] && Number.isFinite(d.x) && Number.isFinite(d.z))
    .map(d => ({ type: d.type, x: d.x, z: d.z }));
}
