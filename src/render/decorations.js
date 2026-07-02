// Decoration models: chunky low-poly pieces in the game palette. Each builder
// returns a Group whose base sits at y=0 (callers lift it onto the slab top).
// buildDecorationModel is also used for the placement ghost preview.

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

const BUILDERS = { flowers, lamp, topiary, statue, fountain };

export function buildDecorationModel({ THREE, type, colors }) {
  const builder = BUILDERS[type];
  if (!builder) return new THREE.Group();
  const model = builder({ THREE, colors });
  model.traverse(o => { o.castShadow = true; });
  return model;
}

export function buildDecorations({ THREE, group, decorations, colors, disposeGroup }) {
  disposeGroup(group);
  for (const d of decorations) {
    const model = buildDecorationModel({ THREE, type: d.type, colors });
    // deterministic little twist so rows of items don't look stamped
    model.rotation.y = Math.sin(d.x * 12.9898 + d.z * 78.233) * Math.PI;
    model.position.set(d.x, 0.04, d.z);
    group.add(model);
  }
}
