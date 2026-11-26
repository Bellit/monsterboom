import { describe, expect, it } from 'vitest';
import { Game, STEP, FUSE } from './game';
import { makeEnemy } from './enemies';
import { WORLDS, levelIndex, nextLevel, posFromIndex, type StoryLevel } from './story';
import { TILE, type Dir } from './types';

const EMPTY_LEVEL: StoryLevel = { enemies: {}, powerups: [], soft: 0, time: 200 };

function make(layout: string[], level: StoryLevel = EMPTY_LEVEL) {
  return new Game({ players: 1, seed: 1, roundTime: 200, layout, story: level, startDelay: 0 });
}

function run(g: Game, secs: number, dir: Dir = 0, bomb = false) {
  const steps = Math.round(secs / STEP);
  for (let i = 0; i < steps; i++) g.step([{ dir, bomb: bomb && i === 0 }]);
}

const CORRIDOR = [
  '###########',
  '#0........#',
  '#.#.#.#.#.#',
  '#.........#',
  '###########',
];

describe('modo historia', () => {
  it('cada nivel de cada mundo se monta con sus enemigos, puerta y power-ups', () => {
    WORLDS.forEach((world, wi) => {
      world.levels.forEach((level, li) => {
        const g = new Game({ players: 1, seed: wi * 10 + li, roundTime: 0, map: world.theme, story: level });
        const expected = Object.values(level.enemies).reduce((a, b) => a + b, 0) + (level.boss ? 1 : 0);
        expect(g.enemies.length, `${wi + 1}-${li + 1}`).toBe(expected);
        expect(g.door).toBeGreaterThanOrEqual(0);
        expect(g.tiles[g.door]).toBe(TILE.Soft);
        expect(g.players).toHaveLength(1);
        expect(g.timeLeft).toBe(level.time);
      });
    });
  });

  it('matar a todos abre la puerta y pisarla supera el nivel', () => {
    const g = make(CORRIDOR);
    g.door = g.idx(9, 1);
    g.enemies.push(makeEnemy('slime', 3, 1));
    g.enemies[0].speed = 0; // quieta para el test
    run(g, STEP, 0, true); // bomba en (1,1): alcance 2 llega a (3,1)
    run(g, 0.5, 2); // bajar a (1,3)… alcance vertical 2: sigue al alcance
    run(g, 0.4, 4); // a (2,3): a salvo
    run(g, FUSE);
    expect(g.enemies.filter((e) => e.alive)).toHaveLength(0);
    expect(g.score).toBe(100);
    expect(g.doorOpen).toBe(true);
    // Ir a la puerta (9,1)
    run(g, 2.2, 4);
    run(g, 0.8, 1);
    expect(g.result).toBe('clear');
    run(g, 2);
    expect(g.phase).toBe('over');
  });

  it('tocar a un enemigo mata al jugador (salvo con escudo)', () => {
    const g = make(CORRIDOR);
    g.enemies.push(makeEnemy('slime', 2, 1));
    g.enemies[0].speed = 0;
    g.players[0].shield = true;
    run(g, 0.4, 4);
    expect(g.players[0].alive).toBe(true);
    expect(g.players[0].shield).toBe(false);
    run(g, 2); // quieto encima: al acabar la invulnerabilidad, muere
    expect(g.players[0].alive).toBe(false);
    run(g, 2);
    expect(g.result).toBe('dead');
  });

  it('el jefe aguanta varios golpes', () => {
    const g = make(CORRIDOR);
    const boss = makeEnemy('boss', 3, 1, { name: 'Test', hp: 2, color: 0, spawns: 'slime', spawnEvery: 999 });
    boss.speed = 0;
    g.enemies.push(boss);
    g.players[0].maxBombs = 3;
    run(g, STEP, 0, true);
    run(g, 0.5, 2);
    run(g, 0.4, 4);
    run(g, FUSE);
    expect(boss.alive).toBe(true);
    expect(boss.hp).toBe(1);
  });

  it('al acabarse el tiempo llegan los cazadores', () => {
    const g = new Game({ players: 1, seed: 1, roundTime: 0, layout: CORRIDOR, story: { ...EMPTY_LEVEL, time: 1 }, startDelay: 0 });
    run(g, 1.5);
    expect(g.enemies.some((e) => e.kind === 'hunter')).toBe(true);
    // La puerta no depende de los cazadores.
    expect(g.aliveEnemies()).toBe(0);
  });

  it('las mejoras pasan al nivel siguiente', () => {
    const g = new Game({
      players: 1, seed: 1, roundTime: 0, layout: CORRIDOR, story: EMPTY_LEVEL, startDelay: 0,
      startStats: { maxBombs: 3, range: 4, speedLv: 2, kick: true, throw: false, shield: false },
    });
    expect(g.statsOf()).toMatchObject({ maxBombs: 3, range: 4, speedLv: 2, kick: true });
  });

  it('numera los niveles en orden para el selector', () => {
    expect(levelIndex({ world: 0, level: 0 })).toBe(0);
    expect(levelIndex({ world: 1, level: 2 })).toBe(WORLDS[0].levels.length + 2);
    let pos: { world: number; level: number } | null = { world: 0, level: 0 };
    for (let i = 0; pos; i++) {
      expect(levelIndex(pos)).toBe(i);
      expect(posFromIndex(i)).toEqual(pos);
      pos = nextLevel(pos);
    }
    expect(posFromIndex(999)).toBeNull();
    expect(posFromIndex(-1)).toBeNull();
  });

  it('recorre los mundos en orden y termina', () => {
    let pos: { world: number; level: number } | null = { world: 0, level: 0 };
    let count = 0;
    while (pos) {
      count++;
      pos = nextLevel(pos);
    }
    expect(count).toBe(WORLDS.reduce((s, w) => s + w.levels.length, 0));
  });

  it('los enemigos se mueven sin atravesar muros', () => {
    const g = new Game({ players: 1, seed: 3, roundTime: 0, map: 'classic', story: WORLDS[0].levels[3], startDelay: 0 });
    run(g, 20);
    for (const e of g.enemies) {
      const t = g.tiles[g.idx(Math.round(e.x), Math.round(e.y))];
      expect(t === TILE.Solid || (t === TILE.Soft && !e.ghost)).toBe(false);
    }
  });
});
