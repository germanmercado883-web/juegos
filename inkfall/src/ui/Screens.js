import { LEVELS, THEMES, FACTIONS, ARMORY } from '../data/levels.js';
import { UNITS } from '../data/units.js';
import { Renderer } from '../render/Renderer.js';
import { writeSave, totalStars } from '../core/Save.js';

const $ = (id) => document.getElementById(id);
const MODALS = ['brief', 'settings', 'pause', 'result'];
const PAGES = ['menu', 'map', 'armory', 'skirmish'];

/** Small painted thumbnail of a battlefield theme. */
function themeThumb(themeKey, w, h, factionKey) {
  const t = THEMES[themeKey];
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const sky = g.createLinearGradient(0, 0, 0, h * 0.75);
  sky.addColorStop(0, t.sky[0]);
  sky.addColorStop(0.6, t.sky[1]);
  sky.addColorStop(1, t.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = t.eclipse ? '#140404' : t.sun;
  g.beginPath();
  g.arc(w * 0.7, h * 0.25, h * 0.09, 0, Math.PI * 2);
  g.fill();
  if (t.eclipse) {
    g.strokeStyle = '#ffd09a';
    g.lineWidth = 1.5;
    g.stroke();
  }
  const ridge = (color, base, amp, seed) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, base - Math.abs(Math.sin(x * 0.05 + seed) * amp) - Math.sin(x * 0.13 + seed * 2) * amp * 0.3);
    g.lineTo(w, h);
    g.fill();
  };
  ridge(t.far, h * 0.62, h * 0.22, 1);
  if (t.volcano) {
    g.fillStyle = t.mid;
    g.beginPath();
    g.moveTo(w * 0.15, h * 0.7);
    g.lineTo(w * 0.35, h * 0.32);
    g.lineTo(w * 0.42, h * 0.32);
    g.lineTo(w * 0.62, h * 0.7);
    g.fill();
    g.fillStyle = 'rgba(255,140,50,0.8)';
    g.beginPath();
    g.arc(w * 0.385, h * 0.32, 5, 0, Math.PI * 2);
    g.fill();
  }
  ridge(t.mid, h * 0.72, h * 0.12, 4);
  const gr = g.createLinearGradient(0, h * 0.75, 0, h);
  gr.addColorStop(0, t.ground[0]);
  gr.addColorStop(1, t.ground[1]);
  g.fillStyle = gr;
  g.fillRect(0, h * 0.76, w, h * 0.24);
  if (factionKey) {
    const f = FACTIONS[factionKey];
    g.fillStyle = f.accent;
    g.fillRect(w - 26, h * 0.42, 2, h * 0.34);
    g.fillRect(w - 24, h * 0.42, 14, 9);
  }
  return c.toDataURL();
}

export class Screens {
  constructor(save, audio) {
    this.save = save;
    this.audio = audio;
    this.game = null;
    this.prev = 'menu';
    this.sk = { faction: 'bronze', theme: 'hills', diff: 1 };
    this._bindNav();
    this._bindSettings();
    this._bindSkirmish();
    this.refreshMenu();
  }

  attach(game) {
    this.game = game;
  }

  // ------------------------------------------------------------ navigation
  _bindNav() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-go]');
      if (!btn) return;
      this.audio.init();
      this.audio.click();
      const go = btn.dataset.go;
      if (go === 'back') this.back();
      else if (go === 'endless') this.startEndless();
      else this.show(go);
    });
    // any first tap starts the menu music
    window.addEventListener('pointerdown', () => {
      this.audio.init();
      if (!this.game || this.game.state === 'menu') this.audio.music('menu');
    }, { once: true });
    $('brief-play').addEventListener('click', () => {
      this.hideModals();
      this.hidePages();
      this.game.startBattle({ mode: 'campaign', level: this.briefLevel });
    });
    $('pz-resume').addEventListener('click', () => this.game.resume());
    $('pz-restart').addEventListener('click', () => {
      this.hideModals();
      this.game.startBattle(this.game.battleOpts);
    });
    $('pz-quit').addEventListener('click', () => {
      this.hideModals();
      this.game.quit();
      this.show('menu');
    });
    $('r-menu').addEventListener('click', () => {
      this.hideModals();
      this.game.quit();
      this.show(this.game.battleOpts.mode === 'campaign' ? 'map' : 'menu');
    });
    $('r-retry').addEventListener('click', () => {
      this.hideModals();
      this.game.startBattle(this.game.battleOpts);
    });
    $('r-next').addEventListener('click', () => {
      this.hideModals();
      const next = LEVELS[this.game.battleOpts.level.id];
      this.game.quit();
      this.openBrief(next);
    });
  }

  show(id) {
    if (MODALS.includes(id)) {
      if (id === 'settings') this._fillSettings();
      this.modalReturn = MODALS.find((m) => $(m).classList.contains('on')) || null;
      for (const m of MODALS) $(m).classList.toggle('on', m === id);
      return;
    }
    const cur = PAGES.find((p) => $(p).classList.contains('on'));
    if (cur && cur !== id) this.prev = cur;
    this.hideModals();
    for (const p of PAGES) $(p).classList.toggle('on', p === id);
    if (id === 'menu') this.refreshMenu();
    if (id === 'map') this.renderMap();
    if (id === 'armory') this.renderArmory();
    if (id === 'skirmish') this._renderSkirmish();
  }

  back() {
    const openModal = MODALS.find((m) => $(m).classList.contains('on'));
    if (openModal) {
      $(openModal).classList.remove('on');
      if (this.modalReturn) $(this.modalReturn).classList.add('on');
      this.modalReturn = null;
      return;
    }
    this.show(this.prev && this.prev !== PAGES.find((p) => $(p).classList.contains('on')) ? this.prev : 'menu');
  }

  hideModals() {
    for (const m of MODALS) $(m).classList.remove('on');
  }

  hidePages() {
    for (const p of PAGES) $(p).classList.remove('on');
  }

  refreshMenu() {
    $('menu-crowns').textContent = `♛ ${this.save.crowns}`;
    $('menu-stars').textContent = `★ ${totalStars(this.save)}/${LEVELS.length * 3}`;
  }

  // ------------------------------------------------------------ campaign
  renderMap() {
    $('map-crowns').textContent = `♛ ${this.save.crowns}`;
    const track = $('map-track');
    track.innerHTML = '';
    for (const l of LEVELS) {
      const locked = l.id > this.save.unlocked;
      const stars = this.save.stars[l.id] || 0;
      const el = document.createElement('div');
      el.className = `lvl${locked ? ' locked' : ''}${l.id === this.save.unlocked && !stars ? ' next' : ''}`;
      el.innerHTML = `
        <div class="lvl-node" style="background-image:url(${themeThumb(l.theme, 120, 120, l.faction)});background-size:cover">
          <span class="num">${l.id}</span><span class="who">${FACTIONS[l.faction].name}</span>
        </div>
        <div class="lvl-name">${l.name}</div>
        <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</div>`;
      if (!locked) el.querySelector('.lvl-node').addEventListener('click', () => {
        this.audio.click();
        this.openBrief(l);
      });
      track.appendChild(el);
    }
    // scroll to the next battle
    const next = track.children[Math.min(this.save.unlocked, LEVELS.length) - 1];
    if (next) requestAnimationFrame(() => (track.scrollLeft = next.offsetLeft - track.clientWidth / 2 + 75));
  }

  openBrief(level) {
    this.briefLevel = level;
    this.hidePages();
    $('map').classList.add('on');
    $('brief-art').style.background = `url(${themeThumb(level.theme, 200, 260, level.faction)}) center/cover`;
    $('brief-num').textContent = `BATTLE ${level.id} OF ${LEVELS.length}`;
    $('brief-title').textContent = level.name;
    $('brief-enemy').textContent = `VS ${FACTIONS[level.faction].name}`;
    $('brief-text').textContent = level.brief;
    $('brief-unlock').textContent = level.unlock.length ? `NEW: ${level.unlock.map((u) => UNITS[u].name).join(' · ')}` : '';
    this.show('brief');
  }

  startEndless() {
    this.hidePages();
    this.game.startBattle({ mode: 'endless', theme: 'swamp', faction: 'bone' });
  }

  // ------------------------------------------------------------ armory
  renderArmory() {
    $('armory-crowns').textContent = `♛ ${this.save.crowns}`;
    const grid = $('armory-grid');
    grid.innerHTML = '';
    const f = FACTIONS.dawn;
    for (const a of ARMORY) {
      const lvl = this.save.armory[a.id] || 0;
      const maxed = lvl >= a.max;
      const cost = maxed ? 0 : a.cost[lvl];
      const icon = a.unit
        ? `<img alt="" src="${Renderer.portrait(a.unit, UNITS[a.unit].kind, f.color, f.accent)}" />`
        : `<div class="ico">${{ start_gold: '◉', pop: '⚑', statue: '♜', essence: '◆' }[a.id] || '✦'}</div>`;
      const el = document.createElement('div');
      el.className = 'arm';
      el.innerHTML = `${icon}<div class="info"><b>${a.name}</b><small>${a.desc}</small><div class="pips">${Array.from({ length: a.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-small btn-gold';
      btn.textContent = maxed ? 'MAX' : `♛ ${cost}`;
      btn.disabled = maxed || this.save.crowns < cost;
      btn.addEventListener('click', () => {
        if (this.save.crowns < cost || maxed) return;
        this.save.crowns -= cost;
        this.save.armory[a.id] = lvl + 1;
        writeSave(this.save);
        this.audio.upgrade();
        this.renderArmory();
      });
      el.appendChild(btn);
      grid.appendChild(el);
    }
  }

  // ------------------------------------------------------------ skirmish
  _bindSkirmish() {
    $('sk-play').addEventListener('click', () => {
      this.hidePages();
      const d = this.sk.diff;
      this.game.startBattle({
        mode: 'skirmish',
        theme: this.sk.theme,
        faction: this.sk.faction,
        difficulty: d,
        ai: {
          pool: this.sk.faction === 'bone'
            ? { skeleton: 4, ghoul: 2, bonearcher: 2, bonegiant: 0.4 }
            : { blade: 3, ranger: 3, phalanx: 2, mender: 1, sage: 1.5, colossus: 0.8 },
          miners: 6, income: d, aggression: 1.3 - d * 0.15, firstAttack: 110 - d * 30, popCap: Math.round(40 * d),
          undead: this.sk.faction === 'bone',
        },
        level: { statueHp: 5000, ai: null },
      });
    });
  }

  _renderSkirmish() {
    const chips = (el, items, key) => {
      el.innerHTML = '';
      for (const [val, label] of items) {
        const c = document.createElement('button');
        c.className = `chip${this.sk[key] === val ? ' on' : ''}`;
        c.textContent = label;
        c.addEventListener('click', () => {
          this.sk[key] = val;
          this.audio.click();
          this._renderSkirmish();
        });
        el.appendChild(c);
      }
    };
    chips($('sk-faction'), Object.entries(FACTIONS).filter(([k]) => k !== 'dawn').map(([k, f]) => [k, f.name]), 'faction');
    chips($('sk-theme'), Object.keys(THEMES).map((k) => [k, k.toUpperCase()]), 'theme');
    chips($('sk-diff'), [[0.75, 'EASY'], [1, 'NORMAL'], [1.3, 'HARD'], [1.7, 'INSANE']], 'diff');
  }

  // ------------------------------------------------------------ settings
  _bindSettings() {
    const s = this.save.settings;
    $('set-vol').addEventListener('input', (e) => {
      s.volume = Number(e.target.value);
      this.audio.setVolume(s.volume);
      writeSave(this.save);
    });
    $('set-music').addEventListener('input', (e) => {
      s.music = Number(e.target.value);
      this.audio.setMusicVolume(s.music);
      writeSave(this.save);
    });
    $('set-tips').addEventListener('change', (e) => {
      s.tips = e.target.checked;
      writeSave(this.save);
    });
    let armed = false;
    $('set-reset').addEventListener('click', () => {
      if (!armed) {
        armed = true;
        $('reset-confirm').hidden = false;
        return;
      }
      const keep = { ...this.save.settings };
      for (const k of Object.keys(this.save)) delete this.save[k];
      Object.assign(this.save, { unlocked: 1, stars: {}, crowns: 0, armory: {}, bestEndless: 0, endlessRewarded: 0, settings: keep });
      writeSave(this.save);
      armed = false;
      $('reset-confirm').hidden = true;
      this.refreshMenu();
    });
  }

  _fillSettings() {
    const s = this.save.settings;
    $('set-vol').value = s.volume;
    $('set-music').value = s.music;
    $('set-tips').checked = s.tips;
  }

  // ------------------------------------------------------------ result
  showResult({ win, endless, stars, stats, reward, hasNext }) {
    $('r-title').textContent = endless ? 'THE NIGHT ENDS' : win ? 'VICTORY' : 'DEFEAT';
    $('r-title').style.color = win || endless ? '' : 'var(--red)';
    $('r-stars').innerHTML = endless || !win ? '' : [1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
    $('r-stats').innerHTML = stats.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
    $('r-reward').textContent = reward;
    $('r-next').style.display = hasNext ? '' : 'none';
    this.show('result');
  }
}
