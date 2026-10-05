import * as THREE from 'three';
import { fbm, valueNoise } from '../utils/random.js';
import { smoothstep, lerp, distToSegment } from '../utils/math.js';
import { MAP_HALF, ROADS, flattenZones } from './mapLayout.js';

const SEED = 7;
const TERRAIN_SIZE = 640;
const SEGMENTS = 150;

function rawHeight(x, z) {
  let h = fbm(x * 0.008, z * 0.008, 4, SEED) * 9;
  h += fbm(x * 0.03, z * 0.03, 2, SEED + 5) * 1.6;
  // Raise a ring of hills around the play area so it reads as a valley.
  const r = Math.max(Math.abs(x), Math.abs(z)) * 0.6 + Math.hypot(x, z) * 0.4;
  h += smoothstep(MAP_HALF - 40, MAP_HALF + 60, r) * 38;
  h += smoothstep(MAP_HALF + 40, MAP_HALF + 140, r) * fbm(x * 0.02, z * 0.02, 3, SEED + 9) * 30;
  return h;
}

/**
 * Height field for the whole map. Flatten zones are blended in so
 * buildings and the central field sit on level ground.
 */
export class Terrain {
  constructor() {
    this.zones = flattenZones().map((z) => ({ ...z, h: rawHeight(z.x, z.z) }));
    this.roads = ROADS;
    // Sample the height field on the same grid the mesh uses, so physics
    // matches the rendered facets exactly.
    this.step = TERRAIN_SIZE / SEGMENTS;
    this.grid = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));
    for (let iz = 0; iz <= SEGMENTS; iz++) {
      for (let ix = 0; ix <= SEGMENTS; ix++) {
        this.grid[iz * (SEGMENTS + 1) + ix] = this.heightAt(-TERRAIN_SIZE / 2 + ix * this.step, -TERRAIN_SIZE / 2 + iz * this.step);
      }
    }
  }

  /** Height of the rendered (triangulated) surface. Use this for gameplay. */
  groundAt(x, z) {
    const gx = (x + TERRAIN_SIZE / 2) / this.step;
    const gz = (z + TERRAIN_SIZE / 2) / this.step;
    const ix = Math.min(Math.max(Math.floor(gx), 0), SEGMENTS - 1);
    const iz = Math.min(Math.max(Math.floor(gz), 0), SEGMENTS - 1);
    const u = Math.min(Math.max(gx - ix, 0), 1);
    const v = Math.min(Math.max(gz - iz, 0), 1);
    const W = SEGMENTS + 1;
    const ha = this.grid[iz * W + ix];
    const hd = this.grid[iz * W + ix + 1];
    const hb = this.grid[(iz + 1) * W + ix];
    const hc = this.grid[(iz + 1) * W + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  heightAt(x, z) {
    let h = rawHeight(x, z);
    for (const zone of this.zones) {
      const d = Math.hypot(x - zone.x, z - zone.z);
      if (d < zone.r + zone.fade) {
        const t = 1 - smoothstep(zone.r, zone.r + zone.fade, d);
        h = lerp(h, zone.h, t);
      }
    }
    return h;
  }

  /** Distance to the closest road centre line and that road's half width. */
  roadInfo(x, z) {
    let best = Infinity;
    let half = 0;
    for (const road of this.roads) {
      const p = road.points;
      for (let i = 0; i < p.length - 1; i++) {
        const d = distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
        if (d < best) {
          best = d;
          half = road.width / 2;
        }
      }
    }
    return { dist: best, half };
  }

  isOnRoad(x, z, margin = 0) {
    const r = this.roadInfo(x, z);
    return r.dist < r.half + margin;
  }

  buildMesh() {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.groundAt(x, z));
    }

    // One color per triangle for a faceted low-poly look.
    const colors = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color('#7f9a52');
    const grassB = new THREE.Color('#9aaa5c');
    const dry = new THREE.Color('#b3a56b');
    const dirt = new THREE.Color('#a68a62');
    const rock = new THREE.Color('#8a8578');
    const snowy = new THREE.Color('#b9b8ad');
    const c = new THREE.Color();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const d = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      d.fromBufferAttribute(pos, i + 2);
      const cx = (a.x + b.x + d.x) / 3;
      const cz = (a.z + b.z + d.z) / 3;
      const cy = (a.y + b.y + d.y) / 3;
      n.subVectors(d, b).cross(a.clone().sub(b)).normalize();
      const slope = 1 - Math.abs(n.y);

      const patch = valueNoise(cx * 0.05, cz * 0.05, 3);
      c.copy(grassA).lerp(grassB, patch);
      c.lerp(dry, smoothstep(0.55, 0.85, valueNoise(cx * 0.02, cz * 0.02, 11)) * 0.6);
      if (slope > 0.25) c.lerp(rock, smoothstep(0.25, 0.5, slope));
      if (cy > 32) c.lerp(snowy, smoothstep(32, 48, cy) * 0.7);
      const road = this.roadInfo(cx, cz);
      if (road.dist < road.half + 1.5) c.lerp(dirt, 1 - smoothstep(road.half - 0.5, road.half + 1.5, road.dist));
      // tiny per-face jitter keeps the facets visible
      const j = (valueNoise(cx * 1.7, cz * 1.7, 21) - 0.5) * 0.06;
      c.offsetHSL(0, 0, j);
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = c.r;
        colors[(i + k) * 3 + 1] = c.g;
        colors[(i + k) * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}
