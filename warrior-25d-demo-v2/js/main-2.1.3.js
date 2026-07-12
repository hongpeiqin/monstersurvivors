import './main-2.1.1.js';

const STORAGE_KEY = 'warrior25d.settings.v2';
const VALID_LEVELS = new Set(['off', 'medium', 'high']);
const LEVEL_LABELS = { off: '关', medium: '中等', high: '高级' };

const normalizeLevel = value => VALID_LEVELS.has(value) ? value : 'medium';
const controls = [...document.querySelectorAll('input[name="particleLevel"]')];
const legacyToggle = document.getElementById('particlesToggle');
const toast = document.getElementById('toast');
const api = window.__WARRIOR_DEMO__;

function persistLevel(level) {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    current.particleLevel = level;
    current.particles = level !== 'off';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Session-only mode is acceptable when storage is blocked.
  }
}

function showLevelToast(level) {
  if (!toast) return;
  const messages = {
    off: '粒子特效：关 · 已清空现有粒子',
    medium: '粒子特效：中等 · 默认性能档',
    high: '粒子特效：高级 · 恢复完整密度与辉光',
  };
  toast.textContent = messages[level];
  toast.classList.add('show');
  clearTimeout(showLevelToast.timer);
  showLevelToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
}

function applyLevel(value, { notify = true } = {}) {
  const level = normalizeLevel(value);
  window.__WARRIOR_FX_LEVEL__ = level;

  for (const control of controls) control.checked = control.value === level;
  if (legacyToggle) legacyToggle.checked = level !== 'off';

  if (api?.setParticles) api.setParticles(level !== 'off');
  persistLevel(level);
  if (notify) showLevelToast(level);
  return api?.getState ? api.getState() : { particleLevel: level };
}

for (const control of controls) {
  control.addEventListener('change', () => {
    if (control.checked) applyLevel(control.value);
  });
}

const initialLevel = normalizeLevel(window.__WARRIOR_FX_LEVEL__);
applyLevel(initialLevel, { notify: false });

if (api) {
  const getState = api.getState?.bind(api);
  api.getState = () => ({
    ...(getState ? getState() : {}),
    particleLevel: normalizeLevel(window.__WARRIOR_FX_LEVEL__),
    particleLevelLabel: LEVEL_LABELS[normalizeLevel(window.__WARRIOR_FX_LEVEL__)],
  });
  api.setParticleLevel = level => applyLevel(level);
}
