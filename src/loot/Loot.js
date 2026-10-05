import * as THREE from 'three';
import { box, flatMat, radialTexture, mergeHierarchy } from '../utils/geometry.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { WEAPONS, WEAPON_LOOT } from '../weapons/weaponData.js';

// Loot table: visuals + what each pickup does.
export const LOOT_TYPES = {
  ammo: { label: 'AMMO BOX', glow: '#f2f0e6' },
  medkit: { label: 'FIELD MEDKIT', glow: '#7be08a' },
  grenade: { label: 'FRAG GRENADES x2', glow: '#f2f0e6' },
  armor: { label: 'GUARD VEST', glow: '#6fb4ff' },
  backpack: { label: 'TREK PACK', glow: '#c08bff' },
  smg: { label: 'PX-4 HORNET', glow: '#6fb4ff' },
  rifle: { label: 'RK-7 STRIDER', glow: '#7be08a' },
  shotgun: { label: 'M-12 THUNDER', glow: '#c08bff' },
  sniper: { label: 'LR-5 LONGSHOT', glow: '#ffc94a' },
};

function buildMesh(type) {
  const g = new THREE.Group();
  if (type === 'ammo') {
    g.add(box(0.5, 0.3, 0.32, '#5c6b45'));
    const stripe = box(0.51, 0.06, 0.33, '#d9b44a');
    stripe.position.y = 0.05;
    g.add(stripe);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), flatMat('#c9a24a'));
      b.position.set(-0.1 + i * 0.1, 0.22, 0);
      g.add(b);
    }
  } else if (type === 'grenade') {
    for (const x of [-0.1, 0.1]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), flatMat('#4b5a3a'));
      b.scale.set(1, 1.2, 1);
      b.position.x = x;
      g.add(b);
    }
  } else if (type === 'medkit') {
    g.add(box(0.5, 0.34, 0.2, '#e6e6dc'));
    const h = box(0.12, 0.25, 0.22, '#3fae5a');
    const v = box(0.25, 0.12, 0.22, '#3fae5a');
    h.position.z = v.position.z = 0.01;
    g.add(h, v);
    const handle = box(0.2, 0.05, 0.06, '#4b4b4b');
    handle.position.y = 0.2;
    g.add(handle);
  } else if (type === 'armor') {
    g.add(box(0.5, 0.56, 0.18, '#3e5a78'));
    const plate = box(0.36, 0.34, 0.06, '#5b7fa6');
    plate.position.set(0, 0.04, 0.11);
    g.add(plate);
    for (const s of [-1, 1]) {
      const strap = box(0.1, 0.16, 0.16, '#2f4459');
      strap.position.set(s * 0.17, 0.34, 0);
      g.add(strap);
    }
  } else if (type === 'backpack') {
    g.add(box(0.46, 0.58, 0.28, '#556148'));
    const pocket = box(0.36, 0.22, 0.08, '#46513b');
    pocket.position.set(0, -0.1, 0.17);
    g.add(pocket);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), flatMat('#8a6f4c'));
    roll.rotation.z = Math.PI / 2;
    roll.position.y = 0.36;
    g.add(roll);
  } else if (WEAPON_LOOT[type]) {
    const gun = buildWeaponModel(WEAPON_LOOT[type]);
    gun.rotation.y = Math.PI / 2;
    gun.scale.setScalar(1.3);
    g.add(gun);
  }
  return mergeHierarchy(g);
}

let glowTex = null;

export class LootItem {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = LOOT_TYPES[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);
    this.mesh = buildMesh(type);
    this.mesh.position.y = 0.55;
    this.root.add(this.mesh);

    glowTex ??= radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 64);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: glowTex, color: this.def.glow, transparent: true, depthWrite: false, opacity: 0.7, blending: THREE.AdditiveBlending }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    this.root.add(glow);

    // thin vertical beam so loot reads from a distance (classic BR touch)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.12, 2.2, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: this.def.glow, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 1.1;
    this.root.add(beam);
    this.t = Math.random() * 10;
    this.taken = false;
  }

  update(dt) {
    this.t += dt;
    this.mesh.rotation.y += dt * 1.2;
    this.mesh.position.y = 0.55 + Math.sin(this.t * 2.2) * 0.08;
  }
}

export class LootManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.group = new THREE.Group();
    this.group.name = 'loot';
    game.scene.add(this.group);
  }

  spawn(type, x, z) {
    // floor level (terrain or a building floor), never a roof
    const physics = this.game.world.physics;
    const y = physics.groundHeight(x, z, physics.terrain.groundAt(x, z) + 0.3);
    const item = new LootItem(type, x, y, z);
    this.items.push(item);
    this.group.add(item.root);
    return item;
  }

  /** Closest pickup within reach, or null. */
  nearest(pos, reach = 2.3) {
    let best = null;
    let bd = reach;
    for (const it of this.items) {
      const d = Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z);
      if (d < bd && Math.abs(it.pos.y - pos.y) < 2) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  /** Apply the pickup to the player. Returns a toast string or null if refused. */
  pickup(item, player) {
    const w = player.weapons;
    let msg = null;
    switch (item.type) {
      case 'ammo': {
        if (w.reserve >= player.maxReserve) return 'AMMO FULL';
        const add = Math.min(45, player.maxReserve - w.reserve);
        w.reserve += add;
        msg = `+${add} AMMO`;
        break;
      }
      case 'grenade':
        if (player.grenades >= 4) return 'GRENADES FULL';
        player.grenades = Math.min(4, player.grenades + 2);
        msg = `+2 GRENADES (${player.grenades})`;
        break;
      case 'medkit':
        if (player.medkits >= 5) return 'MEDKITS FULL';
        player.medkits += 1;
        msg = '+1 MEDKIT';
        break;
      case 'armor':
        if (player.armor >= 100) return 'ARMOR FULL';
        player.armor = Math.min(100, player.armor + 60);
        msg = '+60 ARMOR';
        break;
      case 'backpack':
        if (player.hasBigPack) return 'ALREADY EQUIPPED';
        player.hasBigPack = true;
        player.model.setBigPack(true);
        msg = 'TREK PACK — AMMO CAP 240';
        break;
      case 'smg':
      case 'rifle':
      case 'shotgun':
      case 'sniper': {
        const id = WEAPON_LOOT[item.type];
        const dropped = w.give(id);
        w.reserve = Math.min(player.maxReserve, w.reserve + 20);
        if (dropped) this.spawn(dropped, player.pos.x + 0.9, player.pos.z + 0.6);
        msg = `${WEAPONS[id].name} EQUIPPED`;
        break;
      }
      default:
        return null;
    }
    item.taken = true;
    this.group.remove(item.root);
    this.items.splice(this.items.indexOf(item), 1);
    return msg;
  }

  update(dt) {
    for (const it of this.items) it.update(dt);
  }
}
