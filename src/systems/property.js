export const DEFAULT_PROPERTY = {
  chunkSize: 24,
  baseCost: 900,
  growth: 1.72,
  distanceScale: 0.32,
  owned: ['0,0'],
};

export function chunkKey(x, z) {
  return `${x},${z}`;
}

export function parseChunkKey(key) {
  const [x, z] = String(key).split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

export function createPropertyState(config = DEFAULT_PROPERTY) {
  return {
    chunkSize: config.chunkSize,
    baseCost: config.baseCost,
    growth: config.growth,
    distanceScale: config.distanceScale,
    owned: [...config.owned],
  };
}

export function normalizePropertyState(property, fallback = DEFAULT_PROPERTY) {
  const src = property || {};
  const owned = Array.isArray(src.owned)
    ? [...new Set(src.owned.filter(key => parseChunkKey(key)))]
    : [...fallback.owned];
  if (!owned.includes('0,0')) owned.unshift('0,0');
  return {
    chunkSize: Number.isFinite(src.chunkSize) && src.chunkSize > 0 ? src.chunkSize : fallback.chunkSize,
    baseCost: Number.isFinite(src.baseCost) && src.baseCost > 0 ? src.baseCost : fallback.baseCost,
    growth: Number.isFinite(src.growth) && src.growth > 1 ? src.growth : fallback.growth,
    distanceScale: Number.isFinite(src.distanceScale) && src.distanceScale >= 0 ? src.distanceScale : fallback.distanceScale,
    owned,
  };
}

export function chunkBounds(property, key) {
  const chunk = parseChunkKey(key);
  if (!chunk) return null;
  const half = property.chunkSize / 2;
  return {
    minX: chunk.x * property.chunkSize - half,
    maxX: chunk.x * property.chunkSize + half,
    minZ: chunk.z * property.chunkSize - half,
    maxZ: chunk.z * property.chunkSize + half,
  };
}

export function pointInOwnedLand(property, x, z, margin = 0) {
  return property.owned.some(key => {
    const b = chunkBounds(property, key);
    return b && x >= b.minX + margin && x <= b.maxX - margin && z >= b.minZ + margin && z <= b.maxZ - margin;
  });
}

export function landCost(property, key) {
  const chunk = parseChunkKey(key);
  if (!chunk) return Infinity;
  const ownedCount = Math.max(1, property.owned.length);
  const distance = Math.abs(chunk.x) + Math.abs(chunk.z);
  const scale = Math.pow(property.growth, ownedCount - 1) * (1 + distance * property.distanceScale);
  return Math.ceil(property.baseCost * scale);
}

export function isQueueReservedChunk(key) {
  const chunk = parseChunkKey(key);
  return !!chunk && chunk.z > 0;
}

export function expansionCandidates(property) {
  const owned = new Set(property.owned);
  const candidates = new Set();
  for (const key of property.owned) {
    const chunk = parseChunkKey(key);
    if (!chunk) continue;
    [
      [chunk.x + 1, chunk.z],
      [chunk.x - 1, chunk.z],
      [chunk.x, chunk.z + 1],
      [chunk.x, chunk.z - 1],
    ].forEach(([x, z]) => {
      const next = chunkKey(x, z);
      if (isQueueReservedChunk(next)) return;
      if (!owned.has(next)) candidates.add(next);
    });
  }
  return [...candidates]
    .map(key => ({ key, ...parseChunkKey(key), cost: landCost(property, key) }))
    .sort((a, b) => a.cost - b.cost || Math.abs(a.x) + Math.abs(a.z) - (Math.abs(b.x) + Math.abs(b.z)) || a.key.localeCompare(b.key));
}

export function buyLand(property, key, state) {
  if (property.owned.includes(key)) return false;
  if (!expansionCandidates(property).some(candidate => candidate.key === key)) return false;
  const cost = landCost(property, key);
  if (state.money < cost) return false;
  state.money -= cost;
  property.owned.push(key);
  return cost;
}
