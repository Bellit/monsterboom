/**
 * Efectos de sonido retro sintetizados con Web Audio: sin ficheros ni licencias.
 * El navegador solo deja sonar audio tras una interacción, así que el contexto
 * se crea (o se reanuda) en el primer clic o tecla.
 */

type Wave = OscillatorType;

const STORAGE_KEY = 'boom-monsters:muted';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlay = new Map<string, number>();
  muted = localStorage.getItem(STORAGE_KEY) === '1';

  constructor() {
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Evita que muchos sonidos iguales a la vez saturen (p. ej. 6 explosiones juntas). */
  private throttle(name: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? 0) < ms) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private tone(freq: number, endFreq: number, dur: number, wave: Wave, vol = 0.3, delay = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, cutoff: number, endCutoff: number, vol = 0.5): void {
    const ctx = this.ready();
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(endCutoff, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  place(): void {
    this.tone(220, 110, 0.08, 'square', 0.15);
  }

  explode(): void {
    if (!this.throttle('explode', 60)) return;
    this.noise(0.6, 2200, 80, 0.7);
    this.tone(110, 30, 0.4, 'sine', 0.5);
  }

  pickup(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.07, 'square', 0.12, i * 0.05));
  }

  curse(): void {
    this.tone(400, 90, 0.5, 'sawtooth', 0.15);
    this.tone(410, 95, 0.5, 'sawtooth', 0.1, 0.03);
  }

  death(): void {
    this.tone(700, 60, 0.7, 'square', 0.18);
  }

  shield(): void {
    this.tone(1400, 700, 0.25, 'triangle', 0.25);
    this.noise(0.15, 6000, 2000, 0.2);
  }

  teleport(): void {
    this.tone(200, 1600, 0.25, 'sine', 0.2);
  }

  kick(): void {
    this.tone(160, 60, 0.12, 'square', 0.2);
  }

  throw(): void {
    this.noise(0.2, 400, 3000, 0.25);
  }

  land(): void {
    this.tone(120, 50, 0.1, 'sine', 0.35);
  }

  countdown(go: boolean): void {
    this.ensure();
    if (go) this.tone(880, 880, 0.35, 'square', 0.15);
    else this.tone(440, 440, 0.15, 'square', 0.12);
  }

  alarm(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(600, 900, 0.18, 'sawtooth', 0.12, i * 0.25);
      this.tone(900, 600, 0.06, 'sawtooth', 0.12, i * 0.25 + 0.18);
    }
  }

  win(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, f, 0.14, 'square', 0.13, i * 0.11));
  }
}

export const sfx = new Sfx();
