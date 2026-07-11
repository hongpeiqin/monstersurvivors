const TAU = Math.PI * 2;
const ISO_Y_SCALE = 0.62;

export const DIRECTIONS = [
  { x: 1, y: 0, name: '东' },
  { x: 0.7071, y: 0.7071, name: '东南' },
  { x: 0, y: 1, name: '南' },
  { x: -0.7071, y: 0.7071, name: '西南' },
  { x: -1, y: 0, name: '西' },
  { x: -0.7071, y: -0.7071, name: '西北' },
  { x: 0, y: -1, name: '北' },
  { x: 0.7071, y: -0.7071, name: '东北' },
];

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

export function quantizeDirection(x, y, fallback = DIRECTIONS[2]) {
  if (Math.hypot(x, y) < 0.12) return fallback;
  let angle = Math.atan2(y, x);
  if (angle < 0) angle += TAU;
  return DIRECTIONS[Math.round(angle / (TAU / 8)) % 8];
}

export class SpatialHash {
  constructor(cellSize = 96) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  key(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

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
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const cell = this.cells.get(`${cellX},${cellY}`);
        if (cell) output.push(...cell);
      }
    }
    return output;
  }
}

export class Hero {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.dir = DIRECTIONS[2];
    this.speed = 238;
    this.hp = 100;
    this.maxHp = 100;
    this.invulnerable = 0;
    this.hitFlash = 0;
    this.attack = null;
    this.dash = null;
    this.dead = false;
    this.respawn = 0;
    this.combo = 0;
    this.comboWindow = 0;
    this.walkPhase = 0;
  }

  update(dt, movement) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);

    if (this.dead) {
      this.respawn -= dt;
      return;
    }

    if (this.dash) {
      this.x += this.dash.x * this.dash.speed * dt;
      this.y += this.dash.y * this.dash.speed * dt;
      this.dash.time -= dt;
      if (this.dash.time <= 0) this.dash = null;
      this.walkPhase += dt * 19;
      return;
    }

    const magnitude = Math.min(1, Math.hypot(movement.x, movement.y));
    if (magnitude <= 0.05) return;

    const direction = normalize(movement.x, movement.y);
    this.dir = quantizeDirection(direction.x, direction.y, this.dir);
    const slow = this.attack && this.attack.kind !== 'attack' ? 0.48 : this.attack ? 0.72 : 1;
    this.x += direction.x * this.speed * magnitude * slow * dt;
    this.y += direction.y * this.speed * magnitude * slow * dt;
    this.walkPhase += dt * 10 * magnitude;
  }

  damage(value) {
    if (this.dead || this.invulnerable > 0) return false;
    this.hp = Math.max(0, this.hp - value);
    this.invulnerable = 0.55;
    this.hitFlash = 0.18;
    if (this.hp <= 0) {
      this.dead = true;
      this.respawn = 2.2;
      this.attack = null;
      this.dash = null;
    }
    return true;
  }
}

export class Enemy {
  constructor(id, x, y, tier = 0) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.tier = tier;
    this.radius = tier ? 25 : 20;
    this.maxHp = tier ? 110 : 62;
    this.hp = this.maxHp;
    this.speed = tier ? 63 : 80 + Math.random() * 18;
    this.vx = 0;
    this.vy = 0;
    this.dirX = 0;
    this.dirY = 1;
    this.attackCooldown = Math.random() * 0.7;
    this.hitFlash = 0;
    this.knockX = 0;
    this.knockY = 0;
    this.lastAi = performance.now();
    this.dead = false;
    this.deathAge = 0;
    this.walkPhase = Math.random() * TAU;
  }

  applyDamage(value, knockX, knockY) {
    if (this.dead) return false;
    this.hp -= value;
    this.hitFlash = 0.16;
    this.knockX += knockX;
    this.knockY += knockY;
    if (this.hp <= 0) {
      this.dead = true;
      this.deathAge = 0;
      this.vx = 0;
      this.vy = 0;
      return true;
    }
    return false;
  }

  updateMotion(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown -= dt;
    if (this.dead) {
      this.deathAge += dt;
      return;
    }

    this.x += (this.vx + this.knockX) * dt;
    this.y += (this.vy + this.knockY) * dt;
    const damping = Math.pow(0.02, dt);
    this.knockX *= damping;
    this.knockY *= damping;
    this.walkPhase += dt * (4 + this.speed * 0.025);

    if (Math.hypot(this.vx, this.vy) > 2) {
      const direction = normalize(this.vx, this.vy);
      this.dirX = direction.x;
      this.dirY = direction.y;
    }
  }
}

function screenDirection(x, y) {
  const projectedY = y * ISO_Y_SCALE;
  const length = Math.hypot(x, projectedY) || 1;
  return { x: x / length, y: projectedY / length, worldY: y };
}

function shadow(ctx, x, y, radiusX, radiusY, alpha = 0.3) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function swordAngle(hero, facing) {
  const forward = Math.atan2(facing.y, facing.x);
  if (!hero.attack) return forward + 0.52;

  const progress = clamp(hero.attack.age / hero.attack.duration, 0, 1);
  let relative;
  if (hero.attack.kind === 'spin') relative = progress * TAU * 1.55;
  else if (hero.attack.kind === 'slash') relative = -1.65 + progress * 3.25;
  else relative = -1.35 + progress * 2.7;

  return forward + relative + (hero.attack.combo === 2 ? 0.3 : hero.attack.combo === 3 ? -0.2 : 0);
}

function drawSword(ctx, hero, facing, side, effectsEnabled) {
  const angle = swordAngle(hero, facing);
  const bladeX = Math.cos(angle);
  const bladeY = Math.sin(angle);
  const handX = side.x * 12 + facing.x * 5;
  const handY = -3 + side.y * 3 + facing.y * 2;
  const reach = hero.attack?.kind === 'slash' ? 52 : hero.attack?.kind === 'spin' ? 46 : 42;
  const tipX = handX + bladeX * reach;
  const tipY = handY + bladeY * reach * 0.74;

  ctx.save();
  ctx.lineCap = 'round';

  if (effectsEnabled) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#6fffe2';
    ctx.shadowBlur = hero.attack ? 20 : 10;
    ctx.globalAlpha = hero.attack ? 0.72 : 0.25;
    ctx.strokeStyle = '#72ffe3';
    ctx.lineWidth = hero.attack ? 13 : 8;
    ctx.beginPath();
    ctx.moveTo(handX + bladeX * 3, handY + bladeY * 2);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#6d4930';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(handX - bladeX * 7, handY - bladeY * 5);
  ctx.lineTo(handX + bladeX * 5, handY + bladeY * 4);
  ctx.stroke();

  ctx.strokeStyle = '#d7a85f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(handX - bladeY * 7, handY + bladeX * 4);
  ctx.lineTo(handX + bladeY * 7, handY - bladeX * 4);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(handX, handY, tipX, tipY);
  gradient.addColorStop(0, '#5ab9cb');
  gradient.addColorStop(0.55, '#bffff4');
  gradient.addColorStop(1, '#fff');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(handX + bladeX * 4, handY + bladeY * 3);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(handX + bladeX * 7 - bladeY, handY + bladeY * 5 + bladeX * 0.7);
  ctx.lineTo(tipX - bladeY, tipY + bladeX * 0.7);
  ctx.stroke();
  ctx.restore();
}

export function drawHero(ctx, hero, project, now, effectsEnabled = true) {
  const point = project(hero.x, hero.y, 0);
  const facing = screenDirection(hero.dir.x, hero.dir.y);
  const side = { x: -facing.y, y: facing.x };
  const moving = hero.dash || Math.abs(Math.sin(hero.walkPhase)) > 0.05;
  const bob = moving ? Math.sin(hero.walkPhase * 2) * 1.6 : Math.sin(now * 0.003) * 0.7;
  const blink = hero.invulnerable > 0 && Math.floor(now * 0.018) % 2 === 0;

  shadow(ctx, point.x, point.y + 4, 27, 11, hero.dead ? 0.12 : 0.34);
  if (hero.dead) return;

  ctx.save();
  ctx.translate(point.x, point.y - 18 + bob);
  ctx.globalAlpha = blink ? 0.48 : 1;
  if (hero.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff8d95';
  }

  const step = Math.sin(hero.walkPhase) * 5;
  const swordBehind = hero.dir.y < -0.18;
  if (swordBehind) drawSword(ctx, hero, facing, side, effectsEnabled);

  ctx.fillStyle = '#26394a';
  ctx.beginPath();
  ctx.ellipse(side.x * 8 + facing.x * step * 0.3, -1 + side.y * 3, 8, 4, 0, 0, TAU);
  ctx.ellipse(-side.x * 8 - facing.x * step * 0.3, -1 - side.y * 3, 8, 4, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#172431';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(side.x * 6, 14 + side.y * 2);
  ctx.lineTo(side.x * 7 + facing.x * step * 0.45, 29 + side.y * 3);
  ctx.moveTo(-side.x * 6, 14 - side.y * 2);
  ctx.lineTo(-side.x * 7 - facing.x * step * 0.45, 29 - side.y * 3);
  ctx.stroke();
  ctx.lineCap = 'butt';

  const torso = ctx.createLinearGradient(-16, -10, 17, 22);
  torso.addColorStop(0, '#27485a');
  torso.addColorStop(0.55, '#416b7e');
  torso.addColorStop(1, '#1f3545');
  ctx.fillStyle = hero.hitFlash > 0 ? '#ffe4e6' : torso;
  ctx.strokeStyle = '#87c8d5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-17 + facing.x * 2, -5);
  ctx.lineTo(-14, 19);
  ctx.quadraticCurveTo(0, 27, 15, 19);
  ctx.lineTo(17 + facing.x * 2, -5);
  ctx.quadraticCurveTo(0, -15, -17 + facing.x * 2, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#122d3c';
  ctx.fillRect(-4 + facing.x, -7, 8, 29);
  ctx.fillStyle = '#f0c46c';
  ctx.fillRect(-17, 12, 34, 4);

  ctx.fillStyle = '#496d7c';
  ctx.strokeStyle = '#9cd1d9';
  ctx.beginPath();
  ctx.ellipse(-side.x * 14 + facing.x * 2, -5 - side.y * 4, 7, 5.5, Math.atan2(side.y, side.x), 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(side.x * 14 + facing.x * 2, -5 + side.y * 4, 7, 5.5, Math.atan2(side.y, side.x), 0, TAU);
  ctx.fill();
  ctx.stroke();

  const headX = facing.x * 4;
  const headY = -24 + facing.y * 2;
  ctx.fillStyle = '#d6a77f';
  ctx.beginPath();
  ctx.arc(headX, headY, 11, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#243b4c';
  ctx.beginPath();
  ctx.arc(headX, headY - 3, 12, Math.PI, TAU);
  ctx.lineTo(headX + 10, headY + 1);
  ctx.lineTo(headX - 10, headY + 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8394a3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(headX, headY - 3, 10, Math.PI + 0.12, TAU - 0.12);
  ctx.stroke();

  ctx.strokeStyle = '#c94f3c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(headX - facing.x * 2, headY - 12);
  ctx.lineTo(headX - facing.x * 8 - side.x * 2, headY - 23 - facing.y * 4);
  ctx.stroke();

  if (hero.dir.y > -0.5) {
    const eyeSpread = Math.abs(facing.x) > 0.65 ? 4.2 : 5.2;
    ctx.fillStyle = '#b9f4ff';
    ctx.beginPath();
    ctx.arc(headX - side.x * eyeSpread + facing.x * 5, headY - 1 + side.y * eyeSpread, 1.5, 0, TAU);
    ctx.arc(headX + side.x * eyeSpread + facing.x * 5, headY - 1 - side.y * eyeSpread, 1.5, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#354657';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX - side.x * 7, headY + side.y * 7);
    ctx.lineTo(headX + side.x * 7, headY - side.y * 7);
    ctx.stroke();
  }

  if (!swordBehind) drawSword(ctx, hero, facing, side, effectsEnabled);

  if (effectsEnabled) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + Math.sin(now * 0.006) * 0.04;
    ctx.strokeStyle = '#72f5d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 30, 34, 12, 0, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawEnemy(ctx, enemy, project) {
  const point = project(enemy.x, enemy.y, 0);
  if (enemy.dead && enemy.deathAge > 0.55) return;

  const deathProgress = enemy.dead ? clamp(enemy.deathAge / 0.55, 0, 1) : 0;
  const facing = screenDirection(enemy.dirX, enemy.dirY);
  const side = { x: -facing.y, y: facing.x };
  const big = enemy.tier > 0;
  const bob = Math.sin(enemy.walkPhase * 2) * 1.2;

  shadow(
    ctx,
    point.x,
    point.y + 3,
    enemy.radius * 0.9 * (1 - deathProgress * 0.6),
    enemy.radius * 0.36,
    0.26 * (1 - deathProgress),
  );

  ctx.save();
  ctx.translate(point.x, point.y - 13 + bob);
  const scale = 1 - deathProgress * 0.85;
  ctx.scale(scale, scale);
  ctx.globalAlpha = 1 - deathProgress;
  if (enemy.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#fff';
  }

  const step = Math.sin(enemy.walkPhase) * 4;
  ctx.fillStyle = '#1b2a22';
  ctx.beginPath();
  ctx.ellipse(side.x * 7 - facing.x * 2, 21 + side.y * 3, 5, 4, 0, 0, TAU);
  ctx.ellipse(-side.x * 7 - facing.x * 2, 21 - side.y * 3, 5, 4, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#1b2a22';
  ctx.lineWidth = big ? 8 : 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(side.x * 6, 9 + side.y * 2);
  ctx.lineTo(side.x * 7 - facing.x * 2 + facing.x * step * 0.25, 22 + side.y * 3);
  ctx.moveTo(-side.x * 6, 9 - side.y * 2);
  ctx.lineTo(-side.x * 7 - facing.x * 2 - facing.x * step * 0.25, 22 - side.y * 3);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.fillStyle = enemy.hitFlash > 0 ? '#fff4df' : big ? '#6f7745' : '#52724c';
  ctx.strokeStyle = '#263a2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(facing.x, 3 + facing.y, big ? 19 : 15, big ? 21 : 17, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const headX = facing.x * 4;
  const headY = -15 + facing.y * 3;
  ctx.fillStyle = big ? '#7c8550' : '#668558';
  ctx.beginPath();
  ctx.arc(headX, headY, big ? 14 : 11, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(headX - side.x * 8 - facing.x * 2, headY - side.y * 8 - facing.y * 2);
  ctx.lineTo(headX - side.x * 19 - facing.x * 4, headY - side.y * 19 - facing.y * 4);
  ctx.lineTo(headX - side.x * 9 + facing.x * 5, headY - side.y * 9 + facing.y * 5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headX + side.x * 8 - facing.x * 2, headY + side.y * 8 - facing.y * 2);
  ctx.lineTo(headX + side.x * 19 - facing.x * 4, headY + side.y * 19 - facing.y * 4);
  ctx.lineTo(headX + side.x * 9 + facing.x * 5, headY + side.y * 9 + facing.y * 5);
  ctx.closePath();
  ctx.fill();

  if (enemy.dirY > -0.5) {
    const eyeSpread = Math.abs(facing.x) > 0.65 ? 3.8 : 4.5;
    ctx.fillStyle = '#ffb867';
    ctx.beginPath();
    ctx.arc(headX - side.x * eyeSpread + facing.x * 5, headY - 1 + side.y * eyeSpread, 1.6, 0, TAU);
    ctx.arc(headX + side.x * eyeSpread + facing.x * 5, headY - 1 - side.y * eyeSpread, 1.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#1e1713';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX - side.x * 5 + facing.x * 7, headY + 6 + side.y * 5);
    ctx.lineTo(headX + side.x * 5 + facing.x * 7, headY + 6 - side.y * 5);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#344638';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX - side.x * 7, headY + side.y * 7);
    ctx.lineTo(headX + side.x * 7, headY - side.y * 7);
    ctx.stroke();
  }

  const clubX = side.x * (big ? 20 : 16) + facing.x * 2;
  const clubY = 1 + side.y * 5;
  ctx.strokeStyle = big ? '#b8a86f' : '#5b3c2b';
  ctx.lineWidth = big ? 5 : 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(clubX, clubY);
  ctx.lineTo(clubX + facing.x * 25 + side.x * 5, clubY + facing.y * 20 - 17);
  ctx.stroke();
  ctx.restore();

  if (!enemy.dead && enemy.hp < enemy.maxHp) {
    const width = big ? 48 : 38;
    const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(point.x - width / 2, point.y - 57, width, 5);
    ctx.fillStyle = big ? '#f1b14d' : '#e65c64';
    ctx.fillRect(point.x - width / 2 + 1, point.y - 56, (width - 2) * ratio, 3);
  }
}
