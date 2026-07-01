export const DEFAULT_STATION = { cx: 0, cz: 9.0, y: 0.7 };
export const PATH_SAMPLES = {
  segment: 24,
  loop: 48,
  corkscrew: 46,
};

export function stationLength(upgrades) {
  return 3.5 + Math.min(1 + upgrades.car.level, 16) * 2.2;
}

export function syncStationPoints(ctrlPts, upgrades, station = DEFAULT_STATION) {
  const half = stationLength(upgrades) / 2;
  const a = ctrlPts[0];
  const b = ctrlPts[1];

  if (a) {
    a.x = station.cx + half;
    a.z = station.cz;
    a.y = station.y;
    a.station = true;
    a.seg = 'station';
  }

  if (b) {
    b.x = station.cx - half;
    b.z = station.cz;
    b.y = station.y;
    b.station = true;
    b.seg = 'plain';
  }

  return ctrlPts;
}

function catmull(Vector3, p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return new Vector3(
    f(p0.x, p1.x, p2.x, p3.x),
    f(p0.y, p1.y, p2.y, p3.y),
    f(p0.z, p1.z, p2.z, p3.z),
  );
}

function horiz(Vector3, v) {
  const h = new Vector3(v.x, 0, v.z);
  return h.lengthSq() < 1e-6 ? new Vector3(1, 0, 0) : h.normalize();
}

function buildCenterline({ ctrlPts, Vector3, worldUp, samples }) {
  const n = ctrlPts.length;
  const P = ctrlPts.map(p => new Vector3(p.x, p.y, p.z));
  const out = [];
  const at = i => P[((i % n) + n) % n];

  for (let i = 0; i < n; i++) {
    const node = ctrlPts[i];
    const seg = node.seg || 'plain';
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    if (seg === 'loop') {
      const fwd = horiz(Vector3, new Vector3().subVectors(p1, p0));
      const R = 2.3;
      const C = p1.clone().addScaledVector(worldUp, R);
      for (let k = 0; k < samples.loop; k++) {
        const th = (k / samples.loop) * Math.PI * 2;
        const pos = C.clone().addScaledVector(fwd, Math.sin(th) * R).addScaledVector(worldUp, -Math.cos(th) * R);
        const up = new Vector3().subVectors(C, pos).normalize();
        out.push({ pos, kind: 'loop', featureUp: up });
      }
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: catmull(Vector3, p0, p1, p2, p3, k / samples.segment), kind: 'plain' });
      }
    } else if (seg === 'corkscrew') {
      const axis = new Vector3().subVectors(p2, p1);
      const L = axis.length();
      const axisN = axis.clone().normalize();
      const ref = Math.abs(axisN.y) > 0.9 ? new Vector3(1, 0, 0) : worldUp;
      const n1 = new Vector3().crossVectors(axisN, ref).normalize();
      const n2 = new Vector3().crossVectors(axisN, n1).normalize();
      const r0 = Math.min(1.7, L * 0.34);
      const turns = 1;
      for (let k = 0; k < samples.corkscrew; k++) {
        const t = k / samples.corkscrew;
        const r = r0 * Math.sin(Math.PI * t);
        const phi = Math.PI * 2 * turns * t;
        const center = p1.clone().addScaledVector(axisN, L * t);
        const off = n1.clone().multiplyScalar(Math.cos(phi) * r).addScaledVector(n2, Math.sin(phi) * r);
        const pos = center.clone().add(off);
        const up = r > 0.05 ? off.clone().normalize() : worldUp.clone();
        out.push({ pos, kind: 'corkscrew', featureUp: up });
      }
    } else if (seg === 'station') {
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: p1.clone().lerp(p2, k / samples.segment), kind: 'station' });
      }
    } else {
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: catmull(Vector3, p0, p1, p2, p3, k / samples.segment), kind: seg });
      }
    }
  }

  return out;
}

function transportUp(Vector3, worldUp, prevUp, t0, t1) {
  const axis = new Vector3().crossVectors(t0, t1);
  const len = axis.length();
  const u = prevUp.clone();

  if (len > 1e-6) {
    axis.multiplyScalar(1 / len);
    u.applyAxisAngle(axis, Math.atan2(len, t0.dot(t1)));
  }

  u.addScaledVector(t1, -u.dot(t1));
  if (u.lengthSq() < 1e-9) {
    u.copy(worldUp).addScaledVector(t1, -t1.y);
    if (u.lengthSq() < 1e-9) u.set(1, 0, 0);
  }
  return u.normalize();
}

export function buildPath({
  ctrlPts,
  upgrades,
  researchDone = {},
  physics,
  Vector3,
  worldUp = new Vector3(0, 1, 0),
  station = DEFAULT_STATION,
  samples = PATH_SAMPLES,
}) {
  syncStationPoints(ctrlPts, upgrades, station);

  const raw = buildCenterline({ ctrlPts, Vector3, worldUp, samples });
  const N = raw.length;
  const pos = raw.map(r => r.pos);
  const kind = raw.map(r => r.kind);
  const featUp = raw.map(r => r.featureUp || null);

  const tan = [];
  for (let i = 0; i < N; i++) {
    const a = pos[(i - 1 + N) % N];
    const b = pos[(i + 1) % N];
    const t = new Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-9) t.copy(tan[i - 1] || new Vector3(1, 0, 0));
    tan.push(t.normalize());
  }

  const cum = [0];
  let len = 0;
  for (let i = 0; i < N; i++) {
    len += pos[(i + 1) % N].distanceTo(pos[i]);
    cum.push(len);
  }

  const height = pos.map(p => p.y);
  const speedMult = Math.pow(1.08, upgrades.speed.level + (researchDone.launch ? 1 : 0));
  const launchSpeed = (physics.launchSpeed || physics.vMin * 3) * speedMult;
  const startHeight = height[0] || station.y;
  const E = physics.g * startHeight + 0.5 * launchSpeed * launchSpeed;
  const rollbackSpeed = physics.rollbackSpeed || Math.max(1, physics.vMin * 0.55);
  const speed = new Array(N);

  function gravitySpeedAt(i) {
    const frictionLoss = 1 - Math.min(0.6, Math.max(0, physics.friction));
    const v2 = 2 * (E - physics.g * height[i]) * frictionLoss;
    if (v2 > 0.01) return Math.sqrt(v2);
    const uphillAhead = height[(i + 1) % N] > height[i] + 0.02;
    return uphillAhead ? -rollbackSpeed : rollbackSpeed;
  }

  for (let i = 0; i < N; i++) {
    const k = kind[i];
    const gravitySpeed = gravitySpeedAt(i);
    if (k === 'lift') speed[i] = Math.max(gravitySpeed, physics.liftSpeed * speedMult);
    else if (k === 'brake') speed[i] = gravitySpeed < 0 ? gravitySpeed : Math.min(gravitySpeed, physics.brakeSpeed * speedMult);
    else if (k === 'station') speed[i] = physics.stationSpeed;
    else speed[i] = gravitySpeed;
  }

  const localDs = i => {
    const dp = pos[i].distanceTo(pos[(i - 1 + N) % N]);
    const dn = pos[(i + 1) % N].distanceTo(pos[i]);
    return Math.max(dp + dn, 1e-3);
  };
  const curvature = i =>
    new Vector3().subVectors(tan[(i + 1) % N], tan[(i - 1 + N) % N]).multiplyScalar(1 / localDs(i));

  const up = new Array(N);
  const right = new Array(N);
  const baseUp = new Array(N);
  const seed = worldUp.clone().addScaledVector(tan[0], -tan[0].y);
  if (seed.lengthSq() < 1e-9) seed.set(1, 0, 0);
  seed.normalize();

  for (let i = 0; i < N; i++) {
    let bUp;
    if (featUp[i]) {
      bUp = featUp[i].clone();
      bUp.addScaledVector(tan[i], -bUp.dot(tan[i]));
      if (bUp.lengthSq() < 1e-9) bUp.copy(i ? baseUp[i - 1] : seed);
      bUp.normalize();
    } else {
      bUp = i === 0 ? seed.clone() : transportUp(Vector3, worldUp, baseUp[i - 1], tan[i - 1], tan[i]);
    }
    baseUp[i] = bUp.clone();

    const fUp = bUp.clone();
    if (!featUp[i]) {
      const kv = curvature(i);
      const rTmp = new Vector3().crossVectors(bUp, tan[i]).normalize();
      const aLat = speed[i] * speed[i] * kv.dot(rTmp);
      const bank = Math.max(-physics.maxBank, Math.min(physics.maxBank, Math.atan2(aLat, physics.g)));
      fUp.applyAxisAngle(tan[i], -bank);
    }
    right[i] = new Vector3().crossVectors(fUp, tan[i]).normalize();
    up[i] = new Vector3().crossVectors(tan[i], right[i]).normalize();
  }

  const GCAP = 5.0;
  let maxSpeed = 0;
  let maxVertG = -99;
  let minVertG = 99;
  let maxLatG = 0;
  let airCount = 0;
  let dirChanges = 0;
  let lapTime = 0;
  let prevLatSign = 0;
  let maxDrop = 0;
  let runDrop = 0;
  let rollback = false;

  for (let i = 0; i < N; i++) {
    const ds = cum[i + 1] - cum[i] || 0.001;
    const absSpeed = Math.abs(speed[i]);
    lapTime += ds / Math.max(absSpeed, 0.5);
    maxSpeed = Math.max(maxSpeed, absSpeed);
    rollback ||= speed[i] < 0;

    const dh = height[(i + 1) % N] - height[i];
    if (dh < 0) {
      runDrop -= dh;
      maxDrop = Math.max(maxDrop, runDrop);
    } else {
      runDrop = 0;
    }

    const ac = curvature(i).multiplyScalar(absSpeed * absSpeed);
    const felt = ac.add(new Vector3(0, physics.g, 0));
    let gV = felt.dot(up[i]) / physics.g;
    let gL = felt.dot(right[i]) / physics.g;
    gV = Math.max(-GCAP, Math.min(GCAP, gV));
    gL = Math.max(-GCAP, Math.min(GCAP, gL));
    maxVertG = Math.max(maxVertG, gV);
    minVertG = Math.min(minVertG, gV);
    maxLatG = Math.max(maxLatG, Math.abs(gL));
    if (gV < 0.2) airCount++;
    if (Math.abs(gL) > 0.4) {
      const sgn = Math.sign(gL);
      if (prevLatSign !== 0 && sgn !== prevLatSign) dirChanges++;
      prevLatSign = sgn;
    }
  }

  dirChanges = Math.min(dirChanges, 20);
  const airBonus = Math.min(airCount, Math.round(N * 0.25));
  const inversions = ctrlPts.filter(p => p.seg === 'loop' || p.seg === 'corkscrew').length;
  let excitement =
    2 + maxDrop * 2.2 + maxSpeed * 0.5 + inversions * 7 + airBonus * 0.12 + len * 0.13 + Math.min(maxVertG, 4) * 1.1;
  const intensity = 4 + maxSpeed * 0.55 + maxVertG * 5 + maxLatG * 6 + inversions * 5;
  const nausea = maxLatG * 7 + inversions * 6 + dirChanges * 0.7 + Math.max(0, intensity - 55) * 0.3;

  if (intensity > 80) excitement *= 0.85;
  if (intensity > 120) excitement *= 0.8;
  excitement = Math.max(0, excitement);

  const stats = {
    length: Math.round(len),
    lapTime,
    maxSpeed,
    maxVertG,
    minVertG,
    maxLatG,
    inversions,
    airCount,
    dirChanges,
    maxDrop,
    rollback,
    excitement: +excitement.toFixed(1),
    intensity: +intensity.toFixed(1),
    nausea: +nausea.toFixed(1),
  };

  return { N, pos, tan, up, right, kind, cum, len, height, speed, stats };
}

export function samplePathAt(path, s, Vector3) {
  const L = path.len;
  const sampleS = ((s % L) + L) % L;
  const cum = path.cum;
  const N = path.N;
  let lo = 0;
  let hi = N;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= sampleS) lo = m + 1;
    else hi = m;
  }
  const i = Math.max(0, lo - 1);
  const i2 = (i + 1) % N;
  const t = (sampleS - cum[i]) / (cum[i + 1] - cum[i] || 1);
  const pos = path.pos[i].clone().lerp(path.pos[i2], t);
  const tan = path.tan[i].clone().lerp(path.tan[i2], t).normalize();
  let up = path.up[i].clone().lerp(path.up[i2], t);
  up.addScaledVector(tan, -up.dot(tan));
  if (up.lengthSq() < 1e-9) up.copy(path.up[i]);
  up.normalize();
  const right = new Vector3().crossVectors(up, tan).normalize();
  up = new Vector3().crossVectors(tan, right).normalize();
  return { pos, tan, up, right };
}

export function speedAtPath(path, s) {
  const L = path.len;
  const sampleS = ((s % L) + L) % L;
  const cum = path.cum;
  const N = path.N;
  let lo = 0;
  let hi = N;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= sampleS) lo = m + 1;
    else hi = m;
  }
  const i = Math.max(0, lo - 1);
  const i2 = (i + 1) % N;
  const t = (sampleS - cum[i]) / (cum[i + 1] - cum[i] || 1);
  return path.speed[i] * (1 - t) + path.speed[i2] * t;
}
