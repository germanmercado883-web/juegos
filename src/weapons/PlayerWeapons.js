import * as THREE from 'three';
import { WEAPONS, LOOT_FOR_WEAPON } from './weaponData.js';

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

  /** Pick up a weapon: fills the empty slot, otherwise swaps the held one (dropped as loot). */
  give(id) {
    const def = WEAPONS[id];
    const slot = { def, mag: def.magSize };
    let target = this.slots[1] ? this.current : 1;
    const old = this.slots[target];
    if (old && old.def.id === id) {
      old.mag = def.magSize;
      return null;
    }
    this.slots[target] = slot;
    this.current = -1;
    this.equip(target);
    return old ? LOOT_FOR_WEAPON[old.def.id] : null;
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
    const semi = a.def.fireRate < 2; // shotgun / sniper: one shot per press
    const trigger = semi ? input.mouse.leftPressed || (input.mouse.left && this.cooldown <= -0.05 && this.player.game.touch) : input.mouse.left;
    if (trigger && this.cooldown <= 0 && this.player.healing <= 0) {
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
    const muzzle = player.model.muzzleWorld(new THREE.Vector3());
    const pellets = def.pellets || 1;
    let totalDmg = 0;
    let anyHead = false;
    let lastHitPoint = null;
    let lastDir = null;
    for (let i = 0; i < pellets; i++) {
      const dir = cam.forward(new THREE.Vector3());
      dir.x += (Math.random() - 0.5) * 2 * spread;
      dir.y += (Math.random() - 0.5) * 2 * spread;
      dir.z += (Math.random() - 0.5) * 2 * spread;
      dir.normalize();
      lastDir = dir;
      // start the ray at the player's depth so walls behind the player are ignored
      const origin = camera.position.clone().addScaledVector(dir, cam.currentDist * 0.9);
      const hit = game.world.physics.raycast(origin, dir, def.range, { ignore: player });
      const end = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : origin.clone().addScaledVector(dir, def.range);
      if (i < 3) game.effects.tracer(muzzle, end);
      if (!hit) continue;
      if (hit.kind === 'target' && hit.target.isEnemy) {
        const dmg = Math.round(def.damage * (hit.headshot ? def.headMult : 1) * (0.92 + Math.random() * 0.16));
        hit.target.takeDamage(dmg, player);
        totalDmg += dmg;
        anyHead ||= hit.headshot;
        lastHitPoint = end;
        if (i < 3) game.effects.impact(end, 'flesh');
      } else if (i < 4) {
        game.effects.impact(end, hit.kind === 'terrain' ? 'dirt' : 'solid');
      }
    }
    game.effects.muzzleFlash(muzzle, lastDir, true);
    game.audio.shot(def.sound, 1);
    if (totalDmg > 0) {
      game.hud.hitMarker(anyHead);
      game.hud.damageNumber(lastHitPoint, totalDmg, anyHead);
      game.audio.hit(anyHead);
    }
    player.model.kick();
    cam.addRecoil(def.recoilPitch * (player.aiming ? 0.6 : 1), (Math.random() - 0.5) * def.recoilYaw);
    cam.shake = Math.min(cam.shake + 0.25, 0.6);
    game.hud.pulseCrosshair();
  }
}
