function horiz(THREE, v) {
  const h = new THREE.Vector3(v.x, 0, v.z);
  return h.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : h.normalize();
}

function box(THREE, grp, color, w, h, d, x, y, z, shadow) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  if (shadow) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  grp.add(mesh);
  return mesh;
}

function guest(THREE, grp, x, gndY, z, colorIndex, headColors, guestColors) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.42, 6),
    new THREE.MeshLambertMaterial({ color: guestColors[colorIndex % guestColors.length] }),
  );
  body.position.y = 0.21;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshLambertMaterial({ color: headColors[colorIndex % headColors.length] }),
  );
  head.position.y = 0.5;
  group.add(body, head);
  group.position.set(x, gndY, z);
  group.castShadow = true;
  grp.add(group);
  return group;
}

function buildQueue({
  THREE,
  grp,
  gndY,
  startZ,
  poolSize,
  platLen,
  stationRefs,
  colors,
  headColors,
  guestColors,
}) {
  const laneLen = Math.max(platLen, 6);
  const laneGap = 0.95;
  const spacing = 0.72;
  const gapW = 1.15;
  const slotsPerLane = Math.max(2, Math.floor(laneLen / spacing));
  const nLanes = Math.max(1, Math.ceil(poolSize / slotsPerLane));
  const xL = -laneLen / 2;
  const xR = laneLen / 2;
  const postH = 1.0;
  const railY = gndY + postH * 0.78;
  const postMat = new THREE.MeshLambertMaterial({ color: 0x7a5a28 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xb88030 });
  const railX = (xm, z, len) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 5), railMat);
    mesh.position.set(xm, railY, z);
    mesh.rotation.z = Math.PI / 2;
    grp.add(mesh);
  };
  const railZ = (x, zm, len) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 5), railMat);
    mesh.position.set(x, railY, zm);
    mesh.rotation.x = Math.PI / 2;
    grp.add(mesh);
  };
  const post = (x, z) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, postH, 6), postMat);
    mesh.position.set(x, gndY + postH / 2, z);
    mesh.castShadow = true;
    grp.add(mesh);
  };

  for (let k = 0; k <= nLanes; k++) {
    const z = startZ - laneGap / 2 + k * laneGap;
    if (k === 0) {
      railX(xR - (laneLen - gapW) / 2, z, laneLen - gapW);
    } else if (k === nLanes) {
      railX(0, z, laneLen);
    } else {
      const turnAtRight = (k - 1) % 2 === 0;
      const solid = laneLen - gapW;
      railX(turnAtRight ? xL + solid / 2 : xR - solid / 2, z, solid);
    }
    post(xL, z);
    post(xR, z);
  }

  for (let j = 0; j < nLanes; j++) {
    const zc = startZ + j * laneGap;
    if (j % 2 === 0) railZ(xL, zc, laneGap);
    else railZ(xR, zc, laneGap);
  }

  const backZ = startZ - laneGap / 2 + nLanes * laneGap;
  post(xR, backZ + 0.5);
  box(THREE, grp, colors.roof, 2.0, 0.42, 0.16, xR - 1.0, gndY + postH + 0.25, backZ + 0.02, false);

  for (let i = 0; i < poolSize; i++) {
    const lane = Math.floor(i / slotsPerLane);
    const idx = i % slotsPerLane;
    const z = startZ + lane * laneGap;
    const frac = slotsPerLane > 1 ? idx / (slotsPerLane - 1) : 0.5;
    const x =
      lane % 2 === 0
        ? THREE.MathUtils.lerp(xL + 0.45, xR - 0.45, frac)
        : THREE.MathUtils.lerp(xR - 0.45, xL + 0.45, frac);
    const g = guest(THREE, grp, x, gndY, z, i, headColors, guestColors);
    g.visible = false;
    stationRefs.queueGuests.push(g);
  }
}

export function buildStationAndQueue({
  THREE,
  stationGrp,
  path,
  ctrlPts,
  colors,
  upgrades,
  derived,
  sampleAt,
  stationRefs,
  carLength,
  headColors,
  guestColors,
  worldUp,
  disposeGroup,
}) {
  disposeGroup(stationGrp);
  stationRefs.queueGuests = [];
  if (!path) return;

  const frame = sampleAt(0);
  const d = derived();
  const visCars = Math.min(d.cars, 8);

  const p0 = new THREE.Vector3(ctrlPts[0].x, ctrlPts[0].y, ctrlPts[0].z);
  const p1 = new THREE.Vector3(ctrlPts[1].x, ctrlPts[1].y, ctrlPts[1].z);
  const center = p0.clone().add(p1).multiplyScalar(0.5);
  const tang = horiz(THREE, frame.tan);
  const righ = new THREE.Vector3(frame.right.x, 0, frame.right.z);
  if (righ.lengthSq() < 1e-4) righ.set(1, 0, 0);
  righ.normalize();

  const PLAT_LEN = p0.distanceTo(p1);
  const PLAT_W = 2.8;
  const PLAT_H = 0.5;
  const PLAT_SIDE = PLAT_W / 2 + 0.85;
  stationRefs.platLen = PLAT_LEN;
  const trainLen = (visCars - 1) * carLength;
  stationRefs.stopS = Math.min(PLAT_LEN / 2 + trainLen / 2, path.len * 0.5);

  const grp = new THREE.Group();
  grp.setRotationFromMatrix(new THREE.Matrix4().makeBasis(tang, worldUp, righ));
  grp.position.set(center.x, 0, center.z);
  stationGrp.add(grp);

  box(THREE, grp, colors.platform, PLAT_LEN, PLAT_H, PLAT_W, 0, PLAT_H / 2, PLAT_SIDE, true);

  const postMat = new THREE.MeshLambertMaterial({ color: 0xcdb884 });
  const postH = 2.5;
  const nPosts = Math.max(2, Math.ceil(PLAT_LEN / 2.8));
  const postZs = [PLAT_SIDE - PLAT_W / 2 + 0.22, PLAT_SIDE + PLAT_W / 2 - 0.22];
  for (let p = 0; p <= nPosts; p++) {
    const px = -PLAT_LEN / 2 + p * (PLAT_LEN / nPosts);
    postZs.forEach(pz => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, postH, 6), postMat);
      mesh.position.set(px, PLAT_H + postH / 2, pz);
      mesh.castShadow = true;
      grp.add(mesh);
    });
  }
  box(THREE, grp, colors.roof, PLAT_LEN + 0.6, 0.28, PLAT_W + 0.7, 0, PLAT_H + postH + 0.04, PLAT_SIDE, true);
  box(THREE, grp, 0xf5a623, 2.0, 0.6, 0.16, -PLAT_LEN / 2 + 1.0, PLAT_H + postH - 0.15, PLAT_SIDE - PLAT_W / 2 - 0.1, false);

  if (upgrades.snacks.level > 0) {
    const kx = PLAT_LEN / 2 + 0.6;
    box(THREE, grp, 0xe85d75, 1.2, 1.0, 1.2, kx, 0.5, PLAT_SIDE + PLAT_W / 2 + 1.6, true);
    box(THREE, grp, colors.cloud, 1.5, 0.18, 1.5, kx, 1.15, PLAT_SIDE + PLAT_W / 2 + 1.6, true);
  }

  const qStart = PLAT_SIDE + PLAT_W / 2 + 0.55;
  const poolSize = Math.min(60, d.queueCap);
  buildQueue({
    THREE,
    grp,
    gndY: PLAT_H,
    startZ: qStart,
    poolSize,
    platLen: PLAT_LEN,
    stationRefs,
    colors,
    headColors,
    guestColors,
  });
}

export function updateQueueVisuals({ queue, stationRefs }) {
  const n = Math.round(queue);
  const pool = stationRefs.queueGuests;
  for (let i = 0; i < pool.length; i++) pool[i].visible = i < n;
}
