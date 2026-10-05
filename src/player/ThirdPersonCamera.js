import * as THREE from 'three';
import { clamp, damp, lerp } from '../utils/math.js';

/**
 * Over-the-shoulder camera. Yaw/pitch come from the mouse; the camera
 * orbits a pivot above the player's shoulder and is pulled in when a wall
 * or the ground would block it.
 */
export class ThirdPersonCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = 0;
    this.pitch = -0.08;
    this.distance = 4.2;
    this.minDist = 2.4;
    this.maxDist = 6.5;
    this.currentDist = 4.2;
    this.aimBlend = 0;
    this.pivot = new THREE.Vector3();
    this.shake = 0;
    this.baseFov = 70;
    camera.rotation.order = 'YXZ';
  }

  addRecoil(pitch, yaw) {
    this.pitch = clamp(this.pitch + pitch, -1.2, 1.1);
    this.yaw += yaw;
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, input, target, settings, aiming) {
    const sens = 0.0022 * settings.sensitivity * (aiming ? 0.6 : 1);
    this.yaw -= input.mouse.dx * sens;
    this.pitch = clamp(this.pitch - input.mouse.dy * sens * (settings.invertY ? -1 : 1), -1.2, 1.1);
    if (input.mouse.wheel) this.distance = clamp(this.distance + input.mouse.wheel * 0.5, this.minDist, this.maxDist);

    this.aimBlend = lerp(this.aimBlend, aiming ? 1 : 0, damp(14, dt));

    // pivot: above the right shoulder
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const desiredPivot = new THREE.Vector3(target.x, target.y + 1.62, target.z)
      .addScaledVector(right, lerp(0.6, 0.85, this.aimBlend));
    if (this.pivot.lengthSq() === 0) this.pivot.copy(desiredPivot);
    this.pivot.lerp(desiredPivot, damp(22, dt));

    const fwd = this.forward();
    let dist = lerp(this.distance, 2.3, this.aimBlend);

    // collision: pull the camera in front of anything between pivot and camera
    const back = fwd.clone().negate();
    const hit = this.physics.raycast(this.pivot, back, dist + 0.3, { hitTargets: false });
    if (hit) dist = Math.max(0.6, Math.min(dist, hit.dist - 0.3));
    // ease out when the obstacle disappears, snap in when it appears
    this.currentDist = dist < this.currentDist ? dist : lerp(this.currentDist, dist, damp(6, dt));

    const pos = this.pivot.clone().addScaledVector(back, this.currentDist);
    const ground = this.physics.terrain.groundAt(pos.x, pos.z) + 0.35;
    if (pos.y < ground) pos.y = ground;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      pos.x += (Math.random() - 0.5) * this.shake * 0.08;
      pos.y += (Math.random() - 0.5) * this.shake * 0.08;
    }

    this.camera.position.copy(pos);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const fov = lerp(this.baseFov, this.baseFov - 20, this.aimBlend);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
