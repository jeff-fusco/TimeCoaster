export function initBuildControls({
  THREE,
  scene,
  renderer,
  camera,
  host,
  colors,
  constants,
  state,
  getCtrlPts,
  setCtrlPts,
  getPath,
  getPaidLength,
  setPaidLength,
  getTrains,
  getFrustum,
  setFrustum,
  getAzimuth,
  setAzimuth,
  getCamHeight,
  setCamHeight,
  camTarget,
  resize,
  buildPath,
  buildTrackGeometry,
  rebuildAll,
  disposeGroup,
  featureUnlocked,
  refreshHUD,
  saveGame,
  showToast,
  spawnCoinScreen,
  fmt,
  onPlayClick = () => false,
}) {
  const { COST_PER_M, FEATURE_COST, FEATURE_REFUND, MIN_FRUSTUM, MAX_FRUSTUM, STATION_Y } = constants;
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();
  const controls = {
    active: false,
    handleGrp: new THREE.Group(),
    handles: [],
    selectedIdx: -1,
    hoveredIdx: -1,
    dragging: false,
    placingMode: false,
    snapGrid: false,
    dragSnapshot: null,
    needsRebuild: false,
  };
  scene.add(controls.handleGrp);

  const HG_NORM = new THREE.SphereGeometry(0.55, 12, 9);
  const HG_STN = new THREE.SphereGeometry(0.65, 12, 9);
  const $ = id => document.getElementById(id);

  function setMouseNDC(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouseNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouseNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function createHandles() {
    disposeGroup(controls.handleGrp, true);
    controls.handles = [];
    getCtrlPts().forEach((p, i) => {
      const isStn = !!p.station;
      const mat = new THREE.MeshStandardMaterial({
        color: isStn ? colors.handleStn : colors.handleNorm,
        roughness: 0.4,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(isStn ? HG_STN : HG_NORM, mat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.castShadow = true;
      controls.handleGrp.add(mesh);
      controls.handles.push({ mesh, idx: i });
    });
    updateHandleColors();
  }

  function updateHandleColors() {
    const ctrlPts = getCtrlPts();
    controls.handles.forEach(({ mesh, idx }) => {
      const isStn = !!ctrlPts[idx]?.station;
      const isSel = idx === controls.selectedIdx;
      const isHov = idx === controls.hoveredIdx;
      mesh.material.color.setHex(isSel ? colors.handleSel : isHov ? colors.handleHov : isStn ? colors.handleStn : colors.handleNorm);
      mesh.scale.setScalar(isSel ? 1.25 : isHov ? 1.1 : 1.0);
    });
  }

  function refreshHandlePositions() {
    const ctrlPts = getCtrlPts();
    controls.handles.forEach(({ mesh, idx }) => {
      const p = ctrlPts[idx];
      if (p) mesh.position.set(p.x, p.y, p.z);
    });
  }

  const snapVal = v => (controls.snapGrid ? Math.round(v * 2) / 2 : v);

  function updateFeatureButtons() {
    const ctrlPts = getCtrlPts();
    const idx = controls.selectedIdx;
    const row = $('featRow');
    if (idx < 0 || ctrlPts[idx]?.seg === 'station') {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    const cur = ctrlPts[idx].seg || 'plain';
    row.querySelectorAll('.bp-btn').forEach(button => {
      const feat = button.dataset.feat;
      const locked = !featureUnlocked(feat);
      button.classList.toggle('feat-active', feat === cur);
      button.classList.toggle('locked-feat', locked);
      button.title = locked ? 'Unlock in the R&D shop tab (Research)' : '';
    });
  }

  function selectHandle(idx) {
    const ctrlPts = getCtrlPts();
    controls.selectedIdx = idx;
    const isStn = idx >= 0 && !!ctrlPts[idx]?.station;
    const canDel = idx >= 0 && !isStn && ctrlPts.filter(p => !p.station).length > 2;
    $('delBtn').disabled = !canDel;
    $('heightRow').style.display = idx >= 0 && !isStn ? 'flex' : 'none';
    if (idx >= 0) {
      $('heightVal').textContent = ctrlPts[idx].y.toFixed(1);
      $('pointInfo').textContent = isStn
        ? 'Station end - fixed; always flat and the length of the platform'
        : `Point ${idx + 1}/${ctrlPts.length} - drag to move; scroll for height; pick a segment type below`;
    } else {
      $('pointInfo').textContent = 'Click a handle to select; drag to move; scroll to change height';
    }
    updateHandleColors();
    updateFeatureButtons();
  }

  function raycastHandles() {
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObjects(controls.handles.map(h => h.mesh));
    return hits.length ? controls.handles.findIndex(h => h.mesh === hits[0].object) : -1;
  }

  function raycastGround(yLevel = 0) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yLevel);
    raycaster.setFromCamera(mouseNDC, camera);
    const tgt = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, tgt);
    return tgt;
  }

  let dragMode = null;
  let dragX = 0;
  let dragY = 0;
  let downX = 0;
  let downY = 0;
  let clickCandidate = false; // a left press in play mode that may be a tap (dispatch)

  function onCameraMouseDown(e) {
    if (e.button === 2) dragMode = 'rotate';
    else if (e.button === 1) dragMode = 'pan';
    else if (e.button === 0 && !controls.active) dragMode = 'pan';
    else return;
    if (e.button !== 0) e.preventDefault();
    dragX = e.clientX;
    dragY = e.clientY;
    downX = e.clientX;
    downY = e.clientY;
    clickCandidate = e.button === 0 && !controls.active;
  }

  function onCameraMouseUp(e) {
    if (clickCandidate && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
      onPlayClick(e.clientX, e.clientY); // a tap (not a pan) → try to dispatch a ready train
    }
    dragMode = null;
    clickCandidate = false;
  }

  function onWindowMouseMove(e) {
    if (!dragMode) return;
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    dragX = e.clientX;
    dragY = e.clientY;
    if (dragMode === 'rotate') {
      setAzimuth(getAzimuth() - dx * 0.01);
      setCamHeight(Math.max(18, Math.min(132, getCamHeight() - dy * 0.4)));
    } else {
      const scale = getFrustum() / host.clientHeight;
      const azimuth = getAzimuth();
      const sr = new THREE.Vector3(Math.sin(azimuth), 0, -Math.cos(azimuth));
      const su = new THREE.Vector3(-Math.cos(azimuth), 0, -Math.sin(azimuth));
      camTarget.addScaledVector(sr, -dx * scale).addScaledVector(su, dy * scale);
      camTarget.x = Math.max(-60, Math.min(60, camTarget.x));
      camTarget.z = Math.max(-60, Math.min(60, camTarget.z));
    }
  }

  function onMouseDown(e) {
    if (!controls.active || e.button !== 0) return;
    const ctrlPts = getCtrlPts();
    setMouseNDC(e);
    if (controls.placingMode) {
      const pos = raycastGround(1.5);
      if (!pos) return;
      const insertIdx = controls.selectedIdx >= 0 ? controls.selectedIdx + 1 : ctrlPts.length;
      const lenBefore = getPath().len;
      ctrlPts.splice(insertIdx, 0, { x: snapVal(pos.x), y: 1.5, z: snapVal(pos.z), seg: 'plain' });
      buildPath();
      const addCost = Math.ceil((getPath().len - lenBefore) * COST_PER_M);
      if (addCost > state.money) {
        ctrlPts.splice(insertIdx, 1);
        rebuildAll(false);
        showToast(`Need $${fmt(addCost)} to extend the track`);
        stopPlacing();
        return;
      }
      state.money -= addCost;
      setPaidLength(getPath().len);
      spawnCoinScreen(e.clientX, e.clientY, addCost, true);
      buildTrackGeometry();
      createHandles();
      selectHandle(insertIdx);
      stopPlacing();
      refreshHUD();
      saveGame();
      showToast(`+${(getPath().len - lenBefore).toFixed(1)}m of track - $${fmt(addCost)}`);
      return;
    }

    const hit = raycastHandles();
    if (hit >= 0) {
      selectHandle(hit);
      if (!ctrlPts[hit]?.station) {
        controls.dragging = true;
        controls.dragSnapshot = ctrlPts.map(p => ({ ...p }));
      }
      e.stopPropagation();
    } else {
      selectHandle(-1);
    }
  }

  function onMouseMove(e) {
    if (!controls.active) return;
    const ctrlPts = getCtrlPts();
    setMouseNDC(e);
    if (controls.dragging && controls.selectedIdx >= 0) {
      const p = ctrlPts[controls.selectedIdx];
      const pos = raycastGround(p.y);
      if (!pos) return;
      p.x = snapVal(pos.x);
      p.z = snapVal(pos.z);
      if (p.station) p.y = STATION_Y;
      refreshHandlePositions();
      controls.needsRebuild = true;
      $('pointInfo').textContent = `Point ${controls.selectedIdx + 1}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
      return;
    }
    const hit = raycastHandles();
    if (hit !== controls.hoveredIdx) {
      controls.hoveredIdx = hit;
      updateHandleColors();
    }
  }

  function onMouseUp() {
    if (!controls.dragging) return;
    controls.dragging = false;
    if (controls.needsRebuild) {
      buildPath();
      buildTrackGeometry();
      controls.needsRebuild = false;
    }
    commitTrackEdit(controls.dragSnapshot);
    selectHandle(controls.selectedIdx);
    saveGame();
  }

  function commitTrackEdit(snapshot) {
    const delta = getPath().len - getPaidLength();
    if (delta > 0.05) {
      const cost = Math.ceil(delta * COST_PER_M);
      if (cost > state.money) {
        setCtrlPts(snapshot.map(p => ({ ...p })));
        buildPath();
        buildTrackGeometry();
        refreshHandlePositions();
        showToast(`Not enough funds - needed $${fmt(cost)} for ${delta.toFixed(1)}m`);
        refreshHUD();
        updateBuildCost();
        return false;
      }
      state.money -= cost;
      setPaidLength(getPath().len);
      showToast(`Track +${delta.toFixed(1)}m - $${fmt(cost)}`);
    } else if (delta < -0.05) {
      const refund = Math.floor(-delta * COST_PER_M * FEATURE_REFUND);
      state.money += refund;
      setPaidLength(getPath().len);
      if (refund > 0) showToast(`Track -${(-delta).toFixed(1)}m - +$${fmt(refund)} refunded`);
    }
    refreshHUD();
    updateBuildCost();
    return true;
  }

  function onWheel(e) {
    e.preventDefault();
    const ctrlPts = getCtrlPts();
    if (controls.active && controls.selectedIdx >= 0 && !ctrlPts[controls.selectedIdx]?.station) {
      const snap = ctrlPts.map(p => ({ ...p }));
      const step = e.shiftKey ? 0.1 : 0.5;
      const p = ctrlPts[controls.selectedIdx];
      p.y = Math.max(0.2, Math.round((p.y - Math.sign(e.deltaY) * step) * 10) / 10);
      refreshHandlePositions();
      buildPath();
      buildTrackGeometry();
      commitTrackEdit(snap);
      $('heightVal').textContent = ctrlPts[controls.selectedIdx].y.toFixed(1);
    } else {
      zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
    }
  }

  function stopPlacing() {
    controls.placingMode = false;
    const button = $('addBtn');
    button.textContent = '+ Add Point';
    button.classList.remove('placing');
  }

  function onAddPointClick() {
    controls.placingMode = !controls.placingMode;
    const button = $('addBtn');
    if (controls.placingMode) {
      button.textContent = 'Cancel';
      button.classList.add('placing');
      $('pointInfo').textContent = 'Click the ground to place a new point (charged per metre added)';
    } else {
      stopPlacing();
    }
  }

  function onDeletePointClick() {
    const ctrlPts = getCtrlPts();
    const idx = controls.selectedIdx;
    if (idx < 0 || ctrlPts[idx]?.station || ctrlPts.filter(p => !p.station).length <= 2) return;
    const wasFeat = ctrlPts[idx].seg;
    ctrlPts.splice(idx, 1);
    buildPath();
    if (FEATURE_COST[wasFeat]) state.money += Math.floor(FEATURE_COST[wasFeat] * FEATURE_REFUND);
    const delta = getPath().len - getPaidLength();
    if (delta < 0) state.money += Math.floor(-delta * COST_PER_M * FEATURE_REFUND);
    setPaidLength(getPath().len);
    rebuildAll(false);
    createHandles();
    selectHandle(-1);
    refreshHUD();
    saveGame();
    showToast('Point removed - partial refund');
  }

  function onSnapClick() {
    controls.snapGrid = !controls.snapGrid;
    const button = $('snapBtn');
    button.textContent = controls.snapGrid ? 'Grid On' : 'Grid Off';
    button.style.background = controls.snapGrid ? 'var(--good)' : '';
    button.style.color = controls.snapGrid ? '#fff' : '';
  }

  function adjustHeight(delta) {
    const ctrlPts = getCtrlPts();
    if (controls.selectedIdx < 0 || ctrlPts[controls.selectedIdx]?.station) return;
    const snap = ctrlPts.map(p => ({ ...p }));
    const p = ctrlPts[controls.selectedIdx];
    p.y = Math.max(0.2, Math.round((p.y + delta) * 10) / 10);
    refreshHandlePositions();
    buildPath();
    buildTrackGeometry();
    commitTrackEdit(snap);
    $('heightVal').textContent = ctrlPts[controls.selectedIdx].y.toFixed(1);
  }

  function onFeatureClick(e) {
    const button = e.target.closest('.bp-btn');
    if (!button) return;
    const ctrlPts = getCtrlPts();
    const idx = controls.selectedIdx;
    if (idx < 0 || ctrlPts[idx]?.station) return;
    const next = button.dataset.feat;
    const cur = ctrlPts[idx].seg || 'plain';
    if (next === cur) return;
    if (!featureUnlocked(next)) {
      showToast(`${next} is locked - research it in the R&D shop tab first`);
      return;
    }
    const net = (FEATURE_COST[next] || 0) - Math.floor((FEATURE_COST[cur] || 0) * FEATURE_REFUND);
    if (net > state.money) {
      showToast(`Need $${fmt(net)} for ${next}`);
      return;
    }
    ctrlPts[idx].seg = next;
    state.money -= net;
    rebuildAll(false);
    setPaidLength(getPath().len);
    createHandles();
    selectHandle(idx);
    refreshHUD();
    updateBuildCost();
    saveGame();
    showToast(net >= 0 ? `${next} added - $${fmt(net)}` : `${next} - +$${fmt(-net)} refunded`);
  }

  function updateBuildCost() {
    const path = getPath();
    if (!path) return;
    $('buildCost').innerHTML =
      `Track: <b>${path.stats.length}m</b> - EXC <b>${path.stats.excitement}</b> / INT <b>${path.stats.intensity}</b> - build <b>$${COST_PER_M}/m</b>`;
  }

  function enterBuildMode() {
    controls.active = true;
    controls.selectedIdx = -1;
    stopPlacing();
    createHandles();
    $('buildPanel').classList.remove('hidden');
    $('modeBadge').classList.add('visible');
    $('buildToggle').classList.add('active');
    $('shop').classList.add('hidden');
    selectHandle(-1);
    updateBuildCost();
    showToast('Build Mode - yellow: track; red: station; pay per metre and per feature');
  }

  function exitBuildMode() {
    controls.active = false;
    controls.selectedIdx = -1;
    controls.hoveredIdx = -1;
    controls.dragging = false;
    stopPlacing();
    disposeGroup(controls.handleGrp, true);
    controls.handles = [];
    $('buildPanel').classList.add('hidden');
    $('modeBadge').classList.remove('visible');
    $('buildToggle').classList.remove('active');
    $('shop').classList.remove('hidden');
    rebuildAll(true);
    const path = getPath();
    const trains = getTrains();
    trains.forEach((train, i) => {
      train.s = (i / trains.length) * path.len;
      train.prevS = train.s;
      train.L = path.len;
      train.mode = 'run';
      train.phase = '';
      train.timer = 0;
    });
    refreshHUD();
    saveGame();
    showToast(`Track saved! Excitement ${path.stats.excitement}`);
  }

  function zoomBy(f) {
    setFrustum(Math.min(MAX_FRUSTUM, Math.max(MIN_FRUSTUM, getFrustum() * f)));
    resize();
  }

  function rotateView(dir) {
    setAzimuth(getAzimuth() + dir * Math.PI / 4);
  }

  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'q' || k === 'a' || e.key === 'ArrowLeft') rotateView(+1);
    if (k === 'e' || k === 'd' || e.key === 'ArrowRight') rotateView(-1);
    if (e.key === '=' || e.key === '+') zoomBy(0.8);
    if (e.key === '-') zoomBy(1.25);
    if (e.key === 'b' || e.key === 'B') controls.active ? exitBuildMode() : enterBuildMode();
    if (e.key === 'Escape' && controls.active) {
      if (controls.placingMode) stopPlacing();
      else if (controls.selectedIdx >= 0) selectHandle(-1);
      else exitBuildMode();
    }
    if (controls.active && controls.selectedIdx >= 0) {
      if (e.key === 'ArrowUp') {
        adjustHeight(0.5);
        e.preventDefault();
      }
      if (e.key === 'ArrowDown') {
        adjustHeight(-0.5);
        e.preventDefault();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        $('delBtn').click();
        e.preventDefault();
      }
    }
  }

  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('mousedown', onCameraMouseDown);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onCameraMouseUp);
  window.addEventListener('blur', () => { dragMode = null; clickCandidate = false; });
  window.addEventListener('keydown', onKeyDown);

  $('addBtn').addEventListener('click', onAddPointClick);
  $('delBtn').addEventListener('click', onDeletePointClick);
  $('snapBtn').addEventListener('click', onSnapClick);
  $('hUp').addEventListener('click', () => adjustHeight(0.5));
  $('hDown').addEventListener('click', () => adjustHeight(-0.5));
  $('featRow').addEventListener('click', onFeatureClick);
  $('buildToggle').addEventListener('click', () => (controls.active ? exitBuildMode() : enterBuildMode()));
  $('rotL').addEventListener('click', () => rotateView(+1));
  $('rotR').addEventListener('click', () => rotateView(-1));
  $('zoomIn').addEventListener('click', () => zoomBy(0.8));
  $('zoomOut').addEventListener('click', () => zoomBy(1.25));

  return {
    state: controls,
    enterBuildMode,
    exitBuildMode,
    updateBuildCost,
  };
}
