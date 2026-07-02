export const COL = {
  grass: 0x6fb04a,
  grassHi: 0x7fc057,
  dirt: 0xb98a4f,
  dirtDark: 0x6b4a2a,
  sand: 0xd8c79a,
  sandSide: 0xb99a62,
  landBorder: 0xf5f0d7,
  landCandidate: 0xf5a623,
  track: 0xe8533f,
  rail: 0xf2f2f2,
  support: 0xf5a623,
  car: 0x2f80ed,
  carTrim: 0xffffff,
  trunk: 0x8a5a2b,
  leaf: 0x4e9c46,
  leafHi: 0x66b85c,
  cloud: 0xffffff,
  platform: 0xd8c79a,
  roof: 0xe8533f,
  handleNorm: 0xffcc00,
  handleStn: 0xff6644,
  handleSel: 0x6c47ff,
  handleHov: 0xffffff,
  tieLift: 0xf5a623,
  tieBrake: 0x444a55,
  tieStn: 0x9a7b4f,
  tiePlain: 0x6b3f1f,
};

export const HEADS = [0xffd29b, 0xf2b27a, 0xd99463, 0x8a5a3a, 0xf6e2c8];
export const GUEST_COLS = [0xe85d75, 0x4a8fe7, 0x46b06a, 0xf2b134, 0xa855f7];

export const PHYS = {
  g: 18,
  vMin: 4.0,
  vCrest: 3.4,
  launchSpeed: 12.5,
  rollbackSpeed: 2.2,
  liftSpeed: 3.6,
  brakeSpeed: 3.0,
  stationSpeed: 2.6,
  friction: 0.012,
  maxBank: 0.62,
};

export const MPH = 2.7;
export const MAX_TRACK_HEIGHT = 18;
export const COST_PER_M = 12;
export const FEATURE_COST = { plain: 0, lift: 180, brake: 100, loop: 1800, corkscrew: 2800 };
export const FEATURE_REFUND = 0.6;

export const DEFAULT_CTRL = [
  { x: 2.85, y: 0.7, z: 9.0, station: true, seg: 'station' },
  { x: -2.85, y: 0.7, z: 9.0, station: true, seg: 'plain' },
  { x: -7.5, y: 0.9, z: 5.5, seg: 'plain' },
  { x: -9.8, y: 1.1, z: 0.0, seg: 'plain' },
  { x: -7.5, y: 0.9, z: -5.5, seg: 'plain' },
  { x: 0.0, y: 1.3, z: -9.3, seg: 'plain' },
  { x: 7.5, y: 0.9, z: -5.5, seg: 'plain' },
  { x: 9.8, y: 1.1, z: 0.0, seg: 'plain' },
  { x: 7.5, y: 0.9, z: 5.5, seg: 'plain' },
];

export const UPGRADES = {
  car: { name: 'Add a Car', desc: '+4 seats · longer platform', icon: '🚃', base: 90, growth: 2.05, level: 0, max: 16, cat: 'ride' },
  seats: { name: 'Roomier Cars', desc: '+2 seats per car', icon: '💺', base: 130, growth: 2.05, level: 0, max: 24, cat: 'ride' },
  speed: { name: 'Faster Track', desc: 'More launch energy', icon: '⚡', base: 120, growth: 2.08, level: 0, max: 30, cat: 'ride' },
  train: { name: 'Add a Train', desc: 'Another train on track', icon: '🎢', base: 2500, growth: 5.8, level: 0, max: 4, cat: 'ride' },
  queue: { name: 'Bigger Queue', desc: '+10 people can wait in line', icon: '🚧', base: 170, growth: 2.08, level: 0, max: 24, cat: 'queue' },
  snacks: { name: 'Snack Stands', desc: '+$3/min per waiting guest', icon: '🍿', base: 320, growth: 2.55, level: 0, max: 18, cat: 'queue' },
  express: { name: 'Express Lane', desc: '+$5 bonus per rider', icon: '🌟', base: 650, growth: 2.35, level: 0, max: 18, cat: 'marketing' },
  ticket: { name: 'Ticket Price', desc: '+$1 per rider', icon: '🎟️', base: 85, growth: 1.92, level: 0, max: 30, cat: 'marketing' },
  market: { name: 'Marketing', desc: 'More guests · excitement pays', icon: '📣', base: 260, growth: 2.3, level: 0, max: 18, cat: 'marketing' },
  hype: { name: 'Theming & Hype', desc: '×1.12 to all earnings', icon: '🎪', base: 260, growth: 2.35, level: 0, max: 24, cat: 'marketing' },
};

export const SHOP_ORDER = ['car', 'seats', 'speed', 'train', 'queue', 'snacks', 'ticket', 'market', 'hype', 'express'];

export const CATS = [
  { id: 'ride', icon: '🎢', name: 'Ride' },
  { id: 'queue', icon: '🚧', name: 'Queue' },
  { id: 'decor', icon: '🌸', name: 'Decor' },
  { id: 'marketing', icon: '📣', name: 'Promo' },
  { id: 'research', icon: '🔬', name: 'R&D' },
];

// ── staff (hired & trained in the Staff panel, not the upgrade shop) ─────────
// Hiring and training are different levers: hiring adds bodies (coverage),
// training makes every member of the role better at their specialty.
export const STAFF = {
  operators: {
    name: 'Ride Operators', icon: '🧑‍🔧',
    desc: 'Crew the platform and launch the trains.',
    hireDesc: 'each hire boards guests faster · first hire enables auto-launch',
    trainDesc: 'drilled crews launch sooner after boarding',
    hireBase: 260, hireGrowth: 2.1, hireMax: 8,
    trainBase: 480, trainGrowth: 2.45, trainMax: 6,
  },
  entertainers: {
    name: 'Entertainers', icon: '🤹',
    desc: 'Work the crowd outside the gates.',
    hireDesc: 'each hire draws more guests to the park',
    trainDesc: 'better shows keep a longer line happy (+queue capacity)',
    hireBase: 220, hireGrowth: 2.05, hireMax: 8,
    trainBase: 460, trainGrowth: 2.4, trainMax: 6,
  },
  mechanics: {
    name: 'Mechanics', icon: '🔧',
    desc: 'Install new cars and keep the ride humming.',
    hireDesc: 'each hire speeds up car & train installs',
    trainDesc: 'certified upkeep earns more per rider',
    hireBase: 320, hireGrowth: 2.12, hireMax: 8,
    trainBase: 620, trainGrowth: 2.45, trainMax: 6,
  },
  janitors: {
    name: 'Janitors', icon: '🧹',
    desc: 'Keep the plaza spotless.',
    hireDesc: 'each hire lifts snack sales in the queue',
    trainDesc: 'a gleaming park impresses guests (+ride rating income)',
    hireBase: 200, hireGrowth: 2.05, hireMax: 8,
    trainBase: 430, trainGrowth: 2.4, trainMax: 6,
  },
  photographers: {
    name: 'Photographers', icon: '📸',
    desc: 'Sell on-ride photos at the exit ramp.',
    hireDesc: 'each hire sells photos on every dispatched train',
    trainDesc: 'better shots sell for more (scales with excitement)',
    hireBase: 420, hireGrowth: 2.15, hireMax: 6,
    trainBase: 820, trainGrowth: 2.55, trainMax: 5,
  },
};
export const STAFF_ORDER = ['operators', 'entertainers', 'mechanics', 'janitors', 'photographers'];

export const RESEARCH = {
  brakes: { name: 'Block Brakes', desc: 'Unlock 🛑 brake track', icon: '🛑', rp: 300 },
  loop: { name: 'Vertical Loop', desc: 'Unlock 🔁 loop track', icon: '🔁', rp: 850 },
  cork: { name: 'Corkscrew', desc: 'Unlock 🌀 corkscrew track', icon: '🌀', rp: 1500 },
  photo: { name: 'On-Ride Photo', desc: '+15% ride income', icon: '📸', rp: 1000 },
  launch: { name: 'Launch System', desc: '+1 free Faster Track level', icon: '🚀', rp: 1300 },
  queue2: { name: 'Switchback Pro', desc: '+30 max queue capacity', icon: '🧱', rp: 900 },
  train3: { name: 'Block Sections', desc: 'Raise train cap to 9 trains', icon: '🚆', rp: 2200 },
};

export const RESEARCH_ORDER = ['brakes', 'loop', 'cork', 'photo', 'launch', 'queue2', 'train3'];

export const STN = {
  arrivalBase: 0.6,
  baseUnload: 1.8,
  baseLoad: 2.2,
  snackPerGuest: 3,
  snackCap: 30,
  queueBase: 10,
  queueStep: 10,
  baseDispatch: 3.0,   // seconds a ready train waits before auto-launch (level 0)
};

// minimum arc-length gap a following train keeps from the rear of the train ahead
export const BLOCK_GAP = 2.4;

// ── decorations (bought from the Decor tab, placed on owned land) ────────────
export const DECOR = {
  flowers:  { name: 'Flower Bed', icon: '🌸', desc: 'A cheerful patch of colour', cost: 40 },
  lamp:     { name: 'Lamp Post',  icon: '💡', desc: 'Warm light along the paths', cost: 60 },
  topiary:  { name: 'Topiary',    icon: '🌳', desc: 'A neatly sculpted garden tree', cost: 90 },
  statue:   { name: 'Statue',     icon: '🗿', desc: 'A grand park centrepiece', cost: 220 },
  fountain: { name: 'Fountain',   icon: '⛲', desc: 'A splashy showpiece guests love', cost: 400 },
};
export const DECOR_ORDER = ['flowers', 'lamp', 'topiary', 'statue', 'fountain'];
