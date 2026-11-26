/**
 * Motor de audio compartido por efectos y música (Web Audio).
 * El navegador solo deja sonar audio tras una interacción, así que el contexto
 * se crea (o se reanuda) en el primer clic o tecla.
 */

export type Bus = 'sfx' | 'music';

const KEYS: Record<Bus, string> = {
  sfx: 'boom-monsters:muted',
  music: 'boom-monsters:music-off',
};
const VOLUME: Record<Bus, number> = { sfx: 0.5, music: 0.28 };

class AudioEngine {
  ctx: AudioContext | null = null;
  private buses: Partial<Record<Bus, GainNode>> = {};
  private noiseBuf: AudioBuffer | null = null;
  private readonly off: Record<Bus, boolean> = {
    sfx: localStorage.getItem(KEYS.sfx) === '1',
    music: localStorage.getItem(KEYS.music) === '1',
  };
  private readonly listeners: (() => void)[] = [];

  constructor() {
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  isOff(bus: Bus): boolean {
    return this.off[bus];
  }

  setOff(bus: Bus, off: boolean): void {
    this.off[bus] = off;
    localStorage.setItem(KEYS[bus], off ? '1' : '0');
    const g = this.buses[bus];
    if (g && this.ctx) g.gain.setTargetAtTime(off ? 0 : VOLUME[bus], this.ctx.currentTime, 0.05);
  }

  /** Avisa cuando el audio queda desbloqueado (para arrancar la música). */
  onReady(fn: () => void): void {
    this.listeners.push(fn);
  }

  ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;
      for (const bus of ['sfx', 'music'] as Bus[]) {
        const g = ctx.createGain();
        g.gain.value = this.off[bus] ? 0 : VOLUME[bus];
        g.connect(ctx.destination);
        this.buses[bus] = g;
      }
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running') this.listeners.forEach((fn) => fn());
      });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Contexto listo para sonar en ese canal, o null si está silenciado o bloqueado. */
  ready(bus: Bus): AudioContext | null {
    if (this.off[bus] || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  tone(bus: Bus, freq: number, endFreq: number, dur: number, wave: OscillatorType, vol: number, at?: number): void {
    const ctx = this.ready(bus);
    const out = this.buses[bus];
    if (!ctx || !out) return;
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(bus: Bus, dur: number, cutoff: number, endCutoff: number, vol: number, at?: number): void {
    const ctx = this.ready(bus);
    const out = this.buses[bus];
    if (!ctx || !out || !this.noiseBuf) return;
    const t = at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(endCutoff, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioEngine();
