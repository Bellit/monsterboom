import Phaser from 'phaser';
import './style.css';
import { BattleScene, type MatchSettings, type StoryRun } from './scenes/BattleScene';
import { BASE_STATS, type PlayerStats } from './core/game';
import { levelAt, levelLabel, nextLevel, WORLDS } from './core/story';
import { START_LIVES, clearRun, loadRun, newRun, saveRun, worldName } from './storySave';
import { Controls } from './input/controls';
import { MONSTERS, cssColor, skinsFor } from './theme';
import { canvasPainter, paintMonster } from './render/monster';
import type { Difficulty } from './core/types';
import { MAPS, type MapId } from './core/maps';
import { sfx } from './audio/sfx';
import { music } from './audio/music';
import { audio, type Bus } from './audio/engine';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Selector de mapa (sale de la lista de mapas del juego).
const mapSelect = $<HTMLSelectElement>('map-select');
const mapDesc = $('map-desc');
for (const m of MAPS) mapSelect.add(new Option(m.name, m.id));
const showMapDesc = () => {
  mapDesc.textContent = MAPS.find((m) => m.id === mapSelect.value)?.description ?? '';
};
mapSelect.addEventListener('change', showMapDesc);
showMapDesc();

// Selector de monstruo: miniaturas dibujadas con el mismo código que el juego.
const SKIN_KEY = 'boom-monsters:skin';
let skin = Math.min(MONSTERS.length - 1, Math.max(0, Number(localStorage.getItem(SKIN_KEY) ?? 0) || 0));
const skinOptions = $('skin-options');
const skinName = $('skin-name');
const skinBio = $('skin-bio');
MONSTERS.forEach((m, i) => {
  const label = document.createElement('label');
  label.className = 'skin';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'skin';
  input.value = String(i);
  input.checked = i === skin;
  input.setAttribute('aria-label', m.name);
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) paintMonster(canvasPainter(ctx), m, 48, 54, 26, { lookX: 0, lookY: 0.4, alpha: 1, alive: true, step: 0, pupil: 0x111122 });
  input.addEventListener('change', () => {
    skin = i;
    localStorage.setItem(SKIN_KEY, String(i));
    showSkin();
    sfx.select();
  });
  label.append(input, canvas);
  skinOptions.append(label);
});
function showSkin(): void {
  const m = MONSTERS[skin];
  skinName.textContent = m.name;
  skinName.style.color = cssColor(m.color);
  skinBio.textContent = '· ' + m.bio;
}
showSkin();

// Botones de efectos y música.
function audioToggle(id: string, bus: Bus, on: string, off: string, labels: [string, string]): void {
  const btn = $(id);
  const paint = () => {
    const isOff = audio.isOff(bus);
    btn.textContent = isOff ? off : on;
    btn.setAttribute('aria-pressed', String(isOff));
    btn.setAttribute('aria-label', isOff ? labels[1] : labels[0]);
  };
  btn.addEventListener('click', () => {
    audio.setOff(bus, !audio.isOff(bus));
    paint();
    btn.blur();
  });
  paint();
}
audioToggle('mute', 'sfx', '🔊', '🔇', ['Silenciar los efectos', 'Activar los efectos']);
audioToggle('music-toggle', 'music', '🎵', '🎵', ['Apagar la música', 'Encender la música']);
music.play('menu');

const menu = $('menu');
const pauseScreen = $('pause');
const resultScreen = $('result');
const resultTitle = $('result-title');
const resultText = $('result-text');
const resultActions = $('result-actions');
const touch = $('touch');

const controls = new Controls();

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 720,
  height: 680,
  backgroundColor: '#1a1726',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
  autoFocus: true,
});

phaser.scene.add('battle', BattleScene, false);
// En desarrollo, acceso desde la consola para depurar.
if (import.meta.env.DEV) Object.assign(window, { phaser, music, audio });

let current: MatchSettings | null = null;

function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
}

function scene(): BattleScene {
  return phaser.scene.getScene('battle') as BattleScene;
}

function enterGame(data: Parameters<BattleScene['init']>[0]): void {
  show(menu, false);
  show(resultScreen, false);
  show(pauseScreen, false);
  show(touch, true);
  document.body.classList.add('in-game');
  document.body.classList.remove('paused');
  controls.enabled = true;
  if (phaser.scene.isActive('battle') || phaser.scene.isPaused('battle')) scene().scene.restart(data);
  else phaser.scene.start('battle', data);
}

const hooks = { controls, onRoundOver, onStoryOver };

function startMatch(settings: MatchSettings): void {
  current = settings;
  enterGame({ settings, wins: new Array(settings.players).fill(0), round: 1, hooks });
}

// ---------- Modo historia ----------

let run: StoryRun | null = null;
let storyTimer: number | undefined;

/** Ajustes de relleno: el modo historia no los usa, pero la escena los espera. */
const STORY_SETTINGS: MatchSettings = { players: 1, difficulty: 'normal', roundsToWin: 1, roundTime: 0, map: 'classic', skin: 0 };

function playLevel(r: StoryRun): void {
  run = r;
  saveRun(r);
  enterGame({ settings: STORY_SETTINGS, wins: [0], round: 1, hooks, story: r });
}

function onStoryOver(result: 'clear' | 'dead', score: number, stats: PlayerStats): void {
  if (!run) return;
  const r = run;
  resultActions.replaceChildren();
  resultTitle.style.color = '';
  clearTimeout(storyTimer);

  if (result === 'clear') {
    const next = nextLevel(r.pos);
    const wasBoss = !!levelAt(r.pos)?.boss;
    if (!next) {
      clearRun();
      run = null;
      endScreen('¡Has terminado Boom Monsters!', `Puntuación final: ${score}`, [
        button('Menú', toMenu, true),
      ], 'worldClear');
      return;
    }
    const nr: StoryRun = { ...r, pos: next, score, stats };
    saveRun(nr);
    resultTitle.style.color = '#7dff9a';
    resultTitle.textContent = wasBoss ? `¡${worldName(r.pos.world)} completado!` : '¡Nivel superado!';
    resultText.textContent = `★ ${score} · Siguiente: ${worldName(next.world)} ${levelLabel(next)}`;
    show(resultScreen, true);
    storyTimer = window.setTimeout(() => playLevel(nr), wasBoss ? 5200 : 2600);
    return;
  }

  const lives = r.lives - 1;
  if (lives > 0) {
    // Se pierde una vida y las mejoras; se repite el nivel.
    const nr: StoryRun = { ...r, lives, score, stats: { ...BASE_STATS } };
    saveRun(nr);
    resultTitle.style.color = '#ff9a9a';
    resultTitle.textContent = '¡Te han pillado!';
    resultText.textContent = lives === 1 ? 'Te queda 1 vida' : `Te quedan ${lives} vidas`;
    show(resultScreen, true);
    storyTimer = window.setTimeout(() => playLevel(nr), 2400);
    return;
  }

  // Sin vidas: se vuelve al principio del mundo.
  const nr = newRun(skin, r.pos.world);
  saveRun(nr);
  run = nr;
  endScreen('Fin de la partida', `Vuelves al principio de ${worldName(r.pos.world)} con ${START_LIVES} vidas.`, [
    button('Reintentar', () => playLevel({ ...nr, skin }), true),
    button('Menú', toMenu),
  ], 'gameOver');
}

function endScreen(title: string, text: string, actions: HTMLButtonElement[], jingle: 'worldClear' | 'gameOver'): void {
  controls.enabled = false;
  show(touch, false);
  music.jingle(jingle, 'menu');
  resultTitle.textContent = title;
  resultText.textContent = text;
  resultActions.replaceChildren(...actions);
  show(resultScreen, true);
  actions[0]?.focus();
}

// Selector de modo y progreso guardado.
const MODE_KEY = 'boom-monsters:mode';
const storyOpts = $('story-opts');
const battleOpts = $('battle-opts');
const storyProgress = $('story-progress');
const storyContinue = $<HTMLButtonElement>('story-continue');
const storyNew = $<HTMLButtonElement>('story-new');

function currentMode(): 'story' | 'battle' {
  return (document.querySelector<HTMLInputElement>('input[name=mode]:checked')?.value as 'story' | 'battle') ?? 'story';
}

function refreshMenu(): void {
  const mode = currentMode();
  show(storyOpts, mode === 'story');
  show(battleOpts, mode === 'battle');
  const saved = loadRun();
  if (saved) {
    storyProgress.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = `${worldName(saved.pos.world)} ${levelLabel(saved.pos)}`;
    storyProgress.append('Partida guardada: ', strong, ` · ❤ ${saved.lives} · ★ ${saved.score}`);
    show(storyContinue, true);
    storyNew.className = 'wide';
    storyNew.textContent = 'Nueva partida';
  } else {
    storyProgress.textContent = `${WORLDS.length} mundos, ${WORLDS.reduce((s, w) => s + w.levels.length, 0)} niveles. Elimina a todos los bichos y encuentra la puerta.`;
    show(storyContinue, false);
    storyNew.className = 'primary wide';
    storyNew.textContent = 'Empezar';
  }
}

for (const input of document.querySelectorAll<HTMLInputElement>('input[name=mode]')) {
  if (input.value === localStorage.getItem(MODE_KEY)) input.checked = true;
  input.addEventListener('change', () => {
    localStorage.setItem(MODE_KEY, currentMode());
    refreshMenu();
  });
}
refreshMenu();

function continueStory(): void {
  const saved = loadRun();
  playLevel(saved ? { ...saved, skin } : newRun(skin));
}
storyContinue.addEventListener('click', continueStory);
storyNew.addEventListener('click', () => {
  if (loadRun() && !confirm('¿Empezar de cero? Se perderá la partida guardada.')) return;
  playLevel(newRun(skin));
});

function onRoundOver(winner: number, wins: number[], settings: MatchSettings, next: () => void): void {
  const champion = wins.findIndex((w) => w >= settings.roundsToWin);
  const skins = skinsFor(settings.skin, wins.length);
  const name = (id: number) => (id === 0 ? 'Tú' : MONSTERS[skins[id]].name);
  resultActions.replaceChildren();
  resultTitle.style.color = winner >= 0 ? cssColor(MONSTERS[skins[winner]].color) : '';

  if (champion >= 0) {
    controls.enabled = false;
    show(touch, false);
    resultTitle.textContent = champion === 0 ? '¡Has ganado la partida!' : `${name(champion)} gana la partida`;
    resultText.textContent = scoreLine(wins, name);
    music.jingle(champion === 0 ? 'worldClear' : 'gameOver', 'menu');
    resultActions.append(
      button('Revancha', () => current && startMatch(current), true),
      button('Menú', toMenu),
    );
    show(resultScreen, true);
    resultActions.querySelector('button')?.focus();
  } else {
    resultTitle.textContent = winner < 0 ? 'Empate' : winner === 0 ? '¡Ronda para ti!' : `Ronda para ${name(winner)}`;
    resultText.textContent = scoreLine(wins, name);
    show(resultScreen, true);
    setTimeout(() => {
      show(resultScreen, false);
      next();
    }, 2200);
  }
}

function scoreLine(wins: number[], name: (id: number) => string): string {
  return wins.map((w, i) => `${name(i)} ${w}`).join(' · ');
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (primary) b.className = 'primary';
  b.addEventListener('click', onClick);
  return b;
}

function toMenu(): void {
  clearTimeout(storyTimer);
  run = null;
  refreshMenu();
  controls.enabled = false;
  controls.reset();
  if (phaser.scene.isActive('battle') || phaser.scene.isPaused('battle')) phaser.scene.stop('battle');
  show(resultScreen, false);
  show(pauseScreen, false);
  show(touch, false);
  document.body.classList.remove('in-game', 'paused');
  show(menu, true);
  music.play('menu');
  (currentMode() === 'story' ? (loadRun() ? storyContinue : storyNew) : $('start')).focus();
}

function setPaused(on: boolean): void {
  const s = scene();
  if (!s || !phaser.scene.isActive('battle') || !resultScreen.hidden) return;
  s.paused = on;
  controls.reset();
  show(pauseScreen, on);
  document.body.classList.toggle('paused', on);
  if (on) $('resume').focus();
}

controls.onPause = () => setPaused(!scene()?.paused);

$('menu-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (currentMode() === 'story') {
    continueStory();
    return;
  }
  const form = new FormData(e.target as HTMLFormElement);
  startMatch({
    players: Number(form.get('players')),
    difficulty: form.get('difficulty') as Difficulty,
    roundsToWin: Number(form.get('rounds')),
    roundTime: Number(form.get('time')),
    map: form.get('map') as MapId,
    skin,
  });
});
$('resume').addEventListener('click', () => setPaused(false));
$('quit').addEventListener('click', toMenu);
$('touch-pause').addEventListener('click', () => setPaused(true));
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !pauseScreen.hidden) setPaused(false);
});

show(touch, false);
