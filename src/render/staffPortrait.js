// Staff portraits: bake the person's actual 3D figure into a head-and-shoulders
// bust image, so the roster card and the walking world actor are the same
// character. One tiny offscreen renderer, one render per unique seed, cached as
// a data URL. Deterministic and cheap — portraits don't animate, so a baked
// image beats a live canvas per card.
import { buildStaffFigure, disposeFigure } from './staffFigure.js?v=20260703-13';

export function createStaffPortraitStudio({ THREE, size = 128 } = {}) {
  const cache = new Map();
  let renderer = null, scene = null, camera = null, failed = false;

  function ensure() {
    if (renderer || failed) return;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(size, size);
      scene = new THREE.Scene();
      // ¾ bust framing. The figure faces -z, so the camera sits on -z, a touch
      // to the side and above eye level for a friendly portrait angle.
      camera = new THREE.PerspectiveCamera(30, 1, 0.05, 10);
      camera.position.set(0.30, 0.60, -0.92);
      camera.lookAt(0, 0.50, 0);
      // match the park's warm key + sky/ground hemisphere so skin tones agree
      scene.add(new THREE.HemisphereLight(0xfff4dc, 0x6fa05a, 0.95));
      const key = new THREE.DirectionalLight(0xfff1d0, 1.15);
      key.position.set(-1.2, 2.0, -1.9);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xdfeeff, 0.4);
      fill.position.set(1.6, 0.4, -0.6);
      scene.add(fill);
    } catch (_) {
      failed = true;
      renderer = null;
    }
  }

  // Returns a PNG data URL for this person's bust, or null (panel falls back to
  // the CSS avatar) if WebGL portraits aren't available.
  function portraitFor(person) {
    if (!person) return null;
    const id = `${person.role}:${person.seed}`;
    if (cache.has(id)) return cache.get(id);
    ensure();
    if (!renderer) { cache.set(id, null); return null; }
    let url = null;
    try {
      const fig = buildStaffFigure(THREE, person, { portrait: true });
      scene.add(fig);
      renderer.render(scene, camera);
      url = renderer.domElement.toDataURL('image/png');
      scene.remove(fig);
      disposeFigure(fig);
    } catch (_) {
      url = null;
    }
    cache.set(id, url);
    return url;
  }

  return { portraitFor };
}
