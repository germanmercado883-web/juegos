import * as THREE from 'three';
import { RNG, valueNoise } from '../utils/random.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAY_LIMIT } from './mapLayout.js';
import { TEX } from './Textures.js';

/** Darken the lower part of a foliage mesh: cheap fake ambient occlusion. */
function heightShade(geo, lo = 0.55, hi = 1.05) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / (max.y - min.y || 1);
    const v = lo + (hi - lo) * Math.pow(t, 0.8);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const foliageMat = () => new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, vertexColors: true, map: TEX.leaves() });

/**
 * Trees, bushes, rocks and grass, all drawn with InstancedMesh so a few
 * thousand objects cost only a handful of draw calls.
 */
export class Vegetation {
  constructor(terrain, physics, quality = { high: true }) {
    this.quality = quality;
    this.terrain = terrain;
    this.physics = physics;
    this.rng = new RNG(1234);
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.grassUniforms = { uTime: { value: 0 } };
  }

  /** Can something be placed here? Avoids roads, buildings and the map rim. */
  _free(x, z, margin = 2) {
    if (Math.abs(x) > PLAY_LIMIT + 30 || Math.abs(z) > PLAY_LIMIT + 30) return false;
    if (this.terrain.isOnRoad(x, z, margin)) return false;
    for (const zone of this.terrain.zones) {
      if (zone.r > 25) continue; // central field handled separately
      if (Math.hypot(x - zone.x, z - zone.z) < zone.r + margin) return false;
    }
    return true;
  }

  build() {
    this._trees();
    this._bushes();
    this._rocks();
    this._grass();
    return this.group;
  }

  _scatter(count, minSpacing, accept, maxTries = count * 30) {
    const pts = [];
    const rng = this.rng;
    for (let tries = 0; pts.length < count && tries < maxTries; tries++) {
      const x = rng.range(-PLAY_LIMIT - 25, PLAY_LIMIT + 25);
      const z = rng.range(-PLAY_LIMIT - 25, PLAY_LIMIT + 25);
      if (!accept(x, z)) continue;
      if (minSpacing > 0 && pts.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < minSpacing * minSpacing)) continue;
      pts.push([x, z]);
    }
    return pts;
  }

  _instanced(geo, material, count, castShadow = true) {
    const m = new THREE.InstancedMesh(geo, material, count);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.frustumCulled = false; // instances are spread over the whole map
    this.group.add(m);
    return m;
  }

  _trees() {
    const rng = this.rng;
    // forest density follows a noise mask so trees form groves and clearings
    const pts = this._scatter(260, 5.5, (x, z) => {
      if (!this._free(x, z, 3)) return false;
      if (Math.hypot(x, z) < 34) return false; // keep the centre open
      const mask = valueNoise(x * 0.018, z * 0.018, 77);
      return rng.next() < mask * mask * 1.6;
    });

    const pineCount = Math.floor(pts.length * 0.55);
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const pineGeo = mergeGeometries([
      new THREE.ConeGeometry(2.2, 3.2, 7).translate(0, 2.6, 0),
      new THREE.ConeGeometry(1.75, 2.8, 7).translate(0, 4.2, 0),
      new THREE.ConeGeometry(1.2, 2.4, 7).translate(0, 5.7, 0),
    ]);
    const leafGeo = mergeGeometries([
      new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4.2, 0),
      new THREE.IcosahedronGeometry(1.6, 0).translate(1.2, 3.4, 0.6),
      new THREE.IcosahedronGeometry(1.5, 0).translate(-1.1, 3.6, -0.5),
    ]);

    const trunks = this._instanced(trunkGeo, new THREE.MeshLambertMaterial({ color: '#6b4f38', flatShading: true }), pts.length);
    heightShade(pineGeo, 0.5, 1.1);
    heightShade(leafGeo, 0.55, 1.12);
    const pines = this._instanced(pineGeo, foliageMat(), pineCount);
    const leaves = this._instanced(leafGeo, foliageMat(), pts.length - pineCount);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const pineCols = ['#4c7a42', '#5a8a48', '#447040', '#62904e'];
    const leafCols = ['#7aa648', '#8cb452', '#6c9a44', '#a8b455', '#c2a64a'];
    let pi = 0;
    let li = 0;
    pts.forEach(([x, z], i) => {
      const y = this.terrain.groundAt(x, z) - 0.2;
      const scale = rng.range(0.85, 1.35);
      const isPine = i < pineCount;
      const trunkH = isPine ? 2.0 * scale : 2.8 * scale;
      q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
      m.compose(p.set(x, y, z), q, s.set(scale, trunkH, scale));
      trunks.setMatrixAt(i, m);
      m.compose(p.set(x, y, z), q, s.set(scale, scale * rng.range(0.9, 1.15), scale));
      c.set(isPine ? rng.pick(pineCols) : rng.pick(leafCols));
      c.offsetHSL(0, -0.04, rng.range(-0.03, 0.03));
      if (isPine) {
        pines.setMatrixAt(pi, m);
        pines.setColorAt(pi++, c);
      } else {
        leaves.setMatrixAt(li, m);
        leaves.setColorAt(li++, c);
      }
      this.physics.addCylinder(x, z, 0.35 * scale, y, y + 6 * scale, 'tree');
    });
    for (const im of [trunks, pines, leaves]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.treePoints = pts;
  }

  _bushes() {
    const rng = this.rng;
    const pts = this._scatter(220, 2.5, (x, z) => this._free(x, z, 1.5) && Math.hypot(x, z) > 12);
    const geo = mergeGeometries([
      new THREE.IcosahedronGeometry(0.8, 0).translate(0, 0.45, 0),
      new THREE.IcosahedronGeometry(0.6, 0).translate(0.6, 0.35, 0.2),
    ]);
    heightShade(geo, 0.6, 1.08);
    const im = this._instanced(geo, foliageMat(), pts.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    pts.forEach(([x, z], i) => {
      const sc = rng.range(0.7, 1.4);
      q.setFromEuler(new THREE.Euler(0, rng.range(0, 6.28), 0));
      m.compose(new THREE.Vector3(x, this.terrain.groundAt(x, z) - 0.1, z), q, new THREE.Vector3(sc, sc * 0.8, sc));
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.set(rng.pick(['#6c8a45', '#7a9850', '#5d7c41', '#8e9a52'])));
    });
  }

  _rocks() {
    const rng = this.rng;
    const pts = this._scatter(80, 6, (x, z) => this._free(x, z, 2));
    // a few big cover boulders in the open centre
    for (const [x, z] of [[-22, -18], [18, 16], [28, -22], [-26, 26], [2, 30], [40, 30]]) pts.push([x, z]);
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const im = this._instanced(geo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, map: TEX.concrete() }), pts.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    pts.forEach(([x, z], i) => {
      const big = i >= pts.length - 6;
      const sx = big ? rng.range(2, 2.8) : rng.range(0.5, 1.8);
      const sy = sx * rng.range(0.5, 0.9);
      const sz = sx * rng.range(0.7, 1.2);
      const y = this.terrain.groundAt(x, z);
      q.setFromEuler(new THREE.Euler(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3)));
      m.compose(new THREE.Vector3(x, y + sy * 0.25, z), q, new THREE.Vector3(sx, sy, sz));
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.set(rng.pick(['#8f8b80', '#9d998c', '#7f7c73', '#a19a88'])));
      if (sx > 0.8) this.physics.addCylinder(x, z, Math.min(sx, sz) * 0.85, y - 1, y + sy * 1.1, 'rock');
    });
  }

  _grass() {
    const rng = this.rng;
    const count = this.quality.high ? 14000 : this.quality.shadows ? 10000 : 6000;
    // tuft = 3 crossed blades, darker at the root. Each blade is emitted
    // with both windings and upward normals so it never renders dark from
    // behind (DoubleSide would flip the normal on back faces).
    const pos = [];
    const col = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + 0.3;
      const w = 0.16;
      const ox = Math.cos(a) * w;
      const oz = Math.sin(a) * w;
      const tip = [ox * 0.15 + Math.sin(a * 3) * 0.06, 0.42 + k * 0.05, oz * 0.15 + 0.04];
      const tri = [[-ox, 0, -oz], [ox, 0, oz], tip];
      for (const order of [[0, 1, 2], [1, 0, 2]]) {
        for (const i of order) {
          pos.push(...tri[i]);
          const t = i === 2 ? 1 : 0.62;
          col.push(t, t, t * 0.9);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const nrm = new Float32Array(pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uniforms = this.grassUniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
            float sway = sin(uTime * 1.6 + ip.x * 0.15 + ip.z * 0.1) * 0.12 * position.y;
            transformed.x += sway;
            transformed.z += sway * 0.5;
          #endif`,
        );
    };
    const im = this._instanced(geo, mat, count, false);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    let n = 0;
    for (let tries = 0; n < count && tries < count * 6; tries++) {
      const x = rng.range(-PLAY_LIMIT, PLAY_LIMIT);
      const z = rng.range(-PLAY_LIMIT, PLAY_LIMIT);
      if (this.terrain.isOnRoad(x, z, 0.5)) continue;
      const patch = valueNoise(x * 0.04, z * 0.04, 5);
      if (rng.next() > patch * 1.3) continue;
      let inBuilding = false;
      for (const zone of this.terrain.zones) {
        if (zone.r < 25 && Math.hypot(x - zone.x, z - zone.z) < zone.r - 2) {
          inBuilding = true;
          break;
        }
      }
      if (inBuilding) continue;
      const sc = rng.range(0.8, 1.4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28));
      m.compose(new THREE.Vector3(x, this.terrain.groundAt(x, z) - 0.05, z), q, new THREE.Vector3(sc, sc * rng.range(0.7, 1.3), sc));
      im.setMatrixAt(n, m);
      c.set(rng.pick(['#7f9a4e', '#8fa857', '#a0ad5c', '#738f49', '#b0aa62']));
      im.setColorAt(n, c);
      n++;
    }
    im.count = n;
  }

  update(time) {
    this.grassUniforms.uTime.value = time;
  }
}
