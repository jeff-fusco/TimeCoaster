export const CAR_LEN = 1.7;

function buildCar({ THREE, colors, headColors }) {
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
    car.add(head);
    heads.push(head);
  });
  car.userData.heads = heads;
  return car;
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
  carLength = CAR_LEN,
}) {
  const { cars: carCount, trains: trainCount } = derived();
  const L = path ? path.len : 1;
  const oldS = trains.map(train => train.s / (train.L || L));
  while (trainLayer.children.length) trainLayer.remove(trainLayer.children[0]);

  const nextTrains = [];
  const visCars = Math.min(carCount, 8);
  for (let n = 0; n < trainCount; n++) {
    const group = new THREE.Group();
    const cars = [];
    for (let c = 0; c < visCars; c++) {
      const mesh = buildCar({ THREE, colors, headColors });
      group.add(mesh);
      cars.push(mesh);
    }
    trainLayer.add(group);
    const frac = oldS[n] !== undefined ? oldS[n] : n / trainCount;
    const train = {
      group,
      s: frac * L,
      prevS: frac * L,
      L,
      cars,
      mode: 'run',
      phase: '',
      timer: 0,
      boarded: 0,
      startBoard: 0,
      cycleBoard: 0,
    };
    setTrainOccupancy(train, 0);
    nextTrains.push(train);
  }
  return nextTrains;
}

export function placeCar({ THREE, mesh, s, sampleAt }) {
  const frame = sampleAt(s);
  mesh.position.copy(frame.pos).addScaledVector(frame.up, 0.12);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tan));
}
