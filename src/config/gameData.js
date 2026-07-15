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
  maxBank: 0.9,   // ≈52° max roll — expressive banking without going fully inverted
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

// Starter coaster: deliberately tiny and symmetric — turn out of the station,
// round the corner, arc over a centered hill on the far side, and curve home.
// Three points is the whole ride; the player's first upgrades are literally
// making it bigger.
export const DEFAULT_CTRL = [
  { x: 2.85, y: 0.7, z: 9.0, station: true, seg: 'station' },
  { x: -2.85, y: 0.7, z: 9.0, station: true, seg: 'plain' },
  { x: -6.0, y: 0.8, z: -0.8, seg: 'plain' },  // left corner at track level
  { x: 0.0, y: 2.8, z: -2.8, seg: 'plain' },   // centered crest over the back
  { x: 6.0, y: 0.8, z: -0.8, seg: 'plain' },   // right corner, then home
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
  // the flat 'market' upgrade was retired in M5 — guest demand is now driven by
  // the Marketing Department (hire Marketers, fund campaigns, build Demand)
  hype: { name: 'Theming & Hype', desc: '×1.12 to all earnings', icon: '🎪', base: 260, growth: 2.35, level: 0, max: 24, cat: 'marketing' },
};

export const SHOP_ORDER = ['car', 'seats', 'speed', 'train', 'queue', 'snacks', 'canopy', 'comfort', 'turnstiles', 'hats', 'balloons', 'ticket', 'hype', 'express'];

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
  marketers: {
    name: 'Marketers', icon: '📣',
    desc: 'Run the Marketing HQ and turn budget into guest demand.',
    hireDesc: 'first hire unlocks Marketing · each hire adds +6% budget capacity',
    trainDesc: 'training improves campaign efficiency',
    hireBase: 700, hireGrowth: 2.3, hireMax: 8,
    trainBase: 1400, trainGrowth: 3.4, trainMax: 6,
  },
};
export const STAFF_ORDER = ['operators', 'entertainers', 'mechanics', 'janitors', 'photographers', 'scientists', 'marketers'];

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
  train3: { path: 'operations', name: 'Block Sections', desc: 'Raise train cap to 8 trains', icon: '🚆', cost: 12000 },
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

  // marketing research unlocks campaign *channels* in the Marketing HQ — each
  // one boosts a different income line (see CHANNELS in systems/marketing.js)
  flyers: { path: 'marketing', name: 'Flyer Campaigns', desc: 'Unlocks 🎈 Family Package: guests spend more on snacks & souvenirs', icon: '📰', cost: 1200 },
  radio: { path: 'marketing', name: 'Local Radio', desc: 'Unlocks 📺 Broadcast: a deep, slow-fading arrival campaign (up to ×6)', icon: '📻', cost: 14000 },
  viral: { path: 'marketing', name: 'Viral Moment Engine', desc: 'Unlocks 🎢 Ride Spotlight: ticket premium scaling with excitement', icon: '📈', cost: 420000 },
  mythicReputation: { path: 'marketing', name: 'Mythic Reputation', desc: 'Unlocks 🏛️ Heritage Tours: monuments earn double while tours run', icon: '🏆', cost: 9000000 },

  // Structures: taller supports let late-game coasters sustain sky-high hills
  steelSupports: { path: 'structure', name: 'Steel Supports', desc: 'Build track up to 34m tall', icon: '🏗️', cost: 9000 },
  hydraulicTowers: { path: 'structure', name: 'Hydraulic Towers', desc: 'Build track up to 60m tall', icon: '🗼', cost: 120000 },
  megaStructure: { path: 'structure', name: 'Mega-Structures', desc: 'Build track up to 120m tall', icon: '🏙️', cost: 2000000 },
  skyStructure: { path: 'structure', name: 'Sky Structures', desc: 'Build track up to 240m tall', icon: '🌌', cost: 40000000 },
};

// MAX_TRACK_HEIGHT tiers unlocked by the Structures research path.
export const HEIGHT_TIERS = [
  { research: 'skyStructure', height: 240 },
  { research: 'megaStructure', height: 120 },
  { research: 'hydraulicTowers', height: 60 },
  { research: 'steelSupports', height: 34 },
];

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
  structure: {
    name: 'Structures',
    icon: '🏗️',
    desc: 'Taller supports for ever more towering coasters.',
    projects: ['steelSupports', 'hydraulicTowers', 'megaStructure', 'skyStructure'],
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
// Decor themes the ride: pieces placed near the track add excitement
// (diminishing returns — see themingBonus in systems/decorations.js).
// Pieces overlap and stack freely (scroll raises the ghost, R rotates), so
// structural pieces double as a Planet Coaster-style construction kit.
export const DECOR = {
  // garden classics
  flowers:  { name: 'Flower Bed', icon: '🌸', desc: 'Themes nearby track (+EXC)', cost: 40, scale: 1.6 },
  lamp:     { name: 'Lamp Post',  icon: '💡', desc: 'Warm light · themes nearby track', cost: 60, scale: 1.6 },
  topiary:  { name: 'Topiary',    icon: '🌳', desc: 'Sculpted tree · strong theming', cost: 90, scale: 1.6 },
  statue:   { name: 'Statue',     icon: '🗿', desc: 'A centrepiece · big theming', cost: 220, scale: 1.6 },
  fountain: { name: 'Fountain',   icon: '⛲', desc: 'Showpiece · biggest theming', cost: 400, scale: 1.6 },
  // nature
  rock:     { name: 'Boulder',    icon: '🪨', desc: 'Rugged scenery · stack for cliffs', cost: 35, scale: 1.25 },
  pine:     { name: 'Pine Tree',  icon: '🌲', desc: 'A tall evergreen', cost: 70, scale: 1.25 },
  // construction kit
  wall:     { name: 'Stone Wall', icon: '🧱', desc: 'Wall panel · clips together', cost: 55, scale: 1.25 },
  pillar:   { name: 'Pillar',     icon: '🏛️', desc: 'Column · stack for towers', cost: 45, scale: 1.25 },
  deck:     { name: 'Wood Deck',  icon: '🟫', desc: 'Floor slab · raise for platforms', cost: 50, scale: 1.25 },
  roof:     { name: 'Peaked Roof', icon: '🛖', desc: 'Cap walls and towers', cost: 85, scale: 1.25 },
  arch:     { name: 'Stone Arch', icon: '⛩️', desc: 'Gateway · frame the track', cost: 180, scale: 1.25 },
  fence:    { name: 'Fence',      icon: '🚧', desc: 'A short cream rail section', cost: 25, scale: 1.25 },
  // flair
  torch:    { name: 'Torch',      icon: '🔥', desc: 'Flickering flame · themes nicely', cost: 65, scale: 1.25 },
  banner:   { name: 'Banner Pole', icon: '🚩', desc: 'A tall pennant · themes nicely', cost: 75, scale: 1.25 },
  // biome signature props — theme extra in their home biome (biome field)
  cactus:      { name: 'Saguaro',      icon: '🌵', desc: 'Desert cactus · themes big in the Desert', cost: 80, scale: 1.25, biome: 'desert' },
  iceSpire:    { name: 'Ice Spire',    icon: '🧊', desc: 'Frozen shard · themes big on the Glacier', cost: 80, scale: 1.25, biome: 'ice' },
  lavaRock:    { name: 'Lava Rock',    icon: '🌋', desc: 'Glowing basalt · themes big in the Volcano', cost: 80, scale: 1.25, biome: 'volcano' },
  moonCrystal: { name: 'Moon Crystal', icon: '💎', desc: 'Alien geode · themes big on the Moon', cost: 120, scale: 1.25, biome: 'moon' },
};
export const DECOR_ORDER = [
  'flowers', 'lamp', 'topiary', 'statue', 'fountain',
  'rock', 'pine',
  'wall', 'pillar', 'deck', 'roof', 'arch', 'fence',
  'torch', 'banner',
  'cactus', 'iceSpire', 'lavaRock', 'moonCrystal',
];
