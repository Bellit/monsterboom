import type { Game } from './game';
import { ENEMIES, type BossInfo, type EnemyKind } from './story';
import { DIRS, DX, DY, OPPOSITE, TILE, type Dir } from './types';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  /** Casilla a la que se dirige. */
  tx: number;
  ty: number;
  /** Casilla de la que viene (para dar media vuelta si le cierran el paso). */
  fx: number;
  fy: number;
  dir: Dir;
  alive: boolean;
  deadFor: number;
  hp: number;
  maxHp: number;
  invuln: number;
  speed: number;
  ghost: boolean;
  spawnTimer: number;
  boss: BossInfo | null;
}

let nextId = 1;

export function makeEnemy(kind: EnemyKind, x: number, y: number, boss: BossInfo | null = null): Enemy {
  const info = ENEMIES[kind];
  return {
    id: nextId++, kind, x, y, tx: x, ty: y, fx: x, fy: y, dir: 0,
    alive: true, deadFor: 0,
    hp: boss?.hp ?? 1, maxHp: boss?.hp ?? 1, invuln: 0,
    speed: info.speed, ghost: info.ghost,
    spawnTimer: boss?.spawnEvery ?? 0, boss,
  };
}

/** ¿Puede este enemigo entrar en la casilla? */
export function enemyCanEnter(g: Game, e: Enemy, x: number, y: number): boolean {
  if (!g.inBounds(x, y)) return false;
  const k = g.idx(x, y);
  const t = g.tiles[k];
  if (t === TILE.Solid || t === TILE.Burning) return false;
  if (t === TILE.Soft && !e.ghost) return false;
  if (g.flames[k] > 0) return false; // no se mete en el fuego a propósito
  const b = g.bombAt(x, y);
  return !b || b.flight !== null;
}

/** Primer paso del camino más corto hacia (gx, gy), o 0 si no hay camino. */
function chaseStep(g: Game, e: Enemy, gx: number, gy: number, maxDist = 40): Dir {
  const start = g.idx(e.tx, e.ty);
  const goal = g.idx(gx, gy);
  if (start === goal) return 0;
  const parent = new Int32Array(g.w * g.h).fill(-1);
  const firstDir = new Uint8Array(g.w * g.h);
  parent[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length && qi < 400; qi++) {
    const k = queue[qi];
    const x = k % g.w;
    const y = Math.floor(k / g.w);
    for (const d of DIRS) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (!g.inBounds(nx, ny)) continue;
      const nk = g.idx(nx, ny);
      if (parent[nk] >= 0 || !enemyCanEnter(g, e, nx, ny)) continue;
      parent[nk] = k;
      firstDir[nk] = k === start ? d : firstDir[k];
      if (nk === goal) return firstDir[nk] as Dir;
      if (Math.abs(nx - e.tx) + Math.abs(ny - e.ty) <= maxDist) queue.push(nk);
    }
  }
  return 0;
}

/** El jugador está en línea recta y sin obstáculos (y a menos de `range` casillas). */
function lineOfSight(g: Game, e: Enemy, px: number, py: number, range: number): Dir {
  if (px !== e.tx && py !== e.ty) return 0;
  const d: Dir = px > e.tx ? 4 : px < e.tx ? 3 : py > e.ty ? 2 : py < e.ty ? 1 : 0;
  if (!d) return 0;
  const dist = Math.abs(px - e.tx) + Math.abs(py - e.ty);
  if (dist > range) return 0;
  for (let i = 1; i < dist; i++) {
    if (!enemyCanEnter(g, e, e.tx + DX[d] * i, e.ty + DY[d] * i)) return 0;
  }
  return d;
}

/** Decide hacia dónde ir al llegar al centro de una casilla. */
function chooseDir(g: Game, e: Enemy): Dir {
  const player = g.players[0];
  const [px, py] = player && player.alive ? g.tileOf(player) : [-99, -99];
  const free = DIRS.filter((d) => enemyCanEnter(g, e, e.tx + DX[d], e.ty + DY[d]));
  if (free.length === 0) return 0;
  const random = () => free[g.rng.int(free.length)];
  const keepGoing = e.dir && free.includes(e.dir);
  // Evitar dar media vuelta salvo que no quede otra.
  const forward = free.filter((d) => d !== OPPOSITE[e.dir]);
  const wander = () => (forward.length ? forward[g.rng.int(forward.length)] : random());

  switch (e.kind) {
    case 'slime':
      return keepGoing && g.rng.next() > 0.15 ? e.dir : wander();
    case 'bat':
      return keepGoing && g.rng.next() > 0.45 ? e.dir : wander();
    case 'eye': {
      const seen = lineOfSight(g, e, px, py, 7);
      if (seen && free.includes(seen)) return seen;
      return keepGoing && g.rng.next() > 0.25 ? e.dir : wander();
    }
    case 'ghost': {
      if (g.rng.next() < 0.5) {
        const d = chaseStep(g, e, px, py, 12);
        if (d) return d;
      }
      return keepGoing && g.rng.next() > 0.3 ? e.dir : wander();
    }
    case 'boss': {
      const d = g.rng.next() < 0.75 ? chaseStep(g, e, px, py) : 0;
      return d || (keepGoing ? e.dir : wander());
    }
    case 'hunter': {
      const d = chaseStep(g, e, px, py);
      return d || wander();
    }
  }
}

/** Avanza un enemigo `dt` segundos. Devuelve un enemigo invocado, si lo hay. */
export function updateEnemy(g: Game, e: Enemy, dt: number): Enemy | null {
  if (!e.alive) {
    e.deadFor += dt;
    return null;
  }
  if (e.invuln > 0) e.invuln = Math.max(0, e.invuln - dt);

  let spawned: Enemy | null = null;
  if (e.boss) {
    e.spawnTimer -= dt;
    if (e.spawnTimer <= 0) {
      e.spawnTimer = e.boss.spawnEvery;
      spawned = spawnNear(g, e, e.boss.spawns);
    }
  }

  // Si le cierran el paso (bomba, bloque), vuelve a su casilla.
  if ((e.tx !== e.fx || e.ty !== e.fy) && !enemyCanEnter(g, e, e.tx, e.ty)) {
    [e.tx, e.ty, e.fx, e.fy] = [e.fx, e.fy, e.tx, e.ty];
    e.dir = OPPOSITE[e.dir];
  }

  let dist = e.speed * dt;
  // Un jefe herido se enfada y va más rápido.
  if (e.boss) dist *= 1 + (1 - e.hp / e.maxHp) * 0.8;
  while (dist > 0) {
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const left = Math.abs(dx) + Math.abs(dy);
    if (left > 1e-6) {
      const m = Math.min(left, dist);
      e.x += Math.sign(dx) * m;
      e.y += Math.sign(dy) * m;
      dist -= m;
      continue;
    }
    // En el centro de una casilla: elegir la siguiente.
    e.x = e.tx;
    e.y = e.ty;
    const d = chooseDir(g, e);
    if (!d) break;
    e.dir = d;
    e.fx = e.tx;
    e.fy = e.ty;
    e.tx += DX[d];
    e.ty += DY[d];
  }
  return spawned;
}

function spawnNear(g: Game, e: Enemy, kind: EnemyKind): Enemy | null {
  if (g.enemies.filter((o) => o.alive).length >= 10) return null;
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  for (const d of DIRS) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (g.inBounds(nx, ny) && g.tiles[g.idx(nx, ny)] === TILE.Empty && !g.bombAt(nx, ny)) {
      return makeEnemy(kind, nx, ny);
    }
  }
  return null;
}
