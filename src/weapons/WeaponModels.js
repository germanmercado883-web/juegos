import * as THREE from 'three';
import { box, flatMat } from '../utils/geometry.js';

// Procedural gun meshes. Origin = pistol grip, barrel points along -Z.
// userData.muzzle / userData.foregrip are anchor objects used by the
// character IK and the muzzle flash.

function cyl(r, len, color, segs = 6) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segs), flatMat(color));
  m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  return m;
}

function anchors(g, muzzleZ, foregrip) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.06, muzzleZ);
  g.add(muzzle);
  const fg = new THREE.Object3D();
  fg.position.copy(foregrip);
  g.add(fg);
  g.userData.muzzle = muzzle;
  g.userData.foregrip = fg;
  return g;
}

export function buildStrider() {
  const g = new THREE.Group();
  const dark = '#2e3236';
  const mid = '#474d52';
  const tan = '#9c8a64';
  const add = (m, x, y, z) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(box(0.075, 0.11, 0.42, mid), 0, 0.06, -0.12); // receiver
  add(box(0.08, 0.09, 0.3, tan), 0, 0.05, -0.46); // handguard
  add(cyl(0.017, 0.26, dark), 0, 0.065, -0.72); // barrel
  add(box(0.045, 0.05, 0.08, dark), 0, 0.065, -0.86); // muzzle brake
  add(box(0.03, 0.02, 0.5, dark), 0, 0.125, -0.25); // top rail
  add(box(0.05, 0.06, 0.16, '#1f2326'), 0, 0.17, -0.18); // optic body
  add(box(0.06, 0.07, 0.03, '#1f2326'), 0, 0.17, -0.27);
  const mag = add(box(0.05, 0.2, 0.09, dark), 0, -0.07, -0.2);
  mag.rotation.x = 0.25;
  const grip = add(box(0.05, 0.13, 0.06, dark), 0, -0.03, 0.02);
  grip.rotation.x = -0.3;
  add(box(0.055, 0.1, 0.26, tan), 0, 0.04, 0.2); // stock
  add(box(0.06, 0.13, 0.04, dark), 0, 0.03, 0.34); // butt pad
  add(box(0.04, 0.08, 0.05, dark), 0, -0.02, -0.46); // foregrip
  return anchors(g, -0.92, new THREE.Vector3(0, -0.03, -0.46));
}

export function buildHornet() {
  const g = new THREE.Group();
  const dark = '#2b2e31';
  const body = '#5b6266';
  const accent = '#d2a23a';
  const add = (m, x, y, z) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(box(0.08, 0.12, 0.38, body), 0, 0.06, -0.1);
  add(box(0.082, 0.025, 0.3, accent), 0, 0.1, -0.1);
  add(cyl(0.022, 0.16, dark), 0, 0.06, -0.36);
  add(box(0.05, 0.05, 0.06, dark), 0, 0.06, -0.45);
  const mag = add(box(0.045, 0.22, 0.06, dark), 0, -0.08, -0.14);
  mag.rotation.x = 0.05;
  const grip = add(box(0.05, 0.12, 0.06, dark), 0, -0.03, 0.03);
  grip.rotation.x = -0.25;
  add(box(0.02, 0.08, 0.2, dark), 0, 0.04, 0.2); // wire stock
  add(box(0.05, 0.1, 0.03, dark), 0, 0.02, 0.3);
  add(box(0.035, 0.07, 0.05, dark), 0, -0.02, -0.3);
  return anchors(g, -0.5, new THREE.Vector3(0, -0.03, -0.3));
}

export function buildThunder() {
  const g = new THREE.Group();
  const dark = '#2b2d30';
  const wood = '#7a5232';
  const add = (m, x, y, z) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(box(0.08, 0.1, 0.3, dark), 0, 0.05, -0.08);
  add(cyl(0.028, 0.62, dark), 0, 0.08, -0.52);
  add(cyl(0.024, 0.5, '#3a3d40'), 0, 0.03, -0.46); // tube magazine
  add(box(0.075, 0.07, 0.24, wood), 0, 0.02, -0.42); // pump
  const grip = add(box(0.05, 0.12, 0.06, wood), 0, -0.03, 0.04);
  grip.rotation.x = -0.35;
  add(box(0.06, 0.11, 0.3, wood), 0, 0.02, 0.24);
  add(box(0.065, 0.13, 0.04, '#1e1e1e'), 0, 0.01, 0.4);
  return anchors(g, -0.84, new THREE.Vector3(0, -0.01, -0.42));
}

export function buildLongshot() {
  const g = new THREE.Group();
  const body = '#4a5a3e';
  const dark = '#24272a';
  const add = (m, x, y, z) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(box(0.075, 0.1, 0.5, body), 0, 0.05, -0.12);
  add(cyl(0.018, 0.7, dark), 0, 0.07, -0.72);
  add(box(0.04, 0.04, 0.1, dark), 0, 0.07, -1.08);
  add(cyl(0.035, 0.34, dark, 8), 0, 0.17, -0.14); // scope
  add(cyl(0.045, 0.05, '#1a1d20', 8), 0, 0.17, -0.32);
  add(box(0.03, 0.05, 0.03, dark), 0, 0.12, -0.08);
  add(box(0.03, 0.05, 0.03, dark), 0, 0.12, -0.22);
  const mag = add(box(0.05, 0.12, 0.08, dark), 0, -0.04, -0.1);
  mag.rotation.x = 0.1;
  const grip = add(box(0.05, 0.12, 0.06, dark), 0, -0.03, 0.04);
  grip.rotation.x = -0.3;
  add(box(0.06, 0.12, 0.34, body), 0, 0.03, 0.26);
  add(box(0.02, 0.18, 0.02, dark), 0.03, -0.06, -0.5).rotation.x = 0.4; // bipod leg
  return anchors(g, -1.14, new THREE.Vector3(0, -0.02, -0.42));
}

export function buildWeaponModel(id) {
  if (id === 'hornet') return buildHornet();
  if (id === 'thunder') return buildThunder();
  if (id === 'longshot') return buildLongshot();
  return buildStrider();
}
