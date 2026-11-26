import type { Dir, PlayerInput } from '../core/types';

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 1, KeyW: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
  ArrowRight: 4, KeyD: 4,
};
const BOMB_KEYS = new Set(['Space', 'KeyX', 'KeyK', 'Enter']);

/**
 * Teclado y controles táctiles del jugador humano, traducidos a PlayerInput.
 * La última dirección pulsada manda (así girar en un cruce es natural).
 */
export class Controls {
  private held: Dir[] = [];
  private touchDir: Dir = 0;
  private bombQueued = false;
  enabled = false;
  onPause: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const d = KEY_DIRS[e.code];
      if (d) {
        e.preventDefault();
        if (!this.held.includes(d)) this.held.push(d);
      } else if (BOMB_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.bombQueued = true;
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        this.onPause();
      }
    });
    window.addEventListener('keyup', (e) => {
      const d = KEY_DIRS[e.code];
      if (d) this.held = this.held.filter((h) => h !== d);
    });
    window.addEventListener('blur', () => this.reset());
    this.setupTouch();
  }

  reset(): void {
    this.held = [];
    this.touchDir = 0;
    this.bombQueued = false;
  }

  /** Lee la intención para este paso de simulación (la bomba se consume). */
  read(): PlayerInput {
    const dir = this.touchDir || this.held[this.held.length - 1] || 0;
    const bomb = this.bombQueued;
    this.bombQueued = false;
    return { dir, bomb };
  }

  private setupTouch(): void {
    const pad = document.getElementById('touch-pad');
    const knob = document.getElementById('touch-knob');
    const bombBtn = document.getElementById('touch-bomb');
    if (!pad || !knob || !bombBtn) return;

    let pointer: number | null = null;
    let ox = 0;
    let oy = 0;
    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    pad.addEventListener('pointerdown', (e) => {
      pointer = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      const r = pad.getBoundingClientRect();
      ox = r.left + r.width / 2;
      oy = r.top + r.height / 2;
      update(e);
    });
    const update = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      const max = 40;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      setKnob(dx, dy);
      if (len < 14) this.touchDir = 0;
      else if (Math.abs(dx) > Math.abs(dy)) this.touchDir = dx > 0 ? 4 : 3;
      else this.touchDir = dy > 0 ? 2 : 1;
    };
    pad.addEventListener('pointermove', update);
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      this.touchDir = 0;
      setKnob(0, 0);
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    bombBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.enabled) this.bombQueued = true;
    });
  }
}
