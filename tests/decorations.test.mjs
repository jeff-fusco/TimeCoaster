import assert from 'node:assert/strict';
import {
  canPlaceDecoration,
  createDecorationsState,
  decorationCost,
  normalizeDecorations,
  placeDecoration,
  removeDecoration,
  themingBonus,
  THEME_CAP,
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

  // construction-kit rules: pieces overlap and clip freely; only an exact
  // same-spot duplicate is rejected, and stacking at a new height is fine
  decorations.push({ type: 'lamp', x: 2, z: 2, y: 0 });
  assert.equal(canPlaceDecoration({ property, decorations, type: 'flowers', x: 2.4, z: 2 }), true, 'overlap allowed');
  assert.equal(canPlaceDecoration({ property, decorations, type: 'flowers', x: 2, z: 2 }), false, 'exact duplicate rejected');
  assert.equal(canPlaceDecoration({ property, decorations, type: 'pillar', x: 2, z: 2, y: 2 }), true, 'stacking above is a new spot');
  assert.equal(canPlaceDecoration({ property, decorations, type: 'pillar', x: 2, z: 2, y: 20 }), false, 'stacking ceiling');

  // raised pieces clear ground blockers (roof over the plaza)
  const blockers = [{ type: 'circle', cx: 5, cz: 5, radius: 1 }];
  assert.equal(canPlaceDecoration({ property, decorations, type: 'roof', x: 5, z: 5, blockers }), false, 'blocked at ground level');
  assert.equal(canPlaceDecoration({ property, decorations, type: 'roof', x: 5, z: 5, y: 3, blockers }), true, 'clears the blocker when raised');
}

// placing pays and records (with stacking height and rotation); failures spend nothing
{
  const decorations = createDecorationsState();
  const state = { money: 200 };

  const spent = placeDecoration({ decorations, property, state, type: 'flowers', x: 1, z: -3 });
  assert.equal(spent, DECOR.flowers.cost);
  assert.equal(state.money, 200 - DECOR.flowers.cost);
  assert.equal(decorations.length, 1);
  assert.deepEqual(decorations[0], { type: 'flowers', x: 1, z: -3, y: 0, rot: 0 });

  const stacked = placeDecoration({ decorations, property, state, type: 'pillar', x: 1, z: -3, y: 2.25, rot: Math.PI / 8 });
  assert.equal(stacked, DECOR.pillar.cost);
  assert.equal(decorations[1].y, 2.25);
  assert.ok(Math.abs(decorations[1].rot - Math.round((Math.PI / 8) * 1000) / 1000) < 1e-9);

  assert.equal(placeDecoration({ decorations, property, state, type: 'fountain', x: 5, z: 5 }), 0, 'cannot afford');
  assert.equal(placeDecoration({ decorations, property, state, type: 'flowers', x: 40, z: 0 }), 0, 'off-park');
  assert.equal(decorations.length, 2);
}

// demolishing refunds half and drops the entry
{
  const decorations = createDecorationsState();
  const state = { money: 1000 };
  placeDecoration({ decorations, property, state, type: 'statue', x: 0, z: 0 });
  placeDecoration({ decorations, property, state, type: 'wall', x: 3, z: 0 });
  const before = state.money;
  const refund = removeDecoration({ decorations, state, index: 0 });
  assert.equal(refund, Math.floor(DECOR.statue.cost * 0.5));
  assert.equal(state.money, before + refund);
  assert.equal(decorations.length, 1);
  assert.equal(decorations[0].type, 'wall');
  assert.equal(removeDecoration({ decorations, state, index: 99 }), 0, 'bad index refunds nothing');
}

// normalize drops garbage, keeps valid entries, clamps stack heights and
// preserves rotations (legacy pieces without rot keep their random-twist look)
{
  const cleaned = normalizeDecorations([
    { type: 'lamp', x: 1, z: 2 },
    { type: 'bogus', x: 0, z: 0 },
    { type: 'statue', x: Number.NaN, z: 1 },
    null,
    { type: 'fountain', x: -4, z: 6, junk: 'stripped' },
    { type: 'wall', x: 0, z: 0, y: 99, rot: 1.5 },
  ]);
  assert.deepEqual(cleaned, [
    { type: 'lamp', x: 1, z: 2, y: 0 },
    { type: 'fountain', x: -4, z: 6, y: 0 },
    { type: 'wall', x: 0, z: 0, y: 14, rot: 1.5 },
  ]);
  assert.deepEqual(normalizeDecorations('nope'), []);
}

// theming: decor near the track adds excitement, with diminishing returns
{
  const track = Array.from({ length: 40 }, (_, i) => ({ x: i, z: 0 }));

  assert.equal(themingBonus([], track), 0, 'no decor, no bonus');
  assert.equal(themingBonus([{ type: 'fountain', x: 5, z: 50 }], track), 0, 'too far from the track');

  const near = themingBonus([{ type: 'fountain', x: 5, z: 2 }], track);
  assert.ok(near > 0, 'a fountain by the rails themes the ride');

  const nearEdge = themingBonus([{ type: 'fountain', x: 5, z: 6.5 }], track);
  assert.ok(nearEdge > 0 && nearEdge < near, 'influence fades toward the radius edge');

  const flowers = themingBonus([{ type: 'flowers', x: 5, z: 2 }], track);
  assert.ok(flowers < near, 'showpieces theme harder than flower beds');

  // spamming pieces hits hard diminishing returns and never exceeds the cap
  const spam = Array.from({ length: 400 }, (_, i) => ({ type: 'fountain', x: (i * 37) % 40, z: (i % 5) - 2 }));
  const spamBonus = themingBonus(spam, track);
  assert.ok(spamBonus <= THEME_CAP, 'bonus caps out');
  const half = themingBonus(spam.slice(0, 200), track);
  assert.ok(spamBonus - half < half, 'second 200 pieces add less than the first 200');
}

// biome theming hooks: matching props theme extra, and a flat biome multiplier
{
  const track = Array.from({ length: 40 }, (_, i) => ({ x: i, z: 0 }));
  const cacti = [{ type: 'cactus', x: 5, z: 2 }, { type: 'cactus', x: 15, z: 2 }, { type: 'cactus', x: 25, z: 2 }];
  const plain = themingBonus(cacti, track);
  const matched = themingBonus(cacti, track, { matchTypes: new Set(['cactus']) });
  assert.ok(matched > plain, 'cacti theme extra in the Desert (match bonus)');

  const base = themingBonus(cacti, track);
  const volcano = themingBonus(cacti, track, { mult: 1.3 });
  assert.ok(Math.abs(volcano - base * 1.3) < 0.15, "Volcano's flat theming multiplier applies"); // ~1.3x within rounding
}

console.log('decorations tests passed');
