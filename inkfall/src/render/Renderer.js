import { THEMES } from '../data/levels.js';
import { computePose, solve, drawStick, deathPose } from './StickRig.js';

export const DESIGN_H = 540;
export const GROUND = 372; // design y of lane 0 (leaves room for the bottom HUD)
export const UNIT_SCALE = 1.3; // stick figures are drawn 30% larger than rig units

// deterministic value noise for terrain silhouettes
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camX = 0;
    this.weather = [];
    this.clouds = Array.from({ length: 9 }, (_, i) => ({ x: Math.random() * 2000, y: 40 + Math.random() * 140, s: 0.6 + Math.random() * 0.9, v: 4 + Math.random() * 8, seed: i * 13.7 }));
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.w = w;
    this.h = h;
    this.scale = h / DESIGN_H;
    this.viewW = w / this.scale;
  }

  sx(x) {
    return (x - this.camX) * this.scale;
  }

  sy(lane, h = 0) {
    return (GROUND + lane - h) * this.scale;
  }

  render(battle, dt, opts = {}) {
    const ctx = this.ctx;
    const theme = THEMES[battle.theme] || THEMES.meadow;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const shake = battle.shakeAmt;
    const shx = shake ? (Math.random() - 0.5) * shake : 0;
    const shy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.save();
    ctx.translate(shx, shy);

    this._sky(ctx, theme, battle.time, dt);
    this._mountains(ctx, theme, battle.time);
    this._ground(ctx, theme);
    this._decals(ctx, battle);
    this._bases(ctx, battle, theme);
    for (const m of battle.mines) this._mine(ctx, m, theme);
    const dark = theme.light < 1;
    if (dark) this._darken(ctx, theme, battle);
    this.rim = dark ? (theme.volcano ? 'rgba(255,140,80,0.55)' : 'rgba(170,200,255,0.45)') : null;

    // depth-sorted: units, statues
    const drawables = [];
    for (const u of battle.units) if (!u.hidden || u.dead) drawables.push({ y: u.lane, u });
    for (const t of battle.teams) if (!t.statue.hidden) drawables.push({ y: -40, statue: t.statue, team: t });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) {
      if (d.u) this._unit(ctx, d.u, battle, opts);
      else this._statue(ctx, d.statue, d.team, battle);
    }
    this._flames(ctx, battle);
    this._projectiles(ctx, battle);
    this._particles(ctx, battle);
    this._foreground(ctx, theme);
    this._weather(ctx, theme, dt);
    this._texts(ctx, battle);
    ctx.restore();
    this._vignette(ctx);
  }

  // ------------------------------------------------------------ background
  _sky(ctx, theme, time, dt) {
    const g = ctx.createLinearGradient(0, 0, 0, this.sy(-30));
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.55, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    const s = this.scale;
    // stars at night
    if (theme.light < 0.8) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 70; i++) {
        const x = ((hash(i) * 1600 - this.camX * 0.02) % 1600 + 1600) % 1600;
        const y = hash(i + 99) * 230;
        const tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
        ctx.globalAlpha = 0.3 + tw * 0.5;
        ctx.fillRect(x * s, y * s, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }
    // sun / moon / eclipse
    const cx = this.w * 0.72 - this.camX * 0.03 * s;
    const cy = 120 * s;
    if (theme.eclipse) {
      const r = 46 * s;
      const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 3.2);
      glow.addColorStop(0, 'rgba(255,200,120,0.9)');
      glow.addColorStop(0.25, 'rgba(255,120,50,0.35)');
      glow.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120404';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,180,0.9)';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    } else {
      const r = (theme.moon ? 28 : 40) * s;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
      glow.addColorStop(0, theme.moon ? 'rgba(220,230,255,0.5)' : 'rgba(255,245,210,0.65)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.sun;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (theme.moon) {
        ctx.fillStyle = theme.sky[1];
        ctx.beginPath();
        ctx.arc(cx + r * 0.45, cy - r * 0.2, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // clouds
    for (const c of this.clouds) {
      c.x += c.v * dt;
      const span = 2200;
      const x = (((c.x - this.camX * 0.08) % span) + span) % span - 200;
      this._cloud(ctx, x * s, c.y * s, c.s * s, theme);
    }
  }

  _cloud(ctx, x, y, s, theme) {
    ctx.fillStyle = theme.light < 0.8 ? 'rgba(60,70,100,0.35)' : theme.volcano ? 'rgba(80,30,20,0.4)' : 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(x, y, 60 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 28 * s, y - 8 * s, 30 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * s, y - 12 * s, 34 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _ridge(ctx, color, parallax, base, amp, freq, seed, jag = 0) {
    const s = this.scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, this.h);
    const off = this.camX * parallax;
    for (let px = -10; px <= this.viewW + 20; px += 14) {
      const wx = (px + off) * freq;
      let y = base - (noise1(wx + seed) * 0.65 + noise1(wx * 2.3 + seed * 2) * 0.35) * amp;
      if (jag) y -= Math.abs(Math.sin(wx * 9 + seed)) * jag;
      ctx.lineTo(px * s, y * s);
    }
    ctx.lineTo(this.w, this.h);
    ctx.closePath();
    ctx.fill();
  }

  _mountains(ctx, theme, time) {
    const s = this.scale;
    this._ridge(ctx, theme.far, 0.12, 272, 150, 0.006, 3, 6);
    if (theme.volcano) {
      // smoking volcanoes with lava glow
      for (const vx of [520, 1500, 2600]) {
        const x = (vx - this.camX * 0.18) * s;
        if (x < -300 * s || x > this.w + 300 * s) continue;
        ctx.fillStyle = theme.mid;
        ctx.beginPath();
        ctx.moveTo(x - 230 * s, 322 * s);
        ctx.lineTo(x - 34 * s, 117 * s);
        ctx.lineTo(x + 34 * s, 117 * s);
        ctx.lineTo(x + 230 * s, 322 * s);
        ctx.fill();
        const glow = ctx.createRadialGradient(x, 120 * s, 0, x, 120 * s, 70 * s);
        glow.addColorStop(0, 'rgba(255,170,60,0.9)');
        glow.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, 120 * s, 70 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,120,40,0.7)';
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(x - 6 * s, 122 * s);
        ctx.quadraticCurveTo(x - 30 * s, 202 * s, x - 70 * s, 272 * s);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const t = (time * 0.12 + i / 4) % 1;
          ctx.fillStyle = `rgba(40,20,20,${0.35 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(x + t * 60 * s, (112 - t * 100) * s, (16 + t * 40) * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    this._ridge(ctx, theme.mid, 0.3, 312, 80, 0.009, 11, 0);
    // tree line silhouettes on the near ridge
    this._ridge(ctx, theme.near, 0.55, 340, 36, 0.012, 23, 0);
    const off = this.camX * 0.55;
    ctx.fillStyle = theme.near;
    for (let i = Math.floor(off / 46) - 1; i < (off + this.viewW) / 46 + 1; i++) {
      if (hash(i * 3.1) < 0.45) continue;
      const wx = i * 46 + hash(i) * 30;
      const x = (wx - off) * s;
      const base = (340 - (noise1(wx * 0.012 + 23) * 0.65 + noise1(wx * 0.012 * 2.3 + 46) * 0.35) * 36) * s;
      const hgt = (22 + hash(i * 7) * 26) * s;
      ctx.beginPath();
      ctx.moveTo(x - hgt * 0.32, base + 2);
      ctx.lineTo(x, base - hgt);
      ctx.lineTo(x + hgt * 0.32, base + 2);
      ctx.fill();
    }
  }

  _ground(ctx, theme) {
    const s = this.scale;
    const top = this.sy(-48);
    const g = ctx.createLinearGradient(0, top, 0, this.h);
    g.addColorStop(0, theme.ground[0]);
    g.addColorStop(1, theme.ground[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, this.w, this.h - top);
    // trodden path band where the armies walk
    ctx.fillStyle = theme.dirt;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, this.sy(-30), this.w, 50 * s);
    ctx.globalAlpha = 1;
    // texture strokes
    const step = 26;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    for (let i = Math.floor(this.camX / step) - 1; i < (this.camX + this.viewW) / step + 1; i++) {
      for (let k = 0; k < 3; k++) {
        const lane = -44 + hash(i * 3 + k * 17) * 150;
        const x = this.sx(i * step + hash(i + k * 9) * step);
        const y = this.sy(lane);
        ctx.moveTo(x, y);
        ctx.lineTo(x + (2 + hash(i + k) * 3) * s, y - (3 + hash(i * 5 + k) * 5) * s);
      }
    }
    ctx.stroke();
    // horizon line
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(this.w, top);
    ctx.stroke();
  }

  _foreground(ctx, theme) {
    const s = this.scale;
    const off = this.camX * 1.25;
    ctx.fillStyle = theme.near;
    ctx.globalAlpha = 0.85;
    for (let i = Math.floor(off / 18) - 2; i < (off + this.viewW * 1.25) / 18 + 2; i++) {
      const x = (i * 18 - off) * s;
      const hgt = (8 + hash(i * 1.7) * 18) * s;
      const y = this.h + 2;
      ctx.beginPath();
      ctx.moveTo(x - 3 * s, y);
      ctx.quadraticCurveTo(x + 2 * s, y - hgt * 0.6, x + (hash(i) - 0.5) * 10 * s, y - hgt);
      ctx.quadraticCurveTo(x + 4 * s, y - hgt * 0.5, x + 4 * s, y);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _bases(ctx, battle, theme) {
    // tents, banners and torches near each statue
    for (const t of battle.teams) {
      if (t.statue.hidden) continue;
      const dir = t.id === 0 ? 1 : -1;
      const sx = t.statue.x;
      for (const [off, lane] of [[-150, -40], [-260, -36]]) {
        this._tent(ctx, sx + off * dir, lane, t.faction, dir);
      }
      for (const off of [90, -110]) {
        this._banner(ctx, sx + off * dir, -38, t.faction, battle.time);
      }
      if (theme.light < 0.9) {
        for (const off of [70, 140]) this._torch(ctx, sx + off * dir, -26, battle.time);
      }
    }
  }

  _tent(ctx, x, lane, faction, dir) {
    const s = this.scale;
    const X = this.sx(x);
    const Y = this.sy(lane);
    if (X < -100 || X > this.w + 100) return;
    ctx.fillStyle = '#d8c8a0';
    ctx.beginPath();
    ctx.moveTo(X - 36 * s, Y);
    ctx.lineTo(X, Y - 40 * s);
    ctx.lineTo(X + 36 * s, Y);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(X, Y - 40 * s);
    ctx.lineTo(X + 36 * s * dir, Y);
    ctx.lineTo(X, Y);
    ctx.fill();
    ctx.fillStyle = faction.accent;
    ctx.fillRect(X - 3 * s, Y - 46 * s, 2 * s, 8 * s);
    ctx.fillStyle = '#2a2018';
    ctx.beginPath();
    ctx.moveTo(X - 8 * s, Y);
    ctx.lineTo(X, Y - 18 * s);
    ctx.lineTo(X + 8 * s, Y);
    ctx.fill();
  }

  _banner(ctx, x, lane, faction, time) {
    const s = this.scale;
    const X = this.sx(x);
    const Y = this.sy(lane);
    if (X < -60 || X > this.w + 60) return;
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X, Y - 90 * s);
    ctx.stroke();
    ctx.fillStyle = faction.accent;
    ctx.beginPath();
    ctx.moveTo(X, Y - 88 * s);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      ctx.lineTo(X + t * 34 * s, Y - (88 - Math.sin(time * 4 + t * 4) * 3 * t) * s);
    }
    for (let i = 6; i >= 0; i--) {
      const t = i / 6;
      ctx.lineTo(X + t * 34 * s, Y - (64 - Math.sin(time * 4 + t * 4) * 3 * t) * s);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = faction.color;
    ctx.beginPath();
    ctx.arc(X + 16 * s, Y - 76 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  _torch(ctx, x, lane, time) {
    const s = this.scale;
    const X = this.sx(x);
    const Y = this.sy(lane);
    if (X < -60 || X > this.w + 60) return;
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X, Y - 34 * s);
    ctx.stroke();
    const f = 1 + Math.sin(time * 18 + x) * 0.15;
    ctx.fillStyle = '#ffb24a';
    ctx.beginPath();
    ctx.ellipse(X, Y - 39 * s, 4 * s * f, 7 * s * f, 0, 0, Math.PI * 2);
    ctx.fill();
    this.lights = this.lights || [];
    this.lights.push({ x: X, y: Y - 38 * s, r: 80 * s * f });
  }

  _mine(ctx, m, theme) {
    const s = this.scale;
    const X = this.sx(m.x);
    const Y = this.sy(m.lane);
    if (X < -80 || X > this.w + 80) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(X, Y + 2 * s, 34 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const rock = theme.light < 0.8 ? '#3e3a3a' : '#7a6f62';
    const rockDark = theme.light < 0.8 ? '#2a2626' : '#5e5448';
    const blobs = [[-16, -10, 16], [8, -14, 18], [-2, -24, 14], [18, -6, 11], [-24, -4, 10]];
    for (const [dx, dy, r] of blobs) {
      ctx.fillStyle = rockDark;
      ctx.beginPath();
      ctx.arc(X + dx * s, Y + dy * s + 2 * s, r * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.arc(X + dx * s - 1.5 * s, Y + dy * s, r * s * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // gold veins
    const nuggets = [[-10, -16], [6, -20], [14, -8], [-4, -28], [-20, -6], [2, -10]];
    for (const [dx, dy] of nuggets) {
      ctx.fillStyle = '#c99a2a';
      ctx.beginPath();
      ctx.arc(X + dx * s, Y + dy * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe07a';
      ctx.beginPath();
      ctx.arc(X + dx * s - 1 * s, Y + dy * s - 1 * s, 2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    // glint
    const k = (m.sparkle * 0.8) % 1;
    if (k < 0.25) {
      const [dx, dy] = nuggets[Math.floor(m.sparkle) % nuggets.length];
      const a = 1 - k / 0.25;
      ctx.strokeStyle = `rgba(255,255,220,${a})`;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(X + dx * s - 6 * s, Y + dy * s);
      ctx.lineTo(X + dx * s + 6 * s, Y + dy * s);
      ctx.moveTo(X + dx * s, Y + dy * s - 6 * s);
      ctx.lineTo(X + dx * s, Y + dy * s + 6 * s);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ statues
  _statue(ctx, st, team, battle) {
    const s = this.scale;
    const X = this.sx(st.x);
    const Y = this.sy(-40);
    if (X < -200 * s || X > this.w + 200 * s) return;
    const dir = team.id === 0 ? 1 : -1;
    const dmg = 1 - st.hp / st.maxHp;
    ctx.save();
    if (!st.alive) {
      // rubble
      const t = Math.min(1, st.destroyT * 1.5);
      ctx.fillStyle = '#6f6a62';
      for (let i = 0; i < 9; i++) {
        const rx = (hash(i * 4.2) - 0.5) * 110 * s;
        const ry = -hash(i * 2.7) * 30 * s * t;
        ctx.beginPath();
        ctx.arc(X + rx, Y + ry, (10 + hash(i) * 14) * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    const stone = st.hitT > 0 ? '#ffffff' : '#a9a49a';
    const stoneDark = '#7e796f';
    // pedestal
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(X, Y + 4 * s, 70 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = stoneDark;
    ctx.fillRect(X - 58 * s, Y - 26 * s, 116 * s, 26 * s);
    ctx.fillStyle = stone;
    ctx.fillRect(X - 50 * s, Y - 50 * s, 100 * s, 26 * s);
    ctx.fillStyle = team.faction.accent;
    ctx.fillRect(X - 50 * s, Y - 30 * s, 100 * s, 4 * s);
    // the stone warrior: a frozen heroic pose drawn with the stick rig
    ctx.translate(X, Y - 50 * s);
    ctx.scale(3.1 * s * dir, 3.1 * s);
    const frozen = {
      kind: team.id === 0 ? 'melee' : 'spear', anim: 'attack', animT: team.id === 0 ? 0.42 : 0.55,
      walkPhase: 0, moving: false, speedFactor: 0, time: 0, hurtT: 0,
    };
    const pose = computePose(frozen);
    pose.legs = [{ thigh: 0.35, shin: 0.1 }, { thigh: -0.3, shin: -0.4 }];
    const j = solve(pose);
    drawStick(ctx, frozen, { body: stone, accent: team.faction.accent, metal: '#d8d4cc' }, pose, j);
    ctx.restore();
    // cracks as it takes damage
    if (dmg > 0.15) {
      ctx.strokeStyle = 'rgba(40,30,20,0.6)';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      const n = Math.floor(dmg * 10);
      for (let i = 0; i < n; i++) {
        let cx = X + (hash(i * 9.1) - 0.5) * 90 * s;
        let cy = Y - (10 + hash(i * 3.3) * 150) * s;
        ctx.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) {
          cx += (hash(i * 7 + k) - 0.5) * 18 * s;
          cy += hash(i * 5 + k) * 12 * s;
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ units
  _unit(ctx, u, battle, opts) {
    const s = this.scale;
    const X = this.sx(u.x);
    if (X < -120 || X > this.w + 120) return;
    const Y = this.sy(u.lane);
    const faction = battle.teams[u.team].faction;
    const body = u.undead ? '#ddd6c2' : faction.color;
    const style = { body, accent: u.undead ? '#8fff7a' : faction.accent, metal: u.undead ? '#9a9486' : '#cfd3d8' };
    const facing = u.facing || u.dir;
    ctx.save();
    if (u.dead) ctx.globalAlpha = Math.max(0, Math.min(1, (6 - u.deathT) / 1.5));
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(X, Y, 14 * s * u.size, 4 * s * u.size, 0, 0, Math.PI * 2);
    ctx.fill();
    if (u.controlled) {
      ctx.strokeStyle = 'rgba(255,215,90,0.9)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.ellipse(X, Y, 18 * s * u.size, 5 * s * u.size, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (u.furyT > 0) {
      ctx.fillStyle = 'rgba(255,60,30,0.18)';
      ctx.beginPath();
      ctx.ellipse(X, Y - 28 * s * u.size, 16 * s * u.size, 32 * s * u.size, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(X, Y);
    ctx.scale(s * u.size * facing * UNIT_SCALE, s * u.size * UNIT_SCALE);
    if (u.dead) {
      const { pose, tilt } = deathPose(u);
      ctx.rotate(tilt);
      const j = solve(pose);
      drawStick(ctx, u, style, pose, j);
    } else {
      const pose = computePose(u);
      if (u.kind === 'archer' && u.target && u.anim === 'attack') {
        const dx = Math.abs(u.target.x - u.x);
        pose.pitch = Math.min(0.7, dx / 900);
        u.aimPitch = pose.pitch;
      }
      const j = solve(pose);
      if (this.rim) drawStick(ctx, u, { body: this.rim, accent: this.rim, metal: this.rim, extra: 2.4, rimOnly: true }, pose, j);
      if (u.hurtT > 0.1) {
        style.body = '#ffffff';
      }
      drawStick(ctx, u, style, pose, j);
      if (u.shield > 0) {
        ctx.strokeStyle = 'rgba(125,255,176,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -30, 16, 34, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (u.dead) return;
    // health bar when hurt (or always for the controlled unit / bosses)
    if (u.hp < u.maxHp || u.controlled || u.boss) {
      const w = (u.boss ? 60 : 22) * s * Math.min(u.size, 1.6);
      const y = Y - (u.height + 14) * s;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(X - w / 2 - 1, y - 1, w + 2, 4 * s + 2);
      ctx.fillStyle = u.team === 0 ? '#7ed957' : '#ff5a4a';
      ctx.fillRect(X - w / 2, y, w * Math.max(0, u.hp / u.maxHp), 4 * s);
    }
    if (u.controlled) {
      // crown marker
      const y = Y - (u.height + 26) * s;
      ctx.fillStyle = '#ffd25a';
      ctx.beginPath();
      ctx.moveTo(X - 8 * s, y + 6 * s);
      ctx.lineTo(X - 8 * s, y - 2 * s);
      ctx.lineTo(X - 4 * s, y + 2 * s);
      ctx.lineTo(X, y - 5 * s);
      ctx.lineTo(X + 4 * s, y + 2 * s);
      ctx.lineTo(X + 8 * s, y - 2 * s);
      ctx.lineTo(X + 8 * s, y + 6 * s);
      ctx.closePath();
      ctx.fill();
    }
    if (u.stunT > 0) {
      ctx.fillStyle = '#ffe07a';
      const y = Y - (u.height + 8) * s;
      for (let i = 0; i < 3; i++) {
        const a = battle.time * 6 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(X + Math.cos(a) * 8 * s, y + Math.sin(a) * 3 * s, 2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------ fx
  _decals(ctx, battle) {
    const s = this.scale;
    for (const d of battle.fx.decals) {
      const X = this.sx(d.x);
      if (X < -60 || X > this.w + 60) continue;
      const Y = this.sy(d.lane);
      const a = Math.min(1, d.t / 3);
      ctx.globalAlpha = a * 0.75;
      if (d.type === 'scorch') {
        ctx.fillStyle = 'rgba(20,12,8,0.55)';
        ctx.beginPath();
        ctx.ellipse(X, Y, d.r * s, d.r * 0.28 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'crack') {
        ctx.strokeStyle = 'rgba(30,20,10,0.6)';
        ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + d.seed;
          ctx.moveTo(X, Y);
          ctx.lineTo(X + Math.cos(ang) * d.r * s, Y + Math.sin(ang) * d.r * 0.3 * s);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.ellipse(X, Y, d.r * s, d.r * 0.32 * s, 0, 0, Math.PI * 2);
        if (d.type === 'splat') {
          for (let i = 0; i < 4; i++) {
            const ang = d.seed + i * 1.7;
            ctx.ellipse(X + Math.cos(ang) * d.r * 1.3 * s, Y + Math.sin(ang) * d.r * 0.4 * s, d.r * 0.35 * s, d.r * 0.14 * s, 0, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _flames(ctx, battle) {
    const s = this.scale;
    for (const f of battle.flames) {
      const X = this.sx(f.x);
      const Y = this.sy(f.lane);
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, f.r * s);
      g.addColorStop(0, `rgba(255,160,60,${0.5 * Math.min(1, f.t)})`);
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(X, Y, f.r * s, f.r * 0.35 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _projectiles(ctx, battle) {
    const s = this.scale;
    for (const p of battle.projectiles) {
      const X = this.sx(p.x);
      if (X < -40 || X > this.w + 40) continue;
      const Y = this.sy(p.lane, p.h);
      if (p.type === 'arrow') {
        const ang = p.stuck !== undefined && p.stuck > 0 && p.angle !== undefined ? p.angle : Math.atan2(-p.vh, p.vx);
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(ang);
        if (p.stuck > 0) ctx.globalAlpha = Math.min(1, p.stuck);
        ctx.strokeStyle = p.fire ? '#ffb04a' : '#3a2a1a';
        ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        ctx.moveTo(-14 * s, 0);
        ctx.lineTo(4 * s, 0);
        ctx.stroke();
        ctx.fillStyle = '#d0d4d8';
        ctx.beginPath();
        ctx.moveTo(7 * s, 0);
        ctx.lineTo(2 * s, -2.4 * s);
        ctx.lineTo(2 * s, 2.4 * s);
        ctx.fill();
        ctx.fillStyle = '#e8e0d0';
        ctx.fillRect(-15 * s, -2 * s, 4 * s, 4 * s);
        ctx.restore();
      } else {
        const r = 7 * s;
        const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 3);
        g.addColorStop(0, 'rgba(255,240,180,1)');
        g.addColorStop(0.3, 'rgba(255,140,40,0.9)');
        g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(X, Y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _particles(ctx, battle) {
    const s = this.scale;
    for (const p of battle.fx.p) {
      const X = this.sx(p.x);
      if (X < -40 || X > this.w + 40) continue;
      const Y = this.sy(p.lane, p.h);
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      switch (p.type) {
        case 'fire':
        case 'flash': {
          ctx.globalCompositeOperation = 'lighter';
          const r = p.size * s * (p.type === 'flash' ? 1 : 0.5 + a * 0.5);
          const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'rgba(255,80,20,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(X, Y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'spark':
          ctx.fillRect(X - p.size * s * 0.5, Y - p.size * s * 0.5, p.size * s, p.size * s);
          break;
        case 'plus':
          ctx.fillRect(X - p.size * s, Y - 0.6 * s, p.size * 2 * s, 1.2 * s * 1.5);
          ctx.fillRect(X - 0.6 * s * 1.5, Y - p.size * s, 1.2 * s * 1.5, p.size * 2 * s);
          break;
        case 'rock':
        case 'bone':
          ctx.save();
          ctx.translate(X, Y);
          ctx.rotate(p.rot || 0);
          if (p.type === 'bone') ctx.fillRect(-p.size * s, -0.8 * s, p.size * 2 * s, 1.6 * s);
          else ctx.fillRect(-p.size * s * 0.5, -p.size * s * 0.5, p.size * s, p.size * s * 0.8);
          ctx.restore();
          break;
        default:
          ctx.beginPath();
          ctx.arc(X, Y, p.size * s * (p.type === 'smoke' || p.type === 'dust' ? 1.4 - a * 0.4 : 1), 0, Math.PI * 2);
          ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _texts(ctx, battle) {
    const s = this.scale;
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(13 * s)}px 'Bangers', 'Impact', sans-serif`;
    for (const t of battle.fx.texts) {
      ctx.globalAlpha = Math.min(1, t.life / 0.4);
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, this.sx(t.x) + 1, this.sy(t.lane, t.h) + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, this.sx(t.x), this.sy(t.lane, t.h));
    }
    ctx.globalAlpha = 1;
  }

  _darken(ctx, theme, battle) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const v = Math.round(255 * theme.light);
    ctx.fillStyle = theme.weather === 'rain' ? `rgb(${v - 20},${v},${v + 10})` : `rgb(${v},${v},${Math.min(255, v + 40)})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
    // warm light pools around torches and fires
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights || []) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, 'rgba(255,170,80,0.28)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.lights = [];
    void battle;
  }

  _weather(ctx, theme, dt) {
    const kind = theme.weather;
    if (kind === 'none') return;
    const s = this.scale;
    const target = { snow: 90, rain: 120, embers: 50, dust: 30, fireflies: 26 }[kind] || 0;
    while (this.weather.length < target) {
      this.weather.push({ x: Math.random() * this.w, y: Math.random() * this.h, v: Math.random(), p: Math.random() * 6 });
    }
    this.weather.length = target;
    for (const w of this.weather) {
      w.p += dt;
      if (kind === 'snow') {
        w.y += (25 + w.v * 30) * s * dt;
        w.x += Math.sin(w.p + w.v * 6) * 12 * s * dt;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(w.x, w.y, (1 + w.v * 1.6) * s, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'rain') {
        w.y += 520 * s * dt;
        w.x -= 80 * s * dt;
        ctx.strokeStyle = 'rgba(180,200,220,0.35)';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x + 3 * s, w.y - 12 * s);
        ctx.stroke();
      } else if (kind === 'embers') {
        w.y -= (20 + w.v * 40) * s * dt;
        w.x += Math.sin(w.p * 2 + w.v * 6) * 20 * s * dt;
        ctx.fillStyle = `rgba(255,${140 + w.v * 80},60,${0.5 + 0.5 * Math.sin(w.p * 5)})`;
        ctx.fillRect(w.x, w.y, 2 * s, 2 * s);
      } else if (kind === 'dust') {
        w.x += (30 + w.v * 40) * s * dt;
        ctx.fillStyle = 'rgba(230,200,150,0.25)';
        ctx.beginPath();
        ctx.arc(w.x, w.y, (2 + w.v * 3) * s, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'fireflies') {
        w.x += Math.sin(w.p * 0.7 + w.v * 9) * 14 * s * dt;
        w.y += Math.cos(w.p * 0.9 + w.v * 5) * 10 * s * dt;
        ctx.fillStyle = `rgba(230,255,140,${0.4 + 0.6 * Math.max(0, Math.sin(w.p * 3 + w.v * 10))})`;
        ctx.beginPath();
        ctx.arc(w.x, w.y, 1.8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      if (w.y > this.h + 10) w.y = -10;
      if (w.y < -10) w.y = this.h + 10;
      if (w.x > this.w + 10) w.x = -10;
      if (w.x < -10) w.x = this.w + 10;
    }
  }

  _vignette(ctx) {
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.45, this.w / 2, this.h / 2, this.w * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /** Small portrait of a unit type for buttons (returns a data URL). */
  static portrait(type, kind, color, accent, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.translate(size * 0.5, size * 0.92);
    const big = kind === 'giant' ? 0.78 : 1.05;
    ctx.scale(big, big);
    const u = { kind, anim: kind === 'archer' ? 'attack' : 'idle', animT: 0.5, walkPhase: 0, moving: false, speedFactor: 0, time: 0, hurtT: 0, carrying: kind === 'miner' ? 1 : 0 };
    const pose = computePose(u);
    const j = solve(pose);
    drawStick(ctx, u, { body: color, accent, metal: '#cfd3d8' }, pose, j);
    return c.toDataURL();
  }
}
