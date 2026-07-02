import * as THREE from 'three';
import {
  applyResearchEffects as applyResearchEffectsModel,
  deriveEconomy,
  featureUnlocked as featureUnlockedModel,
  formatMoney,
  gradeFor,
  hasResearchKey,
  researchEfficiency,
  upgradeCost,
} from './systems/economy.js';
import {
  DEFAULT_STATION,
  buildPath as buildTrackPath,
  samplePathAt,
  speedAtPath,
} from './systems/path.js';
import {
  applySaveData,
  readSave,
  writeSave,
} from './systems/save.js';
import {
  createMaintenanceState,
  enqueueInstall,
  pendingCount,
  stepMaintenance,
} from './systems/maintenance.js';
import {
  buyLand,
  createPropertyState,
  expansionCandidates,
  normalizePropertyState,
  pointInOwnedLand,
} from './systems/property.js';
import { buildTrackGeometry as renderTrackGeometry } from './render/track.js';
import { buildPropertyGeometry as renderPropertyGeometry } from './render/property.js';
import {
  buildStationAndQueue as renderStationAndQueue,
  updateQueueVisuals as renderQueueVisuals,
} from './render/station.js';
import {
  CAR_LEN,
  placeCar as renderPlaceCar,
  rebuildTrains as renderRebuildTrains,
  setTrainGlow,
  setTrainOccupancy,
} from './render/train.js';
import { dispatchTrain, stepTrains } from './systems/trainSim.js';
import {
  canHire,
  canTrain,
  createStaffState,
  hire as hireStaff,
  hireCost,
  staffPowers as computeStaffPowers,
  train as trainStaff,
  trainCost,
} from './systems/staff.js';
import { buildChunkScenery, createClouds } from './render/scenery.js';
import {
  canPlaceDecoration,
  createDecorationsState,
  decorationCost,
  normalizeDecorations,
  placeDecoration,
} from './systems/decorations.js';
import { buildDecorationModel, buildDecorations as renderDecorations } from './render/decorations.js';
import { initBuildControls } from './input/buildControls.js';
import { createHudShop } from './ui/hudShop.js';
import { createStaffPanel } from './ui/staffPanel.js';
import { createLandPopup } from './ui/landPopup.js';
import {
  BLOCK_GAP,
  CATS,
  COL,
  COST_PER_M,
  DECOR,
  DECOR_ORDER,
  DEFAULT_CTRL,
  FEATURE_COST,
  FEATURE_REFUND,
  GUEST_COLS,
  HEADS,
  MAX_TRACK_HEIGHT,
  MPH,
  PHYS,
  RESEARCH,
  RESEARCH_ORDER,
  SHOP_ORDER,
  STAFF,
  STAFF_ORDER,
  STN,
  UPGRADES,
} from './config/gameData.js';

/* =========================================================================
   TIME COASTER 3D
   Arc-length track path · energy-based physics · paid track pieces
   chain lifts / loops / corkscrews · RCT-style excitement/intensity/nausea
   ========================================================================= */

const WORLD_UP = new THREE.Vector3(0,1,0);

// ── live game state ─────────────────────────────────────────────────────────
const research = { fundingPct:0, points:0, done:{} };
const hasResearch = k => hasResearchKey(research.done, k);
function featureUnlocked(feat){
  return featureUnlockedModel(feat, research.done);
}
function applyResearchEffects(){
  applyResearchEffectsModel(UPGRADES, research.done);
}

const state = { money:0, rides:0 };
const sim   = { queue:0 };     // live count of guests waiting in line
const staff = createStaffState();   // hired/trained staff (separate from upgrades)
const maintenance = createMaintenanceState(); // purchased car/train installs waiting on mechanics
const property = createPropertyState();
const decorations = createDecorationsState(); // placed decor pieces [{type,x,z}]
let stationRefs = { queueGuests:[], stopS:0.85, platLen:6 };
let ctrlPts = DEFAULT_CTRL.map(p=>({...p}));
let paidLength = 0;            // metres of track already paid for
let path = null;              // the live track path (built by buildPath)

// ── derived economy ─────────────────────────────────────────────────────────
function rideUpgrades(){
  return {
    ...UPGRADES,
    car: { ...UPGRADES.car, level: maintenance.installed.car },
    train: { ...UPGRADES.train, level: maintenance.installed.train },
  };
}

function staffPowerMap(){
  return computeStaffPowers(staff);
}

function derived(){
  return deriveEconomy({
    upgrades: rideUpgrades(),
    pathStats: path ? path.stats : null,
    simQueue: sim.queue,
    researchDone: research.done,
    staffPowers: staffPowerMap(),
    station: STN,
    fallbackMaxSpeed: PHYS.vMin,
  });
}


// =========================================================================
//  THREE.JS SETUP
// =========================================================================
const host=document.getElementById('scene');
const renderer=new THREE.WebGLRenderer({
  antialias:true,
  preserveDrawingBuffer: window.__TIME_COASTER_TEST__ === true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8fd0e8);
scene.fog=new THREE.Fog(0x9fd6ec,58,118);

const MIN_FRUSTUM=10, MAX_FRUSTUM=140;     // how far you can zoom in / way out
let frustum=30, azimuth=Math.PI*0.25, camHeight=52;
const camTarget=new THREE.Vector3(0,2.5,0);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,1200);
function placeCamera(){
  camera.position.set(camTarget.x+Math.cos(azimuth)*62,camTarget.y+camHeight,camTarget.z+Math.sin(azimuth)*62);
  camera.lookAt(camTarget);
  // keep haze proportional to zoom so a wide view isn't washed out
  scene.fog.near=30+frustum*0.9; scene.fog.far=110+frustum*3.0;
}
function resize(){
  const w=host.clientWidth,h=host.clientHeight,a=w/h;
  camera.left=-frustum*a/2; camera.right=frustum*a/2;
  camera.top=frustum/2; camera.bottom=-frustum/2;
  camera.updateProjectionMatrix(); renderer.setSize(w,h);
}
window.addEventListener('resize',resize);

scene.add(new THREE.HemisphereLight(0xfff4dc,0x6fa05a,0.85));
const sun=new THREE.DirectionalLight(0xfff1d0,1.0);
sun.position.set(-22,38,16); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
const sS=34; sun.shadow.camera.left=-sS;sun.shadow.camera.right=sS;sun.shadow.camera.top=sS;sun.shadow.camera.bottom=-sS;sun.shadow.camera.near=1;sun.shadow.camera.far=130;
scene.add(sun);

// Recursively free GPU resources (geometry + materials) for every descendant.
// keepGeometry=true skips geometry disposal — used for groups that reuse a
// shared geometry instance (e.g. build-mode handles) while still freeing materials.
function disposeGroup(grp, keepGeometry=false){
  while(grp.children.length){
    const c=grp.children[0];
    c.traverse(o=>{
      if(!keepGeometry && o.geometry) o.geometry.dispose();
      const m=o.material;
      if(m){ Array.isArray(m) ? m.forEach(x=>x.dispose()) : m.dispose(); }
    });
    grp.remove(c);
  }
}

// =========================================================================
//  TRACK PATH
// =========================================================================
const STATION = DEFAULT_STATION;

function buildPath(){
  path = buildTrackPath({
    ctrlPts,
    upgrades: rideUpgrades(),
    researchDone: research.done,
    physics: PHYS,
    Vector3: THREE.Vector3,
    worldUp: WORLD_UP,
    station: STATION,
  });
  return path;
}

function sampleAt(s){
  return samplePathAt(path, s, THREE.Vector3);
}

function speedAt(s){
  return speedAtPath(path, s);
}

// =========================================================================
//  TRACK / STATION RENDERING
// =========================================================================
const propertyGrp=new THREE.Group(); scene.add(propertyGrp);
const sceneryGrp=new THREE.Group(); scene.add(sceneryGrp);
const trackGrp=new THREE.Group(); scene.add(trackGrp);
const stationGrp=new THREE.Group(); scene.add(stationGrp);

function buildPropertyGeometry(){
  renderPropertyGeometry({
    THREE,
    group: propertyGrp,
    property,
    candidates: expansionCandidates(property),
    colors: COL,
    fmt: formatMoney,
    disposeGroup,
  });
}

function buildScenery(){
  buildChunkScenery({
    THREE,
    group: sceneryGrp,
    property,
    colors: COL,
    disposeGroup,
  });
}

const decorGrp=new THREE.Group(); scene.add(decorGrp);
function buildDecorGeometry(){
  renderDecorations({
    THREE,
    group: decorGrp,
    decorations,
    colors: COL,
    disposeGroup,
  });
}

function buildTrackGeometry(){
  renderTrackGeometry({
    THREE,
    trackGrp,
    path,
    colors: COL,
    disposeGroup,
  });
}

function buildStationAndQueue(){
  renderStationAndQueue({
    THREE,
    stationGrp,
    path,
    ctrlPts,
    colors: COL,
    upgrades: rideUpgrades(),
    derived,
    sampleAt,
    stationRefs,
    carLength: CAR_LEN,
    headColors: HEADS,
    guestColors: GUEST_COLS,
    worldUp: WORLD_UP,
    disposeGroup,
  });
}

function updateQueueVisuals(){
  renderQueueVisuals({ queue: sim.queue, stationRefs });
}

// =========================================================================
//  SCENERY
// =========================================================================
const { clouds } = createClouds({ THREE, scene, colors: COL });

// =========================================================================
//  TRAINS
// =========================================================================
const trainLayer=new THREE.Group(); scene.add(trainLayer);
let trains=[];

function rebuildTrains(){
  trains=renderRebuildTrains({
    THREE,
    trainLayer,
    trains,
    derived,
    path,
    colors: COL,
    headColors: HEADS,
    carLength: CAR_LEN,
  });
}

function placeCar(mesh,s){
  renderPlaceCar({ THREE, mesh, s, sampleAt });
}

// =========================================================================
//  REBUILD orchestration
// =========================================================================
function rebuildAll(includeStation=true){
  buildPath();
  buildTrackGeometry();
  if(includeStation)buildStationAndQueue();
}

// =========================================================================
//  BUILD / INPUT CONTROLS
// =========================================================================
const buildControls=initBuildControls({
  THREE,
  scene,
  renderer,
  camera,
  host,
  colors: COL,
  constants: {
    COST_PER_M,
    FEATURE_COST,
    FEATURE_REFUND,
    MAX_TRACK_HEIGHT,
    MIN_FRUSTUM,
    MAX_FRUSTUM,
    STATION_Y: STATION.y,
  },
  state,
  getCtrlPts: () => ctrlPts,
  setCtrlPts: next => { ctrlPts = next; },
  getPath: () => path,
  getPaidLength: () => paidLength,
  setPaidLength: next => { paidLength = next; },
  getTrains: () => trains,
  getFrustum: () => frustum,
  setFrustum: next => { frustum = next; },
  getAzimuth: () => azimuth,
  setAzimuth: next => { azimuth = next; },
  getCamHeight: () => camHeight,
  setCamHeight: next => { camHeight = next; },
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
  fmt: formatMoney,
  isBuildPointAllowed: (x, z) => pointInOwnedLand(property, x, z, 0.2),
  onPlayClick: (x, y) => tryPlaceDecor(x, y) || tryDispatch(x, y) || tryLandSign(x, y),
});
const bm=buildControls.state;
function updateBuildCost(){ buildControls.updateBuildCost(); }
if(window.__TIME_COASTER_TEST__){
  window.__TC3D_DEBUG__ = {
    trainState: () => trains.map(tr => ({ s: tr.s, prevS: tr.prevS, L: tr.L, mode: tr.mode, phase: tr.phase, timer: tr.timer })),
    pathLen: () => path?.len || 0,
    buildActive: () => bm.active,
    ownedLand: () => property.owned.length,
    decorCount: () => decorations.length,
    setFrustum: v => { frustum = v; resize(); placeCamera(); renderer.render(scene, camera); },
    // screen-space centres of the for-sale sign boards, for click tests
    landSigns: () => {
      const out = [];
      const v = new THREE.Vector3();
      propertyGrp.traverse(o => {
        if (!o.userData?.board) return;
        o.userData.board.getWorldPosition(v);
        v.project(camera);
        out.push({
          key: o.userData.landKey,
          x: (v.x * 0.5 + 0.5) * host.clientWidth,
          y: (-v.y * 0.5 + 0.5) * host.clientHeight,
        });
      });
      return out;
    },
  };
}

// =========================================================================
//  GAME LOOP
// =========================================================================
let coinThrottle=0, hudAccum=0, dispatchHinted=false;
const stationBusy=()=>trains.some(t=>t.mode==='dwell');
const dispatchDeposit=(tr,income)=>{
  if(coinThrottle<=0 && tr.cars[0]){ spawnCoin(tr.cars[0].position, income); coinThrottle=0.12; }
};

function updateTrains(dt,d){
  stepTrains({
    trains, dt, economy:d, pathLen:path.len, stopS:stationRefs.stopS, sim, state,
    speedAt, stationBusy,
    carLen:CAR_LEN, blockGap:BLOCK_GAP,
    autoDispatch:d.autoDispatch, dispatchDelay:d.dispatchDelay,
    placeTrain: tr => tr.cars.forEach((car,i)=>placeCar(car, tr.s-i*CAR_LEN)),
    setOccupancy: setTrainOccupancy,
    onDeposit: dispatchDeposit,
  });
  // ready trains glow (pulsing) until launched; hint the player once if manual
  const pulse=0.45+0.35*Math.sin(performance.now()*0.006);
  let anyReady=false;
  for(const tr of trains){
    const ready=tr.mode==='dwell'&&tr.phase==='ready';
    if(ready)anyReady=true;
    setTrainGlow(tr, ready, pulse);
  }
  if(anyReady && !d.autoDispatch && !dispatchHinted){
    dispatchHinted=true;
    showToast('Train ready — click it to dispatch! (or hire Ride Operators in Staff)');
  }
  updateDispatchButton(anyReady && !d.autoDispatch);
}

// Click a ready train or the station to launch it (manual dispatch).
const dispatchRay=new THREE.Raycaster();
const dispatchNDC=new THREE.Vector2();
function tryDispatch(clientX, clientY){
  const ready=trains.find(t=>t.mode==='dwell'&&t.phase==='ready');
  if(!ready) return false;
  const r=renderer.domElement.getBoundingClientRect();
  dispatchNDC.x=((clientX-r.left)/r.width)*2-1;
  dispatchNDC.y=-((clientY-r.top)/r.height)*2+1;
  dispatchRay.setFromCamera(dispatchNDC, camera);
  const hits=dispatchRay.intersectObjects([stationGrp, ready.group], true);
  if(!hits.length) return false;
  dispatchTrain(ready, { economy:derived(), state, onDeposit:dispatchDeposit });
  refreshHUD();
  return true;
}
function dispatchReadyTrain(){
  const ready=trains.find(t=>t.mode==='dwell'&&t.phase==='ready');
  if(!ready) return false;
  const launched=dispatchTrain(ready, { economy:derived(), state, onDeposit:dispatchDeposit });
  if(launched) refreshHUD();
  return launched;
}

// Click a FOR SALE sign (or its lot) to open the land purchase popup.
function tryLandSign(clientX, clientY){
  const r=renderer.domElement.getBoundingClientRect();
  dispatchNDC.x=((clientX-r.left)/r.width)*2-1;
  dispatchNDC.y=-((clientY-r.top)/r.height)*2+1;
  dispatchRay.setFromCamera(dispatchNDC, camera);
  const hits=dispatchRay.intersectObjects(propertyGrp.children, true);
  for(const hit of hits){
    let o=hit.object;
    while(o && !o.userData?.landKey) o=o.parent;
    if(o?.userData?.landKey){ landUI.open(o.userData.landKey); return true; }
  }
  return false;
}
function updateDispatchButton(show){
  const btn=$('dispatchBtn');
  if(!btn) return;
  btn.classList.toggle('visible', show);
  btn.disabled=!show;
}

// ── decoration placement (pick in the Decor tab, click owned land to drop) ──
const decorPlace = { type:null, ghost:null, valid:true };

function decorGroundPoint(clientX, clientY){
  const r=renderer.domElement.getBoundingClientRect();
  dispatchNDC.x=((clientX-r.left)/r.width)*2-1;
  dispatchNDC.y=-((clientY-r.top)/r.height)*2+1;
  dispatchRay.setFromCamera(dispatchNDC, camera);
  const tgt=new THREE.Vector3();
  return dispatchRay.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), -0.04), tgt) ? tgt : null;
}

function setGhostValidity(valid){
  decorPlace.valid=valid;
  decorPlace.ghost?.traverse(o=>{
    if(o.material?.emissive){ o.material.emissive.setHex(valid?0x2e8a45:0xb23b2c); o.material.emissiveIntensity=0.5; }
  });
}

function cancelDecorPlacement(){
  if(decorPlace.ghost){
    scene.remove(decorPlace.ghost);
    decorPlace.ghost.traverse(o=>{
      if(o.geometry) o.geometry.dispose();
      if(o.material) o.material.dispose();
    });
  }
  decorPlace.type=null;
  decorPlace.ghost=null;
}

function selectDecor(type){
  const toggleOff = decorPlace.type===type;
  cancelDecorPlacement();
  if(!toggleOff && DECOR[type]){
    decorPlace.type=type;
    const ghost=buildDecorationModel({ THREE, type, colors: COL });
    ghost.traverse(o=>{
      if(o.material){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=0.62; }
    });
    ghost.visible=false;
    decorPlace.ghost=ghost;
    scene.add(ghost);
    showToast(`Placing ${DECOR[type].name} — click owned land · Esc to stop`);
  }
  refreshHUD();
}

renderer.domElement.addEventListener('mousemove', e=>{
  if(!decorPlace.type || bm.active) return;
  const p=decorGroundPoint(e.clientX, e.clientY);
  if(!p){ if(decorPlace.ghost) decorPlace.ghost.visible=false; return; }
  decorPlace.ghost.visible=true;
  decorPlace.ghost.position.set(p.x, 0.04, p.z);
  const ok=canPlaceDecoration({ property, decorations, type:decorPlace.type, x:p.x, z:p.z })
    && state.money>=decorationCost(decorPlace.type);
  if(ok!==decorPlace.valid) setGhostValidity(ok);
});

window.addEventListener('keydown', e=>{
  if((e.key==='Escape'||e.key==='b'||e.key==='B') && decorPlace.type){ cancelDecorPlacement(); refreshHUD(); }
});
// entering build mode drops any in-progress placement
document.getElementById('buildToggle').addEventListener('click', ()=>{
  if(decorPlace.type){ cancelDecorPlacement(); refreshHUD(); }
});

// Placement consumes play-mode taps so a mis-click can't dispatch or buy land.
function tryPlaceDecor(clientX, clientY){
  if(!decorPlace.type || bm.active) return false;
  const p=decorGroundPoint(clientX, clientY);
  if(!p) return true;
  const type=decorPlace.type;
  const cost=placeDecoration({ decorations, property, state, type, x:p.x, z:p.z });
  if(cost>0){
    buildDecorGeometry();
    spawnCoinScreen(clientX, clientY, cost, true);
    refreshHUD(); saveGame();
    // keep placing until funds run out (RCT-style stamping)
    if(state.money<decorationCost(type)){ cancelDecorPlacement(); refreshHUD(); }
  } else {
    showToast(state.money<decorationCost(type) ? 'Not enough funds' : "Can't place there — needs open, owned land");
  }
  return true;
}

function maintenanceLabel(){
  const total = maintenance.queue.length + (maintenance.current ? 1 : 0);
  if(!total) return 'Idle';
  const job = maintenance.current || maintenance.queue[0];
  const name = job.type === 'car' ? 'Car' : 'Train';
  const pct = maintenance.current ? Math.floor((maintenance.current.progress / maintenance.current.duration) * 100) : 0;
  const extra = total > 1 ? ` +${total - 1}` : '';
  return `${name} ${pct}%${extra}`;
}

function updateMaintenanceHUD(){
  const el=$('work');
  if(el) el.textContent=maintenanceLabel();
}

function applyInstalledUpgrade(type){
  if(type==='car'){
    rebuildAll(true);
    paidLength=path.len;
    rebuildTrains();
    showToast('Mechanics installed a new car');
  } else if(type==='train'){
    rebuildTrains();
    showToast('Mechanics added a train');
  }
  refreshHUD();
  saveGame();
}

function updateMaintenance(dt){
  stepMaintenance(maintenance, dt, staffPowerMap().mechanics || 0, applyInstalledUpgrade);
}

const clock=new THREE.Clock();
function tick(){
  const dt=Math.min(clock.getDelta(),0.05);
  // coalesced track rebuild from build-mode dragging (≤ once per frame)
  if(bm.needsRebuild){ buildPath(); buildTrackGeometry(); updateBuildCost(); bm.needsRebuild=false; }
  if(!bm.active&&path){
    updateMaintenance(dt);
    const d=derived();
    // guests arrive at the queue (capped by capacity)
    sim.queue=Math.min(d.queueCap, sim.queue + d.arrivalRate*dt);
    // snack income scales with guests waiting (capped per stand), boosted by Janitors
    if(UPGRADES.snacks.level>0) state.money += Math.min(sim.queue,STN.snackCap)*UPGRADES.snacks.level*STN.snackPerGuest*d.janitorMult/60*dt;
    // research: drains a chosen % of projected income; high percentages are less efficient per dollar.
    if(research.fundingPct>0 && state.money>0){
      const fundingPct=Math.max(0,Math.min(100,research.fundingPct));
      const spendPerMin=Math.max(0,d.ratePerMin)*fundingPct/100;
      const spend=Math.min(state.money, spendPerMin/60*dt);
      state.money-=spend; research.points+=spend/10*researchEfficiency(fundingPct);
    }
    updateTrains(dt,d);
    updateQueueVisuals();
    hudAccum+=dt;
    if(hudAccum>=0.2){ refreshHUD(); hudAccum=0; }
  } else {
    updateDispatchButton(false);
  }
  clouds.forEach((c,i)=>{c.position.x+=(0.15+i*0.02)*dt;if(c.position.x>30)c.position.x=-30;});
  coinThrottle-=dt; placeCamera(); renderer.render(scene,camera); requestAnimationFrame(tick);
}

// =========================================================================
//  HUD / SHOP
// =========================================================================
const $=id=>document.getElementById(id);
const fmt=formatMoney;
const ui=createHudShop({
  document,
  categories: CATS,
  upgrades: UPGRADES,
  shopOrder: SHOP_ORDER,
  research: {
    projects: RESEARCH,
    get fundingPct(){ return research.fundingPct; },
    set fundingPct(next){ research.fundingPct = next; },
    get points(){ return research.points; },
  },
  researchOrder: RESEARCH_ORDER,
  derived,
  researchEfficiency,
  getMaintenance: () => maintenance,
  decor: DECOR,
  decorOrder: DECOR_ORDER,
  getSelectedDecor: () => decorPlace.type,
  onSelectDecor: selectDecor,
  getPath: () => path,
  getState: () => state,
  getSim: () => sim,
  hasResearch,
  gradeFor,
  upgradeCost,
  fmt,
  mph: MPH,
  onBuy: buy,
  onResearchProject: researchProject,
  onSetResearchFunding: pct => { research.fundingPct = pct; refreshHUD(); saveGame(); },
});
function buildShop(){ ui.buildShop(); }
function renderShop(){ ui.renderShop(); }
function refreshHUD(){ ui.refreshHUD(); updateMaintenanceHUD(); if(staffUI.isOpen()) staffUI.render(); if(landUI.isOpen()) landUI.render(); }

// ── staff management panel ──────────────────────────────────────────────────
const staffUI=createStaffPanel({
  document,
  staffConfig: STAFF,
  staffOrder: STAFF_ORDER,
  getStaff: () => staff,
  getState: () => state,
  costs: { hire: hireCost, train: trainCost, canHire, canTrain },
  onHire: role => {
    const spent=hireStaff(role, staff, state.money);
    if(spent>0){ state.money-=spent; spawnBankDelta(spent,true); refreshHUD(); saveGame(); showToast(`Hired a ${STAFF[role].name.replace(/s$/,'')}`); }
  },
  onTrain: role => {
    const spent=trainStaff(role, staff, state.money);
    if(spent>0){ state.money-=spent; spawnBankDelta(spent,true); refreshHUD(); saveGame(); showToast(`${STAFF[role].name} training improved`); }
  },
  fmt,
});
$('staffToggle').addEventListener('click', ()=>staffUI.toggle());

// ── land purchase popup (opened by clicking a FOR SALE sign in the scene) ───
const landUI=createLandPopup({
  document,
  getState: () => state,
  getOption: key => expansionCandidates(property).find(c => c.key === key) || null,
  chunkSize: () => property.chunkSize,
  onBuy: buyProperty,
  fmt,
});

function researchProject(key){
  const p=RESEARCH[key];
  if(hasResearch(key))return;
  if(research.points<p.rp){ showToast(`Need ${p.rp} RP - fund research to earn points`); return; }
  research.points-=p.rp; research.done[key]=true;
  applyResearchEffects();
  if(key==='launch') buildPath();              // free speed level changes the physics
  renderShop(); refreshHUD(); saveGame();
  showToast(`Researched: ${p.name}!`);
}
function buy(key){
  const u=UPGRADES[key];
  if(u.requiresResearch && !hasResearch(u.requiresResearch)){ showToast('Research Auto Dispatch first'); return; }
  if(u.max!==undefined&&u.level>=u.max)return;
  const c=upgradeCost(u); if(state.money<c)return;
  state.money-=c; u.level+=1;
  spawnBankDelta(c,true);
  if(key==='car'){
    enqueueInstall(maintenance, 'car');
    showToast('Car purchased - mechanics are installing it');
  }
  else if(key==='seats'){rebuildTrains();}
  else if(key==='queue'){buildStationAndQueue();}
  else if(key==='snacks'){buildStationAndQueue();}
  else if(key==='train'){
    enqueueInstall(maintenance, 'train');
    showToast('Train purchased - mechanics are preparing it');
  }
  else if(key==='speed'){buildPath();} // re-derive speed profile/stats
  refreshHUD(); saveGame();
}
function buyProperty(key){
  const cost=buyLand(property,key,state);
  if(!cost){ showToast('Need more money or adjacent land'); return; }
  spawnBankDelta(cost,true);
  landUI.close();
  buildPropertyGeometry();
  buildScenery();
  refreshHUD();
  saveGame();
  showToast(`Land purchased - $${fmt(cost)}`);
}
const _v=new THREE.Vector3();
function spawnCoin(worldPos,amount){
  _v.copy(worldPos).project(camera);
  spawnCoinScreen((_v.x*.5+.5)*host.clientWidth,(-_v.y*.5+.5)*host.clientHeight,amount,false);
}
function spawnCoinScreen(x,y,amount,spend){
  const el=document.createElement('div');el.className='pop'+(spend?' spend':'');
  el.textContent=(spend?'-$':'+$')+fmt(amount);el.style.left=x+'px';el.style.top=y+'px';
  document.body.appendChild(el);setTimeout(()=>el.remove(),1000);
}
function spawnBankDelta(amount,spend){
  const bank=document.querySelector('.bank .money') || $('money');
  if(!bank)return;
  const r=bank.getBoundingClientRect();
  const el=document.createElement('div');
  el.className='bank-delta'+(spend?' spend':' earn');
  el.textContent=(spend?'-$':'+$')+fmt(amount);
  el.style.left=(r.left+r.width/2)+'px';
  el.style.top=(r.bottom+8)+'px';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1050);
}
let toastTimer;
function showToast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);}
$('dispatchBtn').addEventListener('click', dispatchReadyTrain);

// =========================================================================
//  SAVE / LOAD
// =========================================================================
function saveGame(){
  writeSave(localStorage, {
    state,
    sim,
    upgrades: UPGRADES,
    research,
    staff,
    maintenance,
    property,
    decorations,
    ctrlPts,
    paidLength,
    frustum,
    azimuth,
  });
}
function loadGame(){
  const restored = applySaveData(readSave(localStorage), {
    state,
    sim,
    upgrades: UPGRADES,
    research,
    staff,
  });
  if(restored.maintenance){
    maintenance.installed.car=restored.maintenance.installed.car;
    maintenance.installed.train=restored.maintenance.installed.train;
    maintenance.queue=restored.maintenance.queue;
    maintenance.current=restored.maintenance.current;
  } else {
    maintenance.installed.car=UPGRADES.car.level;
    maintenance.installed.train=UPGRADES.train.level;
  }
  if(restored.property){
    const restoredProperty=normalizePropertyState(restored.property);
    property.chunkSize=restoredProperty.chunkSize;
    property.baseCost=restoredProperty.baseCost;
    property.growth=restoredProperty.growth;
    property.distanceScale=restoredProperty.distanceScale;
    property.owned=restoredProperty.owned;
  }
  if(restored.decorations){
    decorations.length=0;
    decorations.push(...normalizeDecorations(restored.decorations));
  }
  for(const type of ['car','train']){
    maintenance.installed[type]=Math.min(maintenance.installed[type], UPGRADES[type].level);
    let missing=UPGRADES[type].level-maintenance.installed[type]-pendingCount(maintenance,type);
    while(missing-->0) enqueueInstall(maintenance,type);
  }
  if(restored.ctrlPts)ctrlPts=restored.ctrlPts.map(point => ({
    ...point,
    y: point.station ? point.y : Math.max(0.2, Math.min(MAX_TRACK_HEIGHT, point.y)),
  }));
  if(typeof restored.paidLength==='number')paidLength=restored.paidLength;
  if(typeof restored.frustum==='number')frustum=Math.max(MIN_FRUSTUM, Math.min(MAX_FRUSTUM, restored.frustum));
  if(typeof restored.azimuth==='number')azimuth=restored.azimuth;
  applyResearchEffects();   // e.g. raise train cap if Block Sections was researched
}
setInterval(saveGame,15000);

// =========================================================================
//  BOOT
// =========================================================================
loadGame();
buildShop();
buildPropertyGeometry();
buildScenery();
buildDecorGeometry();
rebuildAll(true);
if(!paidLength)paidLength=path.len;   // first run: starter track is free
rebuildTrains();
trains.forEach((tr,i)=>{tr.s=(i/trains.length)*path.len;tr.prevS=tr.s;tr.L=path.len;});
if(sim.queue<=0)sim.queue=Math.min(derived().queueCap, 8);   // start with a small crowd
updateQueueVisuals();
resize();
refreshHUD();
tick();
