// Fictional weapons designed for this demo.

export const WEAPONS = {
  strider: {
    id: 'strider',
    name: 'RK-7 STRIDER',
    kind: 'RIFLE',
    damage: 21,
    headMult: 1.8,
    fireRate: 9, // rounds per second
    magSize: 30,
    reloadTime: 1.9,
    spreadHip: 0.022,
    spreadAim: 0.004,
    recoilPitch: 0.011,
    recoilYaw: 0.004,
    range: 260,
    sound: { pitch: 1.0, body: 0.9 },
  },
  hornet: {
    id: 'hornet',
    name: 'PX-4 HORNET',
    kind: 'SMG',
    damage: 14,
    headMult: 1.5,
    fireRate: 13,
    magSize: 32,
    reloadTime: 1.4,
    spreadHip: 0.03,
    spreadAim: 0.012,
    recoilPitch: 0.007,
    recoilYaw: 0.006,
    range: 140,
    sound: { pitch: 1.35, body: 0.6 },
  },
};
