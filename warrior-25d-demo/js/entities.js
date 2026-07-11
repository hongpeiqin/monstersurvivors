const TAU = Math.PI * 2;
export const DIRECTIONS = [
  { x: 1, y: 0, name: '东' }, { x: .7071, y: .7071, name: '东南' },
  { x: 0, y: 1, name: '南' }, { x: -.7071, y: .7071, name: '西南' },
  { x: -1, y: 0, name: '西' }, { x: -.7071, y: -.7071, name: '西北' },
  { x: 0, y: -1, name: '北' }, { x: .7071, y: -.7071, name: '东北' }
];

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function length(x, y) { return Math.hypot(x, y); }
export function normalize(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }
export function distanceSquared(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
export function quantizeDirection(x, y, fallback = DIRECTIONS[2]) {
  if (Math.hypot(x, y) < .12) return fallback;
  let angle = Math.atan2(y, x); if (angle < 0) angle += TAU;
  return DIRECTIONS[Math.round(angle / (TAU / 8)) % 8];
}

export class SpatialHash {
  constructor(cellSize = 96) { this.cellSize = cellSize; this.cells = new Map(); }
  key(x, y) { return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; }
  rebuild(items) {
    this.cells.clear();
    for (const item of items) {
      if (item.dead) continue;
      const key = this.key(item.x, item.y);
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = []);
      cell.push(item);
    }
  }
  nearby(x, y, radius) {
    const output = [];
    const minX = Math.floor((x - radius) / this.cellSize), maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize), maxY = Math.floor((y + radius) / this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const cell = this.cells.get(`${cx},${cy}`); if (cell) output.push(...cell);
    }
    return output;
  }
}

export class Hero {
  constructor() { this.reset(); }
  reset() {
    this.x = 0; this.y = 0; this.dir = DIRECTIONS[2]; this.speed = 238;
    this.hp = 100; this.maxHp = 100; this.invulnerable = 0; this.hitFlash = 0;
    this.attack = null; this.dash = null; this.dead = false; this.respawn = 0;
    this.combo = 0; this.comboWindow = 0; this.walkPhase = 0;
  }
  update(dt, movement) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    if (this.dead) { this.respawn -= dt; return; }
    if (this.dash) {
      this.x += this.dash.x * this.dash.speed * dt;
      this.y += this.dash.y * this.dash.speed * dt;
      this.dash.time -= dt;
      if (this.dash.time <= 0) this.dash = null;
      this.walkPhase += dt * 19;
      return;
    }
    const magnitude = Math.min(1, Math.hypot(movement.x, movement.y));
    if (magnitude > .05) {
      const n = normalize(movement.x, movement.y);
      this.dir = quantizeDirection(n.x, n.y, this.dir);
      const attackSlow = this.attack && this.attack.kind !== 'attack' ? .48 : this.attack ? .72 : 1;
      this.x += n.x * this.speed * magnitude * attackSlow * dt;
      this.y += n.y * this.speed * magnitude * attackSlow * dt;
      this.walkPhase += dt * 10 * magnitude;
    }
  }
  damage(amount) {
    if (this.dead || this.invulnerable > 0) return false;
    this.hp = Math.max(0, this.hp - amount); this.invulnerable = .55; this.hitFlash = .18;
    if (this.hp <= 0) { this.dead = true; this.respawn = 2.2; this.attack = null; this.dash = null; }
    return true;
  }
}

export class Enemy {
  constructor(id, x, y, tier = 0) {
    this.id = id; this.x = x; this.y = y; this.tier = tier;
    this.radius = tier ? 25 : 20; this.maxHp = tier ? 110 : 62; this.hp = this.maxHp;
    this.speed = tier ? 63 : 80 + Math.random() * 18;
    this.vx = 0; this.vy = 0; this.dirX = 0; this.dirY = 1;
    this.attackCooldown = Math.random() * .7; this.hitFlash = 0; this.knockX = 0; this.knockY = 0;
    this.lastAi = performance.now(); this.dead = false; this.deathAge = 0; this.walkPhase = Math.random() * TAU;
  }
  applyDamage(amount, knockX, knockY) {
    if (this.dead) return false;
    this.hp -= amount; this.hitFlash = .16; this.knockX += knockX; this.knockY += knockY;
    if (this.hp <= 0) { this.dead = true; this.deathAge = 0; this.vx = 0; this.vy = 0; return true; }
    return false;
  }
  updateMotion(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown -= dt;
    if (this.dead) { this.deathAge += dt; return; }
    this.x += (this.vx + this.knockX) * dt;
    this.y += (this.vy + this.knockY) * dt;
    const damping = Math.pow(.02, dt);
    this.knockX *= damping; this.knockY *= damping;
    this.walkPhase += dt * (4 + this.speed * .025);
    if (Math.hypot(this.vx, this.vy) > 2) { const n = normalize(this.vx, this.vy); this.dirX = n.x; this.dirY = n.y; }
  }
}

function drawShadow(ctx, x, y, rx, ry, alpha = .3) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); ctx.restore();
}

function swordPose(hero, now) {
  let angle = -.35, reach = 35, lift = 0;
  if (hero.attack) {
    const t = clamp(hero.attack.age / hero.attack.duration, 0, 1);
    const swing = hero.attack.kind === 'spin' ? t * TAU * 1.5 : hero.attack.kind === 'slash' ? -2.3 + t * 4.2 : -1.7 + t * 3.2;
    angle = swing + (hero.attack.combo === 2 ? .35 : hero.attack.combo === 3 ? -.25 : 0);
    reach = hero.attack.kind === 'slash' ? 48 : hero.attack.kind === 'spin' ? 42 : 39;
    lift = Math.sin(t * Math.PI) * 5;
  }
  return { angle, reach, lift };
}

export function drawHero(ctx, hero, project, now, particlesEnabled = true) {
  const p = project(hero.x, hero.y, 0);
  const viewAngle = Math.atan2(hero.dir.y * .62, hero.dir.x);
  const moving = hero.dash || Math.abs(Math.sin(hero.walkPhase)) > .05;
  const bob = moving ? Math.sin(hero.walkPhase * 2) * 1.6 : Math.sin(now * .003) * .7;
  const fade = hero.dead ? clamp(1 - hero.respawn / 2.2, 0, 1) : 1;
  ctx.save(); ctx.globalAlpha = 1 - fade * .82;
  drawShadow(ctx, p.x, p.y + 4, 27, 11, hero.dead ? .12 : .34);
  ctx.restore();
  if (hero.dead) return;

  ctx.save(); ctx.translate(p.x, p.y - 18 + bob); ctx.rotate(viewAngle);
  if (hero.hitFlash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 18; ctx.shadowColor = '#ff8d95'; }

  const step = Math.sin(hero.walkPhase) * 5;
  ctx.strokeStyle = '#172431'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, 19); ctx.lineTo(-8 - step * .32, 31); ctx.moveTo(8, 19); ctx.lineTo(8 + step * .32, 31); ctx.stroke();
  ctx.fillStyle = '#26394a'; ctx.beginPath(); ctx.ellipse(-9 - step * .32, 32, 8, 4, 0, 0, TAU); ctx.ellipse(9 + step * .32, 32, 8, 4, 0, 0, TAU); ctx.fill();

  ctx.fillStyle = hero.hitFlash > 0 ? '#ffe4e6' : '#27485a'; ctx.strokeStyle = '#87c8d5'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-18, -4); ctx.lineTo(-14, 20); ctx.quadraticCurveTo(0, 28, 15, 20); ctx.lineTo(18, -4); ctx.quadraticCurveTo(0, -15, -18, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#122d3c'; ctx.fillRect(-4, -7, 8, 30);
  ctx.fillStyle = '#f0c46c'; ctx.fillRect(-17, 12, 34, 4);

  ctx.fillStyle = '#496d7c'; ctx.strokeStyle = '#9cd1d9';
  ctx.beginPath(); ctx.moveTo(-20, -7); ctx.lineTo(-10, -18); ctx.lineTo(-3, -8); ctx.lineTo(-12, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, -7); ctx.lineTo(10, -18); ctx.lineTo(3, -8); ctx.lineTo(12, 2); ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#d6a77f'; ctx.beginPath(); ctx.arc(0, -23, 11, 0, TAU); ctx.fill();
  ctx.fillStyle = '#243b4c'; ctx.beginPath(); ctx.arc(0, -26, 12, Math.PI, TAU); ctx.lineTo(10, -22); ctx.lineTo(-10, -22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b9f4ff'; ctx.fillRect(4, -25, 3, 2);

  const sword = swordPose(hero, now);
  ctx.save(); ctx.translate(12, -4); ctx.rotate(sword.angle);
  ctx.strokeStyle = '#d7a85f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(7, 1); ctx.stroke();
  ctx.strokeStyle = '#6d4930'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 17); ctx.stroke();
  const bladeGradient = ctx.createLinearGradient(0, -sword.reach, 0, 0);
  bladeGradient.addColorStop(0, '#ffffff'); bladeGradient.addColorStop(.35, '#bffff4'); bladeGradient.addColorStop(1, '#5ab9cb');
  ctx.strokeStyle = bladeGradient; ctx.lineWidth = 7; ctx.lineCap = 'round';
  if (particlesEnabled) { ctx.shadowColor = '#6fffe2'; ctx.shadowBlur = 13; }
  ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, -sword.reach - sword.lift); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-1, -sword.reach); ctx.stroke();
  ctx.restore();

  if (particlesEnabled) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .18 + Math.sin(now * .006) * .04;
    ctx.strokeStyle = '#72f5d6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 30, 34, 12, 0, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

export function drawEnemy(ctx, enemy, project) {
  const p = project(enemy.x, enemy.y, 0);
  if (enemy.dead && enemy.deathAge > .55) return;
  const deathT = enemy.dead ? clamp(enemy.deathAge / .55, 0, 1) : 0;
  drawShadow(ctx, p.x, p.y + 3, enemy.radius * .9 * (1 - deathT * .6), enemy.radius * .36, .26 * (1 - deathT));
  ctx.save(); ctx.translate(p.x, p.y - 13 + Math.sin(enemy.walkPhase * 2) * 1.2); ctx.scale(1, 1 - deathT * .85); ctx.globalAlpha = 1 - deathT;
  const angle = Math.atan2(enemy.dirY * .62, enemy.dirX); ctx.rotate(angle);
  if (enemy.hitFlash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 12; ctx.shadowColor = '#fff'; }
  const large = enemy.tier > 0;
  ctx.strokeStyle = '#1b2a22'; ctx.lineWidth = large ? 8 : 6; ctx.lineCap = 'round';
  const step = Math.sin(enemy.walkPhase) * 4;
  ctx.beginPath(); ctx.moveTo(-7, 13); ctx.lineTo(-8 - step * .25, 24); ctx.moveTo(7, 13); ctx.lineTo(8 + step * .25, 24); ctx.stroke();
  ctx.fillStyle = enemy.hitFlash > 0 ? '#fff4df' : large ? '#6f7745' : '#52724c'; ctx.strokeStyle = '#263a2a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 4, large ? 19 : 15, large ? 21 : 17, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = large ? '#7c8550' : '#668558'; ctx.beginPath(); ctx.arc(0, -13, large ? 14 : 11, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-8, -19); ctx.lineTo(-18, -24); ctx.lineTo(-10, -10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8, -19); ctx.lineTo(18, -24); ctx.lineTo(10, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffb867'; ctx.fillRect(4, -15, 3, 2); ctx.fillStyle = '#1e1713'; ctx.fillRect(-2, -7, 8, 2);
  if (large) { ctx.strokeStyle = '#b8a86f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-18, -1); ctx.lineTo(-30, 10); ctx.stroke(); }
  ctx.restore();
  if (!enemy.dead && enemy.hp < enemy.maxHp) {
    const width = enemy.tier ? 48 : 38, ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(p.x - width / 2, p.y - 57, width, 5);
    ctx.fillStyle = enemy.tier ? '#f1b14d' : '#e65c64'; ctx.fillRect(p.x - width / 2 + 1, p.y - 56, (width - 2) * ratio, 3);
  }
}
