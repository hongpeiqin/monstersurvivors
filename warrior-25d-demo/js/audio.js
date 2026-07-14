export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.musicTimer = null;
    this.measure = 0;
    this.started = false;
    this.noiseBuffer = null;
  }

  async ensure() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoiseBuffer();
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startMusic();
    }
    return true;
  }

  applySettings() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const muted = this.settings.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(muted, now, 0.02);
    this.bgmGain.gain.setTargetAtTime(this.settings.bgm, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx, now, 0.02);
  }

  makeNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 0.6);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.78 + white * 0.22;
      data[i] = last;
    }
    return buffer;
  }

  tone({ freq = 220, endFreq = freq, duration = 0.12, gain = 0.18, type = 'sine', when = 0, destination = this.sfxGain }) {
    if (!this.ctx || !destination) return;
    const start = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + Math.min(0.015, duration * 0.2));
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  noise({ duration = 0.12, gain = 0.12, highpass = 500, lowpass = 9000, when = 0 }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const start = this.ctx.currentTime + when;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(Math.max(0.0001, gain), start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(hp);
    hp.connect(lp);
    lp.connect(amp);
    amp.connect(this.sfxGain);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  swing(combo = 1) {
    if (!this.ctx) return;
    const base = [520, 650, 780][Math.min(2, combo - 1)];
    this.noise({ duration: 0.13, gain: 0.09 + combo * 0.018, highpass: 1100, lowpass: 8200 });
    this.tone({ freq: base, endFreq: 120, duration: 0.16, gain: 0.12, type: 'sawtooth' });
  }

  hit(heavy = false) {
    if (!this.ctx) return;
    this.noise({ duration: heavy ? 0.2 : 0.1, gain: heavy ? 0.21 : 0.13, highpass: 120, lowpass: heavy ? 2200 : 4200 });
    this.tone({ freq: heavy ? 130 : 220, endFreq: 55, duration: heavy ? 0.22 : 0.11, gain: heavy ? 0.2 : 0.11, type: 'triangle' });
    if (heavy) this.tone({ freq: 660, endFreq: 210, duration: 0.18, gain: 0.07, type: 'square', when: 0.015 });
  }

  skill(kind) {
    if (!this.ctx) return;
    if (kind === 'slash') {
      this.noise({ duration: 0.28, gain: 0.17, highpass: 700, lowpass: 8500 });
      this.tone({ freq: 980, endFreq: 95, duration: 0.34, gain: 0.16, type: 'sawtooth' });
      this.tone({ freq: 220, endFreq: 420, duration: 0.24, gain: 0.08, type: 'sine' });
    } else if (kind === 'spin') {
      for (let i = 0; i < 4; i++) this.tone({ freq: 420 + i * 95, endFreq: 180 + i * 35, duration: 0.28, gain: 0.07, type: 'triangle', when: i * 0.055 });
      this.noise({ duration: 0.42, gain: 0.12, highpass: 600, lowpass: 6200 });
    } else if (kind === 'dash') {
      this.noise({ duration: 0.26, gain: 0.16, highpass: 900, lowpass: 7000 });
      this.tone({ freq: 180, endFreq: 820, duration: 0.22, gain: 0.13, type: 'sawtooth' });
    }
  }

  hurt() {
    if (!this.ctx) return;
    this.tone({ freq: 170, endFreq: 68, duration: 0.18, gain: 0.14, type: 'square' });
    this.noise({ duration: 0.12, gain: 0.1, highpass: 80, lowpass: 1800 });
  }

  death() {
    if (!this.ctx) return;
    this.tone({ freq: 280, endFreq: 45, duration: 0.45, gain: 0.18, type: 'sawtooth' });
    this.noise({ duration: 0.36, gain: 0.16, highpass: 60, lowpass: 1400 });
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const schedule = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const roots = [55, 65.41, 73.42, 49];
      const root = roots[this.measure % roots.length];
      const bar = 1.92;
      const notes = [1, 1.5, 2, 1.5, 2.25, 2, 1.5, 1.334];
      for (let i = 0; i < notes.length; i++) {
        const when = i * (bar / notes.length);
        this.tone({ freq: root * notes[i], endFreq: root * notes[i] * 0.997, duration: 0.18, gain: 0.026, type: 'triangle', when, destination: this.bgmGain });
      }
      this.tone({ freq: root, endFreq: root * 0.995, duration: bar * 0.92, gain: 0.055, type: 'sine', destination: this.bgmGain });
      this.tone({ freq: root * 2, endFreq: root * 1.98, duration: bar * 0.84, gain: 0.022, type: 'triangle', destination: this.bgmGain });
      for (let beat = 0; beat < 4; beat++) {
        this.tone({ freq: 82, endFreq: 48, duration: 0.12, gain: 0.045, type: 'sine', when: beat * bar / 4, destination: this.bgmGain });
      }
      this.measure++;
    };
    schedule();
    this.musicTimer = setInterval(schedule, 1800);
  }
}
