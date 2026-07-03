import { chunkBounds } from '../systems/property.js?v=20260703-12';

export function createClouds({ THREE, scene, colors }) {
  const clouds = [];
  function cloud(x, y, z) {
    const c = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: colors.cloud });
    [
      [0, 0, 0, 1.4],
      [1.2, -0.1, 0, 1],
      [-0.8, -0.1, 0, 1],
      [0.4, 0.5, 0.3, 0.9],
    ].forEach(([dx, dy, dz, r]) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
      p.position.set(dx, dy, dz);
      c.add(p);
    });
    c.position.set(x, y, z);
    scene.add(c);
    clouds.push(c);
  }
  cloud(-18, 18, -14);
  cloud(16, 20, -6);
  cloud(2, 22, 18);
  cloud(-22, 17, 8);

  return { clouds };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function tree({ THREE, colors, x, z, scale }) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6),
    new THREE.MeshLambertMaterial({ color: colors.trunk }),
  );
  trunk.position.y = 0.55;
  const f1 = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 1.5, 8),
    new THREE.MeshLambertMaterial({ color: colors.leaf }),
  );
  f1.position.y = 1.5;
  const f2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.2, 8),
    new THREE.MeshLambertMaterial({ color: colors.leafHi }),
  );
  f2.position.y = 2.2;
  t.add(trunk, f1, f2);
  t.position.set(x, 0.04, z);
  t.scale.setScalar(scale);
  t.traverse(o => (o.castShadow = true));
  return t;
}

function safeTreeSpot(key, lx, lz) {
  if (key !== '0,0') return true;
  if (Math.abs(lx) < 7.5 && lz > 2) return false;
  if (Math.abs(lx) < 3.5 && Math.abs(lz) < 3.5) return false;
  return true;
}

export function buildChunkScenery({ THREE, group, property, colors, disposeGroup }) {
  disposeGroup(group);
  const margin = 3.2;

  for (const key of property.owned) {
    const bounds = chunkBounds(property, key);
    if (!bounds) continue;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const rand = mulberry32(hashString(`trees:${key}`));
    const areaScale = Math.max(1, width * depth / (property.chunkSize * property.chunkSize));
    const count = key === '0,0' ? 4 : Math.round((5 + Math.floor(rand() * 3)) * Math.min(2.4, areaScale));
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts++ < count * 14) {
      const x = bounds.minX + margin + rand() * Math.max(0, width - margin * 2);
      const z = bounds.minZ + margin + rand() * Math.max(0, depth - margin * 2);
      const lx = x - (bounds.minX + bounds.maxX) / 2;
      const lz = z - (bounds.minZ + bounds.maxZ) / 2;
      if (!safeTreeSpot(key, lx, lz)) continue;
      const sc = 0.62 + rand() * 0.5;
      group.add(tree({
        THREE,
        colors,
        x,
        z,
        scale: sc,
      }));
      placed++;
    }
  }
}
