// Concessions — the stuff guests buy while they're in the park (snacks, hats,
// balloons). One unified point-of-sale stream, credited when a guest buys, not
// when they board the coaster.
//
// Design (replaces the old flat snack drip + the hats/balloons-at-dispatch lump):
//  · The WHOLE crowd buys, not just riders — sales scale with foot traffic
//    (queue + plaza), so marketing and arrivals that grow the crowd also grow
//    concession income.
//  · Each item has its own price and buy-frequency; the per-guest yield is a
//    blend of those, not a single flat number — the "fixed" feel is gone.
//  · Prices scale with ticket prestige, so a premium park charges premium
//    prices instead of a frozen $3 snack forever.
//  · Sales fire as discrete events (coin pops over the crowd); the caller
//    credits money per sale so the balance sheet's expected $/min holds.

// Buy frequency = expected purchases per present guest per minute, per upgrade
// level. Kept low so a guest buys occasionally, not constantly.
export const CONCESSIONS = [
  { key: 'snack',   name: 'Snacks',   icon: '🍿', upgrade: 'snacks',   basePrice: 3,  pricePerTicket: 0.5, freqPerLevel: 0.10, biomeSnack: true },
  { key: 'balloon', name: 'Balloons', icon: '🎈', upgrade: 'balloons', basePrice: 6,  pricePerTicket: 0.4, freqPerLevel: 0.05 },
  { key: 'hat',     name: 'Hats',     icon: '🎩', upgrade: 'hats',     basePrice: 14, pricePerTicket: 0.8, freqPerLevel: 0.035 },
];

// PLAYTEST TUNABLES: service caps, Food Court spend, and the dwell curve.
// Item prices and buy frequencies are the CONCESSIONS table directly above.
export const CONCESSION_TUNING = Object.freeze({
  baseServeCap: 30,
  serveCapPerCanopy: 40,
  serveCapPerFoodCourt: 60,
  foodCourtSpendMult: 1.15,
  dwellRefMin: 3.5,
  dwellGain: 3.0,
});
export const CONCESSION_BASE_CAP = CONCESSION_TUNING.baseServeCap;
export const CONCESSION_CAP_PER_CANOPY = CONCESSION_TUNING.serveCapPerCanopy;
export const CONCESSION_CAP_PER_FOODCOURT = CONCESSION_TUNING.serveCapPerFoodCourt;
export const FOODCOURT_SPEND_MULT = CONCESSION_TUNING.foodCourtSpendMult;

// Dwell reward — the "destination build" lever. Guests who spend longer in a
// slow, full queue buy more; a fast-dispatch thrill park clears the line before
// anyone gets bored enough to shop. dwellMult saturates so it can't run away:
//   dwellMult = 1 + GAIN * (1 - e^(-avgDwellMin / REF)),  bounded to [1, 1+GAIN]
// avgDwellMin = queue length / boardings-per-min (Little's Law). REF is the wait
// (minutes) at which the bonus reaches ~63% of its max.
export const DWELL_REF_MIN = CONCESSION_TUNING.dwellRefMin;
export const DWELL_GAIN = CONCESSION_TUNING.dwellGain;

export function dwellMultiplier(avgDwellMin = 0) {
  const w = Math.max(0, Number.isFinite(avgDwellMin) ? avgDwellMin : 0);
  return 1 + DWELL_GAIN * (1 - Math.exp(-w / DWELL_REF_MIN));
}

const lvl = (upgrades, key) => upgrades?.[key]?.level || 0;

// Expected concession economics for the current crowd + park. `crowd` is the
// number of guests present (the queue/plaza pool). Returns the per-item
// breakdown plus totals; `perMin` is the honest expected income, `salesPerMin`
// the expected number of purchases (drives the coin-pop cadence).
export function concessionsRate({
  crowd = 0,
  upgrades = {},
  station = {},
  ticketLevel = 0,
  janitorMult = 1,   // clean, well-staffed park → guests linger and spend
  hype = 1,
  vendorMult = 1,    // Family Package marketing
  snackMult = 1,     // Desert biome: thirsty guests (snacks only)
  thrillMult = 1,    // thrilled crowds splurge — economy passes 1 + excitement/60
  avgDwellMin = 0,   // how long the average guest waits in line (queue / throughput)
}) {
  // Food Court: the compounding "concessions empire" lever — each level serves a
  // far bigger crowd and multiplies spend, so a destination park can reach ride-
  // competitive income from footfall alone.
  const foodCourt = lvl(upgrades, 'foodCourt');
  const cap = (Number.isFinite(station.snackCap) ? station.snackCap : CONCESSION_BASE_CAP)
    + lvl(upgrades, 'canopy') * CONCESSION_CAP_PER_CANOPY
    + foodCourt * CONCESSION_CAP_PER_FOODCOURT;
  const served = Math.min(Math.max(0, Math.round(crowd)), cap);
  const dwellMult = dwellMultiplier(avgDwellMin);
  const foodCourtMult = Math.pow(FOODCOURT_SPEND_MULT, foodCourt);
  const baseMult = Math.max(0, janitorMult) * Math.max(0, hype) * Math.max(0, vendorMult) *
    Math.max(0, thrillMult) * dwellMult * foodCourtMult;

  const items = [];
  let perMin = 0, salesPerMin = 0;
  for (const c of CONCESSIONS) {
    const level = lvl(upgrades, c.upgrade);
    const price = c.basePrice + c.pricePerTicket * Math.max(0, ticketLevel);
    const mult = baseMult * (c.biomeSnack ? Math.max(0, snackMult) : 1);
    const sells = served * c.freqPerLevel * level * mult;
    const money = sells * price;
    perMin += money;
    salesPerMin += sells;
    items.push({ key: c.key, name: c.name, icon: c.icon, level, price, sellsPerMin: sells, perMin: money });
  }
  return { perMin, salesPerMin, cap, served, dwellMult, foodCourtMult, avgDwellMin, items };
}

// Pick which item a sale is for, weighted by each item's share of the sale
// rate. `r` in [0,1). Returns the item, or null if nothing is on offer.
export function pickConcessionSale(items = [], r = Math.random()) {
  const total = items.reduce((s, i) => s + (i.sellsPerMin || 0), 0);
  if (total <= 0) return null;
  let roll = Math.max(0, Math.min(1, r)) * total;
  for (const i of items) {
    roll -= i.sellsPerMin || 0;
    if (roll <= 0) return i;
  }
  return items[items.length - 1] || null;
}

// Advance the point-of-sale accumulator by one sim slice. Returns the leftover
// fractional accumulator, the whole number of sales that occurred, and how many
// of those to visualize as coin pops (capped so a huge park doesn't spam them).
// Money is credited by the caller: pop `popped` real sales, then the remaining
// (sales − popped) at the average price — expected total equals perMin.
export function drainSales(acc = 0, salesPerMin = 0, dt = 0, maxPops = Infinity) {
  const total = Math.max(0, acc) + Math.max(0, salesPerMin) / 60 * Math.max(0, dt);
  const sales = Math.floor(total);
  return { acc: total - sales, sales, popped: Math.min(Math.max(0, maxPops), sales) };
}
