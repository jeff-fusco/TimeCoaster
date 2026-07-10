import assert from 'node:assert/strict';
import {
  BIOMES,
  BIOME_ORDER,
  biomeColors,
  biomeMatchTypes,
  biomePhysics,
  biomeUnlocked,
  isBiome,
  normalizeBiome,
} from '../src/systems/biomes.js';

// every ordered biome exists and has the required shape
{
  assert.equal(BIOME_ORDER[0], 'meadow', 'meadow is the starting biome');
  for (const key of BIOME_ORDER) {
    const b = BIOMES[key];
    assert.ok(b, `${key} defined`);
    assert.ok(b.name && b.icon && b.mechanic, `${key} has display fields`);
    assert.ok(b.fx && Number.isFinite(b.fx.snackMult), `${key} has fx`);
    assert.ok(Number.isFinite(b.sky) && Number.isFinite(b.fog), `${key} has sky/fog`);
  }
}

// gating: Moon is locked until its research is done; others are always open
{
  assert.equal(biomeUnlocked('meadow', {}), true);
  assert.equal(biomeUnlocked('desert', {}), true);
  assert.equal(biomeUnlocked('moon', {}), false, 'Moon starts locked');
  assert.equal(biomeUnlocked('moon', { verticalTrack: true }), true, 'Moon opens with vertical track research');
  assert.equal(biomeUnlocked('bogus', {}), false);
}

// palette merge overlays biome colors onto the base
{
  const base = { grass: 0x000001, track: 0xff0000, leaf: 0x000002 };
  const meadow = biomeColors('meadow', base);
  assert.equal(meadow.grass, 0x000001, 'meadow keeps base ground');
  assert.equal(meadow.track, 0xff0000, 'track colour is never overridden');
  const desert = biomeColors('desert', base);
  assert.notEqual(desert.grass, base.grass, 'desert repaints the ground');
  assert.equal(desert.track, 0xff0000, 'track stays the coaster colour');
}

// physics twists: ice cuts friction, moon cuts gravity, others unchanged
{
  const base = { g: 18, friction: 0.012, vMin: 4 };
  assert.deepEqual(biomePhysics('meadow', base), { ...base, g: 18, friction: 0.012 });
  assert.ok(biomePhysics('ice', base).friction < base.friction, 'ice is slick');
  assert.equal(biomePhysics('ice', base).g, base.g, 'ice keeps gravity');
  assert.ok(biomePhysics('moon', base).g < base.g, 'moon is low-gravity');
  assert.equal(biomePhysics('desert', base).friction, base.friction);
}

// fx multipliers reflect the advertised mechanics
{
  assert.equal(BIOMES.desert.fx.snackMult, 1.5);
  assert.ok(BIOMES.volcano.fx.themeMult > 1);
  assert.ok(BIOMES.moon.fx.gravityMult < 0.5);
}

// match types + normalize
{
  assert.deepEqual([...biomeMatchTypes('desert')], ['cactus']);
  assert.equal(biomeMatchTypes('meadow').size, 0, 'meadow has no signature prop');
  assert.equal(isBiome('ice'), true);
  assert.equal(isBiome('nope'), false);
  assert.equal(normalizeBiome('volcano'), 'volcano');
  assert.equal(normalizeBiome('garbage'), 'meadow');
}

console.log('biomes tests passed');
