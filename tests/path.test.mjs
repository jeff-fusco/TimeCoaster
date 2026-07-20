import assert from 'node:assert/strict';
import {
  PATH_SAMPLES,
  buildPath,
  samplePathAt,
  speedAtPath,
  stationLength,
  syncStationPoints,
} from '../src/systems/path.js';
import { Vec3 } from './helpers/vector3.mjs';

const PHYS = {
  g: 18,
  vMin: 4.0,
  vCrest: 3.4,
  launchSpeed: 12.5,
  rollbackSpeed: 2.2,
  liftSpeed: 3.6,
  brakeSpeed: 3.0,
  stationSpeed: 2.6,
  friction: 0.012,
  maxBank: 0.62,
};

function makeUpgrades() {
  return {
    car: { level: 0 },
    speed: { level: 0 },
  };
}

function makeCtrlPts() {
  return [
    { x: 2.85, y: 0.7, z: 9.0, station: true, seg: 'station' },
    { x: -2.85, y: 0.7, z: 9.0, station: true, seg: 'plain' },
    { x: -7.5, y: 0.9, z: 5.5, seg: 'plain' },
    { x: -9.8, y: 1.1, z: 0.0, seg: 'plain' },
    { x: -7.5, y: 0.9, z: -5.5, seg: 'plain' },
    { x: 0.0, y: 1.3, z: -9.3, seg: 'plain' },
    { x: 7.5, y: 0.9, z: -5.5, seg: 'plain' },
    { x: 9.8, y: 1.1, z: 0.0, seg: 'plain' },
    { x: 7.5, y: 0.9, z: 5.5, seg: 'plain' },
  ];
}

function makePath(ctrlPts = makeCtrlPts(), upgrades = makeUpgrades(), researchDone = {}) {
  return buildPath({
    ctrlPts,
    upgrades,
    researchDone,
    physics: PHYS,
    Vector3: Vec3,
    worldUp: new Vec3(0, 1, 0),
  });
}

{
  const upgrades = makeUpgrades();
  assert.equal(stationLength(upgrades), 5.7);
  upgrades.car.level = 2;
  assert.equal(stationLength(upgrades), 10.100000000000001);
  upgrades.car.level = 20;
  assert.equal(stationLength(upgrades), 38.7);
}

{
  const ctrlPts = makeCtrlPts();
  const upgrades = makeUpgrades();
  upgrades.car.level = 2;
  syncStationPoints(ctrlPts, upgrades);
  assert.equal(ctrlPts[0].station, true);
  assert.equal(ctrlPts[0].seg, 'station');
  assert.equal(ctrlPts[1].station, true);
  assert.equal(ctrlPts[1].seg, 'plain');
  assert.ok(Math.abs(ctrlPts[0].x - 5.05) < 1e-9);
  assert.ok(Math.abs(ctrlPts[1].x + 5.05) < 1e-9);
  assert.equal(ctrlPts[0].y, 0.7);
  assert.equal(ctrlPts[1].z, 9);
}

{
  const ctrlPts = makeCtrlPts();
  const path = makePath(ctrlPts);
  assert.equal(path.N, ctrlPts.length * PATH_SAMPLES.segment + Math.round(PATH_SAMPLES.segment * 0.67));
  assert.equal(path.kind[0], 'station');
  assert.equal(path.stats.inversions, 0);
  assert.equal(path.stats.length, 61);
  assert.ok(path.stats.lapTime > 5);
  assert.ok(path.stats.maxSpeed >= PHYS.vMin);
  assert.equal(path.stats.rollback, false);
  assert.equal(path.kind.filter(kind => kind === 'station').length, PATH_SAMPLES.segment + Math.round(PATH_SAMPLES.segment * 0.67));
  const stationDir = new Vec3().subVectors(
    new Vec3(ctrlPts[1].x, ctrlPts[1].y, ctrlPts[1].z),
    new Vec3(ctrlPts[0].x, ctrlPts[0].y, ctrlPts[0].z),
  ).normalize();
  const stationRuns = [];
  let run = [];
  path.kind.forEach((kind, i) => {
    if (kind === 'station') {
      run.push(i);
      assert.equal(path.height[i], 0.7);
      assert.ok(Math.abs(path.bank[i]) < 1e-9, 'station and runway samples stay unbanked');
      assert.ok(path.up[i].y > 0.999, 'station and runway samples stay flat');
    } else if (run.length) {
      stationRuns.push(run);
      run = [];
    }
  });
  if (run.length) stationRuns.push(run);
  assert.equal(stationRuns.length, 2);
  stationRuns.forEach(samples => {
    const before = (samples[0] - 1 + path.N) % path.N;
    const after = (samples[samples.length - 1] + 1) % path.N;
    assert.ok(path.tan[before].dot(stationDir) > 0.94, 'approach aligns before the flat station runway');
    assert.ok(path.tan[after].dot(stationDir) > 0.94, 'departure aligns after the flat station runway');
  });

  const start = samplePathAt(path, 0, Vec3);
  assert.ok(Math.abs(start.pos.x - ctrlPts[0].x) < 1e-9);
  assert.ok(Math.abs(start.pos.y - ctrlPts[0].y) < 1e-9);
  assert.ok(Math.abs(start.pos.z - ctrlPts[0].z) < 1e-9);
  assert.equal(speedAtPath(path, 0), PHYS.stationSpeed);
}

{
  const baseline = makePath();
  const ctrlPts = makeCtrlPts();
  ctrlPts[3].seg = 'loop';
  const loopPath = makePath(ctrlPts);
  assert.equal(loopPath.N, baseline.N + PATH_SAMPLES.loop);
  assert.equal(loopPath.stats.inversions, 1);
  assert.ok(loopPath.kind.includes('loop'));
  assert.ok(loopPath.stats.length > baseline.stats.length);
  assert.ok(loopPath.stats.excitement > baseline.stats.excitement);
}

{
  const baseline = makePath();
  const segments = [
    ['spiral', PATH_SAMPLES.spiral - PATH_SAMPLES.segment],
    ['giantLoop', PATH_SAMPLES.giantLoop],
    ['vertical', 0],
    ['tunnel', PATH_SAMPLES.tunnel - PATH_SAMPLES.segment],
    ['teleporter', 0],
  ];
  for (const [seg, sampleDelta] of segments) {
    const ctrlPts = makeCtrlPts();
    ctrlPts[3].seg = seg;
    if (seg === 'vertical') ctrlPts[4].y = 14;
    const path = makePath(ctrlPts);
    assert.ok(path.kind.includes(seg), `${seg} produces real path samples`);
    assert.equal(path.stats.featureCounts[seg], 1);
    assert.ok(path.stats.excitement > baseline.stats.excitement, `${seg} affects excitement`);
    if (sampleDelta) assert.equal(path.N, baseline.N + sampleDelta);
    if (seg === 'tunnel') assert.ok(Math.min(...path.height) < 0, 'tunnel dives below the land plane');
    if (seg === 'teleporter') {
      const portalSpeed = Math.max(...path.speed.filter((speed, i) => path.kind[i] === 'teleporter'));
      assert.ok(portalSpeed > baseline.stats.maxSpeed, 'teleporter acts as a high-speed portal accelerator');
    }
  }
}

// parametric feature sizes: spiralR / corkR / tunnelDepth override the
// length-derived defaults, are clamped, and reshape the geometry
{
  const spread = (path, kind, axisFrom, axisTo) => {
    // max distance of a feature's samples from its straight axis
    let max = 0;
    for (let i = 0; i < path.N; i++) {
      if (path.kind[i] !== kind) continue;
      const p = { x: path.pos[i].x, y: path.pos[i].y, z: path.pos[i].z };
      const ab = { x: axisTo.x - axisFrom.x, y: axisTo.y - axisFrom.y, z: axisTo.z - axisFrom.z };
      const len2 = ab.x ** 2 + ab.y ** 2 + ab.z ** 2;
      const t = ((p.x - axisFrom.x) * ab.x + (p.y - axisFrom.y) * ab.y + (p.z - axisFrom.z) * ab.z) / len2;
      const q = { x: axisFrom.x + ab.x * t, y: axisFrom.y + ab.y * t, z: axisFrom.z + ab.z * t };
      max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
    }
    return max;
  };

  const base = makeCtrlPts();
  base[3].seg = 'spiral';
  const auto = makePath(base.map(p => ({ ...p })));
  const big = base.map(p => ({ ...p }));
  big[3].spiralR = 6;
  const bigPath = makePath(big);
  const axisA = base[3];
  const axisB = base[4];
  assert.ok(
    spread(bigPath, 'spiral', axisA, axisB) > spread(auto, 'spiral', axisA, axisB) + 1,
    'a bigger spiralR swings wider around the axis',
  );
  const huge = base.map(p => ({ ...p }));
  huge[3].spiralR = 999;
  assert.ok(spread(makePath(huge), 'spiral', axisA, axisB) < 8, 'spiralR is clamped');

  const cork = makeCtrlPts();
  cork[3].seg = 'corkscrew';
  const corkAuto = makePath(cork.map(p => ({ ...p })));
  const corkBig = cork.map(p => ({ ...p }));
  corkBig[3].corkR = 4;
  assert.ok(
    spread(makePath(corkBig), 'corkscrew', axisA, axisB) > spread(corkAuto, 'corkscrew', axisA, axisB) + 0.8,
    'a bigger corkR rolls wider',
  );

  const tun = makeCtrlPts();
  tun[3].seg = 'tunnel';
  const tunAuto = makePath(tun.map(p => ({ ...p })));
  const tunDeep = tun.map(p => ({ ...p }));
  tunDeep[3].tunnelDepth = 12;
  const deepPath = makePath(tunDeep);
  assert.ok(Math.min(...deepPath.height) < Math.min(...tunAuto.height) - 3, 'a deeper tunnel dives further');
  const tunClamp = tun.map(p => ({ ...p }));
  tunClamp[3].tunnelDepth = 999;
  assert.ok(Math.min(...makePath(tunClamp).height) >= Math.min(...deepPath.height) - 1e-9, 'tunnelDepth is clamped');
}

{
  const ctrlPts = makeCtrlPts();
  ctrlPts[3].seg = 'brake';
  const upgrades = makeUpgrades();
  upgrades.speed.level = 2;
  const path = makePath(ctrlPts, upgrades);
  const brakeIndex = path.kind.findIndex(kind => kind === 'brake');
  assert.notEqual(brakeIndex, -1);
  assert.ok(path.speed[brakeIndex] <= PHYS.brakeSpeed * Math.pow(1.08, 2) + 1e-9);
  assert.ok(path.speed[brakeIndex] > 0);
}

{
  const normal = makePath();
  const launch = makePath(makeCtrlPts(), makeUpgrades(), { launch: true });
  assert.ok(launch.stats.maxSpeed > normal.stats.maxSpeed);
  assert.ok(speedAtPath(launch, launch.len / 2) > speedAtPath(normal, normal.len / 2));
}

{
  const ctrlPts = makeCtrlPts();
  ctrlPts[2].x = -11;
  ctrlPts[3].x = -3;
  ctrlPts[4].x = -11;
  ctrlPts[5].x = 0;
  ctrlPts[6].x = 11;
  ctrlPts[7].x = 3;
  ctrlPts[8].x = 11;
  const path = makePath(ctrlPts);
  const maxBank = Math.max(...path.bank.map(Math.abs));
  const maxBankStep = path.bank.reduce((max, bank, i) => {
    const next = path.bank[(i + 1) % path.bank.length];
    return Math.max(max, Math.abs(next - bank));
  }, 0);
  assert.ok(maxBank > 0.02, 'turns still receive natural banking');
  assert.ok(maxBankStep <= 0.05, 'banking changes smoothly between adjacent samples');
}

{
  // a hill taller than the launch energy, with no lift, flags a rollback and
  // leaves the train crawling (not reversing — trains always complete the loop)
  const ctrlPts = makeCtrlPts();
  ctrlPts[3].y = 12;
  const path = makePath(ctrlPts);
  assert.equal(path.stats.rollback, true, 'an under-powered tall hill flags a rollback');
  const minSpeed = Math.min(...path.speed);
  assert.ok(minSpeed > 0, 'the train crawls rather than reversing');
  assert.ok(minSpeed <= PHYS.rollbackSpeed + 0.6, 'it barely creeps over the too-tall hill');
}

{
  const ctrlPts = makeCtrlPts();
  ctrlPts[2].seg = 'lift';
  ctrlPts[3].y = 12;
  const path = makePath(ctrlPts);
  const liftSpeeds = path.speed.filter((speed, i) => path.kind[i] === 'lift');
  assert.ok(liftSpeeds.length > 0);
  assert.ok(liftSpeeds.every(speed => speed >= PHYS.liftSpeed - 1e-9), 'chain lift drags the train up at chain speed');
}

{
  // regression: a lift-painted segment that tips downhill (the drop off a
  // lift-marked crest) must release the chain and accelerate under gravity
  const ctrlPts = makeCtrlPts();
  ctrlPts[2].seg = 'lift'; ctrlPts[2].y = 4;
  ctrlPts[3].seg = 'lift'; ctrlPts[3].y = 20;   // crest is also painted lift
  ctrlPts[4].y = 2;                              // then a big drop
  const path = makePath(ctrlPts);
  // find the crest, then confirm speed grows over the next descending samples
  let crest = 0, crestH = 0;
  path.kind.forEach((k, i) => { if (k === 'lift' && path.height[i] > crestH) { crestH = path.height[i]; crest = i; } });
  const near = path.speed[(crest + 2) % path.N];
  const far = path.speed[(crest + 8) % path.N];
  assert.ok(far > near + 3, `descent off a lift crest accelerates (got ${near.toFixed(1)} -> ${far.toFixed(1)})`);
  assert.ok(path.stats.maxSpeed > 20, 'the drop reaches real speed');
}

{
  // the chain-lift overhaul: a lift to a tall crest supplies the energy to run
  // the whole circuit — no rollback, a big drop, and real speed off the top
  const ctrlPts = makeCtrlPts();
  ctrlPts[2].seg = 'lift';   // segment point 2 → point 3 is the chain lift
  ctrlPts[3].y = 14;         // top of the lift hill
  const path = makePath(ctrlPts);
  assert.equal(path.stats.rollback, false, 'the lift powers the tall circuit');
  assert.ok(path.stats.maxDrop > 10, `expected a tall drop, got ${path.stats.maxDrop}`);
  assert.ok(path.stats.maxSpeed > 20, `expected real speed off the lift, got ${path.stats.maxSpeed}`);
  const baseline = makePath();
  assert.ok(path.stats.excitement > baseline.stats.excitement + 15, 'a tall lift hill is far more exciting');
}

{
  // manual banking: a per-point bank fraction overrides the auto-bank. Point 7
  // normally banks gently (auto max there is well under maxBank), so a full
  // manual +1 lean is clearly the player's doing.
  const auto = makePath(makeCtrlPts());
  assert.ok(Math.max(...auto.bank) < PHYS.maxBank - 0.2, 'the default coaster does not naturally reach full +lean');

  const ctrlPts = makeCtrlPts();
  ctrlPts[7].bank = 1;   // full manual lean on point 7's plain segment
  const banked = makePath(ctrlPts);
  assert.ok(Math.abs(Math.max(...banked.bank) - PHYS.maxBank) < 0.02, 'manual +1 bank reaches the full tilt (maxBank)');
  assert.ok(banked.bank.filter(b => Math.abs(b - PHYS.maxBank) < 0.02).length > 5, 'the whole segment holds the manual lean');

  ctrlPts[7].bank = -0.5;   // a gentle opposite lean
  const gentle = makePath(ctrlPts);
  assert.ok(Math.min(...gentle.bank) < -0.5 * PHYS.maxBank + 0.03, 'negative fractional bank leans the other way to the requested amount');
}

console.log('path tests passed');
