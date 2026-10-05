import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Terrain } from './Terrain.js';
import { StructureBuilder } from './Structures.js';
import { Vegetation } from './Vegetation.js';
import { Sky, SUN_DIR, FOG_COLOR } from './Sky.js';
import { Physics } from '../systems/Physics.js';
import { ROADS } from './mapLayout.js';
import { flatMat } from '../utils/geometry.js';
import { COLOR_TEX } from './Structures.js';
import { TEX, boxProjectUVs } from './Textures.js';

/**
 * Owns everything static in the scene: terrain, roads, buildings,
 * vegetation, sky and lighting. Built in steps so the loading screen can
 * report real progress.
 */
export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.terrain = new Terrain();
    this.physics = new Physics(this.terrain);
  }

  /** Ordered build steps: [label, fn]. */
  steps() {
    return [
      ['SCULPTING TERRAIN', () => this._buildTerrain()],
      ['PAVING ROADS', () => this._buildRoads()],
      ['RAISING STRUCTURES', () => this._buildStructures()],
      ['PLANTING FOREST', () => this._buildVegetation()],
      ['PAINTING SKY', () => this._buildSky()],
      ['LIGHTING SCENE', () => this._buildLights()],
    ];
  }

  _buildTerrain() {
    this.terrainMesh = this.terrain.buildMesh();
    this.scene.add(this.terrainMesh);
  }

  _buildRoads() {
    // thin ribbons hugging the ground give crisp road edges on top of the
    // terrain vertex colors
    const mat = new THREE.MeshLambertMaterial({
      color: '#b49c74',
      map: TEX.dirt(),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const geos = [];
    for (const road of ROADS) {
      const pts = [];
      for (let i = 0; i < road.points.length - 1; i++) {
        const [ax, az] = road.points[i];
        const [bx, bz] = road.points[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
        for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      pts.push(road.points[road.points.length - 1]);
      const pos = [];
      const idx = [];
      const hw = road.width / 2 - 0.4;
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[Math.min(pts.length - 1, i + 1)];
        let dx = p1[0] - p0[0];
        let dz = p1[1] - p0[1];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        const [x, z] = pts[i];
        const lx = x - dz * hw;
        const lz = z + dx * hw;
        const rx = x + dz * hw;
        const rz = z - dx * hw;
        pos.push(lx, this.terrain.groundAt(lx, lz) + 0.06, lz, rx, this.terrain.groundAt(rx, rz) + 0.06, rz);
        if (i > 0) {
          const b = (i - 1) * 2;
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const uv = [];
      for (let k = 0; k < pos.length; k += 3) uv.push(pos[k] / 5, pos[k + 2] / 5);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      geos.push(g);
    }
    const roads = new THREE.Mesh(mergeGeometries(geos), mat);
    roads.receiveShadow = true;
    this.scene.add(roads);
    this._buildPoles();
  }

  /** Wooden utility poles with sagging wires along the main road. */
  _buildPoles() {
    const road = ROADS[0].points;
    const poles = [];
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i];
      const [bx, bz] = road[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let d = 0; d < len; d += 28) {
        const x = ax + ((bx - ax) * d) / len + nx * 5;
        const z = az + ((bz - az) * d) / len + nz * 5;
        poles.push({ x, z, y: this.terrain.groundAt(x, z), ang: Math.atan2(bx - ax, bz - az) });
      }
    }
    const geos = [];
    const wire = [];
    for (const p of poles) {
      geos.push(new THREE.CylinderGeometry(0.12, 0.16, 8, 5).translate(p.x, p.y + 4, p.z));
      const bar = new THREE.BoxGeometry(2.2, 0.14, 0.14);
      bar.rotateY(p.ang + Math.PI / 2);
      bar.translate(p.x, p.y + 7.4, p.z);
      geos.push(bar);
      this.physics.addCylinder(p.x, p.z, 0.16, p.y, p.y + 8, 'pole');
    }
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 45) continue;
      for (const side of [-0.9, 0.9]) {
        const ox = Math.cos(a.ang) * side;
        const oz = -Math.sin(a.ang) * side;
        const ox2 = Math.cos(b.ang) * side;
        const oz2 = -Math.sin(b.ang) * side;
        const N = 8;
        for (let k = 0; k < N; k++) {
          for (const t of [k / N, (k + 1) / N]) {
            const sag = Math.sin(t * Math.PI) * 1.2;
            wire.push(
              a.x + ox + (b.x + ox2 - a.x - ox) * t,
              a.y + 7.45 + (b.y - a.y) * t - sag,
              a.z + oz + (b.z + oz2 - a.z - oz) * t,
            );
          }
        }
      }
    }
    const poleMesh = new THREE.Mesh(mergeGeometries(geos), flatMat('#5d4a3a'));
    poleMesh.castShadow = true;
    this.scene.add(poleMesh);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    this.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2b2b2b' })));
  }

  _buildStructures() {
    const builder = new StructureBuilder(this.terrain, this.physics);
    const group = builder.build();
    this.scene.add(mergeByMaterial(group));
  }

  _buildVegetation() {
    this.vegetation = new Vegetation(this.terrain, this.physics, this.quality);
    this.scene.add(this.vegetation.build());
  }

  _buildSky() {
    this.sky = new Sky();
    this.scene.add(this.sky.build());
    this.scene.fog = new THREE.Fog(FOG_COLOR, 110, 760);
    this.scene.background = FOG_COLOR.clone();
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight('#d6e8f8', '#8a7a52', 1.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe2b8', 2.7);
    sun.position.copy(SUN_DIR).multiplyScalar(120);
    sun.castShadow = this.quality.shadows;
    const s = this.quality.high ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    const ext = 70;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 400 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  /** Keep the shadow frustum centred on the player (snapped to texels). */
  update(dt, time, focus, cameraPos) {
    if (this.sun) {
      const texel = (140 / this.sun.shadow.mapSize.x) * 2;
      const fx = Math.round(focus.x / texel) * texel;
      const fz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 150);
    }
    this.vegetation?.update(time);
    this.sky?.update(dt, cameraPos);
  }
}

/**
 * Collapse a hierarchy of static meshes into one mesh per material.
 * Turns several hundred draw calls into a couple dozen.
 */
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  });
  const out = new THREE.Group();
  out.name = 'structures-merged';
  for (const [mat, geos] of buckets) {
    const geo = mergeGeometries(geos);
    let material = mat;
    const tex = mat.color && COLOR_TEX.get(`#${mat.color.getHexString()}`);
    if (tex) {
      boxProjectUVs(geo, tex[1]);
      material = mat.clone();
      material.map = TEX[tex[0]]();
    }
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}
