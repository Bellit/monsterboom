import { audio } from './engine';

/**
 * Música chiptune generada en tiempo real: temas propios, escritos como notas
 * (números MIDI) y tocados por un secuenciador pequeño. Sin ficheros ni licencias.
 */

type Instrument = 'square' | 'triangle' | 'sawtooth' | 'kick' | 'snare' | 'hat';

interface Track {
  inst: Instrument;
  vol: number;
  /** Fracción del paso que suena cada nota (0..1). */
  gate: number;
  /** Una nota por paso; null = silencio. */
  notes: (number | null)[];
}

interface Song {
  bpm: number;
  /** Pasos por pulso (2 = corcheas, 4 = semicorcheas). */
  perBeat: number;
  tracks: Track[];
}

const _ = null;

/** Repite un patrón de un compás para cada fundamental. */
function perChord(roots: number[], pattern: (number | null)[]): (number | null)[] {
  return roots.flatMap((r) => pattern.map((o) => (o === null ? null : r + o)));
}

function drums(bars: number, kick: number[], snare: number[], hat: number[], steps = 8) {
  const make = (hits: number[]) =>
    Array.from({ length: bars * steps }, (_v, i) => (hits.includes(i % steps) ? 1 : null));
  return { kick: make(kick), snare: make(snare), hat: make(hat) };
}

// ---------- Batalla: La menor, enérgico (8 compases de corcheas) ----------
const battleRoots = [45, 41, 48, 43, 45, 41, 43, 40]; // Am F C G Am F G E
const battleLead = [
  76, _, 74, 76, _, 72, 69, _,
  72, _, 74, 72, _, 69, 65, _,
  67, _, 72, _, 76, _, 74, 72,
  71, _, 74, _, 79, _, 76, 74,
  81, _, 79, 76, _, 74, 76, _,
  77, _, 76, 74, _, 72, 74, _,
  74, _, 71, _, 67, _, 71, 74,
  76, _, 80, _, 83, _, 80, _,
];
const battleDrums = drums(8, [0, 4], [2, 6], [0, 1, 2, 3, 4, 5, 6, 7]);
const BATTLE: Song = {
  bpm: 150,
  perBeat: 2,
  tracks: [
    { inst: 'square', vol: 0.11, gate: 0.7, notes: battleLead },
    { inst: 'triangle', vol: 0.32, gate: 0.85, notes: perChord(battleRoots, [0, 12, 0, 12, 0, 12, 0, 12]) },
    { inst: 'square', vol: 0.035, gate: 0.4, notes: perChord(battleRoots.map((r) => r + 24), [0, 7, 12, 7, 0, 7, 12, 7]) },
    { inst: 'kick', vol: 0.5, gate: 1, notes: battleDrums.kick },
    { inst: 'snare', vol: 0.22, gate: 1, notes: battleDrums.snare },
    { inst: 'hat', vol: 0.06, gate: 1, notes: battleDrums.hat },
  ],
};

// ---------- Menú: La menor, misterioso y saltarín (4 compases) ----------
const menuChords = [[57, 60, 64], [62, 65, 69], [64, 68, 71], [57, 60, 64]]; // Am Dm E Am
const menuArp = menuChords.flatMap((c) => [c[0], c[1], c[2], c[1], c[0] + 12, c[2], c[1], c[2]]);
const menuLead = [
  69, _, _, 72, _, 71, 69, _,
  74, _, _, 72, _, 69, _, _,
  71, _, 68, _, 64, _, 68, 71,
  69, _, _, _, 64, _, 60, _,
];
const menuDrums = drums(4, [0, 4], [], [2, 6]);
const MENU: Song = {
  bpm: 104,
  perBeat: 2,
  tracks: [
    { inst: 'triangle', vol: 0.3, gate: 0.9, notes: menuLead.map((n) => (n === null ? null : n + 12)) },
    { inst: 'square', vol: 0.05, gate: 0.5, notes: menuArp },
    { inst: 'triangle', vol: 0.3, gate: 0.95, notes: perChord([45, 50, 52, 45], [0, _, _, _, 0, _, 7, _]) },
    { inst: 'kick', vol: 0.35, gate: 1, notes: menuDrums.kick },
    { inst: 'hat', vol: 0.05, gate: 1, notes: menuDrums.hat },
  ],
};

export const SONGS = { menu: MENU, battle: BATTLE } as const;
export type SongName = keyof typeof SONGS;

const midiToFreq = (n: number) => 440 * 2 ** ((n - 69) / 12);

class Music {
  private song: Song | null = null;
  private name: SongName | null = null;
  private step = 0;
  private nextTime = 0;
  private tempo = 1;
  private timer: number | null = null;

  constructor() {
    audio.onReady(() => this.restart());
  }

  play(name: SongName): void {
    if (this.name === name) return;
    this.name = name;
    this.song = SONGS[name];
    this.tempo = 1;
    this.restart();
  }

  stop(): void {
    this.name = null;
    this.song = null;
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
      for (const tr of song.tracks) {
        const n = tr.notes[this.step % tr.notes.length];
        if (n !== null) this.note(tr, n, this.nextTime, stepDur * tr.gate);
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
