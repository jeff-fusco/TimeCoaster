// Land rendering: owned chunks are mowed park grass with a cream border;
// adjacent purchasable chunks are sandy "for sale" lots with a dashed outline
// and an RCT-style FOR SALE sign at the centre. Every sign/lot mesh carries
// `userData.landKey` so a play-mode tap can open the purchase popup.

// draw the sign board face (cream card, ink border, red FOR SALE, price)
function makeSignTexture(THREE, costLabel) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const g = canvas.getContext('2d');

  // board + border, matching the HUD card look
  g.fillStyle = '#fbf3e2';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#1c2533';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 150);

  g.textAlign = 'center';
  g.fillStyle = '#e8533f';
  g.font = '900 44px Fredoka, Arial, sans-serif';
  g.fillText('FOR SALE', 128, 62);

  g.fillStyle = '#1c2533';
  g.font = '700 40px Fredoka, Arial, sans-serif';
  g.fillText(costLabel, 128, 118);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function buildSign({ THREE, key, cost, fmt, colors }) {
  const sign = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: colors.trunk });
  const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.6, 6);
  for (const dx of [-1.3, 1.3]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(dx, 0.8, 0);
    post.castShadow = true;
    sign.add(post);
  }

  const tex = makeSignTexture(THREE, `$${fmt(cost)}`);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.1, 0.14),
    [
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),           // +x edge
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),           // -x edge
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),           // top
      new THREE.MeshLambertMaterial({ color: 0x1c2533 }),           // bottom
      new THREE.MeshLambertMaterial({ map: tex }),                  // front
      new THREE.MeshLambertMaterial({ color: 0xf0e4c8 }),           // back
    ],
  );
  board.position.y = 2.1;
  board.castShadow = true;
  sign.add(board);
  sign.userData.board = board;

  sign.traverse(o => { o.userData.landKey = key; });
  sign.userData.landKey = key;
  return sign;
}

export function buildPropertyGeometry({
  THREE,
  group,
  property,
  candidates = [],
  colors,
  fmt = v => v,
  disposeGroup,
}) {
  // canvas sign textures are not freed by material.dispose(); do it explicitly
  group.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (m.map?.isTexture) m.map.dispose();
  });
  disposeGroup(group);

  const size = property.chunkSize;
  const half = size / 2;

  const ownedMat = new THREE.MeshLambertMaterial({ color: colors.grassHi });
  const lotMat = new THREE.MeshLambertMaterial({ color: colors.platform, transparent: true, opacity: 0.3 });
  const borderMat = new THREE.LineBasicMaterial({ color: colors.landBorder, transparent: true, opacity: 0.85 });
  const lotLineMat = new THREE.LineDashedMaterial({ color: colors.landCandidate, dashSize: 1.1, gapSize: 0.7 });

  function borderPoints(x, z, y) {
    return [
      new THREE.Vector3(x - half, y, z - half), new THREE.Vector3(x + half, y, z - half),
      new THREE.Vector3(x + half, y, z - half), new THREE.Vector3(x + half, y, z + half),
      new THREE.Vector3(x + half, y, z + half), new THREE.Vector3(x - half, y, z + half),
      new THREE.Vector3(x - half, y, z + half), new THREE.Vector3(x - half, y, z - half),
    ];
  }

  // owned park land: solid mowed grass extending the ground as the park grows
  for (const key of property.owned) {
    const [cx, cz] = key.split(',').map(Number);
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
    const x = cx * size;
    const z = cz * size;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), ownedMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.03, z);
    plane.receiveShadow = true;
    group.add(plane);

    const border = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(borderPoints(x, z, 0.06)),
      borderMat,
    );
    group.add(border);
  }

  // for-sale lots: sandy plot + dashed outline + clickable FOR SALE sign
  const owned = new Set(property.owned);
  for (const candidate of candidates) {
    const x = candidate.x * size;
    const z = candidate.z * size;

    const lot = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lotMat);
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(x, 0.02, z);
    lot.userData.landKey = candidate.key;
    group.add(lot);

    const outlineGeo = new THREE.BufferGeometry().setFromPoints(borderPoints(x, z, 0.05));
    const outline = new THREE.LineSegments(outlineGeo, lotLineMat);
    outline.computeLineDistances();
    group.add(outline);

    const sign = buildSign({ THREE, key: candidate.key, cost: candidate.cost, fmt, colors });
    sign.position.set(x, 0, z);
    // face the nearest owned neighbour so the sign reads from inside the park
    const toward = [
      [candidate.x + 1, candidate.z], [candidate.x - 1, candidate.z],
      [candidate.x, candidate.z + 1], [candidate.x, candidate.z - 1],
    ].find(([nx, nz]) => owned.has(`${nx},${nz}`));
    if (toward) {
      const dx = toward[0] * size - x;
      const dz = toward[1] * size - z;
      sign.rotation.y = Math.atan2(dx, dz);
    }
    // a touch of RCT crookedness, deterministic per chunk
    const wob = ((candidate.x * 7 + candidate.z * 13) % 5 - 2) * 0.02;
    sign.rotation.z = wob;
    group.add(sign);
  }
}
