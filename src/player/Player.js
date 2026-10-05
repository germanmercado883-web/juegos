import * as THREE from 'three';
import { SurvivorModel } from '../entities/SurvivorModel.js';
import { clamp, damp, angleDiff } from '../utils/math.js';
import { PLAY_LIMIT } from '../world/mapLayout.js';
import { PlayerWeapons } from '../weapons/PlayerWeapons.js';

const WALK = 6.0;
const SPRINT = 9.4;
const AIM_WALK = 3.4;
const GRAVITY = 24;
const JUMP_V = 8.2;
const RADIUS = 0.38;
const HEIGHT = 1.8;
const HEAL_TIME = 2.2;

export class Player {
  constructor(game) {
    this.game = game;
    this.physics = game.world.physics;
    this.model = new SurvivorModel(game.settings.skin || 'player', 'strider');
    this.root = this.model.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.grounded = true;
    this.alive = true;
    this.health = 100;
    this.armor = 0;
    this.medkits = 1;
    this.grenades = 1;
    this.hasBigPack = false;
    this.healing = 0; // seconds remaining
    this.kills = 0;
    this.stats = { shots: 0, hits: 0, damage: 0, headshots: 0 };
    this.sprinting = false;
    this.aiming = false;
    this.lastDamageAt = -10;
    this.weapons = new PlayerWeapons(this);
    this.crouching = false;
    this.phase = 'ground'; // 'plane' | 'freefall' | 'chute' | 'ground'
    this.vehicle = null;
    this._stepTimer = 0;
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.physics.terrain.groundAt(x, z), z);
    this.facing = yaw;
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
  }

  /** Collision/hit shapes for enemy bullets. */
  hitShapes() {
    const p = this.pos;
    const h = this.crouching ? 0.72 : 1;
    return [
      { type: 'cyl', x: p.x, z: p.z, r: 0.33, minY: p.y, maxY: p.y + 1.45 * h },
      { type: 'sphere', x: p.x, y: p.y + 1.68 * h, z: p.z, r: 0.16, head: true },
    ];
  }

  get maxReserve() {
    return this.hasBigPack ? 240 : 150;
  }

  takeDamage(amount, { ignoreArmor = false } = {}) {
    if (!this.alive) return;
    let dmg = amount;
    if (!ignoreArmor && this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.55);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health = Math.max(0, this.health - dmg);
    this.lastDamageAt = this.game.time;
    if (!ignoreArmor) this.game.haptic(30);
    this.healing = 0;
    if (this.health <= 0) {
      this.alive = false;
      this.game.onPlayerDeath();
    }
  }

  startHeal() {
    if (this.medkits <= 0 || this.health >= 100 || this.healing > 0 || !this.alive) return false;
    this.healing = HEAL_TIME;
    return true;
  }

  update(dt, input, cam) {
    if (!this.alive) {
      this.model.die();
      this.model.animate(dt, {});
      return;
    }
    if (this.phase !== 'ground') {
      this.game.drop.updatePlayer(dt, input, cam, this);
      return;
    }
    if (this.vehicle) {
      const v = this.vehicle;
      this.pos.copy(v.seat).setY(v.seat.y - 0.25);
      this.vel.set(-Math.sin(v.yaw) * v.speed, 0, -Math.cos(v.yaw) * v.speed);
      this.facing = v.yaw;
      this.aiming = false;
      this.sprinting = false;
      this.root.position.copy(this.pos);
      this.root.rotation.copy(v.root.rotation);
      this.model.animate(dt, { speed: 0, grounded: true, crouch: true, pitch: 0, driving: true });
      return;
    }

    // -------- intent
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    this.aiming = input.mouse.right && this.weapons.reloading <= 0;
    if (input.wasPressed('KeyC') || input.wasPressed('ControlLeft')) this.crouching = !this.crouching;
    this.sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
    this.sprinting = this.sprinting && f > 0 && !this.aiming && !input.mouse.left && this.healing <= 0;

    const yaw = cam.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, f).addScaledVector(right, s);
    if (wish.lengthSq() > 0) wish.normalize();

    if (this.sprinting) this.crouching = false;
    let speed = this.sprinting ? SPRINT : this.aiming ? AIM_WALK : WALK;
    if (this.crouching) speed = Math.min(speed, 2.6);
    if (this.healing > 0) speed = 2.4;
    const accel = this.grounded ? 11 : 2.5;
    const k = damp(accel, dt);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;

    if (input.wasPressed('Space') && this.grounded) {
      this.crouching = false;
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.game.audio.jump();
    }
    this.vel.y -= GRAVITY * dt;

    // -------- integrate + collide
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.physics.resolveCircle(this.pos, this.pos.y, HEIGHT, RADIUS);
    this.pos.x = clamp(this.pos.x, -PLAY_LIMIT, PLAY_LIMIT);
    this.pos.z = clamp(this.pos.z, -PLAY_LIMIT, PLAY_LIMIT);

    const ground = this.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y, RADIUS);
    const wasGrounded = this.grounded;
    if (this.pos.y <= ground) {
      if (!wasGrounded && this.vel.y < -6) this.game.audio.land();
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (wasGrounded && this.vel.y <= 0 && this.pos.y - ground < 0.6) {
      this.pos.y = ground; // stick to slopes / stairs going down
      this.vel.y = 0;
    } else {
      this.grounded = false;
    }

    // -------- healing
    if (this.healing > 0) {
      this.healing -= dt;
      if (this.healing <= 0) {
        this.medkits -= 1;
        this.health = Math.min(100, this.health + 45);
        this.game.hud.toast('+45 HP', 'heal');
        this.game.audio.pickup();
      }
    }

    // -------- facing: character turns to where the camera looks
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.facing += angleDiff(this.facing, yaw) * damp(this.sprinting ? 10 : 16, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;

    // footsteps
    if (this.grounded && hSpeed > 1) {
      this._stepTimer -= dt * hSpeed;
      if (this._stepTimer <= 0) {
        this._stepTimer = 2.4;
        this.game.audio.step();
      }
    }

    this.weapons.update(dt, input, cam);
    this.model.animate(dt, {
      speed: hSpeed,
      grounded: this.grounded,
      pitch: cam.pitch,
      sprint: this.sprinting,
      aiming: this.aiming,
      crouch: this.crouching,
      backwards: f < 0,
    });
  }
}
