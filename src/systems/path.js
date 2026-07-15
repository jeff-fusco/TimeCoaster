export const DEFAULT_STATION = { cx: 0, cz: 9.0, y: 0.7 };
export const PATH_SAMPLES = {
  segment: 24,
  loop: 48,
  corkscrew: 46,
  spiral: 76,
  giantLoop: 80,
  tunnel: 40,
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

function hermite(Vector3, p0, m0, p1, m1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return new Vector3(
    h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
    h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
    h00 * p0.z + h10 * m0.z + h01 * p1.z + h11 * m1.z,
  );
}

function horiz(Vector3, v) {
  const h = new Vector3(v.x, 0, v.z);
  return h.lengthSq() < 1e-6 ? new Vector3(1, 0, 0) : h.normalize();
}

function safeDir(Vector3, from, to, fallback) {
  const dir = new Vector3().subVectors(to, from);
  return dir.lengthSq() > 1e-6 ? dir.normalize() : fallback.clone();
}

function buildCenterline({ ctrlPts, Vector3, worldUp, samples }) {
  const n = ctrlPts.length;
  const P = ctrlPts.map(p => new Vector3(p.x, p.y, p.z));
  const out = [];
  const at = i => P[((i % n) + n) % n];
  const stationA = at(0);
  const stationB = at(1);
  const stationDir = safeDir(Vector3, stationA, stationB, new Vector3(-1, 0, 0));
  const stationLen = stationA.distanceTo(stationB);
  const runwayLen = Math.max(2.8, Math.min(4.5, stationLen * 0.28));
  const runwaySamples = Math.max(6, Math.round(samples.segment * 0.33));
  const preStation = stationA.clone().addScaledVector(stationDir, -runwayLen);
  const postStation = stationB.clone().addScaledVector(stationDir, runwayLen);

  function pushLine(a, b, count, kind) {
    for (let k = 0; k < count; k++) {
      out.push({ pos: a.clone().lerp(b, k / count), kind });
    }
  }

  for (let i = 0; i < n; i++) {
    const node = ctrlPts[i];
    const seg = node.seg || 'plain';
    let p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    let p3 = at(i + 2);
    if (i === 2) p0 = postStation;
    if (i === n - 2) p3 = preStation;

    if (i === n - 1) {
      const dist = Math.max(p1.distanceTo(preStation), 1);
      const startDir = safeDir(Vector3, at(i - 1), preStation, stationDir);
      const m0 = startDir.multiplyScalar(dist * 0.75);
      const m1 = stationDir.clone().multiplyScalar(dist * 0.75);
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: hermite(Vector3, p1, m0, preStation, m1, k / samples.segment), kind: seg, bank: node.bank });
      }
      pushLine(preStation, stationA, runwaySamples, 'station');
    } else if (i === 1) {
      pushLine(stationB, postStation, runwaySamples, 'station');
      const dist = Math.max(postStation.distanceTo(p2), 1);
      const endDir = safeDir(Vector3, postStation, p3, stationDir);
      const m0 = stationDir.clone().multiplyScalar(dist * 0.75);
      const m1 = endDir.multiplyScalar(dist * 0.75);
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: hermite(Vector3, postStation, m0, p2, m1, k / samples.segment), kind: seg, bank: node.bank });
      }
    } else if (seg === 'loop' || seg === 'giantLoop') {
      const fwd = horiz(Vector3, new Vector3().subVectors(p1, p0));
      const R = seg === 'giantLoop' ? 5.2 : 2.3;
      const C = p1.clone().addScaledVector(worldUp, R);
      const count = seg === 'giantLoop' ? samples.giantLoop : samples.loop;
      for (let k = 0; k < count; k++) {
        const th = (k / count) * Math.PI * 2;
        // teardrop/clothoid profile: the horizontal spread narrows toward the
        // top (tight rounded apex) and splays at the base — taller than wide,
        // like a real coaster loop instead of a cartoon circle. Peak height
        // stays 2R so the energy sweep is unchanged.
        const widthK = 0.7 + 0.35 * Math.cos(th);
        const pos = C.clone()
          .addScaledVector(fwd, Math.sin(th) * R * widthK)
          .addScaledVector(worldUp, -Math.cos(th) * R);
        const up = new Vector3().subVectors(C, pos).normalize();
        out.push({ pos, kind: seg, featureUp: up });
      }
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: catmull(Vector3, p0, p1, p2, p3, k / samples.segment), kind: 'plain' });
      }
    } else if (seg === 'spiral') {
      const axis = new Vector3().subVectors(p2, p1);
      const L = Math.max(axis.length(), 0.001);
      const axisN = axis.clone().normalize();
      const ref = Math.abs(axisN.y) > 0.85 ? new Vector3(1, 0, 0) : worldUp;
      const n1 = new Vector3().crossVectors(axisN, ref).normalize();
      const n2 = new Vector3().crossVectors(axisN, n1).normalize();
      const r0 = Math.min(3.2, Math.max(1.8, L * 0.28));
      const turns = Math.max(1.5, Math.min(3.5, L / 4));
      for (let k = 0; k < samples.spiral; k++) {
        const t = k / samples.spiral;
        const ease = Math.sin(Math.PI * t);
        const phi = Math.PI * 2 * turns * t;
        const center = p1.clone().addScaledVector(axisN, L * t);
        const off = n1.clone().multiplyScalar(Math.cos(phi) * r0 * ease).addScaledVector(n2, Math.sin(phi) * r0 * ease);
        const pos = center.clone().add(off);
        const up = off.lengthSq() > 0.01 ? off.clone().normalize() : worldUp.clone();
        out.push({ pos, kind: 'spiral', featureUp: up });
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
    } else if (seg === 'vertical') {
      for (let k = 0; k < samples.segment; k++) {
        const t = k / samples.segment;
        const e = t * t * (3 - 2 * t);
        out.push({
          pos: new Vector3(
            p1.x + (p2.x - p1.x) * e,
            p1.y + (p2.y - p1.y) * t,
            p1.z + (p2.z - p1.z) * e,
          ),
          kind: 'vertical',
        });
      }
    } else if (seg === 'tunnel') {
      const depth = Math.max(2.6, Math.min(7.5, p1.distanceTo(p2) * 0.22));
      for (let k = 0; k < samples.tunnel; k++) {
        const t = k / samples.tunnel;
        const pos = catmull(Vector3, p0, p1, p2, p3, t);
        pos.y -= depth * Math.sin(Math.PI * t);
        out.push({ pos, kind: 'tunnel' });
      }
    } else if (seg === 'teleporter') {
      for (let k = 0; k < samples.segment; k++) {
        const t = k / samples.segment;
        const pos = p1.clone().lerp(p2, t);
        pos.y += Math.sin(Math.PI * t) * 0.8;
        out.push({ pos, kind: 'teleporter' });
      }
    } else if (seg === 'station') {
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: p1.clone().lerp(p2, k / samples.segment), kind: 'station' });
      }
    } else {
      for (let k = 0; k < samples.segment; k++) {
        out.push({ pos: catmull(Vector3, p0, p1, p2, p3, k / samples.segment), kind: seg, bank: node.bank });
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

function flatUpFor(Vector3, worldUp, tangent) {
  const up = worldUp.clone().addScaledVector(tangent, -worldUp.dot(tangent));
  if (up.lengthSq() < 1e-9) up.set(0, 1, 0);
  return up.normalize();
}

function smoothScalarLoop(values, locked, passes = 4) {
  let out = values.slice();
  const n = out.length;
  for (let pass = 0; pass < passes; pass++) {
    const next = out.slice();
    for (let i = 0; i < n; i++) {
      if (locked[i]) continue;
      const prev = locked[(i - 1 + n) % n] ? out[i] : out[(i - 1 + n) % n];
      const cur = out[i];
      const after = locked[(i + 1) % n] ? out[i] : out[(i + 1) % n];
      next[i] = prev * 0.25 + cur * 0.5 + after * 0.25;
    }
    out = next;
  }
  return out;
}

function limitScalarSteps(values, locked, maxStep) {
  const out = values.slice();
  const n = out.length;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n; i++) {
      if (locked[i]) continue;
      const delta = out[i] - out[i - 1];
      if (Math.abs(delta) > maxStep) out[i] = out[i - 1] + Math.sign(delta) * maxStep;
    }
    for (let i = n - 2; i >= 0; i--) {
      if (locked[i]) continue;
      const delta = out[i] - out[i + 1];
      if (Math.abs(delta) > maxStep) out[i] = out[i + 1] + Math.sign(delta) * maxStep;
    }
  }
  return out;
}

function preferStableBank(values, locked) {
  const out = values.slice();
  const n = out.length;
  for (let i = 0; i < n; i++) {
    if (locked[i]) {
      out[i] = 0;
      continue;
    }
    const cur = values[i];
    const prev = values[(i - 2 + n) % n];
    const next = values[(i + 2) % n];
    const sameLean =
      Math.sign(prev) === Math.sign(cur) &&
      Math.sign(next) === Math.sign(cur) &&
      Math.abs(prev) > 0.015 &&
      Math.abs(next) > 0.015;
    if (!sameLean) out[i] = cur * 0.35;
  }
  return out;
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
  // manual bank override per sample, as a fraction of maxBank in [-1, 1]
  const manualBank = raw.map(r => (Number.isFinite(r.bank) ? Math.max(-1, Math.min(1, r.bank)) : null));

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
  const g = physics.g;
  const launchSpeed = (physics.launchSpeed || physics.vMin * 3) * speedMult;
  const liftSpeed = (physics.liftSpeed || 3.6) * speedMult;
  const brakeSpeed = (physics.brakeSpeed || 3) * speedMult;
  const stationSpeed = physics.stationSpeed || 2.6;
  const rollbackSpeed = physics.rollbackSpeed || Math.max(1, physics.vMin * 0.55);
  const launchEnergy = g * (height[0] || station.y) + 0.5 * launchSpeed * launchSpeed;
  const ke = v => 0.5 * v * v;   // specific kinetic energy (per unit mass)

  // ── forward energy sweep ──────────────────────────────────────────────────
  // The train launches leaving the station, then energy is conserved except:
  //   · a chain LIFT hauls the train up and tops its energy off to the crest —
  //     THIS is how a coaster gains height it couldn't reach on launch energy;
  //   · a BRAKE bleeds energy down to a slow crawl;
  //   · rolling friction drains a little energy with distance.
  // Energy is carried around the loop so tall lift hills power the whole circuit.
  const energy = new Array(N);
  const frictionK = Math.min(0.6, Math.max(0, physics.friction));
  let rollback = false;
  let E = launchEnergy;
  for (let step = 0; step < N; step++) {
    const i = step;
    const k = kind[i];
    const potential = g * height[i];
    const prevK = kind[(i - 1 + N) % N];
    if (k === 'station') {
      E = potential + ke(stationSpeed);                    // crawl through the platform
    } else {
      if (prevK === 'station') {
        E = Math.max(E, launchEnergy);                     // launch! inject launch energy
      } else {
        const ds = pos[i].distanceTo(pos[(i - 1 + N) % N]);
        E -= frictionK * g * ds * 0.5;                     // rolling resistance
      }
      if (k === 'lift') E = Math.max(E, potential + ke(liftSpeed));    // chain haul to this height
      else if (k === 'brake') E = Math.min(E, potential + ke(brakeSpeed));
      if (E < potential + 0.02) {                          // too tall to reach unassisted
        rollback = true;
        E = potential + ke(rollbackSpeed);                 // stylized: crawl over, never fully stuck
      }
    }
    energy[i] = E;
  }

  const speed = new Array(N);
  for (let i = 0; i < N; i++) {
    const k = kind[i];
    const v = Math.sqrt(Math.max(0.25, 2 * (energy[i] - g * height[i])));
    if (k === 'station') speed[i] = stationSpeed;
    else if (k === 'lift') {
      // Chain drags the train up at chain speed ONLY while climbing. Once the
      // segment tips downhill (the drop off a lift-painted crest) the chain
      // releases and gravity takes over — otherwise the coaster crawls downhill.
      const climbing = height[(i + 1) % N] >= height[i] - 0.05;
      speed[i] = climbing ? liftSpeed : Math.max(liftSpeed, v);
    }
    else if (k === 'brake') speed[i] = Math.min(v, brakeSpeed);
    else if (k === 'teleporter') speed[i] = Math.max(v, launchSpeed * 1.45);
    else speed[i] = v;
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
  const desiredBank = new Array(N).fill(0);
  // flatLock: features/station stay level (preferStableBank zeroes these).
  // lockedBank additionally pins manual banks so the player's tilt is preserved
  // exactly while neighbouring auto-banked samples ramp smoothly toward it.
  const flatLock = featUp.map((feature, i) => feature || kind[i] === 'station');
  const lockedBank = flatLock.map((flat, i) => flat || manualBank[i] != null);
  const seed = worldUp.clone().addScaledVector(tan[0], -tan[0].y);
  if (seed.lengthSq() < 1e-9) seed.set(1, 0, 0);
  seed.normalize();

  for (let i = 0; i < N; i++) {
    let bUp;
    if (kind[i] === 'station') {
      bUp = flatUpFor(Vector3, worldUp, tan[i]);
    } else if (featUp[i]) {
      bUp = featUp[i].clone();
      bUp.addScaledVector(tan[i], -bUp.dot(tan[i]));
      if (bUp.lengthSq() < 1e-9) bUp.copy(i ? baseUp[i - 1] : seed);
      bUp.normalize();
    } else {
      bUp = i === 0 ? seed.clone() : transportUp(Vector3, worldUp, baseUp[i - 1], tan[i - 1], tan[i]);
    }
    baseUp[i] = bUp.clone();

    if (manualBank[i] != null) {
      // player-set tilt (fraction of maxBank), overriding the physics estimate
      desiredBank[i] = manualBank[i] * physics.maxBank;
    } else if (!featUp[i] && kind[i] !== 'station') {
      const kv = curvature(i);
      const rTmp = new Vector3().crossVectors(bUp, tan[i]).normalize();
      const aLat = speed[i] * speed[i] * kv.dot(rTmp);
      desiredBank[i] = Math.max(-physics.maxBank, Math.min(physics.maxBank, Math.atan2(aLat, physics.g)));
    }
  }

  const bank = limitScalarSteps(
    smoothScalarLoop(preferStableBank(desiredBank, flatLock), lockedBank, 6),
    lockedBank,
    physics.bankStep || 0.045,
  );

  for (let i = 0; i < N; i++) {
    const fUp = baseUp[i].clone();
    if (!featUp[i]) fUp.applyAxisAngle(tan[i], -bank[i]);
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
  let airtime = 0;   // ejector-airtime score: how far below 0.3g, summed

  for (let i = 0; i < N; i++) {
    const ds = cum[i + 1] - cum[i] || 0.001;
    const absSpeed = Math.abs(speed[i]);
    lapTime += ds / Math.max(absSpeed, 0.5);
    maxSpeed = Math.max(maxSpeed, absSpeed);

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
    if (gV < 0.3) airtime += (0.3 - gV) * ds;   // weight true airtime by hang-time & distance
    if (Math.abs(gL) > 0.4) {
      const sgn = Math.sign(gL);
      if (prevLatSign !== 0 && sgn !== prevLatSign) dirChanges++;
      prevLatSign = sgn;
    }
  }

  dirChanges = Math.min(dirChanges, 20);
  // airtime score, capped so a single long floaty stretch can't dominate
  const airScore = Math.min(airtime * 0.9, 60);
  const inversions = ctrlPts.filter(p => p.seg === 'loop' || p.seg === 'corkscrew' || p.seg === 'giantLoop' || p.seg === 'spiral').length;
  const featureCounts = ctrlPts.reduce((out, p) => {
    out[p.seg || 'plain'] = (out[p.seg || 'plain'] || 0) + 1;
    return out;
  }, {});
  // Height and airtime drive excitement; length pays sublinearly so a tall,
  // varied coaster beats a giant flat oval (M4 rework).
  let excitement =
    4 + maxDrop * 2.7 + maxSpeed * 0.55 + inversions * 7 + airScore + Math.pow(Math.max(0, len), 0.72) * 0.55 +
    Math.min(maxVertG, 4) * 1.2 +
    (featureCounts.spiral || 0) * 10 +
    (featureCounts.giantLoop || 0) * 18 +
    (featureCounts.vertical || 0) * 9 +
    (featureCounts.tunnel || 0) * 15 +
    (featureCounts.teleporter || 0) * 35;
  const intensity =
    4 + maxSpeed * 0.55 + maxVertG * 5 + maxLatG * 6 + inversions * 5 +
    (featureCounts.giantLoop || 0) * 8 +
    (featureCounts.vertical || 0) * 10 +
    (featureCounts.teleporter || 0) * 14;
  const nausea =
    maxLatG * 7 + inversions * 6 + dirChanges * 0.7 + Math.max(0, intensity - 55) * 0.3 +
    (featureCounts.spiral || 0) * 4 +
    (featureCounts.teleporter || 0) * 9;

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
    featureCounts,
    excitement: +excitement.toFixed(1),
    intensity: +intensity.toFixed(1),
    nausea: +nausea.toFixed(1),
  };

  return { N, pos, tan, up, right, kind, cum, len, height, speed, bank, stats };
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
