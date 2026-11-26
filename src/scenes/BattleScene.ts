import Phaser from 'phaser';
import { Game, STEP, type PlayerStats } from '../core/game';
import { WORLDS, levelAt, levelLabel, type StoryPos } from '../core/story';
import { paintEnemy } from '../render/enemies';
import { THEMES, drawIce, type ThemeArt } from '../render/themes';
import { BotBrain } from '../core/ai';
import { MAPS, type MapId } from '../core/maps';
import { FLOOR, POWER, TILE, conveyorDir, type CurseType, type Difficulty, type GameEvent, type PlayerInput } from '../core/types';
import type { Controls } from '../input/controls';
import { sfx } from '../audio/sfx';
import { music } from '../audio/music';
import { MONSTERS, skinsFor, type Monster } from '../theme';
import { paintMonster, type Painter } from '../render/monster';

export interface MatchSettings {
  players: number;
  difficulty: Difficulty;
  roundsToWin: number;
  roundTime: number;
  map: MapId;
  /** Monstruo elegido por el jugador (índice en MONSTERS). */
  skin: number;
}

export interface MatchHooks {
  controls: Controls;
  onRoundOver: (winner: number, wins: number[], settings: MatchSettings, next: () => void) => void;
  onStoryOver?: (result: 'clear' | 'dead', score: number, stats: PlayerStats) => void;
}

/** Partida del modo historia en curso. */
export interface StoryRun {
  pos: StoryPos;
  lives: number;
  score: number;
  stats: PlayerStats;
  skin: number;
}

interface SceneData {
  settings: MatchSettings;
  wins: number[];
  round: number;
  hooks: MatchHooks;
  /** Si está, se juega un nivel del modo historia. */
  story?: StoryRun;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
  gravity: number;
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
  flameCore: 0xfff6d0,
  bomb: 0x23213a,
  rainBomb: 0x5a1f2a,
  ice: 0x9fd8ef,
  iceB: 0x8ccbe6,
  belt: 0x3b3f4a,
  beltArrow: 0xf2c14e,
  portal: 0x7b3fe4,
  portalGlow: 0xc9a2ff,
  shield: 0x7fe7ff,
  curse: 0xb04dff,
};

/** Color de cada pareja de portales. */
const PORTAL_COLORS = [0xa66bff, 0x2fd0e8, 0xff9a3c];
const POWER_COLORS = [0x3c3c78, 0xb8321f, 0x2b6bd9, 0x2f9a4a, 0x0f8f8f, 0x2a7fbf, 0x2b1b3a];
const POWER_LABELS = ['+1 bomba', '+fuego', '+velocidad', 'patada', 'lanzar', 'escudo', 'maldición'];
const CURSE_LABELS: Record<CurseType, string> = {
  slow: '¡lento!',
  fast: '¡acelerado!',
  reverse: '¡al revés!',
  diarrhea: '¡bombas sin control!',
  nobomb: '¡sin bombas!',
};

export class BattleScene extends Phaser.Scene {
  private match!: Game;
  private data_!: SceneData;
  private bots: BotBrain[] = [];
  private acc = 0;
  private time_ = 0;
  private gStatic!: Phaser.GameObjects.Graphics;
  private gDyn!: Phaser.GameObjects.Graphics;
  private gFx!: Phaser.GameObjects.Graphics;
  private gHud!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private winTexts: Phaser.GameObjects.Text[] = [];
  private roundText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private particles: Particle[] = [];
  private skins: Monster[] = [];
  private theme!: ThemeArt;
  /** Bloques que ya estaban rompiéndose (para lanzar trozos solo una vez). */
  private seenBurning = new Set<number>();
  /** Si el jugador 0 iba patinando en el paso anterior (para el sonido). */
  private wasSliding = false;
  /** Niebla nocturna de la Cripta (solo en el modo historia). */
  private fog: Phaser.GameObjects.RenderTexture | null = null;
  private light!: Phaser.GameObjects.Image;
  private painter!: Painter;
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
    this.particles = [];
    this.seenBurning = new Set();
    this.wasSliding = false;
  }

  create(): void {
    const { settings, story } = this.data_;
    const seed = (Date.now() ^ (this.data_.round * 7919)) >>> 0;
    const level = story ? levelAt(story.pos) : null;
    this.match = story && level
      ? new Game({
        players: 1, seed, roundTime: level.time, map: WORLDS[story.pos.world].theme,
        story: level, startStats: story.stats,
      })
      : new Game({ players: settings.players, seed, roundTime: settings.roundTime, map: settings.map });
    this.skins = story
      ? [MONSTERS[story.skin]]
      : skinsFor(settings.skin, this.match.players.length).map((i) => MONSTERS[i]);
    this.bots = this.match.players.slice(1).map((p) => new BotBrain(p.id, settings.difficulty));
    this.data_.hooks.controls.reset();

    const W = this.match.w * T;
    const H = this.match.h * T + HUD;
    this.scale.setGameSize(W, H);
    this.theme = THEMES[this.match.mapId === 'custom' ? 'classic' : this.match.mapId];
    this.cameras.main.setBackgroundColor(this.theme.bg);

    this.gStatic = this.add.graphics();
    this.gDyn = this.add.graphics();
    this.gFx = this.add.graphics();
    this.setupFog(W, H);
    this.gHud = this.add.graphics();
    this.painter = phaserPainter(this.gDyn);
    this.drawStatic();

    const font = { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold' };
    this.timerText = this.add.text(W / 2, 22, '', { ...font, fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);
    this.roundText = this.add.text(W / 2, 45, '', { ...font, fontSize: '11px', color: '#b9b3d6' }).setOrigin(0.5);
    this.statsText = this.add.text(W - 12, HUD / 2, '', { ...font, fontSize: '15px', color: '#ffffff' }).setOrigin(1, 0.5);
    this.match.players.forEach(() => {
      const t = this.add.text(0, 0, '', { ...font, fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0.5);
      this.winTexts.push(t);
    });

    const mapName = this.match.mapId;
    if (story) {
      const lv = levelAt(story.pos);
      this.floatText(W / 2, HUD + 40, `${WORLDS[story.pos.world].name} ${levelLabel(story.pos)}`, '#ffffff', 22, 2400);
      if (lv?.boss) this.floatText(W / 2, HUD + 72, '¡Jefe final!', '#ff6a6a', 18, 2400);
    } else if (settings.map === 'random') this.floatText(W / 2, HUD + 40, `Mapa: ${MAPS.find((m) => m.id === mapName)?.name ?? mapName}`, '#ffffff', 20, 2200);
    this.bigText('3');
    sfx.countdown(false);
    // Música: la del jefe, la del mundo o la del mapa de batalla.
    const theme = this.match.mapId === 'custom' ? 'classic' : this.match.mapId;
    if (story && levelAt(story.pos)?.boss) music.play('boss');
    else if (theme === 'classic') music.play(story ? 'crypt' : 'battle');
    else music.play(theme);
    music.setTempo(1);
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
    for (const e of this.match.events) this.onEvent(e);
    this.iceEffects();
    this.match.events.length = 0;
    this.shake = Math.max(0, this.shake - dt);
    this.updateParticles(dt);

    this.drawDynamic();
    this.drawFx();
    this.drawFog();
    this.drawHud();

    if (this.match.phase === 'over' && !this.roundHandled && this.data_.story) {
      this.roundHandled = true;
      const result = this.match.result ?? 'dead';
      this.data_.hooks.onStoryOver?.(result, this.data_.story.score + this.match.score, this.match.statsOf());
    } else if (this.match.phase === 'over' && !this.roundHandled) {
      this.roundHandled = true;
      const { settings, wins, round, hooks } = this.data_;
      const w = wins.slice();
      if (this.match.winner >= 0) w[this.match.winner]++;
      if (this.match.winner === 0) sfx.win();
      hooks.onRoundOver(this.match.winner, w, settings, () => {
        this.scene.restart({ settings, wins: w, round: round + 1, hooks });
      });
    }
  }

  // ---------- Eventos: sonido y efectos ----------

  private onEvent(e: GameEvent): void {
    const px = (x: number) => x * T + T / 2;
    const py = (y: number) => y * T + T / 2 + HUD;
    switch (e.type) {
      case 'countdown':
        this.bigText(String(e.value));
        sfx.countdown(false);
        break;
      case 'go':
        this.bigText('¡YA!');
        sfx.countdown(true);
        break;
      case 'bomb':
        sfx.place();
        break;
      case 'explode':
        this.shake = Math.min(this.shake + 0.14, 0.35);
        this.burst(px(e.x), py(e.y), [C.flameIn, C.flameOut, 0xffffff], 14, 220, 0.5);
        sfx.explode();
        break;
      case 'pickup': {
        const good = e.power !== POWER.Curse;
        this.burst(px(e.x), py(e.y), good ? [0xffffff, 0xffe066] : [C.curse, 0x000000], 10, 120, 0.6, -200);
        if (e.player === 0) {
          this.floatText(px(e.x), py(e.y) - 20, POWER_LABELS[e.power], good ? '#ffe066' : '#d9a6ff');
        }
        if (good) sfx.pickup();
        break;
      }
      case 'curse': {
        const p = this.match.players[e.player];
        this.floatText(px(p.x), py(p.y) - 26, CURSE_LABELS[e.curse], '#d9a6ff');
        sfx.curse();
        break;
      }
      case 'death': {
        const p = this.match.players[e.player];
        this.burst(px(p.x), py(p.y), [this.skins[e.player].color, 0xffffff], 22, 260, 0.8);
        sfx.death();
        break;
      }
      case 'shieldBreak': {
        const p = this.match.players[e.player];
        this.burst(px(p.x), py(p.y), [C.shield, 0xffffff], 16, 200, 0.5);
        sfx.shield();
        break;
      }
      case 'portalFire':
        this.burst(px(e.x), py(e.y), [C.flameIn, C.flameOut, C.portalGlow], 16, 220, 0.5);
        sfx.teleport();
        break;
      case 'portalBomb':
        this.burst(px(e.fromX), py(e.fromY), [C.portalGlow, 0xffffff], 8, 120, 0.4);
        this.burst(px(e.x), py(e.y), [C.portalGlow, 0xffffff], 12, 160, 0.4);
        sfx.teleport();
        break;
      case 'teleport':
        this.burst(px(e.fromX), py(e.fromY), [C.portalGlow, C.portal], 10, 140, 0.4);
        this.burst(px(e.x), py(e.y), [C.portalGlow, 0xffffff], 14, 160, 0.5);
        sfx.teleport();
        break;
      case 'freeze':
        this.drawStatic();
        this.burst(px(e.x), py(e.y), [0xffffff, 0xbfeaff], 8, 90, 0.5, -40);
        break;
      case 'kick':
        sfx.kick();
        break;
      case 'throw':
        sfx.throw();
        break;
      case 'land':
        this.burst(px(e.x), py(e.y), [0xcccccc, 0x888888], 6, 80, 0.3);
        sfx.land();
        break;
      case 'enemyDeath':
        this.burst(px(e.x), py(e.y), e.boss ? [0xffd84a, 0xffffff, C.flameOut] : [0xffffff, 0xcfe9ff], e.boss ? 40 : 14, e.boss ? 320 : 180, 0.7);
        this.floatText(px(e.x), py(e.y) - 16, String(e.points), '#ffe066', e.boss ? 26 : 16);
        if (e.boss) { this.shake = 0.5; this.bigText('¡JEFE DERROTADO!', '#ffd84a', 44); }
        sfx.enemyDeath();
        break;
      case 'bossHit':
        this.burst(px(e.x), py(e.y), [0xffffff, 0xff6a6a], 14, 200, 0.5);
        this.floatText(px(e.x), py(e.y) - 30, `¡Ay! (${e.hp})`, '#ff9a9a', 18);
        sfx.bossHit();
        break;
      case 'doorFound':
        this.floatText(px(e.x), py(e.y) - 16, '¡La puerta!', '#ffffff', 16, 1400);
        break;
      case 'doorOpen':
        this.floatText(this.match.w * T / 2, HUD + 40, '¡Puerta abierta!', '#7dff9a', 22, 1800);
        sfx.doorOpen();
        break;
      case 'clear':
        this.bigText('¡NIVEL SUPERADO!', '#7dff9a', 44);
        music.jingle(this.data_.story && levelAt(this.data_.story.pos)?.boss ? 'worldClear' : 'clear');
        break;
      case 'hunters':
        this.bigText('¡VIENEN LOS CAZADORES!', '#ff6a6a', 36);
        sfx.alarm();
        music.setTempo(1.3);
        break;
      case 'rainStart':
        this.bigText('¡LLUVIA DE BOMBAS!', '#ff6a6a', 40);
        sfx.alarm();
        music.setTempo(1.3);
        break;
    }
  }

  /** Esquirlas al patinar y sonido al empezar a deslizarse. */
  private iceEffects(): void {
    const game = this.match;
    game.players.forEach((p, i) => {
      if (!p.alive) return;
      const onIce = game.floor[game.idx(Math.round(p.x), Math.round(p.y))] === FLOOR.Ice;
      const sliding = onIce && p.iceDir !== 0;
      if (sliding && Math.random() < 0.6) {
        const back = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]][p.iceDir];
        this.particles.push({
          x: p.x * T + T / 2 + back[0] * 12 + (Math.random() - 0.5) * 14,
          y: p.y * T + T * 0.85 + HUD + back[1] * 8,
          vx: back[0] * 60 + (Math.random() - 0.5) * 50,
          vy: -40 - Math.random() * 60,
          life: 0.35, max: 0.35, color: Math.random() < 0.5 ? 0xffffff : 0xcfefff, size: 2 + Math.random() * 2, gravity: 260,
        });
      }
      if (i === 0) {
        if (sliding && !this.wasSliding) sfx.slide();
        this.wasSliding = sliding;
      }
    });
  }

  private burst(x: number, y: number, colors: number[], n: number, speed: number, life: number, gravity = 300): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.3,
        life: life * (0.6 + Math.random() * 0.4),
        max: life,
        color: colors[i % colors.length],
        size: 2 + Math.random() * 3,
        gravity,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private floatText(x: number, y: number, text: string, color: string, size = 16, ms = 900): void {
    const t = this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fontSize: `${size}px`, color,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: ms, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
  }

  private bigText(text: string, color = '#ffffff', size = 72): void {
    const W = this.match.w * T;
    const H = this.match.h * T + HUD;
    const t = this.add.text(W / 2, H / 2, text, {
      fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fontSize: `${size}px`, color,
      stroke: '#1a1726', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(30).setScale(1.6).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 300, onComplete: () => t.destroy() });
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
        const k = game.idx(x, y);
        if (game.tiles[k] === TILE.Solid) {
          this.theme.wall(g, px, py, T);
          continue;
        }
        const f = game.floor[k];
        if (f === FLOOR.Ice) {
          drawIce(g, px, py, x, y, T);
        } else if (conveyorDir(f)) {
          g.fillStyle(C.belt).fillRect(px, py, T, T);
          g.fillStyle(0x2a2d36).fillRect(px, py, T, 3).fillRect(px, py + T - 3, T, 3);
        } else {
          this.theme.floor(g, px, py, x, y, T);
        }
        if (f === FLOOR.Teleport) {
          const col = PORTAL_COLORS[(game.portalGroup.get(k) ?? 0) % PORTAL_COLORS.length];
          g.fillStyle(0x0d0820).fillEllipse(px + T / 2, py + T / 2, T * 0.85, T * 0.7);
          g.lineStyle(4, col).strokeEllipse(px + T / 2, py + T / 2, T * 0.85, T * 0.7);
        }
        // sombra de la pared de arriba
        if (y > 0 && game.tiles[game.idx(x, y - 1)] === TILE.Solid && f !== FLOOR.Ice) {
          g.fillStyle(0x000000, this.theme.shadow).fillRect(px, py, T, 8);
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
    this.gFx.setPosition(sx, sy);
    this.fog?.setPosition(sx, HUD + sy);

    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        const k = game.idx(x, y);
        const px = x * T;
        const py = y * T + HUD;
        const t = game.tiles[k];
        const f = game.floor[k];
        // Suelos animados.
        const conv = conveyorDir(f);
        if (conv && t === TILE.Empty) this.drawBeltArrows(g, px, py, conv);
        if (f === FLOOR.Teleport) {
          const pulse = 0.5 + 0.5 * Math.sin(this.time_ * 4 + k);
          const col = PORTAL_COLORS[(game.portalGroup.get(k) ?? 0) % PORTAL_COLORS.length];
          g.fillStyle(col, 0.25 + pulse * 0.35).fillEllipse(px + T / 2, py + T / 2, T * 0.55 * (0.8 + pulse * 0.2), T * 0.42);
        }
        if (k === game.door && t === TILE.Empty) this.drawDoor(g, px, py, game.doorOpen);
        if (t === TILE.Soft) {
          this.theme.soft(g, px, py, T, k);
        } else if (t === TILE.Burning) {
          const left = game.burning.get(k) ?? 0;
          if (!this.seenBurning.has(k)) {
            this.seenBurning.add(k);
            this.burst(px + T / 2, py + T / 2, this.theme.shards, 10, 170, 0.6);
          }
          this.theme.burning(g, px, py, T, Math.min(1, left / 0.5));
        } else if (game.powerups[k] >= 0) {
          this.drawPowerup(g, game.powerups[k], px, py);
        }
      }
    }

    for (const b of game.bombs) {
      let bx = b.tx;
      let by = b.ty;
      let lift = 0;
      if (b.flight) {
        const f = Math.min(1, b.flight.t / b.flight.dur);
        bx = b.flight.fromX + (b.tx - b.flight.fromX) * f;
        by = b.flight.fromY + (b.ty - b.flight.fromY) * f;
        lift = Math.sin(f * Math.PI) * T * 1.3;
      } else if (b.slide) {
        bx += b.slide === 3 ? -b.offset : b.slide === 4 ? b.offset : 0;
        by += b.slide === 1 ? -b.offset : b.slide === 2 ? b.offset : 0;
      }
      const cx = bx * T + T / 2;
      const ground = by * T + T / 2 + HUD;
      const cy = ground - lift;
      const pulse = 1 + 0.08 * Math.sin((b.fuse < 1 ? 26 : 12) * b.fuse);
      const r = T * 0.33 * pulse;
      g.fillStyle(0x000000, 0.25).fillEllipse(cx, ground + r * 0.9, r * 1.8 * (1 - lift / (T * 3)), r * 0.6);
      // Contorno claro: que se vea en cualquier suelo, también en los oscuros.
      g.fillStyle(0xffffff, 0.55).fillCircle(cx, cy, r + 2);
      g.fillStyle(b.owner < 0 ? C.rainBomb : C.bomb).fillCircle(cx, cy, r);
      if (b.fuse < 0.8 && Math.sin(this.time_ * 30) > 0) g.fillStyle(0xff3030, 0.35).fillCircle(cx, cy, r);
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
      const flicker = 1 + Math.sin(this.time_ * 50 + k) * 0.06;
      for (const [col, size] of [[C.flameOut, 0.86], [C.flameIn, 0.55], [C.flameCore, 0.25]] as const) {
        const w = T * size * s * flicker;
        g.fillStyle(col);
        if (m & 1) g.fillRect(x * T, cy - w / 2, T, w);
        if (m & 2) g.fillRect(cx - w / 2, y * T + HUD, w, T);
        if (m & 4) g.fillCircle(cx, cy, w * 0.66);
      }
    }

    for (const e of game.enemies) {
      paintEnemy(this.painter, e, e.x * T + T / 2, e.y * T + T / 2 + HUD, T * 0.36, this.time_);
      if (e.boss && e.alive) {
        // barra de vida
        const w = T * 1.4;
        const bx = e.x * T + T / 2 - w / 2;
        const by = e.y * T + HUD - T * 0.75;
        g.fillStyle(0x000000, 0.6).fillRect(bx - 2, by - 2, w + 4, 10);
        g.fillStyle(0xff4d6d).fillRect(bx, by, w * (e.hp / e.maxHp), 6);
      }
    }
    const order = game.players.slice().sort((a, b) => a.y - b.y);
    for (const p of order) this.drawMonster(g, p.id);
  }

  private drawDoor(g: Phaser.GameObjects.Graphics, px: number, py: number, open: boolean): void {
    const x = px + 8;
    const y = py + 6;
    const w = T - 16;
    const h = T - 10;
    g.fillStyle(0x2a1d14).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, { tl: 14, tr: 14, bl: 2, br: 2 });
    if (open) {
      const glow = 0.6 + 0.4 * Math.sin(this.time_ * 5);
      g.fillStyle(0xfff2a8, glow).fillRoundedRect(x, y, w, h, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.fillStyle(0xffffff, 0.5 * glow).fillRect(x + w / 2 - 3, y + 6, 6, h - 6);
    } else {
      g.fillStyle(0x7a4a2a).fillRoundedRect(x, y, w, h, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.fillStyle(0x5a3520).fillRect(x + w / 2 - 1, y + 4, 2, h - 4);
      g.fillStyle(0xffd84a).fillCircle(x + w - 7, y + h / 2 + 2, 2.5);
    }
  }

  private drawBeltArrows(g: Phaser.GameObjects.Graphics, px: number, py: number, dir: number): void {
    const phase = (this.time_ * 1.8) % 1;
    g.fillStyle(C.beltArrow, 0.75);
    for (let i = 0; i < 2; i++) {
      const o = ((phase + i * 0.5) % 1) * T;
      const cx = px + T / 2;
      const cy = py + T / 2;
      const s = 7;
      if (dir === 4) { const x = px + o; g.fillTriangle(x - s, cy - s, x - s, cy + s, x + 1, cy); }
      else if (dir === 3) { const x = px + T - o; g.fillTriangle(x + s, cy - s, x + s, cy + s, x - 1, cy); }
      else if (dir === 2) { const y = py + o; g.fillTriangle(cx - s, y - s, cx + s, y - s, cx, y + 1); }
      else { const y = py + T - o; g.fillTriangle(cx - s, y + s, cx + s, y + s, cx, y - 1); }
    }
  }

  private drawPowerup(g: Phaser.GameObjects.Graphics, type: number, px: number, py: number): void {
    const bob = Math.sin(this.time_ * 5) * 2;
    const x = px + 6;
    const y = py + 6 + bob;
    const s = T - 12;
    const cx = x + s / 2;
    const cy = y + s / 2;
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 2, y + 3, s, s, 7);
    g.fillStyle(POWER_COLORS[type]).fillRoundedRect(x, y, s, s, 7);
    g.lineStyle(2, type === POWER.Curse ? C.curse : 0xffffff, 0.85).strokeRoundedRect(x, y, s, s, 7);
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
      case POWER.Throw:
        // mano abierta
        g.fillRoundedRect(cx - 8, cy - 2, 16, 12, 4);
        for (let i = 0; i < 4; i++) g.fillRoundedRect(cx - 8 + i * 4.2, cy - 11, 3.4, 11, 1.5);
        g.fillRoundedRect(cx + 7, cy - 3, 5, 8, 2);
        break;
      case POWER.Shield:
        g.fillTriangle(cx - 10, cy - 9, cx + 10, cy - 9, cx, cy + 12);
        g.fillRect(cx - 10, cy - 11, 20, 6);
        g.fillStyle(POWER_COLORS[POWER.Shield]).fillTriangle(cx - 5, cy - 6, cx + 5, cy - 6, cx, cy + 5);
        break;
      case POWER.Curse:
        // calavera
        g.fillStyle(0xe8dcff).fillCircle(cx, cy - 2, 9).fillRect(cx - 5, cy + 4, 10, 6);
        g.fillStyle(0x2b1b3a).fillCircle(cx - 3.5, cy - 2, 2.6).fillCircle(cx + 3.5, cy - 2, 2.6);
        g.fillRect(cx - 1, cy + 5, 2, 5);
        break;
    }
  }

  private drawMonster(g: Phaser.GameObjects.Graphics, id: number): void {
    const p = this.match.players[id];
    let scale = 1;
    let alpha = 1;
    if (!p.alive) {
      if (p.deadFor > 0.9) return;
      scale = 1 + p.deadFor * 0.6;
      alpha = 1 - p.deadFor / 0.9;
    } else if (p.invuln > 0 && Math.sin(this.time_ * 40) > 0) {
      alpha = 0.35;
    }
    const bob = p.moving ? Math.abs(Math.sin(this.time_ * 14)) * 3 : Math.sin(this.time_ * 3) * 1;
    const cx = p.x * T + T / 2;
    const cy = p.y * T + T / 2 + HUD - bob;
    const r = T * 0.36 * scale;

    g.fillStyle(0x000000, 0.25 * alpha).fillEllipse(cx, p.y * T + T * 0.92 + HUD, r * 1.8, r * 0.55);
    if (p.curse) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time_ * 10);
      g.fillStyle(C.curse, 0.18 + pulse * 0.2).fillCircle(cx, cy, r * 1.45);
    }
    const step = p.moving ? Math.sin(this.time_ * 14) * 3 : 0;
    const look = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]][p.facing];
    paintMonster(this.painter, this.skins[id], cx, cy, r, {
      lookX: look[0], lookY: look[1], alpha, alive: p.alive, step, pupil: p.curse ? C.curse : 0x111122,
    });
    if (p.alive && p.shield) {
      g.lineStyle(3, C.shield, 0.55 + 0.25 * Math.sin(this.time_ * 6)).strokeCircle(cx, cy + 2, r * 1.35);
      g.fillStyle(C.shield, 0.12).fillCircle(cx, cy + 2, r * 1.35);
    }
    // marcador del jugador humano
    if (id === 0 && p.alive) {
      const ay = cy - r * 1.45 + Math.sin(this.time_ * 6) * 2;
      g.fillStyle(0xffffff).fillTriangle(cx - 6, ay - 6, cx + 6, ay - 6, cx, ay + 2);
    }
  }

  private setupFog(W: number, H: number): void {
    this.fog = null;
    if (!this.data_.story || this.match.mapId !== 'classic') return;
    if (!this.textures.exists('light')) {
      // Círculo de luz con borde suave.
      const size = 256;
      const tex = this.textures.createCanvas('light', size, size);
      const ctx = tex?.getContext();
      if (!tex || !ctx) return;
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
    this.fog = this.add.renderTexture(0, HUD, W, H - HUD).setOrigin(0, 0).setDepth(10);
    this.light = this.make.image({ key: 'light', add: false });
  }

  /** Oscuridad con huecos de luz: tu monstruo, las llamas, las bombas y la puerta. */
  private drawFog(): void {
    const fog = this.fog;
    if (!fog) return;
    const game = this.match;
    fog.clear();
    fog.fill(0x06040c, 0.9);
    const glow = (x: number, y: number, radius: number) => {
      this.light.setPosition(x * T + T / 2, y * T + T / 2).setScale((radius * 2 * T) / 256);
      fog.erase(this.light);
    };
    const me = game.players[0];
    const flicker = 1 + Math.sin(this.time_ * 7) * 0.03;
    glow(me.x, me.y, (me.alive ? 3.4 : 4.5) * flicker);
    for (let k = 0; k < game.flames.length; k++) {
      if (game.flames[k] > 0) glow(k % game.w, Math.floor(k / game.w), 1.4);
    }
    for (const b of game.bombs) glow(b.tx, b.ty, 0.9);
    for (const e of game.enemies) if (e.alive) glow(e.x, e.y, e.boss ? 1.1 : 0.55);
    if (game.door >= 0 && game.doorOpen && game.tiles[game.door] === TILE.Empty) {
      glow(game.door % game.w, Math.floor(game.door / game.w), 1.6);
    }
  }

  private drawFx(): void {
    const g = this.gFx;
    g.clear();
    for (const p of this.particles) {
      g.fillStyle(p.color, Math.max(0, p.life / p.max));
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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
    this.roundText.setText(`RONDA ${this.data_.round} · GANA CON ${this.data_.settings.roundsToWin}`);

    const story = this.data_.story;
    if (story) {
      this.roundText.setText(`MUNDO ${levelLabel(story.pos).toUpperCase()}`);
      const me = game.players[0];
      this.winTexts[0].setPosition(14, HUD / 2).setText(`❤ ${story.lives}   ★ ${story.score + game.score}   👾 ${game.aliveEnemies()}`).setAlpha(1);
      const extras = [me.kick ? '🦶' : '', me.throw ? '✋' : '', me.shield ? '🛡️' : ''].join('');
      this.statsText.setText(`💣${me.maxBombs}  🔥${me.range}  ⚡${me.speedLv}  ${extras}`);
      return;
    }

    // Fichas de jugadores a la izquierda del reloj.
    const n = game.players.length;
    const avail = W / 2 - 70;
    const slot = Math.min(52, avail / n);
    game.players.forEach((p, i) => {
      const x = 14 + i * slot;
      const y = HUD / 2;
      g.fillStyle(this.skins[i].color, p.alive ? 1 : 0.3).fillCircle(x + 9, y, 9);
      if (!p.alive) g.lineStyle(2, 0xffffff, 0.7).lineBetween(x + 3, y - 6, x + 15, y + 6);
      if (i === 0) g.lineStyle(2, 0xffffff).strokeCircle(x + 9, y, 11);
      const txt = this.winTexts[i];
      txt.setPosition(x + 21, y).setText(String(this.data_.wins[i])).setAlpha(p.alive ? 1 : 0.5);
    });

    // Lo que lleva el jugador humano, a la derecha.
    const me = game.players[0];
    const extras = [me.kick ? '🦶' : '', me.throw ? '✋' : '', me.shield ? '🛡️' : '', me.curse ? '☠️' : ''].join('');
    this.statsText.setText(`💣${me.maxBombs}  🔥${me.range}  ⚡${me.speedLv}  ${extras}`);
  }
}

/** Adaptador del dibujo de monstruos para Phaser. */
function phaserPainter(g: Phaser.GameObjects.Graphics): Painter {
  return {
    fill: (c, a = 1) => { g.fillStyle(c, a); },
    circle: (x, y, r) => { g.fillCircle(x, y, r); },
    ellipse: (x, y, w, h) => { g.fillEllipse(x, y, w, h); },
    tri: (x1, y1, x2, y2, x3, y3) => { g.fillTriangle(x1, y1, x2, y2, x3, y3); },
    line: (x1, y1, x2, y2, w, c, a = 1) => { g.lineStyle(w, c, a).lineBetween(x1, y1, x2, y2); },
  };
}
