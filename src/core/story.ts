import { POWER, type PowerType } from './types';
import type { MapId } from './maps';

export type EnemyKind = 'slime' | 'bat' | 'eye' | 'ghost' | 'boss' | 'hunter';

export interface EnemyInfo {
  name: string;
  /** Casillas por segundo. */
  speed: number;
  points: number;
  /** Atraviesa bloques rompibles. */
  ghost: boolean;
  color: number;
}

export const ENEMIES: Record<EnemyKind, EnemyInfo> = {
  slime: { name: 'Babosa', speed: 1.4, points: 100, ghost: false, color: 0x8be05a },
  bat: { name: 'Murciélago', speed: 2.6, points: 200, ghost: false, color: 0x6b5b95 },
  eye: { name: 'Mirón', speed: 2.0, points: 300, ghost: false, color: 0xf2e8d5 },
  ghost: { name: 'Fantasmón', speed: 1.6, points: 400, ghost: true, color: 0xcfe9ff },
  boss: { name: 'Jefe', speed: 1.3, points: 3000, ghost: false, color: 0x8be05a },
  hunter: { name: 'Cazador', speed: 3.2, points: 0, ghost: true, color: 0xff4d6d },
};

export interface BossInfo {
  name: string;
  hp: number;
  color: number;
  /** Enemigo que invoca cada cierto tiempo. */
  spawns: EnemyKind;
  spawnEvery: number;
}

export interface StoryLevel {
  /** Enemigos normales de cada tipo. */
  enemies: Partial<Record<EnemyKind, number>>;
  /** Power-ups escondidos bajo bloques. */
  powerups: PowerType[];
  /** Densidad de bloques rompibles (0..1). */
  soft: number;
  /** Segundos antes de que lleguen los cazadores. */
  time: number;
  boss?: BossInfo;
}

export interface World {
  name: string;
  /** Tema del mapa: decide el suelo especial. */
  theme: Exclude<MapId, 'random'>;
  levels: StoryLevel[];
}

const { Bomb, Fire, Speed, Kick, Throw, Shield } = POWER;

/**
 * Los mundos del modo historia. Para añadir niveles o mundos basta con
 * añadir datos aquí: el juego los recorre en orden.
 */
export const WORLDS: World[] = [
  {
    name: 'Cripta',
    theme: 'classic',
    levels: [
      { enemies: { slime: 3 }, powerups: [Fire], soft: 0.55, time: 180 },
      { enemies: { slime: 4, bat: 1 }, powerups: [Bomb], soft: 0.6, time: 180 },
      { enemies: { slime: 3, bat: 2 }, powerups: [Fire, Speed], soft: 0.62, time: 180 },
      { enemies: { slime: 3, bat: 2, eye: 1 }, powerups: [Bomb], soft: 0.65, time: 200 },
      {
        enemies: { slime: 2 }, powerups: [Fire], soft: 0.3, time: 240,
        boss: { name: 'Rey Babosa', hp: 5, color: 0x5fc43a, spawns: 'slime', spawnEvery: 7 },
      },
    ],
  },
  {
    name: 'Lago helado',
    theme: 'ice',
    levels: [
      { enemies: { slime: 2, bat: 3 }, powerups: [Speed], soft: 0.6, time: 180 },
      { enemies: { bat: 3, eye: 2 }, powerups: [Kick], soft: 0.62, time: 180 },
      { enemies: { slime: 2, eye: 3 }, powerups: [Fire, Bomb], soft: 0.64, time: 200 },
      { enemies: { bat: 4, eye: 2 }, powerups: [Shield], soft: 0.66, time: 200 },
      {
        enemies: { bat: 2 }, powerups: [Bomb], soft: 0.3, time: 240,
        boss: { name: 'Gran Murciélago', hp: 6, color: 0x4b3f75, spawns: 'bat', spawnEvery: 6 },
      },
    ],
  },
  {
    name: 'Fábrica',
    theme: 'factory',
    levels: [
      { enemies: { eye: 3, ghost: 1 }, powerups: [Throw], soft: 0.6, time: 200 },
      { enemies: { bat: 3, ghost: 2 }, powerups: [Fire], soft: 0.62, time: 200 },
      { enemies: { eye: 3, ghost: 2 }, powerups: [Bomb, Speed], soft: 0.64, time: 200 },
      { enemies: { bat: 2, eye: 2, ghost: 3 }, powerups: [Shield], soft: 0.66, time: 220 },
      {
        enemies: { eye: 2 }, powerups: [Fire], soft: 0.3, time: 260,
        boss: { name: 'Ojo Supremo', hp: 7, color: 0xe8d9b8, spawns: 'eye', spawnEvery: 6 },
      },
    ],
  },
  {
    name: 'Portales',
    theme: 'portals',
    levels: [
      { enemies: { ghost: 4, bat: 2 }, powerups: [Bomb], soft: 0.62, time: 200 },
      { enemies: { ghost: 3, eye: 3 }, powerups: [Fire], soft: 0.64, time: 200 },
      { enemies: { ghost: 4, eye: 2, bat: 2 }, powerups: [Speed, Shield], soft: 0.66, time: 220 },
      { enemies: { ghost: 5, eye: 3 }, powerups: [Bomb, Fire], soft: 0.68, time: 240 },
      {
        enemies: { ghost: 3 }, powerups: [Shield], soft: 0.3, time: 300,
        boss: { name: 'Rey Fantasma', hp: 9, color: 0xa9d6ff, spawns: 'ghost', spawnEvery: 5 },
      },
    ],
  },
];

export interface StoryPos {
  world: number;
  level: number;
}

export function levelAt(pos: StoryPos): StoryLevel | null {
  return WORLDS[pos.world]?.levels[pos.level] ?? null;
}

/** Siguiente nivel, o null si se ha terminado el juego. */
export function nextLevel(pos: StoryPos): StoryPos | null {
  if (pos.level + 1 < WORLDS[pos.world].levels.length) return { world: pos.world, level: pos.level + 1 };
  if (pos.world + 1 < WORLDS.length) return { world: pos.world + 1, level: 0 };
  return null;
}

/** Posición del nivel en el recorrido completo (0 = primer nivel del primer mundo). */
export function levelIndex(pos: StoryPos): number {
  let i = 0;
  for (let w = 0; w < pos.world; w++) i += WORLDS[w].levels.length;
  return i + pos.level;
}

/** Nivel en la posición i del recorrido, o null si no existe. */
export function posFromIndex(i: number): StoryPos | null {
  if (i < 0) return null;
  for (let w = 0; w < WORLDS.length; w++) {
    const n = WORLDS[w].levels.length;
    if (i < n) return { world: w, level: i };
    i -= n;
  }
  return null;
}

export function levelLabel(pos: StoryPos): string {
  const lv = levelAt(pos);
  return lv?.boss ? `${pos.world + 1}-${pos.level + 1} · ${lv.boss.name}` : `${pos.world + 1}-${pos.level + 1}`;
}
