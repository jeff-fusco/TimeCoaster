// Biomes: each generation's coaster rises on a chosen biome. A biome is a
// palette swap (ground, scenery, sky, fog) plus one mechanical twist. Pure and
// testable — the color values are plain overrides merged onto the base COL in
// main.js, so this module has no render dependency.
//
// Twists (fx):
//   snackMult    — desert guests are thirsty (snack income multiplier)
//   frictionMult — glacier ice is slick (< 1 = faster, wilder coasters)
//   themeMult    — volcano drama amplifies every prop's theming
//   gravityMult  — the Moon's low gravity → impossible airtime
// signatureDecor is the biome's flavor prop; placing your biome's decor themes
// extra (see themingBonus match bonus).

export const BIOMES = {
  meadow: {
    name: 'Meadow', icon: '🌳',
    desc: 'Gentle green hills — a fair, balanced start.',
    mechanic: 'Balanced baseline',
    colors: {},
    sky: 0x8fd0e8, fog: 0x9fd6ec,
    fx: { snackMult: 1, frictionMult: 1, themeMult: 1, gravityMult: 1 },
    signatureDecor: null,
    gate: null,
  },
  desert: {
    name: 'Desert', icon: '🏜️',
    desc: 'Sun-baked dunes. Parched guests buy far more snacks.',
    mechanic: 'Snack income ×1.5',
    colors: {
      grass: 0xe6cf8c, grassHi: 0xf0dca0, dirt: 0xc99a5a, dirtDark: 0x8a6a3a,
      sand: 0xe8d7a8, sandSide: 0xcbb07a, leaf: 0x8a9a4a, leafHi: 0xa6b86a, trunk: 0x9a6a3b,
    },
    sky: 0xf1d59a, fog: 0xe9cf9a,
    fx: { snackMult: 1.5, frictionMult: 1, themeMult: 1, gravityMult: 1 },
    signatureDecor: 'cactus',
    gate: null,
  },
  ice: {
    name: 'Glacier', icon: '❄️',
    desc: 'Slick ice — coasters keep their speed and run wilder.',
    mechanic: 'Low friction: +speed, +intensity',
    colors: {
      grass: 0xdfeaf2, grassHi: 0xeef6fc, dirt: 0xa9c0d0, dirtDark: 0x7c94a6,
      sand: 0xcfe0ec, sandSide: 0xa9c4d6, leaf: 0x8fb8c8, leafHi: 0xbadcea, trunk: 0x6b7c88,
    },
    sky: 0xcfe6f2, fog: 0xdcecf5,
    fx: { snackMult: 1, frictionMult: 0.3, themeMult: 1, gravityMult: 1 },
    signatureDecor: 'iceSpire',
    gate: null,
  },
  volcano: {
    name: 'Volcano', icon: '🌋',
    desc: 'Molten drama makes every prop hit harder.',
    mechanic: 'Theming ×1.3',
    colors: {
      grass: 0x5a5560, grassHi: 0x6b6470, dirt: 0x3e3742, dirtDark: 0x2a2530,
      sand: 0x4a4550, sandSide: 0x36313c, leaf: 0x8a3a2a, leafHi: 0xb04a30, trunk: 0x3a2a26,
    },
    sky: 0x7a4a52, fog: 0x7a4a48,
    fx: { snackMult: 1, frictionMult: 1, themeMult: 1.3, gravityMult: 1 },
    signatureDecor: 'lavaRock',
    gate: null,
  },
  moon: {
    name: 'Moon', icon: '🌙',
    desc: '0.4× gravity. Floaty drops and impossible airtime.',
    mechanic: 'Low gravity — massive airtime',
    colors: {
      grass: 0xb8b8c2, grassHi: 0xcccdd6, dirt: 0x8a8a94, dirtDark: 0x6a6a74,
      sand: 0xa8a8b2, sandSide: 0x8a8a94, leaf: 0x9aa0b2, leafHi: 0xb2b8c6, trunk: 0x70747e,
    },
    sky: 0x0a0a1e, fog: 0x141430,
    fx: { snackMult: 1, frictionMult: 1, themeMult: 1, gravityMult: 0.42 },
    signatureDecor: 'moonCrystal',
    gate: 'verticalTrack',   // unlocked once the impossible-track tier is researched
  },
};

export const BIOME_ORDER = ['meadow', 'desert', 'ice', 'volcano', 'moon'];

export function isBiome(key) {
  return Object.prototype.hasOwnProperty.call(BIOMES, key);
}

export function biomeOf(key) {
  return BIOMES[key] || BIOMES.meadow;
}

// Locked biomes (e.g. Moon) open once their gating research is done.
export function biomeUnlocked(key, researchDone = {}) {
  const biome = BIOMES[key];
  if (!biome) return false;
  return !biome.gate || !!researchDone[biome.gate];
}

// base = the game's COL; returns a merged palette for the biome.
export function biomeColors(key, base) {
  return { ...base, ...biomeOf(key).colors };
}

// Apply a biome's physics twists to the base PHYS (friction, gravity).
export function biomePhysics(key, base) {
  const fx = biomeOf(key).fx;
  return {
    ...base,
    g: base.g * (fx.gravityMult ?? 1),
    friction: base.friction * (fx.frictionMult ?? 1),
  };
}

export function biomeFx(key) {
  return biomeOf(key).fx;
}

// The set of decor types that count as "matching" this biome (for the theming
// set bonus). Just the biome's signature prop for now.
export function biomeMatchTypes(key) {
  const sig = biomeOf(key).signatureDecor;
  return sig ? new Set([sig]) : new Set();
}

export function normalizeBiome(key) {
  return isBiome(key) ? key : 'meadow';
}
