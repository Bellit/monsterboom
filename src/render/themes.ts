import type Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;

export type ThemeId = 'classic' | 'ice' | 'factory' | 'portals';

/**
 * Aspecto de cada mundo: suelo, muros, bloques rompibles y cómo se rompen.
 * Todo con formas simples, a la espera del pixel art definitivo.
 */
export interface ThemeArt {
  bg: number;
  floor(g: G, px: number, py: number, x: number, y: number, T: number): void;
  wall(g: G, px: number, py: number, T: number): void;
  soft(g: G, px: number, py: number, T: number, k: number): void;
  /** Bloque rompiéndose; `t` va de 1 (recién alcanzado) a 0 (desaparece). */
  burning(g: G, px: number, py: number, T: number, t: number): void;
  /** Colores de los trozos que salen al romper un bloque. */
  shards: number[];
  /** Opacidad de la sombra que proyectan los muros. */
  shadow: number;
}

const CRYPT: ThemeArt = {
  bg: 0x1a1726,
  shadow: 0.22,
  shards: [0x8f8aa0, 0x6d6880, 0x4a3b2a],
  floor(g, px, py, x, y, T) {
    g.fillStyle((x + y) % 2 === 0 ? 0x2f5d50 : 0x2b5549).fillRect(px, py, T, T);
    if ((x * 7 + y * 3) % 5 === 0) g.fillStyle(0x3d7a62, 0.6).fillCircle(px + T * 0.3, py + T * 0.7, 3);
  },
  wall(g, px, py, T) {
    g.fillStyle(0x3a3450).fillRect(px, py, T, T);
    g.fillStyle(0x5b5470).fillRect(px + 2, py + 2, T - 4, T - 8);
    g.fillStyle(0x7d7698).fillRect(px + 2, py + 2, T - 4, 6);
    g.fillStyle(0x4a4462).fillRect(px + 2, py + T / 2, T - 4, 2).fillRect(px + T / 2, py + 8, 2, T / 2 - 8);
  },
  soft(g, px, py, T) {
    // Lápida sobre un montón de tierra.
    g.fillStyle(0x4a3b2a).fillEllipse(px + T / 2, py + T - 8, T - 6, 14);
    g.fillStyle(0x5e5a70).fillRoundedRect(px + 9, py + 5, T - 18, T - 12, { tl: 14, tr: 14, bl: 2, br: 2 });
    g.fillStyle(0x8f8aa0).fillRoundedRect(px + 11, py + 6, T - 22, T - 15, { tl: 12, tr: 12, bl: 2, br: 2 });
    g.fillStyle(0x5e5a70).fillRect(px + T / 2 - 1.5, py + 13, 3, 14).fillRect(px + T / 2 - 6, py + 17, 12, 3);
  },
  burning(g, px, py, T, t) {
    g.fillStyle(0xe8772e, Math.min(1, t * 2.5)).fillRect(px + 4, py + 4, T - 8, T - 8);
    g.fillStyle(0xffe066, Math.min(1, t * 2)).fillRect(px + 12, py + 12, T - 24, T - 24);
  },
};

const ICE: ThemeArt = {
  bg: 0x1b2a3f,
  shadow: 0.1,
  shards: [0xe8f8ff, 0xbfeaff, 0x7cc8ec],
  floor(g, px, py, x, y, T) {
    // Nieve.
    g.fillStyle((x + y) % 2 === 0 ? 0xe9f1f8 : 0xdfe9f3).fillRect(px, py, T, T);
    g.fillStyle(0xc5d6e6).fillCircle(px + ((x * 13) % 30) + 8, py + ((y * 17) % 28) + 10, 1.6);
    g.fillStyle(0xc5d6e6).fillCircle(px + ((x * 7) % 26) + 14, py + ((y * 11) % 24) + 16, 1.2);
  },
  wall(g, px, py, T) {
    // Roca con nieve encima.
    g.fillStyle(0x4b5a70).fillRect(px, py, T, T);
    g.fillStyle(0x6d7f99).fillRoundedRect(px + 2, py + 4, T - 4, T - 8, 6);
    g.fillStyle(0x8396b0).fillRect(px + 6, py + T / 2, 10, 4);
    g.fillStyle(0xffffff).fillRoundedRect(px + 1, py + 1, T - 2, 12, 6);
    g.fillStyle(0xffffff).fillCircle(px + 10, py + 13, 4).fillCircle(px + T - 14, py + 12, 5);
  },
  soft(g, px, py, T) {
    // Cubo de hielo.
    g.fillStyle(0x5aa9d6).fillRoundedRect(px + 3, py + 4, T - 6, T - 6, 6);
    g.fillStyle(0xbfeaff, 0.95).fillRoundedRect(px + 4, py + 3, T - 8, T - 9, 6);
    g.fillStyle(0x9fdcf5).fillRoundedRect(px + 9, py + 8, T - 18, T - 19, 4);
    g.fillStyle(0xffffff, 0.85).fillTriangle(px + 8, py + 9, px + 20, py + 7, px + 8, py + 22);
    g.lineStyle(1.5, 0x7cc8ec, 0.9).lineBetween(px + T - 14, py + 12, px + T - 20, py + 24);
  },
  burning(g, px, py, T, t) {
    // Se derrite: vapor y charco.
    g.fillStyle(0x9fdcf5, Math.min(1, t * 2)).fillEllipse(px + T / 2, py + T / 2 + 6, (T - 8) * (0.6 + t * 0.4), (T - 16) * t + 8);
    g.fillStyle(0xffffff, Math.min(0.8, t * 1.6)).fillCircle(px + T / 2 - 6, py + T / 2 - 10 * (1 - t) - 4, 6 * t + 2);
    g.fillStyle(0xffffff, Math.min(0.6, t * 1.2)).fillCircle(px + T / 2 + 7, py + T / 2 - 14 * (1 - t) - 2, 5 * t + 2);
  },
};

const FACTORY: ThemeArt = {
  bg: 0x16181d,
  shadow: 0.25,
  shards: [0xb07a3c, 0x7a4f22, 0xd9a35f],
  floor(g, px, py, x, y, T) {
    g.fillStyle((x + y) % 2 === 0 ? 0x5a6270 : 0x545b68).fillRect(px, py, T, T);
    g.fillStyle(0x464d59).fillRect(px, py, T, 1).fillRect(px, py, 1, T);
    g.fillStyle(0x3d434e);
    for (const [ox, oy] of [[5, 5], [T - 6, 5], [5, T - 6], [T - 6, T - 6]]) g.fillCircle(px + ox, py + oy, 1.8);
  },
  wall(g, px, py, T) {
    g.fillStyle(0x2b2f37).fillRect(px, py, T, T);
    g.fillStyle(0x3d434e).fillRect(px + 2, py + 2, T - 4, T - 6);
    // franjas de peligro
    g.fillStyle(0xf2c14e).fillRect(px + 2, py + 2, T - 4, 9);
    g.fillStyle(0x1c1c1c);
    for (let i = -1; i < 6; i++) {
      const x0 = px + 2 + i * 9;
      g.fillTriangle(x0, py + 11, x0 + 5, py + 11, x0 + 9, py + 2);
    }
    g.fillStyle(0x2b2f37).fillRect(px - 1, py + 2, 3, 9).fillRect(px + T - 2, py + 2, 3, 9);
    g.fillStyle(0x6b7380).fillCircle(px + 9, py + T - 11, 2.5).fillCircle(px + T - 9, py + T - 11, 2.5);
    g.fillStyle(0x23262c).fillRect(px + 14, py + 18, T - 28, 3).fillRect(px + 14, py + 24, T - 28, 3);
  },
  soft(g, px, py, T) {
    // Caja de madera.
    g.fillStyle(0x7a4f22).fillRect(px + 3, py + 3, T - 6, T - 6);
    g.fillStyle(0xb07a3c).fillRect(px + 6, py + 6, T - 12, T - 12);
    g.lineStyle(4, 0x7a4f22).lineBetween(px + 7, py + 7, px + T - 7, py + T - 7).lineBetween(px + T - 7, py + 7, px + 7, py + T - 7);
    g.fillStyle(0xd9a35f).fillRect(px + 6, py + 6, T - 12, 3);
  },
  burning(g, px, py, T, t) {
    g.fillStyle(0xe8772e, Math.min(1, t * 2.5)).fillRect(px + 4, py + 4, T - 8, T - 8);
    g.fillStyle(0x7a4f22, Math.min(1, t * 2)).fillRect(px + 10, py + 10, T - 20, T - 20);
  },
};

const PORTALS: ThemeArt = {
  bg: 0x120d1f,
  shadow: 0.3,
  shards: [0xc9a2ff, 0x9b6bff, 0xffffff],
  floor(g, px, py, x, y, T) {
    g.fillStyle((x + y) % 2 === 0 ? 0x2e2347 : 0x2a2041).fillRect(px, py, T, T);
    g.fillStyle(0x221a38).fillRect(px, py, T, 2).fillRect(px, py, 2, T);
    if ((x * 5 + y * 3) % 7 === 0) g.fillStyle(0x6b4fb0, 0.6).fillCircle(px + T * 0.7, py + T * 0.3, 1.8);
  },
  wall(g, px, py, T) {
    g.fillStyle(0x0f0a1c).fillRect(px, py, T, T);
    g.fillStyle(0x1c1530).fillRect(px + 2, py + 2, T - 4, T - 6);
    g.fillStyle(0x2b2148).fillTriangle(px + 2, py + 2, px + T - 2, py + 2, px + T / 2, py + T / 2);
    g.lineStyle(2, 0x7b3fe4, 0.9).strokeRect(px + 3, py + 3, T - 6, T - 8);
    g.fillStyle(0xc9a2ff, 0.8).fillCircle(px + T / 2, py + T / 2 + 4, 2.5);
  },
  soft(g, px, py, T, k) {
    // Cristales mágicos sobre roca.
    g.fillStyle(0x3a2d55).fillEllipse(px + T / 2, py + T - 9, T - 8, 14);
    const tint = k % 2 === 0 ? 0xc9a2ff : 0x9fd0ff;
    g.fillStyle(0x7b3fe4).fillTriangle(px + 8, py + T - 10, px + 20, py + T - 10, px + 12, py + 10);
    g.fillStyle(tint).fillTriangle(px + 16, py + T - 9, px + 32, py + T - 9, px + 24, py + 4);
    g.fillStyle(0x9b6bff).fillTriangle(px + 28, py + T - 10, px + T - 7, py + T - 10, px + T - 12, py + 14);
    g.fillStyle(0xffffff, 0.7).fillTriangle(px + 22, py + 12, px + 25, py + 12, px + 24, py + 6);
  },
  burning(g, px, py, T, t) {
    g.fillStyle(0xc9a2ff, Math.min(1, t * 2.5)).fillCircle(px + T / 2, py + T / 2, (T / 2 - 4) * (0.5 + t * 0.5));
    g.fillStyle(0xffffff, Math.min(1, t * 2)).fillCircle(px + T / 2, py + T / 2, 6 * t + 2);
  },
};

export const THEMES: Record<ThemeId, ThemeArt> = {
  classic: CRYPT,
  ice: ICE,
  factory: FACTORY,
  portals: PORTALS,
};

/** Hielo resbaladizo (igual en todos los mundos: siempre es hielo). */
export function drawIce(g: G, px: number, py: number, x: number, y: number, T: number): void {
  g.fillStyle((x + y) % 2 === 0 ? 0x9fd8ef : 0x93d0ea).fillRect(px, py, T, T);
  g.lineStyle(1, 0xffffff, 0.55);
  const s = (x * 31 + y * 17) % 4;
  if (s === 0) g.lineBetween(px + 6, py + 30, px + 20, py + 22).lineBetween(px + 20, py + 22, px + 26, py + 34);
  else if (s === 1) g.lineBetween(px + 30, py + 6, px + 24, py + 18).lineBetween(px + 24, py + 18, px + 36, py + 26);
  else if (s === 2) g.lineBetween(px + 10, py + 10, px + 18, py + 16);
  g.fillStyle(0xffffff, 0.55).fillRect(px + 8, py + 10, 12, 3).fillRect(px + 26, py + 30, 9, 3);
}
