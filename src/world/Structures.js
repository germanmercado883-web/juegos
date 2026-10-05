import * as THREE from 'three';
import { box, flatMat, prismGeometry } from '../utils/geometry.js';
import { RNG } from '../utils/random.js';
import { BUILDINGS, CONTAINERS, CRATES } from './mapLayout.js';

/**
 * Builds every man-made structure on the map. Pieces are authored in a
 * local frame (door facing +Z) and registered as oriented box colliders.
 * The resulting meshes are later merged by material in World.
 */
export class StructureBuilder {
  constructor(terrain, physics) {
    this.terrain = terrain;
    this.physics = physics;
    this.group = new THREE.Group();
    this.group.name = 'structures';
    this.rng = new RNG(99);
  }

  build() {
    for (const b of BUILDINGS) {
      const ctx = this._ctx(b.x, b.z, b.rot || 0);
      if (b.type === 'house') this._house(ctx, b);
      else if (b.type === 'barn') this._barn(ctx, b);
      else if (b.type === 'warehouse') this._warehouse(ctx, b);
      else if (b.type === 'shed') this._shed(ctx, b);
      else if (b.type === 'tower') this._waterTower(ctx);
      else if (b.type === 'ruin') this._ruin(ctx, b);
    }
    for (const c of CONTAINERS) this._container(this._ctx(c.x, c.z, c.rot), c);
    for (const [x, z] of CRATES) this._crate(this._ctx(x, z, this.rng.range(0, Math.PI)), 0);
    this._farmProps();
    return this.group;
  }

  _ctx(x, z, rot) {
    const y = this.terrain.groundAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    this.group.add(g);
    return { g, x, y, z, rot, cos: Math.cos(rot), sin: Math.sin(rot) };
  }

  /** Add a solid box in local coordinates (centre lx, ly, lz). */
  _solid(ctx, w, h, d, lx, ly, lz, color, collide = true, extraRot = 0) {
    const m = box(w, h, d, color);
    m.position.set(lx, ly, lz);
    m.rotation.y = extraRot;
    ctx.g.add(m);
    if (collide) {
      const wx = ctx.x + lx * ctx.cos + lz * ctx.sin;
      const wz = ctx.z - lx * ctx.sin + lz * ctx.cos;
      this.physics.addBox(wx, wz, w / 2, d / 2, ctx.rot + extraRot, ctx.y + ly - h / 2, ctx.y + ly + h / 2);
    }
    return m;
  }

  _decor(ctx, w, h, d, lx, ly, lz, color) {
    return this._solid(ctx, w, h, d, lx, ly, lz, color, false);
  }

  /** Four walls with a door gap on +Z, optional windows. */
  _walls(ctx, w, d, H, t, color, doorW = 1.6, doorH = 2.3) {
    this._solid(ctx, w, H, t, 0, H / 2, -d / 2 + t / 2, color);
    this._solid(ctx, t, H, d, -w / 2 + t / 2, H / 2, 0, color);
    this._solid(ctx, t, H, d, w / 2 - t / 2, H / 2, 0, color);
    const seg = (w - doorW) / 2;
    this._solid(ctx, seg, H, t, -w / 2 + seg / 2, H / 2, d / 2 - t / 2, color);
    this._solid(ctx, seg, H, t, w / 2 - seg / 2, H / 2, d / 2 - t / 2, color);
    this._solid(ctx, doorW, H - doorH, t, 0, doorH + (H - doorH) / 2, d / 2 - t / 2, color);
  }

  _windows(ctx, w, d, y, t) {
    const glass = '#3b4954';
    const frame = '#e8e2d2';
    const ww = 1.1;
    const wh = 0.9;
    const put = (lx, lz, alongX) => {
      const gw = alongX ? ww : t + 0.06;
      const gd = alongX ? t + 0.06 : ww;
      this._decor(ctx, gw + (alongX ? 0.16 : 0), wh + 0.16, gd + (alongX ? 0 : 0.16), lx, y, lz, frame);
      this._decor(ctx, gw, wh, gd + (alongX ? 0.02 : 0), lx, y, lz, glass);
    };
    put(-w / 4, -d / 2 + t / 2, true);
    put(w / 4, -d / 2 + t / 2, true);
    put(-w / 2 + t / 2, 0, false);
    put(w / 2 - t / 2, 0, false);
    put(-w / 2 + w / 4 - 0.4, d / 2 - t / 2, true);
  }

  _gableRoof(ctx, w, d, H, rise, color, overhang = 0.5) {
    const roof = new THREE.Mesh(prismGeometry(w + overhang * 2, rise, d + overhang * 2), flatMat(color));
    roof.position.set(0, H, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    ctx.g.add(roof);
    // roof slab collider so bullets don't pass through
    this.physics.addBox(ctx.x, ctx.z, w / 2 + overhang, d / 2 + overhang, ctx.rot, ctx.y + H, ctx.y + H + rise * 0.6);
    // ridge cap
    this._decor(ctx, 0.3, 0.18, d + overhang * 2 + 0.05, 0, H + rise, 0, '#3e3a36');
  }

  _house(ctx, b) {
    const { w, d } = b;
    const H = 3.0;
    const t = 0.25;
    this._solid(ctx, w + 0.4, 0.35, d + 0.4, 0, 0.0, 0, '#8d8579'); // foundation (top at 0.175)
    this._walls(ctx, w, d, H, t, b.wall);
    this._decor(ctx, w + 0.04, 0.25, d + 0.04, 0, 0.3, 0, '#a59a88'); // base trim
    this._windows(ctx, w, d, 1.6, t);
    this._gableRoof(ctx, w, d, H, 1.8, b.roof);
    // chimney + door step + porch light
    this._decor(ctx, 0.6, 1.8, 0.6, w / 4, H + 1.3, -d / 5, '#7a6e64');
    this._solid(ctx, 2.2, 0.2, 1.0, 0, 0.1, d / 2 + 0.5, '#9a9286');
    // simple interior: table + shelf
    this._solid(ctx, 1.4, 0.8, 0.8, -w / 4, 0.55, -d / 6, '#7b5a3e');
    this._solid(ctx, 0.5, 1.8, 2.0, w / 2 - 0.6, 1.05, -d / 6, '#6c5038');
  }

  _barn(ctx, b) {
    const { w, d } = b;
    const H = 4.2;
    const t = 0.3;
    this._solid(ctx, w + 0.3, 0.3, d + 0.3, 0, 0.0, 0, '#7f776c');
    this._walls(ctx, w, d, H, t, b.wall, 3.6, 3.2);
    // white trim around the big door
    this._decor(ctx, 0.25, 3.3, t + 0.1, -1.9, 1.65, d / 2 - t / 2, '#ece6d8');
    this._decor(ctx, 0.25, 3.3, t + 0.1, 1.9, 1.65, d / 2 - t / 2, '#ece6d8');
    this._decor(ctx, 4.05, 0.25, t + 0.1, 0, 3.3, d / 2 - t / 2, '#ece6d8');
    for (const s of [-1, 1]) {
      this._decor(ctx, 0.2, H, t + 0.08, s * (w / 2 - 0.1), H / 2, d / 2 - t / 2, '#ece6d8');
    }
    this._gableRoof(ctx, w, d, H, 3.0, b.roof, 0.6);
    // loft window
    this._decor(ctx, 1.3, 1.1, 0.1, 0, H + 1.0, d / 2 + 0.55, '#2f2a26');
    // hay bales inside
    for (let i = 0; i < 3; i++) this._hay(ctx, -w / 2 + 2 + i * 1.5, -d / 2 + 1.5);
  }

  _hay(ctx, lx, lz) {
    const geo = new THREE.CylinderGeometry(0.65, 0.65, 1.2, 8);
    const m = new THREE.Mesh(geo, flatMat('#d2b55c'));
    m.rotation.z = Math.PI / 2;
    m.position.set(lx, 0.65, lz);
    m.castShadow = m.receiveShadow = true;
    ctx.g.add(m);
    const wx = ctx.x + lx * ctx.cos + lz * ctx.sin;
    const wz = ctx.z - lx * ctx.sin + lz * ctx.cos;
    this.physics.addBox(wx, wz, 0.6, 0.6, ctx.rot, ctx.y, ctx.y + 1.3);
  }

  _warehouse(ctx, b) {
    const { w, d } = b;
    const H = 6.5;
    const t = 0.3;
    this._solid(ctx, w + 0.6, 0.3, d + 0.6, 0, 0.0, 0, '#7d7f7b');
    this._walls(ctx, w, d, H, t, b.wall, 6, 5);
    // back side door
    // corrugated ribs on the long walls
    for (let x = -w / 2 + 1; x <= w / 2 - 1; x += 1.6) {
      this._decor(ctx, 0.14, H - 0.4, 0.12, x, H / 2, -d / 2 - 0.02, '#7f8a8c');
      if (Math.abs(x) > 3.4) this._decor(ctx, 0.14, H - 0.4, 0.12, x, H / 2, d / 2 + 0.02, '#7f8a8c');
    }
    // stripes + sign above the door
    this._decor(ctx, w + 0.05, 0.5, d + 0.05, 0, H - 0.4, 0, '#c7a03a');
    this._decor(ctx, 4.6, 1.1, 0.12, 0, 5.9, d / 2 + 0.1, '#2f3a40');
    this._decor(ctx, 3.8, 0.25, 0.14, 0, 5.9, d / 2 + 0.12, '#d9d2c0');
    // half-open roller door
    this._decor(ctx, 6, 1.2, 0.2, 0, 4.4, d / 2 - 0.2, '#5d676b');
    // low pitched roof
    this._gableRoof(ctx, w, d, H, 1.4, b.roof, 0.4);
    // interior shelving and crates for cover
    for (const x of [-8, -2, 4]) this._solid(ctx, 4, 2.6, 1, x, 1.45, -d / 2 + 1.6, '#6d5b45');
    this._crate(ctx, 1.3, 5, 2);
    this._crate(ctx, 1.3, 6.2, 2.2);
    this._crate(ctx, 1.3, -7, 1);
    this._crate(ctx, 1.0, -7, 1, 0.3, 1.3);
  }

  _shed(ctx, b) {
    const { w, d } = b;
    const H = 2.6;
    const t = 0.2;
    this._solid(ctx, w + 0.2, 0.25, d + 0.2, 0, 0, 0, '#857c70');
    this._walls(ctx, w, d, H, t, b.wall, 1.4, 2.1);
    const roof = this._decor(ctx, w + 0.8, 0.15, d + 0.9, 0, H + 0.25, 0, b.roof);
    roof.rotation.x = 0.12;
    this.physics.addBox(ctx.x, ctx.z, w / 2, d / 2, ctx.rot, ctx.y + H, ctx.y + H + 0.5);
    this._solid(ctx, 1.2, 0.9, 0.6, -w / 4, 0.55, -d / 2 + 0.6, '#5f4d3a');
  }

  _waterTower(ctx) {
    const legH = 9;
    const s = 2.2;
    for (const [lx, lz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
      this._solid(ctx, 0.35, legH, 0.35, lx, legH / 2, lz, '#6a5d52');
    }
    for (const y of [3, 6]) {
      this._decor(ctx, s * 2, 0.15, 0.15, 0, y, -s, '#7b6c60');
      this._decor(ctx, s * 2, 0.15, 0.15, 0, y, s, '#7b6c60');
      this._decor(ctx, 0.15, 0.15, s * 2, -s, y, 0, '#7b6c60');
      this._decor(ctx, 0.15, 0.15, s * 2, s, y, 0, '#7b6c60');
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 4, 10), flatMat('#8a9a8f'));
    tank.position.set(0, legH + 2, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.8, 10), flatMat('#6e4e3e'));
    cap.position.set(0, legH + 4.9, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 0.4, 10), flatMat('#c7a03a'));
    band.position.set(0, legH + 1.2, 0);
    for (const m of [tank, cap, band]) {
      m.castShadow = m.receiveShadow = true;
      ctx.g.add(m);
    }
    this._solid(ctx, s * 2 + 1, 0.2, s * 2 + 1, 0, legH, 0, '#5b524a');
    this.physics.addCylinder(ctx.x, ctx.z, 3.2, ctx.y + legH, ctx.y + legH + 4);
    // ladder
    this._decor(ctx, 0.08, legH, 0.08, -0.35, legH / 2, s + 0.3, '#3d3833');
    this._decor(ctx, 0.08, legH, 0.08, 0.35, legH / 2, s + 0.3, '#3d3833');
  }

  _ruin(ctx, b) {
    const { w, d } = b;
    const t = 0.4;
    const color = '#a7a294';
    const dark = '#8d887c';
    const rng = this.rng;
    this._solid(ctx, w + 0.6, 0.3, d + 0.6, 0, 0, 0, '#7c786f');
    const wallRun = (len, place) => {
      const n = Math.max(2, Math.round(len / 1.6));
      const segW = len / n;
      for (let i = 0; i < n; i++) {
        if (rng.next() < 0.18) continue; // collapsed piece
        const h = rng.range(0.9, 3.4);
        const off = -len / 2 + segW * (i + 0.5);
        place(segW, h, off, rng.next() < 0.5 ? color : dark);
      }
    };
    wallRun(w, (sw, h, off, c) => this._solid(ctx, sw, h, t, off, h / 2, -d / 2, c));
    wallRun(w, (sw, h, off, c) => (Math.abs(off) > 1.2 ? this._solid(ctx, sw, h, t, off, h / 2, d / 2, c) : null));
    wallRun(d, (sw, h, off, c) => this._solid(ctx, t, h, sw, -w / 2, h / 2, off, c));
    wallRun(d, (sw, h, off, c) => this._solid(ctx, t, h, sw, w / 2, h / 2, off, c));
    // fallen slab and rubble
    const slab = this._solid(ctx, w * 0.5, 0.3, 2.4, w * 0.1, 0.5, 0, '#9b968a');
    slab.rotation.z = 0.25;
    for (let i = 0; i < 9; i++) {
      const s = rng.range(0.3, 0.8);
      const r = this._decor(ctx, s, s * 0.6, s, rng.range(-w / 2 - 2, w / 2 + 2), s * 0.3, rng.range(-d / 2 - 2, d / 2 + 2), dark);
      r.rotation.set(rng.next(), rng.next() * 3, rng.next());
    }
    // a rusted antenna stump for silhouette
    this._solid(ctx, 0.3, 6 + rng.range(0, 3), 0.3, -w / 2 + 1, 3.5, -d / 2 + 1, '#6b5547');
  }

  _container(ctx, c) {
    const L = 6.1;
    const W = 2.4;
    const H = 2.6;
    const make = (y) => {
      this._solid(ctx, L, H, W, 0, y + H / 2, 0, c.color);
      for (let x = -L / 2 + 0.3; x <= L / 2 - 0.2; x += 0.55) {
        this._decor(ctx, 0.12, H - 0.25, W + 0.06, x, y + H / 2, 0, c.color);
      }
      this._decor(ctx, 0.06, H - 0.1, W - 0.1, L / 2 + 0.02, y + H / 2, 0, '#3b3b3b');
    };
    make(0);
    if (c.stack) make(H);
  }

  _crate(ctx, size = 1.2, lx = 0, lz = 0, extraRot = 0, y = 0) {
    if (!size) size = 1.2;
    const m = this._solid(ctx, size, size, size, lx, y + size / 2, lz, '#a7834f', true, extraRot);
    // plank frame
    const f = '#7b5c35';
    const frame = new THREE.Group();
    frame.position.copy(m.position);
    frame.rotation.y = extraRot;
    const e = size + 0.04;
    const k = 0.12;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = box(k, e, k, f);
        p.position.set((sx * (size - k)) / 2, 0, (sz * (size - k)) / 2);
        frame.add(p);
      }
      const top = box(k, k, e, f);
      top.position.set((sx * (size - k)) / 2, (size - k) / 2, 0);
      frame.add(top);
      const bot = box(e, k, k, f);
      bot.position.set(0, (size - k) / 2, (sx * (size - k)) / 2);
      frame.add(bot);
    }
    const diag = box(k, size * 1.25, e - 0.02, f);
    diag.rotation.x = Math.PI / 4;
    diag.position.x = 0;
    const diag2 = box(e - 0.02, size * 1.25, k, f);
    diag2.rotation.z = Math.PI / 4;
    frame.add(diag, diag2);
    ctx.g.add(frame);
  }

  _farmProps() {
    // wooden fence around Millbrook farm
    const posts = [];
    const cx = -98;
    const cz = -76;
    const r = 34;
    for (let a = -0.4; a < Math.PI * 1.2; a += 0.08) {
      if (a > 0.95 && a < 1.25) continue; // gate gap
      posts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    for (let i = 0; i < posts.length; i++) {
      const [x, z] = posts[i];
      if (this.terrain.isOnRoad(x, z, 1)) continue;
      const ctx = this._ctx(x, z, 0);
      this._decor(ctx, 0.18, 1.2, 0.18, 0, 0.6, 0, '#6e5236');
      const next = posts[i + 1];
      if (next && Math.hypot(next[0] - x, next[1] - z) < 4 && !this.terrain.isOnRoad(next[0], next[1], 1)) {
        const len = Math.hypot(next[0] - x, next[1] - z);
        const ang = Math.atan2(next[0] - x, next[1] - z);
        const ny = this.terrain.groundAt(next[0], next[1]);
        for (const h of [0.45, 0.9]) {
          const rail = this._decor(ctx, 0.08, 0.12, len, (next[0] - x) / 2, h + (ny - ctx.y) / 2, (next[1] - z) / 2, '#8a6a46');
          rail.rotation.y = ang;
          rail.rotation.x = -Math.atan2(ny - ctx.y, len);
        }
      }
    }
    // a few loose hay bales and a tractor-shaped wreck near the barn
    const hayCtx = this._ctx(-104, -100, 0.4);
    this._hay(hayCtx, 0, 0);
    this._hay(hayCtx, 1.4, 0.3);
    this._hay(hayCtx, 0.6, 1.6);
    const wreck = this._ctx(-62, -62, 1.1);
    this._solid(wreck, 3.2, 1.2, 1.8, 0, 0.9, 0, '#8a3f2e');
    this._solid(wreck, 1.4, 1.1, 1.6, -0.6, 2.0, 0, '#6b3226');
    for (const [lx, lz, r] of [[1.1, 1.0, 0.55], [1.1, -1.0, 0.55], [-1.0, 1.0, 0.8], [-1.0, -1.0, 0.8]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 8), flatMat('#2f2c2a'));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(lx, r, lz);
      wheel.castShadow = true;
      wreck.g.add(wheel);
    }
  }
}
