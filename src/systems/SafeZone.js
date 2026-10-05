import * as THREE from 'three';
import { SAFE_ZONE } from '../world/mapLayout.js';

// wait = seconds before shrinking, shrink = seconds the shrink takes,
// radius = target radius, dps = damage per second outside during this phase
const PHASES = [
  { wait: 50, shrink: 35, radius: 82, dps: 2 },
  { wait: 35, shrink: 30, radius: 46, dps: 4 },
  { wait: 30, shrink: 25, radius: 22, dps: 7 },
  { wait: 25, shrink: 25, radius: 6, dps: 12 },
];

/**
 * Closing safe zone. A translucent animated wall marks the current
 * circle, a white line on the ground marks the next one. Outside the wall
 * the player loses health; damage grows each phase and the longer you
 * stay out.
 */
export class SafeZone {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.uniforms = { uTime: { value: 0 } };

    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: this.uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float stripes = step(0.55, fract(vUv.x * 160.0 + vUv.y * 5.0 - uTime * 0.5));
          float fade = pow(1.0 - vUv.y, 1.6);
          float base = 0.16 + stripes * 0.06;
          float edge = smoothstep(0.03, 0.0, vUv.y) * 0.5;
          vec3 col = mix(vec3(0.35, 0.6, 1.0), vec3(0.75, 0.88, 1.0), stripes);
          gl_FragColor = vec4(col, (base * fade + edge));
        }`,
    });
    this.wall = new THREE.Mesh(geo, mat);
    this.wall.renderOrder = 5;
    this.wall.frustumCulled = false;
    scene.add(this.wall);

    this.nextLine = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
    );
    this.nextLine.frustumCulled = false;
    scene.add(this.nextLine);
    this.reset();
  }

  reset() {
    this.center = new THREE.Vector2(SAFE_ZONE.x, SAFE_ZONE.z);
    this.radius = SAFE_ZONE.radius;
    this.phase = 0;
    this.state = 'wait';
    this.timer = PHASES[0].wait;
    this.outsideTime = 0;
    this.tickTimer = 0;
    this.running = false;
    this._pickNext();
    this._apply();
  }

  start() {
    this.running = true;
  }

  get dps() {
    return PHASES[Math.min(this.phase, PHASES.length - 1)].dps;
  }

  /** HUD label for the zone timer. */
  get status() {
    if (this.state === 'done') return 'FINAL ZONE';
    const t = Math.ceil(this.timer);
    const mm = Math.floor(t / 60);
    const ss = String(t % 60).padStart(2, '0');
    return this.state === 'wait' ? `ZONE SHRINKS IN ${mm}:${ss}` : `ZONE SHRINKING ${mm}:${ss}`;
  }

  _pickNext() {
    const p = PHASES[this.phase];
    if (!p) {
      this.next = null;
      return;
    }
    // new circle fully inside the current one
    const maxOff = Math.max(0, this.radius - p.radius);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * maxOff * 0.85;
    this.next = { center: new THREE.Vector2(this.center.x + Math.cos(a) * r, this.center.y + Math.sin(a) * r), radius: p.radius };
    this.shrinkFrom = { center: this.center.clone(), radius: this.radius };
    this._buildNextLine();
  }

  _buildNextLine() {
    const pts = [];
    const n = 128;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = this.next.center.x + Math.cos(a) * this.next.radius;
      const z = this.next.center.y + Math.sin(a) * this.next.radius;
      pts.push(x, this.terrain.groundAt(x, z) + 0.35, z);
    }
    this.nextLine.geometry.dispose();
    this.nextLine.geometry = new THREE.BufferGeometry();
    this.nextLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.nextLine.visible = true;
  }

  _apply() {
    this.wall.position.set(this.center.x, -20, this.center.y);
    this.wall.scale.set(Math.max(this.radius, 0.5), 90, Math.max(this.radius, 0.5));
  }

  distanceOutside(pos) {
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.y) - this.radius;
  }

  /** Distance outside the *next* circle (negative = inside). */
  distanceOutsideNext(pos) {
    const c = this.next ?? { center: this.center, radius: this.radius };
    return Math.hypot(pos.x - c.center.x, pos.z - c.center.y) - c.radius;
  }

  _advance(dt) {
    if (!this.running || this.state === 'done') return;
    this.timer -= dt;
    if (this.state === 'wait') {
      if (this.timer <= 0) {
        this.state = 'shrink';
        this.timer = PHASES[this.phase].shrink;
        this.onEvent?.('shrink');
      }
    } else if (this.state === 'shrink') {
      const total = PHASES[this.phase].shrink;
      const t = 1 - Math.max(0, this.timer) / total;
      this.center.lerpVectors(this.shrinkFrom.center, this.next.center, t);
      this.radius = this.shrinkFrom.radius + (this.next.radius - this.shrinkFrom.radius) * t;
      this._apply();
      if (this.timer <= 0) {
        this.phase += 1;
        if (this.phase >= PHASES.length) {
          this.state = 'done';
          this.nextLine.visible = false;
        } else {
          this.state = 'wait';
          this.timer = PHASES[this.phase].wait;
          this._pickNext();
          this.onEvent?.('wait');
        }
      }
    }
  }

  update(dt, time, player, game) {
    this.uniforms.uTime.value = time;
    this._advance(dt);
    if (!player.alive || player.phase !== 'ground') return;
    const out = this.distanceOutside(player.pos);
    if (out > 0) {
      this.outsideTime += dt;
      const dps = Math.min(this.dps + this.outsideTime * 0.4, this.dps * 4);
      player.takeDamage(dps * dt, { ignoreArmor: true });
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer = 1;
        game.audio.zoneTick();
      }
    } else {
      this.outsideTime = 0;
    }
  }
}
