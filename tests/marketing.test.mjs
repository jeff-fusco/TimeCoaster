import assert from 'node:assert/strict';
import {
  CHANNELS,
  MAX_CHANNEL_WEIGHT,
  activeChannels,
  campaignEfficiency,
  channelEffects,
  channelMultiplier,
  channelSaturation,
  channelUnlocked,
  clampMarketingPct,
  coverageBonus,
  createMarketingState,
  decayDemand,
  hasMarketer,
  marketingBudgetCap,
  normalizeMarketingState,
  rebalanceChannelWeights,
  setChannelWeight,
  steadyStateDemand,
  stepMarketing,
} from '../src/systems/marketing.js';

const staffWith = (hired, trained = 0) => ({ marketers: { hired, trained } });
const channel = key => CHANNELS.find(c => c.key === key);

// gating + budget capacity mirror the R&D pattern
{
  assert.equal(hasMarketer({}), false);
  assert.equal(hasMarketer(staffWith(1)), true);
  assert.equal(marketingBudgetCap({}), 0);
  assert.equal(marketingBudgetCap(staffWith(3)), 18, '6% budget per marketer');
  assert.equal(clampMarketingPct(50, staffWith(2)), 12, 'clamped to hired capacity');
  assert.equal(clampMarketingPct(-5, staffWith(2)), 0);
}

// channel unlocks: research opens channels instead of raising a cap ladder
{
  const staff = staffWith(1);
  assert.equal(channelUnlocked('streetTeam', { staff }), true, 'first hire opens Street Team');
  assert.equal(channelUnlocked('streetTeam', { staff: {} }), false, 'no marketer, no marketing');
  assert.equal(channelUnlocked('broadcast', { staff }), false);
  assert.equal(channelUnlocked('broadcast', { staff, researchDone: { radio: true } }), true);
  assert.equal(channelUnlocked('spotlight', { staff, researchDone: { viral: true } }), true);
  assert.equal(channelUnlocked('family', { staff, researchDone: { flyers: true } }), true);
  assert.equal(
    channelUnlocked('heritage', { staff, researchDone: { mythicReputation: true } }),
    false, 'Heritage needs a monument to tour');
  assert.equal(
    channelUnlocked('heritage', { staff, researchDone: { mythicReputation: true }, monuments: 1 }),
    true);
}

// the arrival-side cap is Street ×2 × Broadcast ×6 = ×12 — same as v1
{
  const street = channel('streetTeam');
  const tv = channel('broadcast');
  assert.equal(street.cap * tv.cap, 12, 'endgame arrival cap unchanged by the redesign');
  // every effect saturates: absurd demand cannot exceed the channel cap
  for (const c of CHANNELS) {
    const huge = channelMultiplier(c.key, 1e9, { excitement: 1e9 });
    assert.ok(huge <= c.cap + 1e-9, `${c.key} saturates at its cap`);
    assert.equal(channelMultiplier(c.key, 0), 1, `${c.key}: no demand, no bonus`);
  }
}

// Ride Spotlight premium scales with the coaster's excitement — the build is the ad
{
  const dull = channelMultiplier('spotlight', 500, { excitement: 10 });
  const wild = channelMultiplier('spotlight', 500, { excitement: 120 });
  assert.ok(wild > dull, 'a better coaster makes the same campaign pay more');
  assert.equal(channelMultiplier('spotlight', 500, { excitement: 0 }), 1, 'nothing to show, nothing to sell');
}

// channelEffects aggregates the portfolio into the four game hooks
{
  const marketing = createMarketingState();
  marketing.channels.streetTeam.demand = 100;
  marketing.channels.broadcast.demand = 400;
  marketing.channels.family.demand = 200;
  const fx = channelEffects(marketing, { excitement: 60 });
  assert.ok(fx.arrivalMult > 5, 'street × broadcast multiply arrivals together');
  assert.ok(fx.arrivalMult <= 12 + 1e-9);
  assert.ok(fx.vendorMult > 1.5 && fx.vendorMult <= 1.75);
  assert.equal(fx.legacyMult, 1, 'no heritage demand yet');
  assert.deepEqual(channelEffects(null), { arrivalMult: 1, ticketMult: 1, vendorMult: 1, legacyMult: 1 });
}

// stepping: budget splits by weight; funded demand grows toward steady state
{
  const marketing = createMarketingState();
  marketing.fundingPct = 12;
  setChannelWeight(marketing, 'streetTeam', 5);
  setChannelWeight(marketing, 'broadcast', 5);
  const staff = staffWith(2, 0);
  const ctx = { staff, researchDone: { radio: true }, ratePerMin: 600, dt: 1 };
  let spent = 0;
  for (let i = 0; i < 600; i++) spent += stepMarketing({ marketing, ...ctx });
  // budget really costs money: 12% of $600/min over 10 min = $720
  assert.ok(Math.abs(spent - 720) < 5, `spent ~${spent.toFixed(0)}`);
  const ssStreet = steadyStateDemand('streetTeam', 12, 0.5, staff, 2);
  const ssTv = steadyStateDemand('broadcast', 12, 0.5, staff, 2);
  assert.ok(Math.abs(marketing.channels.streetTeam.demand - ssStreet) / ssStreet < 0.1,
    `street approaches steady state (${marketing.channels.streetTeam.demand.toFixed(1)} vs ${ssStreet.toFixed(1)})`);
  assert.ok(marketing.channels.broadcast.demand > marketing.channels.streetTeam.demand,
    'slow decay banks a deeper stock on the same spend');
  assert.ok(Math.abs(marketing.channels.broadcast.demand - ssTv) / ssTv < 0.35,
    'broadcast still climbing toward its (higher) steady state');
  assert.equal(marketing.channels.spotlight.demand, 0, 'locked channels receive nothing');

  // unfunded, every stock decays — fast channels fade first
  marketing.fundingPct = 0;
  const street0 = marketing.channels.streetTeam.demand;
  const tv0 = marketing.channels.broadcast.demand;
  for (let i = 0; i < 120; i++) stepMarketing({ marketing, ...ctx });
  assert.ok(marketing.channels.streetTeam.demand < street0 * 0.2, 'street buzz collapses in 2 minutes');
  assert.ok(marketing.channels.broadcast.demand > tv0 * 0.6, 'broadcast presence lingers');
}

// spreading the budget yields more total demand gain than stacking (share^0.8)
{
  const staff = staffWith(4, 0);
  const focused = createMarketingState();
  focused.fundingPct = 24;
  for (const c of CHANNELS) setChannelWeight(focused, c.key, c.key === 'streetTeam' ? 10 : 0);
  const spread = createMarketingState();
  spread.fundingPct = 24;
  for (const c of CHANNELS) setChannelWeight(spread, c.key, 5);
  const research = { radio: true, viral: true, flyers: true, mythicReputation: true };
  const args = { staff, researchDone: research, monuments: 1, ratePerMin: 600, dt: 1 };
  for (let i = 0; i < 60; i++) {
    stepMarketing({ marketing: focused, ...args });
    stepMarketing({ marketing: spread, ...args });
  }
  const total = m => CHANNELS.reduce((s, c) => s + m.channels[c.key].demand, 0);
  assert.ok(total(spread) > total(focused), 'spreading earns more total demand');
  assert.ok(focused.channels.streetTeam.demand > spread.channels.streetTeam.demand,
    'specializing pushes one channel further');
  assert.equal(activeChannels(spread, args).length, 5, 'all channels active when unlocked + weighted');

  // Full Coverage synergy: every funded channel beyond the first lifts the
  // whole department, and the steady-state projection agrees with the step
  assert.equal(coverageBonus(1), 1, 'one megaphone earns no synergy');
  assert.ok(Math.abs(coverageBonus(5) - 1.48) < 1e-9, '+12% per extra funded channel');
  assert.ok(
    steadyStateDemand('broadcast', 12, 0.5, staff, 3) > steadyStateDemand('broadcast', 12, 0.5, staff, 1),
    'the same share projects higher inside a varied portfolio');
}

// mixer rebalance: unlocked channels share one budget pie — raise one, the
// others dip proportionally, and slices always sum to the full pie
{
  const staff = staffWith(2);
  const ctx = { staff, researchDone: { radio: true, viral: true } };
  const m = createMarketingState();
  m.channels.streetTeam.weight = 60;
  m.channels.broadcast.weight = 30;
  m.channels.spotlight.weight = 10;
  rebalanceChannelWeights(m, 'streetTeam', 80, ctx);
  assert.equal(m.channels.streetTeam.weight, 80);
  assert.equal(m.channels.broadcast.weight, 15, 'the rest split the remainder 3:1');
  assert.equal(m.channels.spotlight.weight, 5);
  assert.equal(m.channels.family.weight, 20, 'locked channels sit outside the pie');

  // lowering a channel raises EVERY other funded channel, not just the biggest
  rebalanceChannelWeights(m, 'streetTeam', 60, ctx);
  assert.equal(m.channels.broadcast.weight, 30, 'broadcast reclaims its 3:1 share');
  assert.equal(m.channels.spotlight.weight, 10, 'spotlight rises too');

  // dropping a maxed channel hands the pie back evenly when others are at zero
  rebalanceChannelWeights(m, 'streetTeam', 100, ctx);
  assert.equal(m.channels.broadcast.weight + m.channels.spotlight.weight, 0);
  rebalanceChannelWeights(m, 'streetTeam', 40, ctx);
  assert.equal(m.channels.streetTeam.weight, 40);
  assert.equal(m.channels.broadcast.weight, 30, 'zeroed channels rejoin evenly');
  assert.equal(m.channels.spotlight.weight, 30);

  // a single unlocked channel just takes the value; junk targets clamp
  const solo = createMarketingState();
  rebalanceChannelWeights(solo, 'streetTeam', 999, { staff });
  assert.equal(solo.channels.streetTeam.weight, 100);
  rebalanceChannelWeights(solo, 'broadcast', 5, { staff }, 'locked channel is ignored');
  assert.equal(solo.channels.broadcast.weight, 20, 'untouched — broadcast is not unlocked yet');
}

// specialist marketers bend their channel: channelFx build/decay multipliers
{
  const staff = staffWith(4);
  const research = { radio: true };
  const base = createMarketingState();
  base.fundingPct = 24;
  setChannelWeight(base, 'streetTeam', 5);
  setChannelWeight(base, 'broadcast', 5);
  const boosted = JSON.parse(JSON.stringify(base));
  const args = { staff, researchDone: research, ratePerMin: 600, dt: 1 };
  const fx = { build: { streetTeam: 1.5 }, decay: { broadcast: 0.5 } };
  for (let i = 0; i < 120; i++) {
    stepMarketing({ marketing: base, ...args });
    stepMarketing({ marketing: boosted, ...args, channelFx: fx });
  }
  assert.ok(boosted.channels.streetTeam.demand > base.channels.streetTeam.demand * 1.3,
    'a Street Smart crew builds Street Team visibly faster');
  assert.ok(boosted.channels.broadcast.demand > base.channels.broadcast.demand,
    'slower decay banks a deeper Broadcast stock');

  // offline decay honors the same bend
  const warm = createMarketingState();
  warm.channels.broadcast.demand = 100;
  const cold = createMarketingState();
  cold.channels.broadcast.demand = 100;
  decayDemand(cold, 300);
  decayDemand(warm, 300, { decay: { broadcast: 0.5 } });
  assert.ok(warm.channels.broadcast.demand > cold.channels.broadcast.demand,
    'Radio Voice keeps Broadcast warmer overnight');
}

// money constraint: an empty bank buys no demand but decay still runs
{
  const marketing = createMarketingState();
  marketing.fundingPct = 12;
  marketing.channels.streetTeam.demand = 50;
  const spend = stepMarketing({
    marketing, staff: staffWith(2), ratePerMin: 600, dt: 1, availableMoney: 0,
  });
  assert.equal(spend, 0);
  assert.ok(marketing.channels.streetTeam.demand < 50, 'decay does not wait for payroll');
}

// trained marketers reach a higher steady state on the same budget
{
  const rookie = steadyStateDemand('broadcast', 12, 1, staffWith(2, 0));
  const veteran = steadyStateDemand('broadcast', 12, 1, staffWith(2, 4));
  assert.ok(veteran > rookie * 1.3, 'training lifts campaign efficiency');
  assert.ok(campaignEfficiency(60) < campaignEfficiency(10), 'big budgets have diminishing per-dollar punch');
}

// offline decay honors per-channel half-lives
{
  const m = createMarketingState();
  m.channels.streetTeam.demand = 100;
  m.channels.broadcast.demand = 100;
  decayDemand(m, Math.log(2) / channel('broadcast').decay);   // one broadcast half-life
  assert.ok(Math.abs(m.channels.broadcast.demand - 50) < 0.5, 'broadcast halves');
  assert.ok(m.channels.streetTeam.demand < 1, 'street buzz is long gone');
}

// normalization: v1 scalar demand migrates into Broadcast; junk is dropped
{
  const v1 = normalizeMarketingState({ fundingPct: 200, demand: 100 });
  assert.equal(v1.fundingPct, 100);
  assert.equal(v1.channels.broadcast.demand, 100, 'v1 demand lands in the durable channel');
  assert.equal(v1.channels.streetTeam.demand, 0);

  const v2 = normalizeMarketingState({
    fundingPct: 10,
    channels: {
      streetTeam: { weight: 999, demand: -5 },
      broadcast: { weight: 2.6, demand: 40 },
      bogus: { weight: 5, demand: 1000 },
    },
  });
  assert.equal(v2.channels.streetTeam.weight, MAX_CHANNEL_WEIGHT, 'weights clamp to the pie');
  assert.equal(v2.channels.streetTeam.demand, 0, 'negative demand clamps to zero');
  assert.equal(v2.channels.broadcast.weight, 3, 'weights round to whole slices');
  assert.equal(v2.channels.bogus, undefined, 'unknown channels are dropped');

  const fresh = normalizeMarketingState(null);
  assert.equal(fresh.fundingPct, 0);
  assert.equal(fresh.channels.streetTeam.weight, 20, 'default weights split evenly');

  // saturation helper stays in [0, 1)
  assert.equal(channelSaturation('broadcast', 0), 0);
  assert.ok(channelSaturation('broadcast', 1e9) <= 1);
}

console.log('marketing tests passed');
