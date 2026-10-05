import * as THREE from 'three';

/** Pooled, short-lived visual effects: muzzle flash, tracers, impacts. */
export class Effects {
  constructor(scene) {
    this.scene = scene;

    // one light reused for every flash (adding/removing lights recompiles shaders)
    this.flashLight = new THREE.PointLight('#ffc070', 0, 9, 2);
    scene.add(this.flashLight);
    this.flashLightT = 0;

    const flashTex = starTexture();
    this.flashes = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: '#ffd28a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      scene.add(s);
      this.flashes.push({ s, t: 0 });
    }

    const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    tracerGeo.translate(0, 0, -0.5);
    const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ m, t: 0 });
    }

    const pGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.particles = [];
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
      m.visible = false;
      scene.add(m);
      this.particles.push({ m, v: new THREE.Vector3(), t: 0, life: 1 });
    }
    this._pi = 0;
    this._ti = 0;
    this._fi = 0;
  }

  muzzleFlash(pos, dir, withLight = false) {
    const f = this.flashes[this._fi++ % this.flashes.length];
    f.s.position.copy(pos).addScaledVector(dir, 0.08);
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.scale.setScalar(0.55 + Math.random() * 0.25);
    f.s.visible = true;
    f.t = 0.05;
    if (withLight) {
      this.flashLight.position.copy(pos);
      this.flashLight.intensity = 6;
      this.flashLightT = 0.05;
    }
  }

  tracer(from, to, color = '#ffe3a0') {
    const tr = this.tracers[this._ti++ % this.tracers.length];
    const len = from.distanceTo(to);
    tr.m.position.copy(from);
    tr.m.lookAt(to);
    tr.m.rotateY(Math.PI); // geometry extends along -Z
    tr.m.scale.set(1, 1, len);
    tr.m.material.color.set(color);
    tr.m.material.opacity = 0.85;
    tr.m.visible = true;
    tr.t = 0.07;
  }

  impact(point, kind = 'solid') {
    const colors = {
      dirt: ['#8b7550', '#a08a62', '#6f6045'],
      solid: ['#d8d0c0', '#a8a090', '#ffd27a'],
      flesh: ['#ffb347', '#ff7a3c', '#ffe08a'], // stylised orange sparks, no gore
    }[kind];
    const n = kind === 'flesh' ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const p = this.particles[this._pi++ % this.particles.length];
      p.m.position.set(point.x, point.y, point.z);
      p.v.set((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4);
      p.m.material.color.set(colors[i % colors.length]);
      p.m.material.opacity = 1;
      p.life = p.t = 0.35 + Math.random() * 0.25;
      p.m.scale.setScalar(0.6 + Math.random() * 0.8);
      p.m.visible = true;
    }
  }

  update(dt) {
    for (const f of this.flashes) {
      if (f.t > 0 && (f.t -= dt) <= 0) f.s.visible = false;
    }
    if (this.flashLightT > 0 && (this.flashLightT -= dt) <= 0) this.flashLight.intensity = 0;
    for (const tr of this.tracers) {
      if (tr.t > 0) {
        tr.t -= dt;
        tr.m.material.opacity = Math.max(0, tr.t / 0.07) * 0.85;
        if (tr.t <= 0) tr.m.visible = false;
      }
    }
    for (const p of this.particles) {
      if (p.t <= 0) continue;
      p.t -= dt;
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = Math.max(0, p.t / p.life);
      p.m.rotation.x += dt * 8;
      if (p.t <= 0) p.m.visible = false;
    }
  }
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.3, 'rgba(255,200,110,0.9)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 31 : 11;
    const a = (i / 10) * Math.PI * 2;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
