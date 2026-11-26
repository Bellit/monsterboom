/**
 * Temas musicales de Boom Monsters, compuestos para el juego.
 * Cada pista lleva una nota por paso (número MIDI) o null para silencio.
 * Para escribir melodías es más cómodo `seq('E5 . D5 E5')`: nombre de nota
 * u octava, y '.' para silencio.
 */

export type Instrument = 'square' | 'triangle' | 'sawtooth' | 'kick' | 'snare' | 'hat';

export interface Track {
  inst: Instrument;
  vol: number;
  /** Fracción del paso que suena cada nota (0..1). */
  gate: number;
  notes: (number | null)[];
}

export interface Song {
  bpm: number;
  /** Pasos por pulso (2 = corcheas, 4 = semicorcheas). */
  perBeat: number;
  tracks: Track[];
  /** false = se toca una vez (melodías cortas de victoria o derrota). */
  loop?: boolean;
}

const _ = null;
const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Nombre de nota → MIDI. 'C4' = 60, 'A#4' = 70, 'Bb3' = 58. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota no válida: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + acc;
}

/** Melodía escrita como texto: 'E5 . D5 E5 | C5 A4 . .' (las barras se ignoran). */
export function seq(text: string): (number | null)[] {
  return text.split(/\s+/).filter((t) => t && t !== '|').map((t) => (t === '.' ? null : midi(t)));
}

/** Repite un patrón de intervalos sobre cada fundamental (un compás por fundamental). */
function perChord(roots: number[], pattern: (number | null)[]): (number | null)[] {
  return roots.flatMap((r) => pattern.map((o) => (o === null ? null : r + o)));
}

/** Arpegio: para cada acorde, recorre sus notas según el patrón de índices. */
function arp(chords: string[][], pattern: number[]): (number | null)[] {
  return chords.flatMap((c) => pattern.map((i) => midi(c[i % c.length])));
}

function drums(bars: number, kick: number[], snare: number[], hat: number[], steps = 8) {
  const make = (hits: number[]) =>
    Array.from({ length: bars * steps }, (_v, i) => (hits.includes(i % steps) ? 1 : null));
  return { kick: make(kick), snare: make(snare), hat: make(hat) };
}

function drumTracks(d: ReturnType<typeof drums>, k = 0.5, s = 0.22, h = 0.06): Track[] {
  return [
    { inst: 'kick', vol: k, gate: 1, notes: d.kick },
    { inst: 'snare', vol: s, gate: 1, notes: d.snare },
    { inst: 'hat', vol: h, gate: 1, notes: d.hat },
  ];
}

// ---------- Menú: La menor, misterioso y saltarín ----------
const MENU: Song = {
  bpm: 104,
  perBeat: 2,
  tracks: [
    { inst: 'triangle', vol: 0.3, gate: 0.9, notes: seq('A5 . . C6 . B5 A5 . | D6 . . C6 . A5 . . | B5 . G#5 . E5 . G#5 B5 | A5 . . . E5 . C5 .') },
    { inst: 'square', vol: 0.05, gate: 0.5, notes: arp([['A3', 'C4', 'E4'], ['D4', 'F4', 'A4'], ['E4', 'G#4', 'B4'], ['A3', 'C4', 'E4']], [0, 1, 2, 1, 0, 2, 1, 2]) },
    { inst: 'triangle', vol: 0.3, gate: 0.95, notes: perChord([45, 50, 52, 45], [0, _, _, _, 0, _, 7, _]) },
    ...drumTracks(drums(4, [0, 4], [], [2, 6]), 0.35, 0, 0.05),
  ],
};

// ---------- Batalla: La menor, enérgico ----------
const BATTLE: Song = {
  bpm: 150,
  perBeat: 2,
  tracks: [
    {
      inst: 'square', vol: 0.11, gate: 0.7, notes: seq(`
        E5 . D5 E5 . C5 A4 . | C5 . D5 C5 . A4 F4 . | G4 . C5 . E5 . D5 C5 | B4 . D5 . G5 . E5 D5
        A5 . G5 E5 . D5 E5 . | F5 . E5 D5 . C5 D5 . | D5 . B4 . G4 . B4 D5 | E5 . G#5 . B5 . G#5 .`),
    },
    { inst: 'triangle', vol: 0.32, gate: 0.85, notes: perChord([45, 41, 48, 43, 45, 41, 43, 40], [0, 12, 0, 12, 0, 12, 0, 12]) },
    { inst: 'square', vol: 0.035, gate: 0.4, notes: perChord([69, 65, 72, 67, 69, 65, 67, 64], [0, 7, 12, 7, 0, 7, 12, 7]) },
    ...drumTracks(drums(8, [0, 4], [2, 6], [0, 1, 2, 3, 4, 5, 6, 7])),
  ],
};

// ---------- Mundo 1 · Cripta: Re menor, paseo por el cementerio ----------
const CRYPT: Song = {
  bpm: 132,
  perBeat: 2,
  tracks: [
    {
      inst: 'square', vol: 0.1, gate: 0.65, notes: seq(`
        D5 . F5 A5 . G5 F5 E5 | D5 . . F5 . D5 Bb4 . | C5 . E5 G5 . F5 E5 D5 | C#5 . E5 . A4 . . .
        A5 . G5 F5 . E5 F5 D5 | F5 . E5 D5 . C5 D5 Bb4 | C5 . D5 E5 . G5 F5 E5 | E5 . C#5 . A4 . . .`),
    },
    { inst: 'triangle', vol: 0.32, gate: 0.8, notes: perChord([38, 46, 48, 45, 38, 46, 48, 45], [0, _, 12, 0, _, 0, 12, _]) },
    { inst: 'square', vol: 0.03, gate: 0.35, notes: arp([['D4', 'F4', 'A4'], ['Bb3', 'D4', 'F4'], ['C4', 'E4', 'G4'], ['A3', 'C#4', 'E4']], [0, 1, 2, 1, 2, 1, 0, 1]).concat(arp([['D4', 'F4', 'A4'], ['Bb3', 'D4', 'F4'], ['C4', 'E4', 'G4'], ['A3', 'C#4', 'E4']], [2, 1, 0, 1, 2, 1, 0, 2])) },
    ...drumTracks(drums(8, [0, 4], [2, 6], [1, 3, 5, 7]), 0.45, 0.18, 0.05),
  ],
};

// ---------- Mundo 2 · Lago helado: tranquilo y brillante ----------
const ICE: Song = {
  bpm: 116,
  perBeat: 2,
  tracks: [
    {
      inst: 'triangle', vol: 0.3, gate: 0.9, notes: seq(`
        A5 . . G5 . E5 . . | D5 . . E5 . G5 . . | B5 . . A5 . G5 E5 . | A5 . . . . . . .
        C6 . . B5 . A5 . . | B5 . . A5 . G5 . D5 | E5 . G5 . B5 . A5 G5 | A5 . . . E5 . . .`),
    },
    { inst: 'square', vol: 0.035, gate: 0.3, notes: arp([['F5', 'A5', 'C6', 'E6'], ['G5', 'B5', 'D6', 'G6'], ['E5', 'G5', 'B5', 'E6'], ['A5', 'C6', 'E6', 'A6']], [0, 1, 2, 3, 2, 1, 0, 1]).concat(arp([['F5', 'A5', 'C6', 'E6'], ['G5', 'B5', 'D6', 'G6'], ['E5', 'G5', 'B5', 'E6'], ['A5', 'C6', 'E6', 'A6']], [3, 2, 1, 0, 1, 2, 3, 2])) },
    { inst: 'triangle', vol: 0.28, gate: 0.95, notes: perChord([41, 43, 40, 45, 41, 43, 40, 45], [0, _, _, 7, _, _, 12, _]) },
    ...drumTracks(drums(8, [0], [4], [2, 6]), 0.3, 0.08, 0.05),
  ],
};

// ---------- Mundo 3 · Fábrica: Sol menor, maquinaria a semicorcheas ----------
const FACTORY: Song = {
  bpm: 140,
  perBeat: 4,
  tracks: [
    {
      inst: 'square', vol: 0.1, gate: 0.5, notes: seq(`
        G4 . . G4 . . Bb4 . . . D5 . C5 . Bb4 . | G4 . . G4 . . Bb4 . . . F5 . D5 . . .
        Eb5 . . D5 . . Bb4 . . . G4 . Bb4 . Eb5 . | F5 . . D5 . . C5 . . . A4 . C5 . D5 .`),
    },
    { inst: 'sawtooth', vol: 0.07, gate: 0.6, notes: perChord([31, 31, 27, 29], [0, _, 0, 12, 0, _, 0, 12, 0, _, 0, 12, 0, 10, 7, 12]) },
    ...drumTracks(drums(4, [0, 6, 8], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14, 15], 16), 0.5, 0.2, 0.05),
  ],
};

// ---------- Mundo 4 · Portales: Si menor, misterioso ----------
const PORTALS: Song = {
  bpm: 126,
  perBeat: 2,
  tracks: [
    {
      inst: 'triangle', vol: 0.3, gate: 0.85, notes: seq(`
        F#5 . . D5 . . B4 . | G5 . . F#5 . D5 . . | E5 . G5 . B5 . A#5 . | A#5 . . C#6 . . A#5 .
        B5 . A5 F#5 . D5 E5 F#5 | G5 . F#5 D5 . B4 D5 . | E5 . F#5 G5 . A5 B5 . | A#5 . C#6 . F#5 . . .`),
    },
    { inst: 'square', vol: 0.035, gate: 0.4, notes: arp([['B3', 'D4', 'F#4'], ['G3', 'B3', 'D4'], ['E3', 'G3', 'B3'], ['F#3', 'A#3', 'C#4']], [0, 2, 1, 2, 0, 2, 1, 2]).concat(arp([['B3', 'D4', 'F#4'], ['G3', 'B3', 'D4'], ['E3', 'G3', 'B3'], ['F#3', 'A#3', 'C#4']], [0, 2, 1, 2, 0, 2, 1, 2])) },
    { inst: 'triangle', vol: 0.3, gate: 0.9, notes: perChord([47, 43, 40, 42, 47, 43, 40, 42], [0, _, _, 0, 12, _, 7, _]) },
    ...drumTracks(drums(8, [0, 3], [4], [2, 6, 7]), 0.4, 0.15, 0.05),
  ],
};

// ---------- Jefe: Do menor, rápido y con tensión ----------
const BOSS: Song = {
  bpm: 168,
  perBeat: 2,
  tracks: [
    {
      inst: 'square', vol: 0.1, gate: 0.6, notes: seq(`
        C5 C5 Eb5 C5 G5 . F5 Eb5 | D5 . Eb5 F5 Eb5 D5 C5 . | C5 C5 Eb5 C5 Ab5 . G5 F5 | G5 . F5 Eb5 D5 . Bb4 .
        C6 . Bb5 G5 . Eb5 F5 G5 | Ab5 . G5 F5 . Eb5 D5 C5 | Eb5 . F5 G5 . Ab5 Bb5 . | B5 . D6 . G5 . B4 .`),
    },
    { inst: 'sawtooth', vol: 0.06, gate: 0.7, notes: perChord([36, 36, 32, 34, 36, 36, 32, 31], [0, 12, 0, 12, 0, 12, 0, 12]) },
    { inst: 'triangle', vol: 0.3, gate: 0.8, notes: perChord([36, 36, 32, 34, 36, 36, 32, 31], [0, 0, 12, 0, 0, 0, 12, 0]) },
    ...drumTracks(drums(8, [0, 2, 4, 6], [2, 6], [0, 1, 2, 3, 4, 5, 6, 7]), 0.5, 0.22, 0.06),
  ],
};

// ---------- Melodías cortas (no se repiten) ----------
const CLEAR: Song = {
  bpm: 170,
  perBeat: 2,
  loop: false,
  tracks: [
    { inst: 'square', vol: 0.13, gate: 0.85, notes: seq('C5 E5 G5 C6 . G5 C6 . . .') },
    { inst: 'triangle', vol: 0.3, gate: 0.9, notes: seq('C3 . G3 . C4 . C3 . . .') },
  ],
};

const WORLD_CLEAR: Song = {
  bpm: 150,
  perBeat: 2,
  loop: false,
  tracks: [
    { inst: 'square', vol: 0.13, gate: 0.85, notes: seq('G4 C5 E5 G5 . E5 G5 . | A5 . G5 F5 E5 D5 E5 . | C6 . . . . . . .') },
    { inst: 'square', vol: 0.06, gate: 0.85, notes: seq('E4 G4 C5 E5 . C5 E5 . | F5 . E5 D5 C5 B4 C5 . | G5 . . . . . . .') },
    { inst: 'triangle', vol: 0.3, gate: 0.9, notes: seq('C3 . G3 . C3 . G3 . | F3 . . . G3 . . . | C3 . G2 . C3 . . .') },
    ...drumTracks(drums(3, [0, 4], [2, 6], [1, 3, 5, 7]), 0.4, 0.18, 0.05),
  ],
};

const GAME_OVER: Song = {
  bpm: 96,
  perBeat: 2,
  loop: false,
  tracks: [
    { inst: 'triangle', vol: 0.32, gate: 0.9, notes: seq('G4 . F#4 . F4 . E4 . | Eb4 . . . . . . .') },
    { inst: 'square', vol: 0.05, gate: 0.9, notes: seq('C4 . B3 . Bb3 . A3 . | Ab3 . . . . . . .') },
    { inst: 'triangle', vol: 0.25, gate: 0.95, notes: seq('C3 . . . C3 . . . | C2 . . . . . . .') },
  ],
};

export const SONGS = {
  menu: MENU,
  battle: BATTLE,
  crypt: CRYPT,
  ice: ICE,
  factory: FACTORY,
  portals: PORTALS,
  boss: BOSS,
  clear: CLEAR,
  worldClear: WORLD_CLEAR,
  gameOver: GAME_OVER,
} as const;

export type SongName = keyof typeof SONGS;
