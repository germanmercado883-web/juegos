import * as THREE from 'three';
import { Input } from './Input.js';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera.js';
import { Enemy } from '../enemies/Enemy.js';
import { LootManager } from '../loot/Loot.js';
import { SafeZone } from '../systems/SafeZone.js';
import { Effects } from '../systems/Effects.js';
import { Sfx } from '../audio/Sfx.js';
import { HUD } from '../ui/HUD.js';
import { ENEMY_SPAWNS, LOOT_SPAWNS, PLAYER_SPAWN } from '../world/mapLayout.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Top-level game object: owns the renderer, the scene and every system,
 * runs the main loop and the match state machine
 * (menu -> loading -> playing <-> paused -> ended).
 */
export class Game {
  constructor(canvas, settings, ui) {
    this.canvas = canvas;
    this.settings = settings;
    this.ui = ui;
    this.state = 'menu';
    this.time = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this._applyQuality();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1600);
    this.input = new Input(canvas);
    this.audio = new Sfx();
    this.audio.setVolume(settings.volume);

    window.addEventListener('resize', () => this._resize());
    this._resize();

    this.input.onLockChange = (locked) => {
      this.hud?.setClickToPlay(!locked && this.state === 'playing');
      if (!locked && this.state === 'playing' && this._hadLock) this.pause();
      if (locked) this._hadLock = true;
    };
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      if (e.code === 'KeyP' || (e.code === 'Escape' && !this.input.locked)) this.pause();
    });

    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _applyQuality() {
    const high = this.settings.quality !== 'low';
    this.quality = { high, shadows: high };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    if (this.world?.sun) {
      this.world.sun.castShadow = this.quality.shadows;
      this.scene.traverse((o) => {
        if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
      });
    }
  }

  applySettings() {
    this.audio.setVolume(this.settings.volume);
    this._applyQuality();
    this._resize();
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ loading
  async load(onProgress) {
    this.state = 'loading';
    const started = performance.now();
    const steps = [];
    if (!this.world) {
      this.world = new World(this.scene, this.quality);
      steps.push(...this.world.steps());
      steps.push(['CALIBRATING SAFE ZONE', () => (this.zone = new SafeZone(this.scene))]);
      steps.push(['WARMING UP EFFECTS', () => (this.effects = new Effects(this.scene))]);
      steps.push(['BUILDING HUD', () => (this.hud = new HUD(this))]);
    }
    steps.push(['DEPLOYING SURVIVORS', () => this._setupMatch()]);
    steps.push(['COMPILING SHADERS', () => this.renderer.compile(this.scene, this.camera)]);

    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i];
      onProgress(i / steps.length, label);
      await nextFrame();
      fn();
    }
    // keep the bar on screen long enough to read, even on fast machines
    const minTime = 1800;
    const elapsed = performance.now() - started;
    const remaining = Math.max(0, minTime - elapsed);
    const ticks = 8;
    for (let k = 1; k <= ticks; k++) {
      await wait(remaining / ticks);
      onProgress(0.85 + (0.15 * k) / ticks, 'ENTERING VALLEY');
    }
    onProgress(1, 'READY');
  }

  _setupMatch() {
    // clear previous match
    if (this.enemies) for (const e of this.enemies) this.scene.remove(e.root);
    if (this.player) this.scene.remove(this.player.root);
    if (this.loot) this.scene.remove(this.loot.group);
    this.world.physics.targets.clear();

    this.player = new Player(this);
    this.player.spawn(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw);
    this.scene.add(this.player.root);
    this.world.physics.addTarget(this.player);

    this.cam = new ThirdPersonCamera(this.camera, this.world.physics);
    this.cam.yaw = PLAYER_SPAWN.yaw;
    this.cam.pitch = -0.06;

    this.enemies = ENEMY_SPAWNS.map(([x, z], i) => {
      const e = new Enemy(this, x, z, i);
      this.scene.add(e.root);
      this.world.physics.addTarget(e);
      return e;
    });
    this.aliveCount = this.enemies.length + 1;

    this.loot = new LootManager(this);
    for (const [type, x, z] of LOOT_SPAWNS) this.loot.spawn(type, x, z);

    this.zone.outsideTime = 0;
    this.matchTime = 0;
    // place the camera once so the first rendered frame is correct
    this.cam.update(0.016, this.input, this.player.pos, this.settings, false);
  }

  start() {
    this.state = 'playing';
    this.input.enabled = true;
    this._hadLock = false;
    this.hud.reset();
    this.hud.show();
    this.hud.setClickToPlay(!this.input.locked);
    this.input.requestLock();
    this.audio.startAmbience();
    this._last = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.keys.clear();
    this.input.mouse.left = this.input.mouse.right = false;
    this._hadLock = false;
    this.input.exitLock();
    this.ui.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hidePause();
    this.input.requestLock();
    this._last = performance.now();
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.exitLock();
    this.hud.hide();
    this.audio.stopAmbience();
  }

  // ------------------------------------------------------------ events
  onEnemyKilled(enemy) {
    this.aliveCount -= 1;
    this.player.kills += 1;
    const remaining = this.aliveCount - 1;
    this.hud.killBanner(remaining > 0 ? `${remaining} RIVAL${remaining === 1 ? '' : 'S'} LEFT` : 'VALLEY CLEARED');
    this.audio.eliminate();
    // rivals drop a little something
    const drop = Math.random() < 0.5 ? 'ammo' : enemy.index % 2 ? 'medkit' : 'armor';
    this.loot.spawn(drop, enemy.pos.x + 0.8, enemy.pos.z + 0.4);
    if (this.aliveCount <= 1 && this.player.alive) {
      setTimeout(() => this._end(true), 1600);
    }
  }

  onPlayerDeath() {
    this.audio.defeat();
    this.hud.toast('YOU WERE ELIMINATED', 'warn');
    setTimeout(() => this._end(false), 1800);
  }

  _end(victory) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = 'ended';
    this.input.enabled = false;
    this.input.keys.clear();
    this.input.mouse.left = this.input.mouse.right = false;
    this.input.exitLock();
    if (victory) this.audio.victory();
    const rank = victory ? 1 : this.aliveCount;
    this.ui.showEnd({
      victory,
      rank,
      kills: this.player.kills,
      time: this.matchTime,
    });
  }

  // ------------------------------------------------------------ loop
  _frame() {
    const now = performance.now();
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;
    if (this.state === 'playing') this._update(dt);
    else if (this.state === 'ended' && this.world) {
      // keep the world alive behind the end screen
      this.time += dt;
      this.effects.update(dt);
      for (const e of this.enemies) e.update(dt, this.player);
      this.player.update(dt, this.input, this.cam);
      this.input.endFrame();
    }
    if (this.world && this.cam && this.state !== 'loading' && this.state !== 'menu') {
      this.world.update(dt, this.time, this.player.pos, this.camera.position);
      this.renderer.render(this.scene, this.camera);
    }
  }

  _update(dt) {
    this.time += dt;
    this.matchTime += dt;
    const input = this.input;
    const player = this.player;

    // interactions
    if (input.wasPressed('KeyE') && player.alive) {
      const item = this.loot.nearest(player.pos);
      if (item) {
        const msg = this.loot.pickup(item, player);
        if (msg) {
          this.hud.toast(msg, item.taken ? '' : 'warn');
          if (item.taken) this.audio.pickup();
        }
      }
    }
    if (input.wasPressed('KeyH')) {
      if (!player.startHeal() && player.medkits === 0) this.hud.toast('NO MEDKITS', 'warn');
    }

    player.update(dt, input, this.cam);
    this.cam.update(dt, input, player.pos, this.settings, player.aiming);

    this.enemies = this.enemies.filter((e) => {
      const keep = e.update(dt, player);
      if (!keep) this.scene.remove(e.root);
      return keep;
    });
    this.loot.update(dt);
    this.zone.update(dt, this.time, player, this);
    this.effects.update(dt);
    this.hud.update(dt);
    input.endFrame();
  }
}
