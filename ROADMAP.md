# Time Coaster 3D — Road to Steam ($3.99 Incremental)

*Updated 2026-07-09 — post-M5. Systems are built; the game now enters the
refinement phase (M5.5) before Steamification.*

The north star: **the incremental game where the number going up is a roller
coaster.** Every system should feed back into the coaster getting physically
bigger, faster, more absurd, and more beautiful — not into abstract counters.
Target: a $3.99 Steam release with 8–12 hours of directed content, an
achievement-rich long tail, and a sandbox afterlife.

Reference points in the niche: Nodebuster ($2.99, tight 4h arc), Sixty Four
($6, "the machine is the spectacle"), Gnorp Apologue ($7, watchable toy).
Our differentiator: **the toy is a coaster you designed yourself.**

---

## Design pillars (test every feature against these)

1. **The coaster is the counter.** Progress must be visible in the world:
   longer trains, taller track, denser crowds, wilder physics. If a system
   only changes a number in a panel, redesign it.
2. **Building should matter.** Shape, pacing, and theming must out-earn raw
   length — and build quality IS the prestige currency (the craft gate
   enforces this at every retirement).
3. **Legacy, not loss.** Ascension never destroys the thing you built.
   Retired coasters stay in the world as running monuments; the park is your
   prestige history made visible. One coaster is ever *active*.
4. **Idle-honest.** Offline progress, measured income, no fake numbers.

---

## The gameplay loop (with Legacy ascension)

Four nested loops, each feeding the one above it.

### 1 · The minute loop — *watch the toy* (always running)

Dispatch a train (or let trained Operators auto-launch) → riders pay
(ticket × excitement rating × hype × Demand coupling) → spend on something
**visible**: another car, more track meters, a decor piece, a vendor cart.
The coaster and crowd physically grow. This loop must never require a menu
to feel good.

### 2 · The session loop — *build the machine* (~30–60 min)

Money walls push the player outward into systems, roughly in this order:

- **Staff** — hire crews (boarding, arrivals, installs, snacks, photos),
  then the two department heads: Scientists (R&D) and Marketers (HQ).
- **R&D** — allocate an income %, pick a path, unlock features/track/tiers.
  Knowledge is permanent across generations.
- **Marketing HQ** — allocate an income %, split it across campaign
  channels (arrivals / ticket premium / guest spend / monument income).
  Demand decays, so the mix is a living decision, not a set-and-forget.
- **Land** — buy plots to make room for ambition.
- **Build mode** — reshape the track with prefabs, banking, and height
  research; theme it with decor for the set bonus.

The balance sheet's "Limited by" line (seats vs queue vs guests) always
names the next move, so bottlenecks rotate between capacity, arrivals, and
track quality.

### 3 · The generation loop — *Legacy ascension* (gen 1 ≈ 60–90 min, later gens 45–75)

This is the core prestige lap. Stated as the player experiences it:

1. **Chase certification.** The active coaster must clear TWO bars that rise
   ×1.45 / ×1.28 per generation:
   - *Excitement* ≥ certification bar (40 at gen 1) — decor theming helps;
   - *Craft* ≥ quality bar (14 at gen 1) — scored from real drops, airtime
     moments, pacing variety, features, and near-misses with monument track.
     **A long flat oval cannot pass.** The gate forces layout iteration.
2. **The Grand Retirement.** Name the coaster; a ceremony plaques it (final
   stats, generation number). Fame is banked — superlinear in effective
   excitement × craft, so over-building before retiring is the optimization.
3. **The coaster becomes a monument.** Track, decor and a ghost train stay
   in the world forever. It pays passive legacy income ("tourists visit the
   classics"), becomes a **near-miss target** (threading new track close to
   old track earns craft), and an asset for Heritage Tours campaigns.
4. **Choose a biome** for the new plot — the "what kind of coaster will this
   one be?" moment (Desert/Ice/Volcano, later Moon at 0.42 g).
5. **Spend Fame on perks** (grants, renown arrivals, offline caps, landmark
   income…). A Fame-scaled opening grant seeds the new coaster.
6. **Persist vs reset:**

   | Persists (the park remembers) | Resets (new hardware, new ride) |
   |---|---|
   | All R&D | Shop upgrade levels |
   | Staff roster | Money → Fame-scaled opening grant |
   | Marketing channels + funding | The queue/crowd |
   | Monuments + legacy income | Track (that's the point) |
   | Fame, perks, achievements | |

7. **Go again, better.** Persistence makes the next generation *faster*;
   rising bars make it *harder*. Every lap of this loop must produce a
   genuinely better-designed coaster than the last — that's the game.

### 4 · The park lifetime — *the 8–12 hour arc*

| Act | Hours | Experience | Exit |
|---|---|---|---|
| 1 — The First Coaster | 0–2h | Learn every system, end on the **first Grand Retirement** | First monument |
| 2 — The Legacy Park | 2–7h | Gens 2–4 on chosen biomes; marketing portfolio, perks compound, monuments weave together | 3+ monuments |
| 3 — The Impossible | 7–12h | Late R&D: tunnels, teleporters, the **Moon plot**; the capstone certification | "Impossible Coaster" certified |
| Sandbox | 12h+ | Creative mode, endless generations, achievements | — |

---

## Current state (July 2026)

**Shipped and tested** (13 unit suites, 46 browser tests, all green):

- **M1 Foundations** ✅ — undo/redo, settings, procedural WebAudio,
  offline progress (active coaster at 50%, monuments at 100% — they never
  sleep), save v6 + versioned migrations, title splash + welcome-back.
- **M2 Legacy** ✅ — retirement ceremony, dual certification (excitement bar
  + craft/quality bar), monument snapshots + ghost trains, Fame + perk shop,
  legacy income, opening grants, v5→v6 migration.
- **M3 Biomes** ✅ — Meadow/Desert/Ice/Volcano/Moon with palettes, exclusive
  decor, set bonuses, and mechanical twists (snack ×1.5, low friction,
  theming ×1.3, gravity 0.42 — Moon gated behind vertical-track research).
- **M4 Builder joy** ✅ — prefab elements, manual banking, height research
  tiers, chain-lift energy model, excitement rework (airtime counted, pacing
  scored, length sublinear), monument near-miss bonus.
- **M5 Marketing** ✅ — the channel portfolio (see below); flat `market`
  upgrade retired and migrated; economy rebased on Demand; smaller symmetric
  starter coaster (47m, 3 points + a centered crest).

### Marketing department — a channel portfolio *(shipped, v2 design)*

Hire **Marketers**, set a total income % budget, then split it with
mixer-style sliders (one pie: raising a channel pulls the others down).
Each channel has its own Demand stock, decay half-life, and effect:

| Channel | Unlock | Effect | Feel |
|---|---|---|---|
| 📄 Street Team | first Marketer | arrivals ×2 cap | fast build, ~45s half-life |
| 📺 Broadcast | `radio` research | arrivals ×6 cap | slow, ~5min half-life — the idle backbone |
| 🎢 Ride Spotlight | `viral` research | ticket premium scaled by excitement | the build is the ad (pillar 2) |
| 🎈 Family Package | `flyers` research | per-guest snack/vendor ×1.75 | deepens spending |
| 🏛️ Heritage Tours | `mythicReputation` + a monument | monument income ×2 | markets your history (pillar 3) |

Spend split uses share^0.8 + a **Full Coverage** synergy (+12% efficiency
per extra funded channel), so spreading out-earns stacking while
specializing still saturates one channel fastest. Arrival cap stays ×12
endgame — the old ceiling, power redistributed instead of added. Park-wide:
persists across retirements like R&D.

### Known gaps (the honest list)

- `tools/balance-report.mjs` still models the retired `market` upgrade and
  cannot see Demand — the tuning tool is blind to M5.
- Mid/late shop price walls (last report): Photographers ~30m payback,
  Shade Canopies ~32m, Snack Stands ~80m, Express Lane ~159m, Ticket Price
  ~339m, Theming & Hype ~491m.
- **Park Rating (★1–5) was never built** — currently generation number and
  research gates carry the pacing alone. Decide: build it or cut it.
- No capstone certification (the Act 3 finale is unreachable as a *goal*).
- No save export/import or slots (the "lost 4 hours" insurance).
- Retirement ceremony is a text card — no fireworks, no fanfare.
- No achievements, no stats page (planned with M6).
- Audio is procedural only — no ambient/biome music loops.

---

## M5.5 — Refinement phase (new goals, in order of leverage)

Each goal has an acceptance test. Nothing here adds systems; everything
makes the existing ones true to their design.

1. **Balance tool v2.** Model marketing channels/Demand per stage, drop
   `market` from STAGES. *Accept:* Marketers/campaign spend shows a finite
   payback; report reflects the real economy.
2. **Progression simulator.** Extend the tool to simulate a competent player
   through generations; output a time-to-generation table. *Accept:* table
   lands inside the pacing targets below (or bars/grants get retuned until
   it does).
3. **Shop curve rebalance.** Kill the six walls. *Accept:* every item's
   payback ≤ 10 min at its intended stage; nothing purchasable is dead
   content before the endgame.
4. **Park Rating decision.** Recommend: derive ★1–5 from Fame + monument
   count (no new sim), display it in the HUD, gate Act 2/3 unlocks (biome
   deeds, Moon) on stars. *Accept:* acts have a visible spine; or the cut is
   documented and generation gates take over explicitly.
5. **Capstone certification.** "Impossible Coaster": a Moon-only super-bar
   (excitement + craft) with a finale ceremony. *Accept:* reachable in the
   simulator by hour 10–12.
6. **Save insurance.** Export/import string + 3 save slots. *Accept:* a save
   survives a round-trip through the textbox, byte-identical.
7. **Ceremony juice.** Fireworks, fanfare, plaque card on retirement.
   *Accept:* the screenshot moment actually produces screenshots.
8. **Marketing follow-through.** Validate Full Coverage in the simulator
   (no degenerate all-in-one-channel or mandatory-five-way play); only then
   consider Ad Blitz / Reach levels from the v2 design shelf.

---

## Staff v2 — hire real people *(shipped)*

Staff stops being counters: you hire **procedurally generated individuals**
(seed → name, portrait, two skill axes, 1–2 traits, training potential,
asking salary) from a rotating **Job Board** (timer refresh + pay to
reroll), train *specific people* up to their personal potential, and can
let anyone go (no refund). Every hire **walks into the park** — role
uniforms + seed-unique looks, doing their job in-world: operators wave at
dispatch, mechanics hammer during installs, janitors sweep, entertainers
perform along the queue, photographers flash at launches, scientists pace
the lab, marketers hand out flyers.

Decisions locked: job board = timer + paid reroll; firing allowed, no
refund; **salaries** (ongoing $/min per person, payroll line in the balance
sheet, offline nets `max(0, earnings − payroll)`, payroll skipped at $0 —
no death spirals).

Compatibility spine: `aggregateStaff(roster)` folds people back into the
`{hired, trained}` shape the economy already consumes; old saves migrate by
generating their headcount. Balance anchor: n average members at level t ≈
the old role numbers; salaries must repay within minutes at intended stage
(modeled in balance tool v2).

Department tie-ins (the connective tissue):
- **Specialist traits** speak the department languages — marketers roll
  channel specialties ("Radio Voice: Broadcast decays slower", "Street
  Smart: Street Team builds faster"), scientists roll research-path
  specialties ("Track Engineer: +efficiency on the track path") — so who
  you hire reshapes how you weight channels and which path you fund.
- **Department heads**: the top-skilled scientist/marketer's portrait
  headlines the R&D / Marketing HQ panels ("Jimenez's campaign desk").
- **Tenure**: +2% effectiveness per generation served makes the "staff
  persist across retirements" rule a felt reward; staff gather at the
  retirement ceremony (feeds the ceremony-juice goal).

Sequencing guard: payroll changes the economy, so the progression
simulator's pacing sign-off and the shop-wall rebalance run AFTER stage ②
lands. Balance tool v2 and stages ①–④ can proceed in any order.

All five stages landed: ① pure generator + adapter + migration + tests →
② state/save wiring + job board + payroll → ③ panel v2 (roster cards,
portraits, department heads) → ④ world actors + behaviors → ⑤ specialist
traits, tenure, Fame-scaled boards, skill→economy wiring. Remaining
follow-through lives in the balance-tool work (task #35/#37): model payroll
+ staff skills in the progression simulator before the shop-wall retune.

## Success metrics (how we know the loop works)

**Pacing** *(progression simulator + stopwatch playtests)*
- Generation 1 retirement: 60–90 min. Gens 2–4: 45–75 min each.
- Capstone certified: hour 8–12. Sandbox unlock lands with content left to buy.

**Economy health** *(balance-report v2, run at every milestone)*
- Payback ≤ 10 min for every purchasable at its intended stage; zero
  unreachable (∞) items before endgame; ≤ 2 long-arc (10–30 min) items per
  stage — those are the deliberate saving goals.
- Arrivals are the binding constraint 25–50% of simulated playtime —
  marketing must matter, but never be the only answer.

**Craft over length** *(unit-tested invariants)*
- A max-length flat oval can never pass the quality bar at any generation.
- A designed layout (drops + airtime + pacing) out-earns an equal-length
  oval by ≥ 2× excitement.

**Marketing portfolio** *(simulator)*
- Optimal play funds ≥ 3 channels; no single channel is strictly dominant;
  focused-vs-spread arrival output stays within ~15% so both are viable.

**Playtest** *(friends builds at each milestone exit)*
- ≥ 80% reach the first retirement in one sitting; ≥ 60% start generation 2
  the same day; the welcome-back panel reads as fair ("I earned that").
- Ask verbatim: "did building the coaster matter?" — the answer must be yes.

**Technical**
- 60 fps with 6 monuments + max crowd on a mid-range laptop.
- Save round-trips lossless (tested); both suites green at every milestone.

---

## Remaining milestones

| # | Milestone | Contents | Status |
|---|---|---|---|
| M1 | Foundations | QoL, audio, offline, save v6 | ✅ |
| M2 | Legacy | Retirement, monuments, Fame, migration | ✅ |
| M3 | Biomes | 5 biomes incl. Moon, palettes, twists | ✅ |
| M4 | Builder joy | Prefabs, banking, excitement rework | ✅ |
| M5 | Marketing + endgame systems | Channel portfolio, Demand economy | ✅ (systems) |
| **M5.5** | **Refinement** | Goals 1–8 above: simulator, rebalance, rating, capstone, saves, ceremony | ◀ **current** |
| M6 | Steamification | Electron + steamworks.js, achievements (~30), stats page, cloud saves, store page + trailer | pending |
| M7 | Beta → launch | Friends beta, Next Fest demo (web build = Act 1 up to first retirement), wishlist push | pending |

M6 notes (unchanged plan): Electron over Tauri for mature Steamworks
bindings; the game stays a static web app and the Pages build remains the
free demo. Storage abstraction (localStorage → file-on-disk) lands with M6
and gives Steam Cloud for free. Trailer: a park timelapse across
generations ending on the Moon coaster — the Legacy loop IS the trailer.

## Risks & mitigations

- **Prestige balance** (top risk): too fast → builds feel disposable; too
  slow → the loop never hooks. The progression simulator (M5.5 goal 2)
  exists precisely for this; validate with real playtests each milestone.
- **Monument creep:** budget check at 6 monuments; static merging and
  ghost-train culling are the escape valves.
- **three r128 age:** pin and work around (current approach); upgrade only
  in its own branch with visual regression.
- **Scope vs price:** $3.99 forgives shallow 3D-artistry, not a loop that
  dies at hour 3. M5.5 refinement IS the loop work — never trade it for
  polish elsewhere.

## Open decisions

1. **Park Rating:** build the cheap Fame-derived version (recommended,
   M5.5 goal 4) or cut and lean on generation gates?
2. **Demo boundary:** web build = Act 1 up to first retirement
   (recommended — the retirement is the wishlist hook), or shorter?
3. **Name:** "Time Coaster 3D" — keep, or rebrand before the store page
   locks it in? ("Coaster Legacy" / "Legacy Park" describe the actual game.)
