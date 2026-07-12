import { Enemy } from './entities-2.1.2.js?v=2.1.5';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const targetCount = () => clamp(Math.round(Number(globalThis.__WARRIOR_MONSTER_TARGET__) || 0), 0, Number(globalThis.__WARRIOR_MONSTER_LIMIT__) || 80);

// Capture only the game's enemy array, then immediately restore Array.prototype.push.
// The previous build left a global push wrapper installed for every particle, visual and render-list insertion.
const nativePush = Array.prototype.push;
let enemyArray = null;

function guardedEnemyPush(...items) {
  if (!items.length) return this.length;
  let allEnemies = true;
  for (const item of items) {
    if (!(item instanceof Enemy)) { allEnemies = false; break; }
  }
  if (!allEnemies) return nativePush.apply(this, items);

  const target = targetCount();
  let live = 0;
  for (let index = 0; index < this.length; index++) {
    const item = this[index];
    if (item instanceof Enemy && !item.dead) live++;
  }
  const allowance = Math.max(0, target - live);
  if (!allowance) return this.length;
  return nativePush.apply(this, items.length > allowance ? items.slice(0, allowance) : items);
}

function captureEnemyArrayPush(...items) {
  let allEnemies = items.length > 0;
  for (const item of items) {
    if (!(item instanceof Enemy)) { allEnemies = false; break; }
  }
  if (!enemyArray && allEnemies) {
    enemyArray = this;
    globalThis.__WARRIOR_ENEMIES__ = enemyArray;
    Object.defineProperty(enemyArray, 'push', { configurable: true, writable: true, value: guardedEnemyPush });
    Array.prototype.push = nativePush;
    return guardedEnemyPush.apply(enemyArray, items);
  }
  return nativePush.apply(this, items);
}

Array.prototype.push = captureEnemyArrayPush;
setTimeout(() => {
  if (Array.prototype.push === captureEnemyArrayPush) Array.prototype.push = nativePush;
}, 0);

// Keep the visible recoil, but do not add any per-frame collection scans.
const originalApplyDamage = Enemy.prototype.applyDamage;
Enemy.prototype.applyDamage = function applyDamageWithRecoil(value, knockX, knockY) {
  const magnitude = Math.hypot(knockX, knockY) || 1;
  const directionX = knockX / magnitude;
  const directionY = knockY / magnitude;
  const dead = originalApplyDamage.call(this, value, knockX * (this.tier ? 1.22 : 1.38), knockY * (this.tier ? 1.22 : 1.38));
  if (!dead) {
    this.recoilTime = this.tier ? 0.16 : 0.20;
    this.recoilDuration = this.recoilTime;
    this.recoilX = directionX;
    this.recoilY = directionY;
    this.recoilDistance = this.tier ? 27 : 38;
    this.attackCooldown = Math.max(this.attackCooldown, this.recoilTime + 0.12);
    this.vx *= 0.25;
    this.vy *= 0.25;
    this.hitFlash = Math.max(this.hitFlash, 0.22);
  }
  return dead;
};

const originalUpdateMotion = Enemy.prototype.updateMotion;
Enemy.prototype.updateMotion = function updateMotionWithRecoil(dt) {
  if (this.recoilTime > 0 && !this.dead) {
    const previous = this.recoilTime;
    this.recoilTime = Math.max(0, this.recoilTime - dt);
    const from = 1 - previous / this.recoilDuration;
    const to = 1 - this.recoilTime / this.recoilDuration;
    const ease = value => 1 - Math.pow(1 - value, 3);
    const distance = (ease(to) - ease(from)) * this.recoilDistance;
    this.x += this.recoilX * distance;
    this.y += this.recoilY * distance;
    this.walkPhase += dt * 18;
  }
  originalUpdateMotion.call(this, dt);
};
