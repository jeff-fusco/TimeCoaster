import * as THREE from 'three';
import {
  applyResearchEffects as applyResearchEffectsModel,
  deriveEconomy,
  featureUnlocked as featureUnlockedModel,
  formatMoney,
  gradeFor,
  hasResearchKey,
  maxTrackHeight,
  upgradeCost,
} from './systems/economy.js?v=20260703-13';
import { drainSales, pickConcessionSale } from './systems/concessions.js?v=20260703-13';
import { stepCrowdFlows } from './systems/crowd.js?v=20260703-13';
import {
  createResearchState,
  clampResearchFundingPct,
  fundingEfficiency,
  hasScientist,
  normalizeResearchState,
  pathProjectState,
  researchFundingCap,
  stepResearch,
} from './systems/research.js?v=20260703-13';
import {
  DEFAULT_STATION,
  buildPath as buildTrackPath,
  samplePathAt,
  speedAtPath,
} from './systems/path.js?v=20260703-13';
import {
  applySaveData,
  readSave,
  SAVE_KEYS,
  writeSave,
} from './systems/save.js?v=20260703-13';
import {
  createMaintenanceState,
  enqueueInstall,
  pendingCount,
  stepMaintenance,
} from './systems/maintenance.js?v=20260703-13';
import {
  buyLand,
  chunkBounds,
  createPropertyState,
  expansionCandidates,
  normalizePropertyState,
  pointInOwnedLand,
} from './systems/property.js?v=20260703-13';
import {
  buyPerk as legacyBuyPerk,
  canRetire,
  createLegacyState,
  createMonument,
  fameFor,
  monumentIncome,
  monumentNearMissBonus,
  openingGrant,
  qualityScore,
  renownMult,
  totalLegacyIncome,
} from './systems/legacy.js?v=20260703-13';
import { buildMonuments, stepMonuments } from './render/monuments.js?v=20260703-13';
import { createLegacyPanel } from './ui/legacyPanel.js?v=20260703-13';
import {
  BIOMES,
  BIOME_ORDER,
  biomeColors,
  biomeFx,
  biomeMatchTypes,
  biomePhysics,
  biomeOf,
  biomeUnlocked,
  normalizeBiome,
} from './systems/biomes.js?v=20260703-13';
import { buildTrackGeometry as renderTrackGeometry } from './render/track.js?v=20260703-13';
import { buildPropertyGeometry as renderPropertyGeometry } from './render/property.js?v=20260703-13';
import {
  buildStationAndQueue as renderStationAndQueue,
  spawnStationWalkers,
  spawnPlazaVignette,
  updateQueueVisuals as renderQueueVisuals,
  updatePlazaVisuals,
} from './render/station.js?v=20260703-13';
import {
  CAR_LEN,
  placeCar as renderPlaceCar,
  rebuildTrains as renderRebuildTrains,
  setTrainGlow,
  setTrainOccupancy,
} from './render/train.js?v=20260703-13';
import { dispatchTrain, stepTrains } from './systems/trainSim.js?v=20260703-13';
import { createIncomeTracker } from './systems/incomeTracker.js?v=20260703-13';
import { OFFLINE_EFFICIENCY, computeOfflineProgress, formatDuration } from './systems/offline.js?v=20260703-13';
import { createAudio } from './systems/audio.js?v=20260703-13';
import {
  CHANNELS,
  MAX_CHANNEL_WEIGHT,
  channelEffects,
  channelMultiplier,
  channelSaturation,
  channelUnlocked,
  clampMarketingPct,
  coverageBonus,
  createMarketingState,
  decayDemand,
  hasMarketer,
  marketingBudgetCap,
  normalizeMarketingState,
  rebalanceChannelWeights,
  steadyStateDemand,
  stepMarketing,
} from './systems/marketing.js?v=20260703-13';
import { staffStatus } from './systems/staff.js?v=20260703-13';
import {
  aggregateStaff,
  canTrainPerson,
  createRoster,
  generatePerson,
  rollApplicants,
  signingFee,
  totalPayroll,
  payrollScale,
  TRAITS,
  marketingTraitFx,
  offlineEfficiencyBonus,
  researchEffMult,
  showstopperArrivalMult,
  trainingFee,
} from './systems/staffPeople.js?v=20260703-13';
import { buildChunkScenery, createClouds } from './render/scenery.js?v=20260703-13';
import { createStaffActors } from './render/staffActors.js?v=20260703-13';
import { createStaffPortraitStudio } from './render/staffPortrait.js?v=20260703-13';
import {
  canPlaceDecoration,
  createDecorationsState,
  decorationCost,
  normalizeDecorations,
  placeDecoration,
  removeDecoration,
  themingBonus,
} from './systems/decorations.js?v=20260703-13';
import { buildDecorationModel, buildDecorations as renderDecorations } from './render/decorations.js?v=20260703-13';
import { initBuildControls } from './input/buildControls.js?v=20260703-13';
import { createBalancePanel } from './ui/balancePanel.js?v=20260703-13';
import { createHudShop } from './ui/hudShop.js?v=20260703-13';
import { createResearchPanel } from './ui/researchPanel.js?v=20260703-13';
import { createStaffPanel } from './ui/staffPanel.js?v=20260703-13';
import { createLandPopup } from './ui/landPopup.js?v=20260703-13';
import { createMarketingPanel } from './ui/marketingPanel.js?v=20260703-13';
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
  HEIGHT_TIERS,
  MAX_TRACK_HEIGHT,
  MPH,
  PHYS,
  RESEARCH,
  RESEARCH_PATHS,
  SHOP_ORDER,
  STAFF,
  STAFF_ORDER,
  STN,
  UPGRADES,
} from './config/gameData.js?v=20260703-13';

/* =========================================================================
   TIME COASTER 3D
   Arc-length track path · energy-based physics · paid track pieces
   chain lifts / loops / corkscrews · RCT-style excitement/intensity/nausea
   ========================================================================= */

const WORLD_UP = new THREE.Vector3(0,1,0);
const TEST = window.__TIME_COASTER_TEST__ === true;

// procedural sound; stays silent until unlocked by the splash's Play gesture
const audio = createAudio(typeof localStorage !== 'undefined' ? localStorage : null);

// ── live game state ─────────────────────────────────────────────────────────
const research = createResearchState(RESEARCH_PATHS);
const hasResearch = k => hasResearchKey(research.done, k);
function featureUnlocked(feat){
  return featureUnlockedModel(feat, research.done);
}
function applyResearchEffects(){
  applyResearchEffectsModel(UPGRADES, research.done);
}
// tallest buildable track — grows with the Structures research path
function currentMaxHeight(){
  return maxTrackHeight(research.done, HEIGHT_TIERS, MAX_TRACK_HEIGHT);
}

const state = { money:0, rides:0 };
// Live guest stocks: `plaza` mills around the forecourt shopping; `queue` waits
// in line. Guests flow plaza → queue (stepCrowdFlows) → ride → back to plaza.
const sim   = { queue:0, plaza:0 };
// Staff v2: `roster` (individuals: {seed, level}) is the source of truth; the
// economy reads `staff`, the aggregate view, kept in sync via syncStaff().
let roster = createRoster();
let staff = aggregateStaff(roster);
let staffActors = null;    // world actors — created after the scene exists
function syncStaff(){
  // legacy.generation prices in tenure (+2%/generation served); legacy is
  // declared below but always exists by the time anything mutates the roster
  staff = aggregateStaff(roster, { generation: legacy.generation });
  staffActors?.rebuild(staff);   // hires/fires walk in and out of the park
}

// ── job board + roster operations ────────────────────────────────────────────
// The board shows a rotating set of applicants per role (fresh faces on a timer
// or a paid reroll). Applicants are ephemeral — only hired people (the roster)
// persist. Every op mutates `roster`, resyncs `staff`, and returns $ spent.
const JOB_BOARD_SIZE = 3;
const JOB_REFRESH_MS = 3 * 60 * 1000;       // a new set of faces every few minutes
const jobBoard = {};                        // role -> { applicants, seedBase, refreshAt }
const randSeed = () => (Math.random() * 0xffffffff) >>> 0;
let lastStaffTouched = null;                // the person behind the latest hire/train/fire (for toasts)

function rollBoard(role){
  // Fame draws talent: famous parks see better applicants on the board
  return { applicants: rollApplicants(role, JOB_BOARD_SIZE, randSeed(), { fame: legacy.fame }), refreshAt: Date.now() + JOB_REFRESH_MS };
}
function ensureBoard(role){
  let b = jobBoard[role];
  if(!b || Date.now() >= b.refreshAt) b = jobBoard[role] = rollBoard(role);
  return b;
}
function rerollBoard(role){ jobBoard[role] = rollBoard(role); return jobBoard[role]; }
function rerollCost(role){
  return Math.max(35, Math.floor((STAFF[role]?.hireBase || 250) * 0.18));
}
function paidRerollBoard(role){
  const cost=rerollCost(role);
  if(state.money<cost) return 0;
  state.money-=cost;
  rerollBoard(role);
  return cost;
}

// A role is full once its roster hits the config's hireMax (Staff v2 dropped
// this cap in the rewrite — re-enforce it so hiring stays a bounded choice).
function rosterFull(role){
  return roster[role].length >= (STAFF[role]?.hireMax ?? Infinity);
}
function hirePerson(role, index){
  if(rosterFull(role)) return 0;
  const b = ensureBoard(role);
  const person = b.applicants[index];
  if(!person) return 0;
  const fee = signingFee(person);
  if(state.money < fee) return 0;
  // a Veteran shows up already seasoned; `gen` starts the tenure clock
  const startLevel = person.traits.includes('veteran') ? Math.min(person.potential, 2) : 0;
  roster[role].push({ seed: person.seed, level: startLevel, gen: legacy.generation });
  b.applicants.splice(index, 1);
  state.money -= fee;
  lastStaffTouched = person;
  syncStaff();
  return fee;
}
function trainPerson(role, index){
  const m = roster[role][index];
  if(!m) return 0;
  const person = generatePerson(role, m.seed);
  if(!canTrainPerson(person, m.level)) return 0;
  const fee = trainingFee(person, m.level);
  if(state.money < fee) return 0;
  m.level += 1;
  state.money -= fee;
  lastStaffTouched = person;
  syncStaff();
  return fee;
}
function firePerson(role, index){
  const m = roster[role]?.[index];
  if(!m) return false;
  lastStaffTouched = generatePerson(role, m.seed);
  roster[role].splice(index, 1);
  syncStaff();
  return true;
}
// old-panel adapters (stage ③ replaces the panel with per-person controls):
// hire the cheapest applicant, train whichever member is furthest from cap.
function cheapestApplicantIndex(role){
  const b = ensureBoard(role);
  let bestIdx = -1, bestFee = Infinity;
  b.applicants.forEach((p, i) => { const fee = signingFee(p); if(fee < bestFee){ bestFee = fee; bestIdx = i; } });
  return bestIdx;
}
function lowestTrainableIndex(role){
  let bestIdx = -1, bestLvl = Infinity;
  roster[role].forEach((m, i) => {
    const p = generatePerson(role, m.seed);
    if(m.level < p.potential && m.level < bestLvl){ bestLvl = m.level; bestIdx = i; }
  });
  return bestIdx;
}
const maintenance = createMaintenanceState(); // purchased car/train installs waiting on mechanics
const property = createPropertyState();
const decorations = createDecorationsState(); // placed decor pieces [{type,x,z}]
const marketing = createMarketingState(); // campaign budget + channel portfolio
const legacy = createLegacyState();  // fame, generation, perks, retired-coaster monuments
let coasterName = '';         // player-chosen name for the active coaster (set at birth)
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const escAttr = escHtml;
let monumentExtent = 0;       // how far the hall-of-fame row reaches (for camera limits)
let activeBiome = 'meadow';   // biome of the current coaster (chosen at retirement)
let biomeCol = { ...COL };    // palette for scene geometry, repainted per biome
let themeBonus = 0;            // excitement from decor placed near the track
let monumentBonus = 0;         // excitement/craft from near-missing retired coaster track
let stationRefs = { queueGuests:[], stopS:0.85, platLen:6 };
let decorBlockers = [];
let queueVisualSignature = '';
let ctrlPts = DEFAULT_CTRL.map(p=>({...p}));
let paidLength = 0;            // metres of track already paid for
let path = null;              // the live track path (built by buildPath)

function resetActiveProperty(){
  Object.assign(property, createPropertyState());
}

// ── derived economy ─────────────────────────────────────────────────────────
function excitementBonus(){
  return themeBonus + monumentBonus;
}

// The channel portfolio's four hooks: arrivals, ticket premium (scaled by the
// active coaster's excitement — the build is the ad), vendor spend, and
// monument income. Recomputed per call so it always sees live demand.
function marketingFx(){
  return channelEffects(marketing, { excitement: path ? path.stats.excitement + excitementBonus() : 0 });
}

function rideUpgrades(){
  return {
    ...UPGRADES,
    car: { ...UPGRADES.car, level: maintenance.installed.car },
    train: { ...UPGRADES.train, level: maintenance.installed.train },
  };
}


function derived(){
  const mfx = marketingFx();
  return deriveEconomy({
    upgrades: rideUpgrades(),
    // decor and monument near-misses raise effective excitement for the economy
    pathStats: path ? { ...path.stats, excitement: path.stats.excitement + excitementBonus() } : null,
    simQueue: sim.queue,
    simPlaza: sim.plaza,     // live shopping crowd (null → analytic steady state)
    researchDone: research.done,
    staff,
    station: STN,
    fallbackMaxSpeed: PHYS.vMin,
    // Fame renown x campaign arrivals x Showstopper entertainers' crowd aura
    demandMult: renownMult(legacy.perks) * mfx.arrivalMult * showstopperArrivalMult(staff.entertainers.people),
    snackMult: biomeFx(activeBiome).snackMult,   // Desert: thirsty guests
    ticketMult: mfx.ticketMult,                  // Ride Spotlight premium
    vendorMult: mfx.vendorMult,                  // Family Package spend
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

const MIN_FRUSTUM=10, MAX_FRUSTUM=140;     // zoom-in floor / zoom-out base (grows with park size)
const MIN_CAM_HEIGHT=8, MAX_CAM_HEIGHT=132;
let frustum=30, azimuth=Math.PI*0.25, camHeight=52;

// Farthest owned-chunk edge from the origin, in world units — the camera's
// zoom-out and pan limits grow with the park so big builds always fit in frame.
function parkExtent(){
  let ext=property.chunkSize/2;
  for(const key of property.owned){
    const bounds=chunkBounds(property,key);
    if(!bounds)continue;
    ext=Math.max(ext, Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minZ), Math.abs(bounds.maxZ));
  }
  return Math.max(ext, monumentExtent);   // keep the hall-of-fame row reachable
}
function maxFrustumNow(){
  return Math.max(MAX_FRUSTUM, parkExtent()*2.4);
}
// Wide views get a rising height floor: zoomed in close you can drop to ground
// level, but a whole-park view is capped at an angle where the island still
// fills the frame instead of half the screen being sky.
function minCamHeightNow(){
  const t=Math.max(0, Math.min(1, (frustum-40)/220));
  return MIN_CAM_HEIGHT + t*30;
}
function clampCamera(){
  frustum=Math.max(MIN_FRUSTUM, Math.min(maxFrustumNow(), frustum));
  camHeight=Math.max(minCamHeightNow(), Math.min(MAX_CAM_HEIGHT, camHeight));
}
const camTarget=new THREE.Vector3(0,2.5,0);
function resetCameraView(){
  frustum=30;
  camHeight=52;
  camTarget.set(0,2.5,0);
  clampCamera();
  resize();
}
// Negative near plane (valid for ortho): the camera sits a fixed ~62 units from
// its target, so a park wider than that would otherwise clip against the near
// plane when zoomed out to see all of it.
const camera=new THREE.OrthographicCamera(-1,1,1,-1,-600,1600);
function lowCameraT(){
  return Math.max(0, Math.min(1, (52 - camHeight) / 44));
}
function effectiveFrustum(){
  return frustum * (1 + lowCameraT() * 0.32);
}
function placeCamera(){
  const lowT=lowCameraT();
  const camDist=62-lowT*34;
  const focus=camTarget.clone();
  focus.y-=lowT*1.2;
  camera.position.set(camTarget.x+Math.cos(azimuth)*camDist,camTarget.y+camHeight,camTarget.z+Math.sin(azimuth)*camDist);
  camera.lookAt(focus);
  // Anchor fog to the focal subject's distance (not raw zoom): the orthographic
  // camera sits a fixed distance back, so zooming in or looking top-down does not
  // move it closer. Keying fog off focusDist keeps the ride crisp at any zoom or
  // height while distant scenery still hazes into the sky (floating-island look).
  const viewFrustum=effectiveFrustum();
  const focusDist=camera.position.distanceTo(focus);
  scene.fog.near=focusDist+viewFrustum*0.5;
  scene.fog.far=focusDist+viewFrustum*3.0+150;
}
function resize(){
  const w=host.clientWidth,h=host.clientHeight,a=w/h;
  const viewFrustum=effectiveFrustum();
  camera.left=-viewFrustum*a/2; camera.right=viewFrustum*a/2;
  camera.top=viewFrustum/2; camera.bottom=-viewFrustum/2;
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

function refreshExcitementBonuses(){
  if(!path){
    themeBonus=0;
    monumentBonus=0;
    return;
  }
  themeBonus = themingBonus(decorations, path.pos, {
    matchTypes: biomeMatchTypes(activeBiome),
    mult: biomeFx(activeBiome).themeMult,
  });
  monumentBonus = monumentNearMissBonus(path.pos, monumentGhosts.map(ghost => ghost.path?.pos || []));
  path.stats.monumentNearMiss = monumentBonus;
}

function buildPath(){
  path = buildTrackPath({
    ctrlPts,
    upgrades: rideUpgrades(),
    researchDone: research.done,
    physics: biomePhysics(activeBiome, PHYS),   // biome twist: ice=slick, moon=low-g
    Vector3: THREE.Vector3,
    worldUp: WORLD_UP,
    station: STATION,
  });
  refreshExcitementBonuses();
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
staffActors=createStaffActors({ THREE, scene, disposeGroup });
const portraitStudio=createStaffPortraitStudio({ THREE });   // bakes 3D busts for the roster panel
staffActors.rebuild(staff);

function buildPropertyGeometry(){
  renderPropertyGeometry({
    THREE,
    group: propertyGrp,
    property,
    candidates: expansionCandidates(property),
    colors: biomeCol,
    fmt: formatMoney,
    disposeGroup,
  });
}

function buildScenery(){
  buildChunkScenery({
    THREE,
    group: sceneryGrp,
    property,
    colors: biomeCol,
    disposeGroup,
  });
}

const decorGrp=new THREE.Group(); scene.add(decorGrp);
function buildDecorGeometry(){
  renderDecorations({
    THREE,
    group: decorGrp,
    decorations,
    colors: biomeCol,
    disposeGroup,
  });
}

// ── hall of fame: retired coasters as standing monuments with ghost trains ──
const monumentsGrp=new THREE.Group(); scene.add(monumentsGrp);
let monumentGhosts=[];
function buildMonumentsAll(){
  const res=buildMonuments({
    THREE,
    group: monumentsGrp,
    monuments: legacy.monuments,
    colors: COL,
    renderTrackGeometry,
    renderDecorations,
    disposeGroup,
    worldUp: WORLD_UP,
  });
  monumentGhosts=res.ghosts;
  monumentExtent=res.extent;
}

function buildTrackGeometry(){
  renderTrackGeometry({
    THREE,
    trackGrp,
    path,
    colors: biomeCol,
    disposeGroup,
  });
}

// Repaint the world for the active biome (palette + sky + fog). `rebuild` also
// regenerates the affected geometry (used on load and after a biome change).
function applyBiome(rebuild=false){
  biomeCol = biomeColors(activeBiome, COL);
  const b = biomeOf(activeBiome);
  scene.background.setHex(b.sky);
  scene.fog.color.setHex(b.fog);
  if(rebuild){
    buildPropertyGeometry();
    buildScenery();
    buildDecorGeometry();
    rebuildAll(true);
  }
}

function queueSignature(d = derived()){
  const station = `${ctrlPts[0]?.x},${ctrlPts[0]?.z},${ctrlPts[1]?.x},${ctrlPts[1]?.z}`;
  // coaster name + hype drive the entrance name marquee (name text + tier)
  return `${d.queueCap}|${UPGRADES.snacks.level}|${UPGRADES.canopy.level}|${UPGRADES.hats.level}|${UPGRADES.balloons.level}|${UPGRADES.hype.level}|${UPGRADES.foodCourt?.level || 0}|${UPGRADES.comfort?.level || 0}|${coasterName.trim()}|${d.berths}|${station}`;
}

function refreshDecorBlockers(){
  // station + queue plaza only: the track itself is fair game so players can
  // build structures right up against (and through) their coaster
  decorBlockers = [...(stationRefs.decorBlockers || [])];
}

function buildStationAndQueue(){
  const d = derived();
  renderStationAndQueue({
    THREE,
    stationGrp,
    path,
    ctrlPts,
    colors: biomeCol,
    upgrades: rideUpgrades(),
    derived: () => d,
    sampleAt,
    stationRefs,
    carLength: CAR_LEN,
    headColors: HEADS,
    guestColors: GUEST_COLS,
    worldUp: WORLD_UP,
    disposeGroup,
    coasterName: coasterName.trim() || `Coaster ${legacy.generation}`,
    hypeLevel: UPGRADES.hype.level,
  });
  queueVisualSignature = queueSignature(d);
  refreshDecorBlockers();
}

function updateQueueVisuals(dt=0){
  const time=performance.now()*0.001;
  renderQueueVisuals({ queue: sim.queue, stationRefs, dt, time });
  updatePlazaVisuals({ plaza: sim.plaza, stationRefs, dt, time });
}

function ensureQueueVisualFresh(d = derived()){
  if(queueSignature(d) === queueVisualSignature) return false;
  buildStationAndQueue();
  updateQueueVisuals();
  return true;
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
    guestColors: GUEST_COLS,
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
    MAX_BANK_DEG: Math.round(PHYS.maxBank * 180 / Math.PI),
  },
  state,
  getCtrlPts: () => ctrlPts,
  setCtrlPts: next => { ctrlPts = next; },
  getPath: () => path,
  getPaidLength: () => paidLength,
  setPaidLength: next => { paidLength = next; },
  getTrains: () => trains,
  getFrustum: () => frustum,
  setFrustum: next => { frustum = next; clampCamera(); resize(); },
  getAzimuth: () => azimuth,
  setAzimuth: next => { azimuth = next; },
  getCamHeight: () => camHeight,
  setCamHeight: next => { camHeight = next; clampCamera(); resize(); },
  getPanLimit: () => parkExtent() + 20,
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
  onPlayWheel: deltaY => onDecorWheel(deltaY),
  getMaxHeight: currentMaxHeight,
});
const bm=buildControls.state;
function updateBuildCost(){ buildControls.updateBuildCost(); }
// lightweight camera introspection (console/tooling; no gameplay effect)
window.__TC3D_CAM__ = () => ({
  frustum, camHeight, azimuth,
  maxFrustum: maxFrustumNow(),
  minCamHeight: minCamHeightNow(),
  parkExtent: parkExtent(),
  target: { x: camTarget.x, z: camTarget.z },
});
if(window.__TIME_COASTER_TEST__){
  window.__TC3D_DEBUG__ = {
    trainState: () => trains.map(tr => ({ s: tr.s, prevS: tr.prevS, L: tr.L, mode: tr.mode, phase: tr.phase, timer: tr.timer })),
    pathLen: () => path?.len || 0,
    buildActive: () => bm.active,
    ownedLand: () => property.owned.length,
    maxHeight: () => currentMaxHeight(),
    coasterStats: () => ({ ...(path?.stats || {}), excitement: (path?.stats.excitement || 0) + excitementBonus(), themeBonus, monumentBonus }),
    selectBuildPoint: idx => buildControls.selectHandle(idx),
    pointBank: idx => ctrlPts[idx]?.bank ?? null,
    legacy: () => ({ fame: legacy.fame, generation: legacy.generation, monuments: legacy.monuments.length, biome: activeBiome, excitement: (path?.stats.excitement || 0) + excitementBonus(), themeBonus, monumentBonus }),
    marketing: () => ({
      fundingPct: marketing.fundingPct,
      channels: Object.fromEntries(CHANNELS.map(c => [c.key, {
        weight: marketing.channels[c.key].weight,
        demand: marketing.channels[c.key].demand,
        unlocked: channelUnlocked(c.key, { staff, researchDone: research.done, monuments: legacy.monuments.length }),
      }])),
      fx: marketingFx(),
    }),
    decorCount: () => decorations.length,
    staffActorCount: () => staffActors?.count() || 0,
    queueVisual: () => ({
      capacity: stationRefs.queueCapacity,
      visualCapacity: stationRefs.queueVisualCapacity,
      lanes: stationRefs.queueLanes,
      guests: stationRefs.crowd?.poolSize || 0,
      simQueue: sim.queue,
      plaza: sim.plaza,
      // walk-in accounting: standing instances vs joiners still in the lanes
      settled: stationRefs.queueInbound?.settled ?? -1,
      inFlight: stationRefs.queueInbound?.inFlight ?? 0,
    }),
    canPlaceDecor: (type, x, z) => canPlaceDecoration({ property, decorations, type, x, z, blockers:decorBlockers }),
    screenPoint: (x, z, y = 0) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * host.clientWidth,
        y: (-v.y * 0.5 + 0.5) * host.clientHeight,
      };
    },
    setFrustum: v => { frustum = v; resize(); placeCamera(); renderer.render(scene, camera); },
    setAzimuth: v => { azimuth = v; placeCamera(); renderer.render(scene, camera); },
    setCamHeight: v => { camHeight = v; resize(); placeCamera(); renderer.render(scene, camera); },
    cameraFrame: () => ({
      camHeight,
      lowT: lowCameraT(),
      effectiveFrustum: effectiveFrustum(),
    }),
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
let concAcc=0;   // concessions point-of-sale accumulator (fractional sales)
let vignetteAcc=0, vignetteCool=0;   // walk-up-and-decide theater at the arch
const stallState={ active:false };   // hard-stall latch (fires the toast once on change)
const stationBusy=()=>trains.some(t=>t.mode==='dwell');
// measured income: every credited dollar is recorded so the HUD can show what
// the park actually earns (projected rate overstates it when trains back up)
const incomeTracker=createIncomeTracker(60);
const nowSec=()=>performance.now()/1000;
// build mode pauses the sim, so the rolling measurement would misleadingly decay
const measuredRate=()=>bm.active?null:incomeTracker.ratePerMin(nowSec());
const dispatchDeposit=(tr,income)=>{
  incomeTracker.record(income, nowSec());
  audio.play('dispatch');
  staffActors?.notifyDispatch(performance.now()*0.001);   // operator hops + photo flashes
  if(coinThrottle<=0 && tr.cars[0]){ spawnCoin(tr.cars[0].position, income); coinThrottle=0.12; }
};

function updateTrains(dt,d){
  // Hard stall: a crest the launch/lift energy can't clear. The physics sweep
  // flags it (path.stats.rollback) and marks where it dies (stallS). A stalled
  // ride pays nothing until the track is fixed — one train climbs to the crest,
  // gives up, and rolls back to the empty platform to show why.
  const stalled=!!path?.stats?.rollback;
  if(stalled!==stallState.active){
    stallState.active=stalled;
    if(stalled){
      const h=path.stats.stallHeight;
      showToast(`⚠ STALLED — the train can't clear the ${h}m crest. Lower the hill, add a ⛓ Lift, or buy Faster Track.`);
      audio.play('error');
    } else {
      showToast('Ride cleared — trains are running again!');
    }
    refreshHUD();
  }
  stepTrains({
    trains, dt, economy:d, pathLen:path.len, stopS:stationRefs.stopS, sim, state,
    speedAt, stationBusy,
    carLen:CAR_LEN, blockGap:BLOCK_GAP,
    berths:d.berths, advanceTime:d.advanceTime,
    autoDispatch:d.autoDispatch, dispatchDelay:d.dispatchDelay,
    stalled, stallS: path?.stats?.stallS ?? -1,
    placeTrain: tr => tr.cars.forEach((car,i)=>placeCar(car, tr.s-i*CAR_LEN)),
    setOccupancy: setTrainOccupancy,
    onDeposit: dispatchDeposit,
  });
  // dwell-phase transitions drive guest walk animations: riders stream off to
  // the exit walkway on unload, and the queue files onto the platform on load.
  // With dual berths the waves use their own platform halves so both run at once.
  for(const tr of trains){
    const cur=tr.mode==='dwell'?tr.phase:'run';
    if(tr._animPhase!==cur){
      const dual=d.berths>1;
      if(cur==='unload'&&tr.startBoard>0){
        spawnStationWalkers(stationRefs,'exit',tr.startBoard,d.unloadTime,dual?(tr.berth==='front'?'front':'rear'):'all');
        // riders walk off into the plaza and keep their visit going (shop,
        // wander, maybe ride again) — the plaza's departure flow retires them
        sim.plaza=Math.min(d.plazaCapacity, sim.plaza + tr.startBoard);
      }
      else if(cur==='load'&&tr.cycleBoard>0)
        spawnStationWalkers(stationRefs,'board',tr.cycleBoard,d.loadTime,dual?'front':'all');
      tr._animPhase=cur;
    }
  }
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

// ── decoration placement (pick in the Decor tab, click owned land to drop).
//    Scroll raises/lowers the ghost for stacking, R rotates it, pieces may
//    overlap — a lightweight Planet Coaster-style construction kit.
//    type 'remove' is the demolish tool (click pieces for a 50% refund).
const decorPlace = { type:null, ghost:null, valid:true, rot:0, height:0, lastAt:null };

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
  decorPlace.lastAt=null;
}

function selectDecor(type){
  const toggleOff = decorPlace.type===type;
  cancelDecorPlacement();
  if(toggleOff){ refreshHUD(); return; }
  if(type==='remove'){
    decorPlace.type='remove';
    showToast('Demolish — click decor pieces for a 50% refund · Esc to stop');
  } else if(DECOR[type]){
    decorPlace.type=type;
    decorPlace.rot=0;
    decorPlace.height=0;
    const ghost=buildDecorationModel({ THREE, type, colors: biomeCol });
    ghost.traverse(o=>{
      if(o.material){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=0.62; }
    });
    ghost.visible=false;
    decorPlace.ghost=ghost;
    scene.add(ghost);
    showToast(`Placing ${DECOR[type].name} — scroll raises · R rotates · Esc to stop`);
  }
  refreshHUD();
}

function refreshGhostAt(p){
  if(!decorPlace.ghost) return;
  decorPlace.lastAt=p;
  decorPlace.ghost.visible=true;
  decorPlace.ghost.position.set(p.x, 0.04+decorPlace.height, p.z);
  decorPlace.ghost.rotation.y=decorPlace.rot;
  const ok=canPlaceDecoration({ property, decorations, type:decorPlace.type, x:p.x, z:p.z, y:decorPlace.height, blockers:decorBlockers })
    && state.money>=decorationCost(decorPlace.type);
  if(ok!==decorPlace.valid) setGhostValidity(ok);
}

renderer.domElement.addEventListener('mousemove', e=>{
  if(!decorPlace.type || decorPlace.type==='remove' || bm.active) return;
  const p=decorGroundPoint(e.clientX, e.clientY);
  if(!p){ if(decorPlace.ghost) decorPlace.ghost.visible=false; decorPlace.lastAt=null; return; }
  refreshGhostAt(p);
});

// scroll while placing = stacking height (0.25m steps); zoom is untouched otherwise
function onDecorWheel(deltaY){
  if(!decorPlace.ghost || bm.active) return false;
  decorPlace.height=Math.max(0, Math.min(12, decorPlace.height + (deltaY<0?0.25:-0.25)));
  if(decorPlace.lastAt) refreshGhostAt(decorPlace.lastAt);
  return true;
}

window.addEventListener('keydown', e=>{
  if(e.defaultPrevented) return;
  if(e.key==='Escape'){
    if(escapeMenu.open){ setEscapeMenu(false); e.preventDefault(); return; }
    if(decorPlace.type){ cancelDecorPlacement(); refreshHUD(); e.preventDefault(); return; }
    if(closeOpenPanels()){ e.preventDefault(); return; }
    if(!bm.active){ setEscapeMenu(true); e.preventDefault(); }
    return;
  }
  if((e.key==='b'||e.key==='B') && decorPlace.type){ cancelDecorPlacement(); refreshHUD(); }
  if((e.key==='r'||e.key==='R') && decorPlace.ghost){
    decorPlace.rot=(decorPlace.rot + Math.PI/8) % (Math.PI*2);
    if(decorPlace.lastAt) refreshGhostAt(decorPlace.lastAt);
  }
});
// entering build mode drops any in-progress placement
document.getElementById('buildToggle').addEventListener('click', ()=>{
  if(decorPlace.type){ cancelDecorPlacement(); refreshHUD(); }
});

// Demolish tool: raycast the decor layer and refund the clicked piece.
function tryRemoveDecor(clientX, clientY){
  const r=renderer.domElement.getBoundingClientRect();
  dispatchNDC.x=((clientX-r.left)/r.width)*2-1;
  dispatchNDC.y=-((clientY-r.top)/r.height)*2+1;
  dispatchRay.setFromCamera(dispatchNDC, camera);
  const hits=dispatchRay.intersectObjects(decorGrp.children, true);
  for(const hit of hits){
    let o=hit.object;
    while(o && o.userData?.decorIndex===undefined) o=o.parent;
    if(o?.userData?.decorIndex!==undefined){
      const idx=o.userData.decorIndex;
      const name=DECOR[decorations[idx]?.type]?.name || 'Decor';
      const refund=removeDecoration({ decorations, state, index: idx });
      buildDecorGeometry();
      refreshExcitementBonuses();
      spawnCoinScreen(clientX, clientY, refund, false);
      showToast(`${name} removed — $${fmt(refund)} refunded`);
      refreshHUD(); saveGame();
      return true;
    }
  }
  return true; // demolish mode consumes taps even on a miss
}

// Placement consumes play-mode taps so a mis-click can't dispatch or buy land.
function tryPlaceDecor(clientX, clientY){
  if(!decorPlace.type || bm.active) return false;
  if(decorPlace.type==='remove') return tryRemoveDecor(clientX, clientY);
  const p=decorGroundPoint(clientX, clientY);
  if(!p) return true;
  const type=decorPlace.type;
  const cost=placeDecoration({
    decorations, property, state, type,
    x:p.x, z:p.z, y:decorPlace.height, rot:decorPlace.rot,
    blockers:decorBlockers,
  });
  if(cost>0){
    buildDecorGeometry();
    audio.play('place');
    spawnCoinScreen(clientX, clientY, cost, true);
    // theming feedback: show how much this piece raised the ride's excitement
    const prevTheme=themeBonus;
    refreshExcitementBonuses();
    const gained=themeBonus-prevTheme;
    if(gained>0.05) showToast(`${DECOR[type].name} placed — theming +${gained.toFixed(1)} EXC`);
    else showToast(`${DECOR[type].name} placed`);
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
  // skilled mechanics install faster: effective crew = headcount × skill
  stepMaintenance(maintenance, dt, staff.mechanics.hired * (staff.mechanics.skill || 1), applyInstalledUpgrade);
}

// One fixed-size slice of simulation. Kept ≤50ms so physics stay stable; the
// frame loop substeps through the real elapsed time, so a lagging frame rate
// no longer slows the park down (playtest: income visibly dropped when fps did).
function stepSim(dt){
  updateMaintenance(dt);
  const d=derived();
  // The guest funnel: arrivals land in the plaza (marketing), mill and shop,
  // and file into the queue when the ride and the wait look worth it. Boarding
  // drains the queue in trainSim; riders return to the plaza after unloading.
  const flows=stepCrowdFlows({
    plaza: sim.plaza,
    queue: sim.queue,
    dt,
    arrivalPerSec: d.arrivalRate,
    visitMin: d.visitMin,
    joinWill: d.joinWill,
    queueCap: d.queueCap,
    plazaCap: d.plazaCapacity,
  });
  sim.plaza=flows.plaza;
  sim.queue=flows.queue;
  // Joiners now walk the lanes for real (queue walk-ins spawned by the
  // renderer when the count rises). The theater that remains is the BALK —
  // a looker who sized up the line at the arch and bailed. Staged from the
  // join flow at the miss rate (1−joinWill), so a punishing wait shows a
  // parade of shrugs while a great ride shows almost none.
  vignetteAcc=Math.min(vignetteAcc+flows.join, 4);   // don't bank a parade
  vignetteCool-=dt;
  if(vignetteAcc>=1 && vignetteCool<=0){
    vignetteAcc-=1;
    if(Math.random()>d.joinWill && spawnPlazaVignette(stationRefs,'balk')) vignetteCool=1.6;
  }
  // snack income scales with guests waiting (capped per stand, raised by
  // Shade Canopies), boosted by Janitors, tickets and theming
  let passive=0;
  // Concessions: the whole waiting crowd buys snacks/hats/balloons at the point
  // of sale — credited here (not at dispatch) with coin pops over the queue.
  const conc=d.concessions;
  if(conc && conc.perMin>0){
    const drained=drainSales(concAcc, conc.salesPerMin, dt, 2);
    concAcc=drained.acc;
    if(drained.sales>0){
      const avg=conc.salesPerMin>0 ? conc.perMin/conc.salesPerMin : 0;
      let earned=0;
      for(let k=0;k<drained.popped;k++){
        const sale=pickConcessionSale(conc.items, Math.random());
        const price=sale?sale.price:avg;
        earned+=price;
        if(sale && coinThrottle<=0){ spawnConcessionPop(sale, price); coinThrottle=0.12; }
      }
      earned += (drained.sales - drained.popped) * avg;   // overflow, no pop
      passive += earned;
    }
  }
  // Reality Licensing royalties trickle in passively from impossible rides
  if(d.royaltyPerMin>0) passive += d.royaltyPerMin/60*dt;
  // retired coasters keep drawing tourists ("visit the classics") — Heritage
  // Tours campaigns multiply the take while their demand lasts
  if(legacy.monuments.length) passive += totalLegacyIncome(legacy.monuments, legacy.perks)*marketingFx().legacyMult/60*dt;
  if(passive>0){ state.money += passive; incomeTracker.record(passive, nowSec()); }
  // payroll: wages drain continuously while the park is open, scaled by era —
  // a famous park pays famous salaries (payrollScale of gross). Skipped when
  // the bank is empty — a broke park simply can't make payroll, no death spiral.
  if(state.money>0){
    const wage=totalPayroll(roster)*payrollScale(d.ratePerMin)/60*dt;
    if(wage>0) state.money=Math.max(0, state.money-wage);
  }
  // marketing: Marketers split a chosen % of projected income across the
  // unlocked campaign channels by weight; every channel's demand decays.
  // Specialist marketers (Street Smart, Radio Voice, Viral Instinct) bend
  // their channel's build/decay via channelFx.
  const marketingCtx={ marketing, staff, ratePerMin:d.ratePerMin, dt, researchDone:research.done, monuments:legacy.monuments.length, channelFx:marketingTraitFx(staff.marketers.people) };
  if(marketing.fundingPct>0 && state.money>0 && hasMarketer(staff)){
    const spend=stepMarketing({ ...marketingCtx, availableMoney:state.money });
    if(spend>0) state.money-=spend;
  } else {
    stepMarketing({ ...marketingCtx, availableMoney:0 });
  }
  // research: Scientists convert a chosen % of projected income into progress on the active path.
  const activeResearch=pathProjectState(research, RESEARCH_PATHS, RESEARCH);
  if(research.fundingPct>0 && state.money>0 && hasScientist(staff) && activeResearch && !activeResearch.complete){
    const fundingPct=clampResearchFundingPct(research.fundingPct, staff);
    if(research.fundingPct!==fundingPct) research.fundingPct=fundingPct;
    const spendPerMin=Math.max(0,d.ratePerMin)*fundingPct/100;
    const spend=Math.min(state.money, spendPerMin/60*dt);
    state.money-=spend;
    // Track Engineers and Safety Nuts on the science team speed up their specialty
    const unlocked=stepResearch({ research, researchPaths:RESEARCH_PATHS, projects:RESEARCH, staff, spend, fundingPct, effMult:researchEffMult(staff.scientists.people, research.activePath) });
    unlocked.forEach(handleResearchUnlock);
  }
  updateTrains(dt,d);
  return d;
}

const clock=new THREE.Clock();
let paused=true;   // held until the splash's Play button starts the game
function tick(){
  const frameDt=Math.min(clock.getDelta(),0.5);
  // coalesced track rebuild from build-mode dragging (≤ once per frame)
  if(bm.needsRebuild){ buildPath(); buildTrackGeometry(); updateBuildCost(); bm.needsRebuild=false; }
  if(!paused&&!bm.active&&path){
    let remaining=frameDt, guard=0, d=null;
    while(remaining>1e-4 && guard++<10){
      const dt=Math.min(remaining,0.05);
      remaining-=dt;
      d=stepSim(dt);
    }
    if(d){
      ensureQueueVisualFresh(d);
      updateQueueVisuals(frameDt);
      // an entertainer mid-show returns their spot; wanderers drift to watch
      if(stationRefs.walkerGeom) stationRefs.plazaShow = staffActors?.update({
        dt: frameDt,
        time: performance.now()*0.001,
        geom: stationRefs.walkerGeom,
        frame: stationRefs.frameGroup,
        installing: !!maintenance.current,
      }) || null;
    }
    hudAccum+=frameDt;
    if(hudAccum>=0.2){ refreshHUD(); hudAccum=0; }
  } else {
    updateDispatchButton(false);
  }
  clouds.forEach((c,i)=>{c.position.x+=(0.15+i*0.02)*frameDt;if(c.position.x>30)c.position.x=-30;});
  if(!paused && monumentGhosts.length) stepMonuments(monumentGhosts, frameDt, THREE);
  coinThrottle-=frameDt; placeCamera(); renderer.render(scene,camera); requestAnimationFrame(tick);
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
  derived,
  getMaintenance: () => maintenance,
  decor: DECOR,
  decorOrder: DECOR_ORDER,
  getSelectedDecor: () => decorPlace.type,
  onSelectDecor: type => { selectDecor(type); setShopOpen(false); },
  getPath: () => path,
  getState: () => state,
  getSim: () => sim,
  getMeasuredRate: measuredRate,
  getExcitementBonus: () => excitementBonus(),
  hasResearch,
  gradeFor,
  upgradeCost,
  fmt,
  mph: MPH,
  onBuy: buy,
});
function buildShop(){ ui.buildShop(); }
function renderShop(){ ui.renderShop(); }
let shopOpen=false;
function setShopOpen(open){
  shopOpen=open;
  const panel=$('shopPanel');
  const toggle=$('shopToggle');
  const shop=$('shop');
  if(panel) panel.hidden=!open;
  if(toggle) toggle.classList.toggle('active',open);
  if(open){
    if(shop) shop.classList.remove('hidden');
    renderShop();
  }
}
function refreshHUD(){
  ui.refreshHUD();
  updateMaintenanceHUD();
  const bc=$('biomeChip'); if(bc) bc.textContent=biomeOf(activeBiome).icon;
  const bg=$('biomeGen'); if(bg) bg.textContent=`Gen ${legacy.generation}`;
  const researchUnlocked=hasScientist(staff);
  $('researchToggle').hidden=!researchUnlocked;
  if(!researchUnlocked && researchUI.isOpen()) researchUI.close();
  const marketingUnlocked=hasMarketer(staff);
  $('marketingToggle').hidden=!marketingUnlocked;
  if(!marketingUnlocked && marketingUI.isOpen()) marketingUI.close();
  if(researchUI.isOpen()) researchUI.render();
  if(marketingUI.isOpen()) marketingUI.render();
  if(staffUI.isOpen()) staffUI.render();
  if(landUI.isOpen()) landUI.render();
  if(balanceUI.isOpen()) balanceUI.render();
  if(legacyUI.isOpen()) legacyUI.render();
}

// ── Legacy: retire the active coaster, choosing the next generation's biome ──
// The Legacy panel's Retire button opens a biome picker; choosing a biome runs
// the retirement (monument snapshot + reset to a fresh coaster in that biome).
function openBiomePicker(){
  if(!path) return false;
  if(!canRetire(path.stats, excitementBonus(), legacy.generation)) return false;
  if(legacyUI.isOpen()) legacyUI.close();
  const gained=fameFor(path.stats, excitementBonus());
  const oldName=(coasterName.trim() || `Coaster ${legacy.generation}`).slice(0,40);
  const defaultNewName=`Coaster ${legacy.generation + 1}`;
  const title=$('ceremonyTitle'); if(title) title.textContent='Where Next?';
  const cards=BIOME_ORDER.map(key=>{
    const b=BIOMES[key];
    const locked=!biomeUnlocked(key, research.done);
    return `<button class="biome-card${locked?' locked':''}" data-biome="${key}" ${locked?'disabled':''}>`+
      `<span class="bc-ic">${b.icon}</span><span class="bc-nm">${b.name}</span>`+
      `<span class="bc-mech">${locked?'🔒 Research Vertical Track':b.mechanic}</span></button>`;
  }).join('');
  const body=$('ceremonyBody');
  if(body) body.innerHTML=
    `<div class="cer-name">Retire “${escHtml(oldName)}”</div>`+
    `<div class="cer-fame">+${fmt(gained)} <span>Fame</span></div>`+
    `<div class="cer-sub">Name your next coaster, then choose where it rises:</div>`+
    `<input id="newCoasterName" class="lg-name" maxlength="40" value="${escAttr(defaultNewName)}" placeholder="Name your coaster">`+
    `<div class="biome-grid">${cards}</div>`;
  body?.querySelectorAll('.biome-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const newName=($('newCoasterName')?.value || '').trim().slice(0,40) || defaultNewName;
      doRetire(btn.dataset.biome, oldName, gained, newName);
    });
  });
  const panel=$('ceremonyPanel'); if(panel) panel.hidden=false;
  return true;
}

function spawnRetirementBurst(){
  const panel=$('ceremonyPanel');
  if(!panel || panel.hidden) return;
  for(let i=0;i<18;i++){
    const spark=document.createElement('div');
    spark.className='cer-spark';
    const angle=(Math.PI*2*i)/18;
    const dist=72 + (i%4)*18;
    spark.style.setProperty('--dx', `${Math.cos(angle)*dist}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle)*dist}px`);
    spark.style.setProperty('--delay', `${(i%5)*35}ms`);
    panel.appendChild(spark);
    setTimeout(()=>spark.remove(),950);
  }
}

function doRetire(nextBiome, name, gained, newName=''){
  if(!path || !canRetire(path.stats, excitementBonus(), legacy.generation)) return false;
  const retiredStats={ ...path.stats };
  const retiredBonus=excitementBonus();
  const retiredCraft=qualityScore(retiredStats);
  const monument=createMonument({
    name, ctrlPts, decorations, stats: path.stats, themeBonus: excitementBonus(),
    biome: activeBiome, generation: legacy.generation,   // record where it was built
  });
  const retiredIncome=monumentIncome(monument, legacy.perks);
  legacy.monuments.push(monument);
  legacy.fame+=gained;
  legacy.generation+=1;
  coasterName=(newName||'').trim().slice(0,40);   // named at birth, in the biome picker
  activeBiome=normalizeBiome(nextBiome);

  // reset the active coaster; research, staff and Fame persist
  const grant=openingGrant(legacy.fame, legacy.perks);
  state.money=grant;
  state.rides=0;
  Object.values(UPGRADES).forEach(u=>{ u.level=0; });
  maintenance.installed.car=0; maintenance.installed.train=0;
  maintenance.queue=[]; maintenance.current=null;
  resetActiveProperty();
  decorations.length=0; themeBonus=0; monumentBonus=0;
  ctrlPts=DEFAULT_CTRL.map(p=>({...p}));
  paidLength=0; sim.queue=0; sim.plaza=0;
  buildControls.resetHistory?.();
  resetCameraView();
  applyResearchEffects();

  applyBiome(true);          // repaint palette + sky and rebuild the world
  paidLength=path.len;
  rebuildTrains();
  trains.forEach((tr,i)=>{tr.s=(i/trains.length)*path.len;tr.prevS=tr.s;tr.L=path.len;});
  sim.queue=Math.min(derived().queueCap, 8);
  sim.plaza=12;   // opening-day stragglers milling in the forecourt
  buildMonumentsAll();
  refreshHUD(); saveGame();
  audio.play('fanfare');

  const b=biomeOf(activeBiome);
  const title=$('ceremonyTitle'); if(title) title.textContent='Coaster Retired!';
  const body=$('ceremonyBody');
  if(body) body.innerHTML=`<div class="cer-name">${name}</div>`+
    `<div class="cer-fame">+${fmt(gained)} <span>Fame</span></div>`+
    `<div class="cer-stats">`+
      `<div><b>${Math.round(retiredStats.excitement + retiredBonus)}</b><span>EXC</span></div>`+
      `<div><b>${Math.round(retiredCraft)}</b><span>Craft</span></div>`+
      `<div><b>${fmt(retiredIncome)}</b><span>$/min</span></div>`+
      `<div><b>${fmt(grant)}</b><span>Grant</span></div>`+
    `</div>`+
    (retiredStats.monumentNearMiss>0.05?`<div class="cer-sub">History thread bonus +${retiredStats.monumentNearMiss.toFixed(1)} EXC.</div>`:'')+
    `<div class="cer-sub">Generation ${legacy.generation} begins on the ${b.icon} ${b.name}.</div>`;
  spawnRetirementBurst();
  return true;
}
$('ceremonyClose')?.addEventListener('click', ()=>{ const p=$('ceremonyPanel'); if(p) p.hidden=true; });

// ── park balance sheet ──────────────────────────────────────────────────────
const balanceUI=createBalancePanel({
  document,
  derived,
  getState: () => state,
  getResearch: () => research,
  getMeasuredRate: measuredRate,
  canSpendResearch: () => hasScientist(staff),
  getMarketing: () => marketing,
  getMarketingFundingPct: () => clampMarketingPct(marketing.fundingPct, staff),
  canSpendMarketing: () => hasMarketer(staff),
  getMarketingFx: marketingFx,
  getPayroll: () => totalPayroll(roster) * payrollScale(derived().ratePerMin),
  researchPaths: RESEARCH_PATHS,
  projects: RESEARCH,
  pathProjectState,
  fmt,
});
document.querySelector('.bank')?.addEventListener('click', ()=>{
  if(bm.active) buildControls.exitBuildMode();
  if(shopOpen) setShopOpen(false);
  if(researchUI.isOpen()) researchUI.close();
  if(marketingUI.isOpen()) marketingUI.close();
  if(staffUI.isOpen()) staffUI.close();
  if(landUI.isOpen()) landUI.close();
  if(legacyUI.isOpen()) legacyUI.close();
  balanceUI.toggle();
});

// ── Legacy / Hall of Fame panel ─────────────────────────────────────────────
const legacyUI=createLegacyPanel({
  document,
  getLegacy: () => legacy,
  getStats: () => (path ? path.stats : { excitement:0, length:0 }),
  getThemeBonus: () => excitementBonus(),
  getCoasterName: () => coasterName,
  setCoasterName: v => { coasterName=v; },
  fmt,
  onRetire: openBiomePicker,
  onBuyPerk: key => {
    if(buyLegacyPerk(key)){ audio.play('buy'); return true; }
    return false;
  },
});
$('legacyToggle')?.addEventListener('click', ()=>{
  if(bm.active) buildControls.exitBuildMode();
  if(shopOpen) setShopOpen(false);
  if(researchUI.isOpen()) researchUI.close();
  if(marketingUI.isOpen()) marketingUI.close();
  if(staffUI.isOpen()) staffUI.close();
  if(balanceUI.isOpen()) balanceUI.close();
  legacyUI.toggle();
});
function buyLegacyPerk(key){
  // buyPerk mutates legacy; import lazily via legacy module helper
  const spent=legacyBuyPerk(legacy, key);
  if(spent>0){ refreshHUD(); saveGame(); }
  return spent>0;
}

// ── R&D management panel ───────────────────────────────────────────────────
const researchUI=createResearchPanel({
  document,
  research,
  projects: RESEARCH,
  researchPaths: RESEARCH_PATHS,
  derived,
  staff: () => staff,
  fundingEfficiency,
  researchFundingCap,
  clampResearchFundingPct,
  pathProjectState,
  hasResearch,
  fmt,
  onSetActivePath: path => { research.activePath = path; refreshHUD(); saveGame(); },
  onSetResearchFunding: pct => { research.fundingPct = clampResearchFundingPct(pct, staff); refreshHUD(); saveGame(); },
});
$('researchToggle').addEventListener('click', ()=>{
  if(bm.active) buildControls.exitBuildMode();
  if(shopOpen) setShopOpen(false);
  if(balanceUI.isOpen()) balanceUI.close();
  if(marketingUI.isOpen()) marketingUI.close();
  researchUI.toggle();
});

const marketingUI=createMarketingPanel({
  document,
  marketing,
  staff: () => staff,
  derived,
  research: () => research,
  monuments: () => legacy.monuments.length,
  excitement: () => (path ? path.stats.excitement + excitementBonus() : 0),
  channels: CHANNELS,
  channelUnlocked,
  channelMultiplier,
  channelSaturation,
  steadyStateDemand,
  coverageBonus,
  marketingBudgetCap,
  clampMarketingPct,
  rebalanceWeights: (mk, key, target) =>
    rebalanceChannelWeights(mk, key, target, { staff, researchDone: research.done, monuments: legacy.monuments.length }),
  maxWeight: MAX_CHANNEL_WEIGHT,
  fmt,
  onSetMarketingFunding: pct => {
    marketing.fundingPct=clampMarketingPct(pct, staff);
    refreshHUD();
    saveGame();
  },
  onWeightsChanged: () => { refreshHUD(); saveGame(); },
});
$('marketingToggle')?.addEventListener('click', ()=>{
  if(bm.active) buildControls.exitBuildMode();
  if(shopOpen) setShopOpen(false);
  if(balanceUI.isOpen()) balanceUI.close();
  if(researchUI.isOpen()) researchUI.close();
  if(staffUI.isOpen()) staffUI.close();
  marketingUI.toggle();
});

// ── staff management panel ──────────────────────────────────────────────────
const staffUI=createStaffPanel({
  document,
  staffConfig: STAFF,
  staffOrder: STAFF_ORDER,
  getStaff: () => staff,
  getRoster: () => roster,
  getPortrait: person => portraitStudio.portraitFor(person),
  getApplicants: role => ensureBoard(role).applicants,
  getBoardRefreshSeconds: role => Math.max(0, (ensureBoard(role).refreshAt-Date.now())/1000),
  getState: () => state,
  // Stage ② keeps the classic panel alive against the new roster: "Hire" takes
  // the top applicant off the board, "Train" bumps the least-trained member.
  // Stage ③ replaces this with per-person cards. Money is deducted inside the
  // roster ops, so these wrappers only handle side-effects.
  costs: {
    hire: role => { const i=cheapestApplicantIndex(role); return i<0?0:signingFee(ensureBoard(role).applicants[i]); },
    train: role => { const i=lowestTrainableIndex(role); if(i<0) return 0; const m=roster[role][i]; return trainingFee(generatePerson(role,m.seed), m.level); },
    hirePerson: (role, index, person) => signingFee(person || ensureBoard(role).applicants[index]),
    trainPerson: (role, index) => {
      const m=roster[role]?.[index];
      return m ? trainingFee(generatePerson(role,m.seed), m.level) : 0;
    },
    reroll: role => rerollCost(role),
    canHire: role => cheapestApplicantIndex(role) >= 0 && !rosterFull(role),
    canTrain: role => lowestTrainableIndex(role) >= 0,
    atCap: role => rosterFull(role),
    cap: role => STAFF[role]?.hireMax ?? Infinity,
  },
  describe: (role, entry) => staffStatus(role, { hired: entry.hired, trained: Math.round(entry.trained||0) }),
  traits: TRAITS,
  // era wages: displayed salaries track the park's gross (a famous park pays
  // famous salaries) — must match the live payroll drain in stepSim
  wageScale: () => payrollScale(derived().ratePerMin),
  onSpendFeedback: (amount, x, y) => spawnCoinScreen(Math.max(0,x-26), Math.max(0,y-14), amount, true),
  onHire: (role, index=cheapestApplicantIndex(role)) => {
    const prevResearchCap=researchFundingCap(staff);
    const prevMarketingCap=marketingBudgetCap(staff);
    const spent=hirePerson(role, index);
    if(spent>0){
      spawnBankDelta(spent,true);
      if(role==='scientists'){
        const nextCap=researchFundingCap(staff);
        if(research.fundingPct===0 || research.fundingPct>=prevResearchCap) research.fundingPct=nextCap;
      }
      if(role==='marketers'){
        const nextCap=marketingBudgetCap(staff);
        if(marketing.fundingPct===0 || marketing.fundingPct>=prevMarketingCap) marketing.fundingPct=nextCap;
      }
      audio.play('buy');
      refreshHUD(); saveGame();
      showToast(lastStaffTouched ? `${lastStaffTouched.name} joins the crew!` : `Hired a ${STAFF[role].name.replace(/s$/,'')}`);
    }
    return spent;
  },
  onTrain: (role, index=lowestTrainableIndex(role)) => {
    const i=Number.isFinite(index)?index:lowestTrainableIndex(role);
    if(i<0) return 0;
    const spent=trainPerson(role, i);
    if(spent>0){
      spawnBankDelta(spent,true);
      audio.play('buy');
      if(role==='entertainers') ensureQueueVisualFresh();
      refreshHUD(); saveGame();
      showToast(lastStaffTouched ? `${lastStaffTouched.name} finished training` : `${STAFF[role].name} training improved`);
    }
    return spent;
  },
  onFire: (role, index) => {
    if(!firePerson(role, index)) return false;
    if(role==='entertainers') ensureQueueVisualFresh();
    refreshHUD(); saveGame();
    showToast(lastStaffTouched ? `${lastStaffTouched.name} let go` : `${STAFF[role].name.replace(/s$/,'')} let go`);
    return true;
  },
  onReroll: role => {
    const spent=paidRerollBoard(role);
    if(spent>0){
      spawnBankDelta(spent,true);
      audio.play('buy');
      refreshHUD(); saveGame(); showToast(`${STAFF[role].name} applicants refreshed`);
    }
    return spent;
  },
  fmt,
});
$('staffToggle').addEventListener('click', ()=>{
  if(bm.active) buildControls.exitBuildMode();
  if(shopOpen) setShopOpen(false);
  if(balanceUI.isOpen()) balanceUI.close();
  if(marketingUI.isOpen()) marketingUI.close();
  staffUI.toggle();
});
$('shopToggle').addEventListener('click', ()=>{
  if(bm.active) buildControls.exitBuildMode();
  if(researchUI.isOpen()) researchUI.close();
  if(marketingUI.isOpen()) marketingUI.close();
  if(staffUI.isOpen()) staffUI.close();
  if(balanceUI.isOpen()) balanceUI.close();
  setShopOpen(!shopOpen);
});
$('shopClose').addEventListener('click', ()=>setShopOpen(false));
$('shopBackdrop').addEventListener('click', ()=>setShopOpen(false));
$('buildToggle').addEventListener('click', ()=>{
  if(shopOpen) setShopOpen(false);
  if(escapeMenu.open) setEscapeMenu(false);
  if(researchUI.isOpen()) researchUI.close();
  if(marketingUI.isOpen()) marketingUI.close();
  if(staffUI.isOpen()) staffUI.close();
  if(balanceUI.isOpen()) balanceUI.close();
});

// ── land purchase popup (opened by clicking a FOR SALE sign in the scene) ───
const landUI=createLandPopup({
  document,
  getState: () => state,
  getOption: key => expansionCandidates(property).find(c => c.key === key) || null,
  chunkSize: () => property.chunkSize,
  onBuy: buyProperty,
  fmt,
});

function handleResearchUnlock(key){
  const p=RESEARCH[key];
  if(!p)return;
  applyResearchEffects();
  if(key==='launch') buildPath();              // free speed level changes the physics
  if(['queue2','queueEntertainment','virtualQueue','pocketQueue'].includes(key)) ensureQueueVisualFresh();
  renderShop(); refreshHUD(); saveGame();
  audio.play('research');
  showToast(`Researched: ${p.name}!`);
}
function buy(key){
  const u=UPGRADES[key];
  if(u.requiresResearch && !hasResearch(u.requiresResearch)){ showToast('Finish the required research first'); return; }
  if(u.max!==undefined&&u.level>=u.max)return;
  const c=upgradeCost(u); if(state.money<c)return;
  state.money-=c; u.level+=1;
  spawnBankDelta(c,true);
  audio.play('buy');
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
  else if(key==='hats'||key==='balloons'){rebuildTrains();} // riders on the trains get their merch too
  refreshHUD(); saveGame();
}
function buyProperty(key){
  const cost=buyLand(property,key,state);
  if(!cost){ showToast('Need more money or adjacent land'); return; }
  spawnBankDelta(cost,true);
  audio.play('land');
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
// A concession sale: an item icon + price floating over a random queue guest.
function spawnConcessionPop(item, price){
  const g=stationRefs.frameGroup, coords=stationRefs.queueSlotCoords;
  if(!g) return;
  // sales ring up at the stands: pop over the matching forecourt POI (hat cart,
  // balloon cart, fountain snackers), jittered so a busy stand reads as a crowd;
  // fall back to the queue line if the forecourt isn't built
  const pois=stationRefs.plazaPOIs;
  let c=null;
  if(pois && pois.length){
    const match=pois.filter(p=>p.kind===item.key || (item.key==='snack' && p.kind==='foodcourt'));
    const pool=match.length?match:pois;
    const p=pool[(Math.random()*pool.length)|0];
    c={ x:p.x+(Math.random()-0.5)*p.r, z:p.z+(Math.random()-0.5)*p.r };
  } else if(coords && coords.length){
    c=coords[(Math.random()*coords.length)|0];
  }
  if(!c) return;
  _v.set(c.x, (stationRefs.walkerGeom?.plazaTop ?? 0.5)+0.95, c.z);
  g.localToWorld(_v);
  _v.project(camera);
  if(_v.z>1) return;   // behind the camera
  const el=document.createElement('div');
  el.className='pop concession';
  el.textContent=`${item.icon} +$${fmt(price)}`;
  el.style.left=(_v.x*.5+.5)*host.clientWidth+'px';
  el.style.top=(-_v.y*.5+.5)*host.clientHeight+'px';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1000);
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

const escapeMenu = {
  open: false,
  resetArmed: false,
  resetTimer: null,
};
function resetEscapeConfirm(){
  escapeMenu.resetArmed=false;
  const reset=$('escapeReset');
  if(reset) reset.textContent='Reset Park';
  clearTimeout(escapeMenu.resetTimer);
  escapeMenu.resetTimer=null;
}
function setEscapeMenu(open){
  escapeMenu.open=open;
  const panel=$('escapePanel');
  if(panel) panel.hidden=!open;
  if(open){
    const sub=$('escapeSub');
    if(sub){
      const age=lastSavedAt?Math.round((Date.now()-lastSavedAt)/1000):null;
      sub.textContent=age===null
        ? 'Manage this park session — not saved yet this session.'
        : `Manage this park session — last saved ${age<5?'just now':`${age}s ago`}.`;
    }
  }
  resetEscapeConfirm();
}
function closeOpenPanels(){
  let closed=false;
  if(shopOpen){ setShopOpen(false); closed=true; }
  if(researchUI.isOpen()){ researchUI.close(); closed=true; }
  if(marketingUI.isOpen()){ marketingUI.close(); closed=true; }
  if(staffUI.isOpen()){ staffUI.close(); closed=true; }
  if(landUI.isOpen()){ landUI.close(); closed=true; }
  if(balanceUI.isOpen()){ balanceUI.close(); closed=true; }
  if(legacyUI.isOpen()){ legacyUI.close(); closed=true; }
  return closed;
}
function resetSaveAndReload(){
  SAVE_KEYS.forEach(key=>localStorage.removeItem(key));
  location.reload();
}
function armOrResetPark(){
  if(!escapeMenu.resetArmed){
    escapeMenu.resetArmed=true;
    const reset=$('escapeReset');
    if(reset) reset.textContent='Confirm Reset';
    showToast('Click Reset again to wipe this park');
    clearTimeout(escapeMenu.resetTimer);
    escapeMenu.resetTimer=setTimeout(resetEscapeConfirm,3500);
    return;
  }
  resetSaveAndReload();
}
$('escapeResume').addEventListener('click', ()=>setEscapeMenu(false));
$('escapeCloseX')?.addEventListener('click', ()=>setEscapeMenu(false));
$('escapeBackdrop').addEventListener('click', ()=>setEscapeMenu(false));
$('escapeSave').addEventListener('click', ()=>{
  showToast(saveGame() ? 'Game saved' : 'Save failed');
  resetEscapeConfirm();
});
$('escapeReload').addEventListener('click', ()=>location.reload());
$('escapeReset').addEventListener('click', armOrResetPark);

// =========================================================================
//  SAVE / LOAD
// =========================================================================
// A playtester lost hours to silently-failing saves, so failures now surface:
// repeated write failures warn the player instead of pretending all is well.
let saveFailures=0, saveWarnedAt=0, lastSavedAt=0;
function currentRate(){
  // measured $/min if we have enough signal, else the model estimate — this is
  // the rate offline progress is credited at on the next load
  return currentActiveRate() + currentLegacyRate();
}
function currentLegacyRate(){
  return totalLegacyIncome(legacy.monuments, legacy.perks);
}
function currentActiveRate(){
  const m=measuredRate();
  if(m===null) return path ? derived().ratePerMin : 0;
  return Math.max(0, m - currentLegacyRate());
}
function saveGame(){
  const lastActiveRate=currentActiveRate();
  const lastLegacyRate=currentLegacyRate();
  const ok=writeSave(localStorage, {
    state,
    sim,
    upgrades: UPGRADES,
    research,
    staff,
    roster,
    marketing,
    maintenance,
    property,
    decorations,
    ctrlPts,
    paidLength,
    frustum,
    azimuth,
    biome: activeBiome,
    legacy,
    savedAt: Date.now(),
    lastRate: lastActiveRate + lastLegacyRate,
    lastActiveRate,
    lastLegacyRate,
  });
  if(ok){
    saveFailures=0;
    lastSavedAt=Date.now();
  } else {
    saveFailures++;
    if(saveFailures>=2 && Date.now()-saveWarnedAt>60000){
      saveWarnedAt=Date.now();
      showToast('⚠ Saving is failing — your browser may be blocking storage (private window?)');
    }
  }
  return ok;
}
let restoredSavedAt=0, restoredRate=0, restoredActiveRate=null, restoredLegacyRate=0;   // for offline-progress on this boot
function loadGame(){
  const restored = applySaveData(readSave(localStorage), {
    state,
    sim,
    upgrades: UPGRADES,
    research,
    staff,
  });
  restoredSavedAt=typeof restored.savedAt==='number'?restored.savedAt:0;
  restoredRate=typeof restored.lastRate==='number'?restored.lastRate:0;
  restoredActiveRate=typeof restored.lastActiveRate==='number'?restored.lastActiveRate:null;
  restoredLegacyRate=typeof restored.lastLegacyRate==='number'?restored.lastLegacyRate:0;
  if(typeof restored.biome==='string') activeBiome=normalizeBiome(restored.biome);
  if(restored.legacy){
    legacy.fame=restored.legacy.fame;
    legacy.generation=restored.legacy.generation;
    legacy.perks=restored.legacy.perks;
    legacy.monuments=restored.legacy.monuments;
  }
  if(restored.marketing){
    const restoredMarketing=normalizeMarketingState(restored.marketing);
    marketing.fundingPct=restoredMarketing.fundingPct;
    marketing.channels=restoredMarketing.channels;
  }
  if(restored.roster){ roster=restored.roster; syncStaff(); }   // staff v2: individuals persist
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
    property.sizeGrowth=restoredProperty.sizeGrowth;
    property.farGrowth=restoredProperty.farGrowth;
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
    y: point.station ? point.y : Math.max(0.2, Math.min(currentMaxHeight(), point.y)),
  }));
  if(typeof restored.paidLength==='number')paidLength=restored.paidLength;
  if(typeof restored.frustum==='number'){ frustum=restored.frustum; clampCamera(); }
  if(typeof restored.azimuth==='number')azimuth=restored.azimuth;
  applyResearchEffects();   // e.g. raise train cap if Block Sections was researched
  normalizeResearchState(research, RESEARCH_PATHS);
  research.fundingPct=clampResearchFundingPct(research.fundingPct, staff);
  marketing.fundingPct=clampMarketingPct(marketing.fundingPct, staff);
}
setInterval(saveGame,15000);
// closing or backgrounding the tab must never lose progress
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveGame(); });

// =========================================================================
//  BOOT
// =========================================================================
// one-shot save injection for manual testing: the pagehide autosave would
// otherwise overwrite a save planted in localStorage just before a reload
try{
  const seed=sessionStorage.getItem('tc3d_seed');
  if(seed){ localStorage.setItem(SAVE_KEYS[0], seed); sessionStorage.removeItem('tc3d_seed'); }
}catch(_){}
loadGame();
if(restoredSavedAt>0) decayDemand(marketing, (Date.now()-restoredSavedAt)/1000, marketingTraitFx(staff.marketers.people));
buildShop();
applyBiome(false);       // set palette + sky/fog for the restored biome before building
buildPropertyGeometry();
buildScenery();
buildDecorGeometry();
buildMonumentsAll();
rebuildAll(true);
if(!paidLength)paidLength=path.len;   // first run: starter track is free
rebuildTrains();
trains.forEach((tr,i)=>{tr.s=(i/trains.length)*path.len;tr.prevS=tr.s;tr.L=path.len;});
if(sim.queue<=0)sim.queue=Math.min(derived().queueCap, 8);   // start with a small crowd
if(sim.plaza<=0)sim.plaza=12;                                // …and forecourt stragglers
updateQueueVisuals();
resize();
refreshHUD();
tick();                 // renders immediately; sim stays paused until Play
window.__TC3D_BOOTED = true;

// ── audio settings wiring (game menu sliders) ───────────────────────────────
(function wireAudioSettings(){
  const s=audio.get();
  const setSlider=(id,val)=>{ const el=$(id); if(el) el.value=Math.round(val*100); };
  setSlider('volMaster',s.master); setSlider('volMusic',s.music); setSlider('volSfx',s.sfx);
  const muteBtn=$('muteToggle');
  const syncMute=()=>{ if(muteBtn){ muteBtn.textContent=audio.isMuted()?'Unmute':'Mute'; muteBtn.classList.toggle('muted',audio.isMuted()); } };
  syncMute();
  $('volMaster')?.addEventListener('input',e=>audio.set('master',e.target.value/100));
  $('volMusic')?.addEventListener('input',e=>audio.set('music',e.target.value/100));
  $('volSfx')?.addEventListener('input',e=>{ audio.set('sfx',e.target.value/100); audio.play('ui'); });
  muteBtn?.addEventListener('click',()=>{ audio.set('muted',!audio.isMuted()); syncMute(); });
})();

// ── graphics settings (escape menu toggles) ─────────────────────────────────
// Real, persisted toggles so a slow machine has an escape hatch. Shadows and
// pixel-ratio are the two cheapest big wins.
(function wireGraphicsSettings(){
  let gfx={ shadows:true, detail:true };
  try{ const raw=localStorage.getItem('tc3d_gfx'); if(raw) gfx={ ...gfx, ...JSON.parse(raw) }; }catch(_){}
  const save=()=>{ try{ localStorage.setItem('tc3d_gfx', JSON.stringify(gfx)); }catch(_){} };
  function applyShadows(){
    renderer.shadowMap.enabled=gfx.shadows;
    // already-compiled materials need a recompile to pick up the change
    scene.traverse(o=>{ if(o.material){ const m=Array.isArray(o.material)?o.material:[o.material]; m.forEach(mat=>{mat.needsUpdate=true;}); } });
  }
  function applyDetail(){ renderer.setPixelRatio(gfx.detail?Math.min(devicePixelRatio,2):1); resize(); }
  const bind=(id,key,apply)=>{
    const btn=$(id); if(!btn) return;
    const sync=()=>btn.setAttribute('aria-checked', gfx[key]?'true':'false');
    sync();
    btn.addEventListener('click',()=>{ gfx[key]=!gfx[key]; sync(); apply(); save(); audio.play('ui'); });
  };
  applyShadows(); applyDetail();
  bind('gfxShadows','shadows',applyShadows);
  bind('gfxDetail','detail',applyDetail);
})();

// ── offline progress + title splash ─────────────────────────────────────────
// Compute what the park earned while away, then hold behind the splash. The
// Play click is also the user gesture that unlocks WebAudio.
const offline=restoredSavedAt>0 ? computeOfflineProgress({
  awaySeconds:(Date.now()-restoredSavedAt)/1000,
  rate:restoredRate,
  activeRate:restoredActiveRate,
  legacyRate:restoredLegacyRate,
  payrollPerMin:totalPayroll(roster)*payrollScale(restoredRate),   // era wages accrue while away too
  // Early Birds keep the park earning while you sleep (+3% each, cap +20%)
  efficiency:OFFLINE_EFFICIENCY + offlineEfficiencyBonus(roster),
  research, researchPaths:RESEARCH_PATHS, projects:RESEARCH, staff,
}) : { seconds:0, money:0, unlocked:[] };

function applyOffline(){
  if(offline.money>0) state.money+=offline.money;
  if(offline.unlocked?.length){ offline.unlocked.forEach(handleResearchUnlock); }
  if(offline.seconds>60){
    const dOff=derived();
    sim.queue=Math.min(dOff.queueCap, sim.queue);          // caught up while away
    // the plaza settles to its steady state while away (arrivals × visit length)
    sim.plaza=Math.min(dOff.plazaCapacity, Math.max(sim.plaza, dOff.plazaPop));
  }
  if(offline.money>0){ spawnBankDelta(offline.money,false); incomeTracker.record(offline.money, nowSec()); }
  refreshHUD();
}

function startGame(){
  // name at birth: a fresh game names its first coaster right on the splash
  const nm=$('splashName');
  if(nm && nm.value.trim()) coasterName=nm.value.trim().slice(0,40);
  const splash=$('splash');
  if(splash){ splash.classList.add('hiding'); setTimeout(()=>{ splash.hidden=true; }, 520); }
  audio.unlock();
  if(!audio.isMuted()) audio.startMusic();
  applyOffline();
  clock.getDelta();   // discard the long pre-Play delta so the first frame is small
  paused=false;
}

function showSplash(){
  const welcome=$('splashWelcome');
  if(welcome && offline.money>0){
    welcome.hidden=false;
    welcome.innerHTML=`While you were away (${formatDuration(offline.seconds)})<br><b>+$${fmt(offline.money)}</b>`
      + (offline.unlocked?.length?`<span class="sw-sub">${offline.unlocked.length} research project${offline.unlocked.length>1?'s':''} completed</span>`:'');
  }
  const playBtn=$('splashPlay');
  if(playBtn){
    playBtn.textContent=restoredSavedAt>0?'▶ Continue':'▶ Play';
    playBtn.addEventListener('click', startGame, { once:true });
  }
  // a fresh game (no save) names its first coaster before building
  if(restoredSavedAt===0) $('splashNameWrap')?.removeAttribute('hidden');
  const ver=$('splashVersion');
  if(ver) ver.textContent=`v${window.__TC3D_VERSION||''}`;
}

if(TEST){
  // tests drive the game directly; skip the splash gesture and offline popup
  const splash=$('splash'); if(splash) splash.hidden=true;
  paused=false;
} else {
  showSplash();
}
