import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { box, flatMat, mergeHierarchy } from '../utils/geometry.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { PALETTES } from './CharacterModel.js';

/**
 * Animated survivor built on Quaternius' CC0 "Universal Animation Library"
 * mannequin (public/models/survivor.glb). The plain mannequin is dressed
 * with original tactical gear: per-bone vertex colors for clothing and
 * small rigid props (cap, shades, vest, pack...) attached to bones.
 *
 * Full-body clips drive locomotion; afterwards the spine is bent towards
 * the aim pitch and both arms are solved with two-bone IK onto the gun.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}models/survivor.glb`;
const B = (name) => `DEF-${name}`; // three.js strips the dots from bone names

let template = null;
let clips = null;
const paletteGeometry = new Map(); // `${palette}|${mesh}` -> geometry with colors

export async function preloadSurvivor() {
  if (template) return;
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  template = gltf.scene;
  clips = new Map(gltf.animations.map((a) => [a.name, a]));
  template.updateMatrixWorld(true);
}

/** Which clothing region each bone belongs to. */
function regionOf(boneName) {
  const n = boneName.replace('DEF-', '');
  if (n.startsWith('head')) return 'skin';
  if (n.startsWith('neck')) return 'gaiter';
  if (n.startsWith('spine') || n.startsWith('shoulder') || n.startsWith('upper_arm')) return 'shirt';
  if (n.startsWith('forearm')) return 'skin';
  if (n.startsWith('hand') || n.startsWith('f_') || n.startsWith('thumb')) return 'gloves';
  if (n.startsWith('foot') || n.startsWith('toe')) return 'boots';
  return 'pants'; // hips, thighs, shins
}

function coloredGeometry(mesh, paletteName, palette, joints) {
  const key = `${paletteName}|${mesh.name}`;
  if (paletteGeometry.has(key)) return paletteGeometry.get(key);
  const geo = mesh.geometry.clone();
  const bones = mesh.skeleton.bones;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const colors = new Float32Array(si.count * 3);
  const c = new THREE.Color();
  const cols = {
    skin: new THREE.Color(palette.skin),
    gaiter: new THREE.Color(palette.shirt).multiplyScalar(0.85),
    shirt: new THREE.Color(palette.shirt),
    gloves: new THREE.Color(palette.gloves),
    boots: new THREE.Color(palette.boots),
    pants: new THREE.Color(palette.pants),
  };
  for (let i = 0; i < si.count; i++) {
    let best = 0;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > bw) {
        bw = w;
        best = si.getComponent(i, k);
      }
    }
    c.copy(cols[regionOf(bones[best].name)]);
    if (joints) c.multiplyScalar(0.82); // joint balls read as seams/pads
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  paletteGeometry.set(key, geo);
  return geo;
}

const skinMat = new THREE.MeshLambertMaterial({ vertexColors: true });

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

/** Rotate a bone (in world space) so its +Y axis points at a world target. */
function aimBone(bone, target) {
  bone.updateWorldMatrix(true, false);
  const pos = bone.getWorldPosition(_v);
  const wq = bone.getWorldQuaternion(_q);
  const cur = _v2.copy(Y).applyQuaternion(wq);
  const want = target.clone().sub(pos).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(cur, want);
  const newW = delta.multiply(wq);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(newW));
  bone.updateWorldMatrix(false, true);
}

/** Rotate a bone by a world-space rotation. */
function rotateBoneWorld(bone, axis, angle) {
  bone.updateWorldMatrix(true, false);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  const newW = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(wq);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(newW));
}

export class SurvivorModel {
  constructor(paletteName = 'player', weaponId = 'strider') {
    if (!template) throw new Error('preloadSurvivor() must run first');
    const palette = PALETTES[paletteName];
    this.root = new THREE.Group(); // faces -Z like the rest of the game
    this.inner = cloneSkinned(template);
    this.inner.rotation.y = Math.PI; // glTF faces +Z
    this.root.add(this.inner);
    this.body = this.inner; // kept for API compatibility

    this.inner.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.geometry = coloredGeometry(o, paletteName, palette, o.material.name === 'M_Joints');
        o.material = skinMat;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    this.bones = {};
    for (const n of ['hips', 'spine001', 'spine002', 'spine003', 'neck', 'head', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR', 'thighR', 'shinL', 'shinR']) {
      this.bones[n] = this.inner.getObjectByName(B(n));
    }
    this._dress(palette);

    // animation
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.actions = {};
    for (const [name, clip] of clips) this.actions[name] = this.mixer.clipAction(clip);
    for (const n of ['Death01', 'Jump_Start', 'Jump_Land', 'Hit_Chest', 'PickUp_Table']) {
      this.actions[n].setLoop(THREE.LoopOnce);
      this.actions[n].clampWhenFinished = true;
    }
    this.current = null;
    this.play('Idle_Loop', 0);

    // weapon (positioned every frame in front of the chest)
    this.gunPivot = new THREE.Group();
    this.root.add(this.gunPivot);
    this.recoil = 0;
    this.dead = false;
    this.setWeapon(weaponId);
  }

  /** Attach original tactical gear to bones, authored in rest pose. */
  _dress(p) {
    const add = (boneName, mesh, x, y, z) => {
      mesh.position.set(x, y, z);
      // rest pose coordinates are in glTF space (+Z forward); convert
      // through the inner group so attach() keeps the transform.
      this.inner.add(mesh);
      this.inner.updateMatrixWorld(true);
      this.inner.getObjectByName(B(boneName)).attach(mesh);
      return mesh;
    };
    const g = (w, h, d, c) => {
      const m = box(w, h, d, c);
      return m;
    };
    // the inner group is rotated PI; author in its local space (= glTF space)
    add('spine002', g(0.41, 0.36, 0.3, p.vest), 0, 1.27, 0.0);
    for (const x of [-0.11, 0, 0.11]) add('spine002', g(0.09, 0.11, 0.05, p.vest), x, 1.19, 0.17);
    add('spine003', g(0.07, 0.03, 0.02, p.accent), 0.12, 1.4, 0.16);
    add('hips', g(0.4, 0.07, 0.29, '#2a2622'), 0, 0.98, -0.01);
    add('hips', g(0.07, 0.05, 0.03, p.accent), 0, 0.98, 0.14);
    this.packSmall = add('spine003', g(0.34, 0.42, 0.17, p.pack), 0, 1.28, -0.22);
    this.packBig = add('spine003', g(0.4, 0.55, 0.25, '#556148'), 0, 1.27, -0.25);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.44, 6), flatMat('#7a6a4c'));
    roll.rotation.z = Math.PI / 2;
    roll.castShadow = true;
    this.packBig.add(roll);
    roll.position.set(0, 0.32, 0);
    this.packBig.visible = false;
    add('head', g(0.235, 0.09, 0.26, p.cap), 0, 1.79, 0.0);
    add('head', g(0.2, 0.025, 0.12, p.cap), 0, 1.755, 0.16);
    add('head', g(0.2, 0.045, 0.03, '#1d2226'), 0, 1.7, 0.115);
    add('head', g(0.03, 0.08, 0.07, '#262a2e'), 0.115, 1.68, 0.0);
    add('shinL', g(0.1, 0.1, 0.035, '#3a3f45'), 0.089, 0.5, 0.055);
    add('shinR', g(0.1, 0.1, 0.035, '#3a3f45'), -0.089, 0.5, 0.055);
    add('thighR', g(0.06, 0.15, 0.13, p.vest), -0.16, 0.78, 0.0);
  }

  play(name, fade = 0.2, timeScale = 1) {
    const next = this.actions[name];
    if (!next) return;
    next.timeScale = timeScale;
    if (this.current === next) return;
    next.reset().play();
    if (this.current && fade > 0) next.crossFadeFrom(this.current, fade, false);
    else if (this.current) this.current.stop();
    this.current = next;
  }

  setWeapon(id) {
    if (this.gun) this.gunPivot.remove(this.gun);
    this.weaponId = id;
    this.gun = mergeHierarchy(buildWeaponModel(id));
    this.gun.scale.setScalar(0.88);
    this.gunPivot.add(this.gun);
  }

  setBigPack(on) {
    this.packBig.visible = on;
    this.packSmall.visible = !on;
  }

  kick() {
    this.recoil = 1;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.play('Death01', 0.15);
    this.gunPivot.visible = false;
  }

  muzzleWorld(out) {
    this.root.updateMatrixWorld(true);
    return this.gun.userData.muzzle.getWorldPosition(out);
  }

  /**
   * state: speed, grounded, pitch, sprint, aiming, crouch, backwards,
   *        freefall, chute
   */
  animate(dt, s) {
    const speed = s.speed || 0;
    if (!this.dead) {
      let clip = 'Idle_Loop';
      let ts = 1;
      if (s.freefall || s.chute) {
        clip = s.freefall ? 'Swim_Idle_Loop' : 'Jump_Loop';
      } else if (!s.grounded) {
        clip = 'Jump_Loop';
      } else if (s.crouch) {
        clip = speed > 0.3 ? 'Crouch_Fwd_Loop' : 'Crouch_Idle_Loop';
        ts = speed > 0.3 ? speed / 2.2 : 1;
      } else if (speed > 0.3) {
        if (s.sprint) {
          clip = 'Sprint_Loop';
          ts = speed / 8.5;
        } else if (speed > 3.8) {
          clip = 'Jog_Fwd_Loop';
          ts = speed / 5.2;
        } else {
          clip = 'Walk_Loop';
          ts = speed / 1.7;
        }
      }
      if (s.backwards && speed > 0.3) ts = -Math.abs(ts);
      this.play(clip, 0.18, ts);
    }
    this.mixer.update(dt);

    // skydiving: lie flat
    const lieTarget = s.freefall ? -1.25 : 0;
    this.inner.rotation.x += (lieTarget - this.inner.rotation.x) * Math.min(1, dt * 4);

    if (this.dead || s.freefall) {
      this.gunPivot.visible = !this.dead && !s.freefall;
      return;
    }
    this.gunPivot.visible = true;
    this._aimPose(dt, s);
  }

  _aimPose(dt, s) {
    this.root.updateMatrixWorld(true);
    const pitch = s.pitch || 0;
    // bend the upper spine towards the aim pitch (around the body's right axis)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    rotateBoneWorld(this.bones.spine002, right, pitch * 0.35);
    rotateBoneWorld(this.bones.spine003, right, pitch * 0.35);
    this.inner.updateMatrixWorld(true);

    // place the gun at the right side of the chest, pointing where we aim
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const chest = this.bones.spine003.getWorldPosition(new THREE.Vector3());
    this.root.worldToLocal(chest);
    const lowered = s.sprint && s.speed > 0.3;
    const target = new THREE.Vector3(
      s.aiming ? 0.07 : 0.13,
      chest.y + (lowered ? -0.1 : 0.07),
      chest.z - 0.32 + this.recoil * 0.07,
    );
    this.gunPivot.position.lerp(target, Math.min(1, dt * 18));
    this.gunPivot.rotation.set(
      (lowered ? -0.55 : pitch) + this.recoil * 0.1,
      lowered ? 0.55 : 0,
      0,
    );
    this.gunPivot.updateMatrixWorld(true);

    // two-bone IK: right hand -> grip, left hand -> foregrip
    const grip = this.gun.localToWorld(new THREE.Vector3(0, -0.02, 0.05));
    const fore = this.gun.userData.foregrip.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const sideR = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ);
    this._ik(this.bones.upper_armR, this.bones.forearmR, this.bones.handR, grip, sideR.clone().multiplyScalar(0.7).addScaledVector(up, -1));
    this._ik(this.bones.upper_armL, this.bones.forearmL, this.bones.handL, fore, sideR.clone().multiplyScalar(-0.9).addScaledVector(up, -1));
  }

  _ik(upper, fore, hand, target, pole) {
    const S = upper.getWorldPosition(new THREE.Vector3());
    const E0 = fore.getWorldPosition(new THREE.Vector3());
    const H0 = hand.getWorldPosition(new THREE.Vector3());
    const l1 = S.distanceTo(E0);
    const l2 = E0.distanceTo(H0);
    const toT = target.clone().sub(S);
    const d = Math.min(toT.length(), l1 + l2 - 0.002);
    const dir = toT.normalize();
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const a = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = S.clone().addScaledVector(dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a)), l1);
    aimBone(upper, elbow);
    aimBone(fore, S.clone().addScaledVector(dir, d));
  }
}
