import { Rng } from './rng';
import { generateMap, parseLayout, MAPS, type MapId, type MapLayout } from './maps';
import { makeEnemy, updateEnemy, type Enemy } from './enemies';
import { ENEMIES, type EnemyKind, type StoryLevel } from './story';
import {
  CURSES, DIRS, DX, DY, FLOOR, NO_INPUT, OPPOSITE, POWER, TILE, conveyorDir,
  type Bomb, type Dir, type GameEvent, type Player, type PlayerInput, type PowerType,
} from './types';

/** Paso fijo de la simulación: 60 por segundo. */
export const STEP = 1 / 60;

export const FUSE = 2.5;
export const BASE_SPEED = 3.6; // casillas por segundo
export const SPEED_STEP = 0.55;
const FLAME_TIME = 0.55;
const BURN_TIME = 0.5;
const MAX_SPEED_LV = 6;
const MAX_BOMBS = 8;
const MAX_RANGE = 8;
const KICK_SPEED = 9;
const CONVEYOR_SPEED = 1.8;
const THROW_DIST = 3;
const SHIELD_INVULN = 1.5;
const CURSE_TIME = 10;
const POWER_CHANCE = 0.38;
const RAIN_INTERVAL = 0.4;
const RAIN_FUSE = 1.6;
const END_DELAY = 1.4;
const START_DELAY = 3;

const POWER_WEIGHTS: [PowerType, number][] = [
  [POWER.Bomb, 6],
  [POWER.Fire, 6],
  [POWER.Speed, 4],
  [POWER.Kick, 2],
  [POWER.Throw, 2],
  [POWER.Shield, 1.5],
  [POWER.Curse, 2],
];

export interface RoundConfig {
  players: number;
  seed: number;
  /** Segundos antes de que empiece la lluvia de bombas. */
  roundTime: number;
  map?: MapId;
  /** Mapa escrito a mano (tiene prioridad sobre `map`). */
  layout?: string[];
  /** Segundos de cuenta atrás antes de poder moverse (por defecto 3). */
  startDelay?: number;
  /** Probabilidad de que un bloque suelte power-up (por defecto 0.38). */
  powerChance?: number;
  /** Modo historia: nivel a jugar (un solo jugador contra enemigos). */
  story?: StoryLevel;
  /** Mejoras con las que empieza el jugador 0 (las arrastra entre niveles). */
  startStats?: PlayerStats;
}

/** Mejoras que el jugador conserva de un nivel a otro en el modo historia. */
export type PlayerStats = Pick<Player, 'maxBombs' | 'range' | 'speedLv' | 'kick' | 'throw' | 'shield'>;
export const BASE_STATS: PlayerStats = { maxBombs: 1, range: 2, speedLv: 0, kick: false, throw: false, shield: false };

const HUNTER_EVERY = 8;
const MAX_HUNTERS = 3;
const STORY_POWER_CHANCE = 0.06;

export type Phase = 'starting' | 'playing' | 'ending' | 'over';

export class Game {
  readonly w: number;
  readonly h: number;
  readonly mapId: Exclude<MapId, 'random'> | 'custom';
  readonly tiles: Uint8Array;
  readonly floor: Uint8Array;
  /** Casillas con portal. */
  readonly teleports: number[] = [];
  /** -1 = sin power-up */
  readonly powerups: Int8Array;
  /** Tiempo restante de llama en cada casilla. */
  readonly flames: Float32Array;
  /** Forma de la llama: 1 horizontal, 2 vertical, 4 centro. */
  readonly flameMask: Uint8Array;
  /** Bloques ardiendo: índice de casilla → tiempo restante. */
  readonly burning = new Map<number, number>();
  readonly players: Player[] = [];
  bombs: Bomb[] = [];
  /** Eventos para sonido y efectos. Quien los lee los vacía. */
  events: GameEvent[] = [];
  readonly rng: Rng;

  timeLeft: number;
  phase: Phase;
  /** Segundos de cuenta atrás que quedan (fase 'starting'). */
  startTimer: number;
  /** Id del ganador, o -1 si es empate. Válido cuando phase === 'over'. */
  winner = -1;
  private endTimer = 0;
  private rainTimer = 0;
  private nextBombId = 1;
  private readonly powerChance: number;

  // ---------- Modo historia ----------
  readonly mode: 'battle' | 'story';
  enemies: Enemy[] = [];
  /** Casilla de la puerta de salida (-1 si no hay). Está escondida bajo un bloque. */
  door = -1;
  doorOpen = false;
  score = 0;
  /** Cómo acabó el nivel. */
  result: 'clear' | 'dead' | null = null;
  /** Power-ups escondidos bajo bloques concretos. */
  private readonly hidden = new Map<number, PowerType>();
  private hunterTimer = 0;
  private huntersSpawned = 0;

  constructor(cfg: RoundConfig) {
    this.rng = new Rng(cfg.seed);
    let layout: MapLayout;
    if (cfg.layout) {
      layout = parseLayout(cfg.layout);
      this.mapId = 'custom';
    } else {
      let id = cfg.map ?? 'classic';
      if (id === 'random') {
        const options = MAPS.filter((m) => m.id !== 'random');
        id = options[this.rng.int(options.length)].id;
      }
      this.mapId = id as Exclude<MapId, 'random'>;
      const players = cfg.story ? 1 : cfg.players;
      layout = generateMap(this.mapId, players, () => this.rng.next(), cfg.story?.soft);
    }
    this.mode = cfg.story ? 'story' : 'battle';
    if (cfg.story) cfg = { ...cfg, players: 1, roundTime: cfg.story.time };
    this.w = layout.w;
    this.h = layout.h;
    this.tiles = layout.tiles;
    this.floor = layout.floor;
    const n = this.w * this.h;
    this.powerups = new Int8Array(n).fill(-1);
    this.flames = new Float32Array(n);
    this.flameMask = new Uint8Array(n);
    this.timeLeft = cfg.roundTime;
    this.startTimer = cfg.startDelay ?? START_DELAY;
    this.phase = this.startTimer > 0 ? 'starting' : 'playing';
    this.powerChance = cfg.powerChance ?? (cfg.story ? STORY_POWER_CHANCE : POWER_CHANCE);
    for (let k = 0; k < n; k++) if (this.floor[k] === FLOOR.Teleport) this.teleports.push(k);

    layout.spawns.slice(0, cfg.players).forEach(([x, y], id) => {
      this.players.push({
        id, x, y, alive: true, deadFor: 0,
        ...BASE_STATS,
        ...(id === 0 ? cfg.startStats : undefined),
        invuln: 0, curse: null, curseTime: 0,
        facing: 2, moving: false, iceDir: 0, tpLock: -1,
      });
    });

    if (cfg.story) this.setupStory(cfg.story);
  }

  private setupStory(level: StoryLevel): void {
    const [sx, sy] = this.tileOf(this.players[0]);
    const far = (k: number, min: number) =>
      Math.abs((k % this.w) - sx) + Math.abs(Math.floor(k / this.w) - sy) >= min;
    const pick = (list: number[]) => list.splice(this.rng.int(list.length), 1)[0];

    // Puerta y power-ups, escondidos bajo bloques rompibles.
    const softs: number[] = [];
    for (let k = 0; k < this.tiles.length; k++) if (this.tiles[k] === TILE.Soft) softs.push(k);
    const doorCandidates = softs.filter((k) => far(k, 6));
    if (doorCandidates.length || softs.length) {
      this.door = doorCandidates.length ? pick(doorCandidates) : pick(softs);
      const i = softs.indexOf(this.door);
      if (i >= 0) softs.splice(i, 1);
    }
    for (const pw of level.powerups) {
      if (softs.length) this.hidden.set(pick(softs), pw);
    }

    // Enemigos lejos del jugador.
    const empties: number[] = [];
    for (let k = 0; k < this.tiles.length; k++) {
      if (this.tiles[k] === TILE.Empty && this.floor[k] !== FLOOR.Teleport && far(k, 5)) empties.push(k);
    }
    if (level.boss && empties.length) {
      // El jefe empieza lo más lejos posible.
      empties.sort((a, b) => this.distFrom(b, sx, sy) - this.distFrom(a, sx, sy));
      const k = empties.shift()!;
      const boss = makeEnemy('boss', k % this.w, Math.floor(k / this.w), level.boss);
      this.enemies.push(boss);
    }
    for (const [kind, count] of Object.entries(level.enemies) as [EnemyKind, number][]) {
      for (let i = 0; i < count && empties.length; i++) {
        const k = pick(empties);
        this.enemies.push(makeEnemy(kind, k % this.w, Math.floor(k / this.w)));
      }
    }
  }

  private distFrom(k: number, x: number, y: number): number {
    return Math.abs((k % this.w) - x) + Math.abs(Math.floor(k / this.w) - y);
  }

  /** Mejoras actuales del jugador 0 (para pasarlas al siguiente nivel). */
  statsOf(id = 0): PlayerStats {
    const p = this.players[id];
    return { maxBombs: p.maxBombs, range: p.range, speedLv: p.speedLv, kick: p.kick, throw: p.throw, shield: p.shield };
  }

  aliveEnemies(): number {
    let c = 0;
    for (const e of this.enemies) if (e.alive && e.kind !== 'hunter') c++;
    return c;
  }

  // ---------- Consultas ----------

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  tileOf(p: { x: number; y: number }): [number, number] {
    return [Math.round(p.x), Math.round(p.y)];
  }

  bombAt(x: number, y: number): Bomb | undefined {
    return this.bombs.find((b) => b.tx === x && b.ty === y);
  }

  speedOf(p: Player): number {
    if (p.curse === 'slow') return BASE_SPEED * 0.55;
    if (p.curse === 'fast') return BASE_SPEED + (MAX_SPEED_LV + 3) * SPEED_STEP;
    return BASE_SPEED + p.speedLv * SPEED_STEP;
  }

  bombsOf(p: Player): number {
    let c = 0;
    for (const b of this.bombs) if (b.owner === p.id) c++;
    return c;
  }

  canPlaceBomb(p: Player): boolean {
    const [tx, ty] = this.tileOf(p);
    return p.alive
      && p.curse !== 'nobomb'
      && this.tiles[this.idx(tx, ty)] === TILE.Empty
      && !this.bombAt(tx, ty)
      && this.bombsOf(p) < p.maxBombs;
  }

  private canEnter(p: Player, x: number, y: number): boolean {
    if (!this.inBounds(x, y) || this.tiles[this.idx(x, y)] !== TILE.Empty) return false;
    const b = this.bombAt(x, y);
    return !b || b.passable.has(p.id) || b.flight !== null;
  }

  aliveCount(): number {
    let c = 0;
    for (const p of this.players) if (p.alive) c++;
    return c;
  }

  // ---------- Simulación ----------

  step(inputs: readonly PlayerInput[], dt = STEP): void {
    if (this.phase === 'over') return;

    if (this.phase === 'starting') {
      const before = Math.ceil(this.startTimer);
      this.startTimer -= dt;
      const now = Math.ceil(this.startTimer);
      if (this.startTimer <= 0) {
        this.startTimer = 0;
        this.phase = 'playing';
        this.events.push({ type: 'go' });
      } else if (now !== before) {
        this.events.push({ type: 'countdown', value: now });
      }
      for (const p of this.players) this.applyFloor(p, dt, false);
      return;
    }

    if (this.phase === 'playing') {
      const before = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (before > 0 && this.timeLeft === 0) this.events.push({ type: this.mode === 'story' ? 'hunters' : 'rainStart' });
      if (this.timeLeft === 0) {
        if (this.mode === 'story') this.updateHunters(dt);
        else this.updateRain(dt);
      }
    }

    for (const p of this.players) {
      if (!p.alive) {
        p.deadFor += dt;
        continue;
      }
      this.updatePlayer(p, inputs[p.id] ?? NO_INPUT, dt);
    }

    if (this.mode === 'story') this.updateEnemies(dt);
    this.spreadCurses();
    this.updateBombs(dt);
    this.updateFlames(dt);
    this.checkPlayers();
    if (this.mode === 'story') this.checkStory();
    this.checkEnd(dt);
  }

  // ---------- Modo historia ----------

  private updateEnemies(dt: number): void {
    const born: Enemy[] = [];
    for (const e of this.enemies) {
      const child = updateEnemy(this, e, dt);
      if (child) born.push(child);
    }
    this.enemies.push(...born);
    // Limpiar los que ya terminaron su animación de muerte.
    this.enemies = this.enemies.filter((e) => e.alive || e.deadFor < 1);

    const p = this.players[0];
    if (!p?.alive || this.phase !== 'playing') return;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const reach = e.boss ? 0.95 : 0.7;
      if (Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < reach) this.hurt(p);
    }
  }

  private updateHunters(dt: number): void {
    this.hunterTimer -= dt;
    if (this.hunterTimer > 0 || this.huntersSpawned >= MAX_HUNTERS) return;
    this.hunterTimer = HUNTER_EVERY;
    // Aparecen en la esquina más alejada del jugador.
    const p = this.players[0];
    const corners: [number, number][] = [[1, 1], [this.w - 2, 1], [1, this.h - 2], [this.w - 2, this.h - 2]];
    corners.sort((a, b) => Math.hypot(b[0] - p.x, b[1] - p.y) - Math.hypot(a[0] - p.x, a[1] - p.y));
    const [x, y] = corners[0];
    this.enemies.push(makeEnemy('hunter', x, y));
    this.huntersSpawned++;
  }

  /** Enemigos alcanzados por las llamas, puerta y salida. */
  private checkStory(): void {
    for (const e of this.enemies) {
      if (!e.alive || e.invuln > 0) continue;
      const k = this.idx(Math.round(e.x), Math.round(e.y));
      if (this.flames[k] <= 0) continue;
      e.hp--;
      if (e.hp > 0) {
        e.invuln = 1.5;
        this.events.push({ type: 'bossHit', x: e.x, y: e.y, hp: e.hp });
        continue;
      }
      e.alive = false;
      const points = ENEMIES[e.kind].points;
      this.score += points;
      this.events.push({ type: 'enemyDeath', x: e.x, y: e.y, points, boss: e.boss !== null });
    }

    if (!this.doorOpen && this.door >= 0 && this.aliveEnemies() === 0) {
      this.doorOpen = true;
      this.events.push({ type: 'doorOpen' });
    }

    const p = this.players[0];
    if (this.phase === 'playing' && p?.alive && this.doorOpen && this.tiles[this.door] === TILE.Empty) {
      const [tx, ty] = this.tileOf(p);
      if (this.idx(tx, ty) === this.door) {
        this.result = 'clear';
        this.score += Math.ceil(this.timeLeft) * 10;
        this.phase = 'ending';
        this.endTimer = 1.2;
        this.events.push({ type: 'clear' });
      }
    }
  }

  /** Daño al jugador: el escudo lo para; si no, muere. */
  private hurt(p: Player): void {
    if (!p.alive || p.invuln > 0) return;
    if (p.shield) {
      p.shield = false;
      p.invuln = SHIELD_INVULN;
      this.events.push({ type: 'shieldBreak', player: p.id });
      return;
    }
    p.alive = false;
    p.moving = false;
    this.events.push({ type: 'death', player: p.id });
  }

  private updatePlayer(p: Player, input: PlayerInput, dt: number): void {
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.curse) {
      p.curseTime -= dt;
      if (p.curseTime <= 0) {
        p.curse = null;
        p.curseTime = 0;
      }
    }

    let dir = input.dir;
    if (p.curse === 'reverse') dir = OPPOSITE[dir];

    const [tx, ty] = this.tileOf(p);
    const onIce = this.floor[this.idx(tx, ty)] === FLOOR.Ice;
    const speed = this.speedOf(p);
    if (onIce) {
      if (dir) p.iceDir = dir;
      else dir = p.iceDir;
    } else if (p.iceDir && !dir) {
      // Recién salido del hielo: terminar el patinazo en el centro de la casilla.
      const d = p.iceDir;
      const along = DX[d] ? (tx - p.x) * DX[d] : (ty - p.y) * DY[d];
      if (along > 1e-6) this.move(p, d, Math.min(along, speed * dt), false);
      if (along <= speed * dt) p.iceDir = 0;
    } else {
      p.iceDir = 0;
    }

    const ox = p.x;
    const oy = p.y;
    this.move(p, dir, speed * dt, true);
    if (onIce && dir && p.x === ox && p.y === oy) p.iceDir = 0;

    this.applyFloor(p, dt, true);

    // Bomba: si estoy encima de una y sé lanzar, la lanzo; si no, pongo una.
    if (input.bomb && p.throw) {
      const [bx, by] = this.tileOf(p);
      const under = this.bombAt(bx, by);
      if (under && !under.flight && this.throwBomb(p, under)) return;
    }
    if (input.bomb || p.curse === 'diarrhea') this.placeBomb(p);
  }

  /** Cintas y portales. */
  private applyFloor(p: Player, dt: number, teleports: boolean): void {
    if (!p.alive) return;
    let [tx, ty] = this.tileOf(p);
    let k = this.idx(tx, ty);
    const conv = conveyorDir(this.floor[k]);
    if (conv) {
      this.move(p, conv, CONVEYOR_SPEED * dt, false);
      [tx, ty] = this.tileOf(p);
      k = this.idx(tx, ty);
    }
    if (k !== p.tpLock) p.tpLock = -1;
    if (!teleports || this.floor[k] !== FLOOR.Teleport || p.tpLock === k) return;
    const targets = this.teleports.filter((t) => t !== k && !this.bombAt(t % this.w, Math.floor(t / this.w)));
    if (targets.length === 0) return;
    const dest = targets[this.rng.int(targets.length)];
    p.x = dest % this.w;
    p.y = Math.floor(dest / this.w);
    p.tpLock = dest;
    p.iceDir = 0;
    this.events.push({ type: 'teleport', player: p.id, fromX: tx, fromY: ty, x: p.x, y: p.y });
  }

  /**
   * Movimiento libre con ayuda en las esquinas: el jugador se alinea solo con
   * el pasillo y, si choca con una esquina, se desliza hacia el hueco libre.
   * `own` = lo mueve el propio jugador (cambia hacia dónde mira y puede patear).
   */
  private move(p: Player, dir: Dir, dist: number, own: boolean): void {
    if (own) {
      p.moving = dir !== 0;
      if (dir) p.facing = dir;
    }
    if (dir === 0) return;

    const horiz = dir === 3 || dir === 4;
    const s = horiz ? DX[dir] : DY[dir];
    let pa = horiz ? p.x : p.y; // eje en el que avanza
    let pb = horiz ? p.y : p.x; // eje perpendicular
    const ca = Math.round(pa);
    const cb = Math.round(pb);
    const free = (a: number, b: number) => (horiz ? this.canEnter(p, a, b) : this.canEnter(p, b, a));
    const off = pb - cb;

    if (free(ca + s, cb)) {
      // Alinearse con el pasillo y avanzar con lo que sobre.
      let rest = dist;
      if (Math.abs(off) > 1e-6) {
        const m = Math.min(Math.abs(off), rest);
        pb -= Math.sign(off) * m;
        rest -= m;
      }
      pa += s * rest;
    } else {
      const toCenter = s * (ca - pa);
      if (toCenter > 1e-6) {
        pa += s * Math.min(dist, toCenter);
      } else if (own && Math.abs(off) < 0.15 && p.kick && this.tryKick(p, dir, horiz ? ca + s : cb, horiz ? cb : ca + s)) {
        // bomba pateada
      } else if (own && Math.abs(off) > 1e-6) {
        // Ayuda en esquinas: deslizarse hacia el lado abierto.
        const t = Math.sign(off);
        if (free(ca + s, cb + t) && free(ca, cb + t)) pb += t * Math.min(dist, Math.abs(cb + t - pb));
      }
    }

    if (horiz) { p.x = pa; p.y = pb; } else { p.y = pa; p.x = pb; }
  }

  private tryKick(p: Player, dir: Dir, bx: number, by: number): boolean {
    const b = this.bombAt(bx, by);
    if (!b || b.slide !== 0 || b.flight || b.passable.has(p.id)) return false;
    if (this.blockedForBomb(bx + DX[dir], by + DY[dir])) return false;
    b.slide = dir;
    b.slideSpeed = KICK_SPEED;
    b.offset = 0;
    b.passable.clear();
    this.events.push({ type: 'kick' });
    return true;
  }

  private throwBomb(p: Player, b: Bomb): boolean {
    const dir: Dir = p.facing || 2;
    let x = b.tx + DX[dir] * THROW_DIST;
    let y = b.ty + DY[dir] * THROW_DIST;
    // Si cae en algo ocupado, sigue rebotando hacia delante.
    while (this.inBounds(x, y) && (this.tiles[this.idx(x, y)] !== TILE.Empty || this.bombAt(x, y))) {
      x += DX[dir];
      y += DY[dir];
    }
    if (!this.inBounds(x, y)) {
      // Se saldría del mapa: buscar el hueco libre más lejano antes.
      let found = false;
      for (let d = THROW_DIST - 1; d >= 1; d--) {
        x = b.tx + DX[dir] * d;
        y = b.ty + DY[dir] * d;
        if (this.inBounds(x, y) && this.tiles[this.idx(x, y)] === TILE.Empty && !this.bombAt(x, y)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    const dist = Math.abs(x - b.tx) + Math.abs(y - b.ty);
    b.flight = { fromX: b.tx, fromY: b.ty, t: 0, dur: 0.25 + dist * 0.06 };
    b.tx = x;
    b.ty = y;
    b.slide = 0;
    b.offset = 0;
    b.passable.clear();
    this.events.push({ type: 'throw' });
    return true;
  }

  private placeBomb(p: Player): void {
    if (!this.canPlaceBomb(p)) return;
    const [tx, ty] = this.tileOf(p);
    this.addBomb(p.id, tx, ty, p.range, FUSE);
  }

  private addBomb(owner: number, tx: number, ty: number, range: number, fuse: number): void {
    const passable = new Set<number>();
    for (const q of this.players) {
      if (q.alive && Math.abs(q.x - tx) < 1 && Math.abs(q.y - ty) < 1) passable.add(q.id);
    }
    this.bombs.push({
      id: this.nextBombId++, owner, tx, ty, fuse, range, passable,
      slide: 0, slideSpeed: 0, offset: 0, flight: null,
    });
    this.events.push({ type: 'bomb', x: tx, y: ty });
  }

  private blockedForBomb(x: number, y: number): boolean {
    if (!this.inBounds(x, y) || this.tiles[this.idx(x, y)] !== TILE.Empty) return true;
    if (this.bombAt(x, y)) return true;
    return this.players.some((q) => q.alive && Math.round(q.x) === x && Math.round(q.y) === y);
  }

  private spreadCurses(): void {
    const alive = this.players.filter((p) => p.alive);
    for (const a of alive) {
      if (!a.curse) continue;
      for (const b of alive) {
        if (b === a || b.curse) continue;
        if (Math.abs(a.x - b.x) < 0.8 && Math.abs(a.y - b.y) < 0.8) {
          b.curse = a.curse;
          b.curseTime = CURSE_TIME;
          this.events.push({ type: 'curse', player: b.id, curse: b.curse });
        }
      }
    }
  }

  private updateRain(dt: number): void {
    this.rainTimer -= dt;
    if (this.rainTimer > 0) return;
    this.rainTimer = RAIN_INTERVAL;
    for (let tries = 0; tries < 25; tries++) {
      const x = 1 + this.rng.int(this.w - 2);
      const y = 1 + this.rng.int(this.h - 2);
      if (this.tiles[this.idx(x, y)] === TILE.Empty && !this.bombAt(x, y)) {
        this.addBomb(-1, x, y, 2, RAIN_FUSE);
        return;
      }
    }
  }

  private updateBombs(dt: number): void {
    for (const b of this.bombs) {
      b.fuse -= dt;

      if (b.flight) {
        b.flight.t += dt;
        if (b.flight.t >= b.flight.dur) {
          b.flight = null;
          for (const q of this.players) {
            if (q.alive && Math.round(q.x) === b.tx && Math.round(q.y) === b.ty) b.passable.add(q.id);
          }
          this.events.push({ type: 'land', x: b.tx, y: b.ty });
        } else {
          b.fuse = Math.max(b.fuse, 0.05); // no explota en el aire
          continue;
        }
      }

      // Quien se ha salido de la bomba ya no puede volver a entrar.
      for (const id of b.passable) {
        const q = this.players[id];
        if (!q.alive || Math.round(q.x) !== b.tx || Math.round(q.y) !== b.ty) b.passable.delete(id);
      }

      // Las cintas arrastran las bombas quietas.
      if (b.slide === 0) {
        const conv = conveyorDir(this.floor[this.idx(b.tx, b.ty)]);
        if (conv && !this.blockedForBomb(b.tx + DX[conv], b.ty + DY[conv])) {
          b.slide = conv;
          b.slideSpeed = CONVEYOR_SPEED;
          b.offset = 0;
        }
      }

      if (b.slide !== 0) {
        const nx = b.tx + DX[b.slide];
        const ny = b.ty + DY[b.slide];
        if (b.offset === 0 && this.blockedForBomb(nx, ny)) {
          b.slide = 0;
        } else {
          b.offset += b.slideSpeed * dt;
          if (b.offset >= 1) {
            b.tx = nx;
            b.ty = ny;
            b.offset = 0;
            b.passable.clear();
            // Al salir de una cinta (o cambiar de sentido) deja de arrastrarse.
            if (b.slideSpeed === CONVEYOR_SPEED) {
              const conv = conveyorDir(this.floor[this.idx(nx, ny)]);
              if (conv !== b.slide) b.slide = 0;
            }
          }
        }
      }
      // Una bomba que entra en una llama explota.
      if (this.flames[this.idx(b.tx, b.ty)] > 0) b.fuse = 0;
    }

    let again = true;
    while (again) {
      again = false;
      for (const b of this.bombs.slice()) {
        if (b.fuse <= 0 && !b.flight && this.bombs.includes(b)) {
          this.explode(b);
          again = true;
        }
      }
    }
  }

  private explode(b: Bomb): void {
    this.bombs = this.bombs.filter((o) => o !== b);
    this.events.push({ type: 'explode', x: b.tx, y: b.ty });
    this.addFlame(b.tx, b.ty, 4);
    for (const d of DIRS) {
      const mask = d >= 3 ? 1 : 2;
      for (let i = 1; i <= b.range; i++) {
        const x = b.tx + DX[d] * i;
        const y = b.ty + DY[d] * i;
        if (!this.inBounds(x, y)) break;
        const k = this.idx(x, y);
        const t = this.tiles[k];
        if (t === TILE.Solid || t === TILE.Burning) break;
        if (t === TILE.Soft) {
          this.tiles[k] = TILE.Burning;
          this.burning.set(k, BURN_TIME);
          break;
        }
        const other = this.bombAt(x, y);
        if (other && !other.flight) {
          other.fuse = 0; // reacción en cadena
          this.addFlame(x, y, mask);
          break;
        }
        if (this.powerups[k] >= 0) {
          this.powerups[k] = -1;
          this.addFlame(x, y, mask);
          break;
        }
        this.addFlame(x, y, mask);
      }
    }
  }

  private addFlame(x: number, y: number, mask: number): void {
    const k = this.idx(x, y);
    this.flames[k] = FLAME_TIME;
    this.flameMask[k] |= mask;
  }

  private updateFlames(dt: number): void {
    for (let k = 0; k < this.flames.length; k++) {
      if (this.flames[k] > 0) {
        this.flames[k] -= dt;
        if (this.flames[k] <= 0) {
          this.flames[k] = 0;
          this.flameMask[k] = 0;
        }
      }
    }
    for (const [k, t] of this.burning) {
      const left = t - dt;
      if (left > 0) {
        this.burning.set(k, left);
        continue;
      }
      this.burning.delete(k);
      this.tiles[k] = TILE.Empty;
      // Lago helado: el cubo de hielo derretido deja un charco que se congela.
      if (this.mapId === 'ice' && this.floor[k] === FLOOR.Normal) {
        this.floor[k] = FLOOR.Ice;
        this.events.push({ type: 'freeze', x: k % this.w, y: Math.floor(k / this.w) });
      }
      const hidden = this.hidden.get(k);
      if (hidden !== undefined) {
        this.powerups[k] = hidden;
        this.hidden.delete(k);
      } else if (k === this.door) {
        this.events.push({ type: 'doorFound', x: k % this.w, y: Math.floor(k / this.w) });
      } else if (this.rng.next() < this.powerChance) {
        this.powerups[k] = this.randomPower(this.mode === 'story');
      }
    }
  }

  private randomPower(noCurse = false): PowerType {
    const weights = noCurse ? POWER_WEIGHTS.filter(([p]) => p !== POWER.Curse) : POWER_WEIGHTS;
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let r = this.rng.next() * total;
    for (const [p, w] of weights) {
      r -= w;
      if (r < 0) return p;
    }
    return POWER.Bomb;
  }

  /** Pone un power-up en una casilla (para tests y modos especiales). */
  dropPowerup(x: number, y: number, power: PowerType): void {
    this.powerups[this.idx(x, y)] = power;
  }

  private checkPlayers(): void {
    for (const p of this.players) {
      if (!p.alive) continue;
      const [tx, ty] = this.tileOf(p);
      const k = this.idx(tx, ty);
      if (this.flames[k] > 0 && p.invuln <= 0) {
        this.hurt(p);
        if (!p.alive) continue;
      }
      const pw = this.powerups[k];
      if (pw >= 0) {
        this.powerups[k] = -1;
        this.applyPower(p, pw as PowerType);
        this.events.push({ type: 'pickup', player: p.id, power: pw as PowerType, x: tx, y: ty });
      }
    }
  }

  private applyPower(p: Player, pw: PowerType): void {
    switch (pw) {
      case POWER.Bomb: p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1); break;
      case POWER.Fire: p.range = Math.min(MAX_RANGE, p.range + 1); break;
      case POWER.Speed: p.speedLv = Math.min(MAX_SPEED_LV, p.speedLv + 1); break;
      case POWER.Kick: p.kick = true; break;
      case POWER.Throw: p.throw = true; break;
      case POWER.Shield: p.shield = true; break;
      case POWER.Curse:
        p.curse = CURSES[this.rng.int(CURSES.length)];
        p.curseTime = CURSE_TIME;
        this.events.push({ type: 'curse', player: p.id, curse: p.curse });
        break;
    }
  }

  private checkEnd(dt: number): void {
    if (this.mode === 'story') {
      if (this.phase === 'playing' && !this.players[0].alive) {
        this.result = 'dead';
        this.phase = 'ending';
        this.endTimer = END_DELAY;
      } else if (this.phase === 'ending') {
        this.endTimer -= dt;
        if (this.endTimer <= 0) {
          this.winner = this.result === 'clear' ? 0 : -1;
          this.phase = 'over';
        }
      }
      return;
    }
    if (this.phase === 'playing' && this.aliveCount() <= 1) {
      this.phase = 'ending';
      this.endTimer = END_DELAY;
    } else if (this.phase === 'ending') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        const alive = this.players.filter((p) => p.alive);
        this.winner = alive.length === 1 ? alive[0].id : -1;
        this.phase = 'over';
      }
    }
  }
}
