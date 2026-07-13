import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import { InputManager } from './input.js';
import { SaveStore } from './storage.js';
import { UIController } from './ui.js';
import { dataText, setLocale, t } from './i18n.js';

const store = new SaveStore();
setLocale(store.data.settings.language || 'zh-CN');
const audio = new AudioEngine(() => store.data.settings);
const ui = new UIController(store, audio);
let input = null;

const game = new Game({
  canvas: document.getElementById('gameCanvas'),
  store,
  audio,
  callbacks: {
    getMovement: () => input?.vector() || { x: 0, y: 0 },
    getDailyContracts: () => ui.getDailyContracts(),
    onRunStart: payload => ui.onRunStart(payload),
    onHud: payload => ui.onHud(payload),
    onWeapons: player => ui.onWeapons(player),
    onLevelUp: payload => ui.showLevelUp(payload),
    onLevelUpClosed: () => ui.onLevelUpClosed(),
    onPause: paused => ui.onPause(paused),
    onRunEnd: result => ui.onRunEnd(result),
    onToast: message => ui.showToast(message),
    onBoss: () => {},
  },
});

input = new InputManager({
  joystick: document.getElementById('joystick'),
  knob: document.getElementById('joystickKnob'),
  activeButtons: document.getElementById('activeButtons'),
  onActive(action) {
    audio.ensure();
    if (action === 'manual-release') { game.setManualHeld(false); return; }
    if (action === 'pause') {
      if (game.running && !game.awaitingChoice) game.setPaused(!game.paused);
      return;
    }
    game.useActive(action);
  },
});

ui.attach(game, input);
store.subscribe(() => audio.applySettings());

addEventListener('pointerdown', () => audio.ensure(), { once: true });
addEventListener('keydown', () => audio.ensure(), { once: true });

const orientationOverlay = document.getElementById('orientationOverlay');
const requestLandscapeButton = document.getElementById('requestLandscapeButton');
const orientationStatus = document.getElementById('orientationStatus');
let pausedByOrientation = false;
let orientationFrame = 0;

function mobileLandscapeRequired() {
  const mobileLike = matchMedia('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 0
    || navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return mobileLike && innerHeight > innerWidth;
}

function updateOrientationGate() {
  orientationFrame = 0;
  const blocked = mobileLandscapeRequired();
  input?.reset();
  orientationOverlay.hidden = !blocked;
  document.body.classList.toggle('orientation-blocked', blocked);

  if (blocked) {
    orientationStatus.textContent = t('orientation.waiting');
    input?.setEnabled(false);
    if (game.running && !game.paused && !game.awaitingChoice) {
      pausedByOrientation = true;
      game.setPaused(true);
    }
    return;
  }

  requestAnimationFrame(() => requestAnimationFrame(() => game.resize()));
  if (pausedByOrientation && game.running && game.paused && !game.awaitingChoice) game.setPaused(false);
  pausedByOrientation = false;
}

function scheduleOrientationCheck() {
  if (orientationFrame) cancelAnimationFrame(orientationFrame);
  orientationFrame = requestAnimationFrame(updateOrientationGate);
}

async function requestLandscapeMode() {
  orientationStatus.textContent = t('orientation.requesting');
  let fullscreenGranted = Boolean(document.fullscreenElement);
  try {
    if (!fullscreenGranted && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      fullscreenGranted = true;
    }
  } catch {
    fullscreenGranted = false;
  }

  try {
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch {
    // iOS Safari and some embedded browsers do not expose orientation locking.
  }

  scheduleOrientationCheck();
  setTimeout(() => {
    if (!orientationOverlay.hidden) {
      orientationStatus.textContent = fullscreenGranted
        ? t('orientation.rotate')
        : t('orientation.manual');
    }
  }, 280);
}

requestLandscapeButton.addEventListener('click', requestLandscapeMode);
addEventListener('resize', scheduleOrientationCheck, { passive: true });
addEventListener('orientationchange', scheduleOrientationCheck, { passive: true });
screen.orientation?.addEventListener?.('change', scheduleOrientationCheck);
globalThis.visualViewport?.addEventListener?.('resize', scheduleOrientationCheck, { passive: true });
document.addEventListener('fullscreenchange', scheduleOrientationCheck);
updateOrientationGate();

window.__FROSTBLADE_GAME__ = {
  version: '1.3.1',
  game,
  store,
  startDay(dayId = 1) { game.startRun({ mode: 'campaign', dayId }); return game.debugState(); },
  startDaily() { game.startRun({ mode: 'daily' }); return game.debugState(); },
  startEndless() { game.startRun({ mode: 'endless', dayId: 7 }); return game.debugState(); },
  state() { return game.debugState(); },
  stress(count = 100) { return game.debugStress(count); },
  levelUp() { return game.debugLevelUp(); },
  choose(index = 0) { return game.chooseUpgrade(game.selectedChoices[index]); },
  setLanguage(value) { const locale = setLocale(value); store.data.settings.language = locale; store.save(); ui.renderAll(); game.updateHud(true); ui.onWeapons(game.player); if (game.awaitingChoice) ui.showLevelUp({ choices: game.selectedChoices, rerolls: game.player.rerolls, level: game.player.level }); return locale; },
  setQuality(value) {
    if (!['off', 'medium', 'high'].includes(value)) throw new Error('quality must be off, medium or high');
    store.data.settings.particleQuality = value; store.save(); game.resize(); return game.debugState();
  },
  setBatterySaver(enabled) { store.data.settings.batterySaver = Boolean(enabled); store.save(); game.resize(); return game.debugState(); },
  resetSave() { store.reset(); setLocale(store.data.settings.language || 'zh-CN'); ui.renderAll(); return store.data; },
};
