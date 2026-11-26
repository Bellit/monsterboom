import { audio } from './engine';

/** Efectos de sonido retro sintetizados: sin ficheros ni licencias. */
class Sfx {
  private lastPlay = new Map<string, number>();

  /** Evita que muchos sonidos iguales a la vez saturen (p. ej. 6 explosiones juntas). */
  private throttle(name: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? 0) < ms) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  private tone(freq: number, endFreq: number, dur: number, wave: OscillatorType, vol = 0.3, delay = 0): void {
    const ctx = audio.ready('sfx');
    if (!ctx) return;
    audio.tone('sfx', freq, endFreq, dur, wave, vol, ctx.currentTime + delay);
  }

  private noise(dur: number, cutoff: number, endCutoff: number, vol = 0.5): void {
    audio.noise('sfx', dur, cutoff, endCutoff, vol);
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
    audio.ensure();
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

  enemyDeath(): void {
    if (!this.throttle('enemyDeath', 50)) return;
    this.tone(900, 200, 0.18, 'square', 0.14);
    this.tone(1200, 400, 0.12, 'triangle', 0.1, 0.05);
  }

  bossHit(): void {
    this.tone(180, 60, 0.3, 'sawtooth', 0.25);
    this.noise(0.2, 3000, 500, 0.3);
  }

  doorOpen(): void {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.2, i * 0.08));
  }

  select(): void {
    this.tone(660, 990, 0.08, 'square', 0.1);
  }
}

export const sfx = new Sfx();
