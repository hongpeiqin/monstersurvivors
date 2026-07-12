import './gameplay-bootstrap-2.1.8.js?v=2.1.8';
import './effects-frame-adapter-2.1.5.js?v=2.1.8';
import './main-2.1.1.js?v=2.1.8';

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
  if (excess <= 0) return 0;
  let removed = 0;

  // New entries are normally still outside the viewport, so remove those first and preserve
  // monsters already engaged with the player. Dead entries are left to the core cleanup pass.
  for (let index = items.length - 1; index >= 0 && excess > 0; index--) {
    if (items[index]?.dead) continue;
    items.splice(index, 1);
    excess--;
    removed++;
  }
  return removed;
}

// Clamp the legacy stress helper to the selected target. Without this guard, asking stress()
// for more enemies than the own-array push cap allows would leave its while-loop spinning forever.
if (api?.stress && !api.__monsterStressWrapped) {
  const originalStress = api.stress.bind(api);
  api.stress = function stressWithinTarget(count = globalThis.__WARRIOR_MONSTER_TARGET__) {
    const target = clampCount(globalThis.__WARRIOR_MONSTER_TARGET__);
    const requested = Math.min(target, clampCount(count));
    if (requested <= 0) return api.getState();
    return originalStress(requested);
  };
  Object.defineProperty(api, '__monsterStressWrapped', { value: true });
}

function silentFill(target) {
  if (!api?.stress || target <= 0) return;
  const previous = Number(globalThis.__WARRIOR_SUPPRESS_STRESS_FX__) || 0;
  globalThis.__WARRIOR_SUPPRESS_STRESS_FX__ = previous + 1;
  try { api.stress(target); }
  finally { globalThis.__WARRIOR_SUPPRESS_STRESS_FX__ = previous; }
}

function reconcileMonsterCount() {
  if (!api?.getState) return { target: 0, live: 0, captured: false };
  const target = clampCount(globalThis.__WARRIOR_MONSTER_TARGET__);
  const items = enemyArray();

  if (!items) {
    // This should never happen in v2.1.8. Avoid destructive recreation if a browser extension or
    // stale cache interferes, and expose the condition through getState for diagnosis.
    return { target, live: api.getState().enemies || 0, captured: false };
  }

  if (target === 0) {
    items.length = 0;
    return { target, live: 0, captured: true };
  }

  let live = countLive(items);
  if (live > target) {
    trimLiveEnemies(items, target);
    live = countLive(items);
  }
  if (live < target) {
    silentFill(target);
    live = countLive(items);
  }
  return { target, live, captured: true };
}

function applyMonsterCount(value, { notify = true } = {}) {
  const target = clampCount(value);
  globalThis.__WARRIOR_MONSTER_TARGET__ = target;
  renderMonsterValue(target);
  persist({ monsterCount: target });
  const result = reconcileMonsterCount();
  if (notify) showToast(target === 0
    ? '怪物数量：0 · 已暂停刷怪'
    : `怪物数量：${target} · 当前 ${result.live}`);
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
  monsterTimer = setTimeout(() => applyMonsterCount(target, { notify: false }), 120);
});
monsterSlider?.addEventListener('change', () => applyMonsterCount(monsterSlider.value));

const stored = readSettings();
applyParticleLevel(normalizeLevel(globalThis.__WARRIOR_FX_LEVEL__ || stored.particleLevel), { notify: false });
applyMonsterCount(globalThis.__WARRIOR_MONSTER_TARGET__ ?? stored.monsterCount ?? 20, { notify: false });

const keeper = setInterval(reconcileMonsterCount, 500);
const telemetryTimer = setInterval(() => {
  const result = reconcileMonsterCount();
  if (!schedulerDetail) return;
  let base = schedulerDetail.textContent
    .replace(/ · 怪物 \d+\/\d+/, '')
    .replace(/ · 高级FX.*$/, '');
  base += ` · 怪物 ${result.live}/${result.target}`;
  const telemetry = globalThis.__WARRIOR_FX_TELEMETRY__;
  if (telemetry && globalThis.__WARRIOR_FX_LEVEL__ === 'high') {
    base += ` · 高级FX ${telemetry.drawn}/${telemetry.budget} · ${telemetry.drawMs.toFixed(1)}ms · ${Math.round(telemetry.scale * 100)}%`;
  }
  schedulerDetail.textContent = base;
}, 250);
addEventListener('pagehide', () => {
  clearInterval(keeper);
  clearInterval(telemetryTimer);
}, { once: true });

if (api) {
  const originalGetState = api.getState?.bind(api);
  api.getState = () => {
    const items = enemyArray();
    return {
      ...(originalGetState ? originalGetState() : {}),
      particleLevel: normalizeLevel(globalThis.__WARRIOR_FX_LEVEL__),
      particleLevelLabel: LABELS[normalizeLevel(globalThis.__WARRIOR_FX_LEVEL__)],
      monsterTarget: clampCount(globalThis.__WARRIOR_MONSTER_TARGET__),
      monsterLimit: MONSTER_MAX,
      enemyArrayCaptured: Boolean(items),
      enemyTotal: items?.length ?? null,
      enemies: items ? countLive(items) : (originalGetState?.().enemies ?? 0),
      fx: globalThis.__WARRIOR_FX_TELEMETRY__ || null,
    };
  };
  api.setParticleLevel = level => applyParticleLevel(level);
  api.setMonsterCount = count => applyMonsterCount(count);
  api.reconcileMonsters = () => reconcileMonsterCount();
}
