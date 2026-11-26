// Tipos y constantes compartidos por la lógica del juego.
// Esta carpeta (src/core) no depende de Phaser ni del navegador:
// en el futuro se ejecutará también en el servidor online.

/** 0 = quieto, 1 = arriba, 2 = abajo, 3 = izquierda, 4 = derecha */
export type Dir = 0 | 1 | 2 | 3 | 4;
export const DX = [0, 0, 0, -1, 1] as const;
export const DY = [0, -1, 1, 0, 0] as const;
export const DIRS: readonly Dir[] = [1, 2, 3, 4];
export const OPPOSITE: readonly Dir[] = [0, 2, 1, 4, 3];

export const TILE = {
  Empty: 0,
  Solid: 1,
  Soft: 2,
  /** Bloque rompible ardiendo: bloquea el paso hasta que desaparece. */
  Burning: 3,
} as const;

/** Suelo especial de cada casilla (mapas temáticos). */
export const FLOOR = {
  Normal: 0,
  Ice: 1,
  ConvUp: 2,
  ConvDown: 3,
  ConvLeft: 4,
  ConvRight: 5,
  Teleport: 6,
} as const;

/** Dirección en la que empuja una cinta, o 0 si no es cinta. */
export function conveyorDir(floor: number): Dir {
  return floor >= FLOOR.ConvUp && floor <= FLOOR.ConvRight ? ((floor - 1) as Dir) : 0;
}

export const POWER = {
  Bomb: 0,
  Fire: 1,
  Speed: 2,
  Kick: 3,
  Throw: 4,
  Shield: 5,
  Curse: 6,
} as const;
export type PowerType = (typeof POWER)[keyof typeof POWER];

export type CurseType = 'slow' | 'fast' | 'reverse' | 'diarrhea' | 'nobomb';
export const CURSES: readonly CurseType[] = ['slow', 'fast', 'reverse', 'diarrhea', 'nobomb'];

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
  throw: boolean;
  shield: boolean;
  /** Segundos de invulnerabilidad tras perder el escudo. */
  invuln: number;
  curse: CurseType | null;
  curseTime: number;
  facing: Dir;
  moving: boolean;
  /** Dirección en la que patina sobre hielo. */
  iceDir: Dir;
  /** Teletransporte del que acaba de salir (no vuelve a activarse hasta pisar otra casilla). */
  tpLock: number;
}

export interface BombFlight {
  fromX: number;
  fromY: number;
  t: number;
  dur: number;
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
  /** Dirección en la que se desliza (patada o cinta). 0 = quieta. */
  slide: Dir;
  slideSpeed: number;
  /** Avance hacia la siguiente casilla mientras se desliza (0..1). */
  offset: number;
  /** Bomba lanzada por el aire. */
  flight: BombFlight | null;
}

export type GameEvent =
  | { type: 'bomb'; x: number; y: number }
  | { type: 'explode'; x: number; y: number }
  | { type: 'pickup'; player: number; power: PowerType; x: number; y: number }
  | { type: 'death'; player: number }
  | { type: 'kick' }
  | { type: 'throw' }
  | { type: 'land'; x: number; y: number }
  | { type: 'shieldBreak'; player: number }
  | { type: 'curse'; player: number; curse: CurseType }
  | { type: 'teleport'; player: number; fromX: number; fromY: number; x: number; y: number }
  | { type: 'countdown'; value: number }
  | { type: 'go' }
  | { type: 'rainStart' };
