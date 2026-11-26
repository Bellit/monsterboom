import { Rng } from './rng';
import {
  DIRS, DX, DY, NO_INPUT, POWER, TILE,
  type Bomb, type Dir, type GameEvent, type Player, type PlayerInput, type PowerType,
} from './types';

/** Paso fijo de la simulación: 60 por segundo. */
export const STEP = 1 / 60;

export const FUSE = 2.5;
const FLAME_TIME = 0.55;
const BURN_TIME = 0.5;
const BASE_SPEED = 3.6; // casillas por segundo
const SPEED_STEP = 0.55;
const MAX_SPEED_LV = 6;
const MAX_BOMBS = 8;
const MAX_RANGE = 8;
const KICK_SPEED = 9;
const POWER_CHANCE = 0.35;
const RAIN_INTERVAL = 0.4;
const RAIN_FUSE = 1.6;
const END_DELAY = 1.4;

const POWER_WEIGHTS: [PowerType, number][] = [
  [POWER.Bomb, 3],
  [POWER.Fire, 3],
  [POWER.Speed, 2],
  [POWER.Kick, 1],
];

export interface RoundConfig {
  players: number;
  seed: number;
  /** Segundos antes de que empiece la lluvia de bombas. */
  roundTime: number;
}

export type Phase = 'playing' | 'ending' | 'over';

export class Game {
  readonly w: number;
  readonly h: number;
  readonly tiles: Uint8Array;
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
  phase: Phase = 'playing';
  /** Id del ganador, o -1 si es empate. Válido cuando phase === 'over'. */
  winner = -1;
  private endTimer = 0;
  private rainTimer = 0;
  private nextBombId = 1;

  constructor(cfg: RoundConfig) {
    this.rng = new Rng(cfg.seed);
    const size = cfg.players <= 4 ? { w: 15, h: 13 } : { w: 19, h: 15 };
    this.w = size.w;
    this.h = size.h;
    const n = this.w * this.h;
    this.tiles = new Uint8Array(n);
    this.powerups = new Int8Array(n).fill(-1);
    this.flames = new Float32Array(n);
    this.flameMask = new Uint8Array(n);
    this.timeLeft = cfg.roundTime;

    const spawns = this.spawnPoints().slice(0, cfg.players);
    this.generate(spawns);
    spawns.forEach(([x, y], id) => {
      this.players.push({
        id, x, y, alive: true, deadFor: 0,
        maxBombs: 1, range: 2, speedLv: 0, kick: false,
        facing: 2, moving: false,
      });
    });
  }

  // ---------- Mapa ----------

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  private spawnPoints(): [number, number][] {
    const { w, h } = this;
    const cx = Math.floor(w / 2) % 2 === 1 ? Math.floor(w / 2) : Math.floor(w / 2) - 1;
    const cy = Math.floor(h / 2) % 2 === 1 ? Math.floor(h / 2) : Math.floor(h / 2) - 1;
    return [
      [1, 1], [w - 2, h - 2], [w - 2, 1], [1, h - 2],
      [cx, 1], [cx, h - 2], [1, cy], [w - 2, cy],
    ];
  }

  private generate(spawns: [number, number][]): void {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        const pillar = x % 2 === 0 && y % 2 === 0;
        let t: number = TILE.Empty;
        if (border || pillar) t = TILE.Solid;
        else if (this.rng.next() < 0.72) t = TILE.Soft;
        this.tiles[this.idx(x, y)] = t;
      }
    }
    // Despejar la salida de cada jugador.
    for (const [sx, sy] of spawns) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 1) continue;
          const i = this.idx(sx + dx, sy + dy);
          if (this.tiles[i] === TILE.Soft) this.tiles[i] = TILE.Empty;
        }
      }
    }
  }

  // ---------- Consultas ----------

  tileOf(p: { x: number; y: number }): [number, number] {
    return [Math.round(p.x), Math.round(p.y)];
  }

  bombAt(x: number, y: number): Bomb | undefined {
    return this.bombs.find((b) => b.tx === x && b.ty === y);
  }

  speedOf(p: Player): number {
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
      && this.tiles[this.idx(tx, ty)] === TILE.Empty
      && !this.bombAt(tx, ty)
      && this.bombsOf(p) < p.maxBombs;
  }

  private canEnter(p: Player, x: number, y: number): boolean {
    if (!this.inBounds(x, y) || this.tiles[this.idx(x, y)] !== TILE.Empty) return false;
    const b = this.bombAt(x, y);
    return !b || b.passable.has(p.id);
  }

  aliveCount(): number {
    let c = 0;
    for (const p of this.players) if (p.alive) c++;
    return c;
  }

  // ---------- Simulación ----------

  step(inputs: readonly PlayerInput[], dt = STEP): void {
    if (this.phase === 'over') return;

    if (this.phase === 'playing') {
      const before = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (before > 0 && this.timeLeft === 0) this.events.push({ type: 'rainStart' });
      if (this.timeLeft === 0) this.updateRain(dt);
    }

    for (const p of this.players) {
      if (!p.alive) {
        p.deadFor += dt;
        continue;
      }
      const input = inputs[p.id] ?? NO_INPUT;
      this.move(p, input.dir, this.speedOf(p) * dt);
      if (input.bomb) this.placeBomb(p);
    }

    this.updateBombs(dt);
    this.updateFlames(dt);
    this.checkPlayers();
    this.checkEnd(dt);
  }

  /**
   * Movimiento libre con ayuda en las esquinas: el jugador se alinea solo con
   * el pasillo y, si choca con una esquina, se desliza hacia el hueco libre.
   */
  private move(p: Player, dir: Dir, dist: number): void {
    p.moving = dir !== 0;
    if (dir === 0) return;
    p.facing = dir;

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
      } else if (Math.abs(off) < 0.15 && p.kick && this.tryKick(p, dir, horiz ? ca + s : cb, horiz ? cb : ca + s)) {
        // bomba pateada
      } else if (Math.abs(off) > 1e-6) {
        // Ayuda en esquinas: deslizarse hacia el lado abierto.
        const t = Math.sign(off);
        if (free(ca + s, cb + t) && free(ca, cb + t)) pb += t * dist;
      }
    }

    if (horiz) { p.x = pa; p.y = pb; } else { p.y = pa; p.x = pb; }
  }

  private tryKick(p: Player, dir: Dir, bx: number, by: number): boolean {
    const b = this.bombAt(bx, by);
    if (!b || b.slide !== 0 || b.passable.has(p.id)) return false;
    if (this.blockedForBomb(bx + DX[dir], by + DY[dir])) return false;
    b.slide = dir;
    b.offset = 0;
    b.passable.clear();
    this.events.push({ type: 'kick' });
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
    this.bombs.push({ id: this.nextBombId++, owner, tx, ty, fuse, range, passable, slide: 0, offset: 0 });
    this.events.push({ type: 'bomb', x: tx, y: ty });
  }

  private blockedForBomb(x: number, y: number): boolean {
    if (!this.inBounds(x, y) || this.tiles[this.idx(x, y)] !== TILE.Empty) return true;
    if (this.bombAt(x, y)) return true;
    return this.players.some((q) => q.alive && Math.round(q.x) === x && Math.round(q.y) === y);
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
      // Quien se ha salido de la bomba ya no puede volver a entrar.
      for (const id of b.passable) {
        const q = this.players[id];
        if (!q.alive || Math.round(q.x) !== b.tx || Math.round(q.y) !== b.ty) b.passable.delete(id);
      }
      if (b.slide !== 0) {
        const nx = b.tx + DX[b.slide];
        const ny = b.ty + DY[b.slide];
        if (b.offset === 0 && this.blockedForBomb(nx, ny)) {
          b.slide = 0;
        } else {
          b.offset += KICK_SPEED * dt;
          if (b.offset >= 1) {
            b.tx = nx;
            b.ty = ny;
            b.offset = 0;
          }
        }
      }
      b.fuse -= dt;
      // Una bomba que entra en una llama explota.
      if (this.flames[this.idx(b.tx, b.ty)] > 0) b.fuse = 0;
    }

    let again = true;
    while (again) {
      again = false;
      for (const b of this.bombs.slice()) {
        if (b.fuse <= 0 && this.bombs.includes(b)) {
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
        if (other) {
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
      if (this.rng.next() < POWER_CHANCE) this.powerups[k] = this.randomPower();
    }
  }

  private randomPower(): PowerType {
    const total = POWER_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = this.rng.next() * total;
    for (const [p, w] of POWER_WEIGHTS) {
      r -= w;
      if (r < 0) return p;
    }
    return POWER.Bomb;
  }

  private checkPlayers(): void {
    for (const p of this.players) {
      if (!p.alive) continue;
      const [tx, ty] = this.tileOf(p);
      const k = this.idx(tx, ty);
      if (this.flames[k] > 0) {
        p.alive = false;
        p.moving = false;
        this.events.push({ type: 'death', player: p.id });
        continue;
      }
      const pw = this.powerups[k];
      if (pw >= 0) {
        this.powerups[k] = -1;
        this.applyPower(p, pw as PowerType);
        this.events.push({ type: 'pickup', player: p.id, power: pw as PowerType });
      }
    }
  }

  private applyPower(p: Player, pw: PowerType): void {
    switch (pw) {
      case POWER.Bomb: p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1); break;
      case POWER.Fire: p.range = Math.min(MAX_RANGE, p.range + 1); break;
      case POWER.Speed: p.speedLv = Math.min(MAX_SPEED_LV, p.speedLv + 1); break;
      case POWER.Kick: p.kick = true; break;
    }
  }

  private checkEnd(dt: number): void {
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
