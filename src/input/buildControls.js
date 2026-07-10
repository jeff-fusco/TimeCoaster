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
  getPanLimit = () => 60,
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
  isBuildPointAllowed = () => true,
  onPlayClick = () => false,
  onPlayWheel = () => false,   // play-mode scroll hook (e.g. raising a decor ghost)
  getMaxHeight = () => 18,     // tallest buildable track (grows with Structures research)
}) {
  const { COST_PER_M, FEATURE_COST, FEATURE_REFUND, STATION_Y, MAX_BANK_DEG = 35 } = constants;
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
  const glowMat = new THREE.MeshBasicMaterial({
    color: colors.handleSel,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const dragGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), glowMat);
  dragGlow.rotation.x = -Math.PI / 2;
  dragGlow.position.y = 0.085;
  dragGlow.renderOrder = 4;
  dragGlow.visible = false;
  scene.add(dragGlow);
  const $ = id => document.getElementById(id);
  const costLabel = document.createElement('div');
  costLabel.className = 'build-delta hidden';
  document.body.appendChild(costLabel);
  const labelWorld = new THREE.Vector3();

  // ── undo / redo: each committed track edit snapshots the coaster (points,
  //    paid length, money) so it can be stepped back and forth. ────────────────
  const undoStack = [];
  const redoStack = [];
  const snapshot = () => ({
    ctrlPts: getCtrlPts().map(p => ({ ...p })),
    paidLength: getPaidLength(),
    money: state.money,
  });
  function updateUndoButtons() {
    const u = $('undoBtn');
    const r = $('redoBtn');
    if (u) u.disabled = undoStack.length === 0;
    if (r) r.disabled = redoStack.length === 0;
  }
  function recordHistory(before) {
    undoStack.push(before);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }
  function applyHistorySnapshot(s) {
    setCtrlPts(s.ctrlPts.map(p => ({ ...p })));
    setPaidLength(s.paidLength);
    state.money = s.money;
    rebuildAll(true);
    createHandles();
    selectHandle(-1);
    refreshHUD();
    updateBuildCost();
    saveGame();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    applyHistorySnapshot(undoStack.pop());
    updateUndoButtons();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    applyHistorySnapshot(redoStack.pop());
    updateUndoButtons();
  }
  function resetHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
    controls.selectedIdx = -1;
    controls.hoveredIdx = -1;
    controls.dragging = false;
    controls.dragSnapshot = null;
    controls.needsRebuild = false;
    stopPlacing();
    hideDragFeedback();
    updateUndoButtons();
    if (controls.active) {
      createHandles();
      selectHandle(-1);
    }
  }

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
  const clampHeight = y => Math.max(0.2, Math.min(getMaxHeight(), Math.round(y * 10) / 10));

  // Index at which to splice a new point so it lands in the nearest stretch of
  // track to the click (playtest feedback: adding was end-only, so reworking the
  // middle of a coaster meant shuffling every later pin). Segment 0→1 is the
  // station interior and is skipped; the wrap segment (last→station) maps to an
  // append, which matches the old behaviour when clicking past the end.
  function nearestInsertIndex(ctrlPts, x, z) {
    let best = ctrlPts.length;
    let bestD = Infinity;
    for (let i = 1; i < ctrlPts.length; i++) {
      const a = ctrlPts[i];
      const b = ctrlPts[(i + 1) % ctrlPts.length];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
      const dx = x - (a.x + abx * t);
      const dz = z - (a.z + abz * t);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i + 1; }
    }
    return best;
  }

  function hideCostLabel() {
    costLabel.classList.add('hidden');
  }

  function hideDragFeedback() {
    hideCostLabel();
    dragGlow.visible = false;
  }

  function updateDragGlow(point) {
    if (!point) {
      dragGlow.visible = false;
      return;
    }
    dragGlow.position.x = point.x;
    dragGlow.position.z = point.z;
    dragGlow.visible = true;
  }

  function updateDragCostLabel(point) {
    const path = getPath();
    if (!path || !point) {
      hideCostLabel();
      return;
    }

    const delta = path.len - getPaidLength();
    let text = '$0';
    let mode = 'neutral';
    if (delta > 0.05) {
      text = `-$${fmt(Math.ceil(delta * COST_PER_M))}`;
      mode = 'cost';
    } else if (delta < -0.05) {
      text = `+$${fmt(Math.floor(-delta * COST_PER_M * FEATURE_REFUND))}`;
      mode = 'refund';
    }

    labelWorld.set(point.x, point.y + 2.6, point.z).project(camera);
    const x = (labelWorld.x * 0.5 + 0.5) * host.clientWidth;
    const y = (-labelWorld.y * 0.5 + 0.5) * host.clientHeight;
    costLabel.textContent = text;
    costLabel.className = `build-delta ${mode}`;
    costLabel.style.left = `${x}px`;
    costLabel.style.top = `${y}px`;
  }

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
      button.title = locked ? 'Unlock in the R&D Lab' : '';
    });
  }

  function selectHandle(idx) {
    const ctrlPts = getCtrlPts();
    controls.selectedIdx = idx;
    const isStn = idx >= 0 && !!ctrlPts[idx]?.station;
    const canDel = idx >= 0 && !isStn && ctrlPts.filter(p => !p.station).length > 2;
    $('delBtn').disabled = !canDel;
    const showEdit = idx >= 0 && !isStn;
    $('heightRow').style.display = showEdit ? 'flex' : 'none';
    if ($('bankRow')) $('bankRow').style.display = showEdit ? 'flex' : 'none';
    if (idx >= 0) {
      $('heightVal').textContent = ctrlPts[idx].y.toFixed(1);
      $('pointInfo').textContent = isStn
        ? 'Station end - fixed; always flat and the length of the platform'
        : `Point ${idx + 1}/${ctrlPts.length} - drag to move; scroll for height; bank it; pick a segment below`;
    } else {
      $('pointInfo').textContent = 'Click a handle to select; drag to move; scroll to change height';
    }
    updateHandleColors();
    updateFeatureButtons();
    updateBankUI();
  }

  // Bank is stored on a control point as a fraction of maxBank in [-1, 1];
  // absent = automatic (physics-estimated) banking for that segment.
  function updateBankUI() {
    const el = $('bankVal');
    if (!el) return;
    const idx = controls.selectedIdx;
    const b = idx >= 0 ? getCtrlPts()[idx]?.bank : null;
    if (Number.isFinite(b)) {
      const deg = Math.round(b * MAX_BANK_DEG);
      el.textContent = deg === 0 ? '0°' : `${deg > 0 ? '+' : ''}${deg}°`;
    } else {
      el.textContent = 'Auto';
    }
  }

  function adjustBank(delta) {
    const ctrlPts = getCtrlPts();
    const idx = controls.selectedIdx;
    if (idx < 0 || ctrlPts[idx]?.station) return;
    const before = snapshot();
    const cur = Number.isFinite(ctrlPts[idx].bank) ? ctrlPts[idx].bank : 0;
    const next = Math.round(Math.max(-1, Math.min(1, cur + delta)) * 5) / 5;   // 0.2 (≈7°) steps
    if (Math.abs(next) < 1e-6) delete ctrlPts[idx].bank;
    else ctrlPts[idx].bank = next;
    // banking doesn't change track length, so it's free — just rebuild + record
    buildPath();
    buildTrackGeometry();
    recordHistory(before);
    updateBankUI();
    saveGame();
  }

  function resetBank() {
    const ctrlPts = getCtrlPts();
    const idx = controls.selectedIdx;
    if (idx < 0 || ctrlPts[idx]?.station || !Number.isFinite(ctrlPts[idx].bank)) return;
    const before = snapshot();
    delete ctrlPts[idx].bank;
    buildPath();
    buildTrackGeometry();
    recordHistory(before);
    updateBankUI();
    saveGame();
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
      // drag right → orbit right (playtest feedback: the old direction felt inverted)
      setAzimuth(getAzimuth() + dx * 0.01);
      setCamHeight(getCamHeight() - dy * 0.4); // setter clamps (zoom-aware angle floor)
    } else {
      const scale = getFrustum() / host.clientHeight;
      const azimuth = getAzimuth();
      const sr = new THREE.Vector3(Math.sin(azimuth), 0, -Math.cos(azimuth));
      const su = new THREE.Vector3(-Math.cos(azimuth), 0, -Math.sin(azimuth));
      camTarget.addScaledVector(sr, -dx * scale).addScaledVector(su, dy * scale);
      const panLimit = getPanLimit();
      camTarget.x = Math.max(-panLimit, Math.min(panLimit, camTarget.x));
      camTarget.z = Math.max(-panLimit, Math.min(panLimit, camTarget.z));
    }
  }

  function onMouseDown(e) {
    if (!controls.active || e.button !== 0) return;
    const ctrlPts = getCtrlPts();
    setMouseNDC(e);
    if (controls.placingMode) {
      const pos = raycastGround(1.5);
      if (!pos) return;
      if (!isBuildPointAllowed(pos.x, pos.z)) {
        showToast('Buy neighboring land before building there');
        return;
      }
      const insertIdx = controls.selectedIdx >= 0
        ? controls.selectedIdx + 1
        : nearestInsertIndex(ctrlPts, pos.x, pos.z);
      const beforeState = snapshot();
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
      recordHistory(beforeState);
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
        updateDragGlow(ctrlPts[hit]);
        updateDragCostLabel(ctrlPts[hit]);
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
      const nextX = snapVal(pos.x);
      const nextZ = snapVal(pos.z);
      if (!isBuildPointAllowed(nextX, nextZ)) {
        $('pointInfo').textContent = 'Buy neighboring land before moving this point there';
        return;
      }
      p.x = nextX;
      p.z = nextZ;
      if (p.station) p.y = STATION_Y;
      refreshHandlePositions();
      buildPath();
      updateDragGlow(p);
      updateDragCostLabel(p);
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
    hideDragFeedback();
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
    // snapshot = the pre-edit control points; capture the full pre-edit state
    // (money + paid length are still the old values here) for undo.
    const beforeState = { ctrlPts: snapshot.map(p => ({ ...p })), paidLength: getPaidLength(), money: state.money };
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
    recordHistory(beforeState);
    refreshHUD();
    updateBuildCost();
    return true;
  }

  function onWheel(e) {
    e.preventDefault();
    if (!controls.active && onPlayWheel(e.deltaY)) return;
    const ctrlPts = getCtrlPts();
    if (controls.active && controls.selectedIdx >= 0 && !ctrlPts[controls.selectedIdx]?.station) {
      const snap = ctrlPts.map(p => ({ ...p }));
      const step = e.shiftKey ? 0.1 : 0.5;
      const p = ctrlPts[controls.selectedIdx];
      p.y = clampHeight(p.y - Math.sign(e.deltaY) * step);
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
      $('pointInfo').textContent = 'Click the ground — the point joins the nearest stretch of track (charged per metre)';
    } else {
      stopPlacing();
    }
  }

  function onDeletePointClick() {
    const ctrlPts = getCtrlPts();
    const idx = controls.selectedIdx;
    if (idx < 0 || ctrlPts[idx]?.station || ctrlPts.filter(p => !p.station).length <= 2) return;
    const beforeState = snapshot();
    const wasFeat = ctrlPts[idx].seg;
    ctrlPts.splice(idx, 1);
    buildPath();
    if (FEATURE_COST[wasFeat]) state.money += Math.floor(FEATURE_COST[wasFeat] * FEATURE_REFUND);
    const delta = getPath().len - getPaidLength();
    if (delta < 0) state.money += Math.floor(-delta * COST_PER_M * FEATURE_REFUND);
    setPaidLength(getPath().len);
    recordHistory(beforeState);
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
    p.y = clampHeight(p.y + delta);
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
      showToast(`${next} is locked - research it in the R&D Lab first`);
      return;
    }
    const net = (FEATURE_COST[next] || 0) - Math.floor((FEATURE_COST[cur] || 0) * FEATURE_REFUND);
    if (net > state.money) {
      showToast(`Need $${fmt(net)} for ${next}`);
      return;
    }
    const beforeState = snapshot();
    ctrlPts[idx].seg = next;
    state.money -= net;
    rebuildAll(false);
    setPaidLength(getPath().len);
    recordHistory(beforeState);
    createHandles();
    selectHandle(idx);
    refreshHUD();
    updateBuildCost();
    saveGame();
    showToast(net >= 0 ? `${next} added - $${fmt(net)}` : `${next} - +$${fmt(-net)} refunded`);
  }

  // ── prefab track elements: curated point patterns inserted at the selection,
  //    charged per metre added. Each generator returns points as (f)orward /
  //    (l)ateral offsets from the anchor plus an absolute height and segment. ──
  const PREFABS = {
    liftHill: (y, maxH) => {
      const top = Math.min(maxH - 1, Math.max(y + 14, 18));
      return [
        { f: 4, l: 0, y: y + (top - y) * 0.45, seg: 'lift' },
        { f: 8, l: 0, y: top, seg: 'lift' },
        { f: 16, l: 0, y: 1.5, seg: 'plain' },
      ];
    },
    camelback: y => [
      { f: 4, l: 0, y: y + 9, seg: 'plain' },
      { f: 9, l: 0, y: 1.5, seg: 'plain' },
    ],
    airtimeHills: y => [
      { f: 3, l: 0, y: y + 4 }, { f: 6, l: 0, y: 1 },
      { f: 9, l: 0, y: y + 4 }, { f: 12, l: 0, y: 1 },
      { f: 15, l: 0, y: y + 3.5 },
    ],
    helix: y => {
      const R = 5;
      const out = [];
      for (let i = 1; i <= 4; i++) {
        const a = (i / 4) * Math.PI;   // a descending half-turn
        out.push({ f: Math.sin(a) * R, l: (1 - Math.cos(a)) * R, y: Math.max(1.2, y - i * 0.9), seg: 'plain' });
      }
      return out;
    },
  };
  const PREFAB_NAMES = { liftHill: 'Lift Hill', camelback: 'Camelback', airtimeHills: 'Airtime Hills', helix: 'Helix' };

  function insertPrefab(key) {
    if (!controls.active || !PREFABS[key]) return;
    const ctrlPts = getCtrlPts();
    let anchorIdx = controls.selectedIdx;
    if (anchorIdx < 0 || ctrlPts[anchorIdx]?.station) anchorIdx = ctrlPts.length - 1;
    const a = ctrlPts[anchorIdx];
    const nxt = ctrlPts[(anchorIdx + 1) % ctrlPts.length];
    let fx = nxt.x - a.x;
    let fz = nxt.z - a.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const lx = -fz, lz = fx;    // left-perpendicular in the ground plane
    const maxH = getMaxHeight();
    const pts = PREFABS[key](a.y, maxH).map(s => ({
      x: snapVal(a.x + fx * s.f + lx * (s.l || 0)),
      z: snapVal(a.z + fz * s.f + lz * (s.l || 0)),
      y: Math.max(0.4, Math.min(maxH, s.y)),
      seg: s.seg || 'plain',
    }));
    if (!pts.every(p => isBuildPointAllowed(p.x, p.z))) {
      showToast('Prefab needs more owned land ahead of the anchor');
      return;
    }
    const beforeState = snapshot();
    const lenBefore = getPath().len;
    ctrlPts.splice(anchorIdx + 1, 0, ...pts);
    buildPath();
    const cost = Math.ceil((getPath().len - lenBefore) * COST_PER_M);
    if (cost > state.money) {
      ctrlPts.splice(anchorIdx + 1, pts.length);
      rebuildAll(false);
      showToast(`Need $${fmt(cost)} for the ${PREFAB_NAMES[key]}`);
      return;
    }
    state.money -= cost;
    setPaidLength(getPath().len);
    recordHistory(beforeState);
    buildTrackGeometry();
    createHandles();
    selectHandle(anchorIdx + pts.length);
    refreshHUD();
    saveGame();
    showToast(`${PREFAB_NAMES[key]} added — $${fmt(cost)}`);
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
    const beforePath = getPath();
    const trainSnapshots = getTrains().map(train => ({
      train,
      frac: beforePath?.len ? train.s / beforePath.len : 0,
      prevFrac: beforePath?.len ? train.prevS / beforePath.len : 0,
    }));
    controls.active = false;
    controls.selectedIdx = -1;
    controls.hoveredIdx = -1;
    controls.dragging = false;
    hideDragFeedback();
    stopPlacing();
    disposeGroup(controls.handleGrp, true);
    controls.handles = [];
    $('buildPanel').classList.add('hidden');
    $('modeBadge').classList.remove('visible');
    $('buildToggle').classList.remove('active');
    $('shop').classList.remove('hidden');
    rebuildAll(true);
    const path = getPath();
    trainSnapshots.forEach(({ train, frac, prevFrac }) => {
      train.s = ((frac % 1) + 1) % 1 * path.len;
      train.prevS = ((prevFrac % 1) + 1) % 1 * path.len;
      train.L = path.len;
    });
    if (window.__TIME_COASTER_TEST__) {
      window.__TC3D_LAST_BUILD_EXIT__ = trainSnapshots.map(({ train }) => ({
        s: train.s,
        prevS: train.prevS,
        L: train.L,
        mode: train.mode,
        phase: train.phase,
        timer: train.timer,
      }));
    }
    refreshHUD();
    saveGame();
    showToast(`Track saved! Excitement ${path.stats.excitement}`);
  }

  function zoomBy(f) {
    setFrustum(getFrustum() * f); // setter clamps (zoom-out limit grows with the park)
    resize();
  }

  function rotateView(dir) {
    setAzimuth(getAzimuth() + dir * Math.PI / 4);
  }

  // keyboard pan, view-relative (px: +right/−left, py: +up/−down on screen)
  function panView(px, py) {
    const step = getFrustum() * 0.055;
    const azimuth = getAzimuth();
    const sr = new THREE.Vector3(Math.sin(azimuth), 0, -Math.cos(azimuth));
    const su = new THREE.Vector3(-Math.cos(azimuth), 0, -Math.sin(azimuth));
    camTarget.addScaledVector(sr, px * step).addScaledVector(su, py * step);
    const panLimit = getPanLimit();
    camTarget.x = Math.max(-panLimit, Math.min(panLimit, camTarget.x));
    camTarget.z = Math.max(-panLimit, Math.min(panLimit, camTarget.z));
  }

  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    // undo / redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) while building
    if ((e.ctrlKey || e.metaKey) && controls.active) {
      if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { redo(); e.preventDefault(); return; }
    }
    // with a track point selected, arrows adjust its height instead of panning
    if (controls.active && controls.selectedIdx >= 0) {
      if (e.key === 'ArrowUp') { adjustHeight(0.5); e.preventDefault(); return; }
      if (e.key === 'ArrowDown') { adjustHeight(-0.5); e.preventDefault(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { $('delBtn').click(); e.preventDefault(); return; }
    }
    if (k === 'q') rotateView(+1);
    if (k === 'e') rotateView(-1);
    if (k === 'w' || e.key === 'ArrowUp') panView(0, 1);
    if (k === 's' || e.key === 'ArrowDown') panView(0, -1);
    if (k === 'a' || e.key === 'ArrowLeft') panView(-1, 0);
    if (k === 'd' || e.key === 'ArrowRight') panView(1, 0);
    if (e.key === '=' || e.key === '+') zoomBy(0.8);
    if (e.key === '-') zoomBy(1.25);
    if (k === 'b') controls.active ? exitBuildMode() : enterBuildMode();
    if (e.key === 'Escape' && controls.active) {
      if (controls.placingMode) stopPlacing();
      else if (controls.selectedIdx >= 0) selectHandle(-1);
      else exitBuildMode();
      e.preventDefault();
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
  $('bankL')?.addEventListener('click', () => adjustBank(-0.2));
  $('bankR')?.addEventListener('click', () => adjustBank(0.2));
  $('bankAuto')?.addEventListener('click', resetBank);
  $('featRow').addEventListener('click', onFeatureClick);
  $('buildToggle').addEventListener('click', () => (controls.active ? exitBuildMode() : enterBuildMode()));
  $('undoBtn')?.addEventListener('click', undo);
  $('redoBtn')?.addEventListener('click', redo);
  $('prefabRow')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-prefab]');
    if (btn) insertPrefab(btn.dataset.prefab);
  });
  $('rotL')?.addEventListener('click', () => rotateView(+1));
  $('rotR')?.addEventListener('click', () => rotateView(-1));
  $('zoomIn')?.addEventListener('click', () => zoomBy(0.8));
  $('zoomOut')?.addEventListener('click', () => zoomBy(1.25));
  updateUndoButtons();

  return {
    state: controls,
    enterBuildMode,
    exitBuildMode,
    updateBuildCost,
    undo,
    redo,
    resetHistory,
    selectHandle,   // exposed for tests/tooling to drive the point selection
  };
}
