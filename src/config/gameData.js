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
  tieSpecial: 0x6c47ff,
  tieTunnel: 0x2f3542,
  tieTeleporter: 0x35d6ff,
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
export const FEATURE_COST = {
  plain: 0,
  lift: 180,
  brake: 100,
  loop: 1800,
  corkscrew: 2800,
  spiral: 9000,
  giantLoop: 28000,
  vertical: 16000,
  tunnel: 42000,
  teleporter: 250000,
};
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
  car: { name: 'Add a Car', desc: '+4 seats · longer platform', icon: '🚃', base: 90, growth: 2.9, level: 0, max: 16, cat: 'ride' },
  seats: { name: 'Roomier Cars', desc: '+2 seats per car', icon: '💺', base: 130, growth: 2.6, level: 0, max: 24, cat: 'ride' },
  speed: { name: 'Faster Track', desc: 'More launch energy', icon: '⚡', base: 120, growth: 2.08, level: 0, max: 30, cat: 'ride' },
  train: { name: 'Add a Train', desc: 'Another train on track', icon: '🎢', base: 2500, growth: 5.8, level: 0, max: 4, cat: 'ride' },
  queue: { name: 'Bigger Queue', desc: '+10 people can wait in line', icon: '🚧', base: 170, growth: 2.08, level: 0, max: 24, cat: 'queue' },
  snacks: { name: 'Snack Stands', desc: 'Sell to the line · scales with tickets & hype', icon: '🍿', base: 320, growth: 2.0, level: 0, max: 18, cat: 'queue' },
  canopy: { name: 'Shade Canopies', desc: '+15 waiting guests buy snacks', icon: '⛱️', base: 260, growth: 2.35, level: 0, max: 12, cat: 'queue' },
  comfort: { name: 'Queue Comfort', desc: 'Benches & fans · +8% guest arrivals', icon: '🪑', base: 380, growth: 2.4, level: 0, max: 15, cat: 'queue' },
  turnstiles: { name: 'Smart Turnstiles', desc: 'Guests board 6% faster', icon: '🎫', base: 520, growth: 2.45, level: 0, max: 12, cat: 'queue' },
  hats: { name: 'Hat Cart', desc: '+6% of riders buy a $12 hat', icon: '🎩', base: 300, growth: 2.4, level: 0, max: 8, cat: 'queue' },
  balloons: { name: 'Balloon Cart', desc: '+8% of riders buy a $6 balloon', icon: '🎈', base: 220, growth: 2.35, level: 0, max: 8, cat: 'queue' },
  express: { name: 'Express Lane', desc: '+$5 bonus per rider', icon: '🌟', base: 1500, growth: 2.6, level: 0, max: 18, cat: 'marketing' },
  ticket: { name: 'Ticket Price', desc: '+$1 per rider', icon: '🎟️', base: 85, growth: 1.92, level: 0, max: 30, cat: 'marketing' },
  market: { name: 'Marketing', desc: 'More guests · excitement pays', icon: '📣', base: 260, growth: 2.3, level: 0, max: 18, cat: 'marketing' },
  hype: { name: 'Theming & Hype', desc: '×1.12 to all earnings', icon: '🎪', base: 260, growth: 2.35, level: 0, max: 24, cat: 'marketing' },
};

export const SHOP_ORDER = ['car', 'seats', 'speed', 'train', 'queue', 'snacks', 'canopy', 'comfort', 'turnstiles', 'hats', 'balloons', 'ticket', 'market', 'hype', 'express'];

export const CATS = [
  { id: 'ride', icon: '🎢', name: 'Ride' },
  { id: 'queue', icon: '🚧', name: 'Queue' },
  { id: 'decor', icon: '🌸', name: 'Decor' },
  { id: 'marketing', icon: '📣', name: 'Promo' },
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
    trainBase: 900, trainGrowth: 3.2, trainMax: 6,
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
    trainBase: 1800, trainGrowth: 6.0, trainMax: 6,
  },
  janitors: {
    name: 'Janitors', icon: '🧹',
    desc: 'Keep the plaza spotless.',
    hireDesc: 'each hire lifts snack sales in the queue',
    trainDesc: 'a gleaming park impresses guests (+ride rating income)',
    hireBase: 200, hireGrowth: 2.05, hireMax: 8,
    trainBase: 1200, trainGrowth: 5.5, trainMax: 6,
  },
  photographers: {
    name: 'Photographers', icon: '📸',
    desc: 'Sell on-ride photos at the exit ramp.',
    hireDesc: 'each hire sells photos on every dispatched train',
    trainDesc: 'better shots sell for more (scales with excitement)',
    hireBase: 420, hireGrowth: 2.15, hireMax: 6,
    trainBase: 820, trainGrowth: 2.55, trainMax: 5,
  },
  scientists: {
    name: 'Scientists', icon: '🔬',
    desc: 'Run the R&D lab and turn funding into new technology.',
    hireDesc: 'first hire unlocks R&D · each hire adds +7% budget capacity',
    trainDesc: 'training improves funding efficiency',
    hireBase: 900, hireGrowth: 2.45, hireMax: 8,
    trainBase: 1600, trainGrowth: 2.85, trainMax: 8,
  },
};
export const STAFF_ORDER = ['operators', 'entertainers', 'mechanics', 'janitors', 'photographers', 'scientists'];

export const RESEARCH = {
  brakes: { path: 'track', name: 'Block Brakes', desc: 'Unlock 🛑 brake track', icon: '🛑', cost: 600 },
  loop: { path: 'track', name: 'Vertical Loop', desc: 'Unlock 🔁 loop track', icon: '🔁', cost: 2400 },
  cork: { path: 'track', name: 'Corkscrew', desc: 'Unlock 🌀 corkscrew track', icon: '🌀', cost: 9000 },
  spiral: { path: 'track', name: 'Spiral Lift/Drop', desc: 'Unlock compact spiral up/down track elements', icon: '🌀', cost: 42000 },
  giantLoop: { path: 'track', name: 'Giant Loop Element', desc: 'Unlock massive high-excitement loop pieces', icon: '🎢', cost: 180000 },
  verticalTrack: { path: 'track', name: 'Vertical Track', desc: 'Unlock straight up/down coaster geometry', icon: '↕️', cost: 720000 },
  tunnels: { path: 'track', name: 'Underground Tunneling', desc: 'Unlock tunnel segments that dive below the land slab', icon: '⛏️', cost: 3200000 },
  teleporters: { path: 'track', name: 'Teleporter Track', desc: 'Unlock portal-linked accelerator segments', icon: '🌀', cost: 18000000 },

  launch: { path: 'operations', name: 'Launch System', desc: 'Raise launch energy like +1 Faster Track level', icon: '🚀', cost: 1800 },
  train3: { path: 'operations', name: 'Block Sections', desc: 'Raise train cap to 9 trains', icon: '🚆', cost: 12000 },
  stationCrew: { path: 'operations', name: 'Station Crew Systems', desc: 'Load and unload guests 25% faster', icon: '⏱️', cost: 65000 },
  dualBerth: { path: 'operations', name: 'Dual-Berth Station', desc: 'Rear berth unloads while the front berth loads — two trains work the station at once', icon: '🚉', cost: 180000 },
  movingPlatform: { path: 'operations', name: 'Moving Platform Station', desc: 'Cut station dwell time again with moving platforms', icon: '🛤️', cost: 450000 },
  predictiveDispatch: { path: 'operations', name: 'Predictive Dispatch AI', desc: 'Tighten dispatch timing and raise train cap', icon: '🤖', cost: 2600000 },

  queue2: { path: 'guest', name: 'Switchback Pro', desc: '+30 max queue capacity', icon: '🧱', cost: 1600 },
  queueEntertainment: { path: 'guest', name: 'Queue Entertainment', desc: 'Add queue capacity and increase guest arrivals', icon: '🎭', cost: 14000 },
  virtualQueue: { path: 'guest', name: 'Virtual Queue', desc: 'Store a large crowd beyond the physical queue', icon: '📱', cost: 120000 },
  pocketQueue: { path: 'guest', name: 'Pocket Queue', desc: 'Late-game compact megacapacity queue storage', icon: '🧳', cost: 1400000 },

  photo: { path: 'revenue', name: 'On-Ride Photo', desc: '+15% ride income', icon: '📸', cost: 2200 },
  premiumTickets: { path: 'revenue', name: 'Premium Tickets', desc: 'Boost ticket value from excitement and ride length', icon: '🎟️', cost: 24000 },
  merchExit: { path: 'revenue', name: 'Merch Exit Shop', desc: 'Exit shop adds +6% of every train\'s ride income', icon: '🛍️', cost: 180000 },
  realityLicensing: { path: 'revenue', name: 'Reality Licensing', desc: 'Impossible rides generate royalty income', icon: '🌌', cost: 7000000 },

  flyers: { path: 'marketing', name: 'Flyer Campaigns', desc: 'Increase baseline guest arrivals', icon: '📰', cost: 1200 },
  radio: { path: 'marketing', name: 'Local Radio', desc: 'Increase sustained demand and marketing value', icon: '📻', cost: 14000 },
  viral: { path: 'marketing', name: 'Viral Moment Engine', desc: 'High excitement and long rides create demand spikes', icon: '📈', cost: 420000 },
  mythicReputation: { path: 'marketing', name: 'Mythic Reputation', desc: 'Legendary rides draw crowds from everywhere', icon: '🏆', cost: 9000000 },
};

export const RESEARCH_PATHS = {
  track: {
    name: 'Track Engineering',
    icon: '🎢',
    desc: 'New track pieces, then physics-breaking coaster technology.',
    projects: ['brakes', 'loop', 'cork', 'spiral', 'giantLoop', 'verticalTrack', 'tunnels', 'teleporters'],
  },
  operations: {
    name: 'Operations',
    icon: '🚆',
    desc: 'Dispatch, stations, trains, and throughput automation.',
    projects: ['launch', 'train3', 'stationCrew', 'dualBerth', 'movingPlatform', 'predictiveDispatch'],
  },
  guest: {
    name: 'Guest Flow',
    icon: '👥',
    desc: 'Bigger, happier queues and better crowd handling.',
    projects: ['queue2', 'queueEntertainment', 'virtualQueue', 'pocketQueue'],
  },
  revenue: {
    name: 'Revenue',
    icon: '💵',
    desc: 'More money from every rider and every completed train.',
    projects: ['photo', 'premiumTickets', 'merchExit', 'realityLicensing'],
  },
  marketing: {
    name: 'Marketing',
    icon: '📣',
    desc: 'Campaign technology for turning reputation into demand.',
    projects: ['flyers', 'radio', 'viral', 'mythicReputation'],
  },
};

export const RESEARCH_ORDER = Object.values(RESEARCH_PATHS).flatMap(path => path.projects);

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
