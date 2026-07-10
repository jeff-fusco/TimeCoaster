// Retired coasters, rendered as standing monuments in a "hall of fame" row
// behind the active park. Each monument re-uses the real track + decoration
// builders (so it looks exactly like what the player built) plus a plaque and a
// single ghost train that loops forever — render-only, no simulation.
//
// Monuments are re-authored at their display slot (ctrlPts + decor shifted by
// slot − centroid) rather than translating a group, so the ghost train can
// sample absolute path coordinates without a double offset.
import { PHYS } from '../config/gameData.js?v=20260703-13';
import { DEFAULT_STATION, buildPath as buildTrackPath, samplePathAt } from '../systems/path.js?v=20260703-13';
import { biomeColors } from '../systems/biomes.js?v=20260703-13';

const SLOT_SPACING = 34;   // lateral gap between monuments
const HALL_Z = -46;        // how far behind the park the row sits
const GHOST_CARS = 4;
const GHOST_CAR_LEN = 1.7;

// minimal upgrades stub so buildPath can read car/seats/speed levels
const MONUMENT_UPGRADES = { car: { level: 0 }, seats: { level: 0 }, speed: { level: 0 } };

function plaqueTexture(THREE, monument) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fbf3e2'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#1c2533'; g.lineWidth = 8; g.strokeRect(5, 5, 246, 118);
  g.fillStyle = '#e8533f'; g.textAlign = 'center';
  g.font = '700 30px Fredoka, Arial, sans-serif';
  g.fillText(monument.name.slice(0, 16), 128, 42);
  g.fillStyle = '#1c2533';
  g.font = '600 18px Inter, Arial, sans-serif';
  g.fillText(`Generation ${monument.generation}`, 128, 72);
  g.fillStyle = '#48566b';
  g.font = '600 15px Inter, Arial, sans-serif';
  const eff = Math.round((monument.stats.excitement || 0) + (monument.themeBonus || 0));
  g.fillText(`EXC ${eff} · ${Math.round(monument.stats.length)}m`, 128, 100);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function buildGhostCar(THREE, colors) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.5, 1.4),
    new THREE.MeshStandardMaterial({ color: colors.car, roughness: 0.5 }),
  );
  body.position.y = 0.42;
  body.castShadow = true;
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.14, 1.46),
    new THREE.MeshStandardMaterial({ color: colors.carTrim, roughness: 0.5 }),
  );
  trim.position.y = 0.2;
  car.add(body, trim);
  return car;
}

export function buildMonuments({
  THREE, group, monuments, colors, renderTrackGeometry, renderDecorations, disposeGroup, worldUp,
}) {
  // free old plaque textures + geometry before rebuilding
  group.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (m.map?.isTexture) m.map.dispose();
  });
  disposeGroup(group);

  const ghosts = [];
  let extent = 0;
  const n = monuments.length;

  monuments.forEach((monument, i) => {
    // each monument keeps the palette of the biome it was built in
    const mCol = biomeColors(monument.biome || 'meadow', colors);
    // slot in the row, centred on origin so the hall grows both ways
    const slotX = (i - (n - 1) / 2) * SLOT_SPACING;
    const slotZ = HALL_Z;

    const pts = monument.ctrlPts;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    const ox = slotX - cx, oz = slotZ - cz;

    const shiftedCtrl = pts.map(p => ({ ...p, x: p.x + ox, z: p.z + oz }));
    const shiftedDecor = (monument.decorations || []).map(d => ({ ...d, x: d.x + ox, z: d.z + oz }));
    const station = { cx: DEFAULT_STATION.cx + ox, cz: DEFAULT_STATION.cz + oz, y: DEFAULT_STATION.y };

    let path;
    try {
      path = buildTrackPath({
        ctrlPts: shiftedCtrl.map(p => ({ ...p })),
        upgrades: MONUMENT_UPGRADES,
        researchDone: {},
        physics: PHYS,
        Vector3: THREE.Vector3,
        worldUp,
        station,
      });
    } catch (_) { return; }

    // ── display slab sized to the track footprint ──
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    for (const p of path.pos) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      if (p.y < minY) minY = p.y;
    }
    const padX = (maxX - minX) / 2 + 3.5;
    const padZ = (maxZ - minZ) / 2 + 3.5;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(padX * 2, 1.2, padZ * 2),
      [
        new THREE.MeshLambertMaterial({ color: mCol.sandSide || 0xb99a62 }),
        new THREE.MeshLambertMaterial({ color: mCol.sandSide || 0xb99a62 }),
        new THREE.MeshLambertMaterial({ color: mCol.grassHi || 0x7fc057 }),
        new THREE.MeshLambertMaterial({ color: mCol.dirtDark || 0x6b4a2a }),
        new THREE.MeshLambertMaterial({ color: mCol.sandSide || 0xb99a62 }),
        new THREE.MeshLambertMaterial({ color: mCol.sandSide || 0xb99a62 }),
      ],
    );
    slab.position.set(slotX, -0.55, slotZ);
    slab.receiveShadow = true;
    group.add(slab);

    // ── track + decorations (in the monument's biome palette) ──
    const trackGrp = new THREE.Group();
    group.add(trackGrp);
    renderTrackGeometry({ THREE, trackGrp, path, colors: mCol, disposeGroup });
    if (shiftedDecor.length) {
      const decorGrp = new THREE.Group();
      group.add(decorGrp);
      renderDecorations({ THREE, group: decorGrp, decorations: shiftedDecor, colors: mCol, disposeGroup });
    }

    // ── plaque on a post at the front edge of the slab ──
    const postMat = new THREE.MeshLambertMaterial({ color: mCol.trunk });
    for (const dx of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), postMat);
      post.position.set(slotX + dx, 1.2, slotZ + padZ - 0.5);
      post.castShadow = true;
      group.add(post);
    }
    const tex = plaqueTexture(THREE, monument);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.7, 0.16),
      [
        new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
        new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
        new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
        new THREE.MeshLambertMaterial({ color: 0x1c2533 }),
        new THREE.MeshLambertMaterial({ map: tex }),
        new THREE.MeshLambertMaterial({ map: tex }),
      ],
    );
    board.position.set(slotX, 2.5, slotZ + padZ - 0.5);
    board.castShadow = true;
    group.add(board);

    // ── ghost train ──
    const cars = [];
    for (let c = 0; c < GHOST_CARS; c++) {
      const car = buildGhostCar(THREE, colors);
      group.add(car);
      cars.push(car);
    }
    ghosts.push({
      path,
      cars,
      s: (i / Math.max(1, n)) * path.len,
      len: path.len,
      speed: Math.max(4, Math.min(20, path.len / 14)),
    });

    extent = Math.max(extent, Math.abs(slotX) + padX, Math.abs(slotZ) + padZ);
  });

  return { ghosts, extent };
}

// Advance every monument's ghost train one frame (render-only motion).
export function stepMonuments(ghosts, dt, THREE) {
  for (const gh of ghosts) {
    gh.s = (gh.s + gh.speed * dt) % gh.len;
    for (let i = 0; i < gh.cars.length; i++) {
      const frame = samplePathAt(gh.path, gh.s - i * GHOST_CAR_LEN, THREE.Vector3);
      gh.cars[i].position.copy(frame.pos).addScaledVector(frame.up, 0.12);
      gh.cars[i].quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tan));
    }
  }
}
