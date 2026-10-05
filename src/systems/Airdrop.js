import * as THREE from 'three';
import { box, mergeHierarchy, radialTexture } from '../utils/geometry.js';
import { buildCanopy } from './DropSequence.js';

const DROP_ALT = 110;
const FALL_SPEED = 7;

/**
 * Supply drop: a crate parachutes into the current safe zone with a red
 * smoke plume once it lands. It holds high-tier loot (sniper, vest,
 * medkits, ammo) and is marked on the minimap.
 */
export class Airdrop {
  constructor(game) {
    this.game = game;
    this.drops = [];
    this.smokeTex = radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 64);
  }

  reset() {
    for (const d of this.drops) {
      this.game.scene.remove(d.group);
      for (const p of d.smoke) this.game.scene.remove(p.s);
      if (d.collider) {
        const boxes = this.game.world.physics.boxes;
        boxes.splice(boxes.indexOf(d.collider), 1);
      }
    }
    this.drops = [];
  }

  spawn() {
    const zone = this.game.zone;
    const target = zone.next ?? { center: zone.center, radius: zone.radius };
    const physics = this.game.world.physics;
    let x;
    let z;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * target.radius * 0.7;
      x = target.center.x + Math.cos(a) * r;
      z = target.center.y + Math.sin(a) * r;
      if (!physics.terrain.isOnRoad(x, z, 1) && physics.groundHeight(x, z, 200) - physics.terrain.groundAt(x, z) < 0.3) break;
    }
    const ground = physics.terrain.groundAt(x, z);
    const group = new THREE.Group();
    const crate = buildCrate();
    group.add(crate);
    const chute = buildCanopy();
    chute.scale.setScalar(0.8);
    chute.position.y = 1.1;
    group.add(chute);
    group.position.set(x, ground + DROP_ALT, z);
    this.game.scene.add(group);
    this.drops.push({ group, crate, chute, ground, x, z, landed: false, opened: false, smoke: [], smokeTimer: 0, age: 0 });
    this.game.hud.toast('SUPPLY DROP INCOMING — CHECK THE MAP', 'warn');
    this.game.audio.chute();
  }

  /** Drops still worth showing on the minimap. */
  markers() {
    return this.drops.filter((d) => !d.opened).map((d) => ({ x: d.x, z: d.z }));
  }

  update(dt) {
    const player = this.game.player;
    for (const d of this.drops) {
      d.age += dt;
      if (!d.landed) {
        d.group.position.y -= FALL_SPEED * dt;
        d.group.rotation.y += dt * 0.3;
        d.chute.rotation.z = Math.sin(d.age * 1.3) * 0.08;
        if (d.group.position.y <= d.ground) {
          d.group.position.y = d.ground;
          d.landed = true;
          d.group.remove(d.chute);
          d.collider = this.game.world.physics.addBox(d.x, d.z, 0.7, 0.7, 0, d.ground, d.ground + 1.1);
          this.game.audio.land();
        }
      }
      // red smoke plume
      if (d.landed && !d.opened) {
        d.smokeTimer -= dt;
        if (d.smokeTimer <= 0 && d.smoke.length < 26) {
          d.smokeTimer = 0.25;
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: '#e0503a', transparent: true, depthWrite: false, opacity: 0.6 }));
          s.position.set(d.x + (Math.random() - 0.5) * 0.6, d.ground + 1.2, d.z + (Math.random() - 0.5) * 0.6);
          s.scale.setScalar(1.2);
          this.game.scene.add(s);
          d.smoke.push({ s, t: 0 });
        }
      }
      for (const p of d.smoke) {
        p.t += dt;
        const life = 6.5;
        if (p.t > life) {
          p.t = 0;
          if (d.opened) {
            p.s.visible = false;
            continue;
          }
          p.s.position.set(d.x + (Math.random() - 0.5) * 0.6, d.ground + 1.2, d.z + (Math.random() - 0.5) * 0.6);
        }
        p.s.position.y += dt * 2.6;
        p.s.position.x += dt * 0.9; // wind
        p.s.scale.setScalar(1.2 + p.t * 1.1);
        p.s.material.opacity = 0.55 * (1 - p.t / life);
      }
      // open when the player walks up to it
      if (d.landed && !d.opened && player.phase === 'ground' && Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < 2.6) {
        d.opened = true;
        const loot = this.game.loot;
        loot.spawn('sniper', d.x + 1.4, d.z);
        loot.spawn('armor', d.x - 1.4, d.z);
        loot.spawn('medkit', d.x, d.z + 1.4);
        loot.spawn('ammo', d.x, d.z - 1.4);
        d.crate.children.forEach((c) => {
          if (c.userData.lid) c.visible = false;
        });
        this.game.hud.toast('SUPPLY CRATE OPENED');
        this.game.audio.pickup();
      }
    }
  }
}

function buildCrate() {
  const g = new THREE.Group();
  const body = box(1.4, 1.0, 1.4, '#3d5a7a');
  body.position.y = 0.5;
  g.add(body);
  for (const y of [0.12, 0.88]) {
    const band = box(1.44, 0.1, 1.44, '#d9a441');
    band.position.y = y;
    g.add(band);
  }
  mergeHierarchy(g);
  // lid and beacon stay separate so they can disappear when opened
  const lid = box(1.46, 0.12, 1.46, '#2f4862');
  lid.position.y = 1.06;
  lid.userData.lid = true;
  g.add(lid);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff6a4a' }));
  light.position.y = 1.16;
  light.userData.lid = true;
  g.add(light);
  return g;
}
