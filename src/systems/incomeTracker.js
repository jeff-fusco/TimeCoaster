// Rolling window of actually-credited income, so the HUD can show measured
// $/min instead of (or alongside) the model's estimate. Playtest feedback:
// with train back-ups the projected rate overstated reality.
//
// Ring buffer of 1-second buckets keyed by absolute second, so stale entries
// from a previous lap of the ring are ignored without any cleanup pass.
export function createIncomeTracker(windowSec = 60) {
  const size = Math.max(5, Math.floor(windowSec));
  const secs = new Array(size).fill(-1);
  const amts = new Array(size).fill(0);
  let startSec = null;

  function record(amount, now) {
    if (!(amount > 0) || !Number.isFinite(now)) return;
    const sec = Math.floor(now);
    if (startSec === null) startSec = sec;
    const i = ((sec % size) + size) % size;
    if (secs[i] !== sec) {
      secs[i] = sec;
      amts[i] = 0;
    }
    amts[i] += amount;
  }

  // Measured $/min over the observed window; null until ~10s of signal exists.
  function ratePerMin(now) {
    if (startSec === null || !Number.isFinite(now)) return null;
    const sec = Math.floor(now);
    const span = Math.min(size, Math.max(1, sec - startSec + 1));
    if (span < 10) return null;
    let total = 0;
    for (let k = 0; k < span; k++) {
      const s = sec - k;
      const i = ((s % size) + size) % size;
      if (secs[i] === s) total += amts[i];
    }
    return (total / span) * 60;
  }

  return { record, ratePerMin };
}
