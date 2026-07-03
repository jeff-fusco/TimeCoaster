# Handoff: Park Balance Sheet (click the money → income breakdown)

## Feature request

Clicking the **Park Funds** card (top-left money display) should open a balance-sheet
overlay that shows how income is calculated, RCT-style: every income line, the
multipliers behind the per-rider price, expenses, and the net $/min. It should read
like a financial statement, update live while open, and close like every other panel
(Close button, backdrop click, Escape).

## Project orientation

Vanilla ES modules, **no build step**. `npm start` serves on :4321 (`scripts/serve.mjs`).
three.js is vendored via an import map in `index.html`.

- `src/main.js` — orchestrator. Owns game state, the tick loop, panel wiring, save/load.
- `src/systems/` — pure, DOM-free logic. **`economy.js` is the only file you need to
  read for the numbers** (see below). Money is mutated in `trainSim.js` and `main.js`.
- `src/ui/` — DOM panel factories (`staffPanel.js`, `researchPanel.js`, `hudShop.js`,
  `landPopup.js`). Copy their pattern.
- `src/render/` — three.js scene builders. Not needed for this feature.
- `index.html` — all panel skeletons live here as static markup.
- `styles.css` — panel styles. `index.html` references `styles.css?v=...` and
  `src/main.js?v=...`; **bump both query strings** when you change them.

## Where the numbers come from

`deriveEconomy(...)` in `src/systems/economy.js` computes everything. `main.js` wraps
it as `derived()` (already passes live `sim.queue` as `simQueue`). Relevant fields it
returns — these are your balance-sheet line items:

| Field | Meaning |
|---|---|
| `ratePerMin` | headline income $/min (`ridePerMin + snackPerMin`) — matches the HUD |
| `ridePerMin` | dispatch-driven income $/min (rides + photos + merch + vendor + royalties) |
| `snackPerMin` | snack stands $/min (scales with queue fill, canopies, janitors, tickets, hype) |
| `royaltyPerMin` | Reality Licensing passive $/min (0 until that research) |
| `perRider` | $ per rider = `(ticket + express) × hype × ratingMult × researchMult × upkeepMult` |
| `ticket`, `hype`, `ratingMult` | the individual factors (express is `express.level × 5`; `researchMult` is 1.15 with On-Ride Photo; `upkeepMult` from mechanic training) |
| `vendorPerRider`, `hatFrac`, `balloonFrac` | hat/balloon cart $ per rider and buyer fractions |
| `photoPerRide` | photographer $ per dispatched train |
| `merchRate`, `merchPerTrain` | Merch Exit Shop: 6% of a trainload's ride take |
| `seatsCap`, `trains`, `cycle`, `estBoard`, `arrivalRate`, `queueCap` | throughput model: boarded per dispatch = `min(seatsCap, queueCap, arrivalRate × cycle / trains)` |
| `perRideFull` | $ for one full train (nice header stat) |

**Bottleneck insight (do include this — it's the most RCT-like touch):** compare the
three `min()` arms of `estBoard` and label which binds: seats (`seatsCap`), queue
capacity (`queueCap`), or guest arrivals (`arrivalRate × cycle / trains`). One line like
"Throughput limited by: Seats — buy cars/trains" tells the player what to fix.

**Where money actually moves** (so you can label lines "per dispatch" vs "per minute"):
- `dispatchTrain()` in `src/systems/trainSim.js` credits, per launch:
  `round(cycleBoard × perRider) + round(photoPerRide) + round(cycleBoard × vendorPerRider) + round(cycleBoard × perRider × merchRate)`.
- The tick in `main.js` credits `snackPerMin/60·dt` and `royaltyPerMin/60·dt` continuously.
- **Expenses:** R&D funding drains `ratePerMin × research.fundingPct% / min` while a
  project is active (see the research block in `main.js` tick). Show it as a negative
  line and show **net** = `ratePerMin − research spend`. (Purchases are one-offs; don't
  list them.)

## How to build it (follow existing patterns exactly)

1. **Markup** in `index.html`: clone the `#staffPanel` block → `id="balancePanel"`,
   backdrop `id="balanceBackdrop"`, close button `id="balanceClose"`, a content div
   `id="balanceSheet"`. Reuse `staff-panel`/`staff-card` classes; add a `balance-card`
   class if you need width tweaks.
2. **Panel module** `src/ui/balancePanel.js`: copy the factory shape of
   `createStaffPanel` (`{ render, open, close, toggle, isOpen }`). Inject `document`,
   `derived`, `getResearch` (for `fundingPct` + whether a project is active — use
   `pathProjectState`), `fmt` (that's `formatMoney`). Use the `lastRenderKey`
   JSON-memo trick from `staffPanel.js` so the 0.2s `refreshHUD` cadence doesn't
   rebuild DOM needlessly (key on floored values).
3. **Wire in `main.js`:**
   - Create the panel next to `staffUI`/`researchUI`.
   - Click target: the Park Funds card — `document.querySelector('.bank')`. Add
     `cursor:pointer` (and maybe a hover nudge) in CSS. On click: close build mode /
     other panels first (copy the `staffToggle` click handler), then `balanceUI.toggle()`.
   - Add `if(balanceUI.isOpen()) balanceUI.render();` in `refreshHUD()`.
   - Add it to `closeOpenPanels()` so Escape closes it.
4. **Suggested layout** (plain rows, right-aligned amounts):
   - Header: funds, net $/min.
   - "Per rider" mini-table: ticket + express, then ×hype, ×rating, ×upkeep, ×photo
     research → `perRider`, plus vendor add-ons.
   - "Per dispatch": full-train ride take, photos, hats/balloons, merch.
   - "Per minute": rides, snacks, royalties → gross; minus R&D funding → **net**.
   - Footer: throughput line (`trains × 60/cycle` dispatches/min, boarded per dispatch,
     bottleneck label).

## Verify before you're done

- `npm test` — 8 plain-node suites, must stay green.
- `npx playwright test` — 28 smoke tests (desktop+mobile). **Add one**: seed a save via
  `addInitScript` (`localStorage.setItem('tc3d_v5', ...)` — copy any existing test),
  click `.bank`, assert the panel is visible, shows a `$.../min` figure consistent with
  the HUD `#rate`, and `pageErrors` stays empty. Test flag: tests set
  `window.__TIME_COASTER_TEST__ = true` before load.
- Manual: money card click works in build mode too (should exit build mode or be
  ignored — match how `staffToggle` handles `bm.active`); Escape and backdrop close it.

## Gotchas

- Panels are exclusive: opening one closes the others — copy the toggle-handler pattern
  in `main.js` (`shopToggle`/`staffToggle` listeners), don't invent new logic.
- `derived()` is cheap; call it fresh inside `render()` — never cache economy objects.
- `formatMoney` handles k/M/B suffixes; don't roll your own.
- `ratePerMin` is a *model estimate* (assumes prompt dispatches). It's the right number
  to display — it's what the HUD already shows — but don't promise it equals realized
  income to the cent.
- `tools/balance-report.mjs` (run `node tools/balance-report.mjs`) prints payback tables
  at four game stages — handy to sanity-check any display math against the model.
- Keep new UI text short; the game's voice is playful-terse (see existing panel copy).
