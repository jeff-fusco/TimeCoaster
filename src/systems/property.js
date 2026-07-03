export const DEFAULT_PROPERTY = {
  chunkSize: 24,
  baseCost: 900,
  growth: 1.72,
  distanceScale: 0.32,
  sizeGrowth: 0.35,
  farGrowth: 1.28,
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
    sizeGrowth: config.sizeGrowth,
    farGrowth: config.farGrowth,
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
    sizeGrowth: Number.isFinite(src.sizeGrowth) && src.sizeGrowth >= 0 ? src.sizeGrowth : fallback.sizeGrowth,
    farGrowth: Number.isFinite(src.farGrowth) && src.farGrowth >= 1 ? src.farGrowth : fallback.farGrowth,
    owned,
  };
}

export function plotSpan(property, index) {
  const ring = Math.abs(index);
  const outer = Math.max(0, ring - 1);
  const deepOuter = Math.max(0, ring - 3);
  return property.chunkSize * (1 + outer * property.sizeGrowth + deepOuter * property.sizeGrowth * 0.65);
}

export function plotCenter(property, index) {
  const ring = Math.abs(index);
  if (ring === 0) return 0;
  let offset = plotSpan(property, 0) / 2;
  for (let i = 1; i < ring; i += 1) offset += plotSpan(property, i);
  offset += plotSpan(property, ring) / 2;
  return Math.sign(index) * offset;
}

export function plotDimensions(property, key) {
  const chunk = parseChunkKey(key);
  if (!chunk) return null;
  const width = plotSpan(property, chunk.x);
  const depth = plotSpan(property, chunk.z);
  return {
    width,
    depth,
    area: width * depth,
    baseArea: property.chunkSize * property.chunkSize,
  };
}

export function chunkBounds(property, key) {
  const chunk = parseChunkKey(key);
  if (!chunk) return null;
  const width = plotSpan(property, chunk.x);
  const depth = plotSpan(property, chunk.z);
  const cx = plotCenter(property, chunk.x);
  const cz = plotCenter(property, chunk.z);
  return {
    minX: cx - width / 2,
    maxX: cx + width / 2,
    minZ: cz - depth / 2,
    maxZ: cz + depth / 2,
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
  const dimensions = plotDimensions(property, key);
  const areaScale = dimensions ? dimensions.area / dimensions.baseArea : 1;
  const distancePremium = Math.pow(property.farGrowth, Math.max(0, distance - 1));
  const scale = Math.pow(property.growth, ownedCount - 1) * (1 + distance * property.distanceScale) * areaScale * distancePremium;
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
    .map(key => {
      const dimensions = plotDimensions(property, key);
      return { key, ...parseChunkKey(key), ...dimensions, cost: landCost(property, key) };
    })
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
