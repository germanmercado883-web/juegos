import * as THREE from 'three';
import { CharacterModel, PALETTES } from '../entities/CharacterModel.js';
import { angleDiff, clamp, damp } from '../utils/math.js';
import { PLAY_LIMIT } from '../world/mapLayout.js';

const DETECT_RANGE = 58;
const KEEP_DISTANCE = 16;
const WALK = 2.6;
const GRAVITY = 24;

const STATE = { IDLE: 0, ALERT: 1, DEAD: 2 };

/**
 * Rival survivor with a deliberately simple brain:
 * idle/wander -> spot player (range + line of sight) -> turn, approach,
 * shoot short inaccurate bursts. Getting shot also alerts it.
 */
export class Enemy {
  constructor(game, x, z, index) {
    this.game = game;
    this.isEnemy = true;
    this.index = index;
    this.physics = game.world.physics;
    this.model = new CharacterModel(PALETTES.rival, index % 3 === 0 ? 'hornet' : 'strider');
    this.root = this.model.root;
    this.pos = new THREE.Vector3(x, this.physics.terrain.groundAt(x, z), z);
    this.home = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.facing = Math.random() * Math.PI * 2;
    this.health = 100;
    this.alive = true;
    this.state = STATE.IDLE;
    this.seeTimer = Math.random() * 0.3;
    this.canSee = false;
    this.lastSeen = -100;
    this.burstLeft = 0;
    this.burstTimer = 1 + Math.random() * 2;
    this.shotTimer = 0;
    this.wanderTarget = null;
    this.wanderTimer = Math.random() * 3;
    this.deadTime = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this._buildHealthBar();
  }

  _buildHealthBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.11), new THREE.MeshBasicMaterial({ color: '#1b1b1b', transparent: true, opacity: 0.7, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.07), new THREE.MeshBasicMaterial({ color: '#e8553f', depthTest: false }));
    fill.geometry.translate(0.43, 0, 0);
    fill.position.set(-0.43, 0, 0.001);
    bg.renderOrder = 10;
    fill.renderOrder = 11;
    g.add(bg, fill);
    g.position.y = 2.25;
    this.bar = g;
    this.barFill = fill;
    this.root.add(g);
  }

  hitShapes() {
    const p = this.pos;
    return [
      { type: 'cyl', x: p.x, z: p.z, r: 0.34, minY: p.y, maxY: p.y + 1.45 },
      { type: 'sphere', x: p.x, y: p.y + 1.7, z: p.z, r: 0.17, head: true },
    ];
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.health -= amount;
    this.state = STATE.ALERT;
    this.lastSeen = this.game.time;
    this.burstTimer = Math.min(this.burstTimer, 0.6);
    if (this.health <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.health = 0;
    this.state = STATE.DEAD;
    this.bar.visible = false;
    this.physics.removeTarget(this);
    this.fallDir = Math.random() < 0.5 ? -1 : 1;
    this.game.onEnemyKilled(this);
  }

  update(dt, player) {
    if (this.state === STATE.DEAD) {
      this.deadTime += dt;
      // topple over, then sink into the ground
      const t = Math.min(1, this.deadTime * 2.2);
      this.model.body.rotation.x = -t * t * (Math.PI / 2) * 0.98;
      if (this.deadTime > 6) this.root.position.y -= dt * 0.6;
      return this.deadTime < 8.5;
    }

    const toP = new THREE.Vector3().subVectors(player.pos, this.pos);
    const dist = Math.hypot(toP.x, toP.z);

    // perception, throttled
    this.seeTimer -= dt;
    if (this.seeTimer <= 0) {
      this.seeTimer = 0.25;
      this.canSee = false;
      if (player.alive && dist < DETECT_RANGE) {
        const eye = { x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z };
        const tgt = { x: player.pos.x, y: player.pos.y + 1.4, z: player.pos.z };
        // facing cone unless very close or already alert
        const toYaw = Math.atan2(-toP.x, -toP.z);
        const inCone = Math.abs(angleDiff(this.facing, toYaw)) < 1.4 || dist < 14 || this.state === STATE.ALERT;
        if (inCone && this.physics.lineOfSight(eye, tgt)) {
          this.canSee = true;
          this.lastSeen = this.game.time;
          if (this.state !== STATE.ALERT) {
            this.state = STATE.ALERT;
            this.burstTimer = 0.9 + Math.random() * 0.8; // reaction time
          }
        }
      }
      if (this.state === STATE.ALERT && this.game.time - this.lastSeen > 7) this.state = STATE.IDLE;
    }

    let wish = new THREE.Vector3();
    let desiredYaw = this.facing;
    let speed = 0;

    if (this.state === STATE.ALERT && player.alive) {
      desiredYaw = Math.atan2(-toP.x, -toP.z);
      const dir = new THREE.Vector3(toP.x, 0, toP.z).normalize();
      if (dist > KEEP_DISTANCE || !this.canSee) {
        wish.copy(dir);
        speed = WALK;
      } else {
        // slow strafe while engaging
        wish.set(-dir.z * this.strafeDir, 0, dir.x * this.strafeDir);
        speed = WALK * 0.5;
        if (Math.random() < dt * 0.3) this.strafeDir *= -1;
      }
      this._combat(dt, player, dist);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 4;
        this.wanderTarget = Math.random() < 0.5
          ? null
          : new THREE.Vector3(this.home.x + (Math.random() - 0.5) * 14, 0, this.home.z + (Math.random() - 0.5) * 14);
        if (!this.wanderTarget) this.lookYaw = this.facing + (Math.random() - 0.5) * 2.5;
      }
      if (this.wanderTarget) {
        const d = new THREE.Vector3(this.wanderTarget.x - this.pos.x, 0, this.wanderTarget.z - this.pos.z);
        if (d.length() > 0.8) {
          wish.copy(d.normalize());
          speed = WALK * 0.6;
          desiredYaw = Math.atan2(-d.x, -d.z);
        } else this.wanderTarget = null;
      } else if (this.lookYaw !== undefined) desiredYaw = this.lookYaw;
    }

    this.facing += angleDiff(this.facing, desiredYaw) * damp(this.state === STATE.ALERT ? 7 : 3, dt);
    const k = damp(8, dt);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.physics.resolveCircle(this.pos, this.pos.y, 1.8, 0.38);
    this.pos.x = clamp(this.pos.x, -PLAY_LIMIT, PLAY_LIMIT);
    this.pos.z = clamp(this.pos.z, -PLAY_LIMIT, PLAY_LIMIT);
    const g = this.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= g || this.pos.y - g < 0.6) {
      this.pos.y = g;
      this.vel.y = 0;
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    // aim pitch towards the player when alert
    let pitch = 0;
    if (this.state === STATE.ALERT) pitch = clamp(Math.atan2(player.pos.y - this.pos.y, dist), -0.6, 0.6);
    this.model.animate(dt, { speed: Math.hypot(this.vel.x, this.vel.z), grounded: true, pitch, aiming: this.state === STATE.ALERT });

    // health bar faces the camera
    this.bar.quaternion.copy(this.root.quaternion).invert().multiply(this.game.camera.quaternion);
    this.barFill.scale.x = Math.max(0.001, this.health / 100);
    this.bar.visible = this.health < 100 || this.state === STATE.ALERT;
    return true;
  }

  _combat(dt, player, dist) {
    if (!this.canSee) return;
    this.burstTimer -= dt;
    if (this.burstLeft <= 0 && this.burstTimer <= 0) {
      this.burstLeft = 2 + Math.floor(Math.random() * 3);
      this.burstTimer = 1.6 + Math.random() * 1.6;
    }
    if (this.burstLeft > 0) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        this.shotTimer = 0.13;
        this.burstLeft--;
        this._shoot(player, dist);
      }
    }
  }

  _shoot(player, dist) {
    const game = this.game;
    const muzzle = this.model.muzzleWorld(new THREE.Vector3());
    const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const pSpeed = Math.hypot(player.vel.x, player.vel.z);
    let chance = 0.5 - dist / 140 - pSpeed * 0.025;
    chance = clamp(chance, 0.07, 0.45);
    const hits = Math.random() < chance;
    if (!hits) {
      // visible near miss
      target.x += (Math.random() - 0.5) * 2.4;
      target.y += (Math.random() - 0.3) * 1.6;
      target.z += (Math.random() - 0.5) * 2.4;
    }
    const dir = target.clone().sub(muzzle).normalize();
    game.effects.muzzleFlash(muzzle, dir, false);
    game.effects.tracer(muzzle, target, '#ffb27a');
    game.audio.enemyShot(dist);
    if (hits) {
      player.takeDamage(this.model.weaponId === 'hornet' ? 6 : 8);
      game.hud.damageFrom(this.pos);
      game.audio.hurt();
    } else if (dist < 25) {
      game.effects.impact(target, 'dirt');
    }
  }
}
