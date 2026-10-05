import { UNITS } from '../data/units.js';

let NEXT_ID = 1;

// formation depth relative to the defend line (+ = towards the enemy)
const FORMATION = { melee: 30, spear: 55, giant: 20, archer: -70, mage: -95, healer: -40, miner: 0 };

export class Unit {
  constructor(battle, team, type, x, lane) {
    const def = UNITS[type];
    this.id = NEXT_ID++;
    this.battle = battle;
    this.team = team;
    this.def = def;
    this.type = type;
    this.kind = def.kind;
    this.size = def.size || 1;
    this.undead = !!def.undead;
    this.boss = !!def.boss;
    const t = battle.teams[team];
    const rank = t.ranks?.[type] || 0;
    const mult = (1 + rank * 0.12) * (t.statMult || 1);
    this.maxHp = def.hp * mult;
    this.hp = this.maxHp;
    this.dmg = (def.dmg || 0) * mult;
    this.heal = (def.heal || 0) * mult;
    this.x = x;
    this.lane = lane;
    this.dir = team === 0 ? 1 : -1;
    this.cd = Math.random() * 0.5;
    this.anim = 'idle';
    this.animT = 0;
    this.animDur = 0.5;
    this.walkPhase = Math.random() * 6;
    this.moving = false;
    this.speedFactor = 0.8;
    this.time = Math.random() * 10;
    this.hurtT = 0;
    this.dead = false;
    this.deathT = 0;
    this.removed = false;
    this.hidden = false;
    this.controlled = false;
    this.carrying = 0;
    this.mine = null;
    this.swings = 0;
    this.minerState = 'toMine';
    this.furyT = 0;
    this.furyCd = 0;
    this.stunT = 0;
    this.burnT = 0;
    this.shield = 0;
    this.formation = (FORMATION[this.kind] || 0) + (Math.random() - 0.5) * 50;
    this.target = null;
    this.hitDone = false;
    this.ctrlMove = 0;
    this.ctrlAttack = false;
  }

  get alive() {
    return !this.dead;
  }

  get height() {
    return 75 * this.size;
  }

  get radius() {
    return 11 * this.size;
  }

  get speed() {
    let s = this.def.speed;
    if (this.furyT > 0) s *= 1.4;
    if (this.controlled) s *= 1.15;
    return s;
  }

  takeDamage(amount, from, ranged = false) {
    if (this.dead || this.hidden) return 0;
    let dmg = amount * (1 - (this.def.armor || 0));
    if (ranged) {
      let ra = this.def.rangedArmor || 0;
      const t = this.battle.teams[this.team];
      if (this.kind === 'spear' && t.research.wall && !this.moving) ra = 0.8;
      dmg *= 1 - ra;
    }
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    this.hurtT = 0.16;
    this.battle.fx.hit(this, ranged);
    if (this.hp <= 0) this.die(from);
    return dmg;
  }

  die(from) {
    if (this.dead) return;
    this.dead = true;
    this.deathT = 0;
    this.anim = 'death';
    this.hp = 0;
    this.battle.onUnitDeath(this, from);
  }

  // ------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > 6) this.removed = true;
      return;
    }
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.cd -= dt * (this.furyT > 0 ? 1.4 : 1);
    this.furyT = Math.max(0, this.furyT - dt);
    this.furyCd = Math.max(0, this.furyCd - dt);
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.hp -= 6 * dt;
      if (Math.random() < dt * 8) this.battle.fx.ember(this.x, this.lane, this.height * 0.6);
      if (this.hp <= 0) this.die(null);
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.moving = false;
      return;
    }
    if (this.anim === 'attack' || this.anim === 'mine') {
      this.animT += dt / this.animDur;
      if (!this.hitDone && this.animT >= this.hitAt) {
        this.hitDone = true;
        if (this.anim === 'attack') this._strike();
        else this._mineSwing();
      }
      if (this.animT >= 1) {
        this.anim = 'idle';
        this.animT = 0;
      }
    }

    if (this.kind === 'miner' && !this.controlled) this._minerBrain(dt);
    else if (this.controlled) this._controlledBrain(dt);
    else this._combatBrain(dt);

    if (this.moving) this.walkPhase += dt * (this.speedFactor * 9);
  }

  _moveToward(x, dt, stopDist = 4) {
    const dx = x - this.x;
    if (Math.abs(dx) <= stopDist) {
      this.moving = false;
      return true;
    }
    if (this.anim === 'attack') {
      this.moving = false;
      return false;
    }
    const step = Math.sign(dx) * Math.min(Math.abs(dx), this.speed * dt);
    this.x += step;
    this.facing = Math.sign(dx);
    this.moving = true;
    this.speedFactor = this.speed / 80;
    return false;
  }

  _startAttack(target) {
    this.target = target;
    this.anim = 'attack';
    this.animT = 0;
    this.hitDone = false;
    const base = { melee: 0.5, archer: 0.75, spear: 0.6, mage: 0.95, healer: 0.8, giant: 1.05, miner: 0.5 }[this.kind] || 0.5;
    this.animDur = this.furyT > 0 ? base * 0.75 : base;
    this.hitAt = { melee: 0.55, archer: 0.68, spear: 0.52, mage: 0.6, healer: 0.5, giant: 0.64, miner: 0.6 }[this.kind] || 0.55;
    this.cd = this.def.rate * (this.controlled ? 0.85 : 1);
    this.moving = false;
    if (target) this.facing = Math.sign(target.x - this.x) || this.dir;
  }

  _dmgMult() {
    let m = 1;
    if (this.controlled) m *= 1.5;
    if (this.furyT > 0) m *= 1.4;
    return m;
  }

  _strike() {
    const b = this.battle;
    const tgt = this.target;
    switch (this.kind) {
      case 'archer':
        if (tgt) b.fireArrow(this, tgt);
        break;
      case 'mage':
        if (tgt) b.fireball(this, tgt);
        break;
      case 'healer': {
        const t = b.teams[this.team];
        const amount = this.heal * (t.research.aegis ? 1.5 : 1);
        for (const a of b.units) {
          if (a.team !== this.team || a.dead || a.hidden) continue;
          if (Math.abs(a.x - this.x) < this.def.range * 0.6) {
            a.hp = Math.min(a.maxHp, a.hp + amount);
            if (t.research.aegis) a.shield = Math.min(40, a.shield + 12);
            b.fx.heal(a);
          }
        }
        b.audio.heal(this);
        break;
      }
      case 'giant': {
        const reach = this.def.range * this.size * 0.42;
        const cx = this.x + (this.facing || this.dir) * reach;
        const quake = b.teams[this.team].research.quake || this.boss;
        for (const e of b.units) {
          if (e.team === this.team || e.dead || e.hidden) continue;
          if (Math.abs(e.x - cx) < this.def.radius && Math.abs(e.lane - this.lane) < 40) {
            e.takeDamage(this.dmg * this._dmgMult(), this);
            if (quake) e.stunT = Math.max(e.stunT, 1.1);
            e.x += (this.facing || this.dir) * 14;
          }
        }
        b.hitStatue(this, cx, this.dmg * this._dmgMult() * 1.2);
        b.fx.slam(cx, this.lane, this.size);
        b.shake(this.boss ? 9 : 6);
        b.audio.slam(this);
        break;
      }
      default: {
        // melee / spear / miner fighting: hit the target (or the statue)
        const reach = this.def.range + 12;
        if (tgt && !tgt.dead && !tgt.hidden && Math.abs(tgt.x - this.x) <= reach + tgt.radius) {
          tgt.takeDamage(this.dmg * this._dmgMult(), this);
          b.audio.clash(this);
        } else {
          b.hitStatue(this, this.x + (this.facing || this.dir) * reach, this.dmg * this._dmgMult());
        }
        // blade fury research
        const t = b.teams[this.team];
        if (this.kind === 'melee' && t.research.fury && this.furyCd <= 0 && !this.undead) {
          this.furyT = 6;
          this.furyCd = 18;
          this.hp -= this.maxHp * 0.08;
          b.fx.fury(this);
        }
      }
    }
  }

  // -------------------------------------------------------------- combat AI
  _findTarget(maxDist) {
    const b = this.battle;
    let best = null;
    let bd = maxDist;
    for (const e of b.units) {
      if (e.team === this.team || e.dead || e.hidden) continue;
      const d = Math.abs(e.x - this.x) + Math.abs(e.lane - this.lane) * 0.3;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  _healTarget() {
    let best = null;
    let worst = 0.98;
    for (const a of this.battle.units) {
      if (a.team !== this.team || a.dead || a.hidden || a === this) continue;
      if (Math.abs(a.x - this.x) > this.def.range) continue;
      const r = a.hp / a.maxHp;
      if (r < worst) {
        worst = r;
        best = a;
      }
    }
    return best;
  }

  _combatBrain(dt) {
    const b = this.battle;
    const team = b.teams[this.team];
    const cmd = team.command;
    const statue = team.statue;
    const enemyStatue = b.teams[1 - this.team].statue;

    if (cmd === 'garrison') {
      const gx = statue.x - this.dir * 40;
      if (this._moveToward(gx, dt, 10)) {
        this.hidden = true;
        this.facing = this.dir;
      }
      return;
    }
    this.hidden = false;

    const ranged = this.kind === 'archer' || this.kind === 'mage';
    const range = this.def.range;

    if (this.kind === 'healer') {
      const h = this._healTarget();
      if (h && this.cd <= 0 && this.anim !== 'attack') {
        this._startAttack(h);
        return;
      }
    }

    // where should we be?
    const defendLine = statue.x + this.dir * (420 + this.formation);
    let anchor;
    if (cmd === 'attack') anchor = enemyStatue.alive ? enemyStatue.x - this.dir * (ranged ? range * 0.8 : 40) : this.x;
    else anchor = defendLine;
    if (this.kind === 'healer') {
      // stay just behind the front of our army
      const front = b.frontline(this.team);
      anchor = front - this.dir * 70;
      if (cmd !== 'attack') anchor = this.dir > 0 ? Math.min(anchor, defendLine) : Math.max(anchor, defendLine);
    }

    const aggro = ranged ? range + 40 : cmd === 'attack' ? 300 : 230;
    const target = this.kind === 'healer' ? null : this._findTarget(aggro);
    const leash = cmd === 'attack' ? 1e9 : 340;

    if (target && Math.abs(target.x - defendLine) < leash) {
      const dist = Math.abs(target.x - this.x);
      const want = ranged ? range * 0.85 : range + target.radius * 0.6;
      if (dist <= want + 2) {
        this.moving = false;
        this.facing = Math.sign(target.x - this.x) || this.dir;
        if (this.cd <= 0 && this.anim !== 'attack') this._startAttack(target);
      } else {
        this._moveToward(target.x - Math.sign(target.x - this.x) * want, dt, 2);
      }
    } else if (cmd === 'attack' && enemyStatue.alive) {
      const sx = enemyStatue.x - this.dir * (enemyStatue.halfWidth + (ranged ? range * 0.7 : range * 0.6));
      if (this._moveToward(sx + this.formation * 0.3 * -this.dir, dt, 6)) {
        this.facing = this.dir;
        if (this.cd <= 0 && this.anim !== 'attack' && this.kind !== 'healer') this._startAttack(null);
      }
      if (ranged && this.anim === 'attack' && !this.target) this.target = { x: enemyStatue.x, lane: this.lane, statue: true, height: 120 };
    } else {
      if (this._moveToward(anchor, dt, 6)) this.facing = this.dir;
    }
    this._laneDrift(dt);
  }

  _laneDrift(dt) {
    // spread out vertically a bit so crowds read well
    if (this.homeLane === undefined) this.homeLane = this.lane;
    this.lane += (this.homeLane - this.lane) * Math.min(1, dt * 2);
  }

  // -------------------------------------------------------------- miners
  _minerBrain(dt) {
    const b = this.battle;
    const team = b.teams[this.team];
    const statue = team.statue;
    if (team.command === 'garrison') {
      if (this.mine) this._leaveMine();
      if (this.anim === 'mine') this.anim = 'idle';
      this.minerState = this.carrying > 0 ? 'toBase' : 'toMine';
      if (this._moveToward(statue.x - this.dir * 40, dt, 10)) this.hidden = true;
      return;
    }
    this.hidden = false;
    if (this.minerState === 'toMine') {
      if (!this.mine) this.mine = b.claimMine(this);
      if (!this.mine) {
        this._moveToward(statue.x + this.dir * 80, dt, 8);
        return;
      }
      const spot = this.mine.x + this.mineSide * 22;
      this.lane += (this.mine.lane + this.mineLaneOff - this.lane) * Math.min(1, dt * 3);
      if (this._moveToward(spot, dt, 3)) {
        this.minerState = 'mining';
        this.swings = 0;
        this.facing = Math.sign(this.mine.x - this.x) || this.dir;
      }
    } else if (this.minerState === 'mining') {
      if (this.anim !== 'mine') {
        this.anim = 'mine';
        this.animT = 0;
        this.hitDone = false;
        this.hitAt = 0.6;
        const guild = team.ranks?.miners || 0;
        this.animDur = 0.62 / (1 + guild * 0.15);
      }
    } else if (this.minerState === 'toBase') {
      if (this._moveToward(statue.x + this.dir * 55, dt, 6)) {
        b.deposit(this);
        this.minerState = 'toMine';
      }
    }
  }

  _mineSwing() {
    const b = this.battle;
    if (!this.mine) return; // interrupted (garrison / taken over)
    b.fx.mineSpark(this.mine.x, this.mine.lane);
    b.audio.mine(this);
    this.swings += 1;
    if (this.swings >= 4) {
      const t = b.teams[this.team];
      this.carrying = this.def.carry * (t.research.sacks ? 1.5 : 1) * (t.mineMult || 1);
      this._leaveMine();
      this.minerState = 'toBase';
    }
  }

  _leaveMine() {
    if (this.mine) this.mine.release(this);
    this.mine = null;
  }

  // -------------------------------------------------------------- player control
  _controlledBrain(dt) {
    const b = this.battle;
    this.hidden = false;
    if (this.mine) this._leaveMine();
    if (this.anim === 'mine') this.anim = 'idle';
    const mv = this.ctrlMove;
    if (mv !== 0 && this.anim !== 'attack') {
      this.x += mv * this.speed * dt;
      this.facing = mv;
      this.moving = true;
      this.speedFactor = this.speed / 80;
    } else {
      this.moving = false;
    }
    this.x = Math.max(40, Math.min(b.width - 40, this.x));
    if (this.ctrlAttack && this.cd <= 0 && this.anim !== 'attack') {
      // auto-pick something in front to shoot / hit
      const f = this.facing || this.dir;
      let target = null;
      let bd = this.kind === 'archer' || this.kind === 'mage' ? this.def.range : this.def.range + 30;
      for (const e of b.units) {
        if (e.team === this.team || e.dead || e.hidden) continue;
        const dx = (e.x - this.x) * f;
        if (dx > -10 && dx < bd) {
          bd = dx;
          target = e;
        }
      }
      if (this.kind === 'healer') target = this._healTarget() || this;
      if (!target && (this.kind === 'archer' || this.kind === 'mage')) {
        target = { x: this.x + f * this.def.range * 0.7, lane: this.lane, ground: true, height: 0 };
      }
      this._startAttack(target);
    }
  }
}
