import { UNITS, RESEARCH } from '../data/units.js';
import { FACTIONS } from '../data/levels.js';
import { Unit } from './Unit.js';
import { Effects } from './Effects.js';
import { AI } from './AI.js';

export const WORLD_W = 3600;
const GRAVITY = 620;

class Mine {
  constructor(x, lane, owner) {
    this.x = x;
    this.lane = lane;
    this.owner = owner; // side it is closest to (0/1) or -1 for contested
    this.slots = [null, null, null, null];
    this.sparkle = Math.random() * 10;
  }

  claim(u) {
    const i = this.slots.findIndex((s) => !s || s.dead || s.mine !== this);
    if (i < 0) return false;
    this.slots[i] = u;
    u.mineSide = i % 2 === 0 ? -1 : 1;
    u.mineLaneOff = i < 2 ? -8 : 8;
    return true;
  }

  release(u) {
    const i = this.slots.indexOf(u);
    if (i >= 0) this.slots[i] = null;
  }

  get busy() {
    return this.slots.filter((s) => s && !s.dead && s.mine === this).length;
  }
}

/**
 * One battle: two teams, their statues and armies, the gold mines between
 * them, projectiles and effects. Options:
 *  { level, mode: 'campaign'|'endless'|'skirmish'|'attract', save, difficulty }
 */
export class Battle {
  constructor(opts, audio) {
    this.opts = opts;
    this.audio = audio;
    this.width = WORLD_W;
    this.time = 0;
    this.units = [];
    this.projectiles = [];
    this.flames = [];
    this.fx = new Effects(this);
    this.shakeAmt = 0;
    this.over = false;
    this.result = null;
    this.events = []; // UI messages
    const level = opts.level;
    this.level = level;
    this.theme = opts.theme || level?.theme || 'meadow';
    this.mode = opts.mode;

    const save = opts.save || {};
    const armory = save.armory || {};
    const playerFaction = FACTIONS.dawn;
    const enemyFaction = FACTIONS[opts.faction || level?.faction || 'bronze'];
    const diff = opts.difficulty ?? 1;

    const ranks = {};
    for (const k of Object.keys(UNITS)) ranks[k] = armory[`rank_${k}`] || 0;
    ranks.miners = armory.miners || 0;

    const statueHp0 = 3200 * (1 + 0.2 * (armory.statue || 0));
    this.teams = [
      {
        id: 0,
        faction: playerFaction,
        gold: 500 + 150 * (armory.start_gold || 0),
        essence: 0,
        essenceRate: 2.2 * (1 + 0.3 * (armory.essence || 0)),
        pop: 0,
        popCap: 40 + 5 * (armory.pop || 0),
        command: 'defend',
        research: {},
        ranks,
        queues: {},
        statue: this._statue(220, statueHp0, 0),
        mineMult: 1,
        statMult: 1,
        unlocked: opts.unlocked,
        stats: { trained: 0, kills: 0, lost: 0, gold: 0 },
      },
      {
        id: 1,
        faction: enemyFaction,
        gold: 400,
        essence: 120,
        essenceRate: 2.5,
        pop: 0,
        popCap: level?.ai?.popCap ?? 40,
        command: 'defend',
        research: {},
        ranks: {},
        queues: {},
        statue: this._statue(WORLD_W - 220, (level?.statueHp ?? 4000) * (opts.mode === 'skirmish' ? 1 : 1), 1),
        mineMult: level?.ai?.income ?? diff,
        statMult: opts.mode === 'skirmish' ? 0.85 + diff * 0.15 : 1,
        stats: { trained: 0, kills: 0, lost: 0, gold: 0 },
      },
    ];
    if (opts.mode === 'endless') {
      this.teams[1].statue.invulnerable = true;
      this.teams[1].statue.hidden = true;
    }

    // gold mines: two near each base and a contested pair in the middle
    this.mines = [
      new Mine(470, 4, 0), new Mine(600, -14, 0),
      new Mine(1560, 8, -1), new Mine(2040, -10, -1),
      new Mine(WORLD_W - 600, -14, 1), new Mine(WORLD_W - 470, 4, 1),
    ];

    // commanders
    this.ai = [];
    if (opts.mode === 'attract') {
      this.ai.push(new AI(this, 0, { pool: { blade: 3, ranger: 2, phalanx: 1, sage: 0.5, colossus: 0.3 }, miners: 5, income: 1.3, aggression: 1.1, firstAttack: 25, popCap: 30 }));
      this.teams[0].popCap = 30;
      this.teams[0].gold = 900;
    }
    if (opts.mode !== 'endless') {
      const aiCfg = level?.ai || opts.ai;
      this.ai.push(new AI(this, 1, aiCfg));
      if (opts.mode === 'attract') this.teams[1].gold = 900;
    }
    this.endless = opts.mode === 'endless' ? { wave: 0, timer: 20, spawning: [], spawnT: 0, best: save.bestEndless || 0 } : null;

    // starting units
    for (let i = 0; i < 2; i++) this.spawn(0, 'digger', true);
    if (opts.mode !== 'endless' && !level?.ai?.undead) for (let i = 0; i < 2; i++) this.spawn(1, 'digger', true);
    if (opts.mode === 'attract') for (let i = 0; i < 3; i++) this.spawn(0, 'digger', true);
  }

  _statue(x, hp, team) {
    return { x, hp, maxHp: hp, team, halfWidth: 46, alive: true, destroyT: 0, hitT: 0, towerCd: 0, invulnerable: false };
  }

  // ------------------------------------------------------------ economy & training
  canTrain(team, type) {
    const t = this.teams[team];
    const d = UNITS[type];
    if (team === 0 && t.unlocked && !t.unlocked.includes(type)) return 'locked';
    if (t.gold < d.cost) return 'gold';
    if (t.essence < (d.essence || 0)) return 'essence';
    if (t.pop + d.pop > t.popCap) return 'pop';
    return 'ok';
  }

  train(team, type) {
    if (this.canTrain(team, type) !== 'ok') return false;
    const t = this.teams[team];
    const d = UNITS[type];
    t.gold -= d.cost;
    t.essence -= d.essence || 0;
    t.pop += d.pop;
    const q = (t.queues[type] ||= { count: 0, t: 0 });
    q.count += 1;
    if (team === 0) this.audio.click();
    return true;
  }

  research(team, key) {
    const t = this.teams[team];
    const r = RESEARCH[key];
    if (t.research[key] || t.gold < r.cost || t.essence < (r.essence || 0)) return false;
    t.gold -= r.cost;
    t.essence -= r.essence || 0;
    t.research[key] = true;
    if (team === 0) {
      this.audio.upgrade();
      this.events.push({ type: 'toast', text: `${r.name} READY` });
    }
    return true;
  }

  spawn(team, type, instant = false, x = null) {
    const t = this.teams[team];
    const dir = team === 0 ? 1 : -1;
    const lane = -34 + Math.random() * 58;
    const sx = x ?? t.statue.x + dir * (instant ? 60 + Math.random() * 80 : 50);
    const u = new Unit(this, team, type, sx, lane);
    u.homeLane = lane;
    if (instant) t.pop += UNITS[type].pop;
    this.units.push(u);
    t.stats.trained += 1;
    return u;
  }

  claimMine(u) {
    const own = u.team;
    const statueX = this.teams[own].statue.x;
    const sorted = [...this.mines].sort((a, b) => Math.abs(a.x - statueX) - Math.abs(b.x - statueX));
    for (const m of sorted) {
      if (m.owner === 1 - own) continue; // don't walk into the enemy base
      if (m.claim(u)) return m;
    }
    return null;
  }

  deposit(u) {
    const t = this.teams[u.team];
    const amt = u.carrying;
    t.gold += amt;
    t.stats.gold += amt;
    u.carrying = 0;
    if (u.team === 0) {
      this.fx.floatText(t.statue.x + 30, u.lane, 90, `+${Math.round(amt)}`, '#f2c94c');
      this.audio.coin();
    }
  }

  // ------------------------------------------------------------ combat helpers
  frontline(team) {
    const dir = team === 0 ? 1 : -1;
    let front = this.teams[team].statue.x + dir * 200;
    for (const u of this.units) {
      if (u.team !== team || u.dead || u.hidden || u.kind === 'miner' || u.kind === 'healer') continue;
      if ((u.x - front) * dir > 0) front = u.x;
    }
    return front;
  }

  hitStatue(attacker, x, dmg) {
    const s = this.teams[1 - attacker.team].statue;
    if (!s.alive || s.invulnerable) return;
    if (Math.abs(x - s.x) > s.halfWidth + 30) return;
    s.hp -= dmg;
    s.hitT = 0.12;
    this.fx.debris(s.x, 0, 60 + Math.random() * 80, 3);
    if (attacker.team === 0) this.audio.stone();
    if (s.hp <= 0) this._statueDown(s);
  }

  _statueDown(s) {
    s.hp = 0;
    s.alive = false;
    this.shake(14);
    this.audio.crumble();
    this.fx.debris(s.x, 0, 100, 40);
    if (this.mode === 'attract') {
      this.reset = true;
      return;
    }
    if (s.team === 1 && this.level?.boss && !this.bossSpawned) {
      this.bossSpawned = true;
      const boss = this.spawn(1, this.level.boss, true, s.x - 40);
      boss.formation = 0;
      this.teams[1].command = 'attack';
      this.boss = boss;
      this.events.push({ type: 'banner', text: 'THE ASH WARLORD AWAKENS', sub: 'Defeat him to win' });
      this.audio.horn(true);
      return;
    }
    this._finish(s.team === 1 ? 'win' : 'lose');
  }

  _finish(res) {
    if (this.over) return;
    this.over = true;
    this.result = res;
    this.events.push({ type: 'end', result: res });
  }

  onUnitDeath(u, from) {
    const t = this.teams[u.team];
    t.pop -= u.def.pop;
    t.stats.lost += 1;
    if (from && from.team !== undefined) this.teams[from.team].stats.kills += 1;
    if (u.mine) u.mine.release(u);
    this.fx.death(u);
    this.audio.death(u);
    if (u.controlled) this.events.push({ type: 'controlLost' });
    if (u === this.boss) this._finish('win');
    // endless: reward per kill
    if (this.endless && u.team === 1) this.teams[0].gold += 10;
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  /** Ballistic arrow aimed to land on the target. */
  fireArrow(src, tgt, opts = {}) {
    const startH = src.height ? src.height * 0.62 : opts.h ?? 120;
    const tx = tgt.x + (tgt.dead ? 0 : (tgt.moving ? tgt.dir * 18 : 0)) + (Math.random() - 0.5) * 16;
    const th = tgt.statue ? 60 + Math.random() * 60 : tgt.ground ? 0 : (tgt.height ?? 50) * 0.55;
    const dx = tx - src.x;
    const T = Math.max(0.35, Math.min(1.25, Math.abs(dx) / 560));
    const vx = dx / T;
    const vh = (th - startH + 0.5 * GRAVITY * T * T) / T;
    const fire = this.teams[src.team].research?.fire && src.kind === 'archer';
    this.projectiles.push({
      type: 'arrow', team: src.team, x: src.x + (src.facing || src.dir) * 8, lane: tgt.lane ?? src.lane, h: startH,
      vx, vh, dmg: (opts.dmg ?? src.dmg) * (src._dmgMult ? src._dmgMult() : 1), src, fire, life: 4, stuck: 0,
    });
    if (src.team === 0 || Math.abs(src.x - this.camX) < 1200) this.audio.bow(src);
  }

  fireball(src, tgt) {
    const startH = src.height * 0.95;
    const tx = tgt.x + (Math.random() - 0.5) * 10;
    const th = tgt.statue ? 80 : 10;
    const dx = tx - src.x;
    const T = Math.max(0.5, Math.min(1.3, Math.abs(dx) / 420));
    const vx = dx / T;
    const vh = (th - startH + 0.5 * GRAVITY * T * T) / T;
    const inferno = this.teams[src.team].research.inferno;
    this.projectiles.push({
      type: 'fireball', team: src.team, x: src.x, lane: tgt.lane ?? src.lane, h: startH, vx, vh,
      dmg: src.dmg * src._dmgMult(), radius: src.def.radius * (inferno ? 1.35 : 1), inferno, src, life: 4,
    });
    this.audio.cast(src);
  }

  _explode(p) {
    for (const e of this.units) {
      if (e.team === p.team || e.dead || e.hidden) continue;
      const d = Math.hypot(e.x - p.x, (e.lane - p.lane) * 1.4);
      if (d < p.radius) e.takeDamage(p.dmg * (1 - (d / p.radius) * 0.5), p.src, true);
    }
    const s = this.teams[1 - p.team].statue;
    if (s.alive && !s.invulnerable && Math.abs(p.x - s.x) < s.halfWidth + p.radius * 0.6) {
      s.hp -= p.dmg * 0.8;
      s.hitT = 0.12;
      if (s.hp <= 0) this._statueDown(s);
    }
    this.fx.explosion(p.x, p.lane, p.radius);
    this.shake(4);
    this.audio.boom(p);
    if (p.inferno) this.flames.push({ x: p.x, lane: p.lane, team: p.team, t: 3.5, r: p.radius * 0.7, src: p.src });
  }

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.stuck > 0) {
        p.stuck -= dt;
        continue;
      }
      p.life -= dt;
      p.vh -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.h += p.vh * dt;
      if (p.type === 'fireball' && Math.random() < 0.8) this.fx.trail(p.x, p.lane, p.h);
      if (p.fire && Math.random() < 0.5) this.fx.ember(p.x, p.lane, p.h);
      // hit units
      let hit = false;
      for (const e of this.units) {
        if (e.team === p.team || e.dead || e.hidden) continue;
        if (Math.abs(e.x - p.x) < e.radius + 3 && Math.abs(e.lane - p.lane) < 16 && p.h > 0 && p.h < e.height) {
          if (p.type === 'fireball') this._explode(p);
          else {
            e.takeDamage(p.dmg, p.src, true);
            if (p.fire) e.burnT = 2.5;
          }
          hit = true;
          break;
        }
      }
      if (!hit) {
        const s = this.teams[1 - p.team].statue;
        if (s.alive && !s.invulnerable && Math.abs(p.x - s.x) < s.halfWidth && p.h < 200 && p.h > 0) {
          if (p.type === 'fireball') this._explode(p);
          else {
            s.hp -= p.dmg * 0.7;
            s.hitT = 0.08;
            if (s.hp <= 0) this._statueDown(s);
          }
          hit = true;
        }
      }
      if (hit) {
        p.dead = true;
        continue;
      }
      if (p.h <= 0) {
        if (p.type === 'fireball') {
          this._explode(p);
          p.dead = true;
        } else {
          p.h = 0;
          p.stuck = 2.5; // arrow sticks in the ground for a while
          p.angle = Math.atan2(-p.vh, p.vx);
        }
      }
      if (p.life <= 0) p.dead = true;
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead && !(p.stuck !== undefined && p.stuck < 0));
  }

  _updateFlames(dt) {
    for (const f of this.flames) {
      f.t -= dt;
      if (Math.random() < dt * 30) this.fx.ember(f.x + (Math.random() - 0.5) * f.r * 2, f.lane + (Math.random() - 0.5) * 20, 4);
      for (const e of this.units) {
        if (e.team === f.team || e.dead || e.hidden) continue;
        if (Math.abs(e.x - f.x) < f.r && Math.abs(e.lane - f.lane) < 26) e.takeDamage(14 * dt, f.src, true);
      }
    }
    this.flames = this.flames.filter((f) => f.t > 0);
  }

  _updateStatues(dt) {
    for (const t of this.teams) {
      const s = t.statue;
      s.hitT = Math.max(0, s.hitT - dt);
      if (!s.alive) {
        s.destroyT += dt;
        continue;
      }
      // towers: research or garrisoned soldiers shoot raiders
      const garrisoned = this.units.filter((u) => u.team === t.id && u.hidden && !u.dead && u.kind !== 'miner').length;
      if (!t.research.walls && garrisoned === 0) continue;
      s.towerCd -= dt;
      if (s.towerCd > 0) continue;
      const dir = t.id === 0 ? 1 : -1;
      let target = null;
      let bd = 520;
      for (const e of this.units) {
        if (e.team === t.id || e.dead || e.hidden) continue;
        const d = (e.x - s.x) * dir;
        if (d > -60 && d < bd) {
          bd = d;
          target = e;
        }
      }
      if (target) {
        const src = { x: s.x + dir * 20, lane: 0, team: t.id, dir, facing: dir, dmg: 16, kind: 'tower', height: 0 };
        this.fireArrow(src, target, { h: 150, dmg: 16 });
        s.towerCd = 1.6 / (1 + garrisoned * 0.25 + (t.research.walls ? 0.5 : 0));
      } else s.towerCd = 0.3;
    }
  }

  _updateTraining(dt) {
    for (const t of this.teams) {
      for (const [type, q] of Object.entries(t.queues)) {
        if (q.count <= 0) continue;
        q.t += dt;
        if (q.t >= UNITS[type].time) {
          q.t = 0;
          q.count -= 1;
          const u = this.spawn(t.id, type);
          if (t.id === 0) this.fx.spawnPuff(u);
        }
      }
    }
  }

  _separate() {
    // gentle push apart of same-team units so crowds don't stack
    const arr = this.units.filter((u) => !u.dead && !u.hidden).sort((a, b) => a.x - b.x);
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let k = i + 1; k < arr.length && arr[k].x - a.x < 12; k++) {
        const b = arr[k];
        if (a.team !== b.team || Math.abs(a.lane - b.lane) > 10) continue;
        if (a.kind === 'miner' || b.kind === 'miner') continue;
        // two units walking past each other must not lock up
        if (a.moving && b.moving && a.facing !== b.facing) continue;
        const push = (12 - (b.x - a.x)) * 0.15;
        if (!a.controlled) a.x -= push;
        if (!b.controlled) b.x += push;
      }
    }
  }

  // ------------------------------------------------------------ endless waves
  _updateEndless(dt) {
    const e = this.endless;
    const enemies = this.units.filter((u) => u.team === 1 && !u.dead).length;
    if (e.spawning.length) {
      e.spawnT -= dt;
      if (e.spawnT <= 0) {
        e.spawnT = 0.7;
        const type = e.spawning.shift();
        const u = this.spawn(1, type, true, WORLD_W - 60);
        u.formation = 0;
        this.teams[1].command = 'attack';
      }
      return;
    }
    if (enemies === 0) {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.wave += 1;
        const n = e.wave;
        const list = [];
        const count = 4 + Math.floor(n * 1.7);
        for (let i = 0; i < count; i++) {
          const r = Math.random();
          if (n >= 3 && r < 0.18) list.push('ghoul');
          else if (n >= 2 && r < 0.38) list.push('bonearcher');
          else list.push('skeleton');
        }
        if (n % 5 === 0) for (let i = 0; i < n / 5; i++) list.push('bonegiant');
        e.spawning = list;
        e.timer = 14;
        this.teams[1].statMult = 1 + n * 0.04;
        this.events.push({ type: 'banner', text: `NIGHT ${n}`, sub: n % 5 === 0 ? 'A Bone Titan approaches' : `${list.length} undead incoming` });
        this.audio.horn(n % 5 === 0);
        if (n > 1) {
          this.teams[0].gold += 150 + n * 20;
          this.events.push({ type: 'toast', text: `NIGHT SURVIVED  +${150 + n * 20} GOLD` });
        }
      }
    }
  }

  // ------------------------------------------------------------ main update
  update(dt) {
    this.time += dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    for (const t of this.teams) {
      t.essence += t.essenceRate * dt * (t.id === 1 ? t.mineMult : 1);
      if (t.id === 1 && this.ai.length) t.gold += 2.5 * t.mineMult * dt; // tribute trickle
    }
    for (const ai of this.ai) ai.update(dt);
    if (this.endless) this._updateEndless(dt);
    this._updateTraining(dt);
    for (const u of this.units) u.update(dt);
    this._separate();
    this._updateProjectiles(dt);
    this._updateFlames(dt);
    this._updateStatues(dt);
    this.fx.update(dt);
    this.units = this.units.filter((u) => !u.removed);
    for (const m of this.mines) m.sparkle += dt;
    // keep units on the field
    for (const u of this.units) {
      if (u.x < 30) u.x = 30;
      if (u.x > this.width - 30) u.x = this.width - 30;
    }
  }
}
