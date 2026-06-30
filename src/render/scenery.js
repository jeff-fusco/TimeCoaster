// Static park scenery: a ring of trees plus drifting clouds.
// Returns { clouds } so the caller can animate the clouds each frame.
export function createScenery({ THREE, scene, colors }) {
  const clouds = [];

  function tree(x, z, sc) {
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
    t.position.set(x, 0, z);
    t.scale.setScalar(sc);
    t.traverse(o => (o.castShadow = true));
    scene.add(t);
  }

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.3;
    const r = 19 + Math.sin(i * 3.1) * 2.5;
    tree(Math.cos(a) * r, Math.sin(a) * r, 0.8 + (i % 3) * 0.25);
  }
  tree(-15, -2, 1.1);
  tree(15, -12, 0.9);
  tree(16, 10, 1);
  tree(-14, 12, 0.95);

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
