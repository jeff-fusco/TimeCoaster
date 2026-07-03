import assert from 'node:assert/strict';
import {
  buyLand,
  chunkBounds,
  chunkKey,
  createPropertyState,
  expansionCandidates,
  isQueueReservedChunk,
  landCost,
  normalizePropertyState,
  plotDimensions,
  pointInOwnedLand,
} from '../src/systems/property.js';

{
  const property = createPropertyState();
  assert.deepEqual(property.owned, ['0,0']);
  assert.equal(pointInOwnedLand(property, 0, 0), true);
  assert.equal(pointInOwnedLand(property, 11.9, -11.9), true);
  assert.equal(pointInOwnedLand(property, 12.4, 0), false);
  assert.deepEqual(chunkBounds(property, '0,0'), { minX: -12, maxX: 12, minZ: -12, maxZ: 12 });
}

{
  const property = createPropertyState();
  const candidates = expansionCandidates(property);
  assert.equal(candidates.length, 3);
  assert.deepEqual(new Set(candidates.map(candidate => candidate.key)), new Set(['1,0', '-1,0', '0,-1']));
  assert.equal(isQueueReservedChunk('0,1'), true, 'south land is reserved for queue expansion');
  assert.equal(landCost(property, '1,0'), 1188);
  assert.deepEqual(plotDimensions(property, '1,0'), { width: 24, depth: 24, area: 576, baseArea: 576 });
  assert.equal(Math.round(plotDimensions(property, '2,0').area), 778, 'farther east plots get larger');
  assert.ok(landCost(property, '2,0') > landCost(property, '1,0') * 2, 'larger distant plots carry a premium');
}

{
  const property = createPropertyState();
  const state = { money: 2000 };
  const spent = buyLand(property, chunkKey(1, 0), state);
  assert.equal(spent, 1188);
  assert.equal(state.money, 812);
  assert.equal(property.owned.includes('1,0'), true);
  assert.equal(pointInOwnedLand(property, 13, 0), true);
  assert.equal(buyLand(property, chunkKey(3, 0), state), false, 'cannot buy non-adjacent land');
  assert.equal(buyLand(property, chunkKey(0, 1), state), false, 'cannot buy queue-reserved south land');
  assert.ok(landCost(property, '2,0') > spent, 'land escalates after each purchase');
}

{
  const property = normalizePropertyState({
    chunkSize: 30,
    baseCost: 1200,
    growth: 1.9,
    distanceScale: 0.5,
    owned: ['bad', '1,0', '1,0'],
  });
  assert.equal(property.chunkSize, 30);
  assert.equal(property.sizeGrowth, 0.35);
  assert.equal(property.farGrowth, 1.28);
  assert.deepEqual(property.owned, ['0,0', '1,0']);
}

console.log('property tests passed');
