import { Enemy } from './entities-2.1.2.js?v=2.1.4';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeTarget = value => clamp(Math.round(Number(value) || 0), 0, Number(globalThis.__WARRIOR_MONSTER_LIMIT__) || 80);

// Keep the requested live-monster count authoritative even though the original demo has its own spawner.
const nativePush = Array.prototype.push;
Array.prototype.push = function guardedEnemyPush(...items) {
  if (items.length && items.every(item => item instanceof Enemy)) {
    const target = normalizeTarget(globalThis.__WARRIOR_MONSTER_TARGET__);
    let live = 0;
    for (const item of this) if (item instanceof Enemy && !item.dead) live++;
    const allowance = Math.max(0, target - live);
    if (!allowance) return this.length;
    if (items.length > allowance) items = items.slice(0, allowance);
  }
  return nativePush.apply(this, items);
};

// Make hit reactions read as a real back-step rather than a tiny velocity twitch.
const originalApplyDamage = Enemy.prototype.applyDamage;
Enemy.prototype.applyDamage = function applyDamageWithRecoil(value, knockX, knockY) {
  const magnitude = Math.hypot(knockX, knockY) || 1;
  const directionX = knockX / magnitude;
  const directionY = knockY / magnitude;
  const dead = originalApplyDamage.call(this, value, knockX * (this.tier ? 1.28 : 1.48), knockY * (this.tier ? 1.28 : 1.48));
  if (!dead) {
    this.recoilTime = this.tier ? 0.17 : 0.22;
    this.recoilDuration = this.recoilTime;
    this.recoilX = directionX;
    this.recoilY = directionY;
    this.recoilDistance = this.tier ? 30 : 42;
    this.attackCooldown = Math.max(this.attackCooldown, this.recoilTime + 0.12);
    this.vx *= 0.22;
    this.vy *= 0.22;
    this.hitFlash = Math.max(this.hitFlash, 0.23);
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
    this.walkPhase += dt * 21;
  }
  originalUpdateMotion.call(this, dt);
};
