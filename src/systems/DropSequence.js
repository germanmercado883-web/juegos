import * as THREE from 'three';
import { box, flatMat, mergeHierarchy } from '../utils/geometry.js';
import { angleDiff, clamp, damp } from '../utils/math.js';
import { MAP_HALF, PLAY_LIMIT } from '../world/mapLayout.js';

const PLANE_ALT = 170;
const PLANE_SPEED = 46;
const FREEFALL_TERMINAL = 30;
const CHUTE_FALL = 5.5;
const AUTO_CHUTE_HEIGHT = 60;

/**
 * Match opening: everyone rides a cargo plane across the valley, the
 * player jumps (Space), skydives, and the canopy opens automatically
 * near the ground (or earlier with Space).
 */
export class DropSequence {
  constructor(game) {
    this.game = game;
    this.plane = buildPlane();
    this.plane.visible = false;
    game.scene.add(this.plane);
    this.canopy = buildCanopy();
    this.canopy.visible = false;
    game.scene.add(this.canopy);
    this.active = false;
  }

  /** Random straight flight path crossing the map. */
  begin(player) {
    const a = Math.random() * Math.PI * 2;
    const off = (Math.random() - 0.5) * 120;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    this.start = dir.clone().multiplyScalar(-MAP_HALF - 60).addScaledVector(side, off).setY(PLANE_ALT);
    this.dir = dir;
    this.length = (MAP_HALF + 60) * 2;
    this.t = 0;
    this.active = true;
    this.plane.visible = true;
    this.plane.position.copy(this.start);
    this.plane.rotation.y = Math.atan2(-dir.x, -dir.z);
    player.phase = 'plane';
    player.root.visible = false;
    player.pos.copy(this.start);
    this.game.cam.distance = 40;
    this.game.cam.yaw = this.plane.rotation.y + 0.5;
    this.game.cam.pitch = -0.42;
    this.game.hud.setDropHint('PRESS SPACE TO JUMP');
  }

  _jump(player) {
    player.phase = 'freefall';
    player.root.visible = true;
    player.pos.copy(this.plane.position).addScaledVector(new THREE.Vector3(0, -3, 0), 1);
    player.vel.copy(this.dir).multiplyScalar(PLANE_SPEED * 0.4);
    player.vel.y = -2;
    this.game.audio.jump();
    this.game.cam.distance = 7;
    this.game.hud.setDropHint('SPACE — OPEN PARACHUTE');
  }

  _openChute(player) {
    player.phase = 'chute';
    this.canopy.visible = true;
    this.canopy.scale.setScalar(0.2);
    this.game.audio.chute();
    this.game.hud.setDropHint('W A S D — STEER');
  }

  _land(player, ground) {
    player.phase = 'ground';
    player.pos.y = ground;
    player.vel.set(0, 0, 0);
    player.grounded = true;
    this.canopy.visible = false;
    this.game.cam.distance = 4.2;
    this.game.audio.land();
    this.game.hud.setDropHint('');
    this.game.hud.toast('LANDED — FIND LOOT!');
    this.game.zone.start();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const d = this.t * PLANE_SPEED;
    this.plane.position.copy(this.start).addScaledVector(this.dir, d);
    for (const p of this.plane.userData.props) p.rotation.z += dt * 30;
    if (d > this.length) {
      this.active = false;
      this.plane.visible = false;
    }
  }

  /** Player movement while not on the ground. */
  updatePlayer(dt, input, cam, player) {
    const physics = this.game.world.physics;
    if (player.phase === 'plane') {
      player.pos.copy(this.plane.position);
      // force the jump before the plane leaves the island
      const along = this.t * PLANE_SPEED;
      if (input.wasPressed('Space') || along > this.length - 90) this._jump(player);
      return;
    }

    const yaw = cam.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const wish = fwd.multiplyScalar(f).addScaledVector(right, s);
    if (wish.lengthSq() > 0) wish.normalize();
    const ground = physics.groundHeight(player.pos.x, player.pos.z, player.pos.y);
    const height = player.pos.y - ground;

    if (player.phase === 'freefall') {
      const hs = 16;
      player.vel.x += (wish.x * hs - player.vel.x) * damp(1.5, dt);
      player.vel.z += (wish.z * hs - player.vel.z) * damp(1.5, dt);
      // diving (W) falls faster, like the classic skydive
      const terminal = FREEFALL_TERMINAL + (f > 0 ? 8 : 0);
      player.vel.y = Math.max(player.vel.y - 20 * dt, -terminal);
      if ((input.wasPressed('Space') && height < PLANE_ALT - 25) || height < AUTO_CHUTE_HEIGHT) this._openChute(player);
    } else if (player.phase === 'chute') {
      const hs = 9;
      player.vel.x += (wish.x * hs - player.vel.x) * damp(1.2, dt);
      player.vel.z += (wish.z * hs - player.vel.z) * damp(1.2, dt);
      player.vel.y += (-CHUTE_FALL - player.vel.y) * damp(2.5, dt);
      this.canopy.scale.setScalar(Math.min(1, this.canopy.scale.x + dt * 2.5));
    }

    player.pos.addScaledVector(player.vel, dt);
    player.pos.x = clamp(player.pos.x, -PLAY_LIMIT, PLAY_LIMIT);
    player.pos.z = clamp(player.pos.z, -PLAY_LIMIT, PLAY_LIMIT);
    const g2 = physics.groundHeight(player.pos.x, player.pos.z, player.pos.y);
    if (player.pos.y <= g2) {
      if (player.phase === 'freefall') this._openChute(player);
      this._land(player, g2);
    }

    player.facing += angleDiff(player.facing, yaw) * damp(6, dt);
    player.root.position.copy(player.pos);
    player.root.rotation.y = player.facing;
    if (this.canopy.visible) {
      this.canopy.position.copy(player.pos).setY(player.pos.y + 1.6);
      this.canopy.rotation.y = player.facing;
      this.canopy.rotation.z = -s * 0.25;
    }
    player.model.animate(dt, {
      freefall: player.phase === 'freefall',
      chute: player.phase === 'chute',
      grounded: player.phase === 'ground',
      pitch: 0,
    });
    this.game.hud.setAltitude(player.phase === 'ground' ? null : Math.max(0, Math.round(height)));
  }
}

function buildPlane() {
  const g = new THREE.Group();
  const body = '#b9b4a6';
  const dark = '#5d6168';
  const stripe = '#d39a2e';
  const add = (m, x, y, z) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.0, 24, 10), flatMat(body));
  fus.rotation.x = Math.PI / 2;
  add(fus, 0, 0, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 10), flatMat(body));
  nose.rotation.x = -Math.PI / 2;
  add(nose, 0, 0, -14);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(2.0, 7, 10), flatMat(body));
  tail.rotation.x = Math.PI / 2;
  add(tail, 0, 0.6, 15.5);
  add(box(36, 0.5, 4.5, body), 0, 1.2, -1);
  add(box(12, 0.35, 2.6, body), 0, 1.5, 17);
  add(box(0.4, 5.5, 3.6, body), 0, 3.8, 17);
  add(box(4.5, 0.6, 24.2, stripe), 0, -0.2, 0).scale.set(1, 1, 1);
  add(box(3.6, 1.0, 1.2, '#2c3540'), 0, 0.9, -12.3); // cockpit glass
  const props = [];
  for (const x of [-12, -6, 6, 12]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 3.4, 8), flatMat(dark));
    eng.rotation.x = Math.PI / 2;
    add(eng, x, 0.7, -3);
    const prop = new THREE.Group();
    prop.add(box(0.3, 4.2, 0.12, '#2a2a2a'));
    prop.add(box(4.2, 0.3, 0.12, '#2a2a2a'));
    add(prop, x, 0.7, -4.8);
    props.push(prop);
  }
  mergeHierarchy(g);
  // props must stay separate to spin: re-add after merge
  g.userData.props = props;
  for (const p of props) g.add(p);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

export function buildCanopy() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(3.4, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2.6).toNonIndexed();
  geo.scale(1.25, 0.55, 0.8);
  const colors = [];
  const a = new THREE.Color('#e8603c');
  const b = new THREE.Color('#f2e6c8');
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12);
    const c = seg % 2 ? a : b;
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const canopy = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
  canopy.position.y = 3.4;
  canopy.castShadow = true;
  g.add(canopy);
  const lines = [];
  for (const [x, z] of [[-3.8, -1.5], [3.8, -1.5], [-3.8, 1.5], [3.8, 1.5], [0, -2.4], [0, 2.4]]) {
    lines.push(0, 0.1, 0, x, 3.6, z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#3a3a3a' })));
  return g;
}
