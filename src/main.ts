import Phaser from 'phaser';
import './style.css';
import { BattleScene, type MatchSettings } from './scenes/BattleScene';
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
if (import.meta.env.DEV) Object.assign(window, { phaser });

let current: MatchSettings | null = null;

function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
}

function scene(): BattleScene {
  return phaser.scene.getScene('battle') as BattleScene;
}

function startMatch(settings: MatchSettings): void {
  current = settings;
  show(menu, false);
  show(resultScreen, false);
  show(pauseScreen, false);
  show(touch, true);
  document.body.classList.add('in-game');
  document.body.classList.remove('paused');
  controls.enabled = true;
  const data = {
    settings,
    wins: new Array(settings.players).fill(0),
    round: 1,
    hooks: { controls, onRoundOver },
  };
  if (phaser.scene.isActive('battle') || phaser.scene.isPaused('battle')) scene().scene.restart(data);
  else phaser.scene.start('battle', data);
}

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
    music.play('menu');
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
  controls.enabled = false;
  controls.reset();
  if (phaser.scene.isActive('battle') || phaser.scene.isPaused('battle')) phaser.scene.stop('battle');
  show(resultScreen, false);
  show(pauseScreen, false);
  show(touch, false);
  document.body.classList.remove('in-game', 'paused');
  show(menu, true);
  music.play('menu');
  $('start').focus();
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
