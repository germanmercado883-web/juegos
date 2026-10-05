import * as THREE from 'three';
import { SurvivorModel, preloadSurvivor } from '../entities/SurvivorModel.js';
import { box, flatMat } from '../utils/geometry.js';

/**
 * Main-menu lobby: the player's survivor idles on a small outpost platform
 * at golden hour while the camera drifts around them. Rendered with the
 * game's renderer while the menu is open.
 */
export class Lobby {
  constructor(renderer) {
    this.renderer = renderer;
    this.ready = false;
    this.t = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    this._init();
  }

  async _init() {
    try {
      await preloadSurvivor();
    } catch (err) {
      console.warn('lobby: model unavailable', err);
      return;
    }
    const s = this.scene;
    s.background = gradientTexture();
    s.fog = new THREE.Fog('#d8c8a8', 18, 60);
    s.add(new THREE.HemisphereLight('#ffe9c8', '#5a5040', 1.6));
    const sun = new THREE.DirectionalLight('#ffd49a', 2.6);
    sun.position.set(-6, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    s.add(sun);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 24), flatMat('#8a9a55'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.3, 6), flatMat('#5d6168'));
    pad.position.y = 0.15;
    pad.receiveShadow = true;
    s.add(pad);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.06, 6, 1, true), flatMat('#f2b33d', { side: THREE.DoubleSide }));
    ring.position.y = 0.3;
    s.add(ring);
    const props = [
      [box(1.1, 1.1, 1.1, '#a7834f'), -2.6, 0.55, -1.6, 0.4],
      [box(0.8, 0.8, 0.8, '#a7834f'), -2.9, 1.5, -1.5, 0.1],
      [box(2.6, 0.7, 0.8, '#b8a27a'), 2.4, 0.35, -2.4, -0.5],
      [box(6.1, 2.6, 2.4, '#a2563a'), -2, 1.3, -8, 0.15],
    ];
    for (const [m, x, y, z, r] of props) {
      m.position.set(x, y, z);
      m.rotation.y = r;
      s.add(m);
    }
    for (const [x, z, sc] of [[5, -7, 1.2], [-7, -4, 1], [8, -2, 0.9], [-4, -11, 1.4]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 6), flatMat('#6b4f38'));
      trunk.position.set(x, 1, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.6 * sc, 4 * sc, 7), flatMat('#4f6e45'));
      top.position.set(x, 2 + 2 * sc, z);
      trunk.castShadow = top.castShadow = true;
      s.add(trunk, top);
    }

    this.hero = new SurvivorModel('player', 'strider');
    this.hero.root.position.y = 0.3;
    this.hero.root.rotation.y = Math.PI * 0.82; // turned towards the camera
    s.add(this.hero.root);
    this.ready = true;
    document.body.classList.add('lobby-ready');
  }

  render(dt) {
    if (!this.ready) return;
    this.t += dt;
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    // keep the hero on the right third of the screen, clear of the menu
    this.camera.setViewOffset(w, h, -w * 0.18, 0, w, h);
    this.camera.updateProjectionMatrix();
    const a = Math.sin(this.t * 0.12) * 0.35 + 0.15;
    this.camera.position.set(Math.sin(a) * 7.6, 2.3, Math.cos(a) * 7.6);
    this.camera.lookAt(0, 1.25, 0);
    this.hero.animate(dt, { speed: 0, grounded: true, pitch: -0.05 });
    this.renderer.render(this.scene, this.camera);
  }
}

function gradientTexture() {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4f8fcf');
  grad.addColorStop(0.5, '#a9c6dc');
  grad.addColorStop(0.75, '#e8d6b0');
  grad.addColorStop(1, '#d8c8a8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
