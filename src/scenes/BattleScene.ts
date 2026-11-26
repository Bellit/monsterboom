import Phaser from 'phaser';
import { Game, STEP } from '../core/game';
import { BotBrain } from '../core/ai';
import { POWER, TILE, type Difficulty, type PlayerInput } from '../core/types';
import type { Controls } from '../input/controls';
import { PLAYER_COLORS } from '../theme';

export interface MatchSettings {
  players: number;
  difficulty: Difficulty;
  roundsToWin: number;
  roundTime: number;
}

export interface MatchHooks {
  controls: Controls;
  onRoundOver: (winner: number, wins: number[], settings: MatchSettings, next: () => void) => void;
}

interface SceneData {
  settings: MatchSettings;
  wins: number[];
  round: number;
  hooks: MatchHooks;
}

const T = 48; // píxeles por casilla
const HUD = 56;

const C = {
  bg: 0x1a1726,
  floorA: 0x2f5d50,
  floorB: 0x2b5549,
  floorShade: 0x244a40,
  stone: 0x5b5470,
  stoneTop: 0x7d7698,
  stoneDark: 0x3a3450,
  soft: 0x8a5a3c,
  softTop: 0xaa7550,
  softLine: 0x5e3b26,
  burn: 0xe8772e,
  flameOut: 0xff6a1a,
  flameIn: 0xffe066,
  bomb: 0x23213a,
  rainBomb: 0x5a1f2a,
};

export class BattleScene extends Phaser.Scene {
  private match!: Game;
  private data_!: SceneData;
  private bots: BotBrain[] = [];
  private acc = 0;
  private time_ = 0;
  private gStatic!: Phaser.GameObjects.Graphics;
  private gDyn!: Phaser.GameObjects.Graphics;
  private gHud!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private winTexts: Phaser.GameObjects.Text[] = [];
  private roundText!: Phaser.GameObjects.Text;
  private shake = 0;
  private roundHandled = false;
  paused = false;

  constructor() {
    super('battle');
  }

  init(data: SceneData): void {
    this.data_ = data;
    this.acc = 0;
    this.time_ = 0;
    this.shake = 0;
    this.roundHandled = false;
    this.paused = false;
    this.winTexts = [];
  }

  create(): void {
    const { settings } = this.data_;
    this.match = new Game({
      players: settings.players,
      seed: (Date.now() ^ (this.data_.round * 7919)) >>> 0,
      roundTime: settings.roundTime,
    });
    this.bots = this.match.players.slice(1).map((p) => new BotBrain(p.id, settings.difficulty));
    this.data_.hooks.controls.reset();

    const W = this.match.w * T;
    const H = this.match.h * T + HUD;
    this.scale.setGameSize(W, H);
    this.cameras.main.setBackgroundColor(C.bg);

    this.gStatic = this.add.graphics();
    this.gDyn = this.add.graphics();
    this.gHud = this.add.graphics();
    this.drawStatic();

    const font = { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold' };
    this.timerText = this.add.text(W / 2, HUD / 2, '', { ...font, fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);
    this.roundText = this.add.text(W - 12, HUD / 2, `Ronda ${this.data_.round}`, { ...font, fontSize: '16px', color: '#b9b3d6' }).setOrigin(1, 0.5);
    this.match.players.forEach(() => {
      const t = this.add.text(0, 0, '', { ...font, fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0.5);
      this.winTexts.push(t);
    });
  }

  update(_t: number, deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs, 250) / 1000;
    this.acc += dt;
    this.time_ += dt;
    const controls = this.data_.hooks.controls;
    while (this.acc >= STEP) {
      const inputs: PlayerInput[] = [controls.read()];
      for (const b of this.bots) inputs[b.id] = b.update(this.match, STEP);
      this.match.step(inputs);
      this.acc -= STEP;
    }
    for (const e of this.match.events) {
      if (e.type === 'explode') this.shake = Math.min(this.shake + 0.12, 0.3);
    }
    this.match.events.length = 0;
    this.shake = Math.max(0, this.shake - dt);

    this.drawDynamic();
    this.drawHud();

    if (this.match.phase === 'over' && !this.roundHandled) {
      this.roundHandled = true;
      const { settings, wins, round, hooks } = this.data_;
      const w = wins.slice();
      if (this.match.winner >= 0) w[this.match.winner]++;
      hooks.onRoundOver(this.match.winner, w, settings, () => {
        this.scene.restart({ settings, wins: w, round: round + 1, hooks });
      });
    }
  }

  // ---------- Dibujo ----------

  private drawStatic(): void {
    const g = this.gStatic;
    const game = this.match;
    g.clear();
    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        const px = x * T;
        const py = y * T + HUD;
        if (game.tiles[game.idx(x, y)] === TILE.Solid) {
          g.fillStyle(C.stoneDark).fillRect(px, py, T, T);
          g.fillStyle(C.stone).fillRect(px + 2, py + 2, T - 4, T - 8);
          g.fillStyle(C.stoneTop).fillRect(px + 2, py + 2, T - 4, 6);
        } else {
          g.fillStyle((x + y) % 2 === 0 ? C.floorA : C.floorB).fillRect(px, py, T, T);
          // sombra de la pared de arriba
          if (y > 0 && game.tiles[game.idx(x, y - 1)] === TILE.Solid) {
            g.fillStyle(C.floorShade).fillRect(px, py, T, 8);
          }
        }
      }
    }
  }

  private drawDynamic(): void {
    const g = this.gDyn;
    const game = this.match;
    g.clear();
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 14 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 14 : 0;
    this.gStatic.setPosition(sx, sy);
    g.setPosition(sx, sy);

    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        const k = game.idx(x, y);
        const px = x * T;
        const py = y * T + HUD;
        const t = game.tiles[k];
        if (t === TILE.Soft) {
          g.fillStyle(C.softLine).fillRect(px + 1, py + 1, T - 2, T - 2);
          g.fillStyle(C.soft).fillRect(px + 3, py + 3, T - 6, T - 8);
          g.fillStyle(C.softTop).fillRect(px + 3, py + 3, T - 6, 5);
          g.fillStyle(C.softLine);
          g.fillRect(px + 3, py + T / 2 - 1, T - 6, 3);
          g.fillRect(px + T / 2 - 1, py + 3, 3, T / 2 - 3);
        } else if (t === TILE.Burning) {
          const left = game.burning.get(k) ?? 0;
          g.fillStyle(C.burn, Math.min(1, left * 2.5)).fillRect(px + 4, py + 4, T - 8, T - 8);
          g.fillStyle(C.flameIn, Math.min(1, left * 2)).fillRect(px + 12, py + 12, T - 24, T - 24);
        } else if (game.powerups[k] >= 0) {
          this.drawPowerup(g, game.powerups[k], px, py);
        }
      }
    }

    for (const b of game.bombs) {
      const fx = b.slide ? (b.slide === 3 ? -b.offset : b.slide === 4 ? b.offset : 0) : 0;
      const fy = b.slide ? (b.slide === 1 ? -b.offset : b.slide === 2 ? b.offset : 0) : 0;
      const cx = (b.tx + fx) * T + T / 2;
      const cy = (b.ty + fy) * T + T / 2 + HUD;
      const pulse = 1 + 0.08 * Math.sin((b.fuse < 1 ? 26 : 12) * b.fuse);
      const r = T * 0.33 * pulse;
      g.fillStyle(0x000000, 0.25).fillEllipse(cx, cy + r * 0.9, r * 1.8, r * 0.6);
      g.fillStyle(b.owner < 0 ? C.rainBomb : C.bomb).fillCircle(cx, cy, r);
      g.fillStyle(0xffffff, 0.35).fillCircle(cx - r * 0.35, cy - r * 0.35, r * 0.25);
      g.fillStyle(0x8c7a5a).fillRect(cx + r * 0.3, cy - r * 1.15, 4, r * 0.5);
      g.fillStyle(Math.sin(this.time_ * 40) > 0 ? 0xffe066 : 0xff6a1a).fillCircle(cx + r * 0.4, cy - r * 1.2, 4);
    }

    for (let k = 0; k < game.flames.length; k++) {
      const f = game.flames[k];
      if (f <= 0) continue;
      const x = k % game.w;
      const y = Math.floor(k / game.w);
      const cx = x * T + T / 2;
      const cy = y * T + T / 2 + HUD;
      const m = game.flameMask[k];
      const s = Math.min(1, f * 4);
      for (const [col, size] of [[C.flameOut, 0.8], [C.flameIn, 0.45]] as const) {
        const w = T * size * s;
        g.fillStyle(col);
        if (m & 1) g.fillRect(x * T, cy - w / 2, T, w);
        if (m & 2) g.fillRect(cx - w / 2, y * T + HUD, w, T);
        if (m & 4) g.fillCircle(cx, cy, w * 0.62);
      }
    }

    const order = game.players.slice().sort((a, b) => a.y - b.y);
    for (const p of order) this.drawMonster(g, p.id);
  }

  private drawPowerup(g: Phaser.GameObjects.Graphics, type: number, px: number, py: number): void {
    const bob = Math.sin(this.time_ * 5) * 2;
    const x = px + 6;
    const y = py + 6 + bob;
    const s = T - 12;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const bg = [0x3c3c78, 0xb8321f, 0x2b6bd9, 0x2f9a4a][type];
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 2, y + 3, s, s, 7);
    g.fillStyle(bg).fillRoundedRect(x, y, s, s, 7);
    g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x, y, s, s, 7);
    g.fillStyle(0xffffff);
    switch (type) {
      case POWER.Bomb:
        g.fillStyle(0x111111).fillCircle(cx, cy + 2, 9);
        g.fillStyle(0xffe066).fillCircle(cx + 7, cy - 8, 3);
        break;
      case POWER.Fire:
        g.fillStyle(0xffe066).fillTriangle(cx - 9, cy + 9, cx + 9, cy + 9, cx, cy - 11);
        g.fillStyle(0xffffff).fillTriangle(cx - 4, cy + 9, cx + 4, cy + 9, cx, cy - 1);
        break;
      case POWER.Speed:
        g.fillTriangle(cx - 10, cy - 9, cx - 10, cy + 9, cx - 1, cy);
        g.fillTriangle(cx, cy - 9, cx, cy + 9, cx + 9, cy);
        break;
      case POWER.Kick:
        g.fillRect(cx - 6, cy - 10, 8, 14);
        g.fillRoundedRect(cx - 6, cy + 2, 16, 8, 3);
        break;
    }
  }

  private drawMonster(g: Phaser.GameObjects.Graphics, id: number): void {
    const p = this.match.players[id];
    const color = PLAYER_COLORS[id];
    let scale = 1;
    let alpha = 1;
    if (!p.alive) {
      if (p.deadFor > 0.9) return;
      scale = 1 + p.deadFor * 0.6;
      alpha = 1 - p.deadFor / 0.9;
    }
    const bob = p.moving ? Math.abs(Math.sin(this.time_ * 14)) * 3 : Math.sin(this.time_ * 3) * 1;
    const cx = p.x * T + T / 2;
    const cy = p.y * T + T / 2 + HUD - bob;
    const r = T * 0.36 * scale;

    g.fillStyle(0x000000, 0.25 * alpha).fillEllipse(cx, p.y * T + T * 0.92 + HUD, r * 1.8, r * 0.55);
    // cuernos
    const dark = Phaser.Display.Color.ValueToColor(color).darken(30).color;
    g.fillStyle(dark, alpha);
    g.fillTriangle(cx - r * 0.8, cy - r * 0.35, cx - r * 0.35, cy - r * 0.75, cx - r * 0.95, cy - r * 1.15);
    g.fillTriangle(cx + r * 0.8, cy - r * 0.35, cx + r * 0.35, cy - r * 0.75, cx + r * 0.95, cy - r * 1.15);
    // cuerpo
    g.fillStyle(color, alpha).fillCircle(cx, cy, r);
    g.fillStyle(dark, alpha).fillEllipse(cx, cy + r * 0.55, r * 1.5, r * 0.7);
    g.fillStyle(color, alpha).fillEllipse(cx, cy + r * 0.35, r * 1.6, r * 0.8);
    // pies
    const step = p.moving ? Math.sin(this.time_ * 14) * 3 : 0;
    g.fillStyle(dark, alpha);
    g.fillEllipse(cx - r * 0.45, cy + r * 0.95 + step, r * 0.55, r * 0.35);
    g.fillEllipse(cx + r * 0.45, cy + r * 0.95 - step, r * 0.55, r * 0.35);
    // ojos
    const lx = p.facing === 3 ? -3 : p.facing === 4 ? 3 : 0;
    const ly = p.facing === 1 ? -3 : p.facing === 2 ? 2 : 0;
    if (p.alive) {
      g.fillStyle(0xffffff).fillCircle(cx - r * 0.35, cy - r * 0.15, r * 0.3).fillCircle(cx + r * 0.35, cy - r * 0.15, r * 0.3);
      g.fillStyle(0x111122).fillCircle(cx - r * 0.35 + lx, cy - r * 0.15 + ly, r * 0.14).fillCircle(cx + r * 0.35 + lx, cy - r * 0.15 + ly, r * 0.14);
    } else {
      g.lineStyle(3, 0x111122, alpha);
      for (const ex of [-0.35, 0.35]) {
        const ox = cx + r * ex;
        const oy = cy - r * 0.15;
        g.lineBetween(ox - 4, oy - 4, ox + 4, oy + 4).lineBetween(ox - 4, oy + 4, ox + 4, oy - 4);
      }
    }
    // marcador del jugador humano
    if (id === 0 && p.alive) {
      const ay = cy - r * 1.45 + Math.sin(this.time_ * 6) * 2;
      g.fillStyle(0xffffff).fillTriangle(cx - 6, ay - 6, cx + 6, ay - 6, cx, ay + 2);
    }
  }

  private drawHud(): void {
    const g = this.gHud;
    const game = this.match;
    const W = game.w * T;
    g.clear();
    g.fillStyle(0x110f1b).fillRect(0, 0, W, HUD);

    const t = Math.ceil(game.timeLeft);
    const rain = game.timeLeft <= 0;
    this.timerText.setText(rain ? '¡LLUVIA!' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.timerText.setColor(rain ? '#ff6a6a' : t <= 15 ? '#ffd84a' : '#ffffff');

    // Fichas de jugadores a la izquierda del reloj.
    const n = game.players.length;
    const avail = W / 2 - 70;
    const slot = Math.min(56, avail / n);
    game.players.forEach((p, i) => {
      const x = 14 + i * slot;
      const y = HUD / 2;
      g.fillStyle(PLAYER_COLORS[i], p.alive ? 1 : 0.3).fillCircle(x + 9, y, 9);
      if (!p.alive) g.lineStyle(2, 0xffffff, 0.7).lineBetween(x + 3, y - 6, x + 15, y + 6);
      if (i === 0) g.lineStyle(2, 0xffffff).strokeCircle(x + 9, y, 11);
      const txt = this.winTexts[i];
      txt.setPosition(x + 21, y).setText(String(this.data_.wins[i])).setAlpha(p.alive ? 1 : 0.5);
    });
    this.roundText.setText(`Ronda ${this.data_.round} · gana con ${this.data_.settings.roundsToWin}`);
  }
}

