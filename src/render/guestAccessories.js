// Hats and balloons worn by guests who bought from the vendor carts.
// Both attach as children of a guest's head mesh, so they inherit the head's
// visibility (queue count, train occupancy) and motion for free.

export function addHat(THREE, head, color) {
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.18, 7),
    new THREE.MeshLambertMaterial({ color }),
  );
  hat.position.y = 0.16;
  head.add(hat);
  return hat;
}

export function addBalloon(THREE, head, color) {
  const balloon = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshLambertMaterial({ color }),
  );
  balloon.position.set(0.14, 0.52, 0.05);
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.42, 3),
    new THREE.MeshLambertMaterial({ color: 0xf5f0d7 }),
  );
  string.position.set(0.14, 0.26, 0.05);
  head.add(balloon, string);
  return balloon;
}
