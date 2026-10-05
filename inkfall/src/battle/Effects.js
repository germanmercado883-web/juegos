// Particles and ground decals. Positions use battle space: x (world),
// lane (depth), h (height above ground).

const MAX_PARTICLES = 700;
const MAX_DECALS = 90;

export class Effects {
  constructor(battle) {
    this.battle = battle;
    this.p = [];
    this.decals = [];
    this.texts = [];
  }

  _add(o) {
    if (this.p.length >= MAX_PARTICLES) this.p.shift();
    this.p.push(o);
    return o;
  }

  _decal(o) {
    if (this.decals.length >= MAX_DECALS) this.decals.shift();
    this.decals.push(o);
  }

  hit(u, ranged) {
    const n = ranged ? 4 : 6;
    const ink = u.undead ? '#e8e2cc' : u.battle.teams[u.team].faction.color;
    for (let i = 0; i < n; i++) {
      this._add({
        type: 'ink', x: u.x, lane: u.lane, h: u.height * (0.4 + Math.random() * 0.4),
        vx: (Math.random() - 0.5) * 140, vh: 60 + Math.random() * 120, g: 520,
        life: 0.6, max: 0.6, size: 1.6 + Math.random() * 2.2, color: ink,
      });
    }
    if (!ranged) {
      this._add({ type: 'spark', x: u.x, lane: u.lane, h: u.height * 0.6, vx: 0, vh: 0, g: 0, life: 0.12, max: 0.12, size: 9, color: '#fff6d0' });
    }
  }

  death(u) {
    const ink = u.undead ? '#e8e2cc' : u.battle.teams[u.team].faction.color;
    for (let i = 0; i < 14; i++) {
      this._add({
        type: 'ink', x: u.x, lane: u.lane, h: u.height * Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 200, vh: 80 + Math.random() * 180, g: 520,
        life: 0.8, max: 0.8, size: 2 + Math.random() * 3, color: ink,
      });
    }
    this._decal({ type: 'splat', x: u.x + (Math.random() - 0.5) * 12, lane: u.lane, r: 7 + Math.random() * 7 * u.size, color: ink, t: 14, seed: Math.random() * 100 });
    if (u.undead) {
      for (let i = 0; i < 5; i++) this._add({ type: 'bone', x: u.x, lane: u.lane, h: 20, vx: (Math.random() - 0.5) * 160, vh: 120 + Math.random() * 100, g: 520, life: 1.6, max: 1.6, size: 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, color: '#e8e2cc' });
    }
  }

  heal(u) {
    for (let i = 0; i < 4; i++) {
      this._add({ type: 'plus', x: u.x + (Math.random() - 0.5) * 16, lane: u.lane, h: u.height * (0.5 + Math.random() * 0.5), vx: 0, vh: 30 + Math.random() * 30, g: 0, life: 0.8, max: 0.8, size: 4, color: '#7dffb0' });
    }
  }

  fury(u) {
    for (let i = 0; i < 10; i++) {
      this._add({ type: 'spark', x: u.x, lane: u.lane, h: u.height * Math.random(), vx: (Math.random() - 0.5) * 90, vh: Math.random() * 90, g: 0, life: 0.4, max: 0.4, size: 4, color: '#ff5a3a' });
    }
  }

  mineSpark(x, lane) {
    for (let i = 0; i < 4; i++) {
      this._add({ type: 'spark', x: x + (Math.random() - 0.5) * 18, lane, h: 12 + Math.random() * 10, vx: (Math.random() - 0.5) * 120, vh: 60 + Math.random() * 100, g: 500, life: 0.35, max: 0.35, size: 2.2, color: '#ffd862' });
    }
  }

  slam(x, lane, size) {
    for (let i = 0; i < 16; i++) {
      this._add({ type: 'dust', x: x + (Math.random() - 0.5) * 30 * size, lane: lane + (Math.random() - 0.5) * 20, h: 2, vx: (Math.random() - 0.5) * 220, vh: 40 + Math.random() * 80, g: 120, life: 0.9, max: 0.9, size: 6 + Math.random() * 8 * size, color: 'rgba(140,120,90,0.5)' });
    }
    this._decal({ type: 'crack', x, lane, r: 16 * size, t: 8, seed: Math.random() * 100 });
  }

  explosion(x, lane, r) {
    this._add({ type: 'flash', x, lane, h: 18, vx: 0, vh: 0, g: 0, life: 0.22, max: 0.22, size: r * 1.2, color: '#ffd27a' });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      this._add({ type: 'fire', x, lane: lane + Math.sin(a) * 10, h: 10 + Math.random() * 20, vx: Math.cos(a) * sp, vh: Math.abs(Math.sin(a)) * sp * 0.8 + 40, g: 260, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 4 + Math.random() * 6, color: i % 3 ? '#ff7a2a' : '#ffd25a' });
    }
    for (let i = 0; i < 8; i++) {
      this._add({ type: 'smoke', x: x + (Math.random() - 0.5) * r, lane, h: 20 + Math.random() * 30, vx: (Math.random() - 0.5) * 30, vh: 30 + Math.random() * 30, g: 0, life: 1.6, max: 1.6, size: 14 + Math.random() * 14, color: 'rgba(40,30,30,0.45)' });
    }
    this._decal({ type: 'scorch', x, lane, r: r * 0.55, t: 12, seed: Math.random() * 100 });
  }

  trail(x, lane, h) {
    this._add({ type: 'fire', x, lane, h, vx: (Math.random() - 0.5) * 20, vh: (Math.random() - 0.5) * 20, g: 0, life: 0.3, max: 0.3, size: 5 + Math.random() * 4, color: '#ff8a3a' });
  }

  ember(x, lane, h) {
    this._add({ type: 'fire', x, lane, h, vx: (Math.random() - 0.5) * 20, vh: 30 + Math.random() * 40, g: 0, life: 0.5, max: 0.5, size: 2 + Math.random() * 3, color: '#ff9a3a' });
  }

  debris(x, lane, h, n) {
    for (let i = 0; i < n; i++) {
      this._add({ type: 'rock', x: x + (Math.random() - 0.5) * 60, lane: lane + (Math.random() - 0.5) * 20, h: h * Math.random() + 20, vx: (Math.random() - 0.5) * 260, vh: 60 + Math.random() * 220, g: 600, life: 1.4, max: 1.4, size: 3 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, color: '#8f8a80' });
    }
  }

  spawnPuff(u) {
    for (let i = 0; i < 6; i++) {
      this._add({ type: 'dust', x: u.x + (Math.random() - 0.5) * 20, lane: u.lane, h: 4, vx: (Math.random() - 0.5) * 60, vh: 20 + Math.random() * 30, g: 40, life: 0.6, max: 0.6, size: 6 + Math.random() * 6, color: 'rgba(200,190,160,0.45)' });
    }
  }

  floatText(x, lane, h, text, color) {
    this.texts.push({ x, lane, h, text, color, life: 1.1, max: 1.1 });
  }

  update(dt) {
    for (const p of this.p) {
      p.life -= dt;
      p.vh -= p.g * dt;
      p.x += p.vx * dt;
      p.h += p.vh * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.h < 0 && p.g > 0) {
        p.h = 0;
        p.vh *= -0.25;
        p.vx *= 0.5;
        if (p.type === 'ink' && Math.random() < 0.25) {
          this._decal({ type: 'drop', x: p.x, lane: p.lane, r: p.size * 0.9, color: p.color, t: 8, seed: 0 });
          p.life = 0;
        }
      }
    }
    this.p = this.p.filter((p) => p.life > 0);
    for (const d of this.decals) d.t -= dt;
    this.decals = this.decals.filter((d) => d.t > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.h += 40 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
}
