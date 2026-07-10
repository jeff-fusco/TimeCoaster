import assert from 'node:assert/strict';
import {
  buyPerk,
  canBuyPerk,
  canRetire,
  certificationBar,
  createLegacyState,
  createMonument,
  effectiveExcitement,
  fameFor,
  monumentNearMissBonus,
  monumentIncome,
  normalizeLegacy,
  openingGrant,
  perkCost,
  qualityBar,
  qualityScore,
  totalLegacyIncome,
} from '../src/systems/legacy.js';

// certification bar rises each generation
{
  assert.equal(certificationBar(1), 40);
  assert.ok(certificationBar(2) > certificationBar(1));
  assert.ok(certificationBar(4) > certificationBar(3));
  assert.equal(qualityBar(1), 14);
  assert.ok(qualityBar(4) > qualityBar(3));
  // a Fun (22) coaster can't retire gen 1; theming alone cannot certify a flat starter
  assert.equal(canRetire({ excitement: 22 }, 0, 1), false);
  assert.equal(canRetire({ excitement: 30, maxDrop: 1, airCount: 0, featureCounts: {} }, 15, 1), false, 'theming cannot replace ride craft');
  const crafted = { excitement: 30, maxDrop: 12, airCount: 12, dirChanges: 3, featureCounts: { lift: 1 } };
  assert.ok(qualityScore(crafted) >= qualityBar(1), 'a real drop and pacing clear craft');
  assert.equal(canRetire(crafted, 15, 1), true, 'theming still helps once the coaster has shape');
  assert.equal(canRetire({ excitement: 58, maxDrop: 16, airCount: 15, dirChanges: 4, featureCounts: { loop: 1 } }, 0, 2), true);
  assert.equal(canRetire({ excitement: 45 }, 0, 3), false, 'gen 3 needs a better coaster');
}

// fame is superlinear in effective excitement and rewards theming
{
  assert.equal(effectiveExcitement({ excitement: 40 }, 10), 50);
  const low = fameFor({ excitement: 42 }, 0);
  const high = fameFor({ excitement: 250 }, 0);
  assert.ok(high > low * 4, 'a far better coaster is worth far more fame');
  const plain = fameFor({ excitement: 100 }, 0);
  const themed = fameFor({ excitement: 100 }, 40);
  assert.ok(themed > plain, 'theming boosts fame beyond its excitement contribution');
  assert.ok(fameFor({ excitement: 0 }, 0) === 0);
}

// monument near-misses reward threading new track near retired coaster history
{
  const active = [
    { x: 0, y: 2, z: 0 },
    { x: 3, y: 2, z: 0 },
    { x: 6, y: 2, z: 0 },
  ];
  const closeHistory = [[
    { x: 0.5, y: 2.1, z: 0.3 },
    { x: 3.3, y: 2.0, z: 0.2 },
    { x: 6.5, y: 2.2, z: 0.2 },
  ]];
  const farHistory = [[
    { x: 100, y: 2, z: 100 },
    { x: 106, y: 2, z: 100 },
  ]];
  const close = monumentNearMissBonus(active, closeHistory, { activeStride: 1, monumentStride: 1 });
  assert.ok(close > 0, 'near monument track earns a history bonus');
  assert.equal(monumentNearMissBonus(active, farHistory, { activeStride: 1, monumentStride: 1 }), 0);
  assert.ok(qualityScore({ monumentNearMiss: close }) > 0, 'history bonus contributes to craft');
}

// opening grant scales with fame and the Nest Egg perk
{
  assert.ok(openingGrant(50, {}) > openingGrant(5, {}));
  assert.ok(openingGrant(10, { nestEgg: 3 }) > openingGrant(10, {}));
}

// monument income + legacy total, boosted by Landmarks
{
  const m = createMonument({ name: 'Twister', ctrlPts: [{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 1 }], stats: { excitement: 100 }, themeBonus: 20, generation: 1 });
  const base = monumentIncome(m, {});
  assert.ok(base > 0);
  assert.ok(monumentIncome(m, { landmarks: 4 }) > base, 'Landmarks perk lifts monument income');
  assert.equal(totalLegacyIncome([m, m], {}), base * 2);
  assert.equal(totalLegacyIncome([], {}), 0);
}

// perk shop: cost curve, affordability, purchase
{
  const legacy = createLegacyState();
  assert.equal(perkCost('nestEgg', 0), 5);
  assert.ok(perkCost('nestEgg', 3) > perkCost('nestEgg', 0));
  assert.equal(canBuyPerk(legacy, 'nestEgg'), false, 'no fame yet');
  legacy.fame = 100;
  assert.equal(buyPerk(legacy, 'nestEgg'), 5);
  assert.equal(legacy.perks.nestEgg, 1);
  assert.equal(legacy.fame, 95);
  assert.equal(buyPerk(legacy, 'bogus'), 0);
}

// monument snapshot copies data defensively; normalize drops junk
{
  const ctrl = [{ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 2 }];
  const m = createMonument({ name: 'A'.repeat(80), ctrlPts: ctrl, decorations: [{ type: 'fountain', x: 1, z: 1 }], stats: { excitement: 55, length: 300 }, themeBonus: 5, generation: 2 });
  assert.ok(m.name.length <= 40);
  ctrl[0].x = 99;
  assert.equal(m.ctrlPts[0].x, 0, 'snapshot is a deep copy');

  const cleaned = normalizeLegacy({
    fame: 42, generation: 3, perks: { nestEgg: 2, bogus: 9 },
    monuments: [m, { name: 'bad', ctrlPts: [{ x: 0, y: 0, z: 0 }] }, null],
  });
  assert.equal(cleaned.fame, 42);
  assert.equal(cleaned.generation, 3);
  assert.equal(cleaned.perks.nestEgg, 2);
  assert.equal(cleaned.perks.bogus, undefined);
  assert.equal(cleaned.monuments.length, 1, 'drops the too-short and null monuments');
  assert.deepEqual(normalizeLegacy(null), createLegacyState());
}

console.log('legacy tests passed');
