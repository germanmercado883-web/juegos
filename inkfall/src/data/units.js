// Unit roster for INKFALL. All names and stats are original to this game.
// Sizes are in design pixels (the battlefield is drawn at 540 px high).

export const UNITS = {
  digger: {
    id: 'digger', name: 'DIGGER', role: 'Mines gold for the legion',
    cost: 150, essence: 0, pop: 1, time: 3.2,
    hp: 110, armor: 0, dmg: 6, rate: 1.1, range: 26, speed: 92, size: 1,
    kind: 'miner', carry: 40,
  },
  blade: {
    id: 'blade', name: 'BLADE', role: 'Fast, cheap swordsman',
    cost: 125, essence: 0, pop: 1, time: 2.8,
    hp: 130, armor: 0, dmg: 15, rate: 0.85, range: 30, speed: 86, size: 1,
    kind: 'melee',
  },
  ranger: {
    id: 'ranger', name: 'RANGER', role: 'Archer, strikes from afar',
    cost: 300, essence: 0, pop: 2, time: 4.5,
    hp: 95, armor: 0, dmg: 14, rate: 1.45, range: 430, speed: 74, size: 1,
    kind: 'archer',
  },
  phalanx: {
    id: 'phalanx', name: 'PHALANX', role: 'Shield and spear, holds the line',
    cost: 450, essence: 0, pop: 3, time: 6.5,
    hp: 340, armor: 0.3, rangedArmor: 0.45, dmg: 24, rate: 1.25, range: 54, speed: 62, size: 1.08,
    kind: 'spear',
  },
  mender: {
    id: 'mender', name: 'MENDER', role: 'Heals nearby allies',
    cost: 250, essence: 60, pop: 2, time: 5.5,
    hp: 120, armor: 0, heal: 16, rate: 1.3, range: 170, speed: 72, size: 1,
    kind: 'healer',
  },
  sage: {
    id: 'sage', name: 'SAGE', role: 'Hurls exploding fireballs',
    cost: 550, essence: 150, pop: 4, time: 8.5,
    hp: 135, armor: 0, dmg: 44, radius: 78, rate: 3.1, range: 370, speed: 64, size: 1.05,
    kind: 'mage',
  },
  colossus: {
    id: 'colossus', name: 'COLOSSUS', role: 'Huge brute, smashes crowds',
    cost: 1300, essence: 0, pop: 7, time: 15,
    hp: 1600, armor: 0.2, dmg: 72, radius: 72, rate: 2.5, range: 82, speed: 44, size: 2.4,
    kind: 'giant',
  },
  // ---- enemy-only units (Endless Night / bosses)
  skeleton: {
    id: 'skeleton', name: 'BONE RUNNER', cost: 0, pop: 1, time: 0,
    hp: 75, armor: 0, dmg: 11, rate: 0.9, range: 28, speed: 96, size: 0.95, kind: 'melee', undead: true,
  },
  ghoul: {
    id: 'ghoul', name: 'GHOUL', cost: 0, pop: 2, time: 0,
    hp: 260, armor: 0.1, dmg: 20, rate: 1.4, range: 32, speed: 58, size: 1.12, kind: 'melee', undead: true,
  },
  bonearcher: {
    id: 'bonearcher', name: 'BONE ARCHER', cost: 0, pop: 2, time: 0,
    hp: 80, armor: 0, dmg: 12, rate: 1.7, range: 400, speed: 70, size: 0.95, kind: 'archer', undead: true,
  },
  bonegiant: {
    id: 'bonegiant', name: 'BONE TITAN', cost: 0, pop: 7, time: 0,
    hp: 2200, armor: 0.25, dmg: 80, radius: 80, rate: 2.7, range: 86, speed: 40, size: 2.6, kind: 'giant', undead: true,
  },
  warlord: {
    id: 'warlord', name: 'THE ASH WARLORD', cost: 0, pop: 10, time: 0,
    hp: 6000, armor: 0.35, dmg: 95, radius: 95, rate: 2.2, range: 96, speed: 46, size: 3.1, kind: 'giant', boss: true,
  },
};

/** Player roster in shop order. */
export const ROSTER = ['digger', 'blade', 'ranger', 'phalanx', 'mender', 'sage', 'colossus'];

/** In-battle research ("Forge"). */
export const RESEARCH = {
  sacks: { name: 'HEAVY SACKS', desc: 'Diggers carry +50% gold', cost: 300, essence: 0, unit: 'digger' },
  fury: { name: 'BLADE FURY', desc: 'Blades enrage: +40% speed & damage for 6s', cost: 400, essence: 0, unit: 'blade' },
  fire: { name: 'FIRE ARROWS', desc: 'Arrows burn for extra damage', cost: 500, essence: 50, unit: 'ranger' },
  wall: { name: 'SHIELD WALL', desc: 'Phalanx braces vs arrows (-80%)', cost: 450, essence: 0, unit: 'phalanx' },
  aegis: { name: 'AEGIS', desc: 'Menders heal more and shield allies', cost: 350, essence: 100, unit: 'mender' },
  inferno: { name: 'INFERNO', desc: 'Bigger fireballs that leave flames', cost: 600, essence: 200, unit: 'sage' },
  quake: { name: 'QUAKE STOMP', desc: 'Colossus stuns what it smashes', cost: 700, essence: 100, unit: 'colossus' },
  walls: { name: 'STONE TOWERS', desc: 'Your statue fires arrows at raiders', cost: 500, essence: 0 },
};
