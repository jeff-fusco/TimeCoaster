// Staff v2 world actors: every hired person walks the park as a small seeded
// character — same low-poly language as the guests, but in role-uniform colors
// with their generated skin/hair/accessory, so the roster panel and the world
// show the same human. Derived entirely from the roster (nothing extra saved).
//
// Behaviors are deliberately cheap state machines driven by systems that
// already exist:
//   operators      stand at their platform posts, hop when a train launches
//   entertainers   patrol in front of the queue gate, spinning little shows
//   mechanics      idle by the exit side; hammer-bob on the deck during installs
//   janitors       wander the plaza sweeping
//   photographers  post at the exit walkway, camera flash on every launch
//   scientists     pace the plaza's far edge with their clipboards
//   marketers      pace the opposite stretch, waving flyers
//
// All positions are read live from stationRefs.walkerGeom each frame, so
// station rebuilds (queue upgrades, biome swaps) need no special handling.

const ROLE_ORDER = ['operators', 'entertainers', 'mechanics', 'janitors', 'photographers', 'scientists', 'marketers'];

function lambert(THREE, color) {
  return new THREE.MeshLambertMaterial({ color });
}

// One staff figure: uniform body, seeded head/hair/accessory, role prop.
function buildFigure(THREE, person) {
  const { look } = person;
  const g = new THREE.Group();
  const slim = look.build === 0;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(slim ? 0.115 : 0.135, slim ? 0.155 : 0.175, 0.46, 6),
    lambert(THREE, look.uniform),
  );
  body.position.y = 0.23;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), lambert(THREE, look.skin));
  head.position.y = 0.55;
  g.add(body, head);

  // hair styles: tiny shapes that read at park zoom
  const hairMat = lambert(THREE, look.hair);
  switch (look.hairStyle) {
    case 'short': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      h.position.y = 0.60; g.add(h); break;
    }
    case 'buzz': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.4), hairMat);
      h.position.y = 0.615; g.add(h); break;
    }
    case 'bun': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      h.position.y = 0.60;
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), hairMat);
      bun.position.set(0, 0.66, 0.09);
      g.add(h, bun); break;
    }
    case 'ponytail': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      h.position.y = 0.60;
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.16, 5), hairMat);
      tail.position.set(0, 0.52, 0.13); tail.rotation.x = 0.5;
      g.add(h, tail); break;
    }
    case 'curly': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.135, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
      h.position.y = 0.60; g.add(h); break;
    }
    case 'cap': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 8), lambert(THREE, look.uniform));
      brim.position.y = 0.635;
      const peak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), lambert(THREE, look.uniform));
      peak.position.set(0, 0.625, -0.14);
      g.add(brim, peak); break;
    }
    // 'bald': nothing
  }

  if (look.accessory === 'glasses') {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), lambert(THREE, 0x1c2533));
    gl.position.set(0, 0.56, -0.115);
    g.add(gl);
  } else if (look.accessory === 'earring') {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), lambert(THREE, 0xf2b134));
    e.position.set(0.125, 0.53, 0);
    g.add(e);
  } else if (look.accessory === 'headphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 5, 8, Math.PI), lambert(THREE, 0x1c2533));
    band.position.y = 0.56; band.rotation.z = Math.PI;
    g.add(band);
  }

  // role prop, held slightly to the side
  const prop = ({
    mechanics: () => {   // wrench
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), lambert(THREE, 0x8b93a1));
      p.position.set(0.2, 0.3, 0); return p;
    },
    janitors: () => {    // broom
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 5), lambert(THREE, 0x8a5a2b));
      stick.position.set(0.19, 0.3, 0);
      const brush = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), lambert(THREE, 0xc98a3a));
      brush.position.set(0.19, 0.06, 0);
      const p = new THREE.Group(); p.add(stick, brush); return p;
    },
    photographers: () => { // camera
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.07), lambert(THREE, 0x1c2533));
      p.position.set(0, 0.47, -0.16); return p;
    },
    scientists: () => {  // clipboard
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.015), lambert(THREE, 0xf5efdf));
      p.position.set(0.17, 0.35, -0.05); p.rotation.y = 0.3; return p;
    },
    marketers: () => {   // flyer stack
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.09), lambert(THREE, 0xfff6e8));
      p.position.set(0.18, 0.34, 0); return p;
    },
  })[person.role];
  if (prop) g.add(prop());

  // photographers: a hidden flash bulb that pops on launches
  if (person.role === 'photographers') {
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

// Deterministic per-person phase in [0,1) so crowds don't move in lockstep.
const phaseOf = person => ((person.seed % 997) / 997);

// The plaza rectangle + platform line, derived fresh from walkerGeom.
function zones(geom) {
  const zMin = Math.min(geom.qStart, geom.exitEndZ);
  const zMax = Math.max(geom.qStart, geom.exitEndZ);
  return {
    platY: geom.platH,
    platZ: geom.platSide + 0.55,
    platX0: -geom.platLen / 2 + 0.9,
    platX1: geom.platLen / 2 - 0.9,
    plazaY: geom.plazaTop,
    x0: -geom.platLen / 2 - 0.5,
    x1: geom.platLen / 2 + 0.5,
    z0: zMin + 0.5,
    // stop well short of the exit walkway's end — it runs to the pier lip and
    // a pacing lane there reads as staff strolling on water
    z1: zMax - 1.4,
    gateX: geom.gateX,
    exitX: geom.exitX,
  };
}

// Ping-pong along [a, b] at walking pace; returns { v, dir }.
function pingPong(a, b, t, speed) {
  const span = Math.max(0.001, Math.abs(b - a));
  const u = (t * speed / span) % 2;
  const k = u < 1 ? u : 2 - u;
  return { v: a + (b - a) * k, dir: (u < 1 ? 1 : -1) * Math.sign(b - a) };
}

export function createStaffActors({ THREE, scene, disposeGroup }) {
  const grp = new THREE.Group();
  scene.add(grp);
  let actors = [];          // { person, mesh, role, idx, roleCount }
  let signature = '';
  let lastDispatch = -Infinity;

  function rebuild(staffAgg) {
    const sig = ROLE_ORDER.map(role =>
      (staffAgg[role]?.people || []).map(p => p.seed).join(',')).join('|');
    if (sig === signature) return;
    signature = sig;
    disposeGroup?.(grp);
    grp.clear?.();
    while (grp.children.length) grp.remove(grp.children[0]);
    actors = [];
    for (const role of ROLE_ORDER) {
      const people = staffAgg[role]?.people || [];
      people.forEach((person, idx) => {
        const mesh = buildFigure(THREE, person);
        grp.add(mesh);
        actors.push({ person, mesh, role, idx, roleCount: people.length });
      });
    }
  }

  function update({ dt, time, geom, frame, installing = false }) {
    if (!geom || !actors.length) return;
    // walkerGeom coordinates are local to the station's frame group (it is
    // rotated/translated onto the station track segment) — mirror it.
    if (frame) {
      grp.position.copy(frame.position);
      grp.quaternion.copy(frame.quaternion);
    }
    const z = zones(geom);
    const sinceLaunch = time - lastDispatch;

    for (const a of actors) {
      const { mesh, person, role, idx, roleCount } = a;
      const ph = phaseOf(person);
      const t = time + ph * 40;                 // desynchronize everyone
      const bob = Math.abs(Math.sin(t * 5)) * 0.035;

      if (role === 'operators') {
        // posts spread along the platform, facing the track
        const frac = roleCount > 1 ? idx / (roleCount - 1) : 0.5;
        const x = z.platX0 + frac * (z.platX1 - z.platX0);
        // launch hop: a happy bounce for half a second after dispatch
        const hop = sinceLaunch < 0.5 ? Math.abs(Math.sin(sinceLaunch * Math.PI * 4)) * 0.14 : 0;
        mesh.position.set(x, z.platY + hop, z.platZ);
        mesh.rotation.y = Math.PI;              // face the berth
      } else if (role === 'entertainers') {
        // patrol in front of the queue gate; every few seconds, a spin show
        const lane = z.z0 + 0.18 * (z.z1 - z.z0) + (idx % 2) * 0.5;
        const { v: x, dir } = pingPong(z.gateX - 2.6, z.gateX + 2.6, t, 0.8);
        const showing = (t % 6) > 4.4;
        mesh.position.set(x, z.plazaY + (showing ? Math.abs(Math.sin(t * 9)) * 0.12 : bob), lane);
        mesh.rotation.y = showing ? t * 7 : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else if (role === 'mechanics') {
        if (installing) {
          // on the deck, hammering: sharp quick bob
          const frac = roleCount > 1 ? idx / (roleCount - 1) : 0.5;
          const x = z.platX1 - 0.6 - frac * 1.6;
          mesh.position.set(x, z.platY + Math.abs(Math.sin(t * 11)) * 0.06, z.platZ + 0.4);
          mesh.rotation.y = Math.PI;
        } else {
          // waiting by the exit side of the plaza
          const { v: x, dir } = pingPong(z.exitX - 0.8, z.exitX + 0.8, t, 0.35);
          mesh.position.set(x, z.plazaY + bob * 0.4, z.z0 + 0.9 + (idx % 3) * 0.5);
          mesh.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      } else if (role === 'janitors') {
        // wander the plaza on a per-person loop, broom-rocking as they go
        const cx = z.x0 + (0.15 + 0.7 * ph) * (z.x1 - z.x0);
        const cz = z.z0 + 0.35 * (z.z1 - z.z0) + (idx % 2) * 0.9;
        const x = cx + Math.sin(t * 0.45) * 1.6;
        const zz = cz + Math.cos(t * 0.3) * 0.8;
        mesh.position.set(x, z.plazaY + bob * 0.6, zz);
        mesh.rotation.y = Math.atan2(Math.cos(t * 0.45) * 1.6 * 0.45, -Math.sin(t * 0.3) * 0.8 * 0.3);
        mesh.rotation.z = Math.sin(t * 4) * 0.05;   // sweep sway
      } else if (role === 'photographers') {
        // posted at the exit walkway, angling for the launch shot
        mesh.position.set(z.exitX + 0.7 + (idx % 2) * 0.6, z.plazaY, z.z0 + 0.35);
        mesh.rotation.y = Math.PI + Math.sin(t * 0.8) * 0.25;
        const flash = mesh.getObjectByName('flash');
        if (flash) flash.visible = sinceLaunch >= 0 && sinceLaunch < 0.3;
      } else if (role === 'scientists') {
        // pacing the far edge, nose in clipboard
        const { v: x, dir } = pingPong(z.gateX - 3.2, z.gateX - 0.8, t, 0.45);
        mesh.position.set(x, z.plazaY + bob * 0.5, z.z1 - 0.4 - (idx % 2) * 0.55);
        mesh.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else if (role === 'marketers') {
        // working the exit-walkway stretch, flyers out (stay on the slab —
        // wandering past the pier corner reads as walking on water)
        const { v: x, dir } = pingPong(z.exitX - 1.2, z.exitX + 1.2, t, 0.55);
        mesh.position.set(x, z.plazaY + bob, z.z1 - 0.4 - (idx % 2) * 0.55);
        mesh.rotation.y = (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 3) * 0.15;
      }
    }
    // param intentionally unused beyond staleness: keep dt for future easing
    void dt;
  }

  return {
    rebuild,
    update,
    notifyDispatch: time => { lastDispatch = time; },
    count: () => actors.length,
    group: grp,
  };
}
