import assert from 'node:assert/strict';
import {
  ROLE_BASE,
  STAFF_ROLES,
  TRAITS,
  _makeTestPerson,
  aggregateStaff,
  canTrainPerson,
  createRoster,
  generatePerson,
  marketingTraitFx,
  migrateCountsToRoster,
  normalizeRoster,
  offlineEfficiencyBonus,
  payrollScale,
  PAYROLL_SCALE_BASE,
  personAtLevel,
  personCoverage,
  personSalary,
  researchEffMult,
  rollApplicants,
  showstopperArrivalMult,
  signingFee,
  tenureMult,
  totalPayroll,
  trainingFee,
} from '../src/systems/staffPeople.js';
import { deriveEconomy } from '../src/systems/economy.js';

const station = {
  arrivalBase: 0.6, baseUnload: 1.8, baseLoad: 2.2, snackPerGuest: 3,
  snackCap: 30, queueBase: 10, queueStep: 10, baseDispatch: 3.0,
};
function makeUpgrades() {
  return {
    car: { base: 90, growth: 2.05, level: 1, max: 16 },
    seats: { base: 130, growth: 2.05, level: 2, max: 24 },
    speed: { base: 120, growth: 2.08, level: 0, max: 30 },
    train: { base: 2500, growth: 5.8, level: 0, max: 4 },
    queue: { base: 170, growth: 2.08, level: 0, max: 24 },
    snacks: { base: 320, growth: 2.55, level: 1, max: 18 },
    express: { base: 650, growth: 2.35, level: 0, max: 18 },
    ticket: { base: 85, growth: 1.92, level: 0, max: 30 },
    hype: { base: 260, growth: 2.35, level: 0, max: 24 },
  };
}
const pathStats = { excitement: 60, lapTime: 8, maxSpeed: 18, length: 300 };

// determinism: a person is a pure function of (role, seed)
{
  const a = generatePerson('operators', 12345);
  const b = generatePerson('operators', 12345);
  assert.deepEqual(a, b, 'same seed → identical person');
  const c = generatePerson('scientists', 12345);
  assert.notEqual(a.name === c.name && a.competence === c.competence, true, 'role changes the person');
  assert.equal(a.role, 'operators');
  assert.ok(a.name.includes(' '), 'has a first and last name');
  assert.equal(a.axisNames.length, 2, 'two skill axes');
  assert.ok(a.potential >= 3 && a.potential <= 8, 'potential in range');
}

// population is well-formed and centered — mean coverage ≈ 1.0 so an average
// roster reproduces the old headcount
{
  let covSum = 0, n = 0;
  const rarities = new Set();
  for (const role of STAFF_ROLES) {
    for (let seed = 1; seed <= 400; seed++) {
      const p = generatePerson(role, seed * 7 + 3);
      const cov = personCoverage(p);
      assert.ok(cov >= 0.79 && cov <= 1.26, `${role} coverage in band: ${cov}`);
      assert.ok(p.competence >= 0 && p.competence <= 1);
      assert.ok(p.traits.length >= 1 && p.traits.length <= 2, 'one or two traits');
      for (const t of p.traits) {
        assert.ok(TRAITS[t], `known trait ${t}`);
        const roles = TRAITS[t].roles;
        assert.ok(!roles || roles.includes(role), `${t} only rolls for its role`);
      }
      rarities.add(p.rarity);
      covSum += cov; n++;
    }
  }
  const meanCov = covSum / n;
  assert.ok(Math.abs(meanCov - 1.0) < 0.04, `mean coverage ≈ 1.0 (got ${meanCov.toFixed(3)})`);
  assert.ok(rarities.has('common') && rarities.has('star'), 'the full rarity spread appears');
}

// aggregation math: hired = headcount, trained = coverage-weighted mean level
{
  const roster = createRoster();
  roster.operators = [{ seed: 11, level: 4 }, { seed: 22, level: 4 }, { seed: 33, level: 4 }];
  const agg = aggregateStaff(roster);
  assert.equal(agg.operators.hired, 3, 'headcount is exact');
  assert.ok(Math.abs(agg.operators.trained - 4) < 1e-9, 'all-level-4 roster → trained exactly 4');
  assert.equal(agg.entertainers.hired, 0, 'untouched roles read as empty crew');
  assert.equal(agg.entertainers.trained, 0);

  // a mixed roster: trained lands between the members' levels, coverage-weighted
  roster.mechanics = [{ seed: 5, level: 0 }, { seed: 6, level: 6 }];
  const mixed = aggregateStaff(roster).mechanics;
  assert.ok(mixed.trained > 0 && mixed.trained < 6, 'mixed levels average out');
  assert.equal(mixed.hired, 2);
  assert.ok(mixed.skill > 0.79 && mixed.skill < 1.26, 'skill is the mean coverage');
}

// THE BALANCE ANCHOR: an average roster is economy-equivalent to the old
// { hired, trained } counter. Since stage ⑤, `skill` deliberately bends the
// per-body effects — so transparency holds exactly at skill 1.0, and a
// talented crew out-earns the counter while a weak one under-earns.
{
  const roster = createRoster();
  roster.operators = [{ seed: 101, level: 3 }, { seed: 202, level: 3 }];
  roster.janitors = [{ seed: 303, level: 5 }];
  roster.scientists = [{ seed: 404, level: 2 }, { seed: 505, level: 2 }, { seed: 606, level: 2 }];
  const agg = aggregateStaff(roster);

  const oldCounts = {
    operators: { hired: 2, trained: 3 },
    janitors: { hired: 1, trained: 5 },
    scientists: { hired: 3, trained: 2 },
  };
  // neutralize talent: with skill forced to 1.0 the economy cannot tell a
  // roster from the old counters
  const neutral = Object.fromEntries(Object.entries(agg).map(([role, e]) => [role, { ...e, skill: 1 }]));
  const common = { upgrades: makeUpgrades(), pathStats, simQueue: 15, researchDone: {}, station, fallbackMaxSpeed: 4 };
  const viaPeople = deriveEconomy({ ...common, staff: neutral });
  const viaCounts = deriveEconomy({ ...common, staff: oldCounts });
  assert.ok(Math.abs(viaPeople.ratePerMin - viaCounts.ratePerMin) < 1e-6, 'income identical to the counter model at skill 1');
  assert.ok(Math.abs(viaPeople.arrivalRate - viaCounts.arrivalRate) < 1e-9, 'arrivals identical');
  assert.ok(Math.abs(viaPeople.queueCap - viaCounts.queueCap) < 1e-9, 'queue capacity identical');
  // and the funding caps the departments read still key off headcount
  assert.equal(agg.scientists.hired, 3, 'R&D budget cap source (headcount) preserved');

  // talent bends income the right way, within the designed band
  const talented = { entertainers: { hired: 2, trained: 0, skill: 1.2 } };
  const weak = { entertainers: { hired: 2, trained: 0, skill: 0.85 } };
  const base = { entertainers: { hired: 2, trained: 0 } };
  const rTalent = deriveEconomy({ ...common, staff: talented }).arrivalRate;
  const rWeak = deriveEconomy({ ...common, staff: weak }).arrivalRate;
  const rBase = deriveEconomy({ ...common, staff: base }).arrivalRate;
  assert.ok(rTalent > rBase && rBase > rWeak, 'skill scales the per-body effects');
  assert.ok(rTalent / rWeak < 1.1, 'talent is a nudge, not a new meta');
}

// salary + fees behave monotonically and traits bend them the right way
{
  const p = generatePerson('marketers', 9001);
  assert.ok(personSalary(p, 3) > personSalary(p, 0), 'salary rises with level');
  assert.ok(signingFee(p) > 0, 'a signing fee exists');
  assert.ok(trainingFee(p, 3) > trainingFee(p, 0), 'training gets pricier per level');
  assert.equal(canTrainPerson({ potential: 5 }, 5), false, 'cannot train past potential');
  assert.equal(canTrainPerson({ potential: 5 }, 4), true);

  // Quick Study is cheaper to train than Slow Starter, all else being noise
  const quick = { role: 'operators', competence: 0.5, potential: 8, traits: ['quickStudy'] };
  const slow = { role: 'operators', competence: 0.5, potential: 8, traits: ['slowStarter'] };
  assert.ok(trainingFee(quick, 2) < trainingFee(slow, 2), 'Quick Study trains cheaper than Slow Starter');
}

// payroll sums the whole roster
{
  const roster = createRoster();
  roster.operators = [{ seed: 1, level: 0 }, { seed: 2, level: 2 }];
  roster.scientists = [{ seed: 3, level: 4 }];
  const agg = aggregateStaff(roster);
  const expected = agg.operators.salaryPerMin + agg.scientists.salaryPerMin;
  assert.ok(Math.abs(totalPayroll(roster) - expected) < 1e-9, 'payroll = Σ member wages');
  assert.ok(totalPayroll(createRoster()) === 0, 'empty roster costs nothing');
}

// migration from the old counter save keeps crew size and skill
{
  const counts = {
    operators: { hired: 3, trained: 2 },
    scientists: { hired: 1, trained: 5 },
    marketers: { hired: 0, trained: 0 },
  };
  const roster = migrateCountsToRoster(counts);
  assert.equal(roster.operators.length, 3, 'headcount preserved');
  assert.equal(roster.scientists.length, 1);
  assert.equal(roster.marketers.length, 0);
  for (const m of roster.operators) {
    const person = generatePerson('operators', m.seed);
    assert.ok(m.level <= person.potential, 'migrated level clamped to potential');
  }
  // deterministic: same counts → same roster
  assert.deepEqual(migrateCountsToRoster(counts), roster, 'migration is deterministic');
  // the migrated roster still reads as ~3 operators to the economy
  assert.equal(aggregateStaff(roster).operators.hired, 3);
}

// job board rolls a deterministic, role-appropriate batch
{
  const batch = rollApplicants('entertainers', 3, 555);
  assert.equal(batch.length, 3);
  assert.deepEqual(rollApplicants('entertainers', 3, 555), batch, 'same batch seed → same applicants');
  assert.notDeepEqual(rollApplicants('entertainers', 3, 556), batch, 'a reroll changes the board');
  for (const p of batch) assert.equal(p.role, 'entertainers');
}

// tenure: veterans of past generations pull more weight, wages unchanged
{
  assert.equal(tenureMult(0), 1);
  assert.ok(Math.abs(tenureMult(3) - 1.06) < 1e-9, '+2% per generation served');
  const roster = createRoster();
  roster.operators = [{ seed: 42, level: 2, gen: 1 }];
  const fresh = aggregateStaff(roster, { generation: 1 }).operators;
  const seasoned = aggregateStaff(roster, { generation: 4 }).operators;
  assert.ok(Math.abs(seasoned.skill / fresh.skill - 1.06) < 1e-9, 'three generations served → +6% skill');
  assert.equal(seasoned.salaryPerMin, fresh.salaryPerMin, 'tenure is loyalty, not a pay rise');
  assert.equal(seasoned.trained, fresh.trained, 'training level is untouched');
  // members without a gen stamp (pre-tenure saves) start counting now
  roster.operators = [{ seed: 42, level: 2 }];
  const unstamped = aggregateStaff(roster, { generation: 4 }).operators;
  assert.ok(Math.abs(unstamped.skill - fresh.skill) < 1e-9, 'no gen stamp → no retroactive bonus');
}

// department-specialist traits bend their systems
{
  const marketer = traits => _makeTestPerson('marketers', { traits });
  const fx = marketingTraitFx([marketer(['streetSmart']), marketer(['radioVoice']), marketer(['viralInstinct'])]);
  assert.ok(Math.abs(fx.build.streetTeam - 1.25) < 1e-9, 'Street Smart builds Street Team faster');
  assert.ok(Math.abs(fx.build.spotlight - 1.25) < 1e-9, 'Viral Instinct extends Ride Spotlight');
  assert.ok(Math.abs(fx.decay.broadcast - 0.75) < 1e-9, 'Radio Voice slows Broadcast decay');
  const none = marketingTraitFx([marketer([])]);
  assert.equal(none.build.streetTeam, 1);
  assert.equal(none.decay.broadcast, 1);
  // stacking caps out — five Radio Voices cannot freeze the airwaves
  const five = marketingTraitFx(Array.from({ length: 5 }, () => marketer(['radioVoice'])));
  assert.ok(five.decay.broadcast >= 0.55, 'decay slow-down is floored');

  const scientist = traits => _makeTestPerson('scientists', { traits });
  assert.ok(Math.abs(researchEffMult([scientist(['trackEngineer'])], 'track') - 1.2) < 1e-9, 'Track Engineer speeds the track path');
  assert.equal(researchEffMult([scientist(['trackEngineer'])], 'guests'), 1, 'specialty does nothing off-path');
  assert.ok(researchEffMult([scientist(['safetyNut'])], 'guests') > 1, 'Safety Nut helps every path');

  const ent = traits => _makeTestPerson('entertainers', { traits });
  assert.ok(Math.abs(showstopperArrivalMult([ent(['showstopper']), ent([])]) - 1.05) < 1e-9, 'a Showstopper draws +5% crowds');
  assert.equal(showstopperArrivalMult([ent([])]), 1);
}

// crew traits fold into the aggregate skill (photographer example)
{
  const seedWith = (role, wanted, avoid = []) => {
    for (let s = 1; s < 30000; s++) {
      const p = generatePerson(role, s);
      if (p.traits.includes(wanted) && !avoid.some(t => p.traits.includes(t))) return s;
    }
    throw new Error(`no ${role} seed with ${wanted}`);
  };
  const shutterSeed = seedWith('photographers', 'shutterbug', ['clumsy', 'teamPlayer', 'workaholic']);
  const roster = createRoster();
  roster.photographers = [{ seed: shutterSeed, level: 0 }];
  const withTrait = aggregateStaff(roster).photographers;
  const person = generatePerson('photographers', shutterSeed);
  assert.ok(withTrait.skill > personCoverage(person), 'Shutterbug lifts the crew skill above raw coverage');

  // Early Birds raise offline efficiency, capped
  const birdSeed = seedWith('janitors', 'earlyBird');
  const nest = createRoster();
  nest.janitors = Array.from({ length: 12 }, () => ({ seed: birdSeed, level: 0 }));
  assert.ok(Math.abs(offlineEfficiencyBonus(nest) - 0.2) < 1e-9, '12 Early Birds cap at +20%');
  assert.equal(offlineEfficiencyBonus(createRoster()), 0);
}

// fame draws talent: a famous park's board is at least as good, often better
{
  let famousBetter = 0, trials = 0;
  for (let batch = 1; batch <= 250; batch++) {
    const plain = rollApplicants('mechanics', 3, batch);
    const famous = rollApplicants('mechanics', 3, batch, { fame: 700 });
    const best = list => Math.max(...list.map(p => p.competence + p.potential / 16));
    assert.ok(best(famous) >= best(plain) - 1e-9, 'fame never worsens the board');
    if (best(famous) > best(plain) + 1e-9) famousBetter++;
    trials++;
  }
  // theory: best-of-7 beats best-of-3 with p = 4/7; allow generous slack
  assert.ok(famousBetter > trials * 0.4, `fame usually improves the board (${famousBetter}/${trials})`);
}

// salary payback sanity: at a stage where their lever binds, an average hire
// pays for themselves within minutes (guests are the bottleneck here, so the
// entertainer's arrival boost is real income — not a wasted wage)
{
  const upgrades = makeUpgrades();
  upgrades.queue.level = 5;    // big line capacity → arrivals are the constraint
  upgrades.ticket.level = 4;   // mid-game ticket prices the marginal guest
  const gentle = { excitement: 20, lapTime: 8, maxSpeed: 14, length: 200 };
  const common = { upgrades, pathStats: gentle, simQueue: 15, researchDone: {}, station, fallbackMaxSpeed: 4 };
  const before = deriveEconomy({ ...common, staff: {} }).ratePerMin;
  const after = deriveEconomy({ ...common, staff: { entertainers: { hired: 1, trained: 0, skill: 1 } } }).ratePerMin;
  const avgSalary = ROLE_BASE.entertainers.salary;   // ≈ an average entertainer's wage
  assert.ok(after - before > avgSalary * 2, `one entertainer nets ${(after - before).toFixed(1)}/min vs $${avgSalary}/min wage`);
}

// normalize drops junk and clamps levels
{
  const dirty = {
    operators: [{ seed: 7, level: 999 }, { seed: NaN, level: 1 }, null, { level: 3 }],
    bogusRole: [{ seed: 1, level: 1 }],
  };
  const clean = normalizeRoster(dirty);
  assert.equal(clean.operators.length, 1, 'drops the NaN-seed, null and seedless entries');
  const person = generatePerson('operators', 7);
  assert.equal(clean.operators[0].level, person.potential, 'over-cap level clamped to potential');
  // tenure stamps survive normalization; junk gens are dropped
  const stamped = normalizeRoster({ operators: [{ seed: 7, level: 1, gen: 2 }, { seed: 8, level: 1, gen: -3 }] });
  assert.equal(stamped.operators[0].gen, 2, 'gen stamp survives the round trip');
  assert.equal(stamped.operators[1].gen, undefined, 'junk gen dropped');
  assert.equal(clean.bogusRole, undefined, 'unknown roles dropped');
  assert.deepEqual(normalizeRoster(null), createRoster(), 'garbage in → empty roster');
}

// era wages: flat below the threshold (young parks never squeezed), then the
// wage bill tracks gross income so payroll stays a real slice of a big park
{
  assert.equal(payrollScale(0), 1, 'a park with no income pays base wages');
  assert.equal(payrollScale(PAYROLL_SCALE_BASE), 1, 'flat up to the threshold');
  assert.equal(payrollScale(PAYROLL_SCALE_BASE / 2), 1, 'below threshold stays flat');
  assert.ok(payrollScale(PAYROLL_SCALE_BASE * 10) > 5, 'a 10× park pays several-fold wages');
  assert.ok(payrollScale(1e6) > payrollScale(1e5), 'monotone in gross');
  assert.ok(Number.isFinite(payrollScale(1e12)) && payrollScale(NaN) === 1, 'sane on extremes and junk');
  // the wage bill stays a minority slice: scale grows slower than gross itself
  const shareMid = payrollScale(1e4) / 1e4;
  const shareLate = payrollScale(1e6) / 1e6;
  assert.ok(shareLate < shareMid, 'sublinear: wages never outrun income');
}

console.log('staffPeople tests passed');
