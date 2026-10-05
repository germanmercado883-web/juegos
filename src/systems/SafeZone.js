import * as THREE from 'three';
import { SAFE_ZONE } from '../world/mapLayout.js';

/**
 * Static safe zone: translucent animated wall + ground ring. Outside the
 * circle the player loses health, faster the longer they stay out.
 * shrink() is prepared for phase 2 (closing circle).
 */
export class SafeZone {
  constructor(scene) {
    this.center = new THREE.Vector2(SAFE_ZONE.x, SAFE_ZONE.z);
    this.radius = SAFE_ZONE.radius;
    this.outsideTime = 0;
    this.tickTimer = 0;
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

    this.group = new THREE.Group();
    this.group.add(this.wall);
    this._apply();
    scene.add(this.group);
  }

  _apply() {
    this.wall.position.set(this.center.x, -20, this.center.y);
    this.wall.scale.set(this.radius, 90, this.radius);
  }

  distanceOutside(pos) {
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.y) - this.radius;
  }

  update(dt, time, player, game) {
    this.uniforms.uTime.value = time;
    if (!player.alive) return;
    const out = this.distanceOutside(player.pos);
    if (out > 0) {
      this.outsideTime += dt;
      const dps = Math.min(2.5 + this.outsideTime * 0.5, 12);
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
