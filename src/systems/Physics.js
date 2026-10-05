// Lightweight collision + raycast world. No physics engine: everything is
// oriented boxes, vertical cylinders and the terrain height field, which is
// all a third-person shooter demo needs and is very cheap to evaluate.

const STEP_UP = 0.4;

export class Physics {
  constructor(terrain) {
    this.terrain = terrain;
    this.boxes = [];
    this.cylinders = [];
    this.targets = new Set(); // dynamic hittables (characters)
  }

  /** Oriented box. (x, z) centre, half extents hw/hd, yaw rot, vertical span. */
  addBox(x, z, hw, hd, rot, minY, maxY, tag = 'solid') {
    const b = { x, z, hw, hd, minY, maxY, tag, cos: Math.cos(rot), sin: Math.sin(rot) };
    this.boxes.push(b);
    return b;
  }

  addCylinder(x, z, r, minY, maxY, tag = 'solid') {
    const c = { x, z, r, minY, maxY, tag };
    this.cylinders.push(c);
    return c;
  }

  addTarget(t) {
    this.targets.add(t);
  }

  removeTarget(t) {
    this.targets.delete(t);
  }

  // World -> box local (x, z)
  _toLocal(b, x, z) {
    const dx = x - b.x;
    const dz = z - b.z;
    return [dx * b.cos - dz * b.sin, dx * b.sin + dz * b.cos];
  }

  _toWorldDir(b, lx, lz) {
    return [lx * b.cos + lz * b.sin, -lx * b.sin + lz * b.cos];
  }

  /**
   * Highest walkable surface under (x, z) that the character can stand on
   * from feetY (terrain or the top of a box it is above).
   */
  groundHeight(x, z, feetY, radius = 0.3) {
    let g = this.terrain.groundAt(x, z);
    for (const b of this.boxes) {
      if (b.maxY > feetY + STEP_UP || b.maxY <= g) continue;
      const [lx, lz] = this._toLocal(b, x, z);
      if (Math.abs(lx) < b.hw + radius * 0.4 && Math.abs(lz) < b.hd + radius * 0.4) g = b.maxY;
    }
    return g;
  }

  /** Push a vertical capsule (approximated by a circle) out of solids. */
  resolveCircle(pos, feetY, height, radius) {
    const headY = feetY + height;
    for (const b of this.boxes) {
      if (b.maxY <= feetY + STEP_UP || b.minY >= headY) continue;
      const [lx, lz] = this._toLocal(b, pos.x, pos.z);
      const cx = Math.max(-b.hw, Math.min(b.hw, lx));
      const cz = Math.max(-b.hd, Math.min(b.hd, lz));
      let dx = lx - cx;
      let dz = lz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      let nx;
      let nz;
      let push;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        push = radius - d;
      } else {
        // centre inside the box: exit along the shallowest axis
        const px = b.hw - Math.abs(lx);
        const pz = b.hd - Math.abs(lz);
        if (px < pz) {
          nx = Math.sign(lx) || 1;
          nz = 0;
          push = px + radius;
        } else {
          nx = 0;
          nz = Math.sign(lz) || 1;
          push = pz + radius;
        }
      }
      const [wx, wz] = this._toWorldDir(b, nx, nz);
      pos.x += wx * push;
      pos.z += wz * push;
    }
    for (const c of this.cylinders) {
      if (c.maxY <= feetY + STEP_UP || c.minY >= headY) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  /**
   * Cast a ray against terrain, static solids and (optionally) characters.
   * Returns { dist, point:{x,y,z}, kind, target, headshot } or null.
   */
  raycast(o, d, maxDist, { ignore = null, hitTargets = true } = {}) {
    let best = maxDist;
    let hit = null;

    // static boxes (slab test in local space)
    for (const b of this.boxes) {
      const [lox, loz] = this._toLocal(b, o.x, o.z);
      const ldx = d.x * b.cos - d.z * b.sin;
      const ldz = d.x * b.sin + d.z * b.cos;
      const t = slab3(lox, o.y, loz, ldx, d.y, ldz, -b.hw, b.minY, -b.hd, b.hw, b.maxY, b.hd);
      if (t !== null && t < best) {
        best = t;
        hit = { kind: 'solid', target: b };
      }
    }
    for (const c of this.cylinders) {
      const t = rayCylinder(o, d, c.x, c.z, c.r, c.minY, c.maxY);
      if (t !== null && t < best) {
        best = t;
        hit = { kind: 'solid', target: c };
      }
    }
    if (hitTargets) {
      for (const tg of this.targets) {
        if (tg === ignore || !tg.alive) continue;
        for (const s of tg.hitShapes()) {
          const t = s.type === 'sphere'
            ? raySphere(o, d, s.x, s.y, s.z, s.r)
            : rayCylinder(o, d, s.x, s.z, s.r, s.minY, s.maxY);
          if (t !== null && t < best) {
            best = t;
            hit = { kind: 'target', target: tg, headshot: !!s.head };
          }
        }
      }
    }
    const tt = this._rayTerrain(o, d, best);
    if (tt !== null && tt < best) {
      best = tt;
      hit = { kind: 'terrain', target: null };
    }
    if (!hit) return null;
    hit.dist = best;
    hit.point = { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
    return hit;
  }

  /** True when nothing static blocks the segment a -> b. */
  lineOfSight(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const d = { x: dx / len, y: dy / len, z: dz / len };
    return this.raycast(a, d, len - 0.1, { hitTargets: false }) === null;
  }

  _rayTerrain(o, d, maxDist) {
    const step = 1.0;
    let prevT = 0;
    if (o.y < this.terrain.groundAt(o.x, o.z)) return 0;
    for (let t = step; t <= maxDist + step; t += step) {
      const tc = Math.min(t, maxDist);
      const y = o.y + d.y * tc;
      if (y < this.terrain.groundAt(o.x + d.x * tc, o.z + d.z * tc)) {
        let lo = prevT;
        let hi = tc;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          if (o.y + d.y * mid < this.terrain.groundAt(o.x + d.x * mid, o.z + d.z * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prevT = tc;
      if (tc >= maxDist) break;
    }
    return null;
  }
}

function slab3(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [ox, dx, minx, maxx],
    [oy, dy, miny, maxy],
    [oz, dz, minz, maxz],
  ];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : null;
}

function rayCylinder(o, d, cx, cz, r, minY, maxY) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = (-b - s) / (2 * a);
  if (t <= 0) return null;
  const y = o.y + d.y * t;
  return y >= minY && y <= maxY ? t : null;
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
