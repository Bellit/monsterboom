import type { Enemy } from '../core/enemies';
import { ENEMIES, type EnemyKind } from '../core/story';
import { darken } from '../theme';
import type { Painter } from './monster';

/** Dibuja un enemigo del modo historia centrado en (cx, cy) con radio r. */
export function paintEnemy(p: Painter, e: Enemy, cx: number, cy: number, r: number, time: number): void {
  let alpha = 1;
  let scale = 1;
  if (!e.alive) {
    alpha = Math.max(0, 1 - e.deadFor / 0.6);
    scale = 1 + e.deadFor * 0.8;
  } else if (e.invuln > 0 && Math.sin(time * 40) > 0) {
    alpha = 0.4;
  }
  const kind: EnemyKind = e.boss ? e.boss.spawns : e.kind;
  const color = e.boss?.color ?? ENEMIES[e.kind].color;
  const R = r * scale * (e.boss ? 1.55 : 1);
  const lookX = e.dir === 3 ? -1 : e.dir === 4 ? 1 : 0;
  const lookY = e.dir === 1 ? -1 : e.dir === 2 ? 1 : 0;

  // sombra
  p.fill(0x000000, 0.25 * alpha);
  p.ellipse(cx, cy + R * 0.85, R * 1.7, R * 0.45);

  switch (e.kind === 'hunter' ? 'hunter' : kind) {
    case 'slime': {
      const wob = Math.sin(time * 6 + e.id) * 0.08;
      p.fill(darken(color, 25), alpha);
      p.ellipse(cx, cy + R * 0.3, R * 2 * (1 + wob), R * 1.3 * (1 - wob));
      p.fill(color, alpha);
      p.ellipse(cx, cy + R * 0.15, R * 1.8 * (1 + wob), R * 1.4 * (1 - wob));
      p.fill(0xffffff, alpha * 0.45);
      p.ellipse(cx - R * 0.4, cy - R * 0.2, R * 0.4, R * 0.25);
      eyes(p, cx, cy + R * 0.05, R, lookX, lookY, alpha, 0.2, 0x1a2a10);
      break;
    }
    case 'bat': {
      const flap = Math.sin(time * 18 + e.id) * R * 0.5;
      p.fill(darken(color, 20), alpha);
      p.tri(cx - R * 0.4, cy - R * 0.1, cx - R * 1.6, cy - R * 0.4 - flap, cx - R * 1.2, cy + R * 0.5);
      p.tri(cx + R * 0.4, cy - R * 0.1, cx + R * 1.6, cy - R * 0.4 - flap, cx + R * 1.2, cy + R * 0.5);
      p.tri(cx - R * 0.55, cy - R * 0.5, cx - R * 0.2, cy - R * 0.6, cx - R * 0.45, cy - R * 1.05);
      p.tri(cx + R * 0.55, cy - R * 0.5, cx + R * 0.2, cy - R * 0.6, cx + R * 0.45, cy - R * 1.05);
      p.fill(color, alpha);
      p.circle(cx, cy, R * 0.65);
      p.fill(0xffe066, alpha);
      p.circle(cx - R * 0.22 + lookX * 2, cy - R * 0.08 + lookY * 2, R * 0.13);
      p.circle(cx + R * 0.22 + lookX * 2, cy - R * 0.08 + lookY * 2, R * 0.13);
      p.fill(0xffffff, alpha);
      p.tri(cx - R * 0.15, cy + R * 0.25, cx - R * 0.05, cy + R * 0.25, cx - R * 0.1, cy + R * 0.42);
      p.tri(cx + R * 0.05, cy + R * 0.25, cx + R * 0.15, cy + R * 0.25, cx + R * 0.1, cy + R * 0.42);
      break;
    }
    case 'eye': {
      p.fill(0xb04848, alpha * 0.8);
      p.circle(cx, cy, R * 0.95);
      p.fill(color, alpha);
      p.circle(cx, cy, R * 0.88);
      p.line(cx - R * 0.8, cy - R * 0.1, cx - R * 0.4, cy - R * 0.05, 1.5, 0xd05050, alpha);
      p.line(cx + R * 0.8, cy + R * 0.2, cx + R * 0.45, cy + R * 0.1, 1.5, 0xd05050, alpha);
      p.fill(0xc0392b, alpha);
      p.circle(cx + lookX * R * 0.3, cy + lookY * R * 0.3, R * 0.42);
      p.fill(0x111111, alpha);
      p.circle(cx + lookX * R * 0.35, cy + lookY * R * 0.35, R * 0.2);
      p.fill(0xffffff, alpha * 0.8);
      p.circle(cx - R * 0.25, cy - R * 0.3, R * 0.12);
      break;
    }
    case 'ghost': {
      const float = Math.sin(time * 3 + e.id) * R * 0.12;
      const y = cy - float;
      p.fill(color, alpha * 0.85);
      p.circle(cx, y - R * 0.15, R * 0.8);
      p.ellipse(cx, y + R * 0.3, R * 1.6, R * 1.0);
      for (let i = -1; i <= 1; i++) {
        p.tri(cx + i * R * 0.5 - R * 0.28, y + R * 0.7, cx + i * R * 0.5 + R * 0.28, y + R * 0.7, cx + i * R * 0.5, y + R * 1.05);
      }
      p.fill(0x1b2440, alpha);
      p.ellipse(cx - R * 0.3 + lookX * 2, y - R * 0.2 + lookY * 2, R * 0.22, R * 0.32);
      p.ellipse(cx + R * 0.3 + lookX * 2, y - R * 0.2 + lookY * 2, R * 0.22, R * 0.32);
      p.ellipse(cx, y + R * 0.25, R * 0.25, R * 0.18);
      break;
    }
    case 'hunter': {
      const spin = time * 6;
      p.fill(darken(color, 25), alpha);
      for (let i = 0; i < 8; i++) {
        const a = spin + (i * Math.PI) / 4;
        p.tri(
          cx + Math.cos(a - 0.3) * R * 0.7, cy + Math.sin(a - 0.3) * R * 0.7,
          cx + Math.cos(a + 0.3) * R * 0.7, cy + Math.sin(a + 0.3) * R * 0.7,
          cx + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.15,
        );
      }
      p.fill(color, alpha);
      p.circle(cx, cy, R * 0.75);
      eyes(p, cx, cy, R * 0.9, lookX, lookY, alpha, 0, 0x111111);
      p.line(cx - R * 0.45, cy - R * 0.45, cx - R * 0.1, cy - R * 0.3, 3, 0x111111, alpha);
      p.line(cx + R * 0.45, cy - R * 0.45, cx + R * 0.1, cy - R * 0.3, 3, 0x111111, alpha);
      break;
    }
    default:
      break;
  }

  if (e.boss && e.alive) {
    // corona
    const top = cy - R * 0.95;
    p.fill(0xffd84a, alpha);
    p.tri(cx - R * 0.5, top, cx - R * 0.3, top, cx - R * 0.45, top - R * 0.35);
    p.tri(cx - R * 0.15, top, cx + R * 0.15, top, cx, top - R * 0.45);
    p.tri(cx + R * 0.3, top, cx + R * 0.5, top, cx + R * 0.45, top - R * 0.35);
    p.ellipse(cx, top + R * 0.02, R * 1.1, R * 0.16);
  }
}

function eyes(p: Painter, cx: number, cy: number, R: number, lx: number, ly: number, alpha: number, spread: number, pupil: number): void {
  const dx = R * (0.32 + spread * 0.3);
  p.fill(0xffffff, alpha);
  p.circle(cx - dx, cy - R * 0.15, R * 0.24);
  p.circle(cx + dx, cy - R * 0.15, R * 0.24);
  p.fill(pupil, alpha);
  p.circle(cx - dx + lx * R * 0.08, cy - R * 0.15 + ly * R * 0.08, R * 0.11);
  p.circle(cx + dx + lx * R * 0.08, cy - R * 0.15 + ly * R * 0.08, R * 0.11);
}
