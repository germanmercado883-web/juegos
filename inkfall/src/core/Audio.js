/**
 * All sound is synthesised with Web Audio: no files. Battle sounds are
 * attenuated by distance to the camera and rate-limited so big fights
 * stay readable.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.musicVolume = 0.5;
    this.listenerX = 0;
    this.last = {};
  }

  init() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus) this.musicBus.gain.value = v;
  }

  get ok() {
    return !!this.ctx;
  }

  _gate(name, ms) {
    const now = performance.now();
    if (now - (this.last[name] || 0) < ms) return false;
    this.last[name] = now;
    return true;
  }

  _att(u) {
    if (!u || u.x === undefined) return 1;
    const d = Math.abs(u.x - this.listenerX);
    return Math.max(0, 1 - d / 1300);
  }

  _noise(dur, { type = 'lowpass', freq = 2000, q = 0.8, gain = 0.4, when = 0, freqEnd = null, attack = 0.003, bus = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus || this.sfx);
    src.start(t, Math.random() * 0.6);
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.3, freqEnd = null, when = 0, attack = 0.005, bus = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ battle sfx
  clash(u) {
    if (!this.ok || !this._gate('clash', 45)) return;
    const a = this._att(u);
    if (a <= 0.02) return;
    const f = 2200 + Math.random() * 1600;
    this._noise(0.09, { type: 'bandpass', freq: f, q: 3, gain: 0.32 * a });
    this._tone(f * 0.45, 0.14, { type: 'triangle', gain: 0.07 * a });
  }

  bow(u) {
    if (!this.ok || !this._gate('bow', 60)) return;
    const a = this._att(u);
    if (a <= 0.02) return;
    this._tone(180 + Math.random() * 40, 0.12, { type: 'triangle', freqEnd: 90, gain: 0.16 * a });
    this._noise(0.18, { type: 'bandpass', freq: 1200, freqEnd: 3000, q: 1, gain: 0.08 * a, when: 0.02 });
  }

  mine(u) {
    if (!this.ok || !this._gate('mine', 70)) return;
    const a = this._att(u);
    if (a <= 0.05) return;
    this._tone(1700 + Math.random() * 500, 0.07, { type: 'square', gain: 0.03 * a });
    this._noise(0.05, { type: 'highpass', freq: 3000, gain: 0.06 * a });
  }

  coin() {
    if (!this.ok || !this._gate('coin', 80)) return;
    this._tone(1320, 0.07, { type: 'triangle', gain: 0.07 });
    this._tone(1760, 0.1, { type: 'triangle', gain: 0.07, when: 0.05 });
  }

  death(u) {
    if (!this.ok || !this._gate('death', 50)) return;
    const a = this._att(u);
    if (a <= 0.02) return;
    this._noise(0.16, { freq: 500, gain: 0.25 * a });
    this._tone(u?.undead ? 300 : 140, 0.2, { type: 'sine', freqEnd: 60, gain: 0.18 * a });
  }

  cast(u) {
    if (!this.ok) return;
    const a = this._att(u);
    this._noise(0.45, { type: 'bandpass', freq: 400, freqEnd: 2400, q: 2, gain: 0.18 * a });
  }

  boom(p) {
    if (!this.ok || !this._gate('boom', 60)) return;
    const a = this._att(p);
    this._noise(0.6, { freq: 900, freqEnd: 80, gain: 0.5 * a });
    this._tone(70, 0.4, { type: 'sine', freqEnd: 35, gain: 0.4 * a });
  }

  slam(u) {
    if (!this.ok) return;
    const a = this._att(u);
    this._tone(55, 0.45, { type: 'sine', freqEnd: 30, gain: 0.55 * a });
    this._noise(0.35, { freq: 300, gain: 0.35 * a });
  }

  stone() {
    if (!this.ok || !this._gate('stone', 90)) return;
    this._noise(0.12, { freq: 600, gain: 0.18 });
  }

  crumble() {
    if (!this.ok) return;
    this._noise(1.8, { freq: 500, freqEnd: 60, gain: 0.7 });
    this._tone(45, 1.4, { type: 'sine', freqEnd: 25, gain: 0.5 });
  }

  heal(u) {
    if (!this.ok || !this._gate('heal', 300)) return;
    const a = this._att(u);
    [880, 1100, 1320].forEach((f, i) => this._tone(f, 0.2, { type: 'sine', gain: 0.05 * a, when: i * 0.05 }));
  }

  click() {
    if (!this.ok) return;
    this._tone(660, 0.05, { type: 'triangle', gain: 0.1 });
  }

  upgrade() {
    if (!this.ok) return;
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.18, { type: 'triangle', gain: 0.12, when: i * 0.06 }));
  }

  horn(big = false) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime;
    const dur = big ? 2.4 : 1.4;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.sfx);
    for (const fr of big ? [98, 147, 196] : [147, 220]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(fr * 0.95, t);
      o.frequency.linearRampToValueAtTime(fr, t + 0.25);
      o.connect(f);
      o.start(t);
      o.stop(t + dur);
    }
  }

  victory() {
    if (!this.ok) return;
    [392, 523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.45, { type: 'triangle', gain: 0.16, when: i * 0.13 }));
  }

  defeat() {
    if (!this.ok) return;
    [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.5, { type: 'sine', gain: 0.16, when: i * 0.2 }));
  }

  // ------------------------------------------------------------ music
  /** mode: 'battle' (war drums) | 'menu' (calm march) | null */
  music(mode) {
    if (!this.ok || this.musicMode === mode) return;
    this.musicMode = mode;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (!mode) return;
    const c = this.ctx;
    const bus = this.musicBus;
    const bpm = mode === 'battle' ? 112 : 84;
    const step = 60 / bpm / 2;
    let i = 0;
    let next = c.currentTime + 0.1;
    const roots = mode === 'battle' ? [45, 45, 43, 41] : [50, 46, 43, 45];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const drum = (t, f, g, d) => {
      const o = c.createOscillator();
      const gn = c.createGain();
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.4, t + d);
      gn.gain.setValueAtTime(g, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(gn).connect(bus);
      o.start(t);
      o.stop(t + d + 0.05);
    };
    const pad = (t, m, d, g) => {
      for (const iv of [0, 7, 12]) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(m + iv);
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 700;
        const gn = c.createGain();
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.linearRampToValueAtTime(g, t + 0.4);
        gn.gain.linearRampToValueAtTime(0.0001, t + d);
        o.connect(f).connect(gn).connect(bus);
        o.start(t);
        o.stop(t + d + 0.1);
      }
    };
    const tick = () => {
      while (next < c.currentTime + 0.5) {
        const s = i % 16;
        const bar = Math.floor(i / 16) % 4;
        if (s === 0) pad(next, roots[bar], step * 16, mode === 'battle' ? 0.035 : 0.05);
        if (mode === 'battle') {
          if (s % 8 === 0 || s === 11) drum(next, 70, 0.5, 0.35);
          if (s === 4 || s === 12) drum(next, 140, 0.3, 0.25);
          if (s % 2 === 1) drum(next, 300, 0.05, 0.05);
          if (s === 14 || s === 15) drum(next, 180, 0.22, 0.15);
        } else {
          if (s % 8 === 0) drum(next, 80, 0.3, 0.4);
          if (s === 6 || s === 14) drum(next, 160, 0.12, 0.2);
          if (s % 4 === 2) {
            const o = c.createOscillator();
            const gn = c.createGain();
            o.type = 'triangle';
            o.frequency.value = hz(roots[bar] + 24 + [0, 7, 12, 7][(s / 4) | 0]);
            gn.gain.setValueAtTime(0.03, next);
            gn.gain.exponentialRampToValueAtTime(0.0001, next + 0.4);
            o.connect(gn).connect(bus);
            o.start(next);
            o.stop(next + 0.45);
          }
        }
        next += step;
        i++;
      }
    };
    tick();
    this.musicTimer = setInterval(tick, 150);
  }
}
