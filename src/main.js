import * as THREE from 'three';
import {
  applyResearchEffects as applyResearchEffectsModel,
  deriveEconomy,
  featureUnlocked as featureUnlockedModel,
  formatMoney,
  gradeFor,
  hasResearchKey,
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
import { buildTrackGeometry as renderTrackGeometry } from './render/track.js';
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
import { createScenery } from './render/scenery.js';
import { initBuildControls } from './input/buildControls.js';
import { createHudShop } from './ui/hudShop.js';
import {
  BLOCK_GAP,
  BUDGETS,
  CATS,
  COL,
  COST_PER_M,
  DEFAULT_CTRL,
  FEATURE_COST,
  FEATURE_REFUND,
  GUEST_COLS,
  HEADS,
  MPH,
  PHYS,
  RESEARCH,
  RESEARCH_ORDER,
  SHOP_ORDER,
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
const research = { budget:0, points:0, done:{} };
const hasResearch = k => hasResearchKey(research.done, k);
function featureUnlocked(feat){
  return featureUnlockedModel(feat, research.done);
}
function applyResearchEffects(){
  applyResearchEffectsModel(UPGRADES, research.done);
}

const state = { money:0, rides:0 };
const sim   = { queue:0 };     // live count of guests waiting in line
let stationRefs = { queueGuests:[], stopS:0.85, platLen:6 };
let ctrlPts = DEFAULT_CTRL.map(p=>({...p}));
let paidLength = 0;            // metres of track already paid for
let path = null;              // the live track path (built by buildPath)

// ── derived economy ─────────────────────────────────────────────────────────
function derived(){
  return deriveEconomy({
    upgrades: UPGRADES,
    pathStats: path ? path.stats : null,
    simQueue: sim.queue,
    researchDone: research.done,
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

(()=>{ // ground
  const g=new THREE.Mesh(new THREE.CylinderGeometry(46,46,1,64),new THREE.MeshLambertMaterial({color:COL.grass}));
  g.position.y=-0.5; g.receiveShadow=true; scene.add(g);
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(26,26,1.02,64),new THREE.MeshLambertMaterial({color:COL.grassHi}));
  pad.position.y=-0.49; pad.receiveShadow=true; scene.add(pad);
})();

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
    upgrades: UPGRADES,
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
const trackGrp=new THREE.Group(); scene.add(trackGrp);
const stationGrp=new THREE.Group(); scene.add(stationGrp);

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
    upgrades: UPGRADES,
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
const { clouds } = createScenery({ THREE, scene, colors: COL });

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
  onPlayClick: (x, y) => tryDispatch(x, y),
});
const bm=buildControls.state;
function updateBuildCost(){ buildControls.updateBuildCost(); }

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
    showToast('Train ready — click it to dispatch! (or research Auto Dispatch)');
  }
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

const clock=new THREE.Clock();
function tick(){
  const dt=Math.min(clock.getDelta(),0.05);
  // coalesced track rebuild from build-mode dragging (≤ once per frame)
  if(bm.needsRebuild){ buildPath(); buildTrackGeometry(); updateBuildCost(); bm.needsRebuild=false; }
  if(!bm.active&&path){
    const d=derived();
    // guests arrive at the queue (capped by capacity)
    sim.queue=Math.min(d.queueCap, sim.queue + d.arrivalRate*dt);
    // snack income scales with guests waiting, but a stand can only serve so many
    if(UPGRADES.snacks.level>0) state.money += Math.min(sim.queue,STN.snackCap)*UPGRADES.snacks.level*STN.snackPerGuest/60*dt;
    // research: funded budget drains money and earns research points (1 RP per $10)
    if(research.budget>0 && state.money>0){
      const spend=Math.min(state.money, research.budget/60*dt);
      state.money-=spend; research.points+=spend/10;
    }
    updateTrains(dt,d);
    updateQueueVisuals();
    hudAccum+=dt;
    if(hudAccum>=0.2){ refreshHUD(); hudAccum=0; }
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
    get budget(){ return research.budget; },
    set budget(next){ research.budget = next; },
    get points(){ return research.points; },
  },
  researchOrder: RESEARCH_ORDER,
  budgets: BUDGETS,
  derived,
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
  onSetResearchBudget: budget => { research.budget = budget; saveGame(); },
});
function buildShop(){ ui.buildShop(); }
function renderShop(){ ui.renderShop(); }
function refreshHUD(){ ui.refreshHUD(); }

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
  if(u.max!==undefined&&u.level>=u.max)return;
  const c=upgradeCost(u); if(state.money<c)return;
  state.money-=c; u.level+=1;
  if(key==='car'){
    // a longer station spreads the fixed endpoints and reflows the track for free.
    rebuildAll(true); paidLength=path.len; rebuildTrains();
    trains.forEach((tr,i)=>{tr.s=(i/trains.length)*path.len;tr.prevS=tr.s;tr.L=path.len;tr.mode='run';tr.phase='';tr.timer=0;});
  }
  else if(key==='seats'){rebuildTrains();}
  else if(key==='queue'){buildStationAndQueue();}
  else if(key==='snacks'){buildStationAndQueue();}
  else if(key==='train'){rebuildTrains();}
  else if(key==='speed'){buildPath();} // re-derive speed profile/stats
  refreshHUD(); saveGame();
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
let toastTimer;
function showToast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);}

// =========================================================================
//  SAVE / LOAD
// =========================================================================
function saveGame(){
  writeSave(localStorage, {
    state,
    sim,
    upgrades: UPGRADES,
    research,
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
  });
  if(restored.ctrlPts)ctrlPts=restored.ctrlPts;
  if(typeof restored.paidLength==='number')paidLength=restored.paidLength;
  if(typeof restored.frustum==='number')frustum=restored.frustum;
  if(typeof restored.azimuth==='number')azimuth=restored.azimuth;
  applyResearchEffects();   // e.g. raise train cap if Block Sections was researched
}
setInterval(saveGame,15000);

// =========================================================================
//  BOOT
// =========================================================================
loadGame();
buildShop();
rebuildAll(true);
if(!paidLength)paidLength=path.len;   // first run: starter track is free
rebuildTrains();
trains.forEach((tr,i)=>{tr.s=(i/trains.length)*path.len;tr.prevS=tr.s;tr.L=path.len;});
if(sim.queue<=0)sim.queue=Math.min(derived().queueCap, 8);   // start with a small crowd
updateQueueVisuals();
resize();
refreshHUD();
tick();
