import * as THREE from 'three';
import { box, flatMat, mergeHierarchy } from '../utils/geometry.js';
import { angleDiff, clamp, damp } from '../utils/math.js';
import { PLAY_LIMIT } from '../world/mapLayout.js';

const MAX_SPEED = 24;
const REVERSE_SPEED = 8;
const ACCEL = 11;
const BRAKE = 22;
const WHEELBASE = 2.4;
const TRACK = 1.7;

/** Spawn points on the roads: [x, z, yaw]. */
export const VEHICLE_SPAWNS = [
  [-56, -34, 2.2],
  [62, 3, 1.6],
  [-15, 52, 0.1],
  [31, -62, 0.1],
];

/**
 * Arcade off-road buggy: drives on the height field, tilts with the
 * terrain, bumps off buildings/trees and runs over rivals.
 */
export class Vehicle {
  constructor(game, x, z, yaw) {
    this.game = game;
    this.physics = game.world.physics;
    this.pos = new THREE.Vector3(x, this.physics.terrain.groundAt(x, z), z);
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.driver = null;
    this.root = buildBuggy();
    this.wheels = this.root.userData.wheels;
    this.root.position.copy(this.pos);
    this._place(0);
  }

  get seat() {
    // driver seat, slightly left of centre
    const s = new THREE.Vector3(-0.35, 0.55, 0.15).applyEuler(new THREE.Euler(0, this.yaw, 0));
    return this.pos.clone().add(s);
  }

  update(dt, input) {
    const driving = !!this.driver;
    const f = driving ? (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0) : 0;
    let s = driving ? (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0) : 0;
    // touch joystick gives analog steering
    if (driving && input.stick) s = clamp(input.stick.x * 1.25, -1, 1);
    const handbrake = driving && input.down('Space');

    if (f > 0) this.speed += (this.speed < 0 ? BRAKE : ACCEL) * dt;
    else if (f < 0) this.speed -= (this.speed > 0 ? BRAKE : ACCEL * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 18 * dt);
    this.speed = clamp(this.speed, -REVERSE_SPEED, MAX_SPEED);

    this.steer += (s - this.steer) * damp(6, dt);
    // turn rate grows with speed up to ~10 m/s, then tightens off at top speed
    const v = Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10);
    const grip = 1 - Math.min(Math.abs(this.speed) / MAX_SPEED, 1) * 0.35;
    this.yaw -= this.steer * (v / WHEELBASE) * 0.3 * grip * dt;

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const before = this.pos.clone();
    this.pos.addScaledVector(fwd, this.speed * dt);
    this.physics.resolveCircle(this.pos, this.pos.y + 0.3, 1.4, 1.25);
    const pushed = before.clone().addScaledVector(fwd, this.speed * dt).distanceTo(this.pos);
    if (pushed > 0.02 && Math.abs(this.speed) > 3) {
      this.speed *= 0.4;
      this.game.audio.impactNear?.();
      this.game.cam.shake = Math.min(1, this.game.cam.shake + 0.4);
    }
    this.pos.x = clamp(this.pos.x, -PLAY_LIMIT, PLAY_LIMIT);
    this.pos.z = clamp(this.pos.z, -PLAY_LIMIT, PLAY_LIMIT);

    // run over rivals
    if (Math.abs(this.speed) > 6 && this.driver) {
      for (const e of this.game.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 1.8) {
          e.takeDamage(Math.abs(this.speed) * 6, this.driver);
          this.speed *= 0.7;
        }
      }
    }
    this._place(dt);
  }

  /** Sit the body on the terrain using four wheel heights. */
  _place(dt) {
    const t = this.physics.terrain;
    const c = Math.cos(this.yaw);
    const sn = Math.sin(this.yaw);
    const at = (lx, lz) => {
      const x = this.pos.x + lx * c + lz * sn;
      const z = this.pos.z - lx * sn + lz * c;
      return this.physics.groundHeight(x, z, t.groundAt(x, z) + 0.6);
    };
    const hf = (at(-TRACK / 2, -WHEELBASE / 2) + at(TRACK / 2, -WHEELBASE / 2)) / 2;
    const hb = (at(-TRACK / 2, WHEELBASE / 2) + at(TRACK / 2, WHEELBASE / 2)) / 2;
    const hl = (at(-TRACK / 2, -WHEELBASE / 2) + at(-TRACK / 2, WHEELBASE / 2)) / 2;
    const hr = (at(TRACK / 2, -WHEELBASE / 2) + at(TRACK / 2, WHEELBASE / 2)) / 2;
    const ground = (hf + hb) / 2;
    this.pos.y += (ground - this.pos.y) * (dt ? Math.min(1, dt * 14) : 1);
    const pitch = Math.atan2(hf - hb, WHEELBASE);
    const roll = Math.atan2(hl - hr, TRACK);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, 0, 0);
    this.root.rotateY(this.yaw);
    this.root.rotateX(pitch);
    this.root.rotateZ(-roll);
    for (const w of this.wheels) {
      w.rotation.x -= (this.speed * dt) / 0.42;
      if (w.userData.front) w.parent.rotation.y = -this.steer * 0.45;
    }
  }
}

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  reset() {
    for (const v of this.list) this.game.scene.remove(v.root);
    this.list = VEHICLE_SPAWNS.map(([x, z, yaw]) => {
      const v = new Vehicle(this.game, x, z, yaw);
      this.game.scene.add(v.root);
      return v;
    });
  }

  nearest(pos, reach = 3.2) {
    let best = null;
    let bd = reach;
    for (const v of this.list) {
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d < bd && !v.driver) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  update(dt, input) {
    for (const v of this.list) if (v.driver || Math.abs(v.speed) > 0.01) v.update(dt, input);
  }
}

function buildBuggy() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = '#d39a2e';
  const dark = '#2e3236';
  const add = (m, x, y, z, parent = body) => {
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  add(box(1.7, 0.35, 3.2, dark), 0, 0.55, 0); // chassis
  add(box(1.6, 0.4, 1.2, paint), 0, 0.85, -1.0); // hood
  add(box(1.6, 0.3, 0.9, paint), 0, 0.8, 1.2); // rear deck
  add(box(0.08, 0.3, 1.7, paint), -0.8, 0.85, 0.15);
  add(box(0.08, 0.3, 1.7, paint), 0.8, 0.85, 0.15);
  add(box(1.5, 0.08, 0.5, '#3a3d40'), 0, 0.72, 0.4); // floor
  for (const x of [-0.35, 0.35]) {
    add(box(0.5, 0.12, 0.5, '#5a4a3c'), x, 0.82, 0.2); // seats
    add(box(0.5, 0.55, 0.1, '#5a4a3c'), x, 1.05, 0.48);
  }
  // roll cage
  for (const x of [-0.72, 0.72]) {
    add(box(0.07, 1.0, 0.07, dark), x, 1.35, -0.35);
    add(box(0.07, 1.0, 0.07, dark), x, 1.35, 0.75);
    add(box(0.07, 0.07, 1.1, dark), x, 1.85, 0.2);
  }
  add(box(1.5, 0.07, 0.07, dark), 0, 1.85, -0.35);
  add(box(1.5, 0.07, 0.07, dark), 0, 1.85, 0.75);
  add(box(0.06, 0.4, 0.06, dark), -0.35, 1.05, -0.45); // steering column
  add(box(0.3, 0.3, 0.04, dark), -0.35, 1.22, -0.35);
  add(box(1.3, 0.1, 0.1, '#bdbdbd'), 0, 0.6, -1.65); // bumper
  for (const x of [-0.55, 0.55]) add(box(0.22, 0.16, 0.06, '#fff4c8'), x, 0.92, -1.62); // lights
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10), flatMat('#232323'));
  spare.rotation.x = Math.PI / 2;
  add(spare, 0, 1.15, 1.7);
  mergeHierarchy(body);

  const wheels = [];
  for (const [x, z, front] of [[-0.95, -1.2, true], [0.95, -1.2, true], [-0.95, 1.2, false], [0.95, 1.2, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    g.add(pivot);
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 10), flatMat('#232323'));
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 6), flatMat('#9a9a9a'));
    hub.rotation.z = Math.PI / 2;
    w.add(tire, hub);
    w.userData.front = front;
    pivot.add(w);
    wheels.push(w);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.userData.wheels = wheels;
  return g;
}
