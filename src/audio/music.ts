import { audio } from './engine';
import { SONGS, type Song, type SongName, type Track } from './songs';

export type { SongName } from './songs';

/**
 * Secuenciador de música chiptune: toca en tiempo real los temas de
 * `songs.ts` con Web Audio. Sin ficheros ni licencias.
 */

const midiToFreq = (n: number) => 440 * 2 ** ((n - 69) / 12);

class Music {
  private song: Song | null = null;
  private name: SongName | null = null;
  private length = 0;
  private step = 0;
  private nextTime = 0;
  private tempo = 1;
  private timer: number | null = null;
  /** Tema al que volver cuando termina una melodía corta. */
  private after: SongName | null = null;

  constructor() {
    audio.onReady(() => this.restart());
  }

  get playing(): SongName | null {
    return this.name;
  }

  /** Toca un tema. Si ya está sonando, no lo reinicia (salvo `force`). */
  play(name: SongName, force = false): void {
    if (this.name === name && !force) return;
    this.name = name;
    this.song = SONGS[name];
    this.length = Math.max(...this.song.tracks.map((t) => t.notes.length));
    this.tempo = 1;
    this.after = null;
    this.restart();
  }

  /** Melodía corta (victoria, derrota) y después, si se indica, otro tema. */
  jingle(name: SongName, then: SongName | null = null): void {
    this.play(name, true);
    this.after = then;
  }

  stop(): void {
    this.name = null;
    this.song = null;
    this.after = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Acelera o frena el tema que suena (1 = normal). */
  setTempo(t: number): void {
    this.tempo = t;
  }

  private restart(): void {
    const ctx = audio.ctx;
    if (!this.song || !ctx || ctx.state !== 'running') return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  /** Programa las notas de los próximos ~120 ms (más preciso que un temporizador). */
  private schedule(): void {
    const ctx = audio.ctx;
    const song = this.song;
    if (!ctx || !song) return;
    // Si la pestaña estuvo dormida, no intentar recuperar el tiempo perdido.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    const stepDur = 60 / (song.bpm * this.tempo) / song.perBeat;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (song.loop === false && this.step >= this.length) {
        const then = this.after;
        this.stop();
        if (then) this.play(then);
        return;
      }
      for (const tr of song.tracks) {
        const n = tr.notes[this.step % tr.notes.length];
        if (n !== null && n !== undefined) this.note(tr, n, this.nextTime, stepDur * tr.gate);
      }
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private note(tr: Track, n: number, at: number, dur: number): void {
    switch (tr.inst) {
      case 'kick':
        audio.tone('music', 150, 40, 0.12, 'sine', tr.vol, at);
        break;
      case 'snare':
        audio.noise('music', 0.12, 5000, 1200, tr.vol, at);
        break;
      case 'hat':
        audio.noise('music', 0.03, 12000, 8000, tr.vol, at);
        break;
      default: {
        const f = midiToFreq(n);
        audio.tone('music', f, f, Math.max(0.04, dur), tr.inst, tr.vol, at);
      }
    }
  }
}

export const music = new Music();
