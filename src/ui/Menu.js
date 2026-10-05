const $ = (id) => document.getElementById(id);

const DEFAULTS = { sensitivity: 1, volume: 0.6, quality: 'high', invertY: false };
const KEY = 'duskvale.settings';

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

const TIPS = [
  'TIP: Loot glows on the ground. Walk over it and press E.',
  'TIP: Stay inside the blue wall. The zone hurts more the longer you stay out.',
  'TIP: Hold right click to aim down sights for tighter spread.',
  'TIP: Headshots deal bonus damage.',
  'TIP: Press H to use a medkit when the fight is over.',
];

/** Menu, settings, loading, pause and end screens. */
export class MenuUI {
  constructor(settings) {
    this.settings = settings;
    this.screens = ['menu', 'settings', 'loading', 'pause', 'end'];
    this.handlers = {};
    this._settingsReturn = 'menu';

    $('btn-play').onclick = () => this.handlers.play?.();
    $('btn-settings').onclick = () => this.openSettings('menu');
    $('btn-settings-back').onclick = () => this.closeSettings();
    $('btn-resume').onclick = () => this.handlers.resume?.();
    $('btn-pause-settings').onclick = () => this.openSettings('pause');
    $('btn-quit').onclick = () => this.handlers.quit?.();
    $('btn-again').onclick = () => this.handlers.again?.();
    $('btn-end-menu').onclick = () => this.handlers.quit?.();
    this._bindSettings();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  show(id) {
    for (const s of this.screens) $(s).classList.toggle('active', s === id);
  }

  hideAll() {
    for (const s of this.screens) $(s).classList.remove('active');
  }

  _bindSettings() {
    const s = this.settings;
    const sens = $('set-sens');
    const vol = $('set-vol');
    const q = $('set-quality');
    const inv = $('set-invert');
    const refresh = () => {
      $('set-sens-v').textContent = Number(s.sensitivity).toFixed(2);
      $('set-vol-v').textContent = `${Math.round(s.volume * 100)}`;
    };
    sens.value = s.sensitivity;
    vol.value = s.volume;
    q.value = s.quality;
    inv.checked = s.invertY;
    refresh();
    sens.oninput = () => {
      s.sensitivity = Number(sens.value);
      refresh();
    };
    vol.oninput = () => {
      s.volume = Number(vol.value);
      refresh();
      this.handlers.settingsChanged?.();
    };
    q.onchange = () => {
      s.quality = q.value;
      this.handlers.settingsChanged?.();
    };
    inv.onchange = () => {
      s.invertY = inv.checked;
    };
  }

  openSettings(from) {
    this._settingsReturn = from;
    this.show('settings');
  }

  closeSettings() {
    saveSettings(this.settings);
    this.handlers.settingsChanged?.();
    this.show(this._settingsReturn);
  }

  showLoading() {
    $('loading-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.setProgress(0, 'LOADING WORLD...');
    this.show('loading');
  }

  setProgress(p, label) {
    const pct = Math.round(p * 100);
    $('loading-fill').style.width = `${pct}%`;
    $('loading-pct').textContent = `${pct}%`;
    $('loading-text').textContent = label === 'READY' ? 'LOADING WORLD... DONE' : `LOADING WORLD... ${label}`;
  }

  showPause() {
    this.show('pause');
  }

  hidePause() {
    this.hideAll();
  }

  showEnd({ victory, rank, kills, time }) {
    $('end-rank').textContent = `#${rank}`;
    $('end-title').textContent = victory ? 'LAST ONE STANDING' : 'ELIMINATED';
    const mm = Math.floor(time / 60);
    const ss = String(Math.floor(time % 60)).padStart(2, '0');
    $('end-stats').innerHTML = `<div><b>${kills}</b>KILLS</div><div><b>${mm}:${ss}</b>SURVIVED</div><div><b>#${rank}</b>PLACE</div>`;
    this.show('end');
  }
}
