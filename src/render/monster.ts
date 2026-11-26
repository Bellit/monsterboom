import { darken, type Monster } from '../theme';

/**
 * Lo mínimo para dibujar un monstruo. Hay dos adaptadores: uno para Phaser
 * (en la partida) y otro para canvas 2D (miniaturas del menú). Así el dibujo
 * vive en un único sitio.
 */
export interface Painter {
  fill(color: number, alpha?: number): void;
  circle(x: number, y: number, r: number): void;
  ellipse(x: number, y: number, w: number, h: number): void;
  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha?: number): void;
}

export interface MonsterPose {
  /** Hacia dónde miran los ojos (-1..1). */
  lookX: number;
  lookY: number;
  alpha: number;
  alive: boolean;
  /** Desfase de los pies al andar (en píxeles). */
  step: number;
  pupil: number;
}

export function paintMonster(p: Painter, m: Monster, cx: number, cy: number, r: number, pose: MonsterPose): void {
  const { alpha } = pose;
  const color = m.color;
  const dark = darken(color, 30);
  const lx = pose.lookX * r * 0.09;
  const ly = pose.lookY * r * 0.09;

  // Adornos detrás de la cabeza.
  p.fill(dark, alpha);
  switch (m.feature) {
    case 'horns':
    case 'fangs': {
      const s = m.feature === 'fangs' ? 1.15 : 1;
      p.tri(cx - r * 0.8, cy - r * 0.35, cx - r * 0.35, cy - r * 0.75, cx - r * 0.95 * s, cy - r * 1.15 * s);
      p.tri(cx + r * 0.8, cy - r * 0.35, cx + r * 0.35, cy - r * 0.75, cx + r * 0.95 * s, cy - r * 1.15 * s);
      break;
    }
    case 'ears':
      p.tri(cx - r * 0.85, cy - r * 0.2, cx - r * 0.2, cy - r * 0.85, cx - r * 0.9, cy - r * 1.2);
      p.tri(cx + r * 0.85, cy - r * 0.2, cx + r * 0.2, cy - r * 0.85, cx + r * 0.9, cy - r * 1.2);
      p.fill(0xffc0d0, alpha);
      p.tri(cx - r * 0.7, cy - r * 0.45, cx - r * 0.38, cy - r * 0.78, cx - r * 0.78, cy - r * 0.98);
      p.tri(cx + r * 0.7, cy - r * 0.45, cx + r * 0.38, cy - r * 0.78, cx + r * 0.78, cy - r * 0.98);
      break;
    case 'antennae':
      p.line(cx - r * 0.3, cy - r * 0.8, cx - r * 0.55, cy - r * 1.35, r * 0.1, dark, alpha);
      p.line(cx + r * 0.3, cy - r * 0.8, cx + r * 0.55, cy - r * 1.35, r * 0.1, dark, alpha);
      p.fill(0xfff27a, alpha);
      p.circle(cx - r * 0.57, cy - r * 1.4, r * 0.16);
      p.circle(cx + r * 0.57, cy - r * 1.4, r * 0.16);
      break;
    case 'spikes':
      for (let i = -2; i <= 2; i++) {
        const bx = cx + i * r * 0.32;
        p.tri(bx - r * 0.2, cy - r * 0.8, bx + r * 0.2, cy - r * 0.8, bx + i * r * 0.08, cy - r * 1.3);
      }
      break;
    case 'crest':
      for (let i = -1; i <= 1; i++) {
        const by = cy - r * (1.0 - Math.abs(i) * 0.1);
        p.tri(cx + i * r * 0.32 - r * 0.18, by + r * 0.2, cx + i * r * 0.32 + r * 0.18, by + r * 0.2, cx + i * r * 0.2, by - r * (0.45 - Math.abs(i) * 0.15));
      }
      break;
    default:
      break;
  }

  // Cuerpo.
  p.fill(color, alpha);
  p.circle(cx, cy, r);
  p.fill(dark, alpha);
  p.ellipse(cx, cy + r * 0.55, r * 1.5, r * 0.7);
  p.fill(color, alpha);
  p.ellipse(cx, cy + r * 0.35, r * 1.6, r * 0.8);
  // Pies.
  p.fill(dark, alpha);
  p.ellipse(cx - r * 0.45, cy + r * 0.95 + pose.step, r * 0.55, r * 0.35);
  p.ellipse(cx + r * 0.45, cy + r * 0.95 - pose.step, r * 0.55, r * 0.35);

  if (m.feature === 'blush') {
    p.fill(0xff7fa8, alpha * 0.7);
    p.ellipse(cx - r * 0.6, cy + r * 0.15, r * 0.32, r * 0.18);
    p.ellipse(cx + r * 0.6, cy + r * 0.15, r * 0.32, r * 0.18);
  }

  // Ojos.
  const eyes = m.feature === 'cyclops' ? [{ x: 0, s: 1.45 }] : [{ x: -0.35, s: 1 }, { x: 0.35, s: 1 }];
  for (const e of eyes) {
    const ex = cx + r * e.x;
    const ey = cy - r * 0.15;
    if (pose.alive) {
      p.fill(0xffffff, alpha);
      p.circle(ex, ey, r * 0.3 * e.s);
      p.fill(pose.pupil, alpha);
      p.circle(ex + lx * e.s, ey + ly * e.s, r * 0.14 * e.s);
    } else {
      const d = r * 0.12 * e.s;
      p.line(ex - d, ey - d, ex + d, ey + d, 3, 0x111122, alpha);
      p.line(ex - d, ey + d, ex + d, ey - d, 3, 0x111122, alpha);
    }
  }

  if (m.feature === 'fangs' && pose.alive) {
    p.fill(0xffffff, alpha);
    p.tri(cx - r * 0.28, cy + r * 0.22, cx - r * 0.12, cy + r * 0.22, cx - r * 0.2, cy + r * 0.45);
    p.tri(cx + r * 0.12, cy + r * 0.22, cx + r * 0.28, cy + r * 0.22, cx + r * 0.2, cy + r * 0.45);
  }
}

/** Adaptador para dibujar en un canvas 2D (miniaturas del menú). */
export function canvasPainter(ctx: CanvasRenderingContext2D): Painter {
  const rgba = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  return {
    fill: (c, a = 1) => { ctx.fillStyle = rgba(c, a); },
    circle: (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); },
    ellipse: (x, y, w, h) => { ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); },
    tri: (x1, y1, x2, y2, x3, y3) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    },
    line: (x1, y1, x2, y2, w, c, a = 1) => {
      ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    },
  };
}
