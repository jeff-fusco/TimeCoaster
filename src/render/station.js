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

function crowdCluster(THREE, grp, x, gndY, z, colorIndex, headColors, guestColors) {
  const group = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + colorIndex * 0.7;
    const r = i === 0 ? 0 : 0.22;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.34, 6),
      new THREE.MeshLambertMaterial({ color: guestColors[(colorIndex + i) % guestColors.length] }),
    );
    body.position.set(Math.cos(a) * r, 0.17, Math.sin(a) * r);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshLambertMaterial({ color: headColors[(colorIndex + i) % headColors.length] }),
    );
    head.position.set(body.position.x, 0.42, body.position.z);
    group.add(body, head);
  }
  group.position.set(x, gndY, z);
  group.castShadow = true;
  grp.add(group);
  return group;
}

// cream text on a coloured board (entrance sign)
function makeBoardTexture(THREE, text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 72);
  g.strokeStyle = '#1c2533';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 64);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = '900 34px Fredoka, Arial, sans-serif';
  g.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Southward switchback queue on its own plaza pier: guests enter under the
// arch at the far end and snake lane by lane toward the boarding gate beside
// the platform. Guest slot 0 is at the gate, so the visible line grows
// backward from the station as sim.queue rises.
function buildQueue({
  THREE,
  grp,
  startZ,
  queueCap,
  poolSize,
  platLen,
  platTop,
  stationRefs,
  colors,
  headColors,
  guestColors,
}) {
  const laneLen = Math.max(platLen, 8);
  const laneGap = 1.15;
  const spacing = 0.75;
  const gapW = 1.3;
  const slotsPerLane = Math.max(3, Math.floor(laneLen / spacing));
  const nLanes = Math.max(2, Math.ceil(queueCap / slotsPerLane));
  const depth = nLanes * laneGap;
  const xL = -laneLen / 2;
  const xR = laneLen / 2;
  const plazaTop = 0.06;

  // ── plaza pier: a packed-earth slab jutting south off the starter island ──
  const plazaW = laneLen + 2.6;
  const plazaZ0 = startZ - 1.5;                 // tucks under the starter slab edge
  const plazaZ1 = startZ + depth + 2.1;         // room for the entrance arch
  const plazaDepth = 1.45;
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(plazaW, plazaDepth, plazaZ1 - plazaZ0),
    [
      new THREE.MeshLambertMaterial({ color: colors.dirt }),
      new THREE.MeshLambertMaterial({ color: colors.dirt }),
      new THREE.MeshLambertMaterial({ color: colors.sand || colors.platform }),
      new THREE.MeshLambertMaterial({ color: colors.dirtDark || 0x6b4a2a }),
      new THREE.MeshLambertMaterial({ color: colors.dirt }),
      new THREE.MeshLambertMaterial({ color: colors.dirt }),
    ],
  );
  plaza.position.set(0, plazaTop - plazaDepth / 2, (plazaZ0 + plazaZ1) / 2);
  plaza.receiveShadow = true;
  plaza.castShadow = true;
  grp.add(plaza);

  // alternating lane strips so the switchback path reads at a glance
  const stripMats = [
    new THREE.MeshLambertMaterial({ color: 0xe8dcb0 }),
    new THREE.MeshLambertMaterial({ color: 0xcbb98a }),
  ];
  const stripGeo = new THREE.BoxGeometry(laneLen + 0.7, 0.05, laneGap - 0.12);
  for (let k = 0; k < nLanes; k++) {
    const strip = new THREE.Mesh(stripGeo, stripMats[k % 2]);
    strip.position.set(0, plazaTop + 0.028, startZ + (k + 0.5) * laneGap);
    strip.receiveShadow = true;
    grp.add(strip);
  }

  // ── cream-and-wood fencing: posts with caps + double rails ──
  const postH = 1.0;
  const postMat = new THREE.MeshLambertMaterial({ color: colors.trunk });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xfbf3e2 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xfbf3e2 });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.085, postH, 6);
  const capGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const post = (x, z) => {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(x, plazaTop + postH / 2, z);
    p.castShadow = true;
    grp.add(p);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, plazaTop + postH + 0.04, z);
    grp.add(cap);
  };
  const railHeights = [0.72, 0.4];
  const railX = (xm, z, len) => {
    for (const h of railHeights) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 5), railMat);
      r.position.set(xm, plazaTop + h, z);
      r.rotation.z = Math.PI / 2;
      grp.add(r);
    }
  };
  const railZ = (x, zm, len) => {
    for (const h of railHeights) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 5), railMat);
      r.position.set(x, plazaTop + h, zm);
      r.rotation.x = Math.PI / 2;
      grp.add(r);
    }
  };

  // lane boundaries run along x; each has a walk-through gap at alternating
  // ends so the path serpentines. Guests walk lane k toward its "exit" end.
  const entranceAtRight = (nLanes - 1) % 2 === 0;
  for (let k = 0; k <= nLanes; k++) {
    const z = startZ + k * laneGap;
    let gapSide = 0; // -1 gap at xL, +1 gap at xR, 0 solid
    if (k === 0) gapSide = +1;                               // boarding gate
    else if (k === nLanes) gapSide = entranceAtRight ? 1 : -1; // entrance
    else gapSide = k % 2 === 1 ? -1 : 1;                     // U-turns
    const solid = laneLen - gapW;
    railX(gapSide > 0 ? xL + solid / 2 : xR - solid / 2, z, solid);
    post(xL, z);
    post(xR, z);
    post(gapSide > 0 ? xR - gapW : xL + gapW, z);
  }
  // side closures — guests never slip out the ends of a lane
  railZ(xL, startZ + depth / 2, depth);
  railZ(xR, startZ + depth / 2, depth);

  // ── boarding gate steps up to the platform deck ──
  const gateX = xR - gapW / 2;
  box(THREE, grp, 0xcdb884, gapW - 0.2, 0.24, 0.7, gateX, plazaTop + 0.12, startZ - 0.42, true);
  box(THREE, grp, 0xd8c79a, gapW - 0.2, 0.24, 0.5, gateX, plazaTop + 0.34, startZ - 0.68, true);

  // ── entrance arch + pennant banners at the far end ──
  const archX = entranceAtRight ? xR - gapW / 2 : xL + gapW / 2;
  const archZ = startZ + depth + 0.55;
  const archH = 2.3;
  for (const dx of [-0.95, 0.95]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, archH, 6), postMat);
    p.position.set(archX + dx, plazaTop + archH / 2, archZ);
    p.castShadow = true;
    grp.add(p);
  }
  const boardTex = makeBoardTexture(THREE, 'ENTRANCE', '#e8533f', '#fbf3e2');
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.62, 0.12),
    [
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ map: boardTex }),
      new THREE.MeshLambertMaterial({ map: boardTex }),
    ],
  );
  board.position.set(archX, plazaTop + archH - 0.1, archZ);
  board.castShadow = true;
  grp.add(board);

  // pennant string across the back of the plaza
  const flagCols = [...guestColors, colors.roof];
  const flagY = plazaTop + 2.0;
  const flagSpan = laneLen * 0.9;
  const nFlags = 7;
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.16, 0, 0, 0.16, 0, 0, 0, -0.34, 0,
  ], 3));
  flagGeo.computeVertexNormals();
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-flagSpan / 2, flagY + 0.02, archZ),
    new THREE.Vector3(flagSpan / 2, flagY + 0.02, archZ),
  ]);
  grp.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xfbf3e2 })));
  for (let f = 0; f < nFlags; f++) {
    const flag = new THREE.Mesh(
      flagGeo,
      new THREE.MeshLambertMaterial({ color: flagCols[f % flagCols.length], side: THREE.DoubleSide }),
    );
    flag.position.set(-flagSpan / 2 + (f + 0.5) * (flagSpan / nFlags), flagY, archZ);
    grp.add(flag);
  }

  // ── guest pool: slot 0 at the boarding gate, snaking back to the entrance ──
  stationRefs.queueSlots = [];
  const individualSlots = Math.min(poolSize, 120);
  const clusterSize = 4;
  for (let i = 0; i < poolSize; i++) {
    const lane = Math.floor(i / slotsPerLane);
    if (lane >= nLanes) break;
    const idx = i % slotsPerLane;
    const frac = slotsPerLane > 1 ? idx / (slotsPerLane - 1) : 0.5;
    const from = lane % 2 === 0 ? xR - 0.55 : xL + 0.55;
    const to = lane % 2 === 0 ? xL + 0.55 : xR - 0.55;
    const x = THREE.MathUtils.lerp(from, to, frac);
    const z = startZ + (lane + 0.5) * laneGap;
    const g = i < individualSlots
      ? guest(THREE, grp, x, plazaTop, z, i, headColors, guestColors)
      : crowdCluster(THREE, grp, x, plazaTop, z, i, headColors, guestColors);
    g.visible = false;
    stationRefs.queueGuests.push(g);
    stationRefs.queueSlots.push({ guestStart: i < individualSlots ? i : individualSlots + (i - individualSlots) * clusterSize });
  }
  return {
    depth,
    laneLen,
    nLanes,
    slotsPerLane,
    poolSize,
    visualCapacity: poolSize <= individualSlots ? poolSize : individualSlots + (poolSize - individualSlots) * clusterSize,
    bounds: {
      cx: 0,
      cz: (plazaZ0 + plazaZ1) / 2,
      halfX: plazaW / 2,
      halfZ: (plazaZ1 - plazaZ0) / 2,
    },
  };
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
  // canvas board textures are not freed by material.dispose(); do it explicitly
  stationGrp.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (m.map?.isTexture) m.map.dispose();
  });
  disposeGroup(stationGrp);
  stationRefs.queueGuests = [];
  stationRefs.queueSlots = [];
  stationRefs.decorBlockers = [];
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

  const qStart = PLAT_SIDE + PLAT_W / 2 + 0.55;
  const queueCap = Math.max(0, d.queueCap);
  const poolSize = queueCap <= 120 ? queueCap : 120 + Math.ceil((queueCap - 120) / 4);
  const queueInfo = buildQueue({
    THREE,
    grp,
    startZ: qStart,
    queueCap,
    poolSize,
    platLen: PLAT_LEN,
    platTop: PLAT_H,
    stationRefs,
    colors,
    headColors,
    guestColors,
  });
  stationRefs.queueCapacity = queueCap;
  stationRefs.queueVisualCapacity = queueInfo.visualCapacity;
  stationRefs.queueLanes = queueInfo.nLanes;
  stationRefs.queueDepth = queueInfo.depth;
  stationRefs.decorBlockers = [
    {
      type: 'oriented-box',
      label: 'station',
      cx: 0,
      cz: PLAT_SIDE,
      halfX: PLAT_LEN / 2 + 0.6,
      halfZ: PLAT_W / 2 + 0.8,
      margin: 0.45,
      basisX: { x: tang.x, z: tang.z },
      basisZ: { x: righ.x, z: righ.z },
      origin: { x: center.x, z: center.z },
    },
    {
      type: 'oriented-box',
      label: 'queue',
      ...queueInfo.bounds,
      margin: 0.35,
      basisX: { x: tang.x, z: tang.z },
      basisZ: { x: righ.x, z: righ.z },
      origin: { x: center.x, z: center.z },
    },
  ];

  // snack kiosk serves the line from the edge of the queue plaza
  if (upgrades.snacks.level > 0) {
    const kx = Math.max(PLAT_LEN, 8) / 2 + 0.55;
    const kz = qStart + 1.7;
    box(THREE, grp, 0xe85d75, 1.2, 1.0, 1.2, kx, 0.56, kz, true);
    box(THREE, grp, colors.cloud, 1.5, 0.18, 1.5, kx, 1.2, kz, true);
  }
}

export function updateQueueVisuals({ queue, stationRefs }) {
  const n = Math.round(queue);
  const pool = stationRefs.queueGuests;
  const slots = stationRefs.queueSlots || [];
  for (let i = 0; i < pool.length; i++) pool[i].visible = (slots[i]?.guestStart ?? i) < n;
}
