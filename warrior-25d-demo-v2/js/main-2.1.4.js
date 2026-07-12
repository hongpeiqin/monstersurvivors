import './gameplay-bootstrap-2.1.4.js';
import './main-2.1.1.js?v=2.1.4';

const STORAGE_KEY = 'warrior25d.settings.v2';
const VALID_LEVELS = new Set(['off', 'medium', 'high']);
const LEVEL_LABELS = { off: '关', medium: '中等', high: '高级' };
const MONSTER_MAX = Number(globalThis.__WARRIOR_MONSTER_LIMIT__) || 80;
const normalizeLevel = value => VALID_LEVELS.has(value) ? value : 'medium';
const clampMonsterCount = value => Math.max(0, Math.min(MONSTER_MAX, Math.round(Number(value) || 0)));

const particleControls = [...document.querySelectorAll('input[name="particleLevel"]')];
const legacyToggle = document.getElementById('particlesToggle');
const monsterSlider = document.getElementById('monsterCount');
const monsterOutput = document.getElementById('monsterCountValue');
const toast = document.getElementById('toast');
const api = window.__WARRIOR_DEMO__;

function readSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function persist(values) {
  try {
    const current = readSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...values }));
  } catch {
    // Session-only mode is acceptable when storage is blocked.
  }
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
}

function applyParticleLevel(value, { notify = true } = {}) {
  const level = normalizeLevel(value);
  window.__WARRIOR_FX_LEVEL__ = level;
  for (const control of particleControls) control.checked = control.value === level;
  if (legacyToggle) legacyToggle.checked = level !== 'off';
  if (api?.setParticles) api.setParticles(level !== 'off');
  persist({ particleLevel: level, particles: level !== 'off' });
  if (notify) {
    showToast(level === 'off'
      ? '粒子特效：关 · 已清空现有粒子'
      : level === 'medium'
        ? '粒子特效：中等 · 默认性能档'
        : '粒子特效：高级 · 恢复原始多层刀光、环身粒子和密集命中爆发');
  }
  return api?.getState ? api.getState() : { particleLevel: level };
}

function renderMonsterValue(value) {
  if (monsterOutput) monsterOutput.value = `${value} / ${MONSTER_MAX}`;
  if (monsterSlider) monsterSlider.value = String(value);
}

function reconcileMonsterCount({ forceReset = false } = {}) {
  if (!api?.getState) return;
  const target = clampMonsterCount(window.__WARRIOR_MONSTER_TARGET__);
  const state = api.getState();
  if (target === 0) {
    if (state.enemies) api.clearEnemies();
    return;
  }
  if (forceReset || state.enemies > target) {
    api.clearEnemies();
    api.stress(target);
  } else if (state.enemies < target) {
    api.stress(target);
  }
}

function applyMonsterCount(value, { notify = true, forceReset = false } = {}) {
  const target = clampMonsterCount(value);
  window.__WARRIOR_MONSTER_TARGET__ = target;
  renderMonsterValue(target);
  persist({ monsterCount: target });
  reconcileMonsterCount({ forceReset });
  if (notify) showToast(target === 0 ? '怪物数量：0 · 已暂停刷怪' : `怪物数量：${target}`);
  return api?.getState ? api.getState() : { monsterTarget: target };
}

for (const control of particleControls) {
  control.addEventListener('change', () => {
    if (control.checked) applyParticleLevel(control.value);
  });
}

let monsterChangeTimer = 0;
monsterSlider?.addEventListener('input', () => {
  const target = clampMonsterCount(monsterSlider.value);
  window.__WARRIOR_MONSTER_TARGET__ = target;
  renderMonsterValue(target);
  persist({ monsterCount: target });
  clearTimeout(monsterChangeTimer);
  monsterChangeTimer = setTimeout(() => applyMonsterCount(target, { forceReset: true }), 90);
});
monsterSlider?.addEventListener('change', () => applyMonsterCount(monsterSlider.value, { forceReset: true }));

const stored = readSettings();
applyParticleLevel(normalizeLevel(window.__WARRIOR_FX_LEVEL__ || stored.particleLevel), { notify: false });
applyMonsterCount(window.__WARRIOR_MONSTER_TARGET__ ?? stored.monsterCount ?? 20, { notify: false, forceReset: true });

const monsterKeeper = setInterval(() => reconcileMonsterCount(), 550);
addEventListener('pagehide', () => clearInterval(monsterKeeper), { once: true });

if (api) {
  const originalGetState = api.getState?.bind(api);
  api.getState = () => ({
    ...(originalGetState ? originalGetState() : {}),
    particleLevel: normalizeLevel(window.__WARRIOR_FX_LEVEL__),
    particleLevelLabel: LEVEL_LABELS[normalizeLevel(window.__WARRIOR_FX_LEVEL__)],
    monsterTarget: clampMonsterCount(window.__WARRIOR_MONSTER_TARGET__),
    monsterLimit: MONSTER_MAX,
  });
  api.setParticleLevel = level => applyParticleLevel(level);
  api.setMonsterCount = count => applyMonsterCount(count, { forceReset: true });
}
