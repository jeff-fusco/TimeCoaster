// Marketing Department v2: a channel portfolio, not research 2.0. Hire
// Marketers, set a total budget (% of income), then distribute it across
// campaign **channels**. Each channel builds its own Demand stock — with its
// own build speed, decay half-life, and effect — and every channel boosts a
// *different* system (arrivals, ticket premium, vendor income, legacy income).
// Pure and testable.
//
// Balance shape (deliberate):
//  · Demand gain is driven by the *fraction* of income spent, not absolute $,
//    so the system is scale-free — 20% budget behaves the same at $500/min and
//    $50M/min. No runaway feedback: every effect saturates at its channel cap.
//  · The arrival-side cap is Street Team ×2 × Broadcast ×6 = ×12 endgame —
//    identical to the old single-stock cap, so overall pacing holds. The other
//    channels redistribute power into ticket/vendor/legacy income.
//  · Spend split uses share^0.8 per channel, so spreading the budget yields
//    more total Demand than stacking one channel — but specializing pushes a
//    single channel toward its cap faster. Both are viable plays.
//  · Marketing research unlocks channels instead of raising a bare cap ladder:
//    radio → Broadcast, viral → Ride Spotlight, flyers → Family Package,
//    mythicReputation (+ a monument) → Heritage Tours.

export const MARKETER_BUDGET_PCT = 6;     // budget capacity per marketer hired
export const MARKETER_SKILL = 0.15;       // campaign efficiency per training level
export const SPREAD_EXPONENT = 0.8;       // share^0.8 — spreading beats stacking
export const MAX_CHANNEL_WEIGHT = 100;    // budget-pie slices (percent) per channel
export const SYNERGY_PER_CHANNEL = 0.12;  // Full Coverage: efficiency per extra funded channel

// The channel portfolio. `decay` is per second (half-life = ln2/decay);
// `scale` is the demand level reaching ~63% saturation; `cap` is the effect
// multiplier ceiling. Fast channels react in under a minute, slow channels
// are the idle backbone that survives a coffee break.
export const CHANNELS = [
  {
    key: 'streetTeam', name: 'Street Team', icon: '📄',
    effect: 'arrivalMult', cap: 2,
    decay: 0.0154, scale: 25,             // half-life ≈ 45s — the tactical knob
    research: null,                        // unlocked with the first Marketer
    desc: 'Flyers on the boulevard. Guests arrive fast — and forget fast.',
  },
  {
    key: 'broadcast', name: 'Broadcast', icon: '📺',
    effect: 'arrivalMult', cap: 6,
    decay: 0.00231, scale: 150,            // half-life ≈ 5min — the idle backbone
    research: 'radio',
    desc: 'Radio and TV spots. Slow to build, slow to fade.',
  },
  {
    key: 'spotlight', name: 'Ride Spotlight', icon: '🎢',
    effect: 'ticketMult', cap: 1.5,
    decay: 0.00462, scale: 80,             // half-life ≈ 150s
    research: 'viral',
    desc: 'Viral ride footage. Ticket premium scales with the coaster’s excitement.',
  },
  {
    key: 'family', name: 'Family Package', icon: '🎈',
    effect: 'vendorMult', cap: 1.75,
    decay: 0.00462, scale: 80,             // half-life ≈ 150s
    research: 'flyers',
    desc: 'Bundle deals. Every guest spends more on snacks and souvenirs.',
  },
  {
    key: 'heritage', name: 'Heritage Tours', icon: '🏛️',
    effect: 'legacyMult', cap: 2,
    decay: 0.00231, scale: 150,            // half-life ≈ 5min
    research: 'mythicReputation', needsMonument: true,
    desc: 'Market your history. Monument income climbs while tours run.',
  },
];

const CHANNEL_BY_KEY = Object.fromEntries(CHANNELS.map(c => [c.key, c]));

export function createMarketingState() {
  const channels = {};
  // equal slices of the budget pie for all five channels (only unlocked ones
  // actually spend; shares are relative so the sum need not stay 100)
  for (const c of CHANNELS) channels[c.key] = { weight: 20, demand: 0 };
  return { fundingPct: 0, channels };
}

export function normalizeMarketingState(marketing) {
  const state = createMarketingState();
  if (!marketing || typeof marketing !== 'object') return state;
  if (Number.isFinite(marketing.fundingPct)) {
    state.fundingPct = Math.max(0, Math.min(100, marketing.fundingPct));
  }
  // v1 saves carried a single scalar `demand` — that stock was the durable
  // campaign presence, so it migrates into Broadcast.
  if (Number.isFinite(marketing.demand) && marketing.demand > 0) {
    state.channels.broadcast.demand = Math.max(0, marketing.demand);
  }
  if (marketing.channels && typeof marketing.channels === 'object') {
    for (const c of CHANNELS) {
      const saved = marketing.channels[c.key];
      if (!saved || typeof saved !== 'object') continue;
      const slot = state.channels[c.key];
      if (Number.isFinite(saved.weight)) {
        slot.weight = Math.max(0, Math.min(MAX_CHANNEL_WEIGHT, Math.round(saved.weight)));
      }
      if (Number.isFinite(saved.demand)) slot.demand = Math.max(0, saved.demand);
    }
  }
  return state;
}

export function hasMarketer(staff = {}) {
  return (staff.marketers?.hired || 0) > 0;
}

export function marketingBudgetCap(staff = {}) {
  return Math.min(100, Math.max(0, staff.marketers?.hired || 0) * MARKETER_BUDGET_PCT);
}

export function clampMarketingPct(pct = 0, staff = {}) {
  const p = Number.isFinite(pct) ? pct : 0;
  return Math.max(0, Math.min(marketingBudgetCap(staff), p));
}

// Trained marketers run better campaigns; big budgets have diminishing returns
// (same shape as research funding, so the two systems feel like siblings).
export function campaignEfficiency(fundingPct = 0, staff = {}) {
  const pct = Math.max(0, Math.min(100, fundingPct));
  const trained = staff.marketers?.trained || 0;
  const diminishing = 1 / (1 + (pct / 100) * 0.45);
  return diminishing * (1 + MARKETER_SKILL * trained);
}

// A channel is open for *spending* when its research is done (Street Team
// needs only the first Marketer; Heritage also needs a monument to tour).
export function channelUnlocked(key, { staff = {}, researchDone = {}, monuments = 0 } = {}) {
  const c = CHANNEL_BY_KEY[key];
  if (!c || !hasMarketer(staff)) return false;
  if (c.research && !researchDone[c.research]) return false;
  if (c.needsMonument && monuments <= 0) return false;
  return true;
}

// Channels that receive budget this tick: unlocked with a nonzero weight.
export function activeChannels(marketing, ctx = {}) {
  return CHANNELS.filter(c =>
    channelUnlocked(c.key, ctx) && (marketing.channels[c.key]?.weight || 0) > 0);
}

// Effect saturation for one channel's demand level: 0 → 1 toward the cap.
export function channelSaturation(key, demand = 0) {
  const c = CHANNEL_BY_KEY[key];
  if (!c) return 0;
  return 1 - Math.exp(-Math.max(0, demand) / c.scale);
}

// Effect multiplier for one channel. Ride Spotlight is the special case: its
// premium scales with the active coaster's excitement — your build quality is
// the advertisement (pillar 2).
export function channelMultiplier(key, demand = 0, { excitement = 0 } = {}) {
  const c = CHANNEL_BY_KEY[key];
  if (!c) return 1;
  let reach = channelSaturation(key, demand);
  if (key === 'spotlight') reach *= Math.max(0, Math.min(1, excitement / 120));
  return 1 + (c.cap - 1) * reach;
}

// Aggregate the portfolio into the four hooks the rest of the game consumes.
// Demand keeps paying even if a channel's unlock state changes — hype fades on
// its own schedule, it doesn't check paperwork.
export function channelEffects(marketing, ctx = {}) {
  const fx = { arrivalMult: 1, ticketMult: 1, vendorMult: 1, legacyMult: 1 };
  if (!marketing?.channels) return fx;
  for (const c of CHANNELS) {
    const demand = marketing.channels[c.key]?.demand || 0;
    if (demand <= 0) continue;
    fx[c.effect] *= channelMultiplier(c.key, demand, ctx);
  }
  return fx;
}

// Full Coverage synergy: campaigns amplify each other — every *funded* channel
// beyond the first raises the whole department's efficiency. The explicit
// reward for running a varied portfolio instead of one big megaphone.
export function coverageBonus(activeCount = 1) {
  return 1 + SYNERGY_PER_CHANNEL * Math.max(0, activeCount - 1);
}

// Steady-state demand for a sustained budget share — what the panel projects.
export function steadyStateDemand(key, fundingPct, share, staff = {}, activeCount = 1) {
  const c = CHANNEL_BY_KEY[key];
  const pct = clampMarketingPct(fundingPct, staff);
  if (!c || pct <= 0 || share <= 0 || !hasMarketer(staff)) return 0;
  return (pct / 100) * Math.pow(Math.min(1, share), SPREAD_EXPONENT) *
    campaignEfficiency(pct, staff) * coverageBonus(activeCount) / c.decay;
}

// Advance the portfolio one slice: spend the budget (caller deducts the
// returned $ from the bank), split it across active channels by weight, and
// grow/decay every channel's demand. `ratePerMin` prices the budget; demand
// gain itself is scale-free (driven by pct + share, not $).
//
// `channelFx` carries the marketers' specialist-trait bends (staffPeople's
// marketingTraitFx): { build: {key: mult}, decay: {key: mult} } — a Street
// Smart hire builds Street Team faster, a Radio Voice slows Broadcast decay.
export function stepMarketing({ marketing, staff, ratePerMin, dt, availableMoney = Infinity, researchDone = {}, monuments = 0, channelFx = {} }) {
  const pct = clampMarketingPct(marketing.fundingPct, staff);
  marketing.fundingPct = pct;
  let spend = 0;
  const active = activeChannels(marketing, { staff, researchDone, monuments });
  const totalWeight = active.reduce((sum, c) => sum + marketing.channels[c.key].weight, 0);
  if (pct > 0 && totalWeight > 0) {
    const desired = Math.max(0, ratePerMin) * pct / 100 / 60 * dt;
    spend = Math.min(Math.max(0, availableMoney), desired);
    const paidFrac = desired > 0 ? spend / desired : 0;
    const efficiency = campaignEfficiency(pct, staff) * coverageBonus(active.length);
    for (const c of active) {
      const share = marketing.channels[c.key].weight / totalWeight;
      const build = channelFx.build?.[c.key] || 1;
      marketing.channels[c.key].demand +=
        (pct / 100) * Math.pow(share, SPREAD_EXPONENT) * efficiency * build * dt * paidFrac;
    }
  }
  for (const c of CHANNELS) {
    const slot = marketing.channels[c.key];
    const decayMult = channelFx.decay?.[c.key] || 1;
    slot.demand = Math.max(0, slot.demand * Math.exp(-c.decay * decayMult * dt));
  }
  return spend;
}

export function setChannelWeight(marketing, key, weight) {
  const slot = marketing?.channels?.[key];
  if (!slot) return;
  const w = Number.isFinite(weight) ? Math.round(weight) : 0;
  slot.weight = Math.max(0, Math.min(MAX_CHANNEL_WEIGHT, w));
}

// Mixer-style rebalance: the unlocked channels share one budget pie
// (MAX_CHANNEL_WEIGHT slices). Setting one channel's slice scales the others
// to the remainder, preserving their proportions — raise one, the rest dip.
// Largest-remainder rounding keeps the slices integers that sum exactly.
export function rebalanceChannelWeights(marketing, key, targetWeight, ctx = {}) {
  if (!marketing?.channels?.[key]) return;
  const unlocked = CHANNELS.filter(c => channelUnlocked(c.key, ctx));
  if (!unlocked.some(c => c.key === key)) return;
  const pie = MAX_CHANNEL_WEIGHT;
  const w = Math.max(0, Math.min(pie, Math.round(Number.isFinite(targetWeight) ? targetWeight : 0)));
  const others = unlocked.filter(c => c.key !== key);
  marketing.channels[key].weight = w;
  if (!others.length) return;
  const rest = pie - w;
  const oldRest = others.reduce((s, c) => s + (marketing.channels[c.key].weight || 0), 0);
  const slices = others.map(c => {
    const frac = oldRest > 0 ? (marketing.channels[c.key].weight || 0) / oldRest : 1 / others.length;
    const exact = rest * frac;
    return { key: c.key, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let leftover = rest - slices.reduce((s, t) => s + t.floor, 0);
  slices.sort((a, b) => b.frac - a.frac);
  for (const t of slices) {
    marketing.channels[t.key].weight = t.floor + (leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover--;
  }
}

// Hype fades while the park is closed (used by offline progress on load).
// Each channel keeps its own half-life — Street Team buzz is gone after any
// real absence; a Broadcast push is still warm the next morning. Radio Voice
// marketers (channelFx.decay) keep it warmer still.
export function decayDemand(marketing, seconds, channelFx = {}) {
  if (!marketing?.channels || !Number.isFinite(seconds) || seconds <= 0) return;
  for (const c of CHANNELS) {
    const slot = marketing.channels[c.key];
    const decayMult = channelFx.decay?.[c.key] || 1;
    slot.demand = Math.max(0, slot.demand * Math.exp(-c.decay * decayMult * seconds));
  }
}
