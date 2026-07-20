// Snowglobe trophies: bake each retired coaster into a miniature under glass.
// The globe holds the REAL track the player built — same path builder, same
// track geometry, same biome palette — shrunk to fit a snow-dusted dome on a
// wooden base. One offscreen render per monument, cached as a data URL, exactly
// like the staff portrait studio (see staffPortrait.js).
//
// This replaces the old standing world monuments: a shelf of globes in the
// Hall of Fame reads as meta-progression you can browse, without the sprawling
// grass slabs that grew with every long coaster.
import { PHYS } from '../config/gameData.js?v=20260703-13';
import { DEFAULT_STATION, buildPath as buildTrackPath } from '../systems/path.js?v=20260703-13';
import { biomeColors } from '../systems/biomes.js?v=20260703-13';
import { buildTrackGeometry } from './track.js?v=20260703-13';

// minimal upgrades stub so buildPath can read car/seats/speed levels
const GLOBE_UPGRADES = { car: { level: 0 }, seats: { level: 0 }, speed: { level: 0 } };
const GLOBE_R = 1.0;         // glass radius in studio units
const SNOWFLAKES = 26;

// A stable identity for caching — a monument is immutable once retired.
export function monumentKey(m) {
  return `${m?.name}:${m?.generation}:${m?.retiredAt}`;
}

function disposeGroup(group) {
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) m.dispose?.();
  });
  while (group.children.length) group.remove(group.children[0]);
}

export function createSnowglobeStudio({ THREE, size = 240, baseColors = {} } = {}) {
  const cache = new Map();
  let renderer = null, scene = null, camera = null, failed = false, mount = null;

  function ensure() {
    if (renderer || failed) return;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(size, size);
      scene = new THREE.Scene();
      // slightly-above eye level, looking into the dome
      // frame the whole trophy: dome (y -1..+1) plus the base below it
      camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
      camera.position.set(0, 0.62, 3.95);
      camera.lookAt(0, -0.12, 0);
      scene.add(new THREE.HemisphereLight(0xfff4dc, 0x7a8ea0, 1.0));
      const key = new THREE.DirectionalLight(0xfff1d0, 1.2);
      key.position.set(2.2, 3.4, 2.6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xcfe4ff, 0.55);
      rim.position.set(-2.4, 1.2, -1.8);
      scene.add(rim);
      mount = new THREE.Group();
      scene.add(mount);
    } catch (_) {
      failed = true;
      renderer = null;
    }
  }

  // Build the contents of one globe: shrunken track on a little land disc,
  // snow specks, glass dome, wooden base. Returns a group centred on origin.
  function buildGlobe(monument) {
    const colors = biomeColors(monument.biome || 'meadow', baseColors);
    const grp = new THREE.Group();

    // centre the saved control points, then build the real path
    const pts = monument.ctrlPts;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    const centred = pts.map(p => ({ ...p, x: p.x - cx, z: p.z - cz }));
    const station = { cx: DEFAULT_STATION.cx - cx, cz: DEFAULT_STATION.cz - cz, y: DEFAULT_STATION.y };
    const path = buildTrackPath({
      ctrlPts: centred.map(p => ({ ...p })),
      upgrades: GLOBE_UPGRADES,
      researchDone: {},
      physics: PHYS,
      Vector3: THREE.Vector3,
      worldUp: new THREE.Vector3(0, 1, 0),
      station,
    });

    // The dome is centred on the origin. The miniature stands on a ground plane
    // in its lower half, scaled to fit the sphere's width at that height.
    const GROUND_Y = -0.44;
    const groundR = Math.sqrt(Math.max(0.01, GLOBE_R * GLOBE_R - GROUND_Y * GROUND_Y));
    let maxR = 0.001, minY = Infinity, maxY = -Infinity;
    for (const p of path.pos) {
      maxR = Math.max(maxR, Math.hypot(p.x, p.z));
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const height = Math.max(0.001, maxY - minY);
    // fit the footprint inside the ground disc AND the headroom under the dome
    const fit = Math.min((groundR * 0.92) / maxR, (GLOBE_R - GROUND_Y - 0.14) / height);

    const inner = new THREE.Group();
    const trackGrp = new THREE.Group();
    buildTrackGeometry({ THREE, trackGrp, path, colors, disposeGroup });
    trackGrp.position.y = -minY;              // sit the lowest track point on the land
    inner.add(trackGrp);

    // land disc under the coaster, in the monument's biome palette
    const land = new THREE.Mesh(
      new THREE.CylinderGeometry(maxR * 1.2, maxR * 1.2, 0.4, 30),
      new THREE.MeshLambertMaterial({ color: colors.grassHi || 0x7fc057 }),
    );
    land.position.y = -0.2;
    inner.add(land);

    inner.scale.setScalar(fit);
    inner.position.y = GROUND_Y;
    grp.add(inner);

    // drifting snow inside the glass
    const snowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const snowGeo = new THREE.SphereGeometry(0.024, 5, 4);
    for (let i = 0; i < SNOWFLAKES; i++) {
      // deterministic golden-angle scatter, kept inside the sphere
      const a = (i * 2.399963) % (Math.PI * 2);
      const y = GROUND_Y + 0.1 + (GLOBE_R - GROUND_Y - 0.2) * ((i * 0.379) % 1);
      const shell = Math.sqrt(Math.max(0, GLOBE_R * GLOBE_R - y * y));
      const rr = shell * (0.3 + 0.6 * ((i * 0.618) % 1));
      const flake = new THREE.Mesh(snowGeo, snowMat);
      flake.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      grp.add(flake);
    }

    // ── glass dome: a tinted shell plus a bright crescent highlight, the
    //    cartoon cue that instantly reads as glass at thumbnail size ──
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R, 32, 24),
      new THREE.MeshPhongMaterial({
        color: 0xbfe0f5, transparent: true, opacity: 0.30,
        shininess: 100, specular: 0xffffff, depthWrite: false, side: THREE.FrontSide,
      }),
    );
    grp.add(glass);
    // rim: a marginally larger back-face shell darkens the silhouette edge
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R * 1.004, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0x9ec8e6, transparent: true, opacity: 0.28,
        depthWrite: false, side: THREE.BackSide,
      }),
    );
    grp.add(rim);
    // specular crescent on the upper-left, billboarded at the camera
    const shine = new THREE.Mesh(
      new THREE.CircleGeometry(GLOBE_R * 0.2, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    shine.position.set(-GLOBE_R * 0.42, GLOBE_R * 0.5, GLOBE_R * 0.74);
    shine.scale.set(0.62, 1, 1);
    shine.rotation.z = -0.5;
    grp.add(shine);

    // ── turned wooden base under the dome ──
    const woodMat = new THREE.MeshLambertMaterial({ color: colors.trunk || 0x8a5a2b });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(GLOBE_R * 0.66, GLOBE_R * 0.78, 0.20, 28), woodMat);
    collar.position.y = -GLOBE_R * 0.94;
    grp.add(collar);
    // brass name band around the collar
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(GLOBE_R * 0.795, GLOBE_R * 0.795, 0.11, 28),
      new THREE.MeshStandardMaterial({ color: 0xd9ab52, metalness: 0.7, roughness: 0.32 }),
    );
    band.position.y = -GLOBE_R * 1.06;
    grp.add(band);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(GLOBE_R * 0.82, GLOBE_R * 0.96, 0.22, 28), woodMat);
    plinth.position.y = -GLOBE_R * 1.20;
    grp.add(plinth);

    return grp;
  }

  // PNG data URL of this monument's globe, or null if WebGL isn't available
  // (the panel falls back to a text row).
  function globeFor(monument) {
    if (!monument || !Array.isArray(monument.ctrlPts) || monument.ctrlPts.length < 3) return null;
    const id = monumentKey(monument);
    if (cache.has(id)) return cache.get(id);
    ensure();
    if (!renderer) { cache.set(id, null); return null; }
    let url = null;
    try {
      const globe = buildGlobe(monument);
      mount.add(globe);
      renderer.render(scene, camera);
      url = renderer.domElement.toDataURL('image/png');
      mount.remove(globe);
      disposeGroup(globe);
    } catch (_) {
      url = null;
    }
    cache.set(id, url);
    return url;
  }

  return { globeFor };
}
