import Phaser from 'phaser';
import './style.css';
import { BattleScene, type MatchSettings } from './scenes/BattleScene';
import { Controls } from './input/controls';
import { PLAYER_COLORS, PLAYER_NAMES, cssColor } from './theme';
import type { Difficulty } from './core/types';
import { MAPS, type MapId } from './core/maps';
import { sfx } from './audio/sfx';

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

// Botón de sonido.
const muteBtn = $('mute');
const paintMute = () => {
  muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(sfx.muted));
  muteBtn.setAttribute('aria-label', sfx.muted ? 'Activar el sonido' : 'Silenciar el sonido');
};
muteBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  paintMute();
  muteBtn.blur();
});
paintMute();

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
  const name = (id: number) => (id === 0 ? 'Tú' : PLAYER_NAMES[id]);
  resultActions.replaceChildren();
  resultTitle.style.color = winner >= 0 ? cssColor(PLAYER_COLORS[winner]) : '';

  if (champion >= 0) {
    controls.enabled = false;
    show(touch, false);
    resultTitle.textContent = champion === 0 ? '¡Has ganado la partida!' : `${name(champion)} gana la partida`;
    resultText.textContent = scoreLine(wins);
    resultActions.append(
      button('Revancha', () => current && startMatch(current), true),
      button('Menú', toMenu),
    );
    show(resultScreen, true);
    resultActions.querySelector('button')?.focus();
  } else {
    resultTitle.textContent = winner < 0 ? 'Empate' : winner === 0 ? '¡Ronda para ti!' : `Ronda para ${name(winner)}`;
    resultText.textContent = scoreLine(wins);
    show(resultScreen, true);
    setTimeout(() => {
      show(resultScreen, false);
      next();
    }, 2200);
  }
}

function scoreLine(wins: number[]): string {
  return wins.map((w, i) => `${i === 0 ? 'Tú' : PLAYER_NAMES[i]} ${w}`).join(' · ');
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
  });
});
$('resume').addEventListener('click', () => setPaused(false));
$('quit').addEventListener('click', toMenu);
$('touch-pause').addEventListener('click', () => setPaused(true));
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !pauseScreen.hidden) setPaused(false);
});

show(touch, false);
