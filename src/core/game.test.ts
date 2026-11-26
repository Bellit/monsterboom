import { describe, expect, it } from 'vitest';
import { Game, STEP, FUSE } from './game';
import { BotBrain } from './ai';
import { POWER, TILE, type Dir, type PlayerInput } from './types';
import { MAPS } from './maps';

/** Crea una partida de prueba sin cuenta atrás ni power-ups aleatorios. */
function make(layout: string[], players = 2) {
  return new Game({ players, seed: 1, roundTime: 999, layout, startDelay: 0, powerChance: 0 });
}

/** Avanza `secs` segundos con el jugador 0 haciendo `dir` (y bomba en el primer paso si se pide). */
function run(g: Game, secs: number, dir: Dir = 0, bomb = false, others: PlayerInput = { dir: 0, bomb: false }) {
  const steps = Math.round(secs / STEP);
  for (let i = 0; i < steps; i++) {
    g.step([{ dir, bomb: bomb && i === 0 }, others, others, others]);
  }
}

const OPEN = [
  '#########',
  '#0......#',
  '#.#.#.#.#',
  '#.......#',
  '#.#.#.#.#',
  '#......1#',
  '#########',
];

describe('movimiento', () => {
  it('avanza por un pasillo libre', () => {
    const g = make(OPEN);
    run(g, 0.5, 4);
    expect(g.players[0].x).toBeGreaterThan(2.5);
    expect(g.players[0].y).toBe(1);
  });

  it('no atraviesa muros', () => {
    const g = make(OPEN);
    run(g, 1, 1);
    expect(g.players[0].y).toBe(1);
  });

  it('se desliza en las esquinas hacia el pasillo', () => {
    const g = make(OPEN);
    run(g, 0.15, 4); // x ≈ 1.5, entre dos columnas
    const p = g.players[0];
    expect(p.x).toBeGreaterThan(1.3);
    run(g, 0.6, 2); // abajo: hay un pilar en (2,2), debe colocarse en x=1 o x=3
    expect([1, 3]).toContain(Math.round(p.x));
    expect(p.y).toBeGreaterThan(1.5);
    expect(Math.abs(p.x - Math.round(p.x))).toBeLessThan(0.01);
  });
});

describe('bombas', () => {
  it('explota a los 2,5 s y rompe bloques', () => {
    const g = make([
      '#######',
      '#0..+.#',
      '#.#####',
      '#.....#',
      '#####1#',
      '#######',
    ]);
    run(g, STEP, 0, true);
    expect(g.bombs).toHaveLength(1);
    run(g, 0.4, 2); // a (1,2): fuera del alcance horizontal, pero dentro del vertical (alcance 2)
    run(g, 0.4, 2); // a (1,3): sigue en alcance 2 hacia abajo
    run(g, 0.4, 4); // a (2,3): a salvo
    run(g, FUSE);
    expect(g.bombs).toHaveLength(0);
    expect(g.players[0].alive).toBe(true);
    // El bloque de (4,1) estaba a 3 casillas: alcance 2, no se rompe.
    expect(g.tiles[g.idx(4, 1)]).toBe(TILE.Soft);
  });

  it('mata a quien se queda en la explosión', () => {
    const g = make(OPEN);
    run(g, STEP, 0, true);
    run(g, FUSE + 0.1);
    expect(g.players[0].alive).toBe(false);
  });

  it('no se puede volver a entrar en la bomba propia', () => {
    const g = make(OPEN);
    run(g, STEP, 0, true);
    run(g, 0.4, 4); // salir hacia la derecha
    const x = g.players[0].x;
    run(g, 0.4, 3); // intentar volver
    expect(g.players[0].x).toBeGreaterThanOrEqual(1.99);
    expect(x).toBeGreaterThan(1.9);
  });

  it('las explosiones encadenan otras bombas', () => {
    const g = make([
      '#########',
      '#0.....1#',
      '#########',
    ]);
    const p = g.players[0];
    p.maxBombs = 2;
    run(g, STEP, 0, true); // bomba en (1,1)
    run(g, 0.5, 4);
    run(g, STEP, 0, true); // segunda bomba más a la derecha, al alcance de la primera
    expect(g.bombs).toHaveLength(2);
    run(g, FUSE - 0.4); // la primera explota y arrastra a la segunda
    expect(g.bombs).toHaveLength(0);
  });

  it('el escudo aguanta una explosión', () => {
    const g = make(OPEN);
    g.players[0].shield = true;
    run(g, STEP, 0, true);
    run(g, FUSE + 0.1);
    expect(g.players[0].alive).toBe(true);
    expect(g.players[0].shield).toBe(false);
  });
});

describe('power-ups', () => {
  it('se recogen al pisarlos', () => {
    const g = make(OPEN);
    g.dropPowerup(2, 1, POWER.Fire);
    run(g, 0.4, 4);
    expect(g.players[0].range).toBe(3);
    expect(g.powerups[g.idx(2, 1)]).toBe(-1);
  });

  it('patear desliza la bomba hasta chocar', () => {
    const g = make([
      '#########',
      '#0......#',
      '#########',
      '#1......#',
      '#########',
    ]);
    const p = g.players[0];
    p.kick = true;
    run(g, 0.3, 4);
    // Bomba colocada a mano delante del jugador.
    run(g, STEP, 0, true);
    run(g, 0.4, 3); // volver a la izquierda
    run(g, 0.5, 4); // patear hacia la derecha
    run(g, 1);
    expect(g.bombs[0].tx).toBe(7);
  });

  it('lanzar manda la bomba por encima de los bloques', () => {
    const g = make([
      '#########',
      '#0.++...#',
      '#########',
      '#1......#',
      '#########',
    ]);
    const p = g.players[0];
    p.throw = true;
    p.facing = 4;
    run(g, STEP, 0, true); // poner
    run(g, STEP, 0, true); // lanzar
    run(g, 0.6);
    expect(g.bombs[0].tx).toBe(5);
    expect(g.bombs[0].flight).toBeNull();
  });

  it('la maldición se contagia al tocar a otro', () => {
    const g = make([
      '#######',
      '#0.1..#',
      '#######',
    ]);
    g.players[0].curse = 'slow';
    g.players[0].curseTime = 10;
    run(g, 1, 4);
    expect(g.players[1].curse).toBe('slow');
  });
});

describe('suelos especiales', () => {
  it('los portales llevan a otro portal', () => {
    const g = make([
      '#########',
      '#0T....T#',
      '#########',
      '#1......#',
      '#########',
    ]);
    run(g, 0.4, 4);
    expect(Math.round(g.players[0].x)).toBeGreaterThanOrEqual(6);
  });

  it('las cintas arrastran al jugador', () => {
    const g = make([
      '#########',
      '#0>>>>>.#',
      '#########',
      '#1......#',
      '#########',
    ]);
    run(g, 0.3, 4);
    run(g, 2);
    expect(g.players[0].x).toBeGreaterThan(5);
  });

  it('en el hielo se patina sin soltar', () => {
    const g = make([
      '#########',
      '#0~~~~~.#',
      '#########',
      '#1......#',
      '#########',
    ]);
    run(g, 0.2, 4);
    run(g, 2); // sin tocar nada
    expect(g.players[0].x).toBeCloseTo(7, 1);
  });
});

describe('ronda', () => {
  it('hay cuenta atrás antes de poder moverse', () => {
    const g = new Game({ players: 2, seed: 1, roundTime: 60, layout: OPEN });
    run(g, 1, 4);
    expect(g.phase).toBe('starting');
    expect(g.players[0].x).toBe(1);
  });

  it('termina con un ganador cuando queda uno', () => {
    const g = make(OPEN);
    run(g, STEP, 0, true);
    run(g, FUSE + 2);
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(1);
  });

  it('un bot con guante lanza la bomba a un rival alineado', () => {
    const g = make([
      '###########',
      '#0...1....#',
      '###########',
    ]);
    g.players[0].throw = true;
    g.players[1].x = 4; // rival a 3 casillas
    const bot = new BotBrain(0, 'hard');
    let thrown = false;
    for (let i = 0; i < 30 && !thrown; i++) {
      g.step([bot.update(g, STEP), { dir: 0, bomb: false }]);
      thrown = g.events.some((e) => e.type === 'throw');
      g.events.length = 0;
    }
    expect(thrown).toBe(true);
  });

  it.each(MAPS.filter((m) => m.id !== 'random').map((m) => m.id))('los bots terminan partidas en el mapa %s', (map) => {
    for (const players of [4, 8]) {
      const g = new Game({ players, seed: 7, roundTime: 90, map, startDelay: 0 });
      const bots = g.players.map((p) => new BotBrain(p.id, 'hard'));
      let t = 0;
      while (g.phase !== 'over' && t < 300) {
        g.step(bots.map((b) => b.update(g, STEP)));
        g.events.length = 0;
        t += STEP;
      }
      expect(g.phase).toBe('over');
    }
  });
});
