// crowd.js — the park-population funnel.
//
// Marketing fills the PLAZA (guests present in the park), not the ride queue
// directly. Guests wander and shop; some walk up to the queue and decide to get
// in line based on the ride's appeal and the wait. This decouples the shopping
// crowd from ride throughput — the thing that used to strangle concessions:
// one train could clear the boarding line 25× faster than guests arrived, so
// the line (and thus concession sales) was always near-empty.
//
// Two ways to earn now compete for the same guests' TIME:
//   · THRILL park  — high throughput + big per-rider fares; guests ride & leave.
//   · DESTINATION  — big plaza, long visits, lots to buy; guests wander & spend.
//
// This module is pure (no DOM, no THREE) so it drives the balance sheet, the
// offline catch-up, and (Phase 2) the live crowd integrator identically.

// Base minutes a guest stays in the park before leaving, with nothing built.
export const VISIT_BASE_MIN = 6;
export const VISIT_MAX_MIN = 90;

// Average minutes a guest lingers in the park. Grows with how much there is to
// do and how pleasant it is — the destination lever. A great ride is worth
// staying for; comfort, cleanliness and dining keep people around longer.
export function visitLengthMin({
  excitement = 0,
  cleanMult = 1,      // trained janitors → nicer park
  comfortLvl = 0,     // Queue Comfort benches/fans
  diningLvl = 0,      // Food Court — sit-down dining keeps guests around
} = {}) {
  const appeal =
    1 +
    Math.min(2.5, Math.max(0, excitement) / 120) + // a thrilling park draws long stays
    0.05 * Math.max(0, comfortLvl) +
    Math.max(0, cleanMult - 1) +
    0.06 * Math.max(0, diningLvl);
  return Math.min(VISIT_MAX_MIN, VISIT_BASE_MIN * appeal);
}

// Steady-state guests present = arrivals/min × avg visit length (Little's Law),
// capped by how many the park can hold at once. NOTE: `arrivalPerMin` is per
// MINUTE — the engine's arrivalRate is per second, so callers pass rate × 60.
export function plazaPopulation({ arrivalPerMin = 0, visitMin = 0, capacity = Infinity } = {}) {
  return Math.min(Math.max(0, capacity), Math.max(0, arrivalPerMin) * Math.max(0, visitMin));
}

// How willing a plaza guest is to join the ride queue, in [0,1]. A strong ride
// pulls people in; a punishing wait makes them balk and go shop instead. This
// governs how much of the footfall converts to ride income vs. lingering spend.
export const BALK_WAIT_MIN = 12;   // wait (min) at which willingness is roughly halved
export function joinWillingness({ appeal = 1, waitMin = 0 } = {}) {
  const draw = Math.min(1, Math.max(0, appeal));           // ride's pull, normalized
  const balk = 1 / (1 + Math.max(0, waitMin) / BALK_WAIT_MIN);
  return Math.max(0, Math.min(1, draw * balk));
}

// One integrator tick of the live guest funnel (all rates per SECOND, dt in
// seconds). Three flows:
//   walk in     — arrivals land in the plaza (marketing/excitement driven)
//   join line   — fresh arrivals head straight for a good ride, and a slice of
//                 the milling plaza drifts over; both gated by joinWillingness
//   wander home — plaza guests leave after their visit (exponential residence)
// Queue drain (boarding) is the train sim's job, not ours. Returns the new
// stocks plus `join`, the number of guests who entered the line this tick —
// the renderer uses it to stage walk-up-and-decide vignettes at the arch.
export function stepCrowdFlows({
  plaza = 0,
  queue = 0,
  dt = 0,
  arrivalPerSec = 0,
  visitMin = VISIT_BASE_MIN,
  joinWill = 1,
  queueCap = Infinity,
  plazaCap = Infinity,
} = {}) {
  let p = Math.max(0, plaza);
  let q = Math.max(0, queue);
  p += Math.max(0, arrivalPerSec) * dt;                       // walk in
  p -= p * dt / Math.max(30, visitMin * 60);                  // wander home
  // join the line: ~70% of fresh arrivals beeline for the ride, plus a slow
  // drift out of the milling crowd — both scaled by willingness
  const joinPerSec = Math.max(0, joinWill) * (0.7 * Math.max(0, arrivalPerSec) + p * 0.008);
  const join = Math.min(p, Math.max(0, queueCap - q), joinPerSec * dt);
  p -= join;
  q += join;
  return { plaza: Math.min(Math.max(0, plazaCap), p), queue: q, join };
}
