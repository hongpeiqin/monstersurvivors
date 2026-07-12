(() => {
  'use strict';

  const STORAGE_KEY = 'warrior25d.settings.v2';
  const LEVELS = new Set(['off', 'medium', 'high']);
  const MONSTER_MIN = 0;
  const MONSTER_MAX = 80;
  const MONSTER_DEFAULT = 20;
  const nativeSetItem = Storage.prototype.setItem;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const normalizeLevel = value => LEVELS.has(value) ? value : 'medium';
  const normalizeMonsterCount = value => clamp(
    Number.isFinite(Number(value)) ? Math.round(Number(value)) : MONSTER_DEFAULT,
    MONSTER_MIN,
    MONSTER_MAX,
  );

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  const stored = readSettings();
  const particleLevel = LEVELS.has(stored.particleLevel)
    ? stored.particleLevel
    : stored.particles === false
      ? 'off'
      : 'medium';
  const monsterCount = normalizeMonsterCount(stored.monsterCount);
  const screenShake = stored.screenShake !== false;
  const vibration = stored.vibration !== false;

  globalThis.__WARRIOR_FX_LEVEL__ = normalizeLevel(particleLevel);
  globalThis.__WARRIOR_MONSTER_TARGET__ = monsterCount;
  globalThis.__WARRIOR_MONSTER_LIMIT__ = MONSTER_MAX;
  globalThis.__WARRIOR_SCREEN_SHAKE__ = screenShake;
  globalThis.__WARRIOR_VIBRATION__ = vibration;

  try {
    nativeSetItem.call(localStorage, STORAGE_KEY, JSON.stringify({
      ...stored,
      particleLevel: globalThis.__WARRIOR_FX_LEVEL__,
      particles: globalThis.__WARRIOR_FX_LEVEL__ !== 'off',
      monsterCount,
      screenShake,
      vibration,
    }));
  } catch {
    // Storage can be unavailable in privacy modes. Session values still work.
  }

  Storage.prototype.setItem = function setItemWithGameSettings(key, value) {
    if (this === localStorage && key === STORAGE_KEY) {
      try {
        const next = JSON.parse(String(value)) || {};
        const level = normalizeLevel(globalThis.__WARRIOR_FX_LEVEL__);
        next.particleLevel = level;
        next.particles = level !== 'off';
        next.monsterCount = normalizeMonsterCount(globalThis.__WARRIOR_MONSTER_TARGET__);
        next.screenShake = globalThis.__WARRIOR_SCREEN_SHAKE__ !== false;
        next.vibration = globalThis.__WARRIOR_VIBRATION__ !== false;
        value = JSON.stringify(next);
      } catch {
        // Preserve the caller's original value when it is not JSON.
      }
    }
    return nativeSetItem.call(this, key, value);
  };
})();
