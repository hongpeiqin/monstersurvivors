import { Enemy } from './entities.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const targetCount = () => clamp(
  Math.round(Number(globalThis.__WARRIOR_MONSTER_TARGET__) || 0),
  0,
  Number(globalThis.__WARRIOR_MONSTER_LIMIT__) || 80,
);

// Track whole-frame time for the FX governor. Keep the callback contract unchanged.
const nativeRequestAnimationFrame = globalThis.requestAnimationFrame?.bind(globalThis);
if (nativeRequestAnimationFrame && !globalThis.__WARRIOR_RAF_TRACKED__) {
  globalThis.__WARRIOR_RAF_TRACKED__ = true;
  let lastFrameTime = 0;
  let frameEma = 16.7;
  globalThis.requestAnimationFrame = callback => nativeRequestAnimationFrame(time => {
    if (time !== lastFrameTime) {
      if (lastFrameTime) {
        const elapsed = clamp(time - lastFrameTime, 1, 100);
        frameEma = frameEma * 0.84 + elapsed * 0.16;
      }
      lastFrameTime = time;
      globalThis.__WARRIOR_FRAME_MS__ = frameEma;
    }
    callback(time);
  });
}

// The previous build imported Enemy through a versioned URL while the game imported it
// through the import-map alias. Those are different module identities, so instanceof never
// matched and the enemy array was never captured. Use the canonical alias and retain a
// structural fallback so a future cache-busting query cannot silently break the cap again.
const isEnemy = value => value instanceof Enemy || Boolean(
  value
  && typeof value === 'object'
  && typeof value.updateMotion === 'function'
  && typeof value.applyDamage === 'function'
  && Number.isFinite(value.id)
  && Number.isFinite(value.maxHp)
  && 'dead' in value,
);

const countLive = items => {
  let live = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (isEnemy(item) && !item.dead) live++;
  }
  return live;
};

const nativePush = Array.prototype.push;
let enemyArray = null;

function guardedEnemyPush(...items) {
  if (!items.length) return this.length;
  for (let index = 0; index < items.length; index++) {
    if (!isEnemy(items[index])) return nativePush.apply(this, items);
  }

  const allowance = Math.max(0, targetCount() - countLive(this));
  if (!allowance) return this.length;
  return nativePush.apply(this, items.length > allowance ? items.slice(0, allowance) : items);
}

function captureEnemyArrayPush(...items) {
  let allEnemies = items.length > 0;
  for (let index = 0; index < items.length; index++) {
    if (!isEnemy(items[index])) { allEnemies = false; break; }
  }

  if (!enemyArray && allEnemies) {
    enemyArray = this;
    globalThis.__WARRIOR_ENEMIES__ = enemyArray;
    Object.defineProperty(enemyArray, 'push', {
      configurable: true,
      writable: true,
      value: guardedEnemyPush,
    });
    Array.prototype.push = nativePush;
    return guardedEnemyPush.apply(enemyArray, items);
  }

  return nativePush.apply(this, items);
}

Array.prototype.push = captureEnemyArrayPush;
queueMicrotask(() => {
  if (Array.prototype.push === captureEnemyArrayPush) Array.prototype.push = nativePush;
});

// Visible hit recoil, patched on the exact Enemy class used by the game.
if (!Enemy.prototype.__warriorRecoilPatched) {
  Object.defineProperty(Enemy.prototype, '__warriorRecoilPatched', { value: true });
  const originalApplyDamage = Enemy.prototype.applyDamage;
  Enemy.prototype.applyDamage = function applyDamageWithRecoil(value, knockX, knockY) {
    const magnitude = Math.hypot(knockX, knockY) || 1;
    const directionX = knockX / magnitude;
    const directionY = knockY / magnitude;
    const dead = originalApplyDamage.call(
      this,
      value,
      knockX * (this.tier ? 1.22 : 1.38),
      knockY * (this.tier ? 1.22 : 1.38),
    );
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
}
