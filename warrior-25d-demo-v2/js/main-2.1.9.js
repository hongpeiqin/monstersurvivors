import './feedback-bootstrap-2.1.9.js?v=2.1.9';
import './main-2.1.8.js?v=2.1.9';

const STORAGE_KEY = 'warrior25d.settings.v2';
const screenShakeToggle = document.getElementById('screenShakeToggle');
const vibrationToggle = document.getElementById('vibrationToggle');
const toast = document.getElementById('toast');
const feedback = globalThis.__WARRIOR_FEEDBACK__;
const api = globalThis.__WARRIOR_DEMO__;

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

function applyScreenShake(enabled, { notify = true } = {}) {
  const value = Boolean(enabled);
  feedback?.setScreenShake(value);
  globalThis.__WARRIOR_SCREEN_SHAKE__ = value;
  if (screenShakeToggle) screenShakeToggle.checked = value;
  persist({ screenShake: value });
  if (notify) showToast(value ? '界面抖动已开启' : '界面抖动已关闭');
  return value;
}

function applyVibration(enabled, { notify = true, preview = false } = {}) {
  const value = Boolean(enabled);
  feedback?.setVibration(value, { preview });
  globalThis.__WARRIOR_VIBRATION__ = value;
  if (vibrationToggle) vibrationToggle.checked = value;
  persist({ vibration: value });
  if (notify) {
    const unsupported = value && feedback && !feedback.supportsVibration;
    showToast(unsupported
      ? '设备震动已开启 · 当前浏览器不支持，已自动忽略'
      : value
        ? '设备震动已开启'
        : '设备震动已关闭');
  }
  return value;
}

screenShakeToggle?.addEventListener('change', () => {
  applyScreenShake(screenShakeToggle.checked);
});

vibrationToggle?.addEventListener('change', () => {
  applyVibration(vibrationToggle.checked, { preview: vibrationToggle.checked });
});

const stored = readSettings();
applyScreenShake(globalThis.__WARRIOR_SCREEN_SHAKE__ ?? stored.screenShake ?? true, { notify: false });
applyVibration(globalThis.__WARRIOR_VIBRATION__ ?? stored.vibration ?? true, { notify: false });

if (api) {
  const originalGetState = api.getState?.bind(api);
  api.getState = () => ({
    ...(originalGetState ? originalGetState() : {}),
    screenShakeEnabled: globalThis.__WARRIOR_SCREEN_SHAKE__ !== false,
    vibrationEnabled: globalThis.__WARRIOR_VIBRATION__ !== false,
    vibrationSupported: Boolean(feedback?.supportsVibration),
  });
  api.setScreenShake = enabled => applyScreenShake(enabled);
  api.setVibration = enabled => applyVibration(enabled, { preview: Boolean(enabled) });
}
