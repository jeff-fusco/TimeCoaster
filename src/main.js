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
  setTrainOccupancy,
} from './render/train.js';
import { initBuildControls } from './input/buildControls.js';

const THREE = window.THREE;
if (!THREE) {
  throw new Error('Three.js must load before src/main.js');
}

/* =========================================================================
   TIME COASTER 3D
   Arc-length track path · energy-based physics · paid track pieces
   chain lifts / loops / corkscrews · RCT-style excitement/intensity/nausea
   ========================================================================= */

// ── palette ───────────────────────────────────────────────────────────────
const COL = {
  grass:0x6fb04a, grassHi:0x7fc057,
  track:0xe8533f, rail:0xf2f2f2, support:0xf5a623,
  car:0x2f80ed, carTrim:0xffffff,
  trunk:0x8a5a2b, leaf:0x4e9c46, leafHi:0x66b85c,
  cloud:0xffffff, platform:0xd8c79a, roof:0xe8533f,
  handleNorm:0xffcc00, handleStn:0xff6644, handleSel:0x6c47ff, handleHov:0xffffff,
  tieLift:0xf5a623, tieBrake:0x444a55, tieStn:0x9a7b4f, tiePlain:0x6b3f1f,
};
const HEADS = [0xffd29b,0xf2b27a,0xd99463,0x8a5a3a,0xf6e2c8];
const GUEST_COLS = [0xe85d75,0x4a8fe7,0x46b06a,0xf2b134,0xa855f7];
const WORLD_UP = new THREE.Vector3(0,1,0);

// ── physics tuning (gameish, not strictly real-world) ──────────────────────
const PHYS = {
  g:18, vMin:4.0, vCrest:3.4,
  liftSpeed:3.6, brakeSpeed:3.0, stationSpeed:2.6,
  friction:0.012,                 // gentle drag, keeps closed-loop stable
  maxBank:0.62,                   // auto-banking limit (rad)
};
const MPH = 2.7;                   // display multiplier units/s -> "mph"

// ── build economy ──────────────────────────────────────────────────────────
const COST_PER_M  = 8;
const FEATURE_COST = { plain:0, lift:120, brake:60, loop:900, corkscrew:1400 };
const FEATURE_REFUND = 0.6;

// ── default oval (points 0 & 1 station, locked Y) ──────────────────────────
const DEFAULT_CTRL = [
  {x: 2.85, y:0.7, z: 9.0, station:true, seg:'station'},  // 0 station entrance (auto-positioned)
  {x:-2.85, y:0.7, z: 9.0, station:true, seg:'plain'  },  // 1 station exit      (auto-positioned)
  {x:-7.5, y:0.9, z: 5.5, seg:'plain'},
  {x:-9.8, y:1.1, z: 0.0, seg:'plain'},
  {x:-7.5, y:0.9, z:-5.5, seg:'plain'},
  {x: 0.0, y:1.3, z:-9.3, seg:'plain'},
  {x: 7.5, y:0.9, z:-5.5, seg:'plain'},
  {x: 9.8, y:1.1, z: 0.0, seg:'plain'},
  {x: 7.5, y:0.9, z: 5.5, seg:'plain'},
];

// ── upgrades (cat = shop tab) ────────────────────────────────────────────────
const UPGRADES = {
  car:     {name:'Add a Car',      desc:'+4 seats · longer platform',     icon:'🚃', base:60,   growth:1.55, level:0,        cat:'ride'},
  seats:   {name:'Roomier Cars',   desc:'+2 seats per car',               icon:'💺', base:95,   growth:1.60, level:0, max:8, cat:'ride'},
  speed:   {name:'Faster Track',   desc:'More launch energy',             icon:'⚡', base:80,   growth:1.50, level:0,        cat:'ride'},
  train:   {name:'Add a Train',    desc:'Another train on track',         icon:'🎢', base:500,  growth:3.20, level:0, max:2, cat:'ride'},
  queue:   {name:'Bigger Queue',   desc:'+10 people can wait in line',    icon:'🚧', base:110,  growth:1.55, level:0, max:8, cat:'queue'},
  snacks:  {name:'Snack Stands',   desc:'+$3/min per waiting guest',      icon:'🍿', base:200,  growth:2.00, level:0, max:6, cat:'queue'},
  loading: {name:'Fast Boarding',  desc:'Quicker load & unload',          icon:'🏃', base:130,  growth:1.65, level:0, max:6, cat:'loading'},
  express: {name:'Express Lane',   desc:'+$5 bonus per rider',            icon:'🌟', base:350,  growth:1.80, level:0,        cat:'loading'},
  ticket:  {name:'Ticket Price',   desc:'+$1 per rider',                  icon:'🎟️', base:50,   growth:1.45, level:0,        cat:'marketing'},
  market:  {name:'Marketing',      desc:'More guests · excitement pays',  icon:'📣', base:160,  growth:1.75, level:0, max:6, cat:'marketing'},
  hype:    {name:'Theming & Hype', desc:'×1.12 to all earnings',          icon:'🎪', base:120,  growth:1.70, level:0,        cat:'marketing'},
};
const SHOP_ORDER = ['car','seats','speed','train','queue','snacks','loading','express','ticket','market','hype'];

const CATS = [
  {id:'ride',     icon:'🎢', name:'Ride'},
  {id:'queue',    icon:'🚧', name:'Queue'},
  {id:'loading',  icon:'🏃', name:'Board'},
  {id:'marketing',icon:'📣', name:'Promo'},
  {id:'research', icon:'🔬', name:'R&D'},
];
let activeTab='ride';

// ── research (constant money drain → research points → permanent unlocks) ─────
const RESEARCH = {
  brakes: {name:'Block Brakes',  desc:'Unlock 🛑 brake track',      icon:'🛑', rp:60 },
  loop:   {name:'Vertical Loop', desc:'Unlock 🔁 loop track',       icon:'🔁', rp:150},
  cork:   {name:'Corkscrew',     desc:'Unlock 🌀 corkscrew track',  icon:'🌀', rp:260},
  photo:  {name:'On-Ride Photo', desc:'+15% ride income',           icon:'📸', rp:180},
  launch: {name:'Launch System', desc:'+1 free Faster Track level',  icon:'🚀', rp:220},
  queue2: {name:'Switchback Pro',desc:'+30 max queue capacity',     icon:'🧱', rp:160},
  train3: {name:'Block Sections',desc:'Allow a 3rd train',          icon:'🚆', rp:340},
};
const RESEARCH_ORDER=['brakes','loop','cork','photo','launch','queue2','train3'];
const BUDGETS=[0,30,90,240];   // $/min research spend options
const research = { budget:0, points:0, done:{} };
const hasResearch = k => hasResearchKey(research.done, k);
function featureUnlocked(feat){
  return featureUnlockedModel(feat, research.done);
}
function applyResearchEffects(){
  applyResearchEffectsModel(UPGRADES, research.done);
}

// passenger / station tuning
const STN = {
  arrivalBase:0.6,     // guests/sec arriving at the queue (before scaling)
  baseUnload:1.8,      // seconds to unload a full train at loading lvl 0
  baseLoad:2.2,        // seconds to load
  snackPerGuest:3,     // $/min per waiting guest, per snack level
  snackCap:30,         // a snack stand can only serve so many of the line at once
  queueBase:10, queueStep:10,
};

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
const renderer=new THREE.WebGLRenderer({antialias:true});
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
const clouds=[];
(()=>{
  function tree(x,z,sc){
    const t=new THREE.Group();
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,1.1,6),new THREE.MeshLambertMaterial({color:COL.trunk}));tr.position.y=.55;
    const f1=new THREE.Mesh(new THREE.ConeGeometry(.95,1.5,8),new THREE.MeshLambertMaterial({color:COL.leaf}));f1.position.y=1.5;
    const f2=new THREE.Mesh(new THREE.ConeGeometry(.7,1.2,8),new THREE.MeshLambertMaterial({color:COL.leafHi}));f2.position.y=2.2;
    t.add(tr,f1,f2);t.position.set(x,0,z);t.scale.setScalar(sc);t.traverse(o=>o.castShadow=true);scene.add(t);
  }
  for(let i=0;i<16;i++){const a=(i/16)*Math.PI*2+0.3,r=19+Math.sin(i*3.1)*2.5;tree(Math.cos(a)*r,Math.sin(a)*r,0.8+(i%3)*.25);}
  tree(-15,-2,1.1);tree(15,-12,.9);tree(16,10,1);tree(-14,12,.95);
  function cloud(x,y,z){
    const c=new THREE.Group();const m=new THREE.MeshLambertMaterial({color:COL.cloud});
    [[0,0,0,1.4],[1.2,-.1,0,1],[-.8,-.1,0,1],[.4,.5,.3,.9]].forEach(([dx,dy,dz,r])=>{const p=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),m);p.position.set(dx,dy,dz);c.add(p);});
    c.position.set(x,y,z);scene.add(c);clouds.push(c);
  }
  cloud(-18,18,-14);cloud(16,20,-6);cloud(2,22,18);cloud(-22,17,8);
})();

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
});
const bm=buildControls.state;
function updateBuildCost(){ buildControls.updateBuildCost(); }

// =========================================================================
//  GAME LOOP
// =========================================================================
let coinThrottle=0, hudAccum=0;
const stationBusy=()=>trains.some(t=>t.mode==='dwell');

function updateTrains(dt,d){
  const L=path.len, sStop=stationRefs.stopS;
  for(const tr of trains){
    if(tr.mode==='run'){
      tr.prevS=tr.s;
      tr.s+=speedAt(tr.s)*dt;
      let wrapped=false;
      if(tr.s>=L){ tr.s-=L; tr.prevS-=L; wrapped=true; }
      // arrive at the platform: stop & begin unloading (unless another train is boarding)
      if(tr.prevS<sStop && tr.s>=sStop){
        if(!stationBusy()){
          tr.s=sStop; tr.mode='dwell'; tr.phase='unload'; tr.timer=0; tr.startBoard=tr.boarded;
        }
      }
    } else { // dwell: unload, then load from the queue
      tr.timer+=dt;
      if(tr.phase==='unload'){
        const ut=Math.max(0.15,d.unloadTime);
        const frac=Math.min(1,tr.timer/ut);
        tr.boarded=Math.round(tr.startBoard*(1-frac));
        if(tr.timer>=ut){
          tr.boarded=0; tr.phase='load'; tr.timer=0;
          // reserve guests from the line right away so two trains can't grab the same people
          tr.cycleBoard=Math.min(d.seatsCap, Math.floor(sim.queue));
          sim.queue=Math.max(0, sim.queue-tr.cycleBoard);
        }
      } else { // load
        const lt=Math.max(0.15,d.loadTime);
        const frac=Math.min(1,tr.timer/lt);
        tr.boarded=Math.round(tr.cycleBoard*frac);
        if(tr.timer>=lt){
          tr.boarded=tr.cycleBoard;
          const income=Math.round(tr.cycleBoard*d.perRider);
          if(income>0){
            state.money+=income; state.rides+=1;
            if(coinThrottle<=0&&tr.cars[0]){ spawnCoin(tr.cars[0].position,income); coinThrottle=0.12; }
          }
          tr.mode='run'; tr.phase=''; tr.timer=0; tr.prevS=tr.s;
        }
      }
    }
    tr.cars.forEach((car,i)=>placeCar(car, tr.s-i*CAR_LEN));
    setTrainOccupancy(tr, Math.round(tr.boarded));
  }
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
//  HUD
// =========================================================================
const $=id=>document.getElementById(id);
const fmt=formatMoney;

function buildShop(){
  const shop=$('shop');
  shop.innerHTML='';
  const tabs=document.createElement('div'); tabs.className='shop-tabs';
  CATS.forEach(c=>{
    const t=document.createElement('div'); t.className='tab'+(c.id===activeTab?' active':''); t.id='tab-'+c.id;
    t.innerHTML=`<div class="ti">${c.icon}</div><div class="tl">${c.name}</div>`;
    t.addEventListener('click',()=>{ activeTab=c.id; document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); renderShop(); });
    tabs.appendChild(t);
  });
  shop.appendChild(tabs);
  const body=document.createElement('div'); body.className='shop-body'; body.id='shopBody'; shop.appendChild(body);
  renderShop();
}

function renderShop(){
  const body=$('shopBody'); if(!body)return;
  body.innerHTML='';
  if(activeTab==='research'){ renderResearch(body); return; }
  SHOP_ORDER.filter(k=>UPGRADES[k].cat===activeTab).forEach(key=>{
    const u=UPGRADES[key];
    const el=document.createElement('div');el.className='ticket';el.id='up-'+key;
    el.innerHTML=`<div class="ic">${u.icon}</div><div class="body"><div class="nm">${u.name}</div><div class="ds">${u.desc}</div><div class="lv" id="lv-${key}"></div></div><div class="cost" id="cost-${key}"></div>`;
    el.addEventListener('click',()=>buy(key)); body.appendChild(el);
  });
  refreshHUD();
}

function renderResearch(body){
  // budget + points card
  const card=document.createElement('div'); card.className='rcard';
  const rpm=Math.round(research.budget/10);   // research points per minute
  card.innerHTML=`<div class="rh">Research Points</div>
    <div class="rpts" id="rpts">${Math.floor(research.points)} RP</div>
    <div class="rsub">Funding research drains <b>$${research.budget}/min</b> → <b>${rpm} RP/min</b></div>
    <div class="budgets" id="budgets"></div>`;
  body.appendChild(card);
  const bdiv=card.querySelector('#budgets');
  BUDGETS.forEach(b=>{
    const el=document.createElement('div'); el.className='budget'+(b===research.budget?' active':'');
    el.textContent = b===0?'Off':'$'+b;
    el.addEventListener('click',()=>{ research.budget=b; renderShop(); saveGame(); });
    bdiv.appendChild(el);
  });
  // project list
  RESEARCH_ORDER.forEach(key=>{
    const p=RESEARCH[key], done=hasResearch(key), ready=!done&&research.points>=p.rp;
    const el=document.createElement('div');
    el.className='proj'+(done?' done':ready?' ready':'');
    el.innerHTML=`<div class="ic">${p.icon}</div><div><div class="nm">${p.name}</div><div class="ds">${p.desc}</div></div>
      <div class="rp">${done?'✓ Done':p.rp+' RP'}</div>`;
    if(!done) el.addEventListener('click',()=>researchProject(key));
    body.appendChild(el);
  });
}

function researchProject(key){
  const p=RESEARCH[key];
  if(hasResearch(key))return;
  if(research.points<p.rp){ showToast(`Need ${p.rp} RP — fund research to earn points`); return; }
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
    // a longer station spreads the fixed endpoints → reflow the whole track (free; not a manual edit)
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
function refreshHUD(){
  const d=derived(); const st=path?path.stats:null;
  $('money').textContent=fmt(state.money);
  $('rate').textContent='$'+fmt(d.ratePerMin)+' / min';
  $('riders').textContent=d.seatsCap;
  $('perride').textContent='$'+fmt(d.perRideFull);
  $('queue').textContent=Math.round(sim.queue)+'/'+d.queueCap;
  if(st){
    $('topspeed').textContent=Math.round(st.maxSpeed*MPH);
    $('trackLen').textContent=st.length+'m';
    $('laptime').textContent=st.lapTime.toFixed(1)+'s';
    const exc=st.excitement,intn=st.intensity,nau=st.nausea;
    $('vExc').textContent=exc.toFixed(0); $('vInt').textContent=intn.toFixed(0); $('vNau').textContent=nau.toFixed(0);
    $('fExc').style.width=Math.min(100,exc)+'%';
    $('fInt').style.width=Math.min(100,intn)+'%';
    $('fNau').style.width=Math.min(100,nau)+'%';
    $('grade').textContent=gradeFor(exc,intn);
  }
  SHOP_ORDER.forEach(key=>{
    const el=$('up-'+key); if(!el)return;          // only the active tab's tickets exist
    const u=UPGRADES[key],lv=$('lv-'+key),costEl=$('cost-'+key);
    const maxed=(u.max!==undefined&&u.level>=u.max);
    if(maxed){el.className='ticket maxed';costEl.textContent='MAX';lv.textContent='Lv '+u.level;return;}
    const c=upgradeCost(u);costEl.textContent='$'+fmt(c);lv.textContent=u.level>0?'Lv '+u.level:'New';
    el.className='ticket '+(state.money>=c?'affordable':'locked');
  });
  const rp=$('rpts'); if(rp){
    rp.textContent=Math.floor(research.points)+' RP';
    // refresh ready-state highlight on project rows
    document.querySelectorAll('#shopBody .proj').forEach((el,i)=>{
      const key=RESEARCH_ORDER[i]; if(!key)return;
      if(hasResearch(key))return;
      el.classList.toggle('ready', research.points>=RESEARCH[key].rp);
    });
  }
}
const _v=new THREE.Vector3();
function spawnCoin(worldPos,amount){
  _v.copy(worldPos).project(camera);
  spawnCoinScreen((_v.x*.5+.5)*host.clientWidth,(-_v.y*.5+.5)*host.clientHeight,amount,false);
}
function spawnCoinScreen(x,y,amount,spend){
  const el=document.createElement('div');el.className='pop'+(spend?' spend':'');
  el.textContent=(spend?'−$':'+$')+fmt(amount);el.style.left=x+'px';el.style.top=y+'px';
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
