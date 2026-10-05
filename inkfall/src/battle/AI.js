import { UNITS } from '../data/units.js';

/**
 * Enemy commander. Keeps diggers working, trains a weighted army mix,
 * defends until it feels strong enough, then marches; pulls back when
 * the fight turns against it.
 */
export class AI {
  constructor(battle, team, cfg) {
    this.b = battle;
    this.team = team;
    this.cfg = {
      pool: { blade: 1 },
      miners: 3,
      income: 1,
      aggression: 1.2,
      firstAttack: 80,
      popCap: 40,
      ...cfg,
    };
    this.t = 0;
    this.thinkT = 0;
    this.nextPick = null;
    this.researched = false;
    const t = battle.teams[team];
    t.popCap = this.cfg.popCap;
  }

  _count(type) {
    let n = 0;
    for (const u of this.b.units) if (u.team === this.team && !u.dead && u.type === type) n++;
    const q = this.b.teams[this.team].queues[type];
    return n + (q ? q.count : 0);
  }

  _power(team) {
    let p = 0;
    for (const u of this.b.units) {
      if (u.team !== team || u.dead || u.kind === 'miner') continue;
      const d = u.def;
      const dps = d.kind === 'healer' ? 10 : (d.dmg || 0) / d.rate * (d.radius ? 2 : 1);
      p += Math.sqrt(u.hp * dps);
    }
    return p;
  }

  _pickUnit() {
    const pool = this.cfg.pool;
    const entries = Object.entries(pool).filter(([, w]) => w > 0);
    let total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [type, w] of entries) {
      r -= w;
      if (r <= 0) return type;
    }
    return entries[0][0];
  }

  update(dt) {
    const b = this.b;
    const me = b.teams[this.team];
    if (!me.statue.alive && !b.boss) return;
    this.t += dt;
    this.thinkT -= dt;

    // economy
    if (this.cfg.miners > 0 && this._count('digger') < this.cfg.miners) b.train(this.team, 'digger');

    // army
    if (!this.nextPick) this.nextPick = this._pickUnit();
    const verdict = b.canTrain(this.team, this.nextPick);
    if (verdict === 'ok') {
      b.train(this.team, this.nextPick);
      this.nextPick = null;
    } else if (verdict === 'pop' || verdict === 'locked') {
      this.nextPick = null;
    }
    // undead armies get free reinforcements instead of mining
    if (this.cfg.undead) me.gold += 6 * this.cfg.income * dt;

    // one research once rich
    if (!this.researched && this.t > 120 && me.gold > 900) {
      const opts = Object.keys(this.cfg.pool).map((k) => ({ blade: 'fury', ranger: 'fire', phalanx: 'wall', sage: 'inferno', colossus: 'quake' }[k])).filter(Boolean);
      if (opts.length && b.research(this.team, opts[Math.floor(Math.random() * opts.length)])) this.researched = true;
    }

    if (this.thinkT > 0) return;
    this.thinkT = 1;
    const mine = this._power(this.team);
    const theirs = this._power(1 - this.team);
    const army = b.units.filter((u) => u.team === this.team && !u.dead && u.kind !== 'miner').length;
    const dir = this.team === 0 ? 1 : -1;
    const ownStatue = me.statue;
    const threat = b.units.some((u) => u.team !== this.team && !u.dead && !u.hidden && u.kind !== 'miner' && Math.abs(u.x - ownStatue.x) < 700);

    let cmd = me.command;
    if (b.boss && this.team === 1) cmd = 'attack';
    else if (this.t < this.cfg.firstAttack) cmd = 'defend';
    else if (mine > theirs * this.cfg.aggression && army >= 4) cmd = 'attack';
    else if (cmd === 'attack' && mine < theirs * 0.75) cmd = 'defend';
    // last stand: everyone defends the statue when it is low and under attack
    if (threat && ownStatue.hp < ownStatue.maxHp * 0.3 && mine < theirs) cmd = 'defend';
    // late game pressure so matches don't stall
    if (this.t > 420 && army >= 6) cmd = 'attack';
    me.command = cmd;
    void dir;
  }
}

export function unitValue(type) {
  const d = UNITS[type];
  return d.cost + (d.essence || 0) * 2;
}
