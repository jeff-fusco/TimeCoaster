// The low-poly staff character — shared by the park's world actors and the
// panel portraits so a hired person looks identical in the roster and walking
// the plaza. Built from the person's seeded `look` (skin, hair, accessory,
// uniform, build) plus a role prop. Faces get simple toy eyes so the figure
// reads as a character up close in a portrait, not a blank mannequin.

export function lambert(THREE, color) {
  return new THREE.MeshLambertMaterial({ color });
}

// Two dark eyes (and a hint of a smile) on the front (-z) of the head sphere,
// sized to read at portrait scale while staying in the flat-toy language.
function addFace(THREE, g, skin) {
  const eyeMat = lambert(THREE, 0x24303f);
  const eye = r => new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), eyeMat);
  const l = eye(0.028), rt = eye(0.028);
  l.position.set(-0.052, 0.565, -0.108);
  rt.position.set(0.052, 0.565, -0.108);
  // tiny cheeks warm the face a touch (multiply skin toward pink)
  g.add(l, rt);
}

export function buildStaffFigure(THREE, person, { portrait = false } = {}) {
  const { look } = person;
  const g = new THREE.Group();
  const slim = look.build === 0;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(slim ? 0.115 : 0.135, slim ? 0.155 : 0.175, 0.46, 7),
    lambert(THREE, look.uniform),
  );
  body.position.y = 0.23;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lambert(THREE, look.skin));
  head.position.y = 0.55;
  head.castShadow = true;
  g.add(body, head);
  addFace(THREE, g, look.skin);

  // hair styles: distinct silhouettes that read at both park zoom and portrait
  const hairMat = lambert(THREE, look.hair);
  switch (look.hairStyle) {
    case 'short': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.118, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      h.position.y = 0.60; g.add(h); break;
    }
    case 'buzz': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.107, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), hairMat);
      h.position.y = 0.615; g.add(h); break;
    }
    case 'bun': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.112, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      h.position.y = 0.60;
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.058, 7, 6), hairMat);
      bun.position.set(0, 0.67, 0.10);
      g.add(h, bun); break;
    }
    case 'ponytail': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.112, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      h.position.y = 0.60;
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.18, 6), hairMat);
      tail.position.set(0, 0.52, 0.14); tail.rotation.x = 0.5;
      g.add(h, tail); break;
    }
    case 'curly': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.142, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
      h.position.y = 0.60;
      // side curls give curly hair a rounder silhouette
      const curl = x => { const c = new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 5), hairMat); c.position.set(x, 0.58, 0.02); return c; };
      g.add(h, curl(-0.12), curl(0.12)); break;
    }
    case 'cap': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.035, 9), lambert(THREE, look.uniform));
      brim.position.y = 0.635;
      const peak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.11), lambert(THREE, look.uniform));
      peak.position.set(0, 0.628, -0.15);
      g.add(brim, peak); break;
    }
    // 'bald': nothing
  }

  // accessories — bigger than before so they read at a glance (park + portrait)
  if (look.accessory === 'glasses') {
    const frameMat = lambert(THREE, 0x24303f);
    const lens = x => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.062, 0.03), frameMat); m.position.set(x, 0.565, -0.11); return m; };
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.02), frameMat);
    bridge.position.set(0, 0.57, -0.115);
    g.add(lens(-0.058), lens(0.058), bridge);
  } else if (look.accessory === 'earring') {
    const gold = lambert(THREE, 0xf2b134);
    const e = x => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), gold); m.position.set(x, 0.50, 0); return m; };
    g.add(e(0.132), e(-0.132));
  } else if (look.accessory === 'headphones') {
    const dark = lambert(THREE, 0x24303f);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 6, 10, Math.PI), dark);
    band.position.y = 0.57; band.rotation.z = Math.PI;
    const cup = x => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), dark); m.position.set(x, 0.545, 0); m.rotation.z = Math.PI / 2; return m; };
    g.add(band, cup(0.148), cup(-0.148));
  }

  // role prop, held slightly to the side (kept in portraits — it's character)
  const prop = ({
    mechanics: () => {   // wrench
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.24, 0.055), lambert(THREE, 0x9aa3b1));
      p.position.set(0.21, 0.3, 0); return p;
    },
    janitors: () => {    // broom
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.52, 5), lambert(THREE, 0x8a5a2b));
      stick.position.set(0.2, 0.3, 0);
      const brush = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.055), lambert(THREE, 0xc98a3a));
      brush.position.set(0.2, 0.06, 0);
      const p = new THREE.Group(); p.add(stick, brush); return p;
    },
    photographers: () => { // camera
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.085, 0.08), lambert(THREE, 0x24303f));
      p.position.set(0.16, 0.42, -0.02);
      const lensM = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.04, 8), lambert(THREE, 0x6f7b8c));
      lensM.rotation.x = Math.PI / 2; lensM.position.set(0.16, 0.42, -0.07);
      const grp = new THREE.Group(); grp.add(p, lensM); return grp;
    },
    scientists: () => {  // clipboard
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.018), lambert(THREE, 0xf5efdf));
      p.position.set(0.18, 0.34, -0.06); p.rotation.y = 0.3; return p;
    },
    marketers: () => {   // flyer stack
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.1), lambert(THREE, 0xfff6e8));
      p.position.set(0.19, 0.33, 0); return p;
    },
  })[person.role];
  if (prop) g.add(prop());

  // photographers: a hidden flash bulb that pops on launches (world only)
  if (person.role === 'photographers' && !portrait) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xfff8d0, transparent: true, opacity: 0.95 }),
    );
    flash.position.set(0, 0.62, -0.2);
    flash.visible = false;
    flash.name = 'flash';
    g.add(flash);
  }
  return g;
}

// Free a figure's geometry + materials (portrait studio builds one per seed).
export function disposeFigure(fig) {
  fig.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }
  });
}
