import * as THREE from 'three';
import { box, flatMat, mergeHierarchy } from '../utils/geometry.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';

/**
 * Original low-poly humanoid made of boxes, shared by the player and the
 * rival squads (different palettes). Faces -Z. Legs swing procedurally and
 * the arms use a tiny two-bone IK so the hands always stay on the gun.
 */

/** Player outfits selectable in the lobby: [palette key, display name]. */
export const SKINS = [
  ['player', 'RANGER'],
  ['dune', 'DUNE RUNNER'],
  ['nightshift', 'NIGHT SHIFT'],
  ['frostline', 'FROSTLINE'],
];

export const PALETTES = {
  player: {
    skin: '#c99a76',
    shirt: '#6f7d58', // olive tee
    vest: '#5a6b52', // green plate carrier
    pants: '#4b525c',
    boots: '#5a4634',
    gloves: '#262626',
    cap: '#3f5670',
    accent: '#d9a441', // amber tabs
    pack: '#6b5a41',
  },
  dune: {
    skin: '#d6a985',
    shirt: '#c9b48a',
    vest: '#8a7550',
    pants: '#7a6a52',
    boots: '#4a3a2c',
    gloves: '#3a3026',
    cap: '#b0905e',
    accent: '#e8c070',
    pack: '#6b5a41',
  },
  nightshift: {
    skin: '#b07c5c',
    shirt: '#2c2f36',
    vest: '#1f2228',
    pants: '#25272c',
    boots: '#18181a',
    gloves: '#111111',
    cap: '#b23a2e',
    accent: '#e0443a',
    pack: '#2a2c30',
  },
  frostline: {
    skin: '#e0b896',
    shirt: '#d8dde2',
    vest: '#8a99a8',
    pants: '#5d6b7a',
    boots: '#3a4450',
    gloves: '#2e3640',
    cap: '#4f86c6',
    accent: '#7fc4ff',
    pack: '#a6b2be',
  },
  rivalB: {
    skin: '#d1a27c',
    shirt: '#a8946a', // desert tan
    vest: '#6b5f45',
    pants: '#5c5546',
    boots: '#3b3026',
    gloves: '#2a2622',
    cap: '#7a6a4a',
    accent: '#e0c070',
    pack: '#5a4a3c',
  },
  rivalC: {
    skin: '#a87458',
    shirt: '#3f5266', // navy
    vest: '#2f3d4c',
    pants: '#3b3f46',
    boots: '#2a2420',
    gloves: '#222222',
    cap: '#26323e',
    accent: '#d0d6dc',
    pack: '#4a4a44',
  },
  rival: {
    skin: '#b98766',
    shirt: '#7a2c28', // crimson jacket
    vest: '#3f3b37',
    pants: '#4a423c',
    boots: '#2a2420',
    gloves: '#2a2222',
    cap: '#8a2f2a',
    accent: '#c8c0b0',
    pack: '#5a4a3c',
  },
};

const UP_ARM = 0.3;
const FORE_ARM = 0.3;
const DOWN = new THREE.Vector3(0, -1, 0);

export class CharacterModel {
  constructor(palette = PALETTES.player, weaponId = 'strider') {
    this.p = palette;
    this.root = new THREE.Group();
    this.phase = 0;
    this.recoil = 0;
    this._build();
    mergeHierarchy(this.body);
    this.setWeapon(weaponId);
  }

  _part(parent, w, h, d, x, y, z, color) {
    const m = box(w, h, d, color);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  _build() {
    const p = this.p;
    const body = new THREE.Group(); // tilts when dying
    this.root.add(body);
    this.body = body;

    const hips = new THREE.Group();
    hips.position.y = 0.95;
    body.add(hips);
    this.hips = hips;
    this._part(hips, 0.4, 0.2, 0.24, 0, 0, 0, p.pants);
    this._part(hips, 0.43, 0.07, 0.27, 0, 0.09, 0, '#2a2622');
    this._part(hips, 0.08, 0.06, 0.04, 0, 0.09, -0.14, p.accent); // buckle
    this._part(hips, 0.1, 0.14, 0.12, 0.23, -0.04, 0.02, p.vest); // holster pouch

    this.legs = [-1, 1].map((s) => {
      const leg = new THREE.Group();
      leg.position.set(s * 0.11, -0.04, 0);
      hips.add(leg);
      this._part(leg, 0.19, 0.46, 0.22, 0, -0.23, 0, p.pants);
      if (s > 0) this._part(leg, 0.06, 0.16, 0.14, s * 0.11, -0.22, -0.01, p.vest); // thigh pocket
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      leg.add(knee);
      this._part(knee, 0.17, 0.42, 0.19, 0, -0.21, 0, p.pants);
      this._part(knee, 0.15, 0.12, 0.05, 0, -0.04, -0.1, '#3a3f45'); // knee pad
      this._part(knee, 0.2, 0.14, 0.32, 0, -0.4, -0.05, p.boots);
      this._part(knee, 0.21, 0.04, 0.33, 0, -0.47, -0.05, '#1c1a18'); // sole
      return { leg, knee };
    });

    const spine = new THREE.Group();
    spine.position.y = 0.1;
    hips.add(spine);
    this.spine = spine;
    this._part(spine, 0.46, 0.56, 0.25, 0, 0.29, 0, p.shirt);
    this._part(spine, 0.5, 0.4, 0.31, 0, 0.32, 0, p.vest);
    for (const x of [-0.14, 0, 0.14]) this._part(spine, 0.11, 0.12, 0.05, x, 0.22, -0.17, p.vest);
    this._part(spine, 0.5, 0.04, 0.32, 0, 0.12, 0, '#2a2f2a');
    this._part(spine, 0.06, 0.04, 0.02, -0.15, 0.42, -0.165, p.accent); // shoulder tab
    this._part(spine, 0.3, 0.08, 0.27, 0, 0.6, 0, p.shirt); // collar

    // backpack (small by default, bigger once a pack is looted)
    this.packSmall = new THREE.Group();
    this._part(this.packSmall, 0.36, 0.42, 0.18, 0, 0.32, 0.24, p.pack);
    this._part(this.packSmall, 0.3, 0.12, 0.06, 0, 0.22, 0.35, '#584a36');
    spine.add(this.packSmall);
    this.packBig = new THREE.Group();
    this._part(this.packBig, 0.42, 0.56, 0.26, 0, 0.32, 0.28, '#556148');
    this._part(this.packBig, 0.36, 0.14, 0.08, 0, 0.18, 0.43, '#46513b');
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.46, 6), flatMat('#7a6a4c'));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.66, 0.27);
    roll.castShadow = true;
    this.packBig.add(roll);
    this.packBig.visible = false;
    spine.add(this.packBig);

    // head
    const head = new THREE.Group();
    head.position.y = 0.64;
    spine.add(head);
    this.head = head;
    this._part(head, 0.1, 0.08, 0.1, 0, 0.02, 0, p.skin);
    this._part(head, 0.24, 0.27, 0.25, 0, 0.18, 0, p.skin);
    this._part(head, 0.25, 0.06, 0.04, 0, 0.21, -0.12, '#1d2226'); // shades
    this._part(head, 0.26, 0.1, 0.27, 0, 0.33, 0.005, p.cap);
    this._part(head, 0.2, 0.025, 0.12, 0, 0.29, -0.18, p.cap); // brim
    this._part(head, 0.04, 0.1, 0.08, -0.135, 0.18, 0, '#262a2e'); // headset
    this._part(head, 0.25, 0.08, 0.2, 0, 0.08, 0.02, p.shirt).scale.set(1, 1, 1.05); // neck gaiter

    // arms
    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.3, 0.5, 0);
      spine.add(shoulder);
      this._part(shoulder, 0.14, UP_ARM, 0.15, 0, -UP_ARM / 2, 0, p.shirt);
      this._part(shoulder, 0.16, 0.1, 0.17, 0, -0.03, 0, p.vest); // shoulder pad
      const elbow = new THREE.Group();
      elbow.position.y = -UP_ARM;
      shoulder.add(elbow);
      this._part(elbow, 0.12, FORE_ARM, 0.13, 0, -FORE_ARM / 2, 0, p.skin);
      this._part(elbow, 0.13, 0.08, 0.14, 0, -0.05, 0, p.shirt); // rolled sleeve
      this._part(elbow, 0.11, 0.11, 0.12, 0, -FORE_ARM - 0.03, 0, p.gloves);
      return { shoulder, elbow, side: s };
    });

    // weapon mount (shouldered, right side)
    this.gunMount = new THREE.Group();
    this.gunMount.position.set(0.14, 0.38, -0.3);
    spine.add(this.gunMount);
  }

  setWeapon(id) {
    if (this.gun) this.gunMount.remove(this.gun);
    this.weaponId = id;
    this.gun = mergeHierarchy(buildWeaponModel(id));
    this.gunMount.add(this.gun);
  }

  setBigPack(on) {
    this.packBig.visible = on;
    this.packSmall.visible = !on;
  }

  /** World position of the muzzle. */
  muzzleWorld(out) {
    this.root.updateMatrixWorld(true);
    return this.gun.userData.muzzle.getWorldPosition(out);
  }

  /**
   * Animate. speed: horizontal m/s, grounded: bool, pitch: aim pitch.
   */
  animate(dt, { speed = 0, grounded = true, pitch = 0, sprint = false, aiming = false }) {
    const moving = speed > 0.3;
    this.phase += dt * (moving ? 2.2 + speed * 0.95 : 1.2);
    const amp = moving ? Math.min(speed / 7, 1) * (sprint ? 0.85 : 0.6) : 0;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    const [L, R] = this.legs;
    if (grounded) {
      L.leg.rotation.x = s * amp;
      R.leg.rotation.x = -s * amp;
      L.knee.rotation.x = Math.max(0, -s) * amp * 1.4 + (moving ? 0.1 : 0.02);
      R.knee.rotation.x = Math.max(0, s) * amp * 1.4 + (moving ? 0.1 : 0.02);
      this.hips.position.y = 0.95 - Math.abs(c) * amp * 0.07 + (moving ? 0 : Math.sin(this.phase) * 0.005);
    } else {
      L.leg.rotation.x = -0.5;
      R.leg.rotation.x = 0.2;
      L.knee.rotation.x = 0.9;
      R.knee.rotation.x = 0.5;
    }

    // upper body: lean into sprint, follow aim pitch, slight sway
    const lean = sprint && moving ? -0.18 : 0;
    this.spine.rotation.x = pitch * 0.75 - lean * -1 + (sprint ? -0.05 : 0);
    this.spine.rotation.y = moving ? s * 0.06 : 0;
    this.head.rotation.x = pitch * 0.25;

    // gun pose: lowered while sprinting, shouldered when aiming
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const mount = this.gunMount;
    const tx = aiming ? 0.1 : 0.14;
    const ty = sprint && moving ? 0.26 : 0.38;
    mount.position.x += (tx - mount.position.x) * Math.min(1, dt * 12);
    mount.position.y += (ty - mount.position.y) * Math.min(1, dt * 12);
    mount.position.z = -0.3 + this.recoil * 0.08;
    mount.rotation.x = (sprint && moving ? -0.6 : 0) + this.recoil * 0.12;
    mount.rotation.y = sprint && moving ? 0.5 : 0;

    this._solveArms();
  }

  kick() {
    this.recoil = 1;
  }

  _solveArms() {
    const spine = this.spine;
    spine.updateMatrixWorld(true);
    const grip = new THREE.Vector3(0, -0.01, 0.02);
    const fore = this.gun.userData.foregrip.position.clone();
    const targets = [fore, grip].map((v) => {
      this.gun.localToWorld(v);
      return spine.worldToLocal(v);
    });
    this.arms.forEach((arm, i) => {
      const t = targets[i]; // left arm -> foregrip, right arm -> grip
      solveTwoBone(arm, t, new THREE.Vector3(arm.side * 0.8, -1, 0.3));
    });
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Analytic two-bone IK in the parent (spine) frame. */
function solveTwoBone(arm, target, pole) {
  const S = arm.shoulder.position;
  const toT = _v1.subVectors(target, S);
  let d = toT.length();
  d = Math.min(d, UP_ARM + FORE_ARM - 0.001);
  const dir = toT.normalize();
  const cosA = (UP_ARM * UP_ARM + d * d - FORE_ARM * FORE_ARM) / (2 * UP_ARM * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const perp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbowDir = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a)).normalize();
  arm.shoulder.quaternion.setFromUnitVectors(DOWN, elbowDir);
  const E = S.clone().addScaledVector(elbowDir, UP_ARM);
  const foreDir = target.clone().sub(E).normalize();
  _q.copy(arm.shoulder.quaternion).invert();
  foreDir.applyQuaternion(_q);
  arm.elbow.quaternion.setFromUnitVectors(DOWN, foreDir);
}
