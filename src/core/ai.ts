import { FUSE, type Game } from './game';
import { DIRS, DX, DY, NO_INPUT, TILE, type Difficulty, type Dir, type Player, type PlayerInput } from './types';

interface AiParams {
  /** Cada cuánto reacciona (segundos). Más alto = más torpe. */
  reaction: number;
  /** Cada cuánto elige un objetivo nuevo. */
  rethink: number;
  /** Probabilidad de poner bomba cuando conviene. */
  bombProb: number;
  /** Ganas de ir a por los rivales (0 = ignora). */
  hunt: number;
  /** Ganas de recoger power-ups. */
  greed: number;
  /** Margen de seguridad extra al huir (segundos). */
  margin: number;
}

const PARAMS: Record<Difficulty, AiParams> = {
  easy: { reaction: 0.28, rethink: 0.9, bombProb: 0.45, hunt: 0.2, greed: 4, margin: 0.05 },
  normal: { reaction: 0.1, rethink: 0.5, bombProb: 0.85, hunt: 0.8, greed: 8, margin: 0.2 },
  hard: { reaction: 0, rethink: 0.3, bombProb: 1, hunt: 1.4, greed: 12, margin: 0.3 },
};

/** Casillas que alcanzaría una explosión en (x, y), con las mismas reglas que el juego. */
export function blastTiles(g: Game, x: number, y: number, range: number): number[] {
  const out = [g.idx(x, y)];
  for (const d of DIRS) {
    for (let i = 1; i <= range; i++) {
      const nx = x + DX[d] * i;
      const ny = y + DY[d] * i;
      if (!g.inBounds(nx, ny)) break;
      const k = g.idx(nx, ny);
      const t = g.tiles[k];
      if (t === TILE.Solid || t === TILE.Burning) break;
      out.push(k);
      if (t === TILE.Soft || g.bombAt(nx, ny) || g.powerups[k] >= 0) break;
    }
  }
  return out;
}

/** Para cada casilla, segundos hasta que arda (0 = arde ya, Infinity = segura). */
export function dangerMap(g: Game): Float32Array {
  const d = new Float32Array(g.w * g.h).fill(Infinity);
  for (let k = 0; k < d.length; k++) if (g.flames[k] > 0) d[k] = 0;
  const times = g.bombs.map((b) => b.fuse);
  const blasts = g.bombs.map((b) => blastTiles(g, b.tx, b.ty, b.range));
  const bombIdx = new Map<number, number>();
  g.bombs.forEach((b, i) => bombIdx.set(g.idx(b.tx, b.ty), i));
  // Reacciones en cadena: una bomba alcanzada explota con la que la alcanza.
  for (let iter = 0; iter < g.bombs.length; iter++) {
    let changed = false;
    blasts.forEach((tiles, i) => {
      for (const k of tiles) {
        const j = bombIdx.get(k);
        if (j !== undefined && times[j] > times[i]) {
          times[j] = times[i];
          changed = true;
        }
      }
    });
    if (!changed) break;
  }
  blasts.forEach((tiles, i) => {
    for (const k of tiles) d[k] = Math.min(d[k], times[i]);
  });
  return d;
}

export class BotBrain {
  private readonly p: AiParams;
  private reactTimer = 0;
  private rethinkTimer = 0;
  private goal = -1;
  private wantsBombAtGoal = false;
  private lastDir: Dir = 0;

  constructor(readonly id: number, difficulty: Difficulty) {
    this.p = PARAMS[difficulty];
  }

  update(g: Game, dt: number): PlayerInput {
    const me = g.players[this.id];
    if (!me.alive || g.phase === 'over') return NO_INPUT;

    this.reactTimer -= dt;
    this.rethinkTimer -= dt;
    if (this.reactTimer > 0) return { dir: this.lastDir, bomb: false };
    this.reactTimer = this.p.reaction;

    const danger = dangerMap(g);
    const [cx, cy] = g.tileOf(me);
    const cur = g.idx(cx, cy);
    const speed = g.speedOf(me);

    // 1. Si estoy en peligro, huir a la casilla segura más cercana.
    if (danger[cur] < Infinity) {
      this.goal = -1;
      const step = this.flee(g, cur, danger, speed);
      return this.go(g, me, step);
    }

    // 2. Rival a tiro: bomba (niveles normal y difícil).
    if (this.p.hunt >= 0.8 && g.canPlaceBomb(me) && this.enemyInBlast(g, me, cx, cy)
        && g.rng.next() < this.p.bombProb && this.hasEscape(g, me, cx, cy, danger)) {
      this.goal = -1;
      return { dir: 0, bomb: true };
    }

    // 3. He llegado a donde quería poner una bomba.
    if (this.goal === cur && this.wantsBombAtGoal) {
      this.goal = -1;
      if (g.canPlaceBomb(me) && this.worthBombing(g, me, cx, cy)
          && g.rng.next() < this.p.bombProb && this.hasEscape(g, me, cx, cy, danger)) {
        return { dir: 0, bomb: true };
      }
    }

    // 4. Elegir objetivo y avanzar hacia él por casillas seguras.
    if (this.goal < 0 || this.goal === cur || this.rethinkTimer <= 0) {
      this.rethinkTimer = this.p.rethink;
      this.chooseGoal(g, me, cur, danger);
    }
    const step = this.goal >= 0 ? this.pathStep(g, cur, this.goal, danger) : -1;
    if (step < 0) this.goal = -1;
    return this.go(g, me, step);
  }

  /** Convierte "ir a la casilla vecina k" en una dirección. */
  private go(g: Game, me: Player, k: number): PlayerInput {
    let dir: Dir = 0;
    if (k >= 0) {
      const [cx, cy] = g.tileOf(me);
      const tx = k % g.w;
      const ty = Math.floor(k / g.w);
      if (tx > cx) dir = 4;
      else if (tx < cx) dir = 3;
      else if (ty > cy) dir = 2;
      else if (ty < cy) dir = 1;
      else {
        // Ya en la casilla: centrarse un poco para no rozar llamas.
        const ox = me.x - cx;
        const oy = me.y - cy;
        if (Math.abs(ox) > 0.2) dir = ox > 0 ? 3 : 4;
        else if (Math.abs(oy) > 0.2) dir = oy > 0 ? 1 : 2;
      }
    }
    this.lastDir = dir;
    return { dir, bomb: false };
  }

  private walkable(g: Game, k: number, start: number): boolean {
    if (k === start) return true;
    if (g.tiles[k] !== TILE.Empty) return false;
    return !g.bombAt(k % g.w, Math.floor(k / g.w));
  }

  /** BFS genérico. Devuelve distancias y padres. */
  private bfs(g: Game, start: number, allow: (k: number, dist: number) => boolean) {
    const n = g.w * g.h;
    const dist = new Int16Array(n).fill(-1);
    const parent = new Int32Array(n).fill(-1);
    const queue = [start];
    dist[start] = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi];
      const x = k % g.w;
      const y = Math.floor(k / g.w);
      for (const d of DIRS) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (!g.inBounds(nx, ny)) continue;
        const nk = g.idx(nx, ny);
        if (dist[nk] >= 0 || !this.walkable(g, nk, start)) continue;
        if (!allow(nk, dist[k] + 1)) continue;
        dist[nk] = dist[k] + 1;
        parent[nk] = k;
        queue.push(nk);
      }
    }
    return { dist, parent, order: queue };
  }

  private firstStep(parent: Int32Array, start: number, goal: number): number {
    let k = goal;
    while (parent[k] >= 0 && parent[k] !== start) k = parent[k];
    return parent[k] === start ? k : goal === start ? start : -1;
  }

  private flee(g: Game, cur: number, danger: Float32Array, speed: number): number {
    const m = this.p.margin;
    const { order, parent } = this.bfs(g, cur, (k, d) => danger[k] > (d + 0.6) / speed + m);
    for (const k of order) {
      if (danger[k] === Infinity) return this.firstStep(parent, cur, k);
    }
    // Sin escapatoria: alejarse lo que se pueda.
    let best = cur;
    for (const k of order) if (danger[k] > danger[best]) best = k;
    return this.firstStep(parent, cur, best);
  }

  private hasEscape(g: Game, me: Player, x: number, y: number, danger: Float32Array): boolean {
    const d2 = danger.slice();
    for (const k of blastTiles(g, x, y, me.range)) d2[k] = Math.min(d2[k], FUSE);
    const start = g.idx(x, y);
    const speed = g.speedOf(me);
    const m = this.p.margin + 0.25;
    const { order } = this.bfs(g, start, (k, d) => d2[k] > (d + 0.6) / speed + m);
    return order.some((k) => d2[k] === Infinity);
  }

  private enemyInBlast(g: Game, me: Player, x: number, y: number): boolean {
    const tiles = new Set(blastTiles(g, x, y, me.range));
    return g.players.some((q) => q.alive && q.id !== me.id && tiles.has(g.idx(...g.tileOf(q))));
  }

  private softInBlast(g: Game, me: Player, x: number, y: number): boolean {
    return blastTiles(g, x, y, me.range).some((k) => g.tiles[k] === TILE.Soft);
  }

  private worthBombing(g: Game, me: Player, x: number, y: number): boolean {
    return this.softInBlast(g, me, x, y) || (this.p.hunt > 0 && this.enemyInBlast(g, me, x, y));
  }

  private chooseGoal(g: Game, me: Player, cur: number, danger: Float32Array): void {
    const { order, dist } = this.bfs(g, cur, (k) => danger[k] === Infinity);
    let best = -1;
    let bestScore = -Infinity;
    let bestBomb = false;
    for (const k of order) {
      const x = k % g.w;
      const y = Math.floor(k / g.w);
      const d = dist[k];
      let score = -Infinity;
      let bomb = false;
      if (g.powerups[k] >= 0) {
        score = this.p.greed - d * 0.6;
      }
      if (this.p.hunt > 0 && this.enemyInBlast(g, me, x, y)) {
        const s = 6 * this.p.hunt - d * 0.5;
        if (s > score) { score = s; bomb = true; }
      }
      if (this.softInBlast(g, me, x, y)) {
        const s = 4 - d * 0.7 + g.rng.next();
        if (s > score) { score = s; bomb = true; }
      }
      if (score > bestScore) {
        bestScore = score;
        best = k;
        bestBomb = bomb;
      }
    }
    if (best < 0 && order.length > 1) {
      // Nada interesante: pasear.
      best = order[1 + g.rng.int(order.length - 1)];
    }
    this.goal = best;
    this.wantsBombAtGoal = bestBomb;
  }

  private pathStep(g: Game, cur: number, goal: number, danger: Float32Array): number {
    if (goal === cur) return cur;
    const { parent, dist } = this.bfs(g, cur, (k) => danger[k] === Infinity);
    if (dist[goal] < 0) return -1;
    return this.firstStep(parent, cur, goal);
  }
}
