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
import { DropSequence } from '../systems/DropSequence.js';
import { PostFX } from '../systems/PostFX.js';
import { Airdrop } from '../systems/Airdrop.js';
import { Lobby } from '../ui/Lobby.js';
import { Grenades } from '../weapons/Grenades.js';
import { VehicleManager } from '../vehicles/Vehicle.js';
import { setMaxAnisotropy } from '../world/Textures.js';
import { preloadSurvivor } from '../entities/SurvivorModel.js';
import { TouchControls, isTouchDevice } from '../ui/TouchControls.js';
import { angleDiff } from '../utils/math.js';
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
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this._applyQuality();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1600);
    this.input = new Input(canvas);
    this.audio = new Sfx();
    this.audio.setVolume(settings.volume);

    window.addEventListener('resize', () => this._resize());
    this._resize();

    this.input.onLockChange = (locked) => {
      this.hud?.setClickToPlay(!locked && this.state === 'playing' && !this.touch);
      if (!locked && this.state === 'playing' && this._hadLock) this.pause();
      if (locked) this._hadLock = true;
    };
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      if (e.code === 'KeyP' || (e.code === 'Escape' && !this.input.locked)) this.pause();
    });

    this.touch = isTouchDevice() ? new TouchControls(this) : null;
    this.lobby = new Lobby(this.renderer);

    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _applyQuality() {
    const q = this.settings.quality;
    const high = q === 'high';
    this.quality = { high, shadows: q !== 'low' };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : q === 'medium' ? 1.25 : 1));
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
    this.postfx?.setSize(w, h, this.renderer.getPixelRatio());
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
      steps.push(['TRAINING SURVIVORS', () => preloadSurvivor()]);
      steps.push(['CALIBRATING SAFE ZONE', () => (this.zone = new SafeZone(this.scene, this.world.terrain))]);
      steps.push(['FUELING THE PLANE', () => {
        this.drop = new DropSequence(this);
        this.airdrop = new Airdrop(this);
        this.grenades = new Grenades(this);
        this.vehicles = new VehicleManager(this);
      }]);
      steps.push(['GRADING COLORS', () => {
        this.postfx = new PostFX(this.renderer, this.scene, this.camera);
        this._resize();
      }]);
      steps.push(['WARMING UP EFFECTS', () => (this.effects = new Effects(this.scene))]);
      steps.push(['BUILDING HUD', () => (this.hud = new HUD(this))]);
    }
    steps.push(['DEPLOYING SURVIVORS', () => this._setupMatch()]);
    steps.push(['COMPILING SHADERS', () => this.renderer.compile(this.scene, this.camera)]);

    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i];
      onProgress(i / steps.length, label);
      await nextFrame();
      await fn();
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

    this.zone.reset();
    this.airdrop.reset();
    this.grenades.reset();
    this.vehicles.reset();
    this._engine?.stop();
    this._engine = null;
    this.zone.onEvent = (e) => {
      if (e === 'shrink') this.hud.toast('THE ZONE IS CLOSING!', 'warn');
      else {
        this.hud.toast('NEW SAFE ZONE MARKED ON MAP');
        if (this.zone.phase <= 2) this.airdrop.spawn();
      }
    };
    this._firstDropAt = 35; // seconds after landing
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
    this.hud.setClickToPlay(!this.input.locked && !this.touch);
    if (this.touch) this.touch.show(true);
    else this.input.requestLock();
    this.audio.startAmbience();
    this.drop.begin(this.player);
    this._last = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.keys.clear();
    this.input.mouse.left = this.input.mouse.right = false;
    this._hadLock = false;
    this.input.exitLock();
    this.touch?.show(false);
    this.ui.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hidePause();
    if (this.touch) this.touch.show(true);
    else this.input.requestLock();
    this._last = performance.now();
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.exitLock();
    this.hud.hide();
    this.touch?.show(false);
    this.audio.stopAmbience();
  }

  // ------------------------------------------------------------ events
  onEnemyKilled(enemy, killer) {
    this.aliveCount -= 1;
    const remaining = this.aliveCount - 1;
    const byPlayer = killer === this.player;
    if (byPlayer) {
      this.player.kills += 1;
      this.hud.killBanner(remaining > 0 ? `${remaining} RIVAL${remaining === 1 ? '' : 'S'} LEFT` : 'VALLEY CLEARED');
      this.hud.killFeed('YOU', enemy.name, this.player.weapons.active.def.name);
      this.audio.eliminate();
      this.haptic([20, 40, 30]);
    } else if (killer && killer.isEnemy) {
      const gun = { hornet: 'PX-4 HORNET', strider: 'RK-7 STRIDER' }[killer.model.weaponId] || 'RIFLE';
      this.hud.killFeed(killer.name, enemy.name, gun);
    } else {
      this.hud.killFeed('ZONE', enemy.name, null);
    }
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
    this.touch?.show(false);
    if (victory) this.audio.victory();
    const rank = victory ? 1 : this.aliveCount;
    this.ui.showEnd({
      victory,
      rank,
      kills: this.player.kills,
      time: this.matchTime,
      stats: this.player.stats,
    });
  }

  _toggleVehicle() {
    const p = this.player;
    if (p.vehicle) {
      const v = p.vehicle;
      v.driver = null;
      p.vehicle = null;
      // step out on the left side
      const side = new THREE.Vector3(-1.9, 0, 0).applyEuler(new THREE.Euler(0, v.yaw, 0));
      p.pos.copy(v.pos).add(side);
      p.pos.y = this.world.physics.groundHeight(p.pos.x, p.pos.z, p.pos.y + 1);
      this.world.physics.resolveCircle(p.pos, p.pos.y, 1.8, 0.38);
      p.vel.set(0, 0, 0);
      p.root.rotation.set(0, p.facing, 0);
      this.cam.distance = 4.2;
      this._engine?.stop();
      this._engine = null;
      this.hud.setSpeed(null);
      return;
    }
    const v = this.vehicles.nearest(p.pos);
    if (!v) return;
    v.driver = p;
    p.vehicle = v;
    p.crouching = false;
    p.healing = 0;
    this.cam.distance = 7.5;
    this._engine = this.audio.engine();
    this.hud.toast(this.touch ? 'JOYSTICK: DRIVE & STEER · JUMP: BRAKE' : 'W/S DRIVE · A/D STEER · SPACE BRAKE · F EXIT');
  }

  /** Short vibration on phones that support it. */
  haptic(pattern) {
    if (!this.touch) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported */
    }
  }

  /**
   * Touch-friendly aim assist: while firing or aiming, gently pull the
   * crosshair towards a visible rival close to it.
   */
  _aimAssist(dt) {
    const p = this.player;
    if (!this.settings.aimAssist || p.phase !== 'ground' || !p.alive) return;
    if (!this.input.mouse.left && !p.aiming) return;
    const cam = this.cam;
    const from = this.camera.position;
    const fwd = cam.forward();
    let best = null;
    let bestAng = 0.14;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const t = { x: e.pos.x, y: e.pos.y + (e.model ? 1.25 : 1.2), z: e.pos.z };
      const dx = t.x - from.x;
      const dy = t.y - from.y;
      const dz = t.z - from.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 110) continue;
      const ang = Math.acos(Math.min(1, (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d));
      if (ang < bestAng && this.world.physics.lineOfSight(from, t)) {
        bestAng = ang;
        best = { dx, dy, dz };
      }
    }
    if (!best) return;
    const k = Math.min(1, dt * (p.aiming ? 7 : 4.5));
    const yaw = Math.atan2(-best.dx, -best.dz);
    const pitch = Math.atan2(best.dy, Math.hypot(best.dx, best.dz));
    cam.yaw += angleDiff(cam.yaw, yaw) * k;
    cam.pitch += (pitch - cam.pitch) * k;
  }

  /** Lower/raise the render resolution to hold a smooth frame rate. */
  _adaptResolution(dt) {
    this._ema = this._ema === undefined ? dt : this._ema * 0.95 + dt * 0.05;
    this._resTimer = (this._resTimer || 0) + dt;
    if (this._resTimer < 1.5 || this.state !== 'playing') return;
    this._resTimer = 0;
    const dpr = window.devicePixelRatio || 1;
    const max = this.quality.high ? Math.min(dpr, 2) : Math.min(dpr, 1.25);
    const pr = this.renderer.getPixelRatio();
    let next = pr;
    if (this._ema > 1 / 38) next = Math.max(0.5, pr - 0.15);
    else if (this._ema < 1 / 56) next = Math.min(max, pr + 0.1);
    if (Math.abs(next - pr) > 0.01) {
      this.renderer.setPixelRatio(next);
      this._resize();
    }
  }

  // ------------------------------------------------------------ loop
  _frame() {
    const now = performance.now();
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;
    this._adaptResolution(dt);
    if (this.state === 'playing') this._update(dt);
    else if (this.state === 'ended' && this.world) {
      // keep the world alive behind the end screen
      this.time += dt;
      this.effects.update(dt);
      for (const e of this.enemies) e.update(dt, this.player);
      this.player.update(dt, this.input, this.cam);
      this.input.endFrame();
    }
    if (this.state === 'menu' || (this.state === 'loading' && !this.world?.sun)) {
      this.lobby.render(dt);
    } else if (this.world && this.cam && this.state !== 'loading') {
      this.world.update(dt, this.time, this.player.pos, this.camera.position);
      if (this.postfx && this.quality.high) this.postfx.render();
      else this.renderer.render(this.scene, this.camera);
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
    if (input.wasPressed('KeyF') && player.phase === 'ground' && player.alive) this._toggleVehicle();
    if (input.wasPressed('KeyG') && player.phase === 'ground' && !player.vehicle) {
      if (!this.grenades.throw(player, this.cam)) this.hud.toast('NO GRENADES', 'warn');
    }
    if (input.wasPressed('KeyH')) {
      if (!player.startHeal() && player.medkits === 0) this.hud.toast('NO MEDKITS', 'warn');
    }

    this.drop.update(dt);
    this.vehicles.update(dt, input);
    player.update(dt, input, this.cam);
    if (player.vehicle) {
      this._engine?.setSpeed(player.vehicle.speed);
      this.hud.setSpeed(Math.round(Math.abs(player.vehicle.speed) * 3.6));
    }
    this._aimAssist(dt);
    if (player.vehicle && input.mouse.dx === 0 && Math.abs(player.vehicle.speed) > 2) {
      // chase cam settles behind the buggy when the player isn't looking around
      this.cam.yaw += angleDiff(this.cam.yaw, player.vehicle.yaw) * Math.min(1, dt * 1.8);
    }
    const scoped = player.aiming && !!player.weapons.active.def.scope && player.phase === 'ground';
    player.root.visible = !scoped && player.phase !== 'plane';
    this.cam.update(dt, input, player.pos, this.settings, player.aiming, player.crouching, scoped);
    this.hud.setScope(scoped);

    this.enemies = this.enemies.filter((e) => {
      const keep = e.update(dt, player);
      if (!keep) this.scene.remove(e.root);
      return keep;
    });
    this.loot.update(dt);
    this.airdrop.update(dt);
    this.grenades.update(dt);
    if (this.zone.running && this._firstDropAt !== null) {
      this._firstDropAt -= dt;
      if (this._firstDropAt <= 0) {
        this._firstDropAt = null;
        this.airdrop.spawn();
      }
    }
    this.zone.update(dt, this.time, player, this);
    this.effects.update(dt);
    this.hud.update(dt);
    input.endFrame();
  }
}
