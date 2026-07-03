export const CAR_LEN = 1.7;

import { guestBuyerRoll } from '../systems/economy.js?v=20260703-12';
import { addBalloon, addHat } from './guestAccessories.js?v=20260703-12';

function buildCar({ THREE, colors, headColors, guestColors = [], seedBase = 0, hatFrac = 0, balloonFrac = 0 }) {
  const car = new THREE.Group();
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.55, 1.5),
    new THREE.MeshStandardMaterial({ color: colors.car, roughness: 0.5 }),
  );
  chassis.position.y = 0.45;
  chassis.castShadow = true;
  car.add(chassis);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.16, 1.56),
    new THREE.MeshStandardMaterial({ color: colors.carTrim, roughness: 0.5 }),
  );
  trim.position.y = 0.2;
  car.add(trim);

  const heads = [];
  const accColors = guestColors.length ? guestColors : headColors;
  [
    [-0.28, 0.42],
    [0.28, 0.42],
    [-0.28, -0.18],
    [0.28, -0.18],
  ].forEach((sp, i) => {
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshLambertMaterial({ color: headColors[(i * 2) % headColors.length] }),
    );
    head.position.set(sp[0], 0.82, sp[1]);
    head.castShadow = true;
    // riders who bought from the vendor carts keep their merch on the ride
    // (balloons a bit rarer up here — some get tied to the queue fence)
    const seed = seedBase + i;
    if (guestBuyerRoll(seed) < hatFrac) addHat(THREE, head, accColors[(seed + 2) % accColors.length]);
    else if (guestBuyerRoll(seed + 7919) < balloonFrac * 0.6) addBalloon(THREE, head, accColors[(seed + 4) % accColors.length]);
    car.add(head);
    heads.push(head);
  });
  car.userData.heads = heads;
  car.userData.body = chassis; // glowed when the train is ready to dispatch
  return car;
}

// Highlight (or clear) a train's cars when it is full and awaiting dispatch.
export function setTrainGlow(train, on, intensity = 0.6) {
  for (const car of train.cars) {
    const mat = car.userData.body?.material;
    if (!mat) continue;
    mat.emissive.setHex(on ? 0xf5a623 : 0x000000);
    mat.emissiveIntensity = on ? intensity : 0;
  }
}

export function setTrainOccupancy(train, n) {
  let shown = 0;
  for (const car of train.cars) {
    for (const head of car.userData.heads) {
      head.visible = shown < n;
      shown++;
    }
  }
}

export function rebuildTrains({
  THREE,
  trainLayer,
  trains,
  derived,
  path,
  colors,
  headColors,
  guestColors = [],
  carLength = CAR_LEN,
}) {
  const { cars: carCount, trains: trainCount, hatFrac = 0, balloonFrac = 0 } = derived();
  const L = path ? path.len : 1;
  const oldTrains = trains.map(train => ({
    ...train,
    frac: train.s / (train.L || L),
  }));
  while (trainLayer.children.length) {
    const child = trainLayer.children[0];
    child.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (m) (Array.isArray(m) ? m.forEach(x => x.dispose()) : m.dispose());
    });
    trainLayer.remove(child);
  }

  const nextTrains = [];
  const visCars = Math.min(carCount, 16);
  for (let n = 0; n < trainCount; n++) {
    const group = new THREE.Group();
    const cars = [];
    for (let c = 0; c < visCars; c++) {
      const mesh = buildCar({
        THREE, colors, headColors, guestColors,
        seedBase: 40000 + (n * 16 + c) * 4,
        hatFrac, balloonFrac,
      });
      group.add(mesh);
      cars.push(mesh);
    }
    trainLayer.add(group);
    const old = oldTrains[n];
    const frac = old ? old.frac : n / trainCount;
    const train = {
      group,
      s: frac * L,
      prevS: frac * L,
      L,
      cars,
      mode: old?.mode || 'run',
      phase: old?.phase || '',
      timer: old?.timer || 0,
      boarded: old?.boarded || 0,
      startBoard: old?.startBoard || 0,
      cycleBoard: old?.cycleBoard || 0,
    };
    setTrainOccupancy(train, Math.round(train.boarded));
    nextTrains.push(train);
  }
  return nextTrains;
}

export function placeCar({ THREE, mesh, s, sampleAt }) {
  const frame = sampleAt(s);
  mesh.position.copy(frame.pos).addScaledVector(frame.up, 0.12);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tan));
}
