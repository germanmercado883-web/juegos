import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RNG } from '../utils/random.js';
import { radialTexture } from '../utils/geometry.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, -0.56).normalize();
export const FOG_COLOR = new THREE.Color('#c6d6de');

/** Gradient sky dome, sun disc, drifting low-poly clouds and far mountains. */
export class Sky {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.clouds = [];
    this.rng = new RNG(42);
  }

  build() {
    this._dome();
    this._sun();
    this._clouds();
    this._mountains();
    return this.group;
  }

  _dome() {
    const geo = new THREE.SphereGeometry(1400, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#4d8fd1') },
        mid: { value: new THREE.Color('#8fbde0') },
        horizon: { value: FOG_COLOR.clone() },
        sunDir: { value: SUN_DIR },
        sunColor: { value: new THREE.Color('#ffe2b0') },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
        uniform vec3 sunDir; uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, top, smoothstep(0.22, 0.8, h));
          if (h < 0.0) col = horizon;
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunColor * pow(s, 8.0) * 0.35 + sunColor * pow(s, 64.0) * 0.4;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    this.group.add(dome);
  }

  _sun() {
    const tex = radialTexture('rgba(255,250,235,1)', 'rgba(255,220,160,0)', 128);
    const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
    const glow = new THREE.Sprite(mat);
    glow.scale.setScalar(260);
    glow.position.copy(SUN_DIR).multiplyScalar(1100);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,250,1)', 'rgba(255,250,230,0)', 64), fog: false, depthWrite: false, transparent: true }));
    core.scale.setScalar(70);
    core.position.copy(glow.position);
    this.sun = new THREE.Group();
    this.sun.add(glow, core);
    this.group.add(this.sun);
  }

  _clouds() {
    const rng = this.rng;
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#8c9cad', flatShading: true, fog: false, transparent: true, opacity: 0.95 });
    const variants = [];
    for (let v = 0; v < 4; v++) {
      const parts = [];
      const n = 4 + v;
      for (let i = 0; i < n; i++) {
        const r = rng.range(8, 16);
        const g = new THREE.IcosahedronGeometry(r, 0);
        g.scale(1, 0.55, 0.8);
        g.translate(rng.range(-22, 22), rng.range(-2, 5), rng.range(-9, 9));
        parts.push(g);
      }
      variants.push(mergeGeometries(parts));
    }
    for (let i = 0; i < 22; i++) {
      const c = new THREE.Mesh(rng.pick(variants), mat);
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(150, 700);
      c.position.set(Math.cos(a) * r, rng.range(130, 220), Math.sin(a) * r);
      c.rotation.y = rng.range(0, Math.PI);
      c.scale.setScalar(rng.range(0.8, 1.6));
      c.userData.speed = rng.range(1.2, 2.6);
      this.clouds.push(c);
      this.group.add(c);
    }
  }

  _mountains() {
    const rng = this.rng;
    const parts = [];
    const colors = [];
    const palette = ['#7e8f86', '#6f8380', '#8a9488', '#76877a'];
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rng.range(-0.06, 0.06);
      const r = rng.range(470, 600);
      const h = rng.range(70, 170);
      const g = new THREE.ConeGeometry(rng.range(80, 150), h, 7, 3).toNonIndexed();
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        if (y < h / 2 - 1) {
          pos.setX(k, pos.getX(k) + Math.sin(pos.getZ(k) * 0.07 + i) * 10);
          pos.setZ(k, pos.getZ(k) + Math.cos(pos.getX(k) * 0.06 + i) * 10);
          pos.setY(k, y + Math.sin(pos.getX(k) * 0.11) * 6);
        }
      }
      g.translate(Math.cos(a) * r, h / 2 - 12, Math.sin(a) * r);
      const col = new THREE.Color(rng.pick(palette));
      const cs = [];
      for (let k = 0; k < pos.count; k++) {
        const yy = g.attributes.position.getY(k);
        const snow = yy > 95 ? 0.55 : 0;
        const cc = col.clone().lerp(new THREE.Color('#e4e6e2'), snow);
        cs.push(cc.r, cc.g, cc.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
      g.deleteAttribute('uv');
      parts.push(g);
    }
    const geo = mergeGeometries(parts);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.name = 'mountains';
    this.group.add(m);
  }

  update(dt, cameraPos) {
    // sky and sun stay centred on the camera so they always look infinite
    this.dome.position.copy(cameraPos);
    this.sun.position.copy(cameraPos);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 750) c.position.x = -750;
    }
  }
}
