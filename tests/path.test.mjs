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
  assert.equal(stationLength(upgrades), 21.1);
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
  assert.equal(path.N, ctrlPts.length * PATH_SAMPLES.segment);
  assert.equal(path.kind[0], 'station');
  assert.equal(path.stats.inversions, 0);
  assert.equal(path.stats.length, 59);
  assert.ok(path.stats.lapTime > 10);
  assert.ok(path.stats.maxSpeed >= PHYS.vMin);

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
  assert.ok(Math.abs(path.speed[brakeIndex] - PHYS.brakeSpeed * Math.pow(1.08, 2)) < 1e-9);
}

{
  const normal = makePath();
  const launch = makePath(makeCtrlPts(), makeUpgrades(), { launch: true });
  assert.ok(launch.stats.maxSpeed > normal.stats.maxSpeed);
  assert.ok(speedAtPath(launch, launch.len / 2) > speedAtPath(normal, normal.len / 2));
}

console.log('path tests passed');
