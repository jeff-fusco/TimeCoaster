// Staff v2 — procedurally-generated individual employees.
//
// The whole design rests on one idea: a person is a pure function of a seed.
// The save stores only { seed, level } per employee; name, portrait, skills,
// traits, potential and salary all re-derive deterministically. Tiny saves,
// no drift, and the same seed is the same human forever.
//
// Compatibility spine: `aggregateStaff(roster)` folds the people back into the
// exact `{ hired, trained }` shape the economy already consumes, so nothing
// downstream changes when this replaces the old counter roster. Extra fields
// (skill, coverageSum, salaryPerMin, people) ride along for the panel, payroll
// and world actors — the economy ignores them today.
//
// Balance anchor: n people of average skill at personal level t aggregate to
// { hired: n, trained ≈ t } — i.e. an average roster reproduces the old
// numbers. Skill variance nudges quality up or down from there; that nudge is
// the entire point ("people matter"), and stage ② wires the `skill` coverage
// field into the economy explicitly.

// ── deterministic RNG ────────────────────────────────────────────────────────
// mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Seed in, stream out.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fold a role name + seed into one 32-bit stream seed, so the same numeric seed
// yields a different (but still deterministic) person per role.
function hashSeed(role, seed) {
  let h = 2166136261 >>> 0;
  const str = `${role}:${seed}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const range = (r, lo, hi) => lo + r() * (hi - lo);
const clamp01 = v => Math.max(0, Math.min(1, v));

// ── name + look pools (pure data — no DOM, no THREE) ─────────────────────────
const FIRST = [
  'Ava', 'Milo', 'Noor', 'Kai', 'Rosa', 'Dev', 'Ines', 'Theo', 'Sana', 'Owen',
  'Lena', 'Cruz', 'Yuki', 'Omar', 'Nia', 'Finn', 'Priya', 'Hugo', 'Zara', 'Beau',
  'Iris', 'Jude', 'Suki', 'Cole', 'Anya', 'Reed', 'Maya', 'Gus', 'Leah', 'Rex',
  'Esme', 'Tariq', 'Wren', 'Dario', 'Faye', 'Nico', 'Opal', 'Sven', 'Uma', 'Hana',
];
const LAST = [
  'Okafor', 'Nguyen', 'Rossi', 'Bauer', 'Silva', 'Haddad', 'Kimura', 'Flores',
  'Novak', 'Portelli', 'Dubois', 'Mensah', 'Larsen', 'Costa', 'Ibarra',
  'Petrov', 'Cho', 'Adeyemi', 'Vance', 'Moreau', 'Bianchi', 'Sato', 'Reyes',
  'Ekwueme', 'Holt', 'Falk', 'Delgado', 'Mori', 'Rasmussen', 'Aziz',
];

export const SKIN = [0xffd9b3, 0xf2b98a, 0xe0a072, 0xc68642, 0x8d5524, 0x5c3a21];
export const HAIR = [0x2b1b12, 0x50310f, 0x8a5a2b, 0xc98a3a, 0xd9d2c5, 0x1c1c1c, 0x6b4f8a, 0xb5462f];
export const HAIR_STYLES = ['short', 'buzz', 'bun', 'ponytail', 'curly', 'cap', 'bald'];
export const ACCESSORIES = ['none', 'none', 'glasses', 'earring', 'cap', 'headphones'];

// Per-role uniform accent so a glance reads the job even before the label.
export const ROLE_UNIFORM = {
  operators: 0x2f6fed,
  entertainers: 0xe64bb0,
  mechanics: 0xf2933c,
  janitors: 0x46b06a,
  photographers: 0x8a56e2,
  scientists: 0x35b8c4,
  marketers: 0xe8b93c,
};

// Two named skill axes per role — flavour today, hooks for depth later. The two
// combine into one competence score that drives coverage, salary and rarity.
export const SKILL_AXES = {
  operators: ['Reflexes', 'Composure'],
  entertainers: ['Charisma', 'Stamina'],
  mechanics: ['Precision', 'Pace'],
  janitors: ['Diligence', 'Efficiency'],
  photographers: ['Eye', 'Timing'],
  scientists: ['Rigor', 'Insight'],
  marketers: ['Creativity', 'Reach'],
};

// Per-role economic bases: signing fee scale + baseline salary ($/min) for an
// average member. Deliberately near the old STAFF.hireBase scale so migration
// feels continuous; the real numbers get a dedicated pass in stage ⑤.
export const ROLE_BASE = {
  operators: { hire: 150, salary: 3 },
  entertainers: { hire: 220, salary: 4 },
  mechanics: { hire: 320, salary: 5 },
  janitors: { hire: 200, salary: 4 },
  photographers: { hire: 420, salary: 6 },
  scientists: { hire: 900, salary: 12 },
  marketers: { hire: 700, salary: 10 },
};

// ── traits ───────────────────────────────────────────────────────────────────
// `weight` biases the draw (common traits are heavier). `roles: null` means any
// role can roll it; a role list restricts specialists to their department.
// `hook` is the key the economy will consult in stage ⑤ (null = cosmetic now).
// `salary` multiplies asking pay — desirable traits cost more, flaws cost less.
export const TRAITS = {
  earlyBird:   { name: 'Early Bird',   desc: 'Keeps the park earning while you sleep.', weight: 5, roles: null, hook: 'offline', salary: 1.10 },
  teamPlayer:  { name: 'Team Player',  desc: 'Lifts the whole crew a little.',          weight: 5, roles: null, hook: null,      salary: 1.05 },
  cheerful:    { name: 'Cheerful',     desc: 'Guests warm to a friendly face.',         weight: 5, roles: null, hook: null,      salary: 1.03 },
  quickStudy:  { name: 'Quick Study',  desc: 'Trains faster and cheaper.',              weight: 4, roles: null, hook: 'training', salary: 1.12 },
  workaholic:  { name: 'Workaholic',   desc: 'More output, higher wage.',               weight: 3, roles: null, hook: 'coverage', salary: 1.18 },
  veteran:     { name: 'Veteran',      desc: 'Starts already seasoned.',                weight: 3, roles: null, hook: 'tenure',   salary: 1.15 },
  showstopper: { name: 'Showstopper',  desc: 'Draws a bigger crowd from the queue.',    weight: 2, roles: ['entertainers'], hook: 'aura', salary: 1.20 },
  radioVoice:  { name: 'Radio Voice',  desc: 'Broadcast demand fades slower.',          weight: 2, roles: ['marketers'], hook: 'ch:broadcast', salary: 1.22 },
  streetSmart: { name: 'Street Smart', desc: 'Street Team builds demand faster.',       weight: 2, roles: ['marketers'], hook: 'ch:streetTeam', salary: 1.20 },
  viralInstinct:{ name: 'Viral Instinct', desc: 'Ride Spotlight reaches further.',      weight: 2, roles: ['marketers'], hook: 'ch:spotlight', salary: 1.22 },
  trackEngineer:{ name: 'Track Engineer', desc: 'Faster progress on the track path.',   weight: 2, roles: ['scientists'], hook: 'path:track', salary: 1.22 },
  safetyNut:   { name: 'Safety Nut',   desc: 'Reliable installs and upkeep.',           weight: 2, roles: ['mechanics', 'scientists'], hook: 'reliability', salary: 1.15 },
  shutterbug:  { name: 'Shutterbug',   desc: 'A knack for the perfect launch shot.',    weight: 2, roles: ['photographers'], hook: 'photo', salary: 1.18 },
  clumsy:      { name: 'Clumsy',       desc: 'A little accident-prone.',                weight: 2, roles: null, hook: null, salary: 0.86 },
  forgetful:   { name: 'Forgetful',    desc: 'Needs the odd reminder.',                 weight: 2, roles: null, hook: null, salary: 0.88 },
  slowStarter: { name: 'Slow Starter', desc: 'Takes a while to hit their stride.',      weight: 2, roles: null, hook: 'training', salary: 0.85 },
};

// ── rarity ───────────────────────────────────────────────────────────────────
// Derived from a person's raw roll, not stored — a label for the UI and a
// salary/odds anchor. Star applicants get rarer; Fame biases the odds in ⑤.
export const RARITIES = [
  { id: 'common', name: 'Common', color: 0x9aa4b2, min: 0.00 },
  { id: 'skilled', name: 'Skilled', color: 0x46b06a, min: 0.50 },
  { id: 'expert', name: 'Expert', color: 0x4a8fe7, min: 0.70 },
  { id: 'star', name: 'Star', color: 0xf2b134, min: 0.86 },
];

function rarityFor(score) {
  let out = RARITIES[0];
  for (const r of RARITIES) if (score >= r.min) out = r;
  return out;
}

// ── generation ───────────────────────────────────────────────────────────────
const personCache = new Map();

function drawTraits(r, role) {
  const eligible = Object.entries(TRAITS).filter(([, t]) => !t.roles || t.roles.includes(role));
  const count = r() < 0.35 ? 2 : 1;
  const chosen = [];
  const pool = eligible.slice();
  for (let n = 0; n < count && pool.length; n++) {
    const total = pool.reduce((s, [, t]) => s + t.weight, 0);
    let roll = r() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      roll -= pool[idx][1].weight;
      if (roll <= 0) break;
    }
    const [id] = pool.splice(Math.min(idx, pool.length - 1), 1)[0];
    chosen.push(id);
  }
  return chosen;
}

// Generate the full, level-independent person from (role, seed). Level lives in
// the roster/save, not here — see `personAtLevel`.
export function generatePerson(role, seed) {
  const key = `${role}:${seed}`;
  const cached = personCache.get(key);
  if (cached) return cached;

  const r = mulberry32(hashSeed(role, seed));
  const axes = SKILL_AXES[role] || ['Skill', 'Skill'];
  // two axis rolls in [0,1]; competence is their average, gently centered so
  // the population mean sits near 0.5 (→ coverage ≈ 1.0)
  const a0 = clamp01(range(r, 0.1, 0.95));
  const a1 = clamp01(range(r, 0.1, 0.95));
  const competence = clamp01((a0 + a1) / 2);
  const potential = 3 + Math.floor(r() * 6);            // personal training ceiling 3..8
  const traits = drawTraits(r, role);
  const traitRarity = traits.reduce((m, id) => Math.max(m, 1 - TRAITS[id].weight / 5), 0);
  const rScore = clamp01(competence * 0.6 + (potential / 8) * 0.25 + traitRarity * 0.15);
  const rarity = rarityFor(rScore);

  const first = pick(r, FIRST);
  const last = pick(r, LAST);
  const look = {
    skin: pick(r, SKIN),
    hair: pick(r, HAIR),
    hairStyle: pick(r, HAIR_STYLES),
    accessory: pick(r, ACCESSORIES),
    uniform: ROLE_UNIFORM[role] || 0x888888,
    build: r() < 0.5 ? 0 : 1,
  };

  const traitSalaryMult = traits.reduce((m, id) => m * TRAITS[id].salary, 1);
  const baseSalary = ROLE_BASE[role].salary * (0.6 + 0.8 * competence) *
    (0.8 + 0.25 * potential / 8) * traitSalaryMult;

  const person = {
    seed, role,
    name: `${first} ${last}`, firstName: first, lastName: last,
    look,
    axes: { [axes[0]]: a0, [axes[1]]: a1 },
    axisNames: axes,
    competence,
    potential,
    traits,
    traitHooks: traits.map(id => TRAITS[id].hook).filter(Boolean),
    rarity: rarity.id,
    rarityColor: rarity.color,
    baseSalary,
  };
  personCache.set(key, person);
  return person;
}

// Coverage weight: one body's contribution to headcount effects, centered on
// 1.0 for an average person. Training does NOT change coverage (a body is a
// body); it raises quality via `trained`. Kept in [~0.8, ~1.25].
export function personCoverage(person) {
  return 0.8 + 0.45 * person.competence;
}

// Salary rises modestly with the person's current trained level.
export function personSalary(person, level = 0) {
  return person.baseSalary * (1 + 0.12 * Math.max(0, level));
}

// Up-front signing fee to hire this applicant (one-time). Scales with skill and
// rarity — a star costs more to land.
export function signingFee(person) {
  return Math.floor(ROLE_BASE[person.role].hire * (0.6 + 0.9 * person.competence) *
    (1 + 0.25 * RARITIES.findIndex(x => x.id === person.rarity)));
}

// Cost to push this person from `level` to `level + 1`. Quick Study discounts,
// Slow Starter surcharges (the `training` hook), and cost climbs per level.
export function trainingFee(person, level = 0) {
  let mult = 1;
  if (person.traits.includes('quickStudy')) mult *= 0.7;
  if (person.traits.includes('slowStarter')) mult *= 1.35;
  return Math.floor(ROLE_BASE[person.role].hire * 0.55 * Math.pow(1.6, level) *
    (0.7 + 0.6 * person.competence) * mult);
}

export function canTrainPerson(person, level = 0) {
  return level < person.potential;
}

// Everything the panel/economy needs about a person at a specific level.
export function personAtLevel(person, level = 0, tenure = 0) {
  return {
    ...person,
    level,
    tenure,
    coverage: personCoverage(person) * tenureMult(tenure),
    salaryPerMin: personSalary(person, level),
    atPotential: level >= person.potential,
  };
}

// Tenure: +2% effectiveness per full generation served — loyalty pays, and the
// "staff persist across retirements" rule becomes a felt reward.
export const TENURE_BONUS = 0.02;
export function tenureMult(generations = 0) {
  return 1 + TENURE_BONUS * Math.max(0, generations | 0);
}

// ── roster + aggregation ─────────────────────────────────────────────────────
export const STAFF_ROLES = Object.keys(ROLE_BASE);

export function createRoster() {
  const roster = {};
  for (const role of STAFF_ROLES) roster[role] = [];
  return roster;
}

// Crew-wide trait multipliers on a role's skill. Small, capped, and additive
// per person so one lucky hire is a nudge, not a new meta.
function roleSkillTraitMult(role, people) {
  let mult = 1;
  const count = id => people.reduce((n, p) => n + (p.traits.includes(id) ? 1 : 0), 0);
  mult *= 1 + Math.min(0.08, 0.02 * count('teamPlayer'));   // lifts the whole crew
  mult *= 1 + 0.06 * count('workaholic');                    // more output (higher wage)
  mult *= Math.max(0.85, 1 - 0.05 * count('clumsy'));        // accident-prone
  if (role === 'photographers') mult *= 1 + Math.min(0.45, 0.15 * count('shutterbug'));
  if (role === 'mechanics') mult *= 1 + Math.min(0.36, 0.12 * count('safetyNut'));
  return mult;
}

// Fold a roster of individuals into the economy's `{ hired, trained }` shape,
// plus the extra fields payroll/panel/actors want. THIS is the compatibility
// contract — deriveEconomy reads .hired and .trained and is none the wiser.
//
//   hired   = headcount (integer) — every gate and funding cap unchanged
//   trained = coverage-weighted mean of personal levels — an all-average roster
//             at level t yields trained ≈ t (the balance anchor)
//   skill   = mean coverage × crew trait bonuses × tenure (≈1.0 for an average
//             fresh crew) — multiplies the headcount-scaled economy effects
//
// `generation` (the park's current legacy generation) prices in tenure: each
// member's coverage grows +2% per generation they've served.
export function aggregateStaff(roster, { generation = 1 } = {}) {
  const out = {};
  for (const role of STAFF_ROLES) {
    const members = (roster && roster[role]) || [];
    if (!members.length) {
      out[role] = { hired: 0, trained: 0, skill: 0, coverageSum: 0, salaryPerMin: 0, people: [] };
      continue;
    }
    let covSum = 0, weightedLevel = 0, salary = 0;
    const people = [];
    for (const m of members) {
      const person = generatePerson(role, m.seed);
      const level = Math.max(0, Math.min(person.potential, m.level | 0));
      const tenure = Math.max(0, generation - (Number.isFinite(m.gen) ? m.gen : generation));
      const view = personAtLevel(person, level, tenure);
      covSum += view.coverage;
      weightedLevel += view.coverage * level;
      salary += view.salaryPerMin;
      people.push(view);
    }
    out[role] = {
      hired: members.length,
      trained: weightedLevel / covSum,
      skill: (covSum / members.length) * roleSkillTraitMult(role, people),
      coverageSum: covSum,
      salaryPerMin: salary,
      people,
    };
  }
  return out;
}

// ── department-specialist trait effects ──────────────────────────────────────
// Marketers can specialize in a campaign channel; the whole department's
// channel dynamics bend around who you hired.
export function marketingTraitFx(people = []) {
  const count = id => people.reduce((n, p) => n + (p.traits.includes(id) ? 1 : 0), 0);
  return {
    build: {
      streetTeam: 1 + Math.min(0.75, 0.25 * count('streetSmart')),
      spotlight: 1 + Math.min(0.75, 0.25 * count('viralInstinct')),
    },
    decay: {
      broadcast: Math.max(0.55, Math.pow(0.75, count('radioVoice'))),
    },
  };
}

// Scientists can specialize in a research path; Safety Nuts help everywhere.
export function researchEffMult(people = [], activePath = '') {
  const count = id => people.reduce((n, p) => n + (p.traits.includes(id) ? 1 : 0), 0);
  let mult = 1 + Math.min(0.15, 0.05 * count('safetyNut'));
  if (activePath === 'track') mult *= 1 + Math.min(0.6, 0.2 * count('trackEngineer'));
  return mult;
}

// Early Birds keep the park earning while you sleep: each adds +3% to the
// offline efficiency, capped at +20% (base is 50%, so at most 70%).
export function offlineEfficiencyBonus(roster) {
  let count = 0;
  for (const role of STAFF_ROLES) {
    for (const m of (roster?.[role] || [])) {
      if (generatePerson(role, m.seed).traits.includes('earlyBird')) count++;
    }
  }
  return Math.min(0.2, 0.03 * count);
}

// Showstoppers draw a crowd beyond the entertainer baseline.
export function showstopperArrivalMult(people = []) {
  const count = people.reduce((n, p) => n + (p.traits.includes('showstopper') ? 1 : 0), 0);
  return 1 + Math.min(0.2, 0.05 * count);
}

// Total wage bill across the whole roster ($/min).
export function totalPayroll(roster) {
  const agg = aggregateStaff(roster);
  return STAFF_ROLES.reduce((s, role) => s + agg[role].salaryPerMin, 0);
}

// ── job board ────────────────────────────────────────────────────────────────
// A deterministic batch of applicants for a role. `batchSeed` rotates on the
// board's refresh timer / paid reroll (owned by main.js in stage ②).
//
// Fame draws talent: a famous park's board rolls extra candidates behind the
// scenes and keeps the best — star applicants stop being a myth around the
// time your monuments start pulling tourists. Still fully deterministic.
export function rollApplicants(role, count, batchSeed, { fame = 0 } = {}) {
  const r = mulberry32(hashSeed(`board:${role}`, batchSeed));
  const extras = Math.min(4, Math.floor(Math.max(0, fame) / 150));
  const pool = [];
  for (let i = 0; i < count + extras; i++) {
    // spread the applicant seeds far apart so a batch never collides
    const seed = (Math.floor(r() * 0xffffffff) ^ (i * 0x9e3779b1)) >>> 0;
    pool.push(generatePerson(role, seed));
  }
  pool.sort((a, b) => (b.competence + b.potential / 16) - (a.competence + a.potential / 16));
  return pool.slice(0, count);
}

// ── migration from the old counter roster ────────────────────────────────────
// Old saves stored { role: { hired, trained } }. Generate `hired` deterministic
// people per role, each already trained to (capped at) the old role level, so a
// loaded veteran park keeps its crew size and skill.
export function migrateCountsToRoster(counts, generation = 1) {
  const roster = createRoster();
  if (!counts || typeof counts !== 'object') return roster;
  for (const role of STAFF_ROLES) {
    const entry = counts[role];
    const hired = Math.max(0, entry?.hired | 0);
    const trained = Math.max(0, entry?.trained | 0);
    for (let i = 0; i < hired; i++) {
      const seed = hashSeed(`migrate:${role}:${i}`, 0x7a11 + trained);
      const person = generatePerson(role, seed);
      roster[role].push({ seed, level: Math.min(trained, person.potential), gen: generation });
    }
  }
  return roster;
}

// Normalize a stored roster ({ role: [{seed, level, gen}] }) — drop junk, clamp
// levels to each person's potential, keep only known roles. A missing `gen`
// (pre-tenure saves) stays absent: those members simply start counting now.
export function normalizeRoster(roster) {
  const out = createRoster();
  if (!roster || typeof roster !== 'object') return out;
  for (const role of STAFF_ROLES) {
    const members = Array.isArray(roster[role]) ? roster[role] : [];
    for (const m of members) {
      if (!m || !Number.isFinite(m.seed)) continue;
      const person = generatePerson(role, m.seed >>> 0);
      const level = Math.max(0, Math.min(person.potential, m.level | 0));
      const entry = { seed: m.seed >>> 0, level };
      if (Number.isFinite(m.gen) && m.gen >= 1) entry.gen = m.gen | 0;
      out[role].push(entry);
    }
  }
  return out;
}

// Test/debug convenience: construct a plain person literal with forced skill —
// used to prove the aggregation anchor without hunting for average seeds.
export function _makeTestPerson(role, { competence = 0.5, potential = 8, traits = [] } = {}) {
  const axes = SKILL_AXES[role] || ['Skill', 'Skill'];
  const traitSalaryMult = traits.reduce((m, id) => m * (TRAITS[id]?.salary || 1), 1);
  return {
    seed: -1, role, name: 'Test Person', firstName: 'Test', lastName: 'Person',
    look: { skin: SKIN[0], hair: HAIR[0], hairStyle: 'short', accessory: 'none', uniform: ROLE_UNIFORM[role], build: 0 },
    axes: { [axes[0]]: competence, [axes[1]]: competence },
    axisNames: axes,
    competence, potential, traits,
    traitHooks: traits.map(id => TRAITS[id]?.hook).filter(Boolean),
    rarity: 'common', rarityColor: RARITIES[0].color,
    baseSalary: ROLE_BASE[role].salary * (0.6 + 0.8 * competence) * (0.8 + 0.25 * potential / 8) * traitSalaryMult,
  };
}
