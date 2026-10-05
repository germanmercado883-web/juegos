// Campaign: 12 battles across the Inklands, all original.
// Themes pick the sky/ground palette, ai tunes the enemy commander.

export const FACTIONS = {
  dawn: { name: 'DAWN LEGION', color: '#141414', accent: '#e8b33a', skin: '#141414' },
  bronze: { name: 'BRONZE TRIBE', color: '#3b2414', accent: '#c9802c', skin: '#3b2414' },
  ember: { name: 'EMBER CLAN', color: '#4a1410', accent: '#ff5a2a', skin: '#4a1410' },
  frost: { name: 'FROST HOLD', color: '#14283c', accent: '#7fd0ff', skin: '#14283c' },
  shade: { name: 'SHADE COVEN', color: '#2a1438', accent: '#c07aff', skin: '#2a1438' },
  bone: { name: 'BONE HORDE', color: '#d8d2c0', accent: '#8fff7a', skin: '#d8d2c0' },
  ash: { name: 'ASH EMPIRE', color: '#2c2c2c', accent: '#ff3b3b', skin: '#2c2c2c' },
};

export const THEMES = {
  meadow: { sky: ['#5aa7e6', '#a8d4f0', '#f5e2b8'], sun: '#fff3c4', far: '#7f9fb5', mid: '#5d8a5a', near: '#43703f', ground: ['#6f8f3a', '#4e6a27'], dirt: '#7a5a34', weather: 'none', light: 1 },
  hills: { sky: ['#4f8fd0', '#9cc8ea', '#efd9a6'], sun: '#fff0b0', far: '#8a9fae', mid: '#6b8f4e', near: '#4f7535', ground: ['#7a943d', '#566e29'], dirt: '#80603a', weather: 'none', light: 1 },
  dusk: { sky: ['#2b2a5c', '#c3566a', '#f7a65a'], sun: '#ffd27a', far: '#5a4a6e', mid: '#3e3a52', near: '#2c2a3a', ground: ['#5c5a3a', '#3e3a26'], dirt: '#5a4430', weather: 'fireflies', light: 0.85 },
  night: { sky: ['#070b1e', '#16244a', '#2a3a66'], sun: '#e8f0ff', moon: true, far: '#1c2846', mid: '#162036', near: '#101828', ground: ['#2e3a2a', '#1e2818'], dirt: '#3a3024', weather: 'fireflies', light: 0.62 },
  volcano: { sky: ['#2a0a0a', '#8a2a14', '#e8742a'], sun: '#ffb84a', far: '#4a1a14', mid: '#2e1210', near: '#1e0c0a', ground: ['#4a2a1c', '#2a1610'], dirt: '#3a2014', weather: 'embers', light: 0.8, volcano: true },
  snow: { sky: ['#8fb4d6', '#cfe2f0', '#f4f6f8'], sun: '#ffffff', far: '#b8c8d8', mid: '#9fb2c4', near: '#7f93a6', ground: ['#e8eef4', '#c4d0dc'], dirt: '#9aa6b2', weather: 'snow', light: 1 },
  desert: { sky: ['#e8a35a', '#f4cf8a', '#fbe8c0'], sun: '#fff6d8', far: '#d2a06a', mid: '#b98352', near: '#9a6a3e', ground: ['#d9b26e', '#b98d4e'], dirt: '#a07040', weather: 'dust', light: 1 },
  eclipse: { sky: ['#1a0606', '#7a1a10', '#e8582a'], sun: '#1a0a0a', eclipse: true, far: '#5a1a12', mid: '#3a120c', near: '#220a08', ground: ['#5a2a1a', '#341810'], dirt: '#4a2414', weather: 'embers', light: 0.78, volcano: true },
  swamp: { sky: ['#1a2a24', '#3e5a48', '#8aa27a'], sun: '#d8f0c8', far: '#3a4e42', mid: '#2a3c30', near: '#1c2a22', ground: ['#3e4a2a', '#2a321c'], dirt: '#3a3424', weather: 'rain', light: 0.7 },
};

// unit pools the AI may train; weights shape its army
export const LEVELS = [
  {
    id: 1, name: 'FIRST LIGHT', theme: 'meadow', faction: 'bronze',
    brief: 'The Bronze Tribe raids our borders. Train Diggers for gold, then Blades to push them back.',
    unlock: ['digger', 'blade'], statueHp: 1800,
    ai: { pool: { blade: 1 }, miners: 2, income: 0.7, aggression: 1.6, firstAttack: 70, popCap: 14 },
    tips: ['Tap DIGGER to train a miner. Gold pays for your army.', 'Train BLADES, then press ATTACK to march on their statue.'],
  },
  {
    id: 2, name: 'BRONZE HILLS', theme: 'hills', faction: 'bronze',
    brief: 'Their archers watch the hills. Rangers unlocked: keep them behind your Blades.',
    unlock: ['ranger'], statueHp: 2400,
    ai: { pool: { blade: 3, ranger: 1 }, miners: 3, income: 0.8, aggression: 1.4, firstAttack: 80, popCap: 20 },
    tips: ['Rangers shoot over your front line. DEFEND keeps them safe until you are ready.'],
  },
  {
    id: 3, name: 'ARROW RAIN', theme: 'desert', faction: 'ember',
    brief: 'The Ember Clan loves arrows. Use the FORGE to research upgrades mid-battle.',
    unlock: [], statueHp: 2800,
    ai: { pool: { blade: 2, ranger: 3 }, miners: 4, income: 0.9, aggression: 1.3, firstAttack: 75, popCap: 24 },
    tips: ['Tap CONTROL to take command of one soldier. Controlled units hit 50% harder.'],
  },
  {
    id: 4, name: 'SHIELD LINE', theme: 'hills', faction: 'bronze',
    brief: 'A wall of shields bars the pass. Phalanx unlocked: tough, and great against arrows.',
    unlock: ['phalanx'], statueHp: 3200,
    ai: { pool: { blade: 2, ranger: 2, phalanx: 2 }, miners: 4, income: 1, aggression: 1.25, firstAttack: 90, popCap: 28 },
    tips: ['GARRISON pulls everyone behind your statue. Use it when a big wave hits.'],
  },
  {
    id: 5, name: 'NIGHT RAID', theme: 'night', faction: 'shade',
    brief: 'The Shade Coven strikes at night with quick raids on our Diggers.',
    unlock: [], statueHp: 3400,
    ai: { pool: { blade: 4, ranger: 2 }, miners: 4, income: 1.05, aggression: 1.05, firstAttack: 45, raids: true, popCap: 30 },
  },
  {
    id: 6, name: 'EMBER PASS', theme: 'volcano', faction: 'ember',
    brief: 'Menders unlocked: they heal everyone around them. Keep them behind the fighting.',
    unlock: ['mender'], statueHp: 3800,
    ai: { pool: { blade: 3, ranger: 3, phalanx: 1, mender: 1 }, miners: 5, income: 1.1, aggression: 1.2, firstAttack: 80, popCap: 32 },
  },
  {
    id: 7, name: 'FROST GATE', theme: 'snow', faction: 'frost',
    brief: 'Sages unlocked: fireballs that wreck tight formations. They need Essence.',
    unlock: ['sage'], statueHp: 4200,
    ai: { pool: { blade: 2, ranger: 2, phalanx: 3, mender: 1 }, miners: 5, income: 1.15, aggression: 1.15, firstAttack: 90, popCap: 34 },
  },
  {
    id: 8, name: 'DUSK DUEL', theme: 'dusk', faction: 'shade',
    brief: 'The Coven answers with its own fire. Spread out and strike their Sages first.',
    unlock: [], statueHp: 4500,
    ai: { pool: { blade: 2, ranger: 2, phalanx: 2, sage: 2, mender: 1 }, miners: 6, income: 1.2, aggression: 1.1, firstAttack: 105, popCap: 36 },
  },
  {
    id: 9, name: 'THE COLOSSUS', theme: 'desert', faction: 'ember',
    brief: 'Colossus unlocked. The enemy fields one too, crush it before it reaches your walls.',
    unlock: ['colossus'], statueHp: 5000,
    ai: { pool: { blade: 3, ranger: 2, phalanx: 2, colossus: 1 }, miners: 6, income: 1.25, aggression: 1.15, firstAttack: 120, popCap: 40 },
  },
  {
    id: 10, name: 'BLOOD ECLIPSE', theme: 'eclipse', faction: 'ash',
    brief: 'Under a dark sun the Ash Empire marches with every weapon it has.',
    unlock: [], statueHp: 5600,
    ai: { pool: { blade: 3, ranger: 3, phalanx: 2, sage: 1, mender: 1, colossus: 1 }, miners: 7, income: 1.3, aggression: 1.1, firstAttack: 115, popCap: 42 },
  },
  {
    id: 11, name: 'BONE MARCH', theme: 'swamp', faction: 'bone',
    brief: 'The dead rise from the marsh. They never stop coming, and they never tire.',
    unlock: [], statueHp: 6000,
    ai: { pool: { skeleton: 4, ghoul: 2, bonearcher: 2, bonegiant: 0.5 }, miners: 0, income: 1.6, aggression: 1.0, firstAttack: 70, undead: true, popCap: 46 },
  },
  {
    id: 12, name: 'ASH THRONE', theme: 'eclipse', faction: 'ash',
    brief: 'The Ash Warlord guards his throne. Break the statue and he will come for you himself.',
    unlock: [], statueHp: 7000, boss: 'warlord',
    ai: { pool: { blade: 3, ranger: 3, phalanx: 3, sage: 2, mender: 1, colossus: 1 }, miners: 8, income: 1.4, aggression: 1.05, firstAttack: 110, popCap: 48 },
  },
];

/** Permanent upgrades bought with Crowns (earned from stars). */
export const ARMORY = [
  { id: 'rank_blade', name: 'BLADE RANK', desc: '+12% health & damage per rank', unit: 'blade', max: 3, cost: [2, 4, 6] },
  { id: 'rank_ranger', name: 'RANGER RANK', desc: '+12% health & damage per rank', unit: 'ranger', max: 3, cost: [2, 4, 6] },
  { id: 'rank_phalanx', name: 'PHALANX RANK', desc: '+12% health & damage per rank', unit: 'phalanx', max: 3, cost: [3, 5, 7] },
  { id: 'rank_mender', name: 'MENDER RANK', desc: '+12% health & healing per rank', unit: 'mender', max: 3, cost: [3, 5, 7] },
  { id: 'rank_sage', name: 'SAGE RANK', desc: '+12% health & damage per rank', unit: 'sage', max: 3, cost: [3, 5, 8] },
  { id: 'rank_colossus', name: 'COLOSSUS RANK', desc: '+12% health & damage per rank', unit: 'colossus', max: 3, cost: [4, 6, 9] },
  { id: 'start_gold', name: 'WAR CHEST', desc: '+150 starting gold per rank', max: 3, cost: [2, 3, 5] },
  { id: 'pop', name: 'BARRACKS', desc: '+5 army size per rank', max: 2, cost: [3, 6] },
  { id: 'statue', name: 'STONE WALLS', desc: '+20% statue health per rank', max: 3, cost: [2, 4, 6] },
  { id: 'essence', name: 'ESSENCE FONT', desc: '+30% Essence per rank', max: 2, cost: [3, 5] },
  { id: 'miners', name: 'MINER GUILD', desc: 'Diggers mine 15% faster per rank', unit: 'digger', max: 3, cost: [2, 4, 6] },
];
