import { BASE_STATS } from './core/game';
import { WORLDS, levelAt } from './core/story';
import type { StoryRun } from './scenes/BattleScene';

const KEY = 'boom-monsters:story';
export const START_LIVES = 3;

export function newRun(skin: number, world = 0): StoryRun {
  return { pos: { world, level: 0 }, lives: START_LIVES, score: 0, stats: { ...BASE_STATS }, skin };
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

export function saveRun(r: StoryRun): void {
  localStorage.setItem(KEY, JSON.stringify(r));
}

export function clearRun(): void {
  localStorage.removeItem(KEY);
}

export function worldName(world: number): string {
  return WORLDS[world]?.name ?? '';
}
