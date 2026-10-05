// Hand-authored layout of the demo island "Duskvale Valley".
// Coordinates are in meters on the XZ plane; the playable square is
// [-HALF, HALF] on both axes. Everything else (heights, vegetation) is
// generated procedurally around these anchors.

export const MAP_HALF = 200;
export const PLAY_LIMIT = 192;

/** Building plots. type decides which builder is used. rot is in radians. */
export const BUILDINGS = [
  // Millbrook farm (north-west): homestead + barn
  { type: 'house', x: -92, z: -78, rot: 0.15, w: 9, d: 7, wall: '#d9cdb4', roof: '#9a4a3a' },
  { type: 'house', x: -110, z: -55, rot: 1.7, w: 8, d: 7, wall: '#c9d3c4', roof: '#4f6a7a' },
  { type: 'house', x: -70, z: -98, rot: -0.2, w: 8, d: 6.5, wall: '#e2d6a8', roof: '#7d5a3c' },
  { type: 'barn', x: -122, z: -92, rot: 0.3, w: 12, d: 9, wall: '#a5503f', roof: '#5b5f63' },

  // Rustline depot (east): warehouse + sheds
  { type: 'warehouse', x: 96, z: 6, rot: Math.PI / 2, w: 26, d: 16, wall: '#8f9a9c', roof: '#6f777a' },
  { type: 'shed', x: 118, z: 34, rot: 0.1, w: 6, d: 5, wall: '#b4a07a', roof: '#6b5040' },
  { type: 'shed', x: 76, z: -26, rot: -0.4, w: 6, d: 5, wall: '#9fae9a', roof: '#5a5a5a' },

  // Pinecrest hamlet (south)
  { type: 'house', x: -24, z: 96, rot: 3.0, w: 8, d: 7, wall: '#e0c9b0', roof: '#5c6f4a' },
  { type: 'house', x: 4, z: 112, rot: 2.7, w: 9, d: 7, wall: '#cfd8dc', roof: '#8b3f36' },
  { type: 'tower', x: 22, z: 92, rot: 0 },

  // Old relay station ruins (north)
  { type: 'ruin', x: 24, z: -112, rot: 0.25, w: 14, d: 10 },
  { type: 'ruin', x: 46, z: -96, rot: -0.5, w: 8, d: 6 },
];

/** Shipping containers and crates sprinkled around the depot and field. */
export const CONTAINERS = [
  { x: 82, z: 30, rot: 0.05, color: '#3f6f8a' },
  { x: 86, z: 33, rot: 0.05, color: '#a2563a', stack: true },
  { x: 112, z: -22, rot: 1.5, color: '#5d7a43' },
  { x: 128, z: 2, rot: 1.6, color: '#b48a35' },
  { x: -6, z: 4, rot: 0.8, color: '#7b4a6a' },
];

export const CRATES = [
  [8, -10], [10, -8.6], [-14, 18], [60, 50], [-60, -40], [30, 60], [-40, -10],
  [104, 30], [70, 10], [-86, -60], [14, 84], [36, -118], [-130, 20], [140, -60],
];

/** Dirt roads as polylines. */
export const ROADS = [
  { width: 6, points: [[-180, -40], [-130, -62], [-92, -66], [-50, -40], [-10, -12], [40, 0], [80, 6], [150, 10], [195, 18]] },
  { width: 5, points: [[-10, -12], [-16, 30], [-20, 70], [-10, 102], [20, 120], [60, 150], [90, 196]] },
  { width: 4.5, points: [[40, 0], [34, -50], [28, -100], [20, -150], [10, -196]] },
  { width: 4, points: [[96, 6], [104, 40], [96, 80], [70, 110], [22, 96]] },
];

/** Areas kept flat so buildings sit nicely on the ground. */
export function flattenZones() {
  const zones = BUILDINGS.map((b) => ({
    x: b.x,
    z: b.z,
    r: Math.max(b.w || 6, b.d || 6) * 0.75 + 3,
    fade: 10,
  }));
  for (const c of CONTAINERS) zones.push({ x: c.x, z: c.z, r: 5, fade: 6 });
  zones.push({ x: 0, z: 0, r: 30, fade: 25 }); // central field
  return zones;
}

/** Safe zone (static for this demo). */
export const SAFE_ZONE = { x: 0, z: -4, radius: 136 };

/** Player spawn on the west meadow, looking towards the valley centre. */
export const PLAYER_SPAWN = { x: -58, z: 38, yaw: -2.05 };

/** Enemy spawn points around points of interest. */
export const ENEMY_SPAWNS = [
  [-88, -70], [-112, -86], [92, 0], [110, 26], [74, -30],
  [-20, 88], [8, 104], [28, -108], [10, -6],
];

/** Loot spawns: [type, x, z]. */
export const LOOT_SPAWNS = [
  ['ammo', -50, 30], ['medkit', -46, 34], ['armor', -40, 22],
  ['smg', -92, -78], ['ammo', -70, -98], ['backpack', -110, -55],
  ['ammo', 96, 0], ['armor', 100, 12], ['medkit', 118, 34],
  ['ammo', -24, 96], ['medkit', 4, 112], ['ammo', 24, -112],
  ['armor', 46, -96], ['ammo', 9, -6], ['medkit', -12, 20],
  ['ammo', 60, 52],
];
