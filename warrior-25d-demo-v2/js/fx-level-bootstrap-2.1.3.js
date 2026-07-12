(() => {
  'use strict';

  const STORAGE_KEY = 'warrior25d.settings.v2';
  const LEVELS = new Set(['off', 'medium', 'high']);
  const nativeSetItem = Storage.prototype.setItem;

  function normalizeLevel(value) {
    return LEVELS.has(value) ? value : 'medium';
  }

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

  window.__WARRIOR_FX_LEVEL__ = normalizeLevel(migratedLevel);

  try {
    nativeSetItem.call(localStorage, STORAGE_KEY, JSON.stringify({
      ...stored,
      particleLevel: window.__WARRIOR_FX_LEVEL__,
      particles: window.__WARRIOR_FX_LEVEL__ !== 'off',
    }));
  } catch {
    // Storage can be unavailable in privacy modes. The game still works for this session.
  }

  Storage.prototype.setItem = function setItemWithFxLevel(key, value) {
    if (this === localStorage && key === STORAGE_KEY) {
      try {
        const next = JSON.parse(String(value)) || {};
        const level = normalizeLevel(window.__WARRIOR_FX_LEVEL__);
        next.particleLevel = level;
        next.particles = level !== 'off';
        value = JSON.stringify(next);
      } catch {
        // Preserve the caller's value if it is not JSON.
      }
    }
    return nativeSetItem.call(this, key, value);
  };
})();
