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
  const ctrlPts = makeCtrlPts();
  ctrlPts[3].y = 12;
  const path = makePath(ctrlPts);
  assert.equal(path.stats.rollback, true, 'a hill beyond available energy can roll the train backward');
  assert.ok(path.speed.some(speed => speed < 0));
}

{
  const ctrlPts = makeCtrlPts();
  ctrlPts[2].seg = 'lift';
  ctrlPts[3].y = 12;
  const path = makePath(ctrlPts);
  const liftSpeeds = path.speed.filter((speed, i) => path.kind[i] === 'lift');
  assert.ok(liftSpeeds.length > 0);
  assert.ok(liftSpeeds.every(speed => speed >= PHYS.liftSpeed), 'chain lift keeps the incline moving forward');
}

console.log('path tests passed');
