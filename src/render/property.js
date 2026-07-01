export function buildPropertyGeometry({
  THREE,
  group,
  property,
  candidates = [],
  colors,
  disposeGroup,
}) {
  disposeGroup(group);

  const ownedMat = new THREE.MeshLambertMaterial({
    color: colors.grassHi,
    transparent: true,
    opacity: 0.78,
  });
  const candidateMat = new THREE.MeshLambertMaterial({
    color: colors.landCandidate,
    transparent: true,
    opacity: 0.18,
  });
  const lineMat = new THREE.LineBasicMaterial({ color: colors.landBorder });
  const candidateLineMat = new THREE.LineBasicMaterial({ color: colors.landCandidate });

  function addChunk(key, owned) {
    const [cx, cz] = key.split(',').map(Number);
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;
    const size = property.chunkSize;
    const x = cx * size;
    const z = cz * size;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), owned ? ownedMat.clone() : candidateMat.clone());
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, owned ? 0.012 : 0.01, z);
    plane.receiveShadow = true;
    group.add(plane);

    const half = size / 2;
    const y = owned ? 0.045 : 0.04;
    const points = [
      new THREE.Vector3(x - half, y, z - half),
      new THREE.Vector3(x + half, y, z - half),
      new THREE.Vector3(x + half, y, z - half),
      new THREE.Vector3(x + half, y, z + half),
      new THREE.Vector3(x + half, y, z + half),
      new THREE.Vector3(x - half, y, z + half),
      new THREE.Vector3(x - half, y, z + half),
      new THREE.Vector3(x - half, y, z - half),
    ];
    const border = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), owned ? lineMat.clone() : candidateLineMat.clone());
    group.add(border);
  }

  property.owned.forEach(key => addChunk(key, true));
  candidates.forEach(candidate => addChunk(candidate.key, false));
}
