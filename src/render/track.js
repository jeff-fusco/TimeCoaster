export const DEFAULT_GAUGE = 1.15;

export function buildTrackGeometry({
  THREE,
  trackGrp,
  path,
  colors,
  disposeGroup,
  gauge = DEFAULT_GAUGE,
}) {
  disposeGroup(trackGrp);
  const { pos, up, right, tan, kind, N } = path;
  const railMat = new THREE.MeshStandardMaterial({ color: colors.rail, metalness: 0.6, roughness: 0.35 });
  const spineMat = new THREE.MeshStandardMaterial({ color: colors.track, roughness: 0.55 });
  const supMat = new THREE.MeshStandardMaterial({ color: colors.support, roughness: 0.6 });

  const centerCurve = new THREE.CatmullRomCurve3(pos.map(p => p.clone()), true);
  const spine = new THREE.Mesh(new THREE.TubeGeometry(centerCurve, N, 0.16, 7, true), spineMat);
  spine.castShadow = true;
  trackGrp.add(spine);

  const leftPts = [];
  const rightPts = [];
  for (let i = 0; i < N; i++) {
    leftPts.push(pos[i].clone().addScaledVector(right[i], gauge / 2));
    rightPts.push(pos[i].clone().addScaledVector(right[i], -gauge / 2));
  }
  for (const pts of [leftPts, rightPts]) {
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.09, 6, true), railMat);
    mesh.castShadow = true;
    trackGrp.add(mesh);
  }

  const tieGeo = new THREE.BoxGeometry(gauge + 0.5, 0.08, 0.18);
  const tieMats = {
    lift: new THREE.MeshLambertMaterial({ color: colors.tieLift }),
    brake: new THREE.MeshLambertMaterial({ color: colors.tieBrake }),
    station: new THREE.MeshLambertMaterial({ color: colors.tieStn }),
    plain: new THREE.MeshLambertMaterial({ color: colors.tiePlain }),
    loop: new THREE.MeshLambertMaterial({ color: colors.track }),
    corkscrew: new THREE.MeshLambertMaterial({ color: colors.track }),
    spiral: new THREE.MeshLambertMaterial({ color: colors.tieSpecial }),
    giantLoop: new THREE.MeshLambertMaterial({ color: colors.tieSpecial }),
    vertical: new THREE.MeshLambertMaterial({ color: colors.tieSpecial }),
    tunnel: new THREE.MeshLambertMaterial({ color: colors.tieTunnel }),
    teleporter: new THREE.MeshLambertMaterial({ color: colors.tieTeleporter }),
  };
  for (let i = 0; i < N; i += 4) {
    const mat = tieMats[kind[i]] || tieMats.plain;
    const tie = new THREE.Mesh(tieGeo, mat);
    tie.position.copy(pos[i]).addScaledVector(up[i], -0.22);
    tie.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right[i], up[i], tan[i]));
    tie.castShadow = true;
    trackGrp.add(tie);
  }

  for (let i = 0; i < N; i += 10) {
    if (kind[i] === 'loop' || kind[i] === 'corkscrew' || kind[i] === 'spiral' || kind[i] === 'giantLoop' || kind[i] === 'teleporter') continue;
    if (kind[i] === 'tunnel') continue;
    if (up[i].y < 0.45) continue;
    const h = pos[i].y;
    if (h < 0.9) continue;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 8), supMat);
    col.position.set(pos[i].x, h / 2 - 0.4, pos[i].z);
    col.castShadow = true;
    trackGrp.add(col);
  }

  const seenMarkers = new Set();
  for (let i = 0; i < N; i++) {
    const markerKind = kind[i];
    if (markerKind !== 'tunnel' && markerKind !== 'teleporter') continue;
    const prevKind = kind[(i - 1 + N) % N];
    const nextKind = kind[(i + 1) % N];
    if (prevKind === markerKind && nextKind === markerKind) continue;
    const key = `${markerKind}-${i}`;
    if (seenMarkers.has(key)) continue;
    seenMarkers.add(key);
    if (markerKind === 'teleporter') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.09, 8, 28),
        new THREE.MeshStandardMaterial({ color: colors.tieTeleporter, emissive: colors.tieTeleporter, emissiveIntensity: 0.35 }),
      );
      ring.position.copy(pos[i]);
      ring.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right[i], up[i], tan[i]));
      ring.castShadow = true;
      trackGrp.add(ring);
    } else {
      const portal = new THREE.Mesh(
        new THREE.BoxGeometry(gauge + 1.2, 1.6, 0.22),
        new THREE.MeshLambertMaterial({ color: colors.tieTunnel }),
      );
      portal.position.copy(pos[i]).addScaledVector(up[i], 0.45);
      portal.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right[i], up[i], tan[i]));
      portal.castShadow = true;
      trackGrp.add(portal);
    }
  }
}
