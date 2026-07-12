import './gameplay-bootstrap-2.1.5.js?v=2.1.7';
import './effects-frame-adapter-2.1.5.js?v=2.1.7';
import './main-2.1.1.js?v=2.1.7';

const STORAGE_KEY = 'warrior25d.settings.v2';
const VALID_LEVELS = new Set(['off', 'medium', 'high']);
const LABELS = { off: '关', medium: '中等', high: '高级' };
const MONSTER_MAX = Number(globalThis.__WARRIOR_MONSTER_LIMIT__) || 80;
const normalizeLevel = value => VALID_LEVELS.has(value) ? value : 'medium';
const clampCount = value => Math.max(0, Math.min(MONSTER_MAX, Math.round(Number(value) || 0)));

const particleControls = [...document.querySelectorAll('input[name="particleLevel"]')];
const legacyToggle = document.getElementById('particlesToggle');
const monsterSlider = document.getElementById('monsterCount');
const monsterOutput = document.getElementById('monsterCountValue');
const schedulerDetail = document.getElementById('schedulerDetail');
const toast = document.getElementById('toast');
const api = window.__WARRIOR_DEMO__;

function readSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
  catch { return {}; }
}
function persist(values) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSettings(), ...values })); }
  catch { /* Storage may be blocked. */ }
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
  globalThis.__WARRIOR_FX_LEVEL__ = level;
  for (const control of particleControls) control.checked = control.value === level;
  if (legacyToggle) legacyToggle.checked = level !== 'off';
  api?.setParticles?.(level !== 'off');
  persist({ particleLevel: level, particles: level !== 'off' });
  if (notify) showToast(level === 'off'
    ? '粒子特效：关 · 已清空粒子'
    : level === 'medium'
      ? '粒子特效：中等 · 默认性能档'
      : '粒子特效：高级 · 保留完整风格并启用实时预算保护');
  return api?.getState?.() || { particleLevel: level };
}

function renderMonsterValue(value) {
  if (monsterOutput) monsterOutput.value = `${value} / ${MONSTER_MAX}`;
  if (monsterSlider) monsterSlider.value = String(value);
}

function silentStress(target) {
  const previous = Number(globalThis.__WARRIOR_SUPPRESS_STRESS_FX__) || 0;
  globalThis.__WARRIOR_SUPPRESS_STRESS_FX__ = previous + 1;
  try { api?.stress?.(target); }
  finally { globalThis.__WARRIOR_SUPPRESS_STRESS_FX__ = previous; }
}

function enemyArray() {
  const value = globalThis.__WARRIOR_ENEMIES__;
  return Array.isArray(value) ? value : null;
}

function countLive(items) {
  let live = 0;
  for (let index = 0; index < items.length; index++) if (!items[index]?.dead) live++;
  return live;
}

function trimLiveEnemies(items, target) {
  let excess = countLive(items) - target;
  if (excess <= 0) return;

  // Remove only the newest live enemies. These are normally off-screen replacements,
  // so a temporary overshoot no longer makes the entire pack blink out and respawn.
  for (let index = items.length - 1; index >= 0 && excess > 0; index--) {
    if (items[index]?.dead) continue;
    items.splice(index, 1);
    excess--;
  }
}

function reconcileMonsterCount() {
  if (!api?.getState) return;
  const target = clampCount(globalThis.__WARRIOR_MONSTER_TARGET__);
  const items = enemyArray();

  if (target === 0) {
    if (items) items.length = 0;
    else if (api.getState().enemies) api.clearEnemies();
    return;
  }

  if (items) {
    const live = countLive(items);
    if (live > target) trimLiveEnemies(items, target);
    else if (live < target) silentStress(target);
    return;
  }

  // If array capture is delayed by a browser, fill shortages only. Never clear and recreate
  // the entire wave just because one automatic spawn briefly exceeds the chosen target.
  const live = api.getState().enemies || 0;
  if (live < target) silentStress(target);
}

function applyMonsterCount(value, { notify = true } = {}) {
  const target = clampCount(value);
  globalThis.__WARRIOR_MONSTER_TARGET__ = target;
  renderMonsterValue(target);
  persist({ monsterCount: target });
  reconcileMonsterCount();
  if (notify) showToast(target === 0 ? '怪物数量：0 · 已暂停刷怪' : `怪物数量：${target}`);
  return api?.getState?.() || { monsterTarget: target };
}

for (const control of particleControls) {
  control.addEventListener('change', () => control.checked && applyParticleLevel(control.value));
}

let monsterTimer = 0;
monsterSlider?.addEventListener('input', () => {
  const target = clampCount(monsterSlider.value);
  globalThis.__WARRIOR_MONSTER_TARGET__ = target;
  renderMonsterValue(target);
  persist({ monsterCount: target });
  clearTimeout(monsterTimer);
  monsterTimer = setTimeout(() => applyMonsterCount(target, { notify: false }), 160);
});
monsterSlider?.addEventListener('change', () => applyMonsterCount(monsterSlider.value));

const stored = readSettings();
applyParticleLevel(normalizeLevel(globalThis.__WARRIOR_FX_LEVEL__ || stored.particleLevel), { notify: false });
applyMonsterCount(globalThis.__WARRIOR_MONSTER_TARGET__ ?? stored.monsterCount ?? 20, { notify: false });

const keeper = setInterval(reconcileMonsterCount, 1000);
const telemetryTimer = setInterval(() => {
  const telemetry = globalThis.__WARRIOR_FX_TELEMETRY__;
  if (!schedulerDetail || !telemetry || globalThis.__WARRIOR_FX_LEVEL__ !== 'high') return;
  const base = schedulerDetail.textContent.replace(/ · 高级FX.*$/, '');
  schedulerDetail.textContent = `${base} · 高级FX ${telemetry.drawn}/${telemetry.budget} · ${telemetry.drawMs.toFixed(1)}ms · ${Math.round(telemetry.scale * 100)}%`;
}, 500);
addEventListener('pagehide', () => { clearInterval(keeper); clearInterval(telemetryTimer); }, { once: true });

if (api) {
  const originalGetState = api.getState?.bind(api);
  api.getState = () => ({
    ...(originalGetState ? originalGetState() : {}),
    particleLevel: normalizeLevel(globalThis.__WARRIOR_FX_LEVEL__),
    particleLevelLabel: LABELS[normalizeLevel(globalThis.__WARRIOR_FX_LEVEL__)],
    monsterTarget: clampCount(globalThis.__WARRIOR_MONSTER_TARGET__),
    monsterLimit: MONSTER_MAX,
    fx: globalThis.__WARRIOR_FX_TELEMETRY__ || null,
  });
  api.setParticleLevel = level => applyParticleLevel(level);
  api.setMonsterCount = count => applyMonsterCount(count);
}
