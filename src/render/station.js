import { guestBuyerRoll } from '../systems/economy.js?v=20260703-13';
import { BALLOON_SIZE, HAT_SIZE, addBalloon, addHat } from './guestAccessories.js?v=20260703-13';

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

function guest(THREE, grp, x, gndY, z, colorIndex, headColors, guestColors, opts = {}) {
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
  // simple toy eyes on the front (-z) of the head so the crowd has faces
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x24303f });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5), eyeMat);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5), eyeMat);
  eyeL.position.set(-0.05, 0.02, -0.108);
  eyeR.position.set(0.05, 0.02, -0.108);
  head.add(eyeL, eyeR);
  if (opts.hat) addHat(THREE, head, opts.hat);
  if (opts.balloon) addBalloon(THREE, head, opts.balloon);
  group.add(body, head);
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

// The coaster's name marquee over the entrance arch. Tiers up with Park Hype:
// 0 = plain painted board, 1 = colored sign, 2 = gold marquee with bulbs.
function makeNameSign(THREE, name, tier = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 88;
  const g = canvas.getContext('2d');
  const styles = [
    { bg: '#fbf3e2', fg: '#1c2533', border: '#1c2533', bulbs: false },
    { bg: '#e8533f', fg: '#fff7e6', border: '#1c2533', bulbs: false },
    { bg: '#f5a623', fg: '#3a2410', border: '#7a4a0a', bulbs: true },
  ];
  const s = styles[Math.max(0, Math.min(2, tier))];
  g.fillStyle = s.bg; g.fillRect(0, 0, 320, 88);
  g.strokeStyle = s.border; g.lineWidth = 9; g.strokeRect(5, 5, 310, 78);
  if (s.bulbs) {   // marquee bulbs around the frame
    g.fillStyle = '#fff7d0';
    for (let x = 18; x <= 302; x += 26) {
      g.beginPath(); g.arc(x, 14, 4, 0, 7); g.fill();
      g.beginPath(); g.arc(x, 74, 4, 0, 7); g.fill();
    }
  }
  g.fillStyle = s.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 46; g.font = `900 ${fs}px Fredoka, Arial, sans-serif`;
  while (g.measureText(name).width > 282 && fs > 15) { fs -= 2; g.font = `900 ${fs}px Fredoka, Arial, sans-serif`; }
  g.fillText(name || 'Coaster', 160, 48);
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
  canopyLevel = 0,
  snacksLevel = 0,
  comfortLevel = 0,
  foodCourtLevel = 0,
  hatFrac = 0,
  balloonFrac = 0,
  stationRefs,
  colors,
  headColors,
  guestColors,
  coasterName = 'Coaster',
  hypeLevel = 0,
}) {
  const laneLen = Math.max(platLen, 8);
  const laneGap = 1.15;
  const spacing = 0.55;   // shoulder-to-shoulder — a busy line should look packed
  const gapW = 1.3;
  const slotsPerLane = Math.max(3, Math.floor(laneLen / spacing));
  // Lanes hold the *mesh pool* (clusters stand in for 4 guests each), not the
  // raw capacity — otherwise a late-game 1000-cap pier is mostly empty ground.
  const nLanes = Math.max(2, Math.ceil(Math.max(poolSize, 1) / slotsPerLane));
  const depth = nLanes * laneGap;
  const xL = -laneLen / 2;
  const xR = laneLen / 2;
  const plazaTop = 0.06;

  // ── plaza pier: a packed-earth slab jutting south off the starter island.
  //    Past the entrance arch it widens into the FORECOURT — the milling ground
  //    where the plaza crowd shops, gathers at the fountain, and sizes up the
  //    line before committing to it. ──
  const FORE_DEPTH = 5.2;
  const plazaW = laneLen + 2.6;
  const plazaZ0 = startZ - 1.5;                 // tucks under the starter slab edge
  const plazaZ1 = startZ + depth + 2.1 + FORE_DEPTH;
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
  // The boarding gate sits at xL — trains travel toward -x through the station,
  // so the front (loading) berth is at that end; the exit serves the rear berth.
  const entranceAtRight = (nLanes - 1) % 2 === 0;
  for (let k = 0; k <= nLanes; k++) {
    const z = startZ + k * laneGap;
    let gapSide = 0; // -1 gap at xL, +1 gap at xR, 0 solid
    if (k === 0) gapSide = -1;                               // boarding gate
    else if (k === nLanes) gapSide = entranceAtRight ? 1 : -1; // entrance
    else gapSide = k % 2 === 1 ? 1 : -1;                     // U-turns
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
  const gateX = xL + gapW / 2;
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
  // the coaster's name marquee crowns the entrance arch, facing the queue;
  // its style tiers up with Park Hype
  const signTier = hypeLevel >= 8 ? 2 : hypeLevel >= 3 ? 1 : 0;
  const boardTex = makeNameSign(THREE, coasterName, signTier);
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x1c2533 });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.8, 0.12),
    [edgeMat, edgeMat, edgeMat, edgeMat,
      new THREE.MeshLambertMaterial({ map: boardTex }),
      new THREE.MeshLambertMaterial({ map: boardTex })],
  );
  board.position.set(archX, plazaTop + archH + 0.05, archZ);
  board.castShadow = true;
  grp.add(board);

  // shade parasols over the lanes — one per Shade Canopies level
  if (canopyLevel > 0) {
    const parasolPoleMat = new THREE.MeshLambertMaterial({ color: 0xfbf3e2 });
    const n = Math.min(canopyLevel, 12);
    for (let i = 0; i < n; i++) {
      const px = xL + 1.4 + ((i * 2.31 + 0.7) % Math.max(laneLen - 2.8, 1));
      const pz = startZ + 0.35 + ((i * 1.63) % Math.max(depth - 0.7, 0.7));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 5), parasolPoleMat);
      pole.position.set(px, plazaTop + 0.85, pz);
      grp.add(pole);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(0.62, 0.34, 8),
        new THREE.MeshLambertMaterial({ color: guestColors[i % guestColors.length] }),
      );
      top.position.set(px, plazaTop + 1.75, pz);
      top.castShadow = true;
      grp.add(top);
    }
  }

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

  // ── vendor carts (hats/balloons) trade along the back of the plaza ──
  const cartZ = plazaZ1 - 0.85;
  if (hatFrac > 0) {
    const cx = -laneLen * 0.28;
    box(THREE, grp, colors.trunk, 1.0, 0.75, 0.7, cx, plazaTop + 0.4, cartZ, true);
    box(THREE, grp, 0xfbf3e2, 1.2, 0.14, 0.85, cx, plazaTop + 0.85, cartZ, true);
    for (let i = 0; i < 3; i++) {
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.2, 7),
        new THREE.MeshLambertMaterial({ color: guestColors[i % guestColors.length] }),
      );
      hat.position.set(cx - 0.3 + i * 0.3, plazaTop + 1.02, cartZ);
      hat.castShadow = true;
      grp.add(hat);
    }
  }
  if (balloonFrac > 0) {
    const cx = laneLen * 0.28;
    box(THREE, grp, colors.trunk, 0.9, 0.75, 0.7, cx, plazaTop + 0.4, cartZ, true);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const bx = cx + Math.cos(a) * 0.24;
      const bz = cartZ + Math.sin(a) * 0.2;
      const by = plazaTop + 1.55 + (i % 2) * 0.22;
      const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 8, 6),
        new THREE.MeshLambertMaterial({ color: guestColors[i % guestColors.length] }),
      );
      balloon.position.set(bx, by, bz);
      balloon.castShadow = true;
      grp.add(balloon);
      const string = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, by - plazaTop - 0.8, 3),
        new THREE.MeshLambertMaterial({ color: 0xf5f0d7 }),
      );
      string.position.set(bx, plazaTop + 0.8 + (by - plazaTop - 0.8) / 2, bz);
      grp.add(string);
    }
  }

  // ── forecourt furniture: a fountain to gather at, benches to rest on ──
  const foreZ0 = archZ + 1.0;
  const foreZ1 = plazaZ1 - 0.55;
  const foreMidZ = (foreZ0 + foreZ1) / 2;
  {
    // tiered fountain: stone basin, water disc, center spire with a cap
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xd8cba8 });
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x7ec8e3 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.34, 12), stoneMat);
    basin.position.set(0, plazaTop + 0.17, foreMidZ);
    basin.castShadow = true;
    grp.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.08, 12), waterMat);
    water.position.set(0, plazaTop + 0.36, foreMidZ);
    grp.add(water);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.62, 8), stoneMat);
    spire.position.set(0, plazaTop + 0.65, foreMidZ);
    spire.castShadow = true;
    grp.add(spire);
    const jet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), waterMat);
    jet.position.set(0, plazaTop + 1.02, foreMidZ);
    grp.add(jet);
  }
  // ── upgrade-scaled forecourt furniture. The plaza GROWS with investment:
  //    Queue Comfort adds benches, Snack Stands add a second kiosk at Lv6,
  //    the Food Court builds a pavilion whose seating spreads with its level,
  //    and high Shade Canopies spill parasols into the forecourt.
  //    Everything solid registers a keep-out circle so guests walk AROUND it.
  const pois = [{ x: 0, z: foreMidZ, r0: 1.25, r: 1.9, kind: 'fountain', w: 3 }];
  const obstacles = [{ x: 0, z: foreMidZ, r: 1.2 }];   // fountain basin

  const benchMat = new THREE.MeshLambertMaterial({ color: colors.trunk });
  const benchTopMat = new THREE.MeshLambertMaterial({ color: 0xfbf3e2 });
  const benchAt = (bx, bz) => {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.4), benchTopMat);
    seat.position.set(bx, plazaTop + 0.34, bz);
    seat.castShadow = true;
    grp.add(seat);
    for (const dx of [-0.42, 0.42]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.34), benchMat);
      leg.position.set(bx + dx, plazaTop + 0.15, bz);
      grp.add(leg);
    }
    pois.push({ x: bx, z: bz, r0: 0.45, r: 0.95, kind: 'bench', w: 1 });
    obstacles.push({ x: bx, z: bz, r: 0.5 });
  };
  // 2 benches to start; Queue Comfort adds one per 3 levels (a comfy park
  // gives its guests somewhere to sit)
  const benchSlots = [
    [-0.46, foreZ0 + 0.45], [0.46, foreZ0 + 0.45],
    [-0.15, foreZ0 + 0.45], [0.15, foreZ0 + 0.45],
    [-0.1, foreZ1 - 0.4], [0.1, foreZ1 - 0.4],
  ];
  const nBenches = Math.min(benchSlots.length, 2 + Math.floor(comfortLevel / 3));
  for (let k = 0; k < nBenches; k++) benchAt(benchSlots[k][0] * laneLen, benchSlots[k][1]);

  // snack kiosk anchors the forecourt's left side once Snack Stands are bought;
  // a second kiosk opens across the back at Lv6
  const kioskAt = (kx, kz) => {
    box(THREE, grp, 0xe85d75, 1.2, 1.0, 1.2, kx, 0.56, kz, true);
    box(THREE, grp, colors.cloud, 1.5, 0.18, 1.5, kx, 1.2, kz, true);
    pois.push({ x: kx, z: kz + 0.95, r0: 0.55, r: 1.3, kind: 'snack', w: 3 });
    obstacles.push({ x: kx, z: kz, r: 0.95 });
  };
  if (snacksLevel > 0) kioskAt(-laneLen * 0.33, foreZ0 + 1.5);
  if (snacksLevel >= 6) kioskAt(-laneLen * 0.3, cartZ - 1.9);

  // Food Court: a roofed pavilion with picnic tables — seating spreads as the
  // level grows. This is the destination build's centrepiece, so it SHOWS.
  if (foodCourtLevel > 0) {
    const fx = laneLen * 0.3;
    const fz = foreZ0 + 1.6;
    const postMatFc = new THREE.MeshLambertMaterial({ color: colors.trunk });
    for (const [dx, dz] of [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 6), postMatFc);
      p.position.set(fx + dx, plazaTop + 0.8, fz + dz);
      p.castShadow = true;
      grp.add(p);
    }
    box(THREE, grp, 0xf0a35e, 2.7, 0.16, 1.9, fx, plazaTop + 1.68, fz, true);   // awning
    box(THREE, grp, 0xfbf3e2, 2.2, 0.5, 0.6, fx, plazaTop + 0.45, fz - 0.4, true); // counter
    obstacles.push({ x: fx, z: fz, r: 1.35 });
    const nTables = Math.min(5, 1 + Math.floor(foodCourtLevel / 3));
    const tableSpots = [[-0.9, 1.6], [0.9, 1.6], [0, 2.4], [-1.6, 2.5], [1.6, 2.5]];
    const tableTopMat = new THREE.MeshLambertMaterial({ color: 0xfbf3e2 });
    for (let t = 0; t < nTables; t++) {
      const tx = fx + tableSpots[t][0];
      const tz = fz + tableSpots[t][1];
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 6), postMatFc);
      leg.position.set(tx, plazaTop + 0.21, tz);
      grp.add(leg);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 10), tableTopMat);
      top.position.set(tx, plazaTop + 0.45, tz);
      top.castShadow = true;
      grp.add(top);
      obstacles.push({ x: tx, z: tz, r: 0.55 });
    }
    // the busier the food court, the bigger a draw it is
    pois.push({ x: fx, z: fz + 1.7, r0: 0.65, r: 1.7, kind: 'foodcourt', w: 2 + Math.min(3, Math.floor(foodCourtLevel / 4)) });
  }

  // vendor carts register their keep-outs (built above, along the back edge)
  if (hatFrac > 0) {
    pois.push({ x: -laneLen * 0.28, z: cartZ - 0.75, r0: 0.35, r: 1.1, kind: 'hat', w: 2 });
    obstacles.push({ x: -laneLen * 0.28, z: cartZ, r: 0.85 });
  }
  if (balloonFrac > 0) {
    pois.push({ x: laneLen * 0.28, z: cartZ - 0.75, r0: 0.35, r: 1.0, kind: 'balloon', w: 2 });
    obstacles.push({ x: laneLen * 0.28, z: cartZ, r: 0.8 });
  }

  // deep Shade Canopies investment spills parasols into the forecourt
  if (canopyLevel > 6) {
    const nP = Math.min(6, canopyLevel - 6);
    const parasolPoleMat = new THREE.MeshLambertMaterial({ color: 0xfbf3e2 });
    for (let k = 0; k < nP; k++) {
      const px = ((k / Math.max(1, nP - 1)) - 0.5) * laneLen * 0.72;
      const pz = cartZ - 1.15;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 5), parasolPoleMat);
      pole.position.set(px, plazaTop + 0.85, pz);
      grp.add(pole);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(0.62, 0.34, 8),
        new THREE.MeshLambertMaterial({ color: guestColors[(k + 3) % guestColors.length] }),
      );
      top.position.set(px, plazaTop + 1.75, pz);
      top.castShadow = true;
      grp.add(top);
    }
  }

  // the arch approach — where deciding guests linger (also the ③ vignette mark)
  pois.push({ x: archX, z: archZ + 1.1, r0: 0.3, r: 1.0, kind: 'arch', w: 1 });

  // ── guest slots: slot 0 at the boarding gate, snaking back to the entrance.
  //    Every guest is an individual — the crowd renders as a handful of
  //    InstancedMeshes (see buildCrowd), so 700 guests cost ~5 draw calls.
  stationRefs.queueSlotCoords = [];
  stationRefs.queuePlazaTop = plazaTop;
  stationRefs.queueShuffleCap = Math.min(26, slotsPerLane);
  for (let i = 0; i < poolSize; i++) {
    const lane = Math.floor(i / slotsPerLane);
    if (lane >= nLanes) break;
    const idx = i % slotsPerLane;
    const frac = slotsPerLane > 1 ? idx / (slotsPerLane - 1) : 0.5;
    const from = lane % 2 === 0 ? xL + 0.55 : xR - 0.55;
    const to = lane % 2 === 0 ? xR - 0.55 : xL + 0.55;
    const x = THREE.MathUtils.lerp(from, to, frac);
    const z = startZ + (lane + 0.5) * laneGap;
    stationRefs.queueSlotCoords.push({ x, z });
  }
  stationRefs.crowd = buildCrowd({
    THREE,
    grp,
    coords: stationRefs.queueSlotCoords,
    plazaTop,
    headColors,
    guestColors,
    hatFrac,
    balloonFrac,
  });
  // the forecourt crowd + the POIs coin pops and vignettes anchor to
  stationRefs.plazaPOIs = pois;
  stationRefs.plazaObstacles = obstacles;
  stationRefs.plazaBounds = { x0: xL + 0.6, x1: xR - 0.6, z0: foreZ0, z1: foreZ1 };
  stationRefs.plazaCrowd = buildPlazaCrowd({
    THREE,
    grp,
    plazaTop,
    bounds: stationRefs.plazaBounds,
    pois,
    obstacles,
    headColors,
    guestColors,
    hatFrac,
    balloonFrac,
  });
  return {
    depth,
    laneLen,
    nLanes,
    slotsPerLane,
    poolSize: stationRefs.queueSlotCoords.length,
    gateX: xR - gapW / 2,
    xL,
    xR,
    gapW,
    visualCapacity: stationRefs.queueSlotCoords.length,
    archX,
    archZ,
    foreZ0,
    foreZ1,
    bounds: {
      cx: 0,
      cz: (plazaZ0 + plazaZ1) / 2,
      halfX: plazaW / 2,
      halfZ: (plazaZ1 - plazaZ0) / 2,
    },
  };
}

// The queue crowd as instanced geometry. The vendored three r128 ignores
// per-instance colors on Lambert materials (fixed upstream in r129), so the
// crowd is split into one InstancedMesh per palette colour instead — guest i
// belongs to body/head group i % nColors, a fixed stride the updater exploits.
// Still ~25 draw calls for a 700-guest line (vs ~720 meshes before).
function buildCrowd({ THREE, grp, coords, plazaTop, headColors, guestColors, hatFrac, balloonFrac }) {
  const n = coords.length;
  const make = (geo, colorHex, count, shadow = true) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: colorHex }), Math.max(count, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = shadow;
    mesh.frustumCulled = false; // matrices churn every frame; culling math isn't worth it
    grp.add(mesh);
    return mesh;
  };
  const nColors = guestColors.length;
  const groupCap = Math.ceil(n / Math.max(1, nColors));
  const bodyGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.42, 6);
  const headGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const bodies = guestColors.map(c => make(bodyGeo, c, groupCap));
  const heads = guestColors.map((_, k) => make(headGeo, headColors[k % headColors.length], groupCap));

  // accessory owners, bucketed by their palette colour (each bucket ascending)
  const hatGeo = new THREE.ConeGeometry(HAT_SIZE.radius, HAT_SIZE.height, 7);
  const balloonGeo = new THREE.SphereGeometry(BALLOON_SIZE.radius, 8, 6);
  const stringGeo = new THREE.CylinderGeometry(BALLOON_SIZE.stringR, BALLOON_SIZE.stringR, BALLOON_SIZE.stringLen, 3);
  const hatOwners = guestColors.map(() => []);
  const balloonOwners = guestColors.map(() => []);
  for (let i = 0; i < n; i++) {
    if (guestBuyerRoll(i) < hatFrac) hatOwners[(i + 2) % nColors].push(i);
    if (guestBuyerRoll(i + 7919) < balloonFrac) balloonOwners[(i + 4) % nColors].push(i);
  }
  const hats = guestColors.map((c, k) => make(hatGeo, c, hatOwners[k].length));
  const balloons = guestColors.map((c, k) => make(balloonGeo, c, balloonOwners[k].length));
  const strings = balloonOwners.map(list => make(stringGeo, 0xf5f0d7, list.length, false));

  return {
    bodies,
    heads,
    hats,
    balloons,
    strings,
    hatOwners,
    balloonOwners,
    nColors,
    coords,
    plazaTop,
    poolSize: n,
    mat: new THREE.Matrix4(),
  };
}

// The forecourt crowd: plaza guests who mill between the fountain, the carts
// and the benches — window-shopping rather than queueing. Same instanced
// per-colour trick as the queue crowd; movement is a tiny seeded state machine
// per wanderer (walk to a POI ring point, browse a few seconds, drift on).
// Project a point out of every keep-out circle (fountain, carts, tables…) so
// guests slide around furniture instead of clipping through it.
function pushOutOfObstacles(w, obstacles) {
  if (!obstacles) return;
  for (const o of obstacles) {
    const dx = w.x - o.x;
    const dz = w.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < o.r * o.r) {
      const d = Math.sqrt(d2) || 0.001;
      w.x = o.x + dx / d * o.r;
      w.z = o.z + dz / d * o.r;
    }
  }
}

function buildPlazaCrowd({ THREE, grp, plazaTop, bounds, pois, obstacles = [], headColors, guestColors, hatFrac, balloonFrac, poolSize = 90 }) {
  if (!pois?.length) return null;
  const n = poolSize;
  const make = (geo, colorHex, count, shadow = true) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: colorHex }), Math.max(count, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = shadow;
    mesh.frustumCulled = false;
    grp.add(mesh);
    return mesh;
  };
  const nColors = guestColors.length;
  const groupCap = Math.ceil(n / Math.max(1, nColors));
  const bodies = guestColors.map(c => make(new THREE.CylinderGeometry(0.12, 0.16, 0.42, 6), c, groupCap));
  const heads = guestColors.map((_, k) => make(new THREE.SphereGeometry(0.13, 8, 6), headColors[k % headColors.length], groupCap));
  const hatOwners = guestColors.map(() => []);
  const balloonOwners = guestColors.map(() => []);
  for (let i = 0; i < n; i++) {
    if (guestBuyerRoll(i + 131) < hatFrac) hatOwners[(i + 2) % nColors].push(i);
    if (guestBuyerRoll(i + 8087) < balloonFrac) balloonOwners[(i + 4) % nColors].push(i);
  }
  const hats = guestColors.map((c, k) => make(new THREE.ConeGeometry(HAT_SIZE.radius, HAT_SIZE.height, 7), c, hatOwners[k].length));
  const balloons = guestColors.map((c, k) => make(new THREE.SphereGeometry(BALLOON_SIZE.radius, 8, 6), c, balloonOwners[k].length));
  const strings = balloonOwners.map(list =>
    make(new THREE.CylinderGeometry(BALLOON_SIZE.stringR, BALLOON_SIZE.stringR, BALLOON_SIZE.stringLen, 3), 0xf5f0d7, list.length, false));

  // one weighted POI pick, deterministic on the roll
  const totalW = pois.reduce((s, p) => s + p.w, 0);
  const pickPoi = r => {
    let roll = r * totalW;
    for (const p of pois) { roll -= p.w; if (roll <= 0) return p; }
    return pois[pois.length - 1];
  };
  const wanderers = [];
  for (let i = 0; i < n; i++) {
    const poi = pickPoi(guestBuyerRoll(i * 3 + 17));
    const a = guestBuyerRoll(i * 5 + 29) * Math.PI * 2;
    const rr = (poi.r0 ?? 0.35) + guestBuyerRoll(i * 7 + 43) * (poi.r - (poi.r0 ?? 0.35));
    const tgt = { x: poi.x + Math.cos(a) * rr, z: poi.z + Math.sin(a) * rr };
    pushOutOfObstacles(tgt, obstacles);
    const w = {
      x: bounds.x0 + guestBuyerRoll(i * 11 + 3) * (bounds.x1 - bounds.x0),
      z: bounds.z0 + guestBuyerRoll(i * 13 + 7) * (bounds.z1 - bounds.z0),
      tx: tgt.x,
      tz: tgt.z,
      pause: guestBuyerRoll(i * 17 + 11) * 3,
      speed: 0.45 + guestBuyerRoll(i * 19 + 13) * 0.3,
      hops: 0,
    };
    pushOutOfObstacles(w, obstacles);   // never spawn inside the furniture
    wanderers.push(w);
  }
  return {
    bodies, heads, hats, balloons, strings, hatOwners, balloonOwners,
    nColors, plazaTop, bounds, pois, obstacles, pickPoi, wanderers,
    poolSize: n,
    mat: new THREE.Matrix4(),
  };
}

// Per-frame forecourt crowd: how many wanderers show is a token scale of the
// live plaza stock (sqrt keeps early growth visible, the pool caps the cost).
export function updatePlazaVisuals({ plaza = 0, stationRefs, dt = 0, time = 0 }) {
  const pc = stationRefs.plazaCrowd;
  if (!pc) return;
  const vis = Math.min(pc.poolSize, Math.ceil(Math.sqrt(Math.max(0, plaza)) * 3));
  const M = pc.mat;
  const nColors = pc.nColors;
  for (let i = 0; i < vis; i++) {
    const w = pc.wanderers[i];
    let walking = false;
    if (w.pause > 0) {
      w.pause -= dt;
    } else {
      const dx = w.tx - w.x;
      const dz = w.tz - w.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        // arrived: browse a while, then drift to the next draw — or, if an
        // entertainer is mid-show, wander over to catch it
        w.pause = 2.5 + guestBuyerRoll(i * 23 + w.hops * 7 + 5) * 4.5;
        w.hops++;
        const show = stationRefs.plazaShow;
        const a = guestBuyerRoll(i * 31 + w.hops * 17 + 9) * Math.PI * 2;
        let cx, cz, rr;
        if (show && guestBuyerRoll(i * 41 + w.hops * 23 + 3) < 0.45) {
          cx = show.x; cz = show.z;
          rr = 0.8 + guestBuyerRoll(i * 37 + w.hops * 19 + 15) * 1.0;   // audience ring
        } else {
          const poi = pc.pickPoi(guestBuyerRoll(i * 29 + w.hops * 13 + 1));
          cx = poi.x; cz = poi.z;
          rr = (poi.r0 ?? 0.35) + guestBuyerRoll(i * 37 + w.hops * 19 + 15) * (poi.r - (poi.r0 ?? 0.35));
        }
        // clamp to the forecourt, then project out of furniture so the target
        // is always reachable (a target inside the fountain would pin the
        // walker against the rim forever)
        const tgt = {
          x: Math.min(pc.bounds.x1, Math.max(pc.bounds.x0, cx + Math.cos(a) * rr)),
          z: Math.min(pc.bounds.z1, Math.max(pc.bounds.z0, cz + Math.sin(a) * rr)),
        };
        pushOutOfObstacles(tgt, pc.obstacles);
        w.tx = tgt.x;
        w.tz = tgt.z;
      } else if (dt > 0) {
        const step = Math.min(dist, w.speed * dt);
        w.x += dx / dist * step;
        w.z += dz / dist * step;
        walking = true;
        // slide around the fountain/carts/tables rather than through them
        pushOutOfObstacles(w, pc.obstacles);
      }
    }
    // stroll bob while walking, a gentler idle sway while browsing
    const y = pc.plazaTop + (walking
      ? Math.abs(Math.sin(time * 6 + i * 1.3)) * 0.045
      : Math.abs(Math.sin(time * 1.6 + i * 2.1)) * 0.015);
    const g = i % nColors;
    const k = (i / nColors) | 0;
    M.makeTranslation(w.x, y + 0.21, w.z);
    pc.bodies[g].setMatrixAt(k, M);
    M.makeTranslation(w.x, y + 0.5, w.z);
    pc.heads[g].setMatrixAt(k, M);
  }
  for (let g = 0; g < nColors; g++) {
    const visible = Math.max(0, Math.ceil((vis - g) / nColors));
    pc.bodies[g].count = visible;
    pc.heads[g].count = visible;
    pc.bodies[g].instanceMatrix.needsUpdate = true;
    pc.heads[g].instanceMatrix.needsUpdate = true;
  }
  // accessories track their owner (ascending owner buckets → visible prefix)
  const hatY = 0.5 + HAT_SIZE.yOffset;
  const B = BALLOON_SIZE;
  for (let g = 0; g < nColors; g++) {
    const hatBucket = pc.hatOwners[g];
    let hv = 0;
    for (; hv < hatBucket.length && hatBucket[hv] < vis; hv++) {
      const w = pc.wanderers[hatBucket[hv]];
      M.makeTranslation(w.x, pc.plazaTop + hatY, w.z);
      pc.hats[g].setMatrixAt(hv, M);
    }
    pc.hats[g].count = hv;
    pc.hats[g].instanceMatrix.needsUpdate = true;

    const balloonBucket = pc.balloonOwners[g];
    let bv = 0;
    for (; bv < balloonBucket.length && balloonBucket[bv] < vis; bv++) {
      const w = pc.wanderers[balloonBucket[bv]];
      // balloons drift on a lazy per-owner phase
      const sway = Math.sin(time * 1.2 + balloonBucket[bv] * 2.7) * 0.03;
      M.makeTranslation(w.x + B.x + sway, pc.plazaTop + 0.5 + B.y, w.z + B.z);
      pc.balloons[g].setMatrixAt(bv, M);
      M.makeTranslation(w.x + B.x + sway, pc.plazaTop + 0.5 + B.y - B.radius - B.stringLen / 2 + 0.04, w.z + B.z);
      pc.strings[g].setMatrixAt(bv, M);
    }
    pc.balloons[g].count = bv;
    pc.strings[g].count = bv;
    pc.balloons[g].instanceMatrix.needsUpdate = true;
    pc.strings[g].instanceMatrix.needsUpdate = true;
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
  coasterName = 'Coaster',
  hypeLevel = 0,
}) {
  // canvas board textures are not freed by material.dispose(); do it explicitly.
  // InstancedMesh also needs its own dispose() to release instance buffers.
  stationGrp.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (m.map?.isTexture) m.map.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
  disposeGroup(stationGrp);
  stationRefs.queueGuests = [];
  stationRefs.queueSlotCoords = [];
  stationRefs.queueAnim = null;
  stationRefs.crowd = null;
  stationRefs.plazaCrowd = null;
  stationRefs.plazaPOIs = null;
  stationRefs.plazaBounds = null;
  stationRefs.walkers = null;
  stationRefs.walkerGeom = null;
  stationRefs.frameGroup = null;
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
  // walkerGeom coordinates are local to this frame; staff actors mirror it
  stationRefs.frameGroup = grp;

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
  // one instance per guest, capped — beyond this the Virtual Queue research
  // canonically stores the overflow crowd off-site
  const poolSize = Math.min(queueCap, 700);
  const queueInfo = buildQueue({
    THREE,
    grp,
    startZ: qStart,
    queueCap,
    poolSize,
    platLen: PLAT_LEN,
    platTop: PLAT_H,
    canopyLevel: upgrades.canopy?.level || 0,
    snacksLevel: upgrades.snacks?.level || 0,
    comfortLevel: upgrades.comfort?.level || 0,
    foodCourtLevel: upgrades.foodCourt?.level || 0,
    hatFrac: d.hatFrac || 0,
    balloonFrac: d.balloonFrac || 0,
    stationRefs,
    colors,
    headColors,
    guestColors,
    coasterName,
    hypeLevel,
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

  // (the snack kiosk now anchors the forecourt — built inside buildQueue)

  // ── exit walkway: steps down at the rear (unload) end of the platform, a
  //    strip along the plaza's margin, and an EXIT sign where guests stroll off ──
  const plazaTop = stationRefs.queuePlazaTop ?? 0.06;
  const exitX = queueInfo.xR + 0.82;
  const exitEndZ = qStart + queueInfo.depth + 1.5;
  box(THREE, grp, 0xcdb884, queueInfo.gapW - 0.2, 0.24, 0.7, exitX, plazaTop + 0.34, qStart - 0.68, true);
  box(THREE, grp, 0xd8c79a, queueInfo.gapW - 0.2, 0.24, 0.5, exitX, plazaTop + 0.12, qStart - 0.42, true);
  const walkway = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.05, exitEndZ - (qStart - 0.9)),
    new THREE.MeshLambertMaterial({ color: 0xdccfa4 }),
  );
  walkway.position.set(exitX, plazaTop + 0.028, (qStart - 0.9 + exitEndZ) / 2);
  walkway.receiveShadow = true;
  grp.add(walkway);
  const exitPostMat = new THREE.MeshLambertMaterial({ color: colors.trunk });
  for (const dx of [-0.62, 0.62]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), exitPostMat);
    p.position.set(exitX + dx, plazaTop + 0.85, exitEndZ + 0.3);
    p.castShadow = true;
    grp.add(p);
  }
  const exitTex = makeBoardTexture(THREE, 'EXIT', '#46b06a', '#fbf3e2');
  const exitBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.46, 0.1),
    [
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
      new THREE.MeshLambertMaterial({ map: exitTex }),
      new THREE.MeshLambertMaterial({ map: exitTex }),
    ],
  );
  exitBoard.position.set(exitX, plazaTop + 1.55, exitEndZ + 0.3);
  exitBoard.castShadow = true;
  grp.add(exitBoard);

  // ── dual-berth unload deck: a short siding platform past the rear end where
  //    the unloading train stands (visible once Dual-Berth Station is researched)
  if ((d.berths || 1) > 1) {
    const deckX = PLAT_LEN / 2 + 2.4;
    box(THREE, grp, colors.platform, 4.6, PLAT_H, PLAT_W - 0.5, deckX, PLAT_H / 2, PLAT_SIDE - 0.2, true);
    const deckPostMat = new THREE.MeshLambertMaterial({ color: 0xcdb884 });
    for (const dx of [-1.7, 1.7]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 6), deckPostMat);
      p.position.set(deckX + dx, PLAT_H + 1.1, PLAT_SIDE + 0.6);
      p.castShadow = true;
      grp.add(p);
    }
    box(THREE, grp, colors.roof, 5.0, 0.22, PLAT_W - 0.2, deckX, PLAT_H + 2.24, PLAT_SIDE - 0.2, true);
  }

  // ── walker pool: guests that visibly board (gate → platform → train) and
  //    alight (train → platform → exit walkway). Spawned via spawnStationWalkers.
  const walkerPool = [];
  for (let i = 0; i < 64; i++) {
    const seed = i + 9001;
    const g = guest(THREE, grp, 0, plazaTop, 0, i * 3 + 1, headColors, guestColors, {
      hat: guestBuyerRoll(seed) < (d.hatFrac || 0) ? guestColors[(seed + 2) % guestColors.length] : null,
      balloon: guestBuyerRoll(seed + 7919) < (d.balloonFrac || 0) ? guestColors[(seed + 4) % guestColors.length] : null,
    });
    g.visible = false;
    walkerPool.push(g);
  }
  stationRefs.walkers = { pool: walkerPool, active: [] };
  stationRefs.walkerGeom = {
    platLen: PLAT_LEN,
    platH: PLAT_H,
    platSide: PLAT_SIDE,
    platW: PLAT_W,
    qStart,
    plazaTop,
    gateX: queueInfo.gateX,
    exitX,
    exitEndZ,
    // the forecourt past the entrance arch — staff and vignettes roam it too
    archX: queueInfo.archX,
    archZ: queueInfo.archZ,
    foreZ0: queueInfo.foreZ0,
    foreZ1: queueInfo.foreZ1,
    plazaObstacles: stationRefs.plazaObstacles || [],
  };
}

// Spawn animated walkers for a boarding ('board') or alighting ('exit') wave.
// `riders` scales the wave size (token representation, capped by the pool) so a
// 700-seat train reads as a bustling crowd; `duration` is the phase length the
// walk should roughly fit inside. `zone` limits the platform stretch used:
// 'front' = load berth (gate end), 'rear' = unload berth/deck (exit end).
export function spawnStationWalkers(stationRefs, kind, riders, duration = 2, zone = 'all') {
  const w = stationRefs.walkers;
  const g = stationRefs.walkerGeom;
  if (!w || !g || riders <= 0) return;
  const count = Math.min(
    w.pool.length,
    Math.max(4, Math.min(34, Math.ceil(riders / 22) + 3)),
  );
  let x0 = -g.platLen / 2 + 1.1;
  let x1 = g.platLen / 2 - 1.1;
  if (zone === 'front') x1 = Math.max(x0 + 0.5, -0.3);
  else if (zone === 'rear') { x0 = 0.3; x1 = g.platLen / 2 + 4.0; }
  for (let i = 0; i < count; i++) {
    const mesh = w.pool.pop();
    if (!mesh) break;
    const spreadX = x0 + Math.random() * (x1 - x0);
    const pts = kind === 'board'
      ? [
          { x: g.gateX, y: g.plazaTop, z: g.qStart - 0.15 },
          { x: g.gateX, y: g.platH, z: g.platSide + 0.7 },
          { x: spreadX, y: g.platH, z: g.platSide - 0.35 },
          { x: spreadX, y: g.platH, z: g.platSide - g.platW / 2 + 0.18 },
        ]
      : [
          { x: spreadX, y: g.platH, z: g.platSide - g.platW / 2 + 0.3 },
          { x: g.platLen / 2 - 0.7, y: g.platH, z: g.platSide + 0.55 },
          { x: g.exitX, y: g.plazaTop, z: g.qStart - 0.3 },
          { x: g.exitX, y: g.plazaTop, z: g.exitEndZ },
        ];
    // riders rejoin the plaza: off the walkway they drift into the forecourt
    // (visibly closing the plaza → ride → plaza loop) before despawning
    let path = pts;
    if (kind === 'exit' && Number.isFinite(g.foreZ0)) {
      pts.push({
        x: g.exitX * 0.35 + (Math.random() - 0.5) * 1.6,
        y: g.plazaTop,
        z: g.foreZ0 + 1.0 + Math.random() * 1.8,
      });
      path = detourPlazaPath(pts, stationRefs.plazaObstacles);   // skirt the fountain
    }
    let len = 0;
    for (let s = 1; s < path.length; s++) {
      len += Math.hypot(path[s].x - path[s - 1].x, path[s].z - path[s - 1].z);
    }
    w.active.push({
      mesh,
      pts: path,
      dist: 0,
      len,
      speed: Math.min(7, Math.max(1.2, len / Math.max(0.7, duration * 0.8))),
      delay: (i / count) * Math.max(0.3, duration * 0.5) + Math.random() * 0.15,
    });
  }
}

// Bend a plaza-level polyline around the big central obstacles (fountain,
// food-court pavilion): if a segment passes through one, insert a waypoint at
// the closest approach pushed out past the rim. One detour per segment is
// plenty at toy scale. Segments that change height (stairs) are left alone.
function detourPlazaPath(pts, obstacles) {
  if (!obstacles?.length) return pts;
  const out = [pts[0]];
  for (let s = 1; s < pts.length; s++) {
    const a = out[out.length - 1];
    const b = pts[s];
    if ((a.y ?? 0) === (b.y ?? 0)) {
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      for (const o of obstacles) {
        if (o.r < 1.0 || len2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((o.x - a.x) * abx + (o.z - a.z) * abz) / len2));
        if (t <= 0.02 || t >= 0.98) continue;
        const cx = a.x + abx * t, cz = a.z + abz * t;
        let dx = cx - o.x, dz = cz - o.z;
        const d = Math.hypot(dx, dz);
        if (d >= o.r + 0.25) continue;
        if (d < 0.02) { dx = -abz; dz = abx; }   // dead-centre: veer sideways
        const n = Math.hypot(dx, dz) || 1;
        out.push({ x: o.x + dx / n * (o.r + 0.45), y: b.y ?? a.y, z: o.z + dz / n * (o.r + 0.45) });
        break;
      }
    }
    out.push(b);
  }
  return out;
}

// A walk-up-and-decide vignette at the entrance arch, staged from the real
// plaza→queue flow: a guest strolls from a stand to the arch, pauses to size
// up the line, then either commits (walks through — the queue crowd grows) or
// balks (head-shake, drifts back to the shops). Pure theater over sim truth.
export function spawnPlazaVignette(stationRefs, kind = 'join') {
  const w = stationRefs.walkers;
  const g = stationRefs.walkerGeom;
  const pois = stationRefs.plazaPOIs;
  if (!w || !g || !pois?.length || !w.pool.length || !Number.isFinite(g.archZ)) return false;
  const ringPoint = poi => {
    const a = Math.random() * Math.PI * 2;
    const r = (poi.r0 ?? 0.4) + Math.random() * ((poi.r ?? 1) - (poi.r0 ?? 0.4));
    return { x: poi.x + Math.cos(a) * r, y: g.plazaTop, z: poi.z + Math.sin(a) * r };
  };
  const start = ringPoint(pois[(Math.random() * pois.length) | 0]);
  const arch = { x: g.archX, y: g.plazaTop, z: g.archZ + 0.85 };
  const raw = [start, arch];
  if (kind === 'join') {
    raw.push({ x: g.archX, y: g.plazaTop, z: g.archZ - 0.75 });   // through the gate
  } else {
    raw.push(ringPoint(pois[(Math.random() * pois.length) | 0])); // shrug, wander back
  }
  // bend the stroll around the fountain/pavilion, then measure the pause mark
  // (the arch waypoint) along the bent path
  const pts = detourPlazaPath(raw, stationRefs.plazaObstacles);
  let len = 0, lenToArch = 0;
  for (let s = 1; s < pts.length; s++) {
    len += Math.hypot(pts[s].x - pts[s - 1].x, pts[s].z - pts[s - 1].z);
    if (pts[s] === arch) lenToArch = len;
  }
  const mesh = w.pool.pop();
  w.active.push({
    mesh,
    pts,
    dist: 0,
    len,
    speed: 0.6 + Math.random() * 0.25,
    delay: Math.random() * 0.3,
    pauseAt: lenToArch,
    pauseFor: kind === 'join' ? 0.7 + Math.random() * 0.5 : 1.2 + Math.random() * 0.6,
    wiggle: kind !== 'join',   // the "nah" head-shake
  });
  return true;
}

function placeWalker(walker) {
  const pts = walker.pts;
  let remaining = walker.dist;
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1];
    const b = pts[s];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= seg || s === pts.length - 1) {
      const t = seg > 1e-6 ? Math.min(1, remaining / seg) : 1;
      walker.mesh.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      return;
    }
    remaining -= seg;
  }
}

// Per-frame queue + walker animation.
// - Queue guests shuffle forward along the serpentine slot path when a train
//   boards (instead of the front of the line blinking out), with an idle bob.
// - Walkers (boarding/alighting guests) advance along their waypoint paths.
export function updateQueueVisuals({ queue, stationRefs, dt = 0, time = 0 }) {
  const n = Math.round(queue);
  const crowd = stationRefs.crowd;
  if (crowd && crowd.poolSize > 0) {
    const coords = crowd.coords;
    const last = coords.length - 1;
    const plazaTop = crowd.plazaTop;
    const m = Math.min(crowd.poolSize, n);

    const anim = stationRefs.queueAnim || (stationRefs.queueAnim = { advance: 0, prevM: m });
    if (m < anim.prevM) {
      anim.advance = Math.min(anim.advance + (anim.prevM - m), stationRefs.queueShuffleCap || 20);
    }
    anim.prevM = m;
    if (anim.advance > 0 && dt > 0) {
      anim.advance = Math.max(0, anim.advance - dt * (2.5 + anim.advance * 2.4));
    }

    // ease from the pre-boarding slot (i + advance) forward to slot i
    const posAt = f => {
      const j = Math.min(last, Math.floor(f));
      const t = Math.min(1, f - j);
      const a = coords[j];
      const b = coords[Math.min(j + 1, last)];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    };
    const bobAt = i => (i < 200 ? Math.abs(Math.sin(time * 2.2 + i * 1.7)) * 0.03 : 0);
    const M = crowd.mat;
    const nColors = crowd.nColors;
    // guest i lives in colour group i % nColors at group index floor(i / nColors)
    for (let i = 0; i < m; i++) {
      const p = posAt(i + anim.advance);
      const y = plazaTop + bobAt(i);
      const g = i % nColors;
      const k = (i / nColors) | 0;
      M.makeTranslation(p.x, y + 0.21, p.z);
      crowd.bodies[g].setMatrixAt(k, M);
      M.makeTranslation(p.x, y + 0.5, p.z);
      crowd.heads[g].setMatrixAt(k, M);
    }
    for (let g = 0; g < nColors; g++) {
      const visible = Math.max(0, Math.ceil((m - g) / nColors));
      crowd.bodies[g].count = visible;
      crowd.heads[g].count = visible;
      crowd.bodies[g].instanceMatrix.needsUpdate = true;
      crowd.heads[g].instanceMatrix.needsUpdate = true;
    }

    // accessories ride their owner's slot (owner buckets are ascending, so the
    // visible set within each bucket is a count prefix)
    const hatY = 0.5 + HAT_SIZE.yOffset;
    const B = BALLOON_SIZE;
    const balloonY = 0.5 + B.y;
    const stringY = balloonY - B.radius - B.stringLen / 2 + 0.04;
    for (let g = 0; g < nColors; g++) {
      const hatBucket = crowd.hatOwners[g];
      let hv = 0;
      for (; hv < hatBucket.length && hatBucket[hv] < m; hv++) {
        const owner = hatBucket[hv];
        const p = posAt(owner + anim.advance);
        M.makeTranslation(p.x, plazaTop + bobAt(owner) + hatY, p.z);
        crowd.hats[g].setMatrixAt(hv, M);
      }
      crowd.hats[g].count = hv;
      crowd.hats[g].instanceMatrix.needsUpdate = true;

      const balloonBucket = crowd.balloonOwners[g];
      let bv = 0;
      for (; bv < balloonBucket.length && balloonBucket[bv] < m; bv++) {
        const owner = balloonBucket[bv];
        const p = posAt(owner + anim.advance);
        const y = plazaTop + bobAt(owner);
        M.makeTranslation(p.x + B.x, y + balloonY, p.z + B.z);
        crowd.balloons[g].setMatrixAt(bv, M);
        M.makeTranslation(p.x + B.x, y + stringY, p.z + B.z);
        crowd.strings[g].setMatrixAt(bv, M);
      }
      crowd.balloons[g].count = bv;
      crowd.strings[g].count = bv;
      crowd.balloons[g].instanceMatrix.needsUpdate = true;
      crowd.strings[g].instanceMatrix.needsUpdate = true;
    }
  }

  // walkers: staggered start, then advance along their waypoint polyline.
  // A walker with pauseAt holds at that distance (the arch decision beat) —
  // balkers get a little "nah" head-shake while they think it over.
  const w = stationRefs.walkers;
  if (w && w.active.length && dt > 0) {
    for (let i = w.active.length - 1; i >= 0; i--) {
      const walker = w.active[i];
      if ((walker.delay -= dt) > 0) continue;
      walker.mesh.visible = true;
      walker.dist += walker.speed * dt;
      if (walker.pauseFor > 0 && walker.dist >= (walker.pauseAt ?? Infinity)) {
        walker.dist = walker.pauseAt;
        walker.pauseFor -= dt;
        placeWalker(walker);
        if (walker.wiggle) walker.mesh.position.x += Math.sin(time * 11) * 0.05;
        continue;
      }
      if (walker.dist >= walker.len) {
        walker.mesh.visible = false;
        w.active.splice(i, 1);
        w.pool.push(walker.mesh);
        continue;
      }
      placeWalker(walker);
    }
  }
}
