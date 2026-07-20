// Hats and balloons worn by guests who bought from the vendor carts.
// Both attach as children of a guest's head mesh, so they inherit the head's
// visibility (queue count, train occupancy) and motion for free.
// Sizes are deliberately chunky so the merch reads from a zoomed-out camera.

export const HAT_SIZE = { radius: 0.18, height: 0.36, yOffset: 0.23 };
export const BALLOON_SIZE = { radius: 0.2, x: 0.2, y: 0.72, z: 0.05, stringR: 0.016, stringLen: 0.56 };

export function addHat(THREE, head, color) {
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(HAT_SIZE.radius, HAT_SIZE.height, 7),
    new THREE.MeshLambertMaterial({ color }),
  );
  hat.position.y = HAT_SIZE.yOffset;
  head.add(hat);
  return hat;
}

export function addBalloon(THREE, head, color) {
  const B = BALLOON_SIZE;
  const balloon = new THREE.Mesh(
    new THREE.SphereGeometry(B.radius, 8, 6),
    new THREE.MeshLambertMaterial({ color }),
  );
  balloon.position.set(B.x, B.y, B.z);
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(B.stringR, B.stringR, B.stringLen, 3),
    new THREE.MeshLambertMaterial({ color: 0xf5f0d7 }),
  );
  string.position.set(B.x, B.y - B.radius - B.stringLen / 2 + 0.04, B.z);
  head.add(balloon, string);
  return balloon;
}
