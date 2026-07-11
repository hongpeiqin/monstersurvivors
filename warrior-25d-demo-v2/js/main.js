import { AudioEngine } from './audio.js';
import { ParticleSystem, VisualEffects } from './effects.js';
import { Hero, Enemy, SpatialHash, clamp, quantizeDirection } from './entities.js';

const TAU = Math.PI * 2;
const BUILD = '2.1.0';
const STORAGE_KEY = 'warrior25d.settings.v2';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

const dom = {
  hpFill: document.getElementById('hpFill'), hpText: document.getElementById('hpText'), kills: document.getElementById('killsText'),
  direction: document.getElementById('directionText'), perf: document.getElementById('perfText'), settingsButton: document.getElementById('settingsButton'),
  backdrop: document.getElementById('settingsBackdrop'), closeSettings: document.getElementById('closeSettings'), bgm: document.getElementById('bgmVolume'),
  sfx: document.getElementById('sfxVolume'), bgmValue: document.getElementById('bgmValue'), sfxValue: document.getElementById('sfxValue'),
  particles: document.getElementById('particlesToggle'), mute: document.getElementById('muteToggle'), mode: document.getElementById('schedulerMode'),
  detail: document.getElementById('schedulerDetail'), meter: document.getElementById('frameMeter'), toast: document.getElementById('toast'),
  joystick: document.getElementById('joystick'), knob: document.getElementById('joystickKnob'), skills: [...document.querySelectorAll('.skill')]
};

function loadSettings() {
  const defaults = { bgm: .45, sfx: .70, particles: true, muted: false };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return defaults; }
}
const settings = loadSettings();
function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }

const audio = new AudioEngine(settings);
const particles = new ParticleSystem();
const visuals = new VisualEffects();
const hero = new Hero();
const grid = new SpatialHash(104);
const enemies = [];
let nextEnemyId = 1;
let kills = 0;
let worldTime = 0;
let spawnTimer = .2;
let auraTimer = 0;
let hudTimer = 0;
let debugVisible = false;
let toastTimer = 0;

const PROFILES = {
  high: { label: '轻载', aiSlices: 3, particleSlices: 2, maxParticles: 900, drawParticles: 680, particleSpawn: 1, glow: 1, maxEnemies: 92, dpr: 2 },
  balanced: { label: '均衡', aiSlices: 4, particleSlices: 3, maxParticles: 520, drawParticles: 380, particleSpawn: .72, glow: .76, maxEnemies: 76, dpr: 1.6 },
  low: { label: '降载', aiSlices: 6, particleSlices: 4, maxParticles: 260, drawParticles: 180, particleSpawn: .45, glow: .48, maxEnemies: 58, dpr: 1.25 }
};

class FrameScheduler {
  constructor() {
    const weakCpu = (navigator.hardwareConcurrency || 4) <= 4;
    const weakMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
    this.mode = weakCpu || weakMemory ? 'balanced' : 'high';
    this.profile = PROFILES[this.mode];
    this.frame = 0; this.ema = 16.7; this.lastSwitch = 0;
  }
  sample(ms) {
    this.frame++;
    this.ema = this.ema * .94 + ms * .06;
    if (this.frame - this.lastSwitch < 120) return false;
    let next = this.mode;
    if (this.ema > 27) next = 'low';
    else if (this.ema > 20.5) next = 'balanced';
    else if (this.ema < 17.4) next = 'high';
    if (next !== this.mode) {
      this.mode = next; this.profile = PROFILES[next]; this.lastSwitch = this.frame; return true;
    }
    return false;
  }
}
const scheduler = new FrameScheduler();
particles.setEnabled(settings.particles);
particles.configure(scheduler.profile);

let width = innerWidth, height = innerHeight, dpr = 1;
let camera = { x: 0, y: 0 };
let shakeX = 0, shakeY = 0;
function resize() {
  width = innerWidth; height = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, scheduler.profile.dpr);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize, { passive: true });
resize();

function project(x, y, z = 0) {
  return { x: (x - camera.x) + width * .5 + shakeX, y: (y - camera.y) * .62 + height * .5 - z + shakeY };
}

function hash2(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function drawGround() {
  const gradient = ctx.createRadialGradient(width * .5, height * .46, 40, width * .5, height * .5, Math.max(width, height) * .75);
  gradient.addColorStop(0, '#193b3b'); gradient.addColorStop(.48, '#102c31'); gradient.addColorStop(1, '#07161e');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  const cell = 84;
  const worldHalfW = width * .58 + cell * 2, worldHalfH = height / .62 * .58 + cell * 2;
  const minX = Math.floor((camera.x - worldHalfW) / cell) * cell, maxX = camera.x + worldHalfW;
  const minY = Math.floor((camera.y - worldHalfH) / cell) * cell, maxY = camera.y + worldHalfH;
  ctx.lineWidth = 1;
  for (let y = minY; y <= maxY; y += cell) {
    for (let x = minX; x <= maxX; x += cell) {
      const p = project(x, y, 0); const alt = (Math.floor(x / cell) + Math.floor(y / cell)) & 1;
      ctx.fillStyle = alt ? 'rgba(68,125,104,.055)' : 'rgba(28,76,78,.07)';
      ctx.strokeStyle = 'rgba(126,198,174,.075)';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 26); ctx.lineTo(p.x + 42, p.y); ctx.lineTo(p.x, p.y + 26); ctx.lineTo(p.x - 42, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      const hx = Math.floor(x / cell), hy = Math.floor(y / cell), h = hash2(hx, hy);
      if (h > .90) {
        ctx.strokeStyle = 'rgba(114,178,119,.34)'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(p.x + k * 4 - 5, p.y + 5); ctx.lineTo(p.x + k * 3 - 7, p.y - 4 - k * 2); ctx.stroke(); }
      } else if (h < .045) {
        ctx.fillStyle = 'rgba(102,128,132,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, 10, 5, -.2, 0, TAU); ctx.fill();
      }
    }
  }
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .2, width / 2, height / 2, Math.max(width, height) * .72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,3,8,.55)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
}

const input = { keys: new Set(), joystick: { x: 0, y: 0 }, attackHeld: false };
function movementVector() {
  let x = input.joystick.x, y = input.joystick.y;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) y -= 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) y += 1;
  const magnitude = Math.hypot(x, y);
  return magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y };
}

function showToast(message) {
  dom.toast.textContent = message; dom.toast.classList.add('show'); toastTimer = 1.35;
}

let joystickPointer = null;
function updateJoystick(event) {
  const rect = dom.joystick.querySelector('.joystick-ring').getBoundingClientRect();
  let x = event.clientX - (rect.left + rect.width / 2), y = event.clientY - (rect.top + rect.height / 2);
  const max = rect.width * .34, mag = Math.hypot(x, y);
  if (mag > max) { x = x / mag * max; y = y / mag * max; }
  const normalized = { x: x / max, y: y / max };
  if (Math.hypot(normalized.x, normalized.y) > .16) {
    const snapped = quantizeDirection(normalized.x, normalized.y, hero.dir);
    const strength = Math.min(1, Math.hypot(normalized.x, normalized.y));
    input.joystick.x = snapped.x * strength; input.joystick.y = snapped.y * strength;
    dom.knob.style.transform = `translate(${snapped.x * max * strength}px,${snapped.y * max * strength}px)`;
  } else {
    input.joystick.x = 0; input.joystick.y = 0; dom.knob.style.transform = 'translate(0,0)';
  }
}
dom.joystick.addEventListener('pointerdown', event => { joystickPointer = event.pointerId; dom.joystick.setPointerCapture(event.pointerId); audio.ensure(); updateJoystick(event); });
dom.joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) updateJoystick(event); });
function releaseJoystick(event) { if (event.pointerId !== joystickPointer) return; joystickPointer = null; input.joystick.x = 0; input.joystick.y = 0; dom.knob.style.transform = 'translate(0,0)'; }
dom.joystick.addEventListener('pointerup', releaseJoystick); dom.joystick.addEventListener('pointercancel', releaseJoystick);

const cooldowns = { slash: 0, spin: 0, dash: 0 };
const cooldownMax = { slash: 4.2, spin: 6, dash: 4.5 };
function actionConfig(kind, combo = 1) {
  if (kind === 'attack') return { duration: .31 + combo * .015, hit: .13, radius: 118 + combo * 5, damage: 18 + combo * 5, cone: combo === 3 ? 1.65 : 1.25, heavy: combo === 3 };
  if (kind === 'slash') return { duration: .58, hit: .25, radius: 235, damage: 70, cone: 1.15, heavy: true };
  if (kind === 'spin') return { duration: .72, hit: .30, radius: 178, damage: 48, cone: TAU, heavy: true };
  return { duration: .38, hit: .18, radius: 170, damage: 42, cone: .8, heavy: true };
}
function startAction(kind) {
  audio.ensure();
  if (hero.dead) return false;
  if (kind !== 'attack' && cooldowns[kind] > 0) return false;
  if (hero.attack && hero.attack.age < hero.attack.duration * .72) return false;
  let combo = 1;
  if (kind === 'attack') { combo = hero.comboWindow > 0 ? hero.combo % 3 + 1 : 1; hero.combo = combo; hero.comboWindow = .58; }
  else { hero.combo = 0; hero.comboWindow = 0; cooldowns[kind] = cooldownMax[kind]; }
  const config = actionConfig(kind, combo);
  hero.attack = { kind, combo, age: 0, duration: config.duration, hitAt: config.hit, hitDone: false, startX: hero.x, startY: hero.y };
  if (kind === 'dash') hero.dash = { x: hero.dir.x, y: hero.dir.y, speed: 650, time: .26 };
  if (kind === 'attack') audio.swing(combo); else audio.skill(kind);
  emitAttackVisual(kind, combo); return true;
}
function emitAttackVisual(kind, combo) {
  const angle = Math.atan2(hero.dir.y, hero.dir.x);
  if (kind === 'attack') {
    const reverse = combo === 2;
    visuals.arc({ x: hero.x, y: hero.y, z: 12, radius: 92 + combo * 8, width: 13 + combo * 2, start: angle + (reverse ? 1.25 : -1.28), end: angle + (reverse ? -1.15 : 1.22), ccw: reverse, life: .25, color: combo === 3 ? '#ffe899' : '#9effeb' });
  } else if (kind === 'slash') {
    visuals.arc({ x: hero.x, y: hero.y, z: 13, radius: 194, width: 30, start: angle - .95, end: angle + .95, life: .48, color: '#83f7ff' });
    visuals.ring({ x: hero.x + hero.dir.x * 90, y: hero.y + hero.dir.y * 90, radius: 55, width: 10, life: .36, color: '#c5ffff' });
  } else if (kind === 'spin') {
    visuals.arc({ x: hero.x, y: hero.y, z: 9, radius: 146, width: 23, start: angle, end: angle + TAU * 1.92, life: .62, color: '#94ffe1' });
    visuals.ring({ x: hero.x, y: hero.y, radius: 138, width: 13, life: .56, color: '#65dfff' });
  } else visuals.ring({ x: hero.x, y: hero.y, radius: 68, width: 14, life: .35, color: '#79e7ff' });
}
function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay, len2 = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
function resolveAttack(attack) {
  const config = actionConfig(attack.kind, attack.combo);
  const candidates = grid.nearby(hero.x, hero.y, config.radius + 80);
  let hitCount = 0;
  for (const enemy of candidates) {
    if (enemy.dead) continue;
    const dx = enemy.x - hero.x, dy = enemy.y - hero.y, dist = Math.hypot(dx, dy);
    let hit = false;
    if (attack.kind === 'spin') hit = dist <= config.radius + enemy.radius;
    else if (attack.kind === 'dash') hit = pointToSegmentDistance(enemy.x, enemy.y, attack.startX, attack.startY, hero.x + hero.dir.x * 70, hero.y + hero.dir.y * 70) < enemy.radius + 38;
    else if (dist <= config.radius + enemy.radius) {
      const n = dist ? { x: dx / dist, y: dy / dist } : hero.dir;
      hit = Math.acos(clamp(n.x * hero.dir.x + n.y * hero.dir.y, -1, 1)) <= config.cone * .5;
    }
    if (!hit) continue;
    const force = config.heavy ? 260 : 145, n = dist ? { x: dx / dist, y: dy / dist } : hero.dir;
    const damage = Math.round(config.damage * (.92 + Math.random() * .16));
    const died = enemy.applyDamage(damage, n.x * force, n.y * force);
    visuals.damageText(enemy.x, enemy.y, damage, config.heavy);
    particles.burst(config.heavy ? 'shard' : 'spark', enemy.x, enemy.y, { count: config.heavy ? 24 : 13, color: config.heavy ? ['#fff3a8', '#7ff7e1', '#ffffff'] : ['#d9ffff', '#76efd8'], angle: Math.atan2(n.y, n.x), spread: 1.25, speedMin: 70, speedMax: config.heavy ? 300 : 210, lifeMin: .22, lifeMax: .58, important: true, z: 24 });
    if (died) {
      kills++; audio.death();
      particles.burst('shard', enemy.x, enemy.y, { count: 30, color: ['#a8ffcf', '#efffc9', '#5ba77b'], speedMin: 60, speedMax: 260, lifeMin: .35, lifeMax: .85, important: true, z: 18 });
      visuals.ring({ x: enemy.x, y: enemy.y, radius: 48, width: 9, life: .42, color: '#a4ffc7' });
    }
    hitCount++;
  }
  if (hitCount) { audio.hit(config.heavy || hitCount >= 3); visuals.hitShake(config.heavy ? 9 : 4.5); }
  else if (attack.kind === 'slash') visuals.hitShake(2.5);
}

for (const button of dom.skills) {
  const kind = button.dataset.action;
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); button.classList.add('pressed'); if (kind === 'attack') { input.attackHeld = true; startAction('attack'); } else startAction(kind); });
  const release = () => { button.classList.remove('pressed'); if (kind === 'attack') input.attackHeld = false; };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('pointerleave', release);
}
addEventListener('keydown', event => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  input.keys.add(event.code); audio.ensure();
  if (!event.repeat) {
    if (event.code === 'KeyJ' || event.code === 'Space') { input.attackHeld = true; startAction('attack'); }
    if (event.code === 'KeyQ') startAction('slash'); if (event.code === 'KeyE') startAction('spin'); if (event.code === 'KeyR') startAction('dash');
    if (event.code === 'KeyM') { settings.muted = !settings.muted; dom.mute.checked = settings.muted; saveSettings(); audio.applySettings(); showToast(settings.muted ? '已静音' : '声音已恢复'); }
    if (event.code === 'KeyV') { debugVisible = !debugVisible; showToast(debugVisible ? '调度信息已显示' : '调度信息已隐藏'); }
    if (event.code === 'Escape') closeSettings();
  }
});
addEventListener('keyup', event => { input.keys.delete(event.code); if (event.code === 'KeyJ' || event.code === 'Space') input.attackHeld = false; });
addEventListener('blur', () => { input.keys.clear(); input.attackHeld = false; input.joystick.x = input.joystick.y = 0; dom.knob.style.transform = 'translate(0,0)'; });

dom.settingsButton.addEventListener('click', () => { audio.ensure(); dom.backdrop.hidden = false; });
dom.closeSettings.addEventListener('click', closeSettings);
dom.backdrop.addEventListener('pointerdown', event => { if (event.target === dom.backdrop) closeSettings(); });
function closeSettings() { dom.backdrop.hidden = true; }
function bindSettings() {
  dom.bgm.value = settings.bgm; dom.sfx.value = settings.sfx; dom.particles.checked = settings.particles; dom.mute.checked = settings.muted;
  const labels = () => { dom.bgmValue.value = `${Math.round(settings.bgm * 100)}%`; dom.sfxValue.value = `${Math.round(settings.sfx * 100)}%`; };
  labels();
  dom.bgm.addEventListener('input', () => { settings.bgm = Number(dom.bgm.value); labels(); saveSettings(); audio.applySettings(); });
  dom.sfx.addEventListener('input', () => { settings.sfx = Number(dom.sfx.value); labels(); saveSettings(); audio.applySettings(); audio.ensure(); });
  dom.mute.addEventListener('change', () => { settings.muted = dom.mute.checked; saveSettings(); audio.applySettings(); showToast(settings.muted ? '已静音' : '声音已恢复'); });
  dom.particles.addEventListener('change', () => { settings.particles = dom.particles.checked; saveSettings(); particles.setEnabled(settings.particles); showToast(settings.particles ? '粒子特效已开启' : '粒子特效已关闭，存量已清空'); });
}
bindSettings();

function spawnEnemy(forceTier = null) {
  if (enemies.filter(enemy => !enemy.dead).length >= scheduler.profile.maxEnemies) return null;
  const angle = Math.random() * TAU, radius = Math.max(width, height) * .72 + 260 + Math.random() * 220;
  const tier = forceTier ?? (kills > 10 && Math.random() < Math.min(.22, kills / 250) ? 1 : 0);
  const enemy = new Enemy(nextEnemyId++, hero.x + Math.cos(angle) * radius, hero.y + Math.sin(angle) * radius / .72, tier);
  enemies.push(enemy); return enemy;
}
for (let i = 0; i < 12; i++) spawnEnemy(i % 7 === 0 ? 1 : 0);
function updateEnemyAiShard(now) {
  const slices = scheduler.profile.aiSlices, bucket = scheduler.frame % slices;
  for (const enemy of enemies) {
    if (enemy.dead || enemy.id % slices !== bucket) continue;
    const elapsed = Math.min(.16, Math.max(.01, (now - enemy.lastAi) / 1000)); enemy.lastAi = now;
    const dx = hero.x - enemy.x, dy = hero.y - enemy.y, dist = Math.hypot(dx, dy) || 1;
    let desiredX = dx / dist * enemy.speed, desiredY = dy / dist * enemy.speed;
    if (dist < enemy.radius + 37) { desiredX = 0; desiredY = 0; }
    let sepX = 0, sepY = 0, sepCount = 0;
    for (const other of grid.nearby(enemy.x, enemy.y, 74)) {
      if (other === enemy || other.dead) continue;
      const ox = enemy.x - other.x, oy = enemy.y - other.y, od = Math.hypot(ox, oy) || 1, target = enemy.radius + other.radius + 12;
      if (od < target) { const strength = (target - od) / target; sepX += ox / od * strength; sepY += oy / od * strength; sepCount++; }
    }
    if (sepCount) { desiredX += sepX / sepCount * 115; desiredY += sepY / sepCount * 115; }
    const blend = 1 - Math.pow(.045, elapsed);
    enemy.vx += (desiredX - enemy.vx) * blend; enemy.vy += (desiredY - enemy.vy) * blend;
  }
}
function updateEnemies(dt) {
  for (const enemy of enemies) enemy.updateMotion(dt);
  if (scheduler.frame % 2 === 0) grid.rebuild(enemies);
  updateEnemyAiShard(performance.now());
  for (const enemy of grid.nearby(hero.x, hero.y, 95)) {
    if (enemy.dead || hero.dead) continue;
    const dx = hero.x - enemy.x, dy = hero.y - enemy.y, dist = Math.hypot(dx, dy) || 1;
    if (dist < enemy.radius + 31 && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = enemy.tier ? 1.35 : 1.05 + Math.random() * .35;
      if (hero.damage(enemy.tier ? 15 : 9)) {
        audio.hurt(); visuals.hitShake(enemy.tier ? 10 : 6);
        particles.burst('spark', hero.x, hero.y, { count: 12, color: ['#ff8790','#ffd0b0'], angle: Math.atan2(dy, dx), spread: 1.2, speedMin: 45, speedMax: 170, z: 22, important: true });
        hero.x += dx / dist * 18; hero.y += dy / dist * 18;
        if (hero.dead) { showToast('战士倒下，正在重整旗鼓…'); visuals.ring({ x: hero.x, y: hero.y, radius: 80, width: 14, life: .7, color: '#ff7585' }); }
      }
    }
  }
  if (scheduler.frame % 45 === 0) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i], far = Math.hypot(enemy.x - hero.x, enemy.y - hero.y) > 1900;
      if ((enemy.dead && enemy.deathAge > .75) || far) enemies.splice(i, 1);
    }
  }
}
function updateAttack(dt) {
  if (!hero.attack) return;
  const attack = hero.attack; attack.age += dt;
  if (attack.kind === 'dash' && hero.dash) particles.dashTrail(hero.x, hero.y, hero.dir);
  if (!attack.hitDone && attack.age >= attack.hitAt) { attack.hitDone = true; resolveAttack(attack); }
  if (attack.age >= attack.duration) hero.attack = null;
}
function update(dt) {
  worldTime += dt; scheduler.frame++;
  for (const key of Object.keys(cooldowns)) cooldowns[key] = Math.max(0, cooldowns[key] - dt);
  hero.update(dt, movementVector()); updateAttack(dt); updateEnemies(dt); visuals.update(dt);
  if (!hero.dead && input.attackHeld && !hero.attack) startAction('attack');
  if (hero.dead && hero.respawn <= 0) { const oldKills = kills; hero.reset(); hero.x = camera.x; hero.y = camera.y; particles.clear(); showToast(`重新投入战场 · 已击破 ${oldKills}`); }
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnEnemy(); spawnTimer = Math.max(.34, 1.02 - Math.min(.5, kills * .006)) * (scheduler.mode === 'low' ? 1.25 : 1); }
  auraTimer -= dt;
  if (auraTimer <= 0 && !hero.dead) { particles.aura(hero.x, hero.y); auraTimer = scheduler.mode === 'high' ? .045 : scheduler.mode === 'balanced' ? .075 : .12; }
  particles.update(dt);
  const follow = 1 - Math.pow(.0008, dt); camera.x += (hero.x - camera.x) * follow; camera.y += (hero.y - camera.y) * follow;
  if (visuals.shake > 0) { shakeX = (Math.random() * 2 - 1) * visuals.shake; shakeY = (Math.random() * 2 - 1) * visuals.shake; } else shakeX = shakeY = 0;
  hudTimer -= dt; toastTimer -= dt; if (toastTimer <= 0) dom.toast.classList.remove('show'); if (hudTimer <= 0) { updateHud(); hudTimer = .12; }
}
function updateHud() {
  const hpRatio = hero.hp / hero.maxHp;
  dom.hpFill.style.width = `${hpRatio * 100}%`; dom.hpText.textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;
  dom.kills.textContent = kills; dom.direction.textContent = `面向：${hero.dir.name}`; dom.perf.textContent = `性能：${scheduler.profile.label}`;
  dom.mode.textContent = `${scheduler.profile.label}模式 · ${Math.round(1000 / scheduler.ema)} FPS`;
  dom.detail.textContent = `AI ${scheduler.profile.aiSlices} 帧轮转 · 粒子 ${scheduler.profile.particleSlices} 帧轮转 · 怪物 ${enemies.filter(e => !e.dead).length}/${scheduler.profile.maxEnemies}`;
  dom.meter.style.width = `${clamp((scheduler.ema - 10) / 24 * 100, 5, 100)}%`;
  dom.skills.forEach(button => { const kind = button.dataset.action, max = cooldownMax[kind] || 0, remain = cooldowns[kind] || 0; button.classList.toggle('cooling', remain > 0); button.querySelector('.cooldown').style.height = max ? `${remain / max * 100}%` : '0%'; });
}
function drawDebug() {
  if (!debugVisible) return;
  ctx.save(); ctx.fillStyle = 'rgba(2,8,12,.72)'; ctx.fillRect(12, height - 110, 252, 94); ctx.strokeStyle = 'rgba(132,238,221,.3)'; ctx.strokeRect(12.5, height - 109.5, 251, 93); ctx.fillStyle = '#c8fff2'; ctx.font = '11px ui-monospace,monospace';
  const lines = [`build ${BUILD}  frame ${scheduler.frame}`, `EMA ${scheduler.ema.toFixed(2)}ms  ${Math.round(1000 / scheduler.ema)}fps`, `mode ${scheduler.mode}  AI/${scheduler.profile.aiSlices}  FX/${scheduler.profile.particleSlices}`, `enemy ${enemies.length}  particle ${particles.items.length}/${scheduler.profile.maxParticles}`, `particle switch ${settings.particles ? 'ON' : 'OFF'}  drawn ${particles.stats.drawn}`];
  lines.forEach((line, i) => ctx.fillText(line, 22, height - 88 + i * 16)); ctx.restore();
}
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawGround(); visuals.drawWorld(ctx, project, settings.particles);
  const drawables = [];
  for (const enemy of enemies) { const p = project(enemy.x, enemy.y, 0); if (p.x < -90 || p.x > width + 90 || p.y < -100 || p.y > height + 90) continue; drawables.push({ y: enemy.y, type: 0, enemy }); }
  drawables.push({ y: hero.y, type: 1 }); drawables.sort((a, b) => a.y - b.y);
  for (const item of drawables) item.type ? drawHero(ctx, hero, project, performance.now(), settings.particles) : drawEnemy(ctx, item.enemy, project);
  particles.draw(ctx, project, performance.now(), { width, height }); visuals.drawText(ctx, project); drawDebug();
}

let last = performance.now();
function frame(now) {
  const rawMs = Math.min(50, Math.max(1, now - last)); last = now;
  if (scheduler.sample(rawMs)) { particles.configure(scheduler.profile); resize(); showToast(`已切换到${scheduler.profile.label}模式`); }
  update(rawMs / 1000); render(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('pointerdown', () => audio.ensure(), { once: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.ensure(); });
window.__WARRIOR_DEMO__ = {
  build: BUILD,
  getState: () => ({ particlesEnabled: particles.enabled, particleCount: particles.items.length, mode: scheduler.mode, aiSlices: scheduler.profile.aiSlices, particleSlices: scheduler.profile.particleSlices, enemies: enemies.filter(enemy => !enemy.dead).length, frameMs: Number(scheduler.ema.toFixed(2)), kills }),
  setParticles(enabled) { settings.particles = Boolean(enabled); dom.particles.checked = settings.particles; particles.setEnabled(settings.particles); saveSettings(); return this.getState(); },
  stress(count = 90) {
    const target = Math.min(180, Math.max(1, count));
    while (enemies.filter(enemy => !enemy.dead).length < target) { const angle = Math.random() * TAU, radius = 180 + Math.random() * 900; enemies.push(new Enemy(nextEnemyId++, hero.x + Math.cos(angle) * radius, hero.y + Math.sin(angle) * radius, Math.random() < .12 ? 1 : 0)); }
    if (particles.enabled) for (let i = 0; i < 22; i++) particles.burst('spark', hero.x + (Math.random() * 2 - 1) * 300, hero.y + (Math.random() * 2 - 1) * 260, { count: 24, speedMin: 20, speedMax: 210 });
    grid.rebuild(enemies); return this.getState();
  },
  clearEnemies() { enemies.length = 0; grid.rebuild(enemies); return this.getState(); }
};
updateHud();
