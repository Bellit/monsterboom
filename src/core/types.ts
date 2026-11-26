// Tipos y constantes compartidos por la lógica del juego.
// Esta carpeta (src/core) no depende de Phaser ni del navegador:
// en el futuro se ejecutará también en el servidor online.

/** 0 = quieto, 1 = arriba, 2 = abajo, 3 = izquierda, 4 = derecha */
export type Dir = 0 | 1 | 2 | 3 | 4;
export const DX = [0, 0, 0, -1, 1] as const;
export const DY = [0, -1, 1, 0, 0] as const;
export const DIRS: readonly Dir[] = [1, 2, 3, 4];

export const TILE = {
  Empty: 0,
  Solid: 1,
  Soft: 2,
  /** Bloque rompible ardiendo: bloquea el paso hasta que desaparece. */
  Burning: 3,
} as const;

export const POWER = {
  Bomb: 0,
  Fire: 1,
  Speed: 2,
  Kick: 3,
} as const;
export type PowerType = (typeof POWER)[keyof typeof POWER];

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Lo que un jugador quiere hacer en un paso. Igual para teclado, táctil, IA o red. */
export interface PlayerInput {
  dir: Dir;
  bomb: boolean;
}
export const NO_INPUT: PlayerInput = { dir: 0, bomb: false };

export interface Player {
  id: number;
  /** Posición del centro en casillas (decimal). */
  x: number;
  y: number;
  alive: boolean;
  /** Segundos desde que murió (para la animación). */
  deadFor: number;
  maxBombs: number;
  range: number;
  speedLv: number;
  kick: boolean;
  facing: Dir;
  moving: boolean;
}

export interface Bomb {
  id: number;
  /** -1 = bomba de la lluvia final */
  owner: number;
  tx: number;
  ty: number;
  fuse: number;
  range: number;
  /** Jugadores que aún están encima y pueden salir de ella. */
  passable: Set<number>;
  /** Dirección en la que se desliza tras una patada (0 = quieta). */
  slide: Dir;
  /** Avance hacia la siguiente casilla mientras se desliza (0..1). */
  offset: number;
}

export type GameEvent =
  | { type: 'bomb'; x: number; y: number }
  | { type: 'explode'; x: number; y: number }
  | { type: 'pickup'; player: number; power: PowerType }
  | { type: 'death'; player: number }
  | { type: 'kick' }
  | { type: 'rainStart' };
