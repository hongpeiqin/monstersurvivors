const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fxLevel = () => {
  const value = globalThis.__WARRIOR_FX_LEVEL__;
  return value === 'off' || value === 'high' ? value : 'medium';
};
const pick = (colors, index) => Array.isArray(colors) ? colors[index % colors.length] : colors;

function paletteFor(color = '#8ff7e2') {
  const lower = String(color).toLowerCase();
  if (lower.includes('ff') && (lower.includes('e8') || lower.includes('f3'))) return [color, '#ffcb6b', '#fff8d8', '#ffffff'];
  if (lower.includes('83f7') || lower.includes('65df') || lower.includes('79e7')) return [color, '#57dfff', '#9d79ff', '#ffffff'];
  return [color, '#6fe7ff', '#a378ff', '#ffffff'];
}

function rgba(color, alpha) {
  const value = String(color);
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  const full = /^#([0-9a-f]{6})$/i.exec(value);
  if (short) {
    const [r, g, b] = short[1].split('').map(char => parseInt(char + char, 16));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (full) {
    const number = parseInt(full[1], 16);
    return `rgba(${number >> 16},${number >> 8 & 255},${number & 255},${alpha})`;
  }
  return `rgba(111,231,255,${alpha})`;
}

class GlowSprites {
  constructor() { this.cache = new Map(); }
  get(color, kind) {
    const key = `${kind}|${color}`;
    let canvas = this.cache.get(key);
    if (canvas) return canvas;
    const size = kind === 'aura' ? 96 : 64;
    canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(size, size) : document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    if (kind === 'smoke') {
      gradient.addColorStop(0, rgba(color, 0.34));
      gradient.addColorStop(0.45, rgba(color, 0.16));
    } else {
      gradient.addColorStop(0, 'rgba(255,255,255,.96)');
      gradient.addColorStop(kind === 'aura' ? 0.18 : 0.28, rgba(color, kind === 'aura' ? 0.72 : 0.82));
      gradient.addColorStop(kind === 'aura' ? 0.52 : 0.64, rgba(color, kind === 'aura' ? 0.22 : 0.16));
    }
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.cache.set(key, canvas);
    return canvas;
  }
}

const sprites = new GlowSprites();

export class ParticleSystem {
  constructor() {
    this.enabled = true;
    this.items = [];
    this.pool = [];
    this.nextId = 1;
    this.frame = 0;
    this.baseProfile = { slices: 2, max: 850, draw: 650, spawn: 1, glow: 1 };
    this.level = 'medium';
    this.runtimeScale = 1;
    this.drawEma = 0;
    this.activeProfile = null;
    this.lineGroups = new Map();
    this.replaceCursor = 0;
    this.stats = { emitted: 0, dropped: 0, drawn: 0, drawMs: 0, budget: 0 };
    this.syncProfile(true);
  }

  syncProfile(force = false) {
    const level = fxLevel();
    if (!force && level === this.level && this.activeProfile) return this.activeProfile;
    const changed = level !== this.level;
    this.level = level;
    if (changed) this.runtimeScale = level === 'high' ? 0.82 : 1;
    const base = this.baseProfile;
    if (level === 'off') this.activeProfile = { ...base, level, max: 0, draw: 0, spawn: 0, glow: 0 };
    else if (level === 'high') this.activeProfile = {
      level,
      slices: Math.max(2, base.slices),
      max: Math.round(base.max * 1.15 + 220),
      draw: Math.round(base.draw * 0.95 + 180),
      spawn: clamp(base.spawn + 0.22, 0.72, 1),
      glow: 1,
    };
    else this.activeProfile = { ...base, level };
    if (level === 'off') this.clear();
    return this.activeProfile;
  }

  effectiveProfile() {
    const profile = this.syncProfile();
    if (profile.level !== 'high') return profile;
    return {
      ...profile,
      max: Math.max(360, Math.round(profile.max * (0.58 + this.runtimeScale * 0.42))),
      draw: Math.max(220, Math.round(profile.draw * this.runtimeScale)),
      spawn: profile.spawn * (0.7 + this.runtimeScale * 0.3),
    };
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    this.syncProfile(true);
    if (!this.enabled || this.level === 'off') this.clear();
    else this.compact(performance.now(), true);
  }

  clear() {
    for (const item of this.items) if (this.pool.length < 900) this.pool.push(item);
    this.items.length = 0;
    this.stats.drawn = 0;
  }

  configure(profile) {
    this.baseProfile = {
      slices: Math.max(1, profile.particleSlices || 2),
      max: Math.max(0, profile.maxParticles || 500),
      draw: Math.max(0, profile.drawParticles || 350),
      spawn: clamp(profile.particleSpawn ?? 1, 0, 1),
      glow: clamp(profile.glow ?? 1, 0.2, 1),
    };
    this.syncProfile(true);
    this.compact(performance.now(), true);
  }

  add(spec, important = false, suppliedProfile = null) {
    const profile = suppliedProfile || this.effectiveProfile();
    if (!this.enabled || profile.level === 'off') return null;
    if (!important && Math.random() > profile.spawn) return null;

    let replacement = -1;
    if (this.items.length >= profile.max) {
      if (!important) { this.stats.dropped++; return null; }
      const length = this.items.length;
      for (let scan = 0; scan < Math.min(32, length); scan++) {
        const index = (this.replaceCursor + scan) % length;
        if (!this.items[index].important) { replacement = index; break; }
      }
      if (replacement < 0) replacement = this.replaceCursor % length;
      this.replaceCursor = (replacement + 1) % Math.max(1, length);
    }

    const now = performance.now();
    const particle = replacement >= 0 ? this.items[replacement] : (this.pool.pop() || {});
    particle.id = this.nextId++;
    particle.important = important;
    particle.x = spec.x || 0; particle.y = spec.y || 0; particle.z = spec.z || 0;
    particle.vx = spec.vx || 0; particle.vy = spec.vy || 0; particle.vz = spec.vz || 0;
    particle.gravity = spec.gravity ?? -18; particle.drag = spec.drag ?? 0.92;
    particle.life = spec.life ?? 0.55; particle.born = now; particle.updated = now;
    particle.size = spec.size ?? 4; particle.endSize = spec.endSize ?? 0.6;
    particle.color = spec.color || '#8ff7e2'; particle.color2 = spec.color2 || '#ffffff';
    particle.alpha = spec.alpha ?? 1; particle.shape = spec.shape || 'dot';
    particle.rotation = spec.rotation || 0; particle.spin = spec.spin || 0;
    particle.length = spec.length || 12; particle.width = spec.width || 2;
    particle.stretch = spec.stretch ?? 1; particle.phase = spec.phase ?? Math.random() * TAU;
    particle.dead = false;
    if (replacement < 0) this.items.push(particle);
    this.stats.emitted++;
    return particle;
  }

  burst(kind, x, y, options = {}) {
    if (globalThis.__WARRIOR_SUPPRESS_STRESS_FX__) return;
    const profile = this.effectiveProfile();
    if (!this.enabled || profile.level === 'off') return;
    const high = profile.level === 'high';
    const requested = options.count || 12;
    const count = Math.max(1, Math.round(requested * (high ? 1.55 * profile.spawn : profile.spawn)));
    const colors = options.color || '#8ff7e2';
    for (let index = 0; index < count; index++) {
      const angle = options.angle == null ? Math.random() * TAU : options.angle + rand(-(options.spread || 0.8), options.spread || 0.8);
      const speed = rand(options.speedMin || 55, (options.speedMax || 190) * (high ? 1.12 : 1));
      let shape = kind === 'spark' ? 'streak' : kind === 'shard' ? 'diamond' : 'dot';
      if (high) {
        const selector = index % 10;
        if (selector === 0) shape = 'glyph';
        else if (selector === 3 || selector === 8) shape = 'energy';
        else if (selector === 5) shape = 'aura';
        else if (kind === 'spark') shape = 'ribbon';
      }
      const color = pick(colors, index);
      const palette = paletteFor(color);
      this.add({
        x: x + rand(-5, 5), y: y + rand(-5, 5), z: options.z || rand(8, high ? 38 : 24),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        vz: rand(options.vzMin ?? 18, (options.vzMax ?? 85) * (high ? 1.16 : 1)),
        gravity: options.gravity ?? -110, drag: options.drag ?? 0.92,
        life: rand(options.lifeMin || 0.24, (options.lifeMax || 0.62) * (high ? 1.12 : 1)),
        size: rand(options.sizeMin || 2, (options.sizeMax || 6) * (high ? 1.25 : 1)),
        endSize: options.endSize ?? 0.4, color, color2: palette[3], shape,
        length: rand(high ? 12 : 8, high ? 36 : 24), width: rand(1, high ? 4.2 : 3),
        stretch: rand(1.2, high ? 2.7 : 2.2), rotation: angle, spin: rand(-7, 7), alpha: options.alpha ?? 1,
      }, Boolean(options.important && index < (high ? 8 : 6)), profile);
    }
  }

  aura(x, y, color = '#77f4db') {
    const profile = this.effectiveProfile();
    if (!this.enabled || profile.level === 'off') return;
    const high = profile.level === 'high';
    const chance = high ? 0.65 * profile.spawn : 0.45 * profile.spawn;
    if (Math.random() > chance) return;
    const count = high && this.runtimeScale > 0.62 ? 2 : 1;
    const palette = paletteFor(color);
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * TAU;
      const radius = rand(high ? 12 : 20, high ? 44 : 38);
      const shape = high ? (index ? 'energy' : 'aura') : 'dot';
      this.add({
        x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius * (high ? 0.64 : 1),
        z: rand(0, high ? 48 : 18), vx: Math.cos(angle) * rand(2, high ? 20 : 15),
        vy: Math.sin(angle) * rand(2, high ? 17 : 15), vz: rand(14, high ? 48 : 42),
        gravity: high ? 2 : 5, drag: high ? 0.965 : 0.98, life: rand(0.4, high ? 0.86 : 0.9),
        size: rand(2, high ? 6.4 : 5), endSize: 0.3, color: palette[index % 3], color2: palette[3],
        alpha: high ? 0.9 : 0.72, shape, spin: rand(-3, 3), length: rand(10, 20), width: rand(1.2, 2.8),
      }, false, profile);
    }
  }

  dashTrail(x, y, direction) {
    const profile = this.effectiveProfile();
    if (!this.enabled || profile.level === 'off') return;
    const high = profile.level === 'high';
    const sideX = -direction.y, sideY = direction.x;
    const count = high ? Math.max(5, Math.round(8 * this.runtimeScale)) : Math.max(2, Math.round(5 * profile.spawn));
    for (let index = 0; index < count; index++) {
      const lateral = rand(-27, 27);
      this.add({
        x: x - direction.x * rand(10, high ? 74 : 55) + sideX * lateral,
        y: y - direction.y * rand(10, high ? 74 : 55) + sideY * lateral,
        z: rand(0, high ? 24 : 14), vx: -direction.x * rand(35, high ? 125 : 90) + sideX * rand(-22, 22),
        vy: -direction.y * rand(35, high ? 125 : 90) + sideY * rand(-22, 22), vz: rand(8, high ? 40 : 28),
        gravity: -20, drag: 0.9, life: rand(0.2, high ? 0.58 : 0.48), size: rand(5, high ? 15 : 12),
        endSize: 1.5, color: index % 3 === 0 ? '#9d79ff' : index % 2 ? '#7fe9ff' : '#d8ffff',
        color2: '#ffffff', alpha: high ? 0.86 : 0.65, shape: high && index % 3 ? 'ribbon' : 'smoke',
        length: rand(18, high ? 42 : 28), width: rand(1.4, high ? 4.2 : 3), stretch: rand(1.4, 2.7),
      }, false, profile);
    }
  }

  compact(now = performance.now(), force = false) {
    const profile = this.effectiveProfile();
    let write = 0;
    for (let read = 0; read < this.items.length; read++) {
      const particle = this.items[read];
      const alive = !particle.dead && (now - particle.born) / 1000 < particle.life;
      if (alive) this.items[write++] = particle;
      else if (this.pool.length < 900) this.pool.push(particle);
    }
    this.items.length = write;
    if (write > profile.max) {
      const drop = write - profile.max;
      for (let index = 0; index < drop; index++) if (this.pool.length < 900) this.pool.push(this.items[index]);
      this.items.copyWithin(0, drop, write);
      this.items.length = profile.max;
    }
    if (force) this.replaceCursor = 0;
  }

  update(dt, now = performance.now()) {
    this.frame++;
    const profile = this.effectiveProfile();
    if (!this.enabled || profile.level === 'off' || !this.items.length) return;
    const bucket = this.frame % profile.slices;
    for (let index = bucket; index < this.items.length; index += profile.slices) {
      const particle = this.items[index];
      if (!particle || particle.dead) continue;
      const age = (now - particle.born) / 1000;
      if (age >= particle.life) { particle.dead = true; continue; }
      const elapsed = Math.min(0.085, Math.max(0, (now - particle.updated) / 1000));
      if (!elapsed) continue;
      const drag = Math.pow(particle.drag, elapsed * 60);
      particle.vx *= drag; particle.vy *= drag; particle.vz += particle.gravity * elapsed;
      particle.x += particle.vx * elapsed; particle.y += particle.vy * elapsed; particle.z += particle.vz * elapsed;
      if (particle.z < 0) { particle.z = 0; particle.vz *= -0.22; particle.vx *= 0.72; particle.vy *= 0.72; }
      particle.rotation += particle.spin * elapsed; particle.updated = now;
    }
    if (this.frame % 12 === 0 || this.items.length > profile.max) this.compact(now);
  }

  lineGroup(color, alpha, width, ribbon) {
    const alphaBin = Math.max(1, Math.min(4, Math.ceil(alpha * 4))) / 4;
    const widthBin = Math.max(1, Math.min(6, Math.round(width)));
    const key = `${color}|${alphaBin}|${widthBin}|${ribbon ? 1 : 0}`;
    let group = this.lineGroups.get(key);
    if (!group) {
      group = { color, alpha: alphaBin, width: widthBin, ribbon, points: [] };
      this.lineGroups.set(key, group);
    }
    return group;
  }

  adapt(cost) {
    this.drawEma = this.drawEma ? this.drawEma * 0.84 + cost * 0.16 : cost;
    if (this.level !== 'high' || this.frame % 6) return;
    if (this.drawEma > 9) this.runtimeScale *= 0.76;
    else if (this.drawEma > 6) this.runtimeScale *= 0.88;
    else if (this.drawEma > 4.6) this.runtimeScale *= 0.95;
    else if (this.drawEma < 2.8) this.runtimeScale += 0.025;
    this.runtimeScale = clamp(this.runtimeScale, 0.36, 1);
  }

  draw(ctx, project, now = performance.now(), view = { width: innerWidth, height: innerHeight }) {
    const started = performance.now();
    this.stats.drawn = 0;
    const profile = this.effectiveProfile();
    const telemetry = globalThis.__WARRIOR_FX_TELEMETRY__ || (globalThis.__WARRIOR_FX_TELEMETRY__ = {});
    if (!this.enabled || profile.level === 'off' || !this.items.length || profile.draw <= 0) {
      Object.assign(telemetry, { drawn: 0, budget: profile.draw || 0, drawMs: 0, scale: this.runtimeScale, particles: this.items.length });
      return;
    }

    for (const group of this.lineGroups.values()) group.points.length = 0;
    const stride = Math.max(1, Math.ceil(this.items.length / profile.draw));
    const offset = this.frame % stride;
    const high = profile.level === 'high';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let index = offset; index < this.items.length; index += stride) {
      const particle = this.items[index];
      if (!particle || particle.dead) continue;
      const age = (now - particle.born) / 1000;
      if (age < 0 || age >= particle.life) continue;
      const lag = Math.min(0.05, Math.max(0, (now - particle.updated) / 1000));
      const position = project(particle.x + particle.vx * lag, particle.y + particle.vy * lag, Math.max(0, particle.z + particle.vz * lag));
      if (position.x < -80 || position.x > view.width + 80 || position.y < -80 || position.y > view.height + 80) continue;
      const progress = age / particle.life;
      const lifeRatio = 1 - progress;
      const fade = Math.min(1, lifeRatio * 1.8) * particle.alpha;
      const size = particle.size + (particle.endSize - particle.size) * progress;
      if (fade <= 0.01 || size <= 0.1) continue;

      if (particle.shape === 'streak' || particle.shape === 'ribbon') {
        const angle = Math.atan2(particle.vy, particle.vx);
        const length = particle.length * particle.stretch * (1 - progress * 0.48);
        const group = this.lineGroup(particle.color, fade, particle.width * lifeRatio, particle.shape === 'ribbon');
        group.points.push(position.x - Math.cos(angle) * length, position.y - Math.sin(angle) * length * 0.62,
          position.x + Math.cos(angle) * length, position.y + Math.sin(angle) * length * 0.62);
      } else if (particle.shape === 'diamond' || particle.shape === 'energy') {
        const angle = particle.rotation;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const rx = particle.shape === 'energy' ? size * 1.75 : size * 0.68;
        const ry = particle.shape === 'energy' ? size * 0.72 : size;
        ctx.globalAlpha = fade;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.moveTo(position.x + cos * rx, position.y + sin * rx);
        ctx.lineTo(position.x - sin * ry, position.y + cos * ry);
        ctx.lineTo(position.x - cos * rx, position.y - sin * rx);
        ctx.lineTo(position.x + sin * ry, position.y - cos * ry);
        ctx.closePath(); ctx.fill();
        if (high) {
          ctx.globalAlpha = fade * 0.84; ctx.fillStyle = particle.color2;
          ctx.beginPath(); ctx.arc(position.x, position.y, Math.max(0.55, size * 0.28), 0, TAU); ctx.fill();
        }
      } else if (particle.shape === 'glyph') {
        const angle = particle.rotation + particle.phase;
        const cos = Math.cos(angle), sin = Math.sin(angle), radius = Math.max(1, size);
        ctx.globalAlpha = fade; ctx.strokeStyle = particle.color; ctx.lineWidth = Math.max(1, radius * 0.22);
        ctx.beginPath(); ctx.arc(position.x, position.y, radius, 0, TAU); ctx.stroke();
        const r = radius * 0.72;
        ctx.beginPath();
        for (let corner = 0; corner < 4; corner++) {
          const a = angle + Math.PI / 4 + corner * Math.PI / 2;
          const px = position.x + Math.cos(a) * r, py = position.y + Math.sin(a) * r;
          if (!corner) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      } else {
        const kind = particle.shape === 'smoke' ? 'smoke' : particle.shape === 'aura' ? 'aura' : 'dot';
        const sprite = sprites.get(particle.color, kind);
        const radius = Math.max(1.5, size * (kind === 'smoke' ? 2.8 : kind === 'aura' ? 3.2 : high ? 2.45 : 1.9));
        ctx.globalAlpha = fade * (kind === 'smoke' ? 0.65 : 1);
        ctx.drawImage(sprite, position.x - radius, position.y - radius, radius * 2, radius * 2);
      }
      if (++this.stats.drawn >= profile.draw) break;
    }

    for (const group of this.lineGroups.values()) {
      const points = group.points;
      if (!points.length) continue;
      ctx.lineCap = 'round';
      ctx.globalAlpha = group.alpha * (group.ribbon ? 0.34 : 0.28);
      ctx.strokeStyle = group.color;
      ctx.lineWidth = group.width * (group.ribbon ? 3.1 : 2.3);
      ctx.beginPath();
      for (let index = 0; index < points.length; index += 4) { ctx.moveTo(points[index], points[index + 1]); ctx.lineTo(points[index + 2], points[index + 3]); }
      ctx.stroke();
      ctx.globalAlpha = group.alpha * 0.92;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.8, group.width * (group.ribbon ? 0.48 : 0.34));
      ctx.beginPath();
      for (let index = 0; index < points.length; index += 4) { ctx.moveTo(points[index], points[index + 1]); ctx.lineTo(points[index + 2], points[index + 3]); }
      ctx.stroke();
    }
    ctx.restore();

    const cost = performance.now() - started;
    this.stats.drawMs = cost; this.stats.budget = profile.draw;
    this.adapt(cost);
    Object.assign(telemetry, {
      drawn: this.stats.drawn, budget: profile.draw, drawMs: this.drawEma,
      scale: this.runtimeScale, particles: this.items.length, level: profile.level,
    });
  }
}

export class VisualEffects {
  constructor() { this.items = []; this.texts = []; this.shake = 0; }
  push(item) {
    if (this.items.length >= 72) this.items.splice(0, this.items.length - 71);
    this.items.push(item);
  }
  arc(spec) {
    const high = fxLevel() === 'high';
    this.push({ type: 'arc', age: 0, life: spec.life || 0.32, layer: 0, ...spec });
    if (!high) return;
    const sweep = Math.abs((spec.end || 0) - (spec.start || 0));
    const spin = sweep > TAU * 1.15 || ((spec.radius || 0) > 130 && (spec.radius || 0) < 175);
    const palette = paletteFor(spec.color);
    const layers = spin ? 3 : 2;
    for (let index = 1; index <= layers; index++) {
      const offset = (index - (layers + 1) / 2) * (spin ? 15 : 8);
      this.push({ type: 'arc', age: -index * 0.025, life: (spec.life || 0.32) * (1.02 + index * 0.05), layer: index,
        ...spec, radius: Math.max(18, (spec.radius || 110) + offset), width: Math.max(2.2, (spec.width || 16) * 0.46),
        color: palette[index % 3], alpha: 0.68 - index * 0.09 });
    }
    if (spin) for (let index = 0; index < 3; index++) this.push({ type: 'ring', age: -index * 0.045, life: 0.52 + index * 0.07,
      layer: 8 + index, x: spec.x, y: spec.y, z: spec.z || 8, radius: 62 + index * 29, width: 4 + index,
      color: palette[index % 3], alpha: 0.66 - index * 0.08 });
  }
  ring(spec) {
    const high = fxLevel() === 'high';
    this.push({ type: 'ring', age: 0, life: spec.life || 0.4, layer: 0, ...spec });
    if (!high) return;
    const palette = paletteFor(spec.color);
    const count = (spec.radius || 0) > 100 ? 3 : 2;
    for (let index = 1; index <= count; index++) this.push({ type: 'ring', age: -index * 0.04,
      life: (spec.life || 0.4) * (1 + index * 0.08), layer: index, ...spec,
      radius: Math.max(16, (spec.radius || 70) * (0.68 + index * 0.17)),
      width: Math.max(2, (spec.width || 8) * (0.62 + index * 0.07)), color: palette[index % 3], alpha: 0.72 - index * 0.09 });
  }
  damageText(x, y, value, heavy = false) {
    if (this.texts.length >= 40) this.texts.shift();
    this.texts.push({ x, y, value, heavy, age: 0, life: heavy ? 0.85 : 0.65 });
  }
  hitShake(amount) { this.shake = Math.max(this.shake, fxLevel() === 'high' ? amount * 1.12 : amount); }
  update(dt) {
    let write = 0;
    for (const item of this.items) { item.age += dt; if (item.age < item.life) this.items[write++] = item; }
    this.items.length = write;
    write = 0;
    for (const text of this.texts) { text.age += dt; text.y -= dt * (text.heavy ? 46 : 34); if (text.age < text.life) this.texts[write++] = text; }
    this.texts.length = write;
    this.shake *= Math.pow(0.02, dt); if (this.shake < 0.05) this.shake = 0;
  }
  drawWorld(ctx, project, particlesEnabled) {
    const high = particlesEnabled && fxLevel() === 'high';
    for (const item of this.items) {
      if (item.age < 0) continue;
      const progress = clamp(item.age / item.life, 0, 1);
      const alpha = (1 - progress) * (item.alpha ?? 1);
      const point = project(item.x, item.y, item.z || 10);
      if (point.x < -260 || point.x > innerWidth + 260 || point.y < -220 || point.y > innerHeight + 220) continue;
      const color = item.color || '#b7fff1';
      ctx.save(); ctx.globalCompositeOperation = particlesEnabled ? 'lighter' : 'source-over';
      ctx.translate(point.x, point.y); ctx.scale(1, 0.62); ctx.lineCap = 'round';
      const radius = item.type === 'arc' ? (item.radius || 110) * (0.82 + progress * 0.24) : (item.radius || 70) * (0.35 + progress * 0.9);
      const start = item.type === 'arc' ? item.start : 0, end = item.type === 'arc' ? item.end : TAU;
      if (high) {
        ctx.globalAlpha = alpha * 0.25; ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(3, (item.width || 12) * (item.layer ? 1.3 : 2.05) * (1 - progress * 0.58));
        ctx.beginPath(); ctx.arc(0, 0, radius, start, end, item.ccw || false); ctx.stroke();
      }
      ctx.globalAlpha = alpha; ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.3, (item.width || 12) * (1 - progress * 0.72));
      ctx.beginPath(); ctx.arc(0, 0, radius, start, end, item.ccw || false); ctx.stroke();
      if (particlesEnabled) {
        ctx.globalAlpha = alpha * (high ? 0.94 : 0.7); ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(high ? 2 : 1.2, (item.width || 12) * (high ? 0.2 : 0.15));
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.985, start, end, item.ccw || false); ctx.stroke();
      }
      ctx.restore();
    }
  }
  drawText(ctx, project) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const text of this.texts) {
      const progress = text.age / text.life, point = project(text.x, text.y, 48);
      if (point.x < -60 || point.x > innerWidth + 60 || point.y < -60 || point.y > innerHeight + 60) continue;
      ctx.globalAlpha = 1 - progress; ctx.font = `${text.heavy ? 900 : 800} ${text.heavy ? 24 : 17}px system-ui`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.72)'; ctx.strokeText(String(text.value), point.x, point.y);
      ctx.fillStyle = text.heavy ? '#ffe88a' : '#f1fbff'; ctx.fillText(String(text.value), point.x, point.y);
    }
    ctx.restore();
  }
}
