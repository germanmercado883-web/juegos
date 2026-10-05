import { Battle, WORLD_W } from '../battle/Battle.js';
import { Renderer, GROUND } from '../render/Renderer.js';
import { UNITS, ROSTER, RESEARCH } from '../data/units.js';
import { LEVELS, FACTIONS } from '../data/levels.js';
import { writeSave } from './Save.js';

const $ = (id) => document.getElementById(id);

/**
 * Runs battles: the main loop, camera, HUD and player input. Also drives
 * the AI-vs-AI "attract" battle shown behind the main menu.
 */
export class Game {
  constructor(save, audio, ui) {
    this.save = save;
    this.audio = audio;
    this.ui = ui;
    this.canvas = $('view');
    this.renderer = new Renderer(this.canvas);
    this.battle = null;
    this.state = 'menu';
    this.speed = 1;
    this.camX = 0;
    this.camTarget = 0;
    this.control = null;
    this.drag = null;
    this.keys = new Set();
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (this.touch) document.body.classList.add('touch');
    this._last = performance.now();
    this._buildHud();
    this._bindInput();
    window.addEventListener('resize', () => this.renderer.resize());
    this.startAttract();
    requestAnimationFrame(() => this._frame());
  }

  // ------------------------------------------------------------ battle setup
  startAttract() {
    const themes = ['meadow', 'hills', 'dusk', 'volcano', 'snow', 'eclipse', 'desert'];
    const factions = ['bronze', 'ember', 'frost', 'shade', 'ash'];
    this.battle = new Battle({
      mode: 'attract',
      theme: themes[Math.floor(Math.random() * themes.length)],
      faction: factions[Math.floor(Math.random() * factions.length)],
      ai: { pool: { blade: 3, ranger: 2, phalanx: 1, sage: 0.5, colossus: 0.3 }, miners: 5, income: 1.3, aggression: 1.1, firstAttack: 25, popCap: 30 },
    }, this.audio);
    this.battle.teams[1].statue.maxHp = this.battle.teams[1].statue.hp = 3000;
    this.state = 'menu';
    this.camX = WORLD_W / 2 - this.renderer.viewW / 2;
    this.attractT = 0;
  }

  startBattle(opts) {
    this.audio.init();
    this.ui.hidePages?.();
    this.ui.hideModals?.();
    const level = opts.level;
    const unlocked = opts.mode === 'campaign' ? this._unlockedUnits(level.id) : ROSTER.slice();
    this.battleOpts = opts;
    this.battle = new Battle({ ...opts, save: this.save, unlocked }, this.audio);
    this.state = 'battle';
    this.control = null;
    this.speed = 1;
    $('h-speed').textContent = 'x1';
    this.camX = 0;
    this.camTarget = 0;
    this.tipIndex = 0;
    this.tipT = 3;
    this.playStart = 0;
    $('hud').classList.remove('hidden');
    $('pad').classList.remove('on');
    $('forge').classList.remove('on');
    const foe = this.battle.teams[1].faction;
    $('h-foe-name').textContent = opts.mode === 'endless' ? 'BONE HORDE' : foe.name;
    document.querySelector('.sbar.foe').style.visibility = opts.mode === 'endless' ? 'hidden' : '';
    this._refreshTrainButtons(unlocked);
    this._setCommandUI('defend');
    this.audio.music('battle');
    this.audio.horn();
    const title = opts.mode === 'campaign' ? level.name : opts.mode === 'endless' ? 'ENDLESS NIGHT' : 'SKIRMISH';
    const sub = opts.mode === 'campaign' ? `BATTLE ${level.id} · VS ${foe.name}` : opts.mode === 'endless' ? 'Survive as many nights as you can' : `VS ${foe.name}`;
    this._banner(title, sub);
  }

  _unlockedUnits(levelId) {
    const set = new Set();
    for (const l of LEVELS) if (l.id <= levelId) for (const u of l.unlock) set.add(u);
    return ROSTER.filter((u) => set.has(u));
  }

  // ------------------------------------------------------------ HUD
  _buildHud() {
    const train = $('train');
    train.innerHTML = '';
    this.trainBtns = {};
    const f = FACTIONS.dawn;
    ROSTER.forEach((type, i) => {
      const d = UNITS[type];
      const b = document.createElement('button');
      b.className = 'tbtn';
      b.innerHTML = `<span class="key">${i + 1}</span><img alt="" src="${Renderer.portrait(type, d.kind, f.color, f.accent)}" /><span class="cost">${d.cost}${d.essence ? `<em>${d.essence} ess</em>` : ''}</span><span class="q"></span><i class="prog"></i>`;
      b.title = `${d.name} — ${d.role}`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._train(type);
      });
      train.appendChild(b);
      this.trainBtns[type] = { el: b, q: b.querySelector('.q'), prog: b.querySelector('.prog') };
    });
    for (const btn of document.querySelectorAll('.cmd')) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.command(btn.dataset.cmd);
      });
    }
    $('h-pause').addEventListener('click', () => this.pause());
    $('h-speed').addEventListener('click', () => {
      this.speed = this.speed === 1 ? 2 : 1;
      $('h-speed').textContent = `x${this.speed}`;
    });
    $('h-forge').addEventListener('click', () => this._toggleForge());
    $('forge-close').addEventListener('click', () => this._toggleForge(false));
    $('h-control').addEventListener('click', () => this.toggleControl());
    $('p-exit').addEventListener('click', () => this.toggleControl(false));
    const hold = (id, on, off) => {
      const el = $(id);
      const down = (e) => {
        e.preventDefault();
        el.classList.add('down');
        on();
      };
      const up = (e) => {
        e.preventDefault();
        el.classList.remove('down');
        off();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    hold('p-left', () => (this.padMove = -1), () => this.padMove === -1 && (this.padMove = 0));
    hold('p-right', () => (this.padMove = 1), () => this.padMove === 1 && (this.padMove = 0));
    hold('p-atk', () => (this.padAtk = true), () => (this.padAtk = false));
    $('minimap').addEventListener('pointerdown', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      this.camTarget = fx * WORLD_W - this.renderer.viewW / 2;
      this.camX = this.camTarget;
      this.follow = false;
    });
  }

  _refreshTrainButtons(unlocked) {
    for (const [type, b] of Object.entries(this.trainBtns)) b.el.classList.toggle('locked', !unlocked.includes(type));
  }

  _train(type) {
    if (this.state !== 'battle') return;
    const v = this.battle.canTrain(0, type);
    if (v === 'ok') this.battle.train(0, type);
    else {
      const msg = { gold: 'NOT ENOUGH GOLD', essence: 'NOT ENOUGH ESSENCE', pop: 'ARMY IS FULL', locked: 'LOCKED' }[v];
      this._toast(msg);
    }
  }

  command(cmd) {
    if (this.state !== 'battle') return;
    this.battle.teams[0].command = cmd;
    this._setCommandUI(cmd);
    if (cmd === 'attack') this.audio.horn();
    else this.audio.click();
  }

  _setCommandUI(cmd) {
    for (const btn of document.querySelectorAll('.cmd')) btn.classList.toggle('on', btn.dataset.cmd === cmd);
  }

  _toggleForge(force) {
    const f = $('forge');
    const on = force ?? !f.classList.contains('on');
    f.classList.toggle('on', on);
    if (on) this._renderForge();
  }

  _renderForge() {
    const list = $('forge-list');
    const t = this.battle.teams[0];
    list.innerHTML = '';
    for (const [key, r] of Object.entries(RESEARCH)) {
      if (r.unit && t.unlocked && !t.unlocked.includes(r.unit)) continue;
      const b = document.createElement('button');
      const done = !!t.research[key];
      const poor = !done && (t.gold < r.cost || t.essence < (r.essence || 0));
      b.className = `rbtn${done ? ' done' : ''}${poor ? ' poor' : ''}`;
      b.innerHTML = `<b>${r.name}</b><small>${r.desc}</small><span class="c">${done ? 'RESEARCHED' : `${r.cost} gold${r.essence ? ` · ${r.essence} ess` : ''}`}</span>`;
      b.addEventListener('click', () => {
        if (this.battle.research(0, key)) this._renderForge();
        else if (!done) this._toast('NOT ENOUGH RESOURCES');
      });
      list.appendChild(b);
    }
  }

  toggleControl(force) {
    if (this.state !== 'battle') return;
    const on = force ?? !this.control;
    if (this.control) {
      this.control.controlled = false;
      this.control.ctrlMove = 0;
      this.control.ctrlAttack = false;
    }
    this.control = null;
    if (on) {
      // take the soldier closest to the front, or a digger if the army is empty
      const b = this.battle;
      let best = null;
      for (const u of b.units) {
        if (u.team !== 0 || u.dead || u.hidden || u.kind === 'miner') continue;
        if (!best || u.x > best.x) best = u;
      }
      if (!best) best = b.units.find((u) => u.team === 0 && !u.dead && !u.hidden);
      if (best) this._takeControl(best);
      else this._toast('NO UNITS TO CONTROL');
    }
    this._syncControlUI();
  }

  _takeControl(u) {
    if (this.control) this.control.controlled = false;
    this.control = u;
    u.controlled = true;
    u.facing = u.dir;
    this.follow = true;
    this.audio.click();
    this._syncControlUI();
  }

  _syncControlUI() {
    $('h-control').classList.toggle('on', !!this.control);
    $('pad').classList.toggle('on', !!this.control);
    $('train').style.opacity = this.control ? '0.35' : '';
    if (this.control) $('pad-name').textContent = this.control.def.name;
  }

  pause() {
    if (this.state !== 'battle') return;
    this.state = 'paused';
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'battle';
    this.ui.hideModals();
    this._last = performance.now();
  }

  quit() {
    if (this.control) this.toggleControl(false);
    $('hud').classList.add('hidden');
    $('forge').classList.remove('on');
    this.audio.music('menu');
    this.startAttract();
  }

  _toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), 1600);
  }

  _banner(title, sub = '') {
    $('banner-t').textContent = title;
    $('banner-s').textContent = sub;
    const b = $('banner');
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }

  _tips(dt) {
    const level = this.battleOpts?.level;
    if (!this.save.settings.tips || !level?.tips) return;
    this.tipT -= dt;
    const tip = $('tip');
    if (this.tipT <= 0) {
      if (this.tipIndex < level.tips.length) {
        tip.textContent = level.tips[this.tipIndex++];
        tip.classList.add('on');
        this.tipT = 9;
      } else {
        tip.classList.remove('on');
        this.tipT = 1e9;
      }
    }
  }

  _updateHud() {
    const b = this.battle;
    const t = b.teams[0];
    $('h-gold').textContent = Math.floor(t.gold);
    $('h-ess').textContent = Math.floor(t.essence);
    $('h-pop').textContent = `${t.pop}/${t.popCap}`;
    $('h-hp0').style.width = `${Math.max(0, (t.statue.hp / t.statue.maxHp) * 100)}%`;
    const es = b.teams[1].statue;
    $('h-hp1').style.width = `${Math.max(0, (es.hp / es.maxHp) * 100)}%`;
    for (const [type, btn] of Object.entries(this.trainBtns)) {
      const q = t.queues[type];
      const v = b.canTrain(0, type);
      btn.el.classList.toggle('poor', v !== 'ok');
      const n = q ? q.count : 0;
      btn.q.textContent = n;
      btn.q.classList.toggle('on', n > 0);
      btn.prog.style.width = n > 0 ? `${(q.t / UNITS[type].time) * 100}%` : '0';
    }
    // research available hint
    const affordable = Object.entries(RESEARCH).some(([k, r]) => !t.research[k] && t.gold >= r.cost + 200 && t.essence >= (r.essence || 0) && (!r.unit || t.unlocked?.includes(r.unit)));
    $('h-forge').classList.toggle('ready', affordable);
    if ($('forge').classList.contains('on') && Math.floor(b.time * 2) !== this._forgeTick) {
      this._forgeTick = Math.floor(b.time * 2);
      this._renderForge();
    }
    this._drawMinimap();
  }

  _drawMinimap() {
    const c = $('minimap');
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const b = this.battle;
    const sx = (x) => (x / WORLD_W) * w;
    ctx.fillStyle = 'rgba(232,179,58,0.25)';
    ctx.fillRect(sx(this.camX), 1, (this.renderer.viewW / WORLD_W) * w, h - 2);
    for (const m of b.mines) {
      ctx.fillStyle = '#c99a2a';
      ctx.fillRect(sx(m.x) - 2, h - 9, 4, 4);
    }
    for (const t of b.teams) {
      if (t.statue.hidden) continue;
      ctx.fillStyle = t.statue.alive ? (t.id === 0 ? '#9be06a' : '#ff6a5a') : '#555';
      ctx.fillRect(sx(t.statue.x) - 3, 4, 6, h - 8);
    }
    for (const u of b.units) {
      if (u.dead || u.hidden) continue;
      ctx.fillStyle = u.team === 0 ? (u.controlled ? '#ffd76a' : '#e8f4ff') : '#ff4a3a';
      ctx.fillRect(sx(u.x) - 1, h / 2 - 3 + u.lane * 0.12, u.size > 2 ? 4 : 2, u.size > 2 ? 6 : 4);
    }
  }

  // ------------------------------------------------------------ input
  _bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.audio.init();
      this.drag = { x: e.clientX, cam: this.camX, moved: false, t: performance.now() };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      if (Math.abs(dx) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        this.camX = this.drag.cam - dx / this.renderer.scale;
        this.camTarget = this.camX;
        this.follow = false;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (this.drag && !this.drag.moved && this.state === 'battle') this._tapWorld(e.clientX, e.clientY);
      this.drag = null;
    });
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'battle') return;
      this.keys.add(e.code);
      const n = Number(e.key);
      if (n >= 1 && n <= ROSTER.length) this._train(ROSTER[n - 1]);
      if (e.code === 'KeyZ') this.command('attack');
      if (e.code === 'KeyX') this.command('defend');
      if (e.code === 'KeyV') this.command('garrison');
      if (e.code === 'KeyC') this.toggleControl();
      if (e.code === 'KeyF') this._toggleForge();
      if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** Tap on one of your units to take control of it. */
  _tapWorld(cx, cy) {
    const r = this.renderer;
    const wx = r.camX + cx / r.scale;
    const wy = cy / r.scale;
    let best = null;
    let bd = 34;
    for (const u of this.battle.units) {
      if (u.team !== 0 || u.dead || u.hidden) continue;
      const footY = GROUND + u.lane;
      const d = Math.hypot(u.x - wx, (footY - u.height * 0.5) - wy);
      if (d < bd * u.size) {
        bd = d;
        best = u;
      }
    }
    if (best) this._takeControl(best);
  }

  _applyControl() {
    const u = this.control;
    if (!u) return;
    if (u.dead) {
      this.control = null;
      this._syncControlUI();
      this._toast('YOUR CHAMPION FELL');
      return;
    }
    let mv = this.padMove || 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mv = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mv = 1;
    u.ctrlMove = mv;
    u.ctrlAttack = !!this.padAtk || this.keys.has('Space');
  }

  // ------------------------------------------------------------ loop
  _frame() {
    const now = performance.now();
    const raw = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const b = this.battle;
    if (this.state === 'battle' || this.state === 'menu') {
      const steps = this.state === 'battle' ? this.speed : 1;
      for (let i = 0; i < steps; i++) {
        if (this.state === 'battle') this._applyControl();
        b.update(raw);
      }
    }
    this._camera(raw);
    b.camX = this.camX;
    this.audio.listenerX = this.camX + this.renderer.viewW / 2;
    this.renderer.camX = this.camX;
    this.renderer.render(b, raw);
    if (this.state === 'battle') {
      this._updateHud();
      this._tips(raw);
      this._events();
    } else if (this.state === 'menu') {
      this.attractT += raw;
      if (b.reset || this.attractT > 240) this.startAttract();
    }
    requestAnimationFrame(() => this._frame());
  }

  _camera(dt) {
    const r = this.renderer;
    const maxX = WORLD_W - r.viewW;
    const b = this.battle;
    if (this.state === 'menu') {
      // follow the clash between the two fronts
      const mid = (b.frontline(0) + b.frontline(1)) / 2;
      this.camTarget = mid - r.viewW * 0.45;
      this.camX += (this.camTarget - this.camX) * Math.min(1, dt * 0.8);
    } else {
      let pan = 0;
      if (!this.control) {
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) pan = -1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) pan = 1;
      }
      if (pan) {
        this.camX += pan * 900 * dt;
        this.camTarget = this.camX;
        this.follow = false;
      }
      if (this.control && this.follow !== false) {
        this.camTarget = this.control.x - r.viewW * 0.4;
        this.camX += (this.camTarget - this.camX) * Math.min(1, dt * 5);
      } else if (this.control && !this.drag) {
        this.follow = true;
      }
    }
    this.camX = Math.max(0, Math.min(maxX, this.camX));
  }

  _events() {
    const b = this.battle;
    while (b.events.length) {
      const ev = b.events.shift();
      if (ev.type === 'banner') this._banner(ev.text, ev.sub);
      else if (ev.type === 'toast') this._toast(ev.text);
      else if (ev.type === 'controlLost') {
        this.control = null;
        this._syncControlUI();
      } else if (ev.type === 'end') setTimeout(() => this._end(ev.result), 2200);
    }
    if (this.battleOpts.mode === 'endless' && !b.teams[0].statue.alive && !b.over) b._finish('lose');
  }

  _end(result) {
    if (this.state !== 'battle') return;
    this.state = 'result';
    if (this.control) this.toggleControl(false);
    $('tip').classList.remove('on');
    $('forge').classList.remove('on');
    const b = this.battle;
    const t = b.teams[0];
    const opts = this.battleOpts;
    const win = result === 'win';
    win ? this.audio.victory() : this.audio.defeat();
    this.audio.music(null);
    let stars = 0;
    let crowns = 0;
    let rewardText = '';
    if (opts.mode === 'campaign') {
      if (win) {
        const hpPct = t.statue.hp / t.statue.maxHp;
        const par = 300 + opts.level.id * 25;
        stars = 1 + (hpPct >= 0.4 ? 1 : 0) + (hpPct >= 0.75 && b.time <= par ? 1 : 0);
        const prev = this.save.stars[opts.level.id] || 0;
        if (stars > prev) {
          crowns = stars - prev;
          this.save.stars[opts.level.id] = stars;
        }
        if (opts.level.id >= this.save.unlocked && opts.level.id < LEVELS.length) this.save.unlocked = opts.level.id + 1;
        rewardText = crowns ? `+${crowns} ♛ CROWNS` : 'Beat your best stars to earn more crowns';
        if (stars < 3) rewardText += ` · 3★: statue ≥75% and under ${Math.floor(par / 60)}:${String(par % 60).padStart(2, '0')}`;
      }
    } else if (opts.mode === 'endless') {
      const nights = Math.max(0, b.endless.wave - (win ? 0 : 1));
      if (nights > this.save.bestEndless) this.save.bestEndless = nights;
      const earned = Math.floor(nights / 3) - (this.save.endlessRewarded || 0);
      if (earned > 0) {
        crowns = earned;
        this.save.endlessRewarded = Math.floor(nights / 3);
      }
      rewardText = `SURVIVED ${nights} NIGHT${nights === 1 ? '' : 'S'} · BEST ${this.save.bestEndless}${crowns ? ` · +${crowns} ♛` : ''}`;
    } else if (win) {
      crowns = 1;
      rewardText = '+1 ♛ CROWN';
    }
    this.save.crowns += crowns;
    writeSave(this.save);
    const mm = Math.floor(b.time / 60);
    const ss = String(Math.floor(b.time % 60)).padStart(2, '0');
    this.ui.showResult({
      win: opts.mode === 'endless' ? false : win,
      endless: opts.mode === 'endless',
      stars,
      stats: [
        ['KILLS', t.stats.kills],
        ['LOST', t.stats.lost],
        ['GOLD MINED', Math.floor(t.stats.gold)],
        ['TIME', `${mm}:${ss}`],
      ],
      reward: rewardText,
      hasNext: opts.mode === 'campaign' && win && opts.level.id < LEVELS.length,
    });
  }
}
