import { BASE_STATS } from './core/game';
import { WORLDS, levelAt, levelIndex, type StoryPos } from './core/story';
import type { StoryRun } from './scenes/BattleScene';

const KEY = 'boom-monsters:story';
/** Nivel más lejano al que se ha llegado (índice en el recorrido). Nunca baja. */
const UNLOCK_KEY = 'boom-monsters:unlocked';
export const START_LIVES = 3;

export function newRun(skin: number, world = 0, level = 0): StoryRun {
  return { pos: { world, level }, lives: START_LIVES, score: 0, stats: { ...BASE_STATS }, skin };
}

/** Partida guardada en el navegador, o null si no hay (o está corrupta). */
export function loadRun(): StoryRun | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as StoryRun;
    if (!levelAt(r.pos) || !(r.lives > 0)) return null;
    return { ...r, stats: { ...BASE_STATS, ...r.stats } };
  } catch {
    return null;
  }
}

/** Guarda la partida. Llegar a un nivel lo desbloquea para el selector. */
export function saveRun(r: StoryRun): void {
  // Apuntar antes lo alcanzado con la partida anterior: si no, al sustituirla se perdería.
  const before = unlockedIndex();
  localStorage.setItem(KEY, JSON.stringify(r));
  storeUnlocked(Math.max(before, levelIndex(r.pos)));
}

export function clearRun(): void {
  storeUnlocked(unlockedIndex());
  localStorage.removeItem(KEY);
}

function storeUnlocked(i: number): void {
  localStorage.setItem(UNLOCK_KEY, String(i));
}

/** Índice del nivel más lejano desbloqueado (0 = solo el primero). */
export function unlockedIndex(): number {
  const stored = Number(localStorage.getItem(UNLOCK_KEY));
  const fromSave = loadRun();
  // Partidas guardadas antes de que existiera el selector también cuentan.
  return Math.max(Number.isFinite(stored) ? stored : 0, fromSave ? levelIndex(fromSave.pos) : 0);
}

export function isUnlocked(pos: StoryPos): boolean {
  return levelIndex(pos) <= unlockedIndex();
}

export function worldName(world: number): string {
  return WORLDS[world]?.name ?? '';
}
