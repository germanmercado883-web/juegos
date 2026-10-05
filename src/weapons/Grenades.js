import * as THREE from 'three';
import { flatMat, mergeHierarchy } from '../utils/geometry.js';

const FUSE = 2.2;
const RADIUS = 7.5;
const MAX_DMG = 110;
const GRAVITY = 20;

/** Thrown frag grenades: ballistic arc, bounces, radial damage with cover. */
export class Grenades {
  constructor(game) {
    this.game = game;
    this.live = [];
  }

  reset() {
    for (const g of this.live) this.game.scene.remove(g.mesh);
    this.live = [];
  }

  throw(player, cam) {
    if (player.grenades <= 0 || player.phase !== 'ground' || !player.alive) return false;
    player.grenades -= 1;
    const fwd = cam.forward(new THREE.Vector3());
    const start = player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(fwd, 0.6);
    // land where the crosshair points (max 30 m): solve the launch speed
    // for a fixed 35 degree arc
    const camPos = this.game.camera.position;
    const depth = Math.max(0, start.clone().sub(camPos).dot(fwd));
    const hit = this.game.world.physics.raycast(camPos.clone().addScaledVector(fwd, depth), fwd, 30, { ignore: player });
    const aim = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : camPos.clone().addScaledVector(fwd, 30);
    const flat = new THREE.Vector3(aim.x - start.x, 0, aim.z - start.z);
    const D = Math.max(2, flat.length());
    const H = aim.y - start.y;
    const theta = 0.61;
    const denom = 2 * Math.cos(theta) ** 2 * (D * Math.tan(theta) - H);
    const speed = denom > 0 ? Math.min(24, Math.sqrt((GRAVITY * D * D) / denom)) : 16;
    flat.normalize();
    const vel = flat.multiplyScalar(speed * Math.cos(theta));
    vel.y = speed * Math.sin(theta);
    const mesh = buildGrenade();
    mesh.position.copy(start);
    this.game.scene.add(mesh);
    this.live.push({ mesh, pos: start, vel, t: FUSE, owner: player });
    this.game.audio.equip();
    this.game.hud.toast('GRENADE OUT!');
    return true;
  }

  update(dt) {
    const physics = this.game.world.physics;
    for (const g of this.live) {
      g.t -= dt;
      g.vel.y -= GRAVITY * dt;
      const step = g.vel.clone().multiplyScalar(dt);
      const len = step.length();
      if (len > 1e-4) {
        const dir = step.clone().divideScalar(len);
        const hit = physics.raycast(g.pos, dir, len + 0.12, { hitTargets: false });
        if (hit && hit.kind !== 'terrain') {
          // bounce off walls / props: reverse horizontal motion
          g.vel.x *= -0.4;
          g.vel.z *= -0.4;
          g.vel.y *= 0.5;
        } else {
          g.pos.add(step);
        }
      }
      const ground = physics.groundHeight(g.pos.x, g.pos.z, g.pos.y + 0.3) + 0.08;
      if (g.pos.y < ground) {
        g.pos.y = ground;
        if (Math.abs(g.vel.y) > 2) this.game.audio.impactNear?.();
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 8;
      if (g.t <= 0) this._explode(g);
    }
    this.live = this.live.filter((g) => g.t > 0);
  }

  _explode(g) {
    const game = this.game;
    game.scene.remove(g.mesh);
    const p = g.pos.clone();
    game.effects.explosion(p);
    game.audio.explosion();
    const physics = game.world.physics;
    const eye = { x: p.x, y: p.y + 0.4, z: p.z };
    const victims = [game.player, ...game.enemies];
    for (const v of victims) {
      if (!v.alive) continue;
      const c = { x: v.pos.x, y: v.pos.y + 1, z: v.pos.z };
      const d = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
      if (d > RADIUS || !physics.lineOfSight(eye, c)) continue;
      const dmg = Math.round(MAX_DMG * Math.pow(1 - d / RADIUS, 1.1));
      if (dmg <= 0) continue;
      if (v === game.player) {
        if (v.phase === 'ground') v.takeDamage(dmg);
      } else {
        v.takeDamage(dmg, g.owner);
        if (g.owner === game.player) {
          game.hud.damageNumber(c, dmg, false);
          game.hud.hitMarker(false);
        }
      }
    }
    // camera shake by distance
    const pd = game.player.pos.distanceTo(p);
    game.cam.shake = Math.min(1.5, game.cam.shake + Math.max(0, 1.6 - pd / 20));
    game.haptic(80);
  }
}

function buildGrenade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), flatMat('#4b5a3a'));
  body.scale.set(1, 1.2, 1);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 6), flatMat('#2a2a2a'));
  top.position.y = 0.14;
  g.add(body, top);
  mergeHierarchy(g);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}
