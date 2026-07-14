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

import { buildStaffFigure } from './staffFigure.js?v=20260703-13';

const ROLE_ORDER = ['operators', 'entertainers', 'mechanics', 'janitors', 'photographers', 'scientists', 'marketers'];

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
        const mesh = buildStaffFigure(THREE, person);
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
