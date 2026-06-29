import {
  applyResearchEffects as applyResearchEffectsModel,
  deriveEconomy,
  featureUnlocked as featureUnlockedModel,
  formatMoney,
  gradeFor,
  hasResearchKey,
  upgradeCost,
} from './systems/economy.js';

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
//  TRACK PATH  (centerline samples with explicit frames + physics)
// =========================================================================
const SEG_SAMPLES=24, LOOP_SAMPLES=48, CORK_SAMPLES=46;

function catmull(p0,p1,p2,p3,t){
  const t2=t*t,t3=t2*t;
  const f=(a,b,c,d)=>0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
  return new THREE.Vector3(f(p0.x,p1.x,p2.x,p3.x),f(p0.y,p1.y,p2.y,p3.y),f(p0.z,p1.z,p2.z,p3.z));
}
const horiz=v=>{const h=new THREE.Vector3(v.x,0,v.z);return h.lengthSq()<1e-6?new THREE.Vector3(1,0,0):h.normalize();};

// ── fixed station ───────────────────────────────────────────────────────────
// Points 0 & 1 are the two ends of the station: a fixed, flat, straight
// boarding straightaway whose length always matches the platform.
const STATION = { cx:0, cz:9.0, y:0.7 };
function stationLength(){ return 3.5 + Math.min(1+UPGRADES.car.level,8)*2.2; }  // == platform length
function syncStationPoints(){
  const half=stationLength()/2, a=ctrlPts[0], b=ctrlPts[1];
  if(a){ a.x=STATION.cx+half; a.z=STATION.cz; a.y=STATION.y; a.station=true; a.seg='station'; }  // entrance (train arrives)
  if(b){ b.x=STATION.cx-half; b.z=STATION.cz; b.y=STATION.y; b.station=true; b.seg='plain';   }  // exit (out to the track)
}

// build raw centerline (positions + per-sample kind + optional featureUp)
function buildCenterline(){
  const n=ctrlPts.length;
  const P=ctrlPts.map(p=>new THREE.Vector3(p.x,p.y,p.z));
  const out=[];
  const at=i=>P[((i%n)+n)%n];
  for(let i=0;i<n;i++){
    const node=ctrlPts[i];
    const seg=node.seg||'plain';
    const p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2);

    if(seg==='loop'){
      // vertical loop detour, returns to p1, then plain spline to p2
      const fwd=horiz(new THREE.Vector3().subVectors(p1,p0));
      const R=2.3;
      const C=p1.clone().addScaledVector(WORLD_UP,R);
      for(let k=0;k<LOOP_SAMPLES;k++){
        const th=(k/LOOP_SAMPLES)*Math.PI*2;
        const pos=C.clone().addScaledVector(fwd,Math.sin(th)*R).addScaledVector(WORLD_UP,-Math.cos(th)*R);
        const up=new THREE.Vector3().subVectors(C,pos).normalize();
        out.push({pos,kind:'loop',featureUp:up});
      }
      for(let k=0;k<SEG_SAMPLES;k++){
        const t=k/SEG_SAMPLES;
        out.push({pos:catmull(p0,p1,p2,p3,t),kind:'plain'});
      }
    } else if(seg==='corkscrew'){
      // helix from p1 to p2 (radius eased to 0 at both ends -> continuous)
      const axis=new THREE.Vector3().subVectors(p2,p1);
      const L=axis.length(); const axisN=axis.clone().normalize();
      let ref=Math.abs(axisN.y)>0.9?new THREE.Vector3(1,0,0):WORLD_UP;
      const n1=new THREE.Vector3().crossVectors(axisN,ref).normalize();
      const n2=new THREE.Vector3().crossVectors(axisN,n1).normalize();
      const r0=Math.min(1.7,L*0.34), turns=1;
      for(let k=0;k<CORK_SAMPLES;k++){
        const t=k/CORK_SAMPLES;
        const r=r0*Math.sin(Math.PI*t);
        const phi=Math.PI*2*turns*t;
        const center=p1.clone().addScaledVector(axisN,L*t);
        const off=n1.clone().multiplyScalar(Math.cos(phi)*r).addScaledVector(n2,Math.sin(phi)*r);
        const pos=center.clone().add(off);
        const up=r>0.05?off.clone().normalize():WORLD_UP.clone();
        out.push({pos,kind:'corkscrew',featureUp:up});
      }
    } else if(seg==='station'){
      // dead-straight, flat boarding straightaway between the two fixed ends
      for(let k=0;k<SEG_SAMPLES;k++){
        const t=k/SEG_SAMPLES;
        out.push({pos:p1.clone().lerp(p2,t),kind:'station'});
      }
    } else {
      for(let k=0;k<SEG_SAMPLES;k++){
        const t=k/SEG_SAMPLES;
        out.push({pos:catmull(p0,p1,p2,p3,t),kind:seg});
      }
    }
  }
  return out;
}

function transportUp(prevUp,t0,t1){
  const axis=new THREE.Vector3().crossVectors(t0,t1);
  const len=axis.length(); const u=prevUp.clone();
  if(len>1e-6){axis.multiplyScalar(1/len);u.applyAxisAngle(axis,Math.atan2(len,t0.dot(t1)));}
  u.addScaledVector(t1,-u.dot(t1));
  if(u.lengthSq()<1e-9){u.copy(WORLD_UP).addScaledVector(t1,-t1.y); if(u.lengthSq()<1e-9)u.set(1,0,0);}
  return u.normalize();
}

// full path build: frames, arc length, speed profile, g-forces, stats
function buildPath(){
  syncStationPoints();          // station ends are always fixed, flat & platform-length apart
  const raw=buildCenterline();
  const N=raw.length;
  const pos=raw.map(r=>r.pos);
  const kind=raw.map(r=>r.kind);
  const featUp=raw.map(r=>r.featureUp||null);

  // tangents (central difference, closed)
  const tan=[];
  for(let i=0;i<N;i++){
    const a=pos[(i-1+N)%N],b=pos[(i+1)%N];
    const t=new THREE.Vector3().subVectors(b,a);
    if(t.lengthSq()<1e-9)t.copy(tan[i-1]||new THREE.Vector3(1,0,0));
    tan.push(t.normalize());
  }
  // arc length & height
  const cum=[0]; let len=0;
  for(let i=0;i<N;i++){
    const d=pos[(i+1)%N].distanceTo(pos[i]); len+=d; cum.push(len);
  }
  const height=pos.map(p=>p.y);
  const hMax=Math.max(...height), hMin=Math.min(...height);

  // speed profile (energy based) + speed upgrade
  const speedMult=Math.pow(1.08,UPGRADES.speed.level+(hasResearch('launch')?1:0));
  const E=PHYS.g*hMax+0.5*PHYS.vCrest*PHYS.vCrest;
  const speed=new Array(N);
  for(let i=0;i<N;i++){
    const k=kind[i];
    if(k==='lift'){ speed[i]=PHYS.liftSpeed; }
    else if(k==='brake'){ speed[i]=PHYS.brakeSpeed*speedMult; }
    else if(k==='station'){ speed[i]=PHYS.stationSpeed; }
    else{
      const v2=2*(E-PHYS.g*height[i])*(1-PHYS.friction);
      speed[i]=Math.max(PHYS.vMin, Math.sqrt(Math.max(v2,0)))*speedMult;
    }
  }

  // local arc length around sample i (always positive, seam-safe)
  const localDs=i=>{
    const dp=pos[i].distanceTo(pos[(i-1+N)%N]);
    const dn=pos[(i+1)%N].distanceTo(pos[i]);
    return Math.max(dp+dn,1e-3);
  };
  // curvature vector at sample i
  const curvature=i=>{
    const a=tan[(i-1+N)%N],b=tan[(i+1)%N];
    return new THREE.Vector3().subVectors(b,a).multiplyScalar(1/localDs(i));
  };

  // frames: keep an UNBANKED parallel-transport base for continuity,
  // then apply banking as a non-accumulating offset on a copy.
  const up=new Array(N), right=new Array(N), baseUp=new Array(N);
  let seed=WORLD_UP.clone().addScaledVector(tan[0],-tan[0].y);
  if(seed.lengthSq()<1e-9)seed.set(1,0,0); seed.normalize();
  for(let i=0;i<N;i++){
    let bUp;
    if(featUp[i]){
      bUp=featUp[i].clone(); bUp.addScaledVector(tan[i],-bUp.dot(tan[i]));
      if(bUp.lengthSq()<1e-9)bUp.copy(i?baseUp[i-1]:seed); bUp.normalize();
    } else {
      bUp=(i===0)?seed.clone():transportUp(baseUp[i-1],tan[i-1],tan[i]);
    }
    baseUp[i]=bUp.clone();
    let fUp=bUp.clone();
    if(!featUp[i]){
      const kv=curvature(i);
      const rTmp=new THREE.Vector3().crossVectors(bUp,tan[i]).normalize();
      const aLat=speed[i]*speed[i]*kv.dot(rTmp);
      const bank=Math.max(-PHYS.maxBank,Math.min(PHYS.maxBank,Math.atan2(aLat,PHYS.g)));
      fUp.applyAxisAngle(tan[i],-bank);
    }
    right[i]=new THREE.Vector3().crossVectors(fUp,tan[i]).normalize();
    up[i]=new THREE.Vector3().crossVectors(tan[i],right[i]).normalize();
  }

  // g-forces + stats (per-sample g clamped so one tight sample can't dominate)
  const GCAP=5.0;
  let maxSpeed=0,maxVertG=-99,minVertG=99,maxLatG=0,airCount=0,dirChanges=0,lapTime=0;
  let prevLatSign=0, maxDrop=0, runDrop=0;
  for(let i=0;i<N;i++){
    const ds=(cum[i+1]-cum[i])||0.001;
    lapTime+=ds/Math.max(speed[i],0.5);
    maxSpeed=Math.max(maxSpeed,speed[i]);
    // descent run
    const dh=height[(i+1)%N]-height[i];
    if(dh<0){ runDrop-=dh; maxDrop=Math.max(maxDrop,runDrop); } else { runDrop=0; }
    // curvature vector (seam-safe) → felt accel = centripetal + gravity-support
    const ac=curvature(i).multiplyScalar(speed[i]*speed[i]);
    const felt=ac.add(new THREE.Vector3(0,PHYS.g,0));
    let gV=felt.dot(up[i])/PHYS.g, gL=felt.dot(right[i])/PHYS.g;
    gV=Math.max(-GCAP,Math.min(GCAP,gV)); gL=Math.max(-GCAP,Math.min(GCAP,gL));
    maxVertG=Math.max(maxVertG,gV); minVertG=Math.min(minVertG,gV);
    maxLatG=Math.max(maxLatG,Math.abs(gL));
    if(gV<0.2)airCount++;
    if(Math.abs(gL)>0.4){ const sgn=Math.sign(gL); if(prevLatSign!==0&&sgn!==prevLatSign)dirChanges++; prevLatSign=sgn; }
  }
  dirChanges=Math.min(dirChanges,20);
  const airBonus=Math.min(airCount,Math.round(N*0.25));
  const sp=maxSpeed;

  const inversions=ctrlPts.filter(p=>p.seg==='loop'||p.seg==='corkscrew').length;
  let excitement=2 + maxDrop*2.2 + sp*0.5 + inversions*7 + airBonus*0.12 + len*0.13 + Math.min(maxVertG,4)*1.1;
  let intensity =4 + sp*0.55 + maxVertG*5 + maxLatG*6 + inversions*5;
  let nausea    =maxLatG*7 + inversions*6 + dirChanges*0.7 + Math.max(0,intensity-55)*0.3;
  if(intensity>80)excitement*=0.85;      // RCT: punishing rides lose appeal
  if(intensity>120)excitement*=0.8;
  excitement=Math.max(0,excitement);

  const stats={length:Math.round(len),lapTime,maxSpeed,maxVertG,minVertG,maxLatG,
               inversions,airCount,dirChanges,maxDrop,
               excitement:+excitement.toFixed(1),intensity:+intensity.toFixed(1),nausea:+nausea.toFixed(1)};

  path={N,pos,tan,up,right,kind,cum,len,height,speed,stats};
  return path;
}

// arc-length sampling
function sampleAt(s){
  const L=path.len; s=((s%L)+L)%L;
  const cum=path.cum, N=path.N;
  let lo=0,hi=N; while(lo<hi){const m=(lo+hi)>>1; if(cum[m]<=s)lo=m+1; else hi=m;}
  const i=Math.max(0,lo-1); const i2=(i+1)%N;
  const t=(s-cum[i])/((cum[i+1]-cum[i])||1);
  const pos=path.pos[i].clone().lerp(path.pos[i2],t);
  const tan=path.tan[i].clone().lerp(path.tan[i2],t).normalize();
  let up=path.up[i].clone().lerp(path.up[i2],t);
  up.addScaledVector(tan,-up.dot(tan)); if(up.lengthSq()<1e-9)up.copy(path.up[i]); up.normalize();
  const right=new THREE.Vector3().crossVectors(up,tan).normalize();
  up=new THREE.Vector3().crossVectors(tan,right).normalize();
  return {pos,tan,up,right};
}
function speedAt(s){
  const L=path.len; s=((s%L)+L)%L;
  const cum=path.cum,N=path.N;
  let lo=0,hi=N; while(lo<hi){const m=(lo+hi)>>1; if(cum[m]<=s)lo=m+1; else hi=m;}
  const i=Math.max(0,lo-1); const i2=(i+1)%N;
  const t=(s-cum[i])/((cum[i+1]-cum[i])||1);
  return path.speed[i]*(1-t)+path.speed[i2]*t;
}

// =========================================================================
//  TRACK GEOMETRY
// =========================================================================
const trackGrp=new THREE.Group(); scene.add(trackGrp);
const GAUGE=1.15;

function buildTrackGeometry(){
  disposeGroup(trackGrp);
  const {pos,up,right,tan,kind,N}=path;
  const railMat =new THREE.MeshStandardMaterial({color:COL.rail,metalness:.6,roughness:.35});
  const spineMat=new THREE.MeshStandardMaterial({color:COL.track,roughness:.55});
  const supMat  =new THREE.MeshStandardMaterial({color:COL.support,roughness:.6});

  // spine (round tube – internal frame irrelevant)
  const centerCurve=new THREE.CatmullRomCurve3(pos.map(p=>p.clone()),true);
  const spine=new THREE.Mesh(new THREE.TubeGeometry(centerCurve,N,0.16,7,true),spineMat);
  spine.castShadow=true; trackGrp.add(spine);

  // rails from explicit offsets
  const leftPts=[],rightPts=[];
  for(let i=0;i<N;i++){
    leftPts.push(pos[i].clone().addScaledVector(right[i], GAUGE/2));
    rightPts.push(pos[i].clone().addScaledVector(right[i],-GAUGE/2));
  }
  for(const pts of [leftPts,rightPts]){
    const c=new THREE.CatmullRomCurve3(pts,true);
    const m=new THREE.Mesh(new THREE.TubeGeometry(c,N,0.09,6,true),railMat);
    m.castShadow=true; trackGrp.add(m);
  }

  // ties (coloured by segment kind) – use explicit frames
  const tieGeo=new THREE.BoxGeometry(GAUGE+0.5,0.08,0.18);
  const tieMats={
    lift:new THREE.MeshLambertMaterial({color:COL.tieLift}),
    brake:new THREE.MeshLambertMaterial({color:COL.tieBrake}),
    station:new THREE.MeshLambertMaterial({color:COL.tieStn}),
    plain:new THREE.MeshLambertMaterial({color:COL.tiePlain}),
    loop:new THREE.MeshLambertMaterial({color:COL.track}),
    corkscrew:new THREE.MeshLambertMaterial({color:COL.track}),
  };
  for(let i=0;i<N;i+=4){
    const mat=tieMats[kind[i]]||tieMats.plain;
    const tie=new THREE.Mesh(tieGeo,mat);
    tie.position.copy(pos[i]).addScaledVector(up[i],-0.22);
    tie.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right[i],up[i],tan[i]));
    tie.castShadow=true; trackGrp.add(tie);
  }

  // supports – only on roughly-upright, elevated, non-inverting track
  for(let i=0;i<N;i+=10){
    if(kind[i]==='loop'||kind[i]==='corkscrew')continue;
    if(up[i].y<0.45)continue;
    const h=pos[i].y; if(h<0.9)continue;
    const col=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,h,8),supMat);
    col.position.set(pos[i].x,h/2-0.4,pos[i].z); col.castShadow=true; trackGrp.add(col);
  }
}

// =========================================================================
//  STATION + QUEUE (dynamic; anchored to track start)
// =========================================================================
const stationGrp=new THREE.Group(); scene.add(stationGrp);

function buildStationAndQueue(){
  disposeGroup(stationGrp);
  stationRefs.queueGuests=[];
  if(!path)return;
  const f=sampleAt(0);
  const d=derived();
  const visCars=Math.min(d.cars,8);

  // platform spans exactly the two fixed station endpoints (points 0 & 1)
  const p0=new THREE.Vector3(ctrlPts[0].x,ctrlPts[0].y,ctrlPts[0].z);
  const p1=new THREE.Vector3(ctrlPts[1].x,ctrlPts[1].y,ctrlPts[1].z);
  const center=p0.clone().add(p1).multiplyScalar(0.5);
  const tang=horiz(f.tan);                          // travel direction along the straight station
  const righ=new THREE.Vector3(f.right.x,0,f.right.z);
  if(righ.lengthSq()<1e-4)righ.set(1,0,0); righ.normalize();

  const PLAT_LEN=p0.distanceTo(p1), PLAT_W=2.8, PLAT_H=0.5, PLAT_SIDE=PLAT_W/2+0.85;
  stationRefs.platLen=PLAT_LEN;
  // lead car stops so the whole train sits centred on the platform straightaway
  const trainLen=(visCars-1)*CAR_LEN;
  stationRefs.stopS=Math.min(PLAT_LEN/2+trainLen/2, path.len*0.5);

  const grp=new THREE.Group();
  grp.setRotationFromMatrix(new THREE.Matrix4().makeBasis(tang,WORLD_UP,righ));
  grp.position.set(center.x,0,center.z);
  stationGrp.add(grp);

  box(grp,COL.platform,PLAT_LEN,PLAT_H,PLAT_W,0,PLAT_H/2,PLAT_SIDE,true);

  const postMat=new THREE.MeshLambertMaterial({color:0xcdb884}), postH=2.5;
  const nPosts=Math.max(2,Math.ceil(PLAT_LEN/2.8));
  const postZs=[PLAT_SIDE-PLAT_W/2+0.22,PLAT_SIDE+PLAT_W/2-0.22];
  for(let p=0;p<=nPosts;p++){
    const px=-PLAT_LEN/2+p*(PLAT_LEN/nPosts);
    postZs.forEach(pz=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,postH,6),postMat);m.position.set(px,PLAT_H+postH/2,pz);m.castShadow=true;grp.add(m);});
  }
  box(grp,COL.roof,PLAT_LEN+0.6,0.28,PLAT_W+0.7,0,PLAT_H+postH+0.04,PLAT_SIDE,true);
  box(grp,0xf5a623,2.0,0.6,0.16,-PLAT_LEN/2+1.0,PLAT_H+postH-0.15,PLAT_SIDE-PLAT_W/2-0.1,false);

  // snack kiosk beside the queue when snack stands are owned
  if(UPGRADES.snacks.level>0){
    const kx=PLAT_LEN/2+0.6;
    box(grp,0xe85d75,1.2,1.0,1.2,kx,0.5,PLAT_SIDE+PLAT_W/2+1.6,true);
    box(grp,COL.cloud,1.5,0.18,1.5,kx,1.15,PLAT_SIDE+PLAT_W/2+1.6,true);
  }

  // serpentine switchback queue sized to capacity, with a reusable guest pool
  const qStart=PLAT_SIDE+PLAT_W/2+0.55;
  const poolSize=Math.min(60, d.queueCap);
  buildQueue(grp,PLAT_H,qStart,poolSize,PLAT_LEN);
}

// A real theme-park switchback: parallel lanes running along local X, stacked in
// +Z. Guests walk down a lane, U-turn, walk back the next, etc. The line fills
// from the front (index 0, nearest the platform) and snakes deeper as it grows.
function buildQueue(grp,gndY,startZ,poolSize,platLen){
  const laneLen=Math.max(platLen,6), laneGap=0.95, spacing=0.72, gapW=1.15;
  const slotsPerLane=Math.max(2,Math.floor(laneLen/spacing));
  const nLanes=Math.max(1,Math.ceil(poolSize/slotsPerLane));
  const xL=-laneLen/2, xR=laneLen/2, postH=1.0, railY=gndY+postH*0.78;
  const postMat=new THREE.MeshLambertMaterial({color:0x7a5a28});
  const railMat=new THREE.MeshLambertMaterial({color:0xb88030});
  const railX=(xm,z,len)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,len,5),railMat);m.position.set(xm,railY,z);m.rotation.z=Math.PI/2;grp.add(m);};
  const railZ=(x,zm,len)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,len,5),railMat);m.position.set(x,railY,zm);m.rotation.x=Math.PI/2;grp.add(m);};
  const post=(x,z)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.075,postH,6),postMat);m.position.set(x,gndY+postH/2,z);m.castShadow=true;grp.add(m);};

  // lane-boundary rails (nLanes+1 lines along X); internal dividers have a U-turn gap
  for(let k=0;k<=nLanes;k++){
    const z=startZ-laneGap/2+k*laneGap;
    if(k===0){
      railX(xR-(laneLen-gapW)/2, z, laneLen-gapW);       // front: gap at xL onto the platform
    } else if(k===nLanes){
      railX(0,z,laneLen);                                // back wall
    } else {
      const turnAtRight=((k-1)%2===0);                   // which end lane k-1 turns at
      const solid=laneLen-gapW;
      railX(turnAtRight ? xL+solid/2 : xR-solid/2, z, solid);
    }
    post(xL,z); post(xR,z);
  }
  // close the outer side of each lane (opposite its U-turn)
  for(let j=0;j<nLanes;j++){
    const zc=startZ+j*laneGap;
    if(j%2===0) railZ(xL,zc,laneGap); else railZ(xR,zc,laneGap);
  }

  // entrance sign at the back
  const backZ=startZ-laneGap/2+nLanes*laneGap;
  post(xR,backZ+0.5);
  box(grp,COL.roof,2.0,0.42,0.16,xR-1.0,gndY+postH+0.25,backZ+0.02,false);

  // guest pool snaking front→back; index 0 boards next
  for(let i=0;i<poolSize;i++){
    const lane=Math.floor(i/slotsPerLane), idx=i%slotsPerLane;
    const z=startZ+lane*laneGap;
    const frac=slotsPerLane>1?idx/(slotsPerLane-1):0.5;
    const x=(lane%2===0) ? THREE.MathUtils.lerp(xL+0.45,xR-0.45,frac)
                         : THREE.MathUtils.lerp(xR-0.45,xL+0.45,frac);
    const g=guest(grp,x,gndY,z,i); g.visible=false; stationRefs.queueGuests.push(g);
  }
}
function updateQueueVisuals(){
  const n=Math.round(sim.queue), pool=stationRefs.queueGuests;
  for(let i=0;i<pool.length;i++) pool[i].visible = i<n;
}

function guest(grp,x,gndY,z,ci){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,0.42,6),new THREE.MeshLambertMaterial({color:GUEST_COLS[ci%GUEST_COLS.length]}));
  body.position.y=0.21;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),new THREE.MeshLambertMaterial({color:HEADS[ci%HEADS.length]}));
  head.position.y=0.5;
  g.add(body,head); g.position.set(x,gndY,z); g.castShadow=true; grp.add(g); return g;
}
function box(grp,color,w,h,d,x,y,z,shadow){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color}));
  m.position.set(x,y,z); if(shadow){m.castShadow=true;m.receiveShadow=true;} grp.add(m); return m;
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
const CAR_LEN=1.7;     // arc-length spacing between cars (metres)
let trains=[];

function buildCar(){
  const car=new THREE.Group();
  const chassis=new THREE.Mesh(new THREE.BoxGeometry(1.1,.55,1.5),new THREE.MeshStandardMaterial({color:COL.car,roughness:.5}));chassis.position.y=.45;chassis.castShadow=true;car.add(chassis);
  const trim=new THREE.Mesh(new THREE.BoxGeometry(1.16,.16,1.56),new THREE.MeshStandardMaterial({color:COL.carTrim,roughness:.5}));trim.position.y=.2;car.add(trim);
  const heads=[];
  [[-0.28,0.42],[0.28,0.42],[-0.28,-0.18],[0.28,-0.18]].forEach((sp,i)=>{
    const h=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),new THREE.MeshLambertMaterial({color:HEADS[(i*2)%HEADS.length]}));h.position.set(sp[0],.82,sp[1]);h.castShadow=true;car.add(h);heads.push(h);
  });
  car.userData.heads=heads;
  return car;
}
// show exactly `n` occupied seats across the train's cars (front cars fill first)
function setTrainOccupancy(tr,n){
  let shown=0;
  for(const car of tr.cars){
    for(const h of car.userData.heads){ h.visible = shown<n; shown++; }
  }
}
function rebuildTrains(){
  const {cars:carCount,trains:trainCount}=derived();
  const L=path?path.len:1;
  const oldS=trains.map(t=>t.s/(t.L||L));   // keep relative position
  while(trainLayer.children.length)trainLayer.remove(trainLayer.children[0]);
  trains=[];
  const visCars=Math.min(carCount,8);
  for(let n=0;n<trainCount;n++){
    const group=new THREE.Group();const cars=[];
    for(let c=0;c<visCars;c++){const m=buildCar();group.add(m);cars.push(m);}
    trainLayer.add(group);
    const frac=oldS[n]!==undefined?oldS[n]:n/trainCount;
    const tr={group,s:frac*L,prevS:frac*L,L,cars,mode:'run',phase:'',timer:0,boarded:0,startBoard:0,cycleBoard:0};
    setTrainOccupancy(tr,0);
    trains.push(tr);
  }
}
function placeCar(mesh,s){
  const f=sampleAt(s);
  mesh.position.copy(f.pos).addScaledVector(f.up,0.12);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right,f.up,f.tan));
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
//  BUILD MODE
// =========================================================================
const raycaster=new THREE.Raycaster();
const mouseNDC=new THREE.Vector2();
const bm={active:false,handleGrp:new THREE.Group(),handles:[],selectedIdx:-1,hoveredIdx:-1,dragging:false,placingMode:false,snapGrid:false,dragSnapshot:null,needsRebuild:false};
scene.add(bm.handleGrp);

const HG_NORM=new THREE.SphereGeometry(0.55,12,9);
const HG_STN =new THREE.SphereGeometry(0.65,12,9);

function setMouseNDC(e){const r=renderer.domElement.getBoundingClientRect();mouseNDC.x=((e.clientX-r.left)/r.width)*2-1;mouseNDC.y=-((e.clientY-r.top)/r.height)*2+1;}

function createHandles(){
  disposeGroup(bm.handleGrp, true); bm.handles=[];
  ctrlPts.forEach((p,i)=>{
    const isStn=!!p.station;
    const mat=new THREE.MeshStandardMaterial({color:isStn?COL.handleStn:COL.handleNorm,roughness:.4,metalness:.3});
    const mesh=new THREE.Mesh(isStn?HG_STN:HG_NORM,mat);
    mesh.position.set(p.x,p.y,p.z);mesh.castShadow=true;
    bm.handleGrp.add(mesh);bm.handles.push({mesh,idx:i});
  });
  updateHandleColors();
}
function updateHandleColors(){
  bm.handles.forEach(({mesh,idx})=>{
    const isStn=!!ctrlPts[idx]?.station,isSel=idx===bm.selectedIdx,isHov=idx===bm.hoveredIdx;
    mesh.material.color.setHex(isSel?COL.handleSel:isHov?COL.handleHov:isStn?COL.handleStn:COL.handleNorm);
    mesh.scale.setScalar(isSel?1.25:isHov?1.1:1.0);
  });
}
function refreshHandlePositions(){bm.handles.forEach(({mesh,idx})=>{const p=ctrlPts[idx];if(p)mesh.position.set(p.x,p.y,p.z);});}
const snapVal=v=>bm.snapGrid?Math.round(v*2)/2:v;

function updateFeatureButtons(){
  const idx=bm.selectedIdx;
  const row=document.getElementById('featRow');
  if(idx<0||ctrlPts[idx]?.seg==='station'){ row.style.display='none'; return; }
  row.style.display='flex';
  const cur=ctrlPts[idx].seg||'plain';
  row.querySelectorAll('.bp-btn').forEach(b=>{
    const feat=b.dataset.feat;
    const locked=!featureUnlocked(feat);
    b.classList.toggle('feat-active',feat===cur);
    b.classList.toggle('locked-feat',locked);
    b.title=locked?'Unlock in the R&D shop tab (Research)':'';
  });
}

function selectHandle(idx){
  bm.selectedIdx=idx;
  const isStn=idx>=0&&!!ctrlPts[idx]?.station;
  const canDel=idx>=0&&!isStn&&ctrlPts.filter(p=>!p.station).length>2;
  document.getElementById('delBtn').disabled=!canDel;
  // station ends are fully fixed → no height controls
  document.getElementById('heightRow').style.display=(idx>=0&&!isStn)?'flex':'none';
  if(idx>=0){
    document.getElementById('heightVal').textContent=ctrlPts[idx].y.toFixed(1);
    document.getElementById('pointInfo').textContent=isStn
      ? `Station end — fixed · always flat and the length of the platform`
      : `Point ${idx+1}/${ctrlPts.length} · drag to move · scroll for height · pick a segment type below`;
  } else {
    document.getElementById('pointInfo').textContent='Click a handle to select · drag to move · scroll to change height';
  }
  updateHandleColors(); updateFeatureButtons();
}

function raycastHandles(){raycaster.setFromCamera(mouseNDC,camera);const hits=raycaster.intersectObjects(bm.handles.map(h=>h.mesh));return hits.length?bm.handles.findIndex(h=>h.mesh===hits[0].object):-1;}
function raycastGround(yLevel=0){const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-yLevel);raycaster.setFromCamera(mouseNDC,camera);const tgt=new THREE.Vector3();raycaster.ray.intersectPlane(plane,tgt);return tgt;}

renderer.domElement.addEventListener('mousedown',onMouseDown);
renderer.domElement.addEventListener('mousemove',onMouseMove);
renderer.domElement.addEventListener('mouseup',onMouseUp);
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());

// ── camera drag: left = pan, right = rotate/tilt, middle = pan ───────────────
// In build mode the left button edits points, so left-pan only applies in play mode.
let dragMode=null, dragX=0, dragY=0;
renderer.domElement.addEventListener('mousedown',e=>{
  if(e.button===2)                    dragMode='rotate';      // right → rotate
  else if(e.button===1)               dragMode='pan';         // middle → pan
  else if(e.button===0 && !bm.active) dragMode='pan';         // left (play mode) → pan
  else return;
  if(e.button!==0) e.preventDefault();                        // suppress autoscroll / context menu
  dragX=e.clientX; dragY=e.clientY;
});
window.addEventListener('mousemove',e=>{
  if(!dragMode)return;
  const dx=e.clientX-dragX, dy=e.clientY-dragY; dragX=e.clientX; dragY=e.clientY;
  if(dragMode==='rotate'){
    azimuth  -= dx*0.01;
    camHeight = Math.max(18, Math.min(132, camHeight-dy*0.4));
  } else {                                                    // pan across the ground plane
    const scale=frustum/host.clientHeight;                   // world units per pixel (scales with zoom)
    const sr=new THREE.Vector3(Math.sin(azimuth),0,-Math.cos(azimuth));   // screen-right on ground
    const su=new THREE.Vector3(-Math.cos(azimuth),0,-Math.sin(azimuth));  // screen-up on ground
    camTarget.addScaledVector(sr,-dx*scale).addScaledVector(su,dy*scale);
    camTarget.x=Math.max(-60,Math.min(60,camTarget.x));
    camTarget.z=Math.max(-60,Math.min(60,camTarget.z));
  }
});
window.addEventListener('mouseup',()=>{ dragMode=null; });
window.addEventListener('blur',()=>{ dragMode=null; });

function onMouseDown(e){
  if(!bm.active||e.button!==0)return; setMouseNDC(e);
  if(bm.placingMode){
    const pos=raycastGround(1.5); if(!pos)return;
    const insertIdx=bm.selectedIdx>=0?bm.selectedIdx+1:ctrlPts.length;
    const lenBefore=path.len;
    ctrlPts.splice(insertIdx,0,{x:snapVal(pos.x),y:1.5,z:snapVal(pos.z),seg:'plain'});
    buildPath();
    const addCost=Math.ceil((path.len-lenBefore)*COST_PER_M);
    if(addCost>state.money){
      ctrlPts.splice(insertIdx,1); rebuildAll(false);
      showToast(`Need $${fmt(addCost)} to extend the track`);
      stopPlacing(); return;
    }
    state.money-=addCost; paidLength=path.len;
    spawnCoinScreen(e.clientX,e.clientY,addCost,true);
    buildTrackGeometry(); createHandles(); selectHandle(insertIdx);
    stopPlacing(); refreshHUD(); saveGame();
    showToast(`+${(path.len-lenBefore).toFixed(1)}m of track  ·  −$${fmt(addCost)}`);
    return;
  }
  const hit=raycastHandles();
  if(hit>=0){
    selectHandle(hit);
    if(!ctrlPts[hit]?.station){   // station ends are fixed — selectable for info, not draggable
      bm.dragging=true;
      bm.dragSnapshot=ctrlPts.map(p=>({...p}));
    }
    e.stopPropagation();
  } else selectHandle(-1);
}
function onMouseMove(e){
  if(!bm.active)return; setMouseNDC(e);
  if(bm.dragging&&bm.selectedIdx>=0){
    const p=ctrlPts[bm.selectedIdx];
    const pos=raycastGround(p.y); if(!pos)return;
    p.x=snapVal(pos.x); p.z=snapVal(pos.z); if(p.station)p.y=0.7;
    refreshHandlePositions();
    bm.needsRebuild=true;   // coalesced: the rAF loop rebuilds once per frame
    document.getElementById('pointInfo').textContent=`Point ${bm.selectedIdx+1}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
    return;
  }
  const hit=raycastHandles();
  if(hit!==bm.hoveredIdx){bm.hoveredIdx=hit;updateHandleColors();}
}
function onMouseUp(){
  if(!bm.dragging)return;
  bm.dragging=false;
  if(bm.needsRebuild){ buildPath(); buildTrackGeometry(); bm.needsRebuild=false; }  // flush pending drag frame
  commitTrackEdit(bm.dragSnapshot);
  selectHandle(bm.selectedIdx); saveGame();
}

// Charge (or refund) for the track-length change since it was last paid for.
// If an extension is unaffordable, revert ctrlPts to `snapshot`. Returns false on revert.
function commitTrackEdit(snapshot){
  const delta=path.len-paidLength;
  if(delta>0.05){
    const cost=Math.ceil(delta*COST_PER_M);
    if(cost>state.money){
      ctrlPts=snapshot.map(p=>({...p}));
      buildPath(); buildTrackGeometry(); refreshHandlePositions();
      showToast(`Not enough funds — needed $${fmt(cost)} for ${delta.toFixed(1)}m`);
      refreshHUD(); updateBuildCost(); return false;
    }
    state.money-=cost; paidLength=path.len;
    showToast(`Track +${delta.toFixed(1)}m  ·  −$${fmt(cost)}`);
  } else if(delta<-0.05){
    const refund=Math.floor(-delta*COST_PER_M*FEATURE_REFUND);
    state.money+=refund; paidLength=path.len;
    if(refund>0)showToast(`Track −${(-delta).toFixed(1)}m  ·  +$${fmt(refund)} refunded`);
  }
  refreshHUD(); updateBuildCost(); return true;
}

renderer.domElement.addEventListener('wheel',e=>{
  e.preventDefault();
  if(bm.active&&bm.selectedIdx>=0&&!ctrlPts[bm.selectedIdx]?.station){
    const snap=ctrlPts.map(p=>({...p}));
    const step=e.shiftKey?0.1:0.5; const p=ctrlPts[bm.selectedIdx];
    p.y=Math.max(0.2,Math.round((p.y-Math.sign(e.deltaY)*step)*10)/10);
    refreshHandlePositions(); buildPath(); buildTrackGeometry();
    commitTrackEdit(snap);
    document.getElementById('heightVal').textContent=ctrlPts[bm.selectedIdx].y.toFixed(1);
  } else {
    zoomBy(e.deltaY>0?1.12:1/1.12);   // smooth multiplicative zoom (works in build mode too)
  }
},{passive:false});

// ── build panel buttons ─────────────────────────────────────────────────
function stopPlacing(){
  bm.placingMode=false;
  const b=document.getElementById('addBtn'); b.textContent='＋ Add Point'; b.classList.remove('placing');
}
document.getElementById('addBtn').addEventListener('click',()=>{
  bm.placingMode=!bm.placingMode;
  const b=document.getElementById('addBtn');
  if(bm.placingMode){b.textContent='✕ Cancel';b.classList.add('placing');document.getElementById('pointInfo').textContent='Click the ground to place a new point (charged per metre added)';}
  else stopPlacing();
});
document.getElementById('delBtn').addEventListener('click',()=>{
  const idx=bm.selectedIdx;
  if(idx<0||ctrlPts[idx]?.station||ctrlPts.filter(p=>!p.station).length<=2)return;
  const wasFeat=ctrlPts[idx].seg;
  ctrlPts.splice(idx,1);
  buildPath();
  // refund both feature (if any) and shortened track
  if(FEATURE_COST[wasFeat]) state.money+=Math.floor(FEATURE_COST[wasFeat]*FEATURE_REFUND);
  const delta=path.len-paidLength;
  if(delta<0)state.money+=Math.floor(-delta*COST_PER_M*FEATURE_REFUND);
  paidLength=path.len;
  rebuildAll(false); createHandles(); selectHandle(-1); refreshHUD(); saveGame();
  showToast('Point removed · partial refund');
});
document.getElementById('snapBtn').addEventListener('click',()=>{
  bm.snapGrid=!bm.snapGrid; const b=document.getElementById('snapBtn');
  b.textContent=bm.snapGrid?'Grid On':'Grid Off';
  b.style.background=bm.snapGrid?'var(--good)':''; b.style.color=bm.snapGrid?'#fff':'';
});
const adjHeight=(d)=>{
  if(bm.selectedIdx<0||ctrlPts[bm.selectedIdx]?.station)return;
  const snap=ctrlPts.map(p=>({...p}));
  const p=ctrlPts[bm.selectedIdx];
  p.y=Math.max(0.2,Math.round((p.y+d)*10)/10);
  refreshHandlePositions(); buildPath(); buildTrackGeometry();
  commitTrackEdit(snap);
  document.getElementById('heightVal').textContent=ctrlPts[bm.selectedIdx].y.toFixed(1);
};
document.getElementById('hUp').addEventListener('click',()=>adjHeight(0.5));
document.getElementById('hDown').addEventListener('click',()=>adjHeight(-0.5));

// feature buttons
document.getElementById('featRow').addEventListener('click',e=>{
  const btn=e.target.closest('.bp-btn'); if(!btn)return;
  const idx=bm.selectedIdx; if(idx<0||ctrlPts[idx]?.station)return;
  const next=btn.dataset.feat; const cur=ctrlPts[idx].seg||'plain';
  if(next===cur)return;
  if(!featureUnlocked(next)){ showToast(`🔒 ${next} is locked — research it in the R&D shop tab first`); return; }
  const net=(FEATURE_COST[next]||0)-Math.floor((FEATURE_COST[cur]||0)*FEATURE_REFUND);
  if(net>state.money){ showToast(`Need $${fmt(net)} for ${next}`); return; }
  ctrlPts[idx].seg=next;
  state.money-=net;
  rebuildAll(false);
  paidLength=path.len;                  // feature detour length is covered by its fee
  createHandles(); selectHandle(idx);
  refreshHUD(); updateBuildCost(); saveGame();
  showToast(net>=0?`${next} added · −$${fmt(net)}`:`${next} · +$${fmt(-net)} refunded`);
});

function updateBuildCost(){
  if(!path)return;
  document.getElementById('buildCost').innerHTML=
    `Track: <b>${path.stats.length}m</b> · EXC <b>${path.stats.excitement}</b> / INT <b>${path.stats.intensity}</b> · build <b>$${COST_PER_M}/m</b>`;
}

function enterBuildMode(){
  bm.active=true;bm.selectedIdx=-1;stopPlacing();
  createHandles();
  document.getElementById('buildPanel').classList.remove('hidden');
  document.getElementById('modeBadge').classList.add('visible');
  document.getElementById('buildToggle').classList.add('active');
  document.getElementById('shop').classList.add('hidden');
  selectHandle(-1); updateBuildCost();
  showToast('Build Mode — yellow: track · red: station · pay per metre & per feature');
}
function exitBuildMode(){
  bm.active=false;bm.selectedIdx=-1;bm.hoveredIdx=-1;bm.dragging=false;stopPlacing();
  disposeGroup(bm.handleGrp, true);bm.handles=[];
  document.getElementById('buildPanel').classList.add('hidden');
  document.getElementById('modeBadge').classList.remove('visible');
  document.getElementById('buildToggle').classList.remove('active');
  document.getElementById('shop').classList.remove('hidden');
  rebuildAll(true);
  trains.forEach((tr,i)=>{tr.s=(i/trains.length)*path.len;tr.prevS=tr.s;tr.L=path.len;tr.mode='run';tr.phase='';tr.timer=0;});
  refreshHUD(); saveGame();
  showToast(`Track saved! Excitement ${path.stats.excitement}`);
}
document.getElementById('buildToggle').addEventListener('click',()=>bm.active?exitBuildMode():enterBuildMode());

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
//  CAMERA CONTROLS
// =========================================================================
function zoomBy(f){ frustum=Math.min(MAX_FRUSTUM,Math.max(MIN_FRUSTUM,frustum*f)); resize(); }
function rotateView(dir){ azimuth += dir*Math.PI/4; }   // +1 = left, -1 = right
$('rotL').addEventListener('click',()=>rotateView(+1));
$('rotR').addEventListener('click',()=>rotateView(-1));
$('zoomIn').addEventListener('click',()=>zoomBy(0.8));
$('zoomOut').addEventListener('click',()=>zoomBy(1.25));
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  const k=e.key.toLowerCase();
  if(k==='q'||k==='a'||e.key==='ArrowLeft')  rotateView(+1);
  if(k==='e'||k==='d'||e.key==='ArrowRight') rotateView(-1);
  if(e.key==='='||e.key==='+')zoomBy(0.8);
  if(e.key==='-')zoomBy(1.25);
  if(e.key==='b'||e.key==='B')bm.active?exitBuildMode():enterBuildMode();
  if(e.key==='Escape'&&bm.active){
    if(bm.placingMode)stopPlacing();
    else if(bm.selectedIdx>=0)selectHandle(-1);
    else exitBuildMode();
  }
  if(bm.active&&bm.selectedIdx>=0){
    if(e.key==='ArrowUp'){adjHeight(0.5);e.preventDefault();}
    if(e.key==='ArrowDown'){adjHeight(-0.5);e.preventDefault();}
    if(e.key==='Delete'||e.key==='Backspace'){document.getElementById('delBtn').click();e.preventDefault();}
  }
});

// =========================================================================
//  SAVE / LOAD
// =========================================================================
function saveGame(){
  try{localStorage.setItem('tc3d_v5',JSON.stringify({
    money:state.money,rides:state.rides,queue:sim.queue,
    upgrades:Object.fromEntries(Object.entries(UPGRADES).map(([k,v])=>[k,v.level])),
    research:{budget:research.budget,points:research.points,done:research.done},
    ctrlPts,paidLength,frustum,azimuth,
  }));}catch(_){}
}
function loadGame(){
  try{
    const raw=localStorage.getItem('tc3d_v5')||localStorage.getItem('tc3d_v4')||localStorage.getItem('tc3d_v3'); if(!raw)return;
    const d=JSON.parse(raw);
    if(typeof d.money==='number')state.money=d.money;
    if(typeof d.rides==='number')state.rides=d.rides;
    if(typeof d.queue==='number')sim.queue=d.queue;
    if(d.upgrades)Object.entries(d.upgrades).forEach(([k,lv])=>{
      if(k==='capacity'&&UPGRADES.seats)UPGRADES.seats.level=lv;  // migrate old key
      else if(UPGRADES[k])UPGRADES[k].level=lv;
    });
    if(d.research){
      if(typeof d.research.budget==='number')research.budget=d.research.budget;
      if(typeof d.research.points==='number')research.points=d.research.points;
      if(d.research.done)research.done={...d.research.done};
    }
    if(Array.isArray(d.ctrlPts)&&d.ctrlPts.length>=3){
      ctrlPts=d.ctrlPts.map(p=>({seg:p.seg||'plain',...p}));
      if(ctrlPts[0])ctrlPts[0].seg='station';  // first point stays a boarding segment
    }
    if(typeof d.paidLength==='number')paidLength=d.paidLength;
    if(typeof d.frustum==='number')frustum=d.frustum;
    if(typeof d.azimuth==='number')azimuth=d.azimuth;
  }catch(_){}
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
