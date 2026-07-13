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

function installStableHighRefreshLoop(instance) {
  const lastKey = 'lastTime' in instance ? 'lastTime' : 'last';
  const accumulatorKey = 'accumulator' in instance ? 'accumulator' : 'acc';
  const lastRenderedKey = 'lastRendered' in instance ? 'lastRendered' : 'lastRender';
  instance.inputDirty = false;
  instance.loop = function loop(now) {
    const previous = Number.isFinite(this[lastKey]) ? this[lastKey] : now;
    const ms = Math.min(80, Math.max(0, now - previous));
    this[lastKey] = now;
    this.frameEma = this.frameEma * 0.92 + ms * 0.08;

    // Accumulate elapsed time on every rAF. The old loop only accumulated on rendered
    // frames, so 90/120 Hz phones could silently run movement at half speed.
    if (this.running && !this.paused && !this.awaitingChoice) {
      const accumulated = Number.isFinite(this[accumulatorKey]) ? this[accumulatorKey] : 0;
      this[accumulatorKey] = Math.min(0.1, accumulated + ms / 1000);
    }

    const target = this.settings.batterySaver ? 1000 / 30 : 1000 / 60;
    const previousRender = Number.isFinite(this[lastRenderedKey]) ? this[lastRenderedKey] : 0;
    if (now - previousRender >= target - 1) {
      this[lastRenderedKey] = now;
      if (this.running && !this.paused && !this.awaitingChoice) {
        const step = 1 / 60;
        let updates = 0;
        while (this[accumulatorKey] + 1e-6 >= step && updates++ < 4) {
          this.update(step);
          this[accumulatorKey] -= step;
        }
        // Consume only real elapsed remainder after a fresh input change.
        if (updates === 0 && this.inputDirty && this[accumulatorKey] >= 1 / 360) {
          const partial = Math.min(step, this[accumulatorKey]);
          this.update(partial);
          this[accumulatorKey] -= partial;
        }
      }
      this.inputDirty = false;
      this.render();
    }
    requestAnimationFrame(value => this.loop(value));
  };
}

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

installStableHighRefreshLoop(game);

input = new InputManager({
  joystick: document.getElementById('joystick'),
  knob: document.getElementById('joystickKnob'),
  activeButtons: document.getElementById('activeButtons'),
  onMove(vector) {
    game.inputDirty = true;
    const length = Math.hypot(vector.x, vector.y);
    if (length > 0.01 && game.running && !game.player.dead) {
      game.player.facing = { x: vector.x / length, y: vector.y / length };
    }
  },
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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js?v=1.3.2')
      .then(registration => registration.update())
      .catch(() => {});
  }, { once: true });
}

window.__FROSTBLADE_GAME__ = {
  version: '1.3.2',
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
