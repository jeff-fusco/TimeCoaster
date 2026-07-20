// Decoration models: chunky low-poly pieces in the game palette. Each builder
// returns a Group whose base sits at y=0 (callers lift it onto the slab top —
// plus the piece's stored stacking height).
// buildDecorationModel is also used for the placement ghost preview.
import { DECOR } from '../config/gameData.js?v=20260703-14';

const FLOWER_COLS = [0xe85d75, 0xf2b134, 0xa855f7, 0x4a8fe7, 0xfbf3e2];

function lam(THREE, color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function flowers({ THREE, colors }) {
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 1.15), lam(THREE, colors.dirt));
  bed.position.y = 0.08;
  g.add(bed);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const r = i === 4 ? 0 : 0.34;
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lam(THREE, FLOWER_COLS[i]));
    bloom.position.set(Math.cos(a) * r, 0.24, Math.sin(a) * r);
    g.add(bloom);
  }
  return g;
}

function lamp({ THREE, colors }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 8), lam(THREE, 0x444a55));
  base.position.y = 0.07;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6), lam(THREE, 0x444a55));
  pole.position.y = 0.95;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    lam(THREE, 0xffd27a, { emissive: 0xf5a623, emissiveIntensity: 0.75 }),
  );
  bulb.position.y = 1.9;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 8), lam(THREE, colors.roof));
  cap.position.y = 2.06;
  g.add(base, pole, bulb, cap);
  return g;
}

function topiary({ THREE, colors }) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.3, 8), lam(THREE, 0xcd6a3f));
  pot.position.y = 0.15;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 6), lam(THREE, colors.trunk));
  trunk.position.y = 0.55;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), lam(THREE, colors.leafHi));
  ball.position.y = 1.15;
  const topBall = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lam(THREE, colors.leaf));
  topBall.position.y = 1.78;
  g.add(pot, trunk, ball, topBall);
  return g;
}

function statue({ THREE, colors }) {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.85), lam(THREE, colors.platform));
  plinth.position.y = 0.25;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), lam(THREE, 0xf0e4c8));
  cap.position.y = 0.55;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.75, 8), lam(THREE, 0xf5a623));
  body.position.y = 0.98;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lam(THREE, 0xf5a623));
  head.position.y = 1.48;
  g.add(plinth, cap, body, head);
  return g;
}

function fountain({ THREE, colors }) {
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.3, 12), lam(THREE, 0xf0e4c8));
  basin.position.y = 0.15;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 12), lam(THREE, 0x4a8fe7));
  water.position.y = 0.32;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.65, 8), lam(THREE, 0xf0e4c8));
  column.position.y = 0.6;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.12, 10), lam(THREE, 0xf0e4c8));
  bowl.position.y = 0.95;
  const jet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lam(THREE, 0x8fd0e8));
  jet.position.y = 1.1;
  g.add(basin, water, column, bowl, jet);
  return g;
}

// ── construction kit & nature pieces ────────────────────────────────────────
function rock({ THREE }) {
  const g = new THREE.Group();
  const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), lam(THREE, 0x9aa0a8));
  boulder.scale.set(1, 0.72, 0.9);
  boulder.position.y = 0.5;
  const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), lam(THREE, 0x848a93));
  pebble.position.set(0.62, 0.2, 0.3);
  g.add(boulder, pebble);
  return g;
}

function pine({ THREE, colors }) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6), lam(THREE, colors.trunk));
  trunk.position.y = 0.35;
  g.add(trunk);
  const tiers = [
    [1.0, 1.05, 0.95],
    [0.74, 0.85, 1.75],
    [0.48, 0.7, 2.4],
  ];
  tiers.forEach(([r, h, y], i) => {
    const tier = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), lam(THREE, i % 2 ? colors.leafHi : colors.leaf));
    tier.position.y = y;
    g.add(tier);
  });
  return g;
}

function wall({ THREE }) {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 0.32), lam(THREE, 0xd8c79a));
  panel.position.y = 0.85;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.16, 0.44), lam(THREE, 0xb99a62));
  cap.position.y = 1.78;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.2, 0.44), lam(THREE, 0xb99a62));
  base.position.y = 0.1;
  g.add(panel, cap, base);
  return g;
}

function pillar({ THREE }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), lam(THREE, 0xb99a62));
  base.position.y = 0.1;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.9, 8), lam(THREE, 0xe6d9b8));
  shaft.position.y = 1.15;
  const capital = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.66), lam(THREE, 0xb99a62));
  capital.position.y = 2.19;
  g.add(base, shaft, capital);
  return g;
}

function deck({ THREE, colors }) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 2.4), lam(THREE, colors.trunk));
  slab.position.y = 0.1;
  for (let i = 0; i < 3; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.62), lam(THREE, 0xa97b4a));
    plank.position.set(0, 0.22, -0.78 + i * 0.78);
    g.add(plank);
  }
  g.add(slab);
  return g;
}

function roof({ THREE, colors }) {
  const g = new THREE.Group();
  const peak = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.3, 4), lam(THREE, colors.roof));
  peak.rotation.y = Math.PI / 4;
  peak.position.y = 0.75;
  const eaves = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 2.6), lam(THREE, 0xc4462f));
  eaves.position.y = 0.07;
  g.add(peak, eaves);
  return g;
}

function arch({ THREE }) {
  const g = new THREE.Group();
  for (const dx of [-1.05, 1.05]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.3, 0.5), lam(THREE, 0xd8c79a));
    leg.position.set(dx, 1.15, 0);
    g.add(leg);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.6), lam(THREE, 0xe6d9b8));
  lintel.position.y = 2.55;
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.66), lam(THREE, 0xb99a62));
  keystone.position.y = 2.57;
  g.add(lintel, keystone);
  return g;
}

function fence({ THREE, colors }) {
  const g = new THREE.Group();
  for (const dx of [-0.85, 0.85]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.95, 6), lam(THREE, colors.trunk));
    post.position.set(dx, 0.48, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(THREE, 0xfbf3e2));
    cap.position.set(dx, 0.99, 0);
    g.add(post, cap);
  }
  for (const h of [0.68, 0.38]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 5), lam(THREE, 0xfbf3e2));
    rail.rotation.z = Math.PI / 2;
    rail.position.y = h;
    g.add(rail);
  }
  return g;
}

function torch({ THREE, colors }) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6), lam(THREE, colors.trunk));
  pole.position.y = 0.75;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.22, 8), lam(THREE, 0x444a55));
  bowl.position.y = 1.58;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.42, 7),
    lam(THREE, 0xf5a623, { emissive: 0xe8533f, emissiveIntensity: 0.9 }),
  );
  flame.position.y = 1.9;
  g.add(pole, bowl, flame);
  return g;
}

function banner({ THREE, colors }) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.1, 6), lam(THREE, 0xfbf3e2));
  pole.position.y = 1.55;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(THREE, 0xf5a623));
  finial.position.y = 3.15;
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.06, 3.02, 0, 0.06, 2.5, 0, 1.05, 2.76, 0,
  ], 3));
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, lam(THREE, colors.track, { side: THREE.DoubleSide }));
  g.add(pole, finial, flag);
  return g;
}

// ── biome signature props ───────────────────────────────────────────────────
function cactus({ THREE }) {
  const g = new THREE.Group();
  const green = 0x4e8a52, greenHi = 0x66a86a;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 2.0, 8), lam(THREE, green));
  trunk.position.y = 1.0;
  g.add(trunk);
  const arm = (x, y, dir) => {
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 7), lam(THREE, greenHi));
    up.position.set(x, y + 0.35, 0);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.55, 7), lam(THREE, greenHi));
    side.rotation.z = Math.PI / 2;
    side.position.set(x - dir * 0.28, y, 0);
    g.add(up, side);
  };
  arm(0.42, 1.0, -1);
  arm(-0.42, 1.35, 1);
  for (let i = 0; i < 3; i++) {
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(THREE, 0xf2b134));
    flower.position.set(Math.cos(i * 2) * 0.24, 1.95 + (i % 2) * 0.06, Math.sin(i * 2) * 0.24);
    g.add(flower);
  }
  return g;
}

function iceSpire({ THREE }) {
  const g = new THREE.Group();
  const ice = { color: 0xbfe6f5, transparent: true, opacity: 0.9 };
  const main = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 6), lam(THREE, 0xbfe6f5, { emissive: 0x6fb7d6, emissiveIntensity: 0.25 }));
  main.position.y = 1.3;
  const shard1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.5, 6), new THREE.MeshLambertMaterial(ice));
  shard1.position.set(0.42, 0.75, 0.15); shard1.rotation.z = -0.35;
  const shard2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), new THREE.MeshLambertMaterial(ice));
  shard2.position.set(-0.4, 0.55, -0.1); shard2.rotation.z = 0.4;
  g.add(main, shard1, shard2);
  return g;
}

function lavaRock({ THREE }) {
  const g = new THREE.Group();
  const rockMat = lam(THREE, 0x2e2a30);
  const base = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), rockMat);
  base.scale.set(1, 0.8, 0.95); base.position.y = 0.55;
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), rockMat);
  top.position.set(0.2, 1.15, 0.1);
  g.add(base, top);
  // glowing lava veins
  for (const [x, y, z] of [[0.1, 0.7, 0.6], [-0.4, 0.5, 0.3], [0.45, 0.9, -0.2]]) {
    const vein = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), lam(THREE, 0xff6a2a, { emissive: 0xe8402a, emissiveIntensity: 0.95 }));
    vein.position.set(x, y, z);
    g.add(vein);
  }
  return g;
}

function moonCrystal({ THREE }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 6), lam(THREE, 0x8a8a94));
  base.position.y = 0.15;
  g.add(base);
  const cols = [0x9a7cff, 0x6fd6ff, 0xb98cff];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34 + i * 0.06, 0),
      lam(THREE, cols[i], { emissive: cols[i], emissiveIntensity: 0.4 }),
    );
    shard.scale.set(0.7, 1.6, 0.7);
    shard.position.set(Math.cos(a) * 0.28, 0.9 + i * 0.18, Math.sin(a) * 0.28);
    shard.rotation.y = a;
    g.add(shard);
  }
  return g;
}

const BUILDERS = {
  flowers, lamp, topiary, statue, fountain, rock, pine, wall, pillar, deck, roof, arch, fence, torch, banner,
  cactus, iceSpire, lavaRock, moonCrystal,
};

// Pieces read tiny from the game's zoomed-out camera (playtest feedback), so
// models get a chunky scale-up; structural pieces are authored near final size
// and use the per-type scale from the DECOR catalog.
export const DECOR_SCALE = 1.6;

export function buildDecorationModel({ THREE, type, colors }) {
  const builder = BUILDERS[type];
  if (!builder) return new THREE.Group();
  const model = builder({ THREE, colors });
  model.scale.setScalar(DECOR[type]?.scale ?? DECOR_SCALE);
  model.traverse(o => { o.castShadow = true; });
  return model;
}

export function buildDecorations({ THREE, group, decorations, colors, disposeGroup }) {
  disposeGroup(group);
  decorations.forEach((d, i) => {
    const model = buildDecorationModel({ THREE, type: d.type, colors });
    // placed rotation when stored; legacy pieces keep their deterministic twist
    model.rotation.y = Number.isFinite(d.rot)
      ? d.rot
      : Math.sin(d.x * 12.9898 + d.z * 78.233) * Math.PI;
    model.position.set(d.x, 0.04 + (d.y || 0), d.z);
    model.userData.decorIndex = i;   // removal tool raycasts back to the entry
    group.add(model);
  });
}
