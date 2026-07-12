import { VisualEffects } from './effects.js';

const PATCH_FLAG = '__warriorFeedbackPatched';
let lastVibrationAt = 0;

function vibrationPattern(amount) {
  if (amount >= 9) return [18, 14, 22];
  if (amount >= 5) return 14;
  return 8;
}

function pulse(amount = 4, { force = false } = {}) {
  if (globalThis.__WARRIOR_VIBRATION__ === false) return false;
  if (typeof navigator.vibrate !== 'function') return false;

  const now = performance.now();
  if (!force && now - lastVibrationAt < 45) return false;
  lastVibrationAt = now;

  try {
    return Boolean(navigator.vibrate(vibrationPattern(Number(amount) || 4)));
  } catch {
    return false;
  }
}

if (!VisualEffects.prototype[PATCH_FLAG]) {
  Object.defineProperty(VisualEffects.prototype, PATCH_FLAG, { value: true });

  const originalHitShake = VisualEffects.prototype.hitShake;
  VisualEffects.prototype.hitShake = function hitShakeWithSettings(amount) {
    pulse(amount);
    if (globalThis.__WARRIOR_SCREEN_SHAKE__ === false) {
      this.shake = 0;
      return undefined;
    }
    return originalHitShake.call(this, amount);
  };

  const originalUpdate = VisualEffects.prototype.update;
  VisualEffects.prototype.update = function updateWithShakeSetting(dt) {
    const result = originalUpdate.call(this, dt);
    if (globalThis.__WARRIOR_SCREEN_SHAKE__ === false) this.shake = 0;
    return result;
  };
}

const feedback = {
  supportsVibration: typeof navigator.vibrate === 'function',
  setScreenShake(enabled) {
    globalThis.__WARRIOR_SCREEN_SHAKE__ = Boolean(enabled);
    return globalThis.__WARRIOR_SCREEN_SHAKE__;
  },
  setVibration(enabled, { preview = false } = {}) {
    globalThis.__WARRIOR_VIBRATION__ = Boolean(enabled);
    if (!enabled && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(0); } catch { /* Unsupported or blocked. */ }
    } else if (enabled && preview) {
      pulse(3, { force: true });
    }
    return globalThis.__WARRIOR_VIBRATION__;
  },
  pulse,
};

globalThis.__WARRIOR_FEEDBACK__ = feedback;
