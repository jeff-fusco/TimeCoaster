import assert from 'node:assert/strict';
import {
  CONCESSIONS,
  CONCESSION_BASE_CAP,
  CONCESSION_CAP_PER_CANOPY,
  FOODCOURT_SPEND_MULT,
  concessionsRate,
  dwellMultiplier,
  drainSales,
  pickConcessionSale,
} from '../src/systems/concessions.js';

const station = { snackCap: 30 };
const upg = (o = {}) => ({
  snacks: { level: o.snacks || 0 },
  hats: { level: o.hats || 0 },
  balloons: { level: o.balloons || 0 },
  canopy: { level: o.canopy || 0 },
});

// nothing invested → no concession income
{
  const r = concessionsRate({ crowd: 40, upgrades: upg(), station });
  assert.equal(r.perMin, 0);
  assert.equal(r.salesPerMin, 0);
  assert.equal(r.items.length, 3);
}

// the whole crowd buys, up to the stands' capacity
{
  const small = concessionsRate({ crowd: 10, upgrades: upg({ snacks: 3 }), station });
  const big = concessionsRate({ crowd: 25, upgrades: upg({ snacks: 3 }), station });
  assert.ok(big.perMin > small.perMin, 'more foot traffic → more sales');
  // capacity caps the servable crowd (base 30 without canopy)
  const huge = concessionsRate({ crowd: 500, upgrades: upg({ snacks: 3 }), station });
  const atCap = concessionsRate({ crowd: 30, upgrades: upg({ snacks: 3 }), station });
  assert.equal(huge.served, 30, 'served crowd capped at capacity');
  assert.ok(Math.abs(huge.perMin - atCap.perMin) < 1e-9, 'past capacity earns no more');
  // Shade Canopies raise the servable crowd
  const canopied = concessionsRate({ crowd: 500, upgrades: upg({ snacks: 3, canopy: 4 }), station });
  assert.equal(canopied.cap, 30 + 4 * CONCESSION_CAP_PER_CANOPY);
  assert.ok(canopied.perMin > huge.perMin, 'canopies let more guests buy');
}

// dwell reward: guests who wait longer in a slow, full queue spend more. The
// multiplier saturates so it can't run away, and is neutral (×1) at zero wait.
{
  assert.ok(Math.abs(dwellMultiplier(0) - 1) < 1e-9, 'no wait → no dwell bonus');
  assert.ok(dwellMultiplier(4) > dwellMultiplier(1), 'a longer wait spends more');
  assert.ok(dwellMultiplier(1000) <= 4.0001, 'dwell bonus saturates (bounded)');
  const fast = concessionsRate({ crowd: 25, upgrades: upg({ snacks: 3 }), station, avgDwellMin: 0.2 });
  const slow = concessionsRate({ crowd: 25, upgrades: upg({ snacks: 3 }), station, avgDwellMin: 8 });
  assert.ok(slow.perMin > fast.perMin * 1.5, 'a long, slow queue outsells a fast one for the same crowd');
}

// Food Court — the compounding concessions engine: each level serves a far
// bigger crowd AND multiplies spend, so a destination park earns from footfall.
{
  const u = o => ({ ...upg(o), foodCourt: { level: o.foodCourt || 0 } });
  const plain = concessionsRate({ crowd: 800, upgrades: u({ snacks: 4 }), station });
  const court = concessionsRate({ crowd: 800, upgrades: u({ snacks: 4, foodCourt: 5 }), station });
  assert.ok(court.cap > plain.cap, 'a Food Court serves a bigger crowd');
  assert.ok(Math.abs(court.foodCourtMult - Math.pow(FOODCOURT_SPEND_MULT, 5)) < 1e-9, 'spend multiplier compounds per level');
  // more served × more spend each → far more income (compounds, not adds)
  assert.ok(court.perMin > plain.perMin * 3, 'the Food Court is a real compounding lever');
}

// prices scale with ticket prestige — not a frozen flat number
{
  const cheap = concessionsRate({ crowd: 20, upgrades: upg({ snacks: 2 }), station, ticketLevel: 0 });
  const premium = concessionsRate({ crowd: 20, upgrades: upg({ snacks: 2 }), station, ticketLevel: 10 });
  assert.ok(premium.perMin > cheap.perMin * 1.5, 'a premium park charges premium prices');
  const snackC = cheap.items.find(i => i.key === 'snack');
  const snackP = premium.items.find(i => i.key === 'snack');
  assert.equal(snackC.price, 3);
  assert.equal(snackP.price, 3 + 0.5 * 10);
}

// income is a BLEND of items, each its own price/frequency (no single flat rate)
{
  const r = concessionsRate({ crowd: 40, upgrades: upg({ snacks: 4, hats: 3, balloons: 3 }), station: { snackCap: 60 } });
  const byKey = Object.fromEntries(r.items.map(i => [i.key, i]));
  assert.ok(byKey.snack.perMin > 0 && byKey.hat.perMin > 0 && byKey.balloon.perMin > 0, 'all three sell');
  assert.ok(byKey.snack.sellsPerMin > byKey.hat.sellsPerMin, 'cheap snacks sell more often than pricey hats');
  assert.ok(byKey.hat.price > byKey.snack.price, 'hats cost more per unit');
  assert.ok(Math.abs(r.perMin - r.items.reduce((s, i) => s + i.perMin, 0)) < 1e-9, 'total = sum of items');
}

// the multipliers stack: appeal, hype, marketing, biome (snacks only)
{
  const base = concessionsRate({ crowd: 25, upgrades: upg({ snacks: 3, hats: 2 }), station });
  const boosted = concessionsRate({ crowd: 25, upgrades: upg({ snacks: 3, hats: 2 }), station, janitorMult: 1.2, hype: 1.3, vendorMult: 1.5 });
  assert.ok(Math.abs(boosted.perMin - base.perMin * 1.2 * 1.3 * 1.5) < 1e-6, 'janitor × hype × marketing scale sales');
  // Desert snackMult lifts snacks only, not hats
  const desert = concessionsRate({ crowd: 25, upgrades: upg({ snacks: 3, hats: 2 }), station, snackMult: 1.5 });
  const dByKey = Object.fromEntries(desert.items.map(i => [i.key, i]));
  const bByKey = Object.fromEntries(base.items.map(i => [i.key, i]));
  assert.ok(Math.abs(dByKey.snack.perMin - bByKey.snack.perMin * 1.5) < 1e-6, 'Desert lifts snacks ×1.5');
  assert.ok(Math.abs(dByKey.hat.perMin - bByKey.hat.perMin) < 1e-9, 'biome thirst does not touch hats');
}

// sale picker is weighted by each item's share of the rate, deterministic on r
{
  const { items } = concessionsRate({ crowd: 40, upgrades: upg({ snacks: 4, hats: 3, balloons: 3 }), station: { snackCap: 60 } });
  assert.equal(pickConcessionSale([], 0.5), null);
  assert.equal(pickConcessionSale(items, 0), items.find(i => i.sellsPerMin > 0));
  // sampling many rolls reproduces the sales-share distribution
  const counts = { snack: 0, hat: 0, balloon: 0 };
  const N = 6000;
  for (let k = 0; k < N; k++) counts[pickConcessionSale(items, (k + 0.5) / N).key]++;
  const total = items.reduce((s, i) => s + i.sellsPerMin, 0);
  for (const i of items) {
    assert.ok(Math.abs(counts[i.key] / N - i.sellsPerMin / total) < 0.03, `${i.key} share ≈ its rate`);
  }
}

// the POS accumulator fires whole sales, caps the visualized pops, and the
// expected credited money equals perMin
{
  const rate = concessionsRate({ crowd: 40, upgrades: upg({ snacks: 4, hats: 3, balloons: 3 }), station: { snackCap: 60 } });
  const avg = rate.perMin / rate.salesPerMin;   // sales-weighted average price
  let acc = 0, sales = 0;
  for (let i = 0; i < 600; i++) {   // 600 × 0.1s = 60s
    const d = drainSales(acc, rate.salesPerMin, 0.1, 3);
    acc = d.acc; sales += d.sales;
    assert.ok(d.popped <= 3, 'pops are capped per slice');
  }
  assert.ok(Math.abs(sales - rate.salesPerMin) / rate.salesPerMin < 0.02, 'a minute of draining ≈ salesPerMin');
  // crediting each sale at the average price recovers perMin
  assert.ok(Math.abs(sales * avg - rate.perMin) / rate.perMin < 0.02, 'sales × avg price ≈ perMin');

  // a huge park sells faster than it pops — cap binds, rest credited smoothly
  const busy = drainSales(0, 6000, 0.1, 3);   // 6000/min × 0.1s = 10 sales this slice
  assert.equal(busy.sales, 10);
  assert.equal(busy.popped, 3, 'coin pops capped so huge parks do not spam');
}

console.log('concessions tests passed');
