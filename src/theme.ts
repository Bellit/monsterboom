export type MonsterFeature = 'horns' | 'cyclops' | 'ears' | 'blush' | 'antennae' | 'spikes' | 'fangs' | 'crest';

export interface Monster {
  name: string;
  color: number;
  feature: MonsterFeature;
  /** Frase corta para el selector. */
  bio: string;
}

/** Plantilla de monstruos jugables. Todos tienen las mismas capacidades. */
export const MONSTERS: readonly Monster[] = [
  { name: 'Moco', color: 0x6fd34a, feature: 'horns', bio: 'Cabezota y pegajoso.' },
  { name: 'Bloop', color: 0xa45ae6, feature: 'cyclops', bio: 'Un ojo, cero miedo.' },
  { name: 'Zarpa', color: 0xff9a3c, feature: 'ears', bio: 'Siempre cae de pie.' },
  { name: 'Mochi', color: 0x3cd0e6, feature: 'blush', bio: 'Adorable. Explosiva.' },
  { name: 'Chicle', color: 0xff6fae, feature: 'antennae', bio: 'Capta bombas a distancia.' },
  { name: 'Chispa', color: 0xffd84a, feature: 'spikes', bio: 'Pelos de punta, mecha corta.' },
  { name: 'Grumo', color: 0xe6493c, feature: 'fangs', bio: 'Muerde antes de preguntar.' },
  { name: 'Pinchi', color: 0x4a7cff, feature: 'crest', bio: 'Cresta afilada, ideas peores.' },
];

/**
 * Monstruo de cada jugador: el 0 es el elegido por el humano y los bots
 * toman el resto en orden.
 */
export function skinsFor(choice: number, players: number): number[] {
  const others = MONSTERS.map((_, i) => i).filter((i) => i !== choice);
  return [choice, ...others].slice(0, players);
}

export const cssColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Oscurece un color 0xRRGGBB en un porcentaje (0-100). */
export function darken(c: number, pct: number): number {
  const f = 1 - pct / 100;
  const r = Math.round(((c >> 16) & 255) * f);
  const g = Math.round(((c >> 8) & 255) * f);
  const b = Math.round((c & 255) * f);
  return (r << 16) | (g << 8) | b;
}
