import assert from 'node:assert/strict';
import {
  canPlaceDecoration,
  createDecorationsState,
  decorationCost,
  normalizeDecorations,
  placeDecoration,
} from '../src/systems/decorations.js';
import { DECOR } from '../src/config/gameData.js';
import { createPropertyState } from '../src/systems/property.js';

const property = createPropertyState(); // owns chunk 0,0 (24m, spans ±12)

// catalog costs
{
  assert.equal(decorationCost('flowers'), DECOR.flowers.cost);
  assert.equal(decorationCost('nope'), Infinity);
}

// placement rules: owned land only, margin from the edge, spacing between items
{
  const decorations = createDecorationsState();
  assert.equal(canPlaceDecoration({ property, decorations, type: 'flowers', x: 0, z: 0 }), true);
  assert.equal(canPlaceDecoration({ property, decorations, type: 'flowers', x: 30, z: 0 }), false, 'unowned chunk');
  assert.equal(canPlaceDecoration({ property, decorations, type: 'flowers', x: 11.8, z: 0 }), false, 'too close to slab edge');
  assert.equal(canPlaceDecoration({ property, decorations, type: 'bogus', x: 0, z: 0 }), false, 'unknown type');
  assert.equal(
    canPlaceDecoration({
      property,
      decorations,
      type: 'flowers',
      x: 0,
      z: 0,
      blockers: [{ type: 'circle', cx: 0, cz: 0, radius: 1 }],
    }),
    false,
    'blocked footprint',
  );
  assert.equal(
    canPlaceDecoration({
      property,
      decorations,
      type: 'flowers',
      x: 1.2,
      z: 2,
      blockers: [{
        type: 'oriented-box',
        cx: 0,
        cz: 2,
        halfX: 2,
        halfZ: 1,
        basisX: { x: 1, z: 0 },
        basisZ: { x: 0, z: 1 },
      }],
    }),
    false,
    'oriented blocked footprint',
  );

  decorations.push({ type: 'lamp', x: 2, z: 2 });
  assert.equal(canPlaceDecoration({ property, decorations, type: 'flowers', x: 2.4, z: 2 }), false, 'spacing');
  assert.equal(canPlaceDecoration({ property, decorations, type: 'flowers', x: 4, z: 2 }), true);
}

// placing pays and records; failures spend nothing
{
  const decorations = createDecorationsState();
  const state = { money: 100 };

  const spent = placeDecoration({ decorations, property, state, type: 'flowers', x: 1, z: -3 });
  assert.equal(spent, DECOR.flowers.cost);
  assert.equal(state.money, 100 - DECOR.flowers.cost);
  assert.equal(decorations.length, 1);
  assert.deepEqual(decorations[0], { type: 'flowers', x: 1, z: -3 });

  assert.equal(placeDecoration({ decorations, property, state, type: 'fountain', x: 5, z: 5 }), 0, 'cannot afford');
  assert.equal(placeDecoration({ decorations, property, state, type: 'flowers', x: 40, z: 0 }), 0, 'off-park');
  assert.equal(decorations.length, 1);
}

// normalize drops garbage but keeps valid entries
{
  const cleaned = normalizeDecorations([
    { type: 'lamp', x: 1, z: 2 },
    { type: 'bogus', x: 0, z: 0 },
    { type: 'statue', x: Number.NaN, z: 1 },
    null,
    { type: 'fountain', x: -4, z: 6, junk: 'stripped' },
  ]);
  assert.deepEqual(cleaned, [
    { type: 'lamp', x: 1, z: 2 },
    { type: 'fountain', x: -4, z: 6 },
  ]);
  assert.deepEqual(normalizeDecorations('nope'), []);
}

console.log('decorations tests passed');
