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
  const normalizeMonsterCount = value => clamp(Number.isFinite(Number(value)) ? Math.round(Number(value)) : MONSTER_DEFAULT, MONSTER_MIN, MONSTER_MAX);

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  const stored = readSettings();
  const migratedLevel = LEVELS.has(stored.particleLevel)
    ? stored.particleLevel
    : stored.particles === false
      ? 'off'
      : 'medium';
  const monsterCount = normalizeMonsterCount(stored.monsterCount);

  window.__WARRIOR_FX_LEVEL__ = normalizeLevel(migratedLevel);
  window.__WARRIOR_MONSTER_TARGET__ = monsterCount;
  window.__WARRIOR_MONSTER_LIMIT__ = MONSTER_MAX;

  try {
    nativeSetItem.call(localStorage, STORAGE_KEY, JSON.stringify({
      ...stored,
      particleLevel: window.__WARRIOR_FX_LEVEL__,
      particles: window.__WARRIOR_FX_LEVEL__ !== 'off',
      monsterCount,
    }));
  } catch {
    // Storage can be unavailable in privacy modes. The game still works for this session.
  }

  Storage.prototype.setItem = function setItemWithGameSettings(key, value) {
    if (this === localStorage && key === STORAGE_KEY) {
      try {
        const next = JSON.parse(String(value)) || {};
        const level = normalizeLevel(window.__WARRIOR_FX_LEVEL__);
        next.particleLevel = level;
        next.particles = level !== 'off';
        next.monsterCount = normalizeMonsterCount(window.__WARRIOR_MONSTER_TARGET__);
        value = JSON.stringify(next);
      } catch {
        // Preserve the caller's value if it is not JSON.
      }
    }
    return nativeSetItem.call(this, key, value);
  };
})();
