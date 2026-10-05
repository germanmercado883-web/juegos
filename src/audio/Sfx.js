/**
 * Procedural sound effects with the Web Audio API. Nothing is loaded from
 * disk: every sound is synthesised from noise and oscillators.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
  }

  /** Must be called from a user gesture (PLAY click). */
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
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // outdoor slap-back: decaying noise impulse on a send bus
    const ir = this.ctx.createBuffer(2, this.ctx.sampleRate * 1.6, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 900 ? 0.2 : 1);
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = ir;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.32;
    this.wet.connect(conv).connect(this.master);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _noise(dur, { type = 'lowpass', freq = 2000, q = 0.7, gain = 0.5, attack = 0.002, when = 0, freqEnd = null, wet = false } = {}) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    if (wet && this.wet) g.connect(this.wet);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.3, freqEnd = null, when = 0, attack = 0.005, wet = false } = {}) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    if (wet && this.wet) g.connect(this.wet);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  get ok() {
    return !!this.ctx;
  }

  shot(profile = { pitch: 1, body: 1 }, vol = 1) {
    if (!this.ok) return;
    const p = profile.pitch;
    this._noise(0.16 / p, { freq: 3800 * p, freqEnd: 500, gain: 0.55 * vol, wet: true });
    this._noise(0.05, { type: 'highpass', freq: 2500, gain: 0.35 * vol });
    this._tone(140 * p, 0.12 * profile.body, { type: 'triangle', freqEnd: 45, gain: 0.5 * profile.body * vol, wet: true });
  }

  enemyShot(distance) {
    if (!this.ok) return;
    const vol = Math.max(0.05, 1 - distance / 120) * 0.55;
    this._noise(0.22, { freq: 1600, freqEnd: 300, gain: vol, wet: true });
    this._tone(110, 0.14, { type: 'triangle', freqEnd: 40, gain: vol * 0.6 });
  }

  hit(head = false) {
    if (!this.ok) return;
    this._tone(head ? 1500 : 1100, 0.06, { type: 'square', gain: 0.08 });
    if (head) this._tone(2200, 0.08, { type: 'sine', gain: 0.12, when: 0.03 });
  }

  impactNear() {
    if (!this.ok) return;
    this._noise(0.08, { type: 'bandpass', freq: 2800, q: 2, gain: 0.25 });
  }

  hurt() {
    if (!this.ok) return;
    this._noise(0.12, { freq: 600, gain: 0.35 });
    this._tone(180, 0.15, { type: 'sawtooth', freqEnd: 90, gain: 0.12 });
  }

  pickup() {
    if (!this.ok) return;
    this._tone(660, 0.08, { type: 'triangle', gain: 0.25 });
    this._tone(990, 0.12, { type: 'triangle', gain: 0.25, when: 0.07 });
  }

  equip() {
    if (!this.ok) return;
    this._noise(0.06, { type: 'bandpass', freq: 1800, q: 3, gain: 0.3 });
    this._noise(0.05, { type: 'bandpass', freq: 1200, q: 3, gain: 0.3, when: 0.09 });
  }

  reload() {
    if (!this.ok) return;
    this._noise(0.07, { type: 'bandpass', freq: 1400, q: 4, gain: 0.35 });
    this._noise(0.06, { type: 'bandpass', freq: 2200, q: 4, gain: 0.35, when: 0.55 });
    this._noise(0.08, { type: 'bandpass', freq: 1000, q: 4, gain: 0.4, when: 1.1 });
  }

  dryFire() {
    if (!this.ok) return;
    this._noise(0.03, { type: 'bandpass', freq: 3000, q: 5, gain: 0.3 });
  }

  jump() {
    if (!this.ok) return;
    this._noise(0.18, { type: 'bandpass', freq: 500, freqEnd: 1400, q: 1.2, gain: 0.18 });
  }

  chute() {
    if (!this.ok) return;
    this._noise(0.35, { type: 'bandpass', freq: 300, freqEnd: 1200, q: 0.8, gain: 0.4 });
    this._noise(0.2, { type: 'highpass', freq: 2000, gain: 0.15, when: 0.08 });
  }

  land() {
    if (!this.ok) return;
    this._noise(0.12, { freq: 400, gain: 0.3 });
  }

  step() {
    if (!this.ok) return;
    this._noise(0.06, { freq: 700 + Math.random() * 300, gain: 0.07 });
  }

  eliminate() {
    if (!this.ok) return;
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.18, { type: 'triangle', gain: 0.2, when: i * 0.07 }));
  }

  zoneTick() {
    if (!this.ok) return;
    this._tone(220, 0.15, { type: 'square', gain: 0.05, freqEnd: 180 });
  }

  victory() {
    if (!this.ok) return;
    [392, 523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.35, { type: 'triangle', gain: 0.22, when: i * 0.12 }));
  }

  defeat() {
    if (!this.ok) return;
    [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.4, { type: 'sine', gain: 0.22, when: i * 0.16 }));
  }

  /** Soft looping wind bed for atmosphere. */
  startAmbience() {
    if (!this.ok || this.wind) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = c.createGain();
    g.gain.value = 0.05;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(f.frequency);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.wind = { src, lfo };
  }

  stopAmbience() {
    if (!this.wind) return;
    this.wind.src.stop();
    this.wind.lfo.stop();
    this.wind = null;
  }
}
