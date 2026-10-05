const KEY = 'inkfall.save.v1';

const DEFAULT = {
  unlocked: 1, // highest campaign level available
  stars: {}, // levelId -> best stars
  crowns: 0, // currency for the Armory
  armory: {},
  bestEndless: 0,
  endlessRewarded: 0,
  settings: { volume: 0.7, music: 0.5, speed: 1, tips: true },
};

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return structuredClone(DEFAULT);
    return { ...structuredClone(DEFAULT), ...raw, settings: { ...DEFAULT.settings, ...(raw.settings || {}) } };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

export function totalStars(save) {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}
