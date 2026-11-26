import { FLOOR } from './types';

export type MapId = 'classic' | 'portals' | 'factory' | 'ice' | 'random';

export interface MapInfo {
  id: MapId;
  name: string;
  description: string;
}

export const MAPS: readonly MapInfo[] = [
  { id: 'classic', name: 'Cripta clásica', description: 'Sin sorpresas: bloques, bombas y nada más.' },
  { id: 'portals', name: 'Portales', description: 'Pisa un portal y apareces en otro al azar.' },
  { id: 'factory', name: 'Fábrica', description: 'Cintas transportadoras que te arrastran (y a las bombas).' },
  { id: 'ice', name: 'Lago helado', description: 'En el hielo patinas hasta chocar con algo.' },
  { id: 'random', name: 'Al azar', description: 'Un mapa distinto cada ronda.' },
];

/** Datos de un mapa listo para jugar. */
export interface MapLayout {
  w: number;
  h: number;
  tiles: Uint8Array;
  floor: Uint8Array;
  spawns: [number, number][];
}

const SOLID = 1;
const SOFT = 2;

/**
 * Lee un mapa escrito como texto (para tests y mapas hechos a mano).
 *   #  muro      +  bloque rompible   .  vacío
 *   0-7  salida de cada jugador
 *   T  portal    ~  hielo    ^ v < >  cintas
 */
export function parseLayout(rows: string[]): MapLayout {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const floor = new Uint8Array(w * h);
  const spawns: [number, number][] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const k = y * w + x;
      if (ch === '#') tiles[k] = SOLID;
      else if (ch === '+') tiles[k] = SOFT;
      else if (ch >= '0' && ch <= '7') spawns[Number(ch)] = [x, y];
      else if (ch === 'T') floor[k] = FLOOR.Teleport;
      else if (ch === '~') floor[k] = FLOOR.Ice;
      else if (ch === '^') floor[k] = FLOOR.ConvUp;
      else if (ch === 'v') floor[k] = FLOOR.ConvDown;
      else if (ch === '<') floor[k] = FLOOR.ConvLeft;
      else if (ch === '>') floor[k] = FLOOR.ConvRight;
    });
  });
  return { w, h, tiles, floor, spawns: spawns.filter(Boolean) };
}

/** Genera un mapa procedural del tipo pedido para n jugadores. */
export function generateMap(id: Exclude<MapId, 'random'>, players: number, rand: () => number, softDensity = 0.72): MapLayout {
  const { w, h } = players <= 4 ? { w: 15, h: 13 } : { w: 19, h: 15 };
  const tiles = new Uint8Array(w * h);
  const floor = new Uint8Array(w * h);
  const at = (x: number, y: number) => y * w + x;

  // Suelo especial según el tema.
  if (id === 'portals') {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const pads: [number, number][] = [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4], [cx % 2 ? cx : cx - 1, cy % 2 ? cy : cy - 1]];
    for (const [x, y] of pads) floor[at(x, y)] = FLOOR.Teleport;
  } else if (id === 'factory') {
    // Dos cintas horizontales en sentidos opuestos y dos verticales.
    const r1 = 3;
    const r2 = h - 4;
    for (let x = 3; x <= w - 4; x++) {
      floor[at(x, r1)] = FLOOR.ConvRight;
      floor[at(x, r2)] = FLOOR.ConvLeft;
    }
    for (let y = r1 + 1; y < r2; y++) {
      floor[at(3, y)] = FLOOR.ConvUp;
      floor[at(w - 4, y)] = FLOOR.ConvDown;
    }
    floor[at(3, r1)] = FLOOR.ConvRight;
    floor[at(w - 4, r1)] = FLOOR.ConvDown;
    floor[at(w - 4, r2)] = FLOOR.ConvLeft;
    floor[at(3, r2)] = FLOOR.ConvUp;
  } else if (id === 'ice') {
    for (let y = 3; y <= h - 4; y++) {
      for (let x = 4; x <= w - 5; x++) floor[at(x, y)] = FLOOR.Ice;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      const k = at(x, y);
      if (border || pillar) {
        tiles[k] = SOLID;
        floor[k] = FLOOR.Normal;
      } else if (floor[k] !== FLOOR.Teleport && rand() < softDensity) {
        tiles[k] = SOFT;
      }
    }
  }

  const spawns = spawnPoints(w, h).slice(0, players);
  for (const [sx, sy] of spawns) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = at(sx + dx, sy + dy);
      if (tiles[k] === SOFT) tiles[k] = 0;
    }
  }
  return { w, h, tiles, floor, spawns };
}

function spawnPoints(w: number, h: number): [number, number][] {
  const odd = (n: number) => (n % 2 === 1 ? n : n - 1);
  const cx = odd(Math.floor(w / 2));
  const cy = odd(Math.floor(h / 2));
  return [
    [1, 1], [w - 2, h - 2], [w - 2, 1], [1, h - 2],
    [cx, 1], [cx, h - 2], [1, cy], [w - 2, cy],
  ];
}
