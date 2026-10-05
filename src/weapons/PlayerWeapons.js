import * as THREE from 'three';
import { WEAPONS } from './weaponData.js';

/**
 * Player's two weapon slots, ammo, fire timing, reload and hitscan.
 * Shots are traced from the camera through the crosshair so what you aim
 * at is what you hit; the tracer is drawn from the muzzle.
 */
export class PlayerWeapons {
  constructor(player) {
    this.player = player;
    this.slots = [{ def: WEAPONS.strider, mag: WEAPONS.strider.magSize }, null];
    this.current = 0;
    this.reserve = 60;
    this.cooldown = 0;
    this.reloading = 0;
    this.bloom = 0; // extra spread from sustained fire
  }

  get active() {
    return this.slots[this.current];
  }

  give(id) {
    const def = WEAPONS[id];
    const slot = { def, mag: def.magSize };
    if (!this.slots[1]) this.slots[1] = slot;
    else this.slots[1] = slot;
    this.equip(1);
  }

  equip(i) {
    if (!this.slots[i] || i === this.current) return;
    this.current = i;
    this.reloading = 0;
    this.cooldown = 0.25;
    this.player.model.setWeapon(this.active.def.id);
    this.player.game.audio.equip();
  }

  startReload() {
    const a = this.active;
    if (this.reloading > 0 || a.mag >= a.def.magSize || this.reserve <= 0) return;
    this.reloading = a.def.reloadTime;
    this.player.game.audio.reload();
  }

  update(dt, input, cam) {
    const game = this.player.game;
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 2.5);
    if (input.wasPressed('Digit1')) this.equip(0);
    if (input.wasPressed('Digit2')) this.equip(1);
    if (input.wasPressed('KeyQ')) this.equip(this.current === 0 ? 1 : 0);
    if (input.wasPressed('KeyR')) this.startReload();

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const a = this.active;
        const need = a.def.magSize - a.mag;
        const take = Math.min(need, this.reserve);
        a.mag += take;
        this.reserve -= take;
      }
      return;
    }

    const a = this.active;
    if (input.mouse.left && this.cooldown <= 0 && this.player.healing <= 0) {
      if (a.mag <= 0) {
        if (input.mouse.leftPressed) game.audio.dryFire();
        this.startReload();
        return;
      }
      this.fire(cam);
    }
  }

  fire(cam) {
    const player = this.player;
    const game = player.game;
    const a = this.active;
    const def = a.def;
    a.mag -= 1;
    this.cooldown = 1 / def.fireRate;

    const moving = Math.hypot(player.vel.x, player.vel.z) > 1;
    let spread = player.aiming ? def.spreadAim : def.spreadHip;
    if (moving) spread *= 1.6;
    if (!player.grounded) spread *= 2.2;
    spread += this.bloom * 0.012;
    this.bloom = Math.min(1.5, this.bloom + 0.18);

    const camera = game.camera;
    const dir = cam.forward(new THREE.Vector3());
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    // start the ray at the player's depth so walls behind the player are ignored
    const origin = camera.position.clone().addScaledVector(dir, cam.currentDist * 0.9);
    const hit = game.world.physics.raycast(origin, dir, def.range, { ignore: player });

    const end = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : origin.clone().addScaledVector(dir, def.range);
    const muzzle = player.model.muzzleWorld(new THREE.Vector3());
    game.effects.muzzleFlash(muzzle, dir, true);
    game.effects.tracer(muzzle, end);
    game.audio.shot(def.sound, 1);
    player.model.kick();
    cam.addRecoil(def.recoilPitch * (player.aiming ? 0.6 : 1), (Math.random() - 0.5) * def.recoilYaw);
    cam.shake = Math.min(cam.shake + 0.25, 0.6);
    game.hud.pulseCrosshair();

    if (hit) {
      if (hit.kind === 'target' && hit.target.isEnemy) {
        const dmg = Math.round(def.damage * (hit.headshot ? def.headMult : 1) * (0.92 + Math.random() * 0.16));
        hit.target.takeDamage(dmg, player);
        game.effects.impact(end, 'flesh');
        game.hud.hitMarker(hit.headshot);
        game.hud.damageNumber(end, dmg, hit.headshot);
        game.audio.hit(hit.headshot);
      } else {
        game.effects.impact(end, hit.kind === 'terrain' ? 'dirt' : 'solid');
      }
    }
  }
}
