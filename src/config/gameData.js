export const COL = {
  grass: 0x6fb04a,
  grassHi: 0x7fc057,
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
  liftSpeed: 3.6,
  brakeSpeed: 3.0,
  stationSpeed: 2.6,
  friction: 0.012,
  maxBank: 0.62,
};

export const MPH = 2.7;
export const COST_PER_M = 8;
export const FEATURE_COST = { plain: 0, lift: 120, brake: 60, loop: 900, corkscrew: 1400 };
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
  car: { name: 'Add a Car', desc: '+4 seats · longer platform', icon: '🚃', base: 60, growth: 1.55, level: 0, cat: 'ride' },
  seats: { name: 'Roomier Cars', desc: '+2 seats per car', icon: '💺', base: 95, growth: 1.60, level: 0, max: 8, cat: 'ride' },
  speed: { name: 'Faster Track', desc: 'More launch energy', icon: '⚡', base: 80, growth: 1.50, level: 0, cat: 'ride' },
  train: { name: 'Add a Train', desc: 'Another train on track', icon: '🎢', base: 500, growth: 3.20, level: 0, max: 2, cat: 'ride' },
  queue: { name: 'Bigger Queue', desc: '+10 people can wait in line', icon: '🚧', base: 110, growth: 1.55, level: 0, max: 8, cat: 'queue' },
  snacks: { name: 'Snack Stands', desc: '+$3/min per waiting guest', icon: '🍿', base: 200, growth: 2.00, level: 0, max: 6, cat: 'queue' },
  loading: { name: 'Fast Boarding', desc: 'Quicker load & unload', icon: '🏃', base: 130, growth: 1.65, level: 0, max: 6, cat: 'loading' },
  dispatch: { name: 'Dispatch Speed', desc: 'Faster auto-launch (needs Auto Dispatch)', icon: '🚦', base: 180, growth: 1.70, level: 0, max: 8, cat: 'loading' },
  express: { name: 'Express Lane', desc: '+$5 bonus per rider', icon: '🌟', base: 350, growth: 1.80, level: 0, cat: 'loading' },
  ticket: { name: 'Ticket Price', desc: '+$1 per rider', icon: '🎟️', base: 50, growth: 1.45, level: 0, cat: 'marketing' },
  market: { name: 'Marketing', desc: 'More guests · excitement pays', icon: '📣', base: 160, growth: 1.75, level: 0, max: 6, cat: 'marketing' },
  hype: { name: 'Theming & Hype', desc: '×1.12 to all earnings', icon: '🎪', base: 120, growth: 1.70, level: 0, cat: 'marketing' },
};

export const SHOP_ORDER = ['car', 'seats', 'speed', 'train', 'queue', 'snacks', 'loading', 'dispatch', 'express', 'ticket', 'market', 'hype'];

export const CATS = [
  { id: 'ride', icon: '🎢', name: 'Ride' },
  { id: 'queue', icon: '🚧', name: 'Queue' },
  { id: 'loading', icon: '🏃', name: 'Board' },
  { id: 'marketing', icon: '📣', name: 'Promo' },
  { id: 'research', icon: '🔬', name: 'R&D' },
];

export const RESEARCH = {
  brakes: { name: 'Block Brakes', desc: 'Unlock 🛑 brake track', icon: '🛑', rp: 60 },
  loop: { name: 'Vertical Loop', desc: 'Unlock 🔁 loop track', icon: '🔁', rp: 150 },
  cork: { name: 'Corkscrew', desc: 'Unlock 🌀 corkscrew track', icon: '🌀', rp: 260 },
  photo: { name: 'On-Ride Photo', desc: '+15% ride income', icon: '📸', rp: 180 },
  launch: { name: 'Launch System', desc: '+1 free Faster Track level', icon: '🚀', rp: 220 },
  autodispatch: { name: 'Auto Dispatch', desc: 'Ready trains launch themselves', icon: '🤖', rp: 200 },
  queue2: { name: 'Switchback Pro', desc: '+30 max queue capacity', icon: '🧱', rp: 160 },
  train3: { name: 'Block Sections', desc: 'Allow a 3rd train', icon: '🚆', rp: 340 },
};

export const RESEARCH_ORDER = ['brakes', 'loop', 'cork', 'photo', 'launch', 'autodispatch', 'queue2', 'train3'];
export const BUDGETS = [0, 30, 90, 240];

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
