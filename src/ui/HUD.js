import * as THREE from 'three';
import { BUILDINGS, MAP_HALF, ROADS } from '../world/mapLayout.js';

const $ = (id) => document.getElementById(id);

/** DOM heads-up display. Only touches the DOM when a value changes. */
export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      alive: $('hud-alive'),
      kills: $('hud-kills'),
      zone: $('hud-zone'),
      zoneText: $('hud-zone-text'),
      hp: $('hud-hp'),
      hpBar: $('hud-hp-bar'),
      hpGhost: $('hud-hp-ghost'),
      armor: $('hud-armor'),
      armorBar: $('hud-armor-bar'),
      medkits: $('hud-medkits'),
      pack: $('hud-pack'),
      weapon: $('hud-weapon'),
      weaponKind: $('hud-weapon-kind'),
      mag: $('hud-mag'),
      reserve: $('hud-reserve'),
      reload: $('hud-reload'),
      slot1: $('slot-1'),
      slot2: $('slot-2'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      dmgDir: $('dmg-dir'),
      killBanner: $('kill-banner'),
      killSub: $('kill-sub'),
      prompt: $('prompt'),
      promptText: $('prompt-text'),
      heal: $('heal-progress'),
      healFill: $('heal-fill'),
      toasts: $('toasts'),
      dmgNumbers: $('dmg-numbers'),
      vignette: $('vignette'),
      zoneVignette: $('zone-vignette'),
      tutorial: $('tutorial'),
      clickToPlay: $('click-to-play'),
      compass: $('compass-strip'),
      minimap: $('minimap'),
      zoneTimer: $('hud-zone-timer'),
      killfeed: $('killfeed'),
      dropHint: $('drop-hint'),
      altimeter: $('altimeter'),
      altValue: $('alt-value'),
    };
    this.cache = {};
    this.gap = 7;
    this._buildCompass();
    this._minimapTimer = 0;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  reset() {
    this.cache = {};
    this.el.toasts.innerHTML = '';
    this.el.killfeed.innerHTML = '';
    this.setDropHint('');
    this.setAltitude(null);
    this.el.dmgNumbers.innerHTML = '';
    this.el.killBanner.classList.remove('on');
    this.el.tutorial.classList.remove('fade');
    clearTimeout(this._tutTimer);
    this._tutTimer = setTimeout(() => this.el.tutorial.classList.add('fade'), 9000);
    this._prerenderMinimap();
  }

  _set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'width') el.style.width = value;
    else el[prop] = value;
  }

  _buildCompass() {
    // 0..360 repeated so we can scroll seamlessly
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let rep = -1; rep <= 1; rep++) {
      for (let d = 0; d < 360; d += 15) {
        const x = (rep * 360 + d) * 3;
        const l = labels[d];
        html += `<span class="${l ? 'major' : ''}" style="left:${x}px">${l || d}</span>`;
      }
    }
    this.el.compass.innerHTML = html;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const w = p.weapons;
    const a = w.active;
    const e = this.el;

    this._set('alive', e.alive, String(g.aliveCount));
    this._set('kills', e.kills, String(p.kills));
    const hp = Math.ceil(p.health);
    this._set('hp', e.hp, String(hp));
    this._set('hpw', e.hpBar, `${p.health}%`, 'width');
    this._set('hpg', e.hpGhost, `${p.health}%`, 'width');
    e.hpBar.classList.toggle('low', p.health < 30);
    this._set('armor', e.armor, String(Math.ceil(p.armor)));
    this._set('armorw', e.armorBar, `${p.armor}%`, 'width');
    this._set('medkits', e.medkits, String(p.medkits));
    this._set('pack', e.pack, p.hasBigPack ? '▣ TREK PACK' : '');
    this._set('weapon', e.weapon, a.def.name);
    this._set('weaponKind', e.weaponKind, a.def.kind);
    this._set('mag', e.mag, String(a.mag));
    e.mag.classList.toggle('empty', a.mag === 0);
    this._set('reserve', e.reserve, String(w.reserve));
    e.reload.classList.toggle('on', w.reloading > 0);
    e.slot1.classList.toggle('active', w.current === 0);
    e.slot2.classList.toggle('active', w.current === 1);
    e.slot2.classList.toggle('empty', !w.slots[1]);

    // zone indicator
    const out = g.zone.distanceOutside(p.pos);
    if (out > 0 && p.phase === 'ground') {
      this._set('zone', e.zoneText, `OUTSIDE ZONE · ${Math.ceil(out)}m`);
      e.zone.classList.add('outside');
      e.zoneVignette.classList.add('on');
    } else if (p.phase !== 'ground') {
      this._set('zone', e.zoneText, 'DROPPING IN');
      e.zone.classList.remove('outside');
      e.zoneVignette.classList.remove('on');
    } else {
      this._set('zone', e.zoneText, `IN SAFE ZONE · ${Math.floor(-out)}m TO EDGE`);
      e.zone.classList.remove('outside');
      e.zoneVignette.classList.remove('on');
    }

    this._set('zoneTimer', e.zoneTimer, g.zone.running ? g.zone.status : 'ZONE ACTIVE AFTER LANDING');
    e.zoneTimer.classList.toggle('shrinking', g.zone.state === 'shrink');

    // crosshair spread
    const speed = Math.hypot(p.vel.x, p.vel.z);
    let target = p.aiming ? 3 : 7 + speed * 0.8 + w.bloom * 10;
    if (!p.grounded) target += 8;
    this.gap += (target - this.gap) * Math.min(1, dt * 14);
    e.crosshair.style.setProperty('--gap', `${this.gap.toFixed(1)}px`);
    e.crosshair.classList.toggle('hidden-x', p.sprinting);

    // pickup prompt
    const item = g.loot.nearest(p.pos);
    document.body.classList.toggle('can-pick', !!(item && p.alive));
    document.body.classList.toggle('no-meds', p.medkits <= 0);
    if (item && p.alive) {
      e.prompt.classList.add('on');
      this._set('prompt', e.promptText, `PRESIONA E PARA RECOGER — ${item.def.label}`);
    } else e.prompt.classList.remove('on');

    // healing progress
    if (p.healing > 0) {
      e.heal.classList.add('on');
      e.healFill.style.width = `${(1 - p.healing / 2.2) * 100}%`;
    } else e.heal.classList.remove('on');

    // low health vignette
    const since = g.time - p.lastDamageAt;
    const vig = Math.max(since < 0.3 ? 0.6 : 0, p.health < 30 ? 0.4 + Math.sin(g.time * 6) * 0.15 : 0);
    e.vignette.style.opacity = vig.toFixed(2);

    // compass
    const deg = ((-g.cam.yaw * 180) / Math.PI + 360 * 10) % 360;
    e.compass.style.left = `${180 - (360 + deg) * 3}px`;

    this._minimapTimer -= dt;
    if (this._minimapTimer <= 0) {
      this._minimapTimer = 0.1;
      this._drawMinimap();
    }
  }

  pulseCrosshair() {
    this.gap += 4;
  }

  hitMarker(head) {
    const h = this.el.hitmarker;
    h.classList.remove('on');
    h.classList.toggle('head', head);
    void h.offsetWidth; // restart animation
    h.classList.add('on');
  }

  damageNumber(worldPos, amount, head) {
    const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z).project(this.game.camera);
    if (v.z > 1) return;
    const div = document.createElement('div');
    div.className = `dmg-num${head ? ' head' : ''}`;
    div.textContent = amount;
    div.style.left = `${((v.x + 1) / 2) * window.innerWidth + (Math.random() - 0.5) * 30}px`;
    div.style.top = `${((1 - v.y) / 2) * window.innerHeight - 20}px`;
    this.el.dmgNumbers.appendChild(div);
    setTimeout(() => div.remove(), 800);
  }

  damageFrom(sourcePos) {
    const p = this.game.player.pos;
    // angle of the shooter relative to where the camera looks (clockwise +)
    const yaw = this.game.cam.yaw;
    const vx = sourcePos.x - p.x;
    const vz = sourcePos.z - p.z;
    const fwd = -vx * Math.sin(yaw) - vz * Math.cos(yaw);
    const right = vx * Math.cos(yaw) - vz * Math.sin(yaw);
    const rel = Math.atan2(right, fwd);
    const d = this.el.dmgDir;
    d.style.transform = `rotate(${rel}rad)`;
    d.classList.add('on');
    clearTimeout(this._dirT);
    this._dirT = setTimeout(() => d.classList.remove('on'), 350);
  }

  killBanner(sub) {
    const b = this.el.killBanner;
    this.el.killSub.textContent = sub;
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 2600);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  setScope(on) {
    if (this._scope === on) return;
    this._scope = on;
    document.getElementById('scope').classList.toggle('on', on);
    document.body.classList.toggle('scoped', on);
  }

  setDropHint(text) {
    this.el.dropHint.textContent = text;
    this.el.dropHint.classList.toggle('on', !!text);
  }

  setAltitude(meters) {
    this.el.altimeter.classList.toggle('on', meters !== null);
    if (meters !== null) this._set('alt', this.el.altValue, String(meters));
  }

  killFeed(killer, victim, weapon) {
    const row = document.createElement('div');
    row.className = 'kf';
    const k = document.createElement('span');
    k.className = killer === 'YOU' ? 'you' : 'zone';
    k.textContent = killer;
    const w = document.createElement('span');
    w.className = 'gun';
    w.textContent = weapon ? `[${weapon}]` : '[ZONE]';
    const v = document.createElement('span');
    v.textContent = victim;
    row.append(k, w, v);
    this.el.killfeed.appendChild(row);
    setTimeout(() => row.remove(), 5000);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.firstChild.remove();
  }

  setClickToPlay(on) {
    this.el.clickToPlay.classList.toggle('on', on);
  }

  // ------------------------------------------------ minimap
  _prerenderMinimap() {
    const terrain = this.game.world.terrain;
    const size = 180;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wx = (x / size) * MAP_HALF * 2 - MAP_HALF;
        const wz = (y / size) * MAP_HALF * 2 - MAP_HALF;
        const h = terrain.groundAt(wx, wz);
        const shade = Math.max(0, Math.min(1, (h + 6) / 40));
        const i = (y * size + x) * 4;
        img.data[i] = 96 + shade * 70;
        img.data[i + 1] = 124 + shade * 50;
        img.data[i + 2] = 72 + shade * 60;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const s = size / (MAP_HALF * 2);
    g.strokeStyle = '#c9b48a';
    g.lineCap = 'round';
    for (const r of ROADS) {
      g.lineWidth = Math.max(2, r.width * s);
      g.beginPath();
      r.points.forEach(([x, z], i) => {
        const px = (x + MAP_HALF) * s;
        const pz = (z + MAP_HALF) * s;
        if (i === 0) g.moveTo(px, pz);
        else g.lineTo(px, pz);
      });
      g.stroke();
    }
    g.fillStyle = '#d8d2c2';
    for (const b of BUILDINGS) {
      const w = (b.w || 6) * s;
      const d = (b.d || 6) * s;
      g.save();
      g.translate((b.x + MAP_HALF) * s, (b.z + MAP_HALF) * s);
      g.rotate(-(b.rot || 0));
      g.fillRect(-w / 2, -d / 2, w, d);
      g.restore();
    }
    this.minimapBase = c;
  }

  _drawMinimap() {
    if (!this.minimapBase) return;
    const g = this.el.minimap.getContext('2d');
    const size = 180;
    const s = size / (MAP_HALF * 2);
    g.drawImage(this.minimapBase, 0, 0);
    const z = this.game.zone;
    // darken outside the safe zone
    g.save();
    g.fillStyle = 'rgba(30, 60, 140, 0.35)';
    g.beginPath();
    g.rect(0, 0, size, size);
    g.arc((z.center.x + MAP_HALF) * s, (z.center.y + MAP_HALF) * s, z.radius * s, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc((z.center.x + MAP_HALF) * s, (z.center.y + MAP_HALF) * s, z.radius * s, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    if (z.next && z.state !== 'done') {
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.setLineDash([4, 3]);
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc((z.next.center.x + MAP_HALF) * s, (z.next.center.y + MAP_HALF) * s, z.next.radius * s, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    const drop = this.game.drop;
    if (drop?.active) {
      g.save();
      g.strokeStyle = 'rgba(255, 200, 80, 0.8)';
      g.setLineDash([2, 3]);
      g.beginPath();
      const a = drop.start;
      const b = drop.start.clone().addScaledVector(drop.dir, drop.length);
      g.moveTo((a.x + MAP_HALF) * s, (a.z + MAP_HALF) * s);
      g.lineTo((b.x + MAP_HALF) * s, (b.z + MAP_HALF) * s);
      g.stroke();
      g.restore();
    }

    // supply drops
    for (const m of this.game.airdrop?.markers() ?? []) {
      const mx = (m.x + MAP_HALF) * s;
      const mz = (m.z + MAP_HALF) * s;
      g.fillStyle = '#ff6a4a';
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 1;
      g.fillRect(mx - 3.5, mz - 3.5, 7, 7);
      g.strokeRect(mx - 3.5, mz - 3.5, 7, 7);
    }

    // loot pings
    g.fillStyle = 'rgba(255, 220, 120, 0.85)';
    for (const it of this.game.loot.items) {
      g.fillRect((it.pos.x + MAP_HALF) * s - 1, (it.pos.z + MAP_HALF) * s - 1, 2, 2);
    }

    // player arrow
    const p = this.game.player;
    const px = (p.pos.x + MAP_HALF) * s;
    const pz = (p.pos.z + MAP_HALF) * s;
    g.save();
    g.translate(px, pz);
    g.rotate(-this.game.cam.yaw);
    g.fillStyle = '#ffd34d';
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
