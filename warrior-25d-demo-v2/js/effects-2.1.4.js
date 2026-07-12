const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const fxLevel = () => {
  const level = globalThis.__WARRIOR_FX_LEVEL__;
  return level === 'off' || level === 'high' ? level : 'medium';
};

const pick = (colors, index) => Array.isArray(colors) ? colors[index % colors.length] : colors;

function paletteFor(color = '#8ff7e2') {
  const lower = String(color).toLowerCase();
  if (lower.includes('ff') && (lower.includes('e8') || lower.includes('f3'))) {
    return [color, '#ffcb6b', '#fff8d8', '#ffffff'];
  }
  if (lower.includes('83f7') || lower.includes('65df') || lower.includes('79e7')) {
    return [color, '#57dfff', '#9d79ff', '#ffffff'];
  }
  return [color, '#6fe7ff', '#a378ff', '#ffffff'];
}

export class ParticleSystem {
  constructor() {
    this.enabled = true;
    this.items = [];
    this.nextId = 1;
    this.frame = 0;
    this.baseProfile = { slices: 2, max: 850, draw: 650, spawn: 1, glow: 1 };
    this.stats = { emitted: 0, dropped: 0, drawn: 0 };
  }

  get profile() {
    const level = fxLevel();
    const base = this.baseProfile;
    if (level === 'off') return { ...base, level, max: 0, draw: 0, spawn: 0, glow: 0 };
    if (level === 'high') {
      return {
        level,
        slices: Math.max(1, Math.min(2, base.slices)),
        max: Math.max(2400, Math.round(base.max * 2.45)),
        draw: Math.max(1900, Math.round(base.draw * 2.35)),
        spawn: 1,
        glow: 1.85,
      };
    }
    return { ...base, level };
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled || fxLevel() === 'off') this.clear();
  }

  clear() {
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
    const active = this.profile;
    if (this.items.length > active.max) this.items.splice(0, this.items.length - active.max);
  }

  add(spec, important = false) {
    const profile = this.profile;
    if (!this.enabled || profile.level === 'off') return null;
    if (!important && Math.random() > profile.spawn) return null;

    if (this.items.length >= profile.max) {
      if (!important) {
        this.stats.dropped++;
        return null;
      }
      const replaceIndex = this.items.findIndex(particle => !particle.important);
      if (replaceIndex >= 0) this.items.splice(replaceIndex, 1);
      else this.items.shift();
    }

    const now = performance.now();
    const particle = {
      id: this.nextId++, important,
      x: spec.x || 0, y: spec.y || 0, z: spec.z || 0,
      vx: spec.vx || 0, vy: spec.vy || 0, vz: spec.vz || 0,
      gravity: spec.gravity ?? -18, drag: spec.drag ?? 0.92,
      life: spec.life ?? 0.55, born: now, updated: now,
      size: spec.size ?? 4, endSize: spec.endSize ?? 0.6,
      color: spec.color || '#8ff7e2', color2: spec.color2 || '#ffffff',
      alpha: spec.alpha ?? 1, shape: spec.shape || 'dot',
      rotation: spec.rotation || 0, spin: spec.spin || 0,
      length: spec.length || 12, width: spec.width || 2,
      stretch: spec.stretch ?? 1, phase: spec.phase ?? Math.random() * TAU,
      dead: false,
    };
    this.items.push(particle);
    this.stats.emitted++;
    return particle;
  }

  burst(kind, x, y, options = {}) {
    const profile = this.profile;
    if (!this.enabled || profile.level === 'off') return;

    const high = profile.level === 'high';
    const requested = options.count || 12;
    const count = Math.max(1, Math.round(requested * (high ? 2.3 : profile.spawn)));
    const colors = options.color || '#8ff7e2';

    for (let index = 0; index < count; index++) {
      const angle = options.angle == null
        ? Math.random() * TAU
        : options.angle + rand(-(options.spread || 0.8), options.spread || 0.8);
      const speed = rand(options.speedMin || 55, (options.speedMax || 190) * (high ? 1.2 : 1));
      let shape = kind === 'spark' ? 'streak' : kind === 'shard' ? 'diamond' : 'dot';
      if (high) {
        const selector = index % 12;
        if (selector === 0 || selector === 7) shape = 'glyph';
        else if (selector === 3 || selector === 9) shape = 'energy';
        else if (selector === 5) shape = 'aura';
        else if (kind === 'spark' && selector !== 1) shape = 'ribbon';
      }
      const color = pick(colors, index);
      const palette = paletteFor(color);
      this.add({
        x: x + rand(-5, 5), y: y + rand(-5, 5), z: options.z || rand(8, high ? 48 : 24),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        vz: rand(options.vzMin ?? 18, (options.vzMax ?? 85) * (high ? 1.28 : 1)),
        gravity: options.gravity ?? -110, drag: options.drag ?? 0.92,
        life: rand(options.lifeMin || 0.24, (options.lifeMax || 0.62) * (high ? 1.22 : 1)),
        size: rand(options.sizeMin || 2, (options.sizeMax || 6) * (high ? 1.42 : 1)),
        endSize: options.endSize ?? 0.4,
        color, color2: palette[3], shape,
        length: rand(high ? 13 : 8, high ? 44 : 24),
        width: rand(1, high ? 5.2 : 3), stretch: rand(1.2, high ? 3.3 : 2.2),
        rotation: angle, spin: rand(-7, 7), alpha: options.alpha ?? 1,
      }, Boolean(options.important && index < (high ? 18 : 6)));
    }
  }

  aura(x, y, color = '#77f4db') {
    const profile = this.profile;
    if (!this.enabled || profile.level === 'off') return;
    const high = profile.level === 'high';
    const chance = high ? 1 : 0.45 * profile.spawn;
    if (Math.random() > chance) return;

    const count = high ? 5 : 1;
    const palette = paletteFor(color);
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * TAU;
      const radius = rand(high ? 9 : 20, high ? 48 : 38);
      const shape = high ? (index % 5 === 0 ? 'glyph' : index % 3 === 0 ? 'energy' : 'aura') : 'dot';
      this.add({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius * (high ? 0.64 : 1),
        z: rand(0, high ? 62 : 18),
        vx: Math.cos(angle) * rand(2, high ? 28 : 15),
        vy: Math.sin(angle) * rand(2, high ? 22 : 15),
        vz: rand(14, high ? 58 : 42),
        gravity: high ? rand(-5, 8) : 5, drag: high ? 0.96 : 0.98,
        life: rand(high ? 0.34 : 0.45, high ? 0.94 : 0.9),
        size: rand(high ? 2.4 : 2, high ? 7.2 : 5), endSize: 0.3,
        color: palette[index % 3], color2: palette[3],
        alpha: high ? 0.94 : 0.72, shape,
        spin: rand(-3, 3), length: rand(10, 22), width: rand(1.2, 3),
      });
    }
  }

  dashTrail(x, y, direction) {
    const profile = this.profile;
    if (!this.enabled || profile.level === 'off') return;
    const high = profile.level === 'high';
    const sideX = -direction.y;
    const sideY = direction.x;
    const count = high ? 16 : Math.max(2, Math.round(5 * profile.spawn));

    for (let index = 0; index < count; index++) {
      const lateral = rand(-28, 28);
      const shape = high && index % 3 ? 'ribbon' : 'smoke';
      this.add({
        x: x - direction.x * rand(10, high ? 88 : 55) + sideX * lateral,
        y: y - direction.y * rand(10, high ? 88 : 55) + sideY * lateral,
        z: rand(0, high ? 30 : 14),
        vx: -direction.x * rand(35, high ? 155 : 90) + sideX * rand(-24, 24),
        vy: -direction.y * rand(35, high ? 155 : 90) + sideY * rand(-24, 24),
        vz: rand(8, high ? 50 : 28), gravity: -20, drag: 0.9,
        life: rand(0.2, high ? 0.72 : 0.48),
        size: rand(5, high ? 18 : 12), endSize: 1.5,
        color: index % 3 === 0 ? '#9d79ff' : index % 2 ? '#7fe9ff' : '#d8ffff',
        color2: '#ffffff', alpha: high ? 0.9 : 0.65, shape,
        length: rand(18, high ? 52 : 28), width: rand(1.4, high ? 5 : 3), stretch: rand(1.5, 3),
      });
    }
  }

  update(dt, now = performance.now()) {
    this.frame++;
    const profile = this.profile;
    if (!this.enabled || profile.level === 'off' || !this.items.length) return;
    const bucket = this.frame % profile.slices;

    for (let index = bucket; index < this.items.length; index += profile.slices) {
      const particle = this.items[index];
      if (!particle || particle.dead) continue;
      const age = (now - particle.born) / 1000;
      if (age >= particle.life) {
        particle.dead = true;
        continue;
      }
      const elapsed = Math.min(0.085, Math.max(0, (now - particle.updated) / 1000));
      if (!elapsed) continue;
      const drag = Math.pow(particle.drag, elapsed * 60);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.vz += particle.gravity * elapsed;
      particle.x += particle.vx * elapsed;
      particle.y += particle.vy * elapsed;
      particle.z += particle.vz * elapsed;
      if (particle.z < 0) {
        particle.z = 0;
        particle.vz *= -0.22;
        particle.vx *= 0.72;
        particle.vy *= 0.72;
      }
      particle.rotation += particle.spin * elapsed;
      particle.updated = now;
    }

    if (this.frame % 24 === 0 || this.items.length > profile.max * 1.05) {
      this.items = this.items.filter(particle => !particle.dead && (now - particle.born) / 1000 < particle.life);
      if (this.items.length > profile.max) this.items.splice(0, this.items.length - profile.max);
    }
  }

  draw(ctx, project, now = performance.now(), view = { width: innerWidth, height: innerHeight }) {
    this.stats.drawn = 0;
    const profile = this.profile;
    if (!this.enabled || profile.level === 'off' || !this.items.length || profile.draw <= 0) return;

    const high = profile.level === 'high';
    const stride = Math.max(1, Math.ceil(this.items.length / profile.draw));
    const offset = this.frame % stride;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let index = offset; index < this.items.length; index += stride) {
      const particle = this.items[index];
      if (!particle || particle.dead) continue;
      const age = (now - particle.born) / 1000;
      if (age < 0 || age >= particle.life) continue;
      const lag = Math.min(0.05, Math.max(0, (now - particle.updated) / 1000));
      const position = project(
        particle.x + particle.vx * lag,
        particle.y + particle.vy * lag,
        Math.max(0, particle.z + particle.vz * lag),
      );
      if (position.x < -70 || position.x > view.width + 70 || position.y < -70 || position.y > view.height + 70) continue;

      const progress = age / particle.life;
      const lifeRatio = 1 - progress;
      const fade = Math.min(1, lifeRatio * 1.8) * particle.alpha;
      const size = particle.size + (particle.endSize - particle.size) * progress;
      ctx.globalAlpha = fade;
      ctx.fillStyle = particle.color;
      ctx.strokeStyle = particle.color;

      if (particle.shape === 'streak' || particle.shape === 'ribbon') {
        const angle = Math.atan2(particle.vy, particle.vx);
        const length = particle.length * particle.stretch * (1 - progress * 0.48);
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(angle);
        const gradient = ctx.createLinearGradient(-length, 0, length, 0);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.38, particle.color);
        gradient.addColorStop(0.7, particle.color2);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = gradient;
        if (high) {
          ctx.shadowBlur = (particle.shape === 'ribbon' ? 21 : 14) * profile.glow;
          ctx.shadowColor = particle.color;
          ctx.lineWidth = Math.max(2, particle.width * (particle.shape === 'ribbon' ? 2.4 : 1.8) * lifeRatio);
          ctx.beginPath();
          ctx.moveTo(-length, 0);
          ctx.lineTo(length, 0);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = fade;
        ctx.lineWidth = Math.max(0.8, particle.width * lifeRatio);
        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        if (high) {
          ctx.globalAlpha = fade * 0.92;
          ctx.strokeStyle = particle.color2;
          ctx.lineWidth = Math.max(1, particle.width * 0.3);
          ctx.beginPath();
          ctx.moveTo(-length * 0.52, 0);
          ctx.lineTo(length * 0.85, 0);
          ctx.stroke();
        }
        ctx.restore();
      } else if (particle.shape === 'diamond' || particle.shape === 'energy') {
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(particle.rotation);
        if (high) {
          ctx.shadowBlur = (particle.shape === 'energy' ? 22 : 15) * profile.glow;
          ctx.shadowColor = particle.color;
        }
        const xRadius = particle.shape === 'energy' ? size * 1.8 : size * 0.65;
        const yRadius = particle.shape === 'energy' ? size * 0.72 : size;
        ctx.beginPath();
        ctx.moveTo(xRadius, 0);
        ctx.lineTo(0, yRadius);
        ctx.lineTo(-xRadius, 0);
        ctx.lineTo(0, -yRadius);
        ctx.closePath();
        ctx.fill();
        if (high) {
          ctx.globalAlpha = fade * 0.86;
          ctx.fillStyle = particle.color2;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0.6, size * 0.28), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      } else if (particle.shape === 'glyph') {
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(particle.rotation + particle.phase);
        ctx.shadowBlur = high ? 18 * profile.glow : 8;
        ctx.shadowColor = particle.color;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = Math.max(1, size * 0.24);
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, TAU);
        ctx.stroke();
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-size * 0.55, -size * 0.55, size * 1.1, size * 1.1);
        ctx.restore();
      } else if (particle.shape === 'aura') {
        const radius = size * (0.72 + progress * 0.84);
        const glow = ctx.createRadialGradient(position.x, position.y, 0, position.x, position.y, radius * 2.7);
        glow.addColorStop(0, particle.color2);
        glow.addColorStop(0.28, particle.color);
        glow.addColorStop(1, 'rgba(80,180,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius * 2.7, 0, TAU);
        ctx.fill();
      } else {
        if (particle.shape === 'smoke') ctx.globalAlpha = fade * (high ? 0.58 : 0.45);
        else {
          ctx.shadowBlur = (high ? 15 : 7) * profile.glow;
          ctx.shadowColor = particle.color;
        }
        ctx.beginPath();
        ctx.arc(position.x, position.y, Math.max(0.5, size), 0, TAU);
        ctx.fill();
        if (high && particle.shape !== 'smoke') {
          ctx.globalAlpha = fade * 0.82;
          ctx.fillStyle = particle.color2;
          ctx.beginPath();
          ctx.arc(position.x, position.y, Math.max(0.45, size * 0.34), 0, TAU);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      if (++this.stats.drawn >= profile.draw) break;
    }
    ctx.restore();
  }
}

export class VisualEffects {
  constructor() {
    this.items = [];
    this.texts = [];
    this.shake = 0;
  }

  arc(spec) {
    const high = fxLevel() === 'high';
    this.items.push({ type: 'arc', age: 0, delay: 0, life: spec.life || 0.32, layer: 0, ...spec });
    if (!high) return;

    const sweep = Math.abs((spec.end || 0) - (spec.start || 0));
    const spinLike = sweep > TAU * 1.15 || (spec.radius || 0) > 130 && (spec.radius || 0) < 175;
    const palette = paletteFor(spec.color);
    const layers = spinLike ? 5 : 3;
    for (let index = 1; index <= layers; index++) {
      const offset = (index - (layers + 1) / 2) * (spinLike ? 14 : 7);
      this.items.push({
        type: 'arc', age: -index * 0.018, delay: index * 0.018,
        life: (spec.life || 0.32) * (1.02 + index * 0.04), layer: index,
        ...spec,
        radius: Math.max(18, (spec.radius || 110) + offset),
        width: Math.max(2.2, (spec.width || 16) * (spinLike ? 0.42 : 0.5)),
        color: palette[index % 3], alpha: 0.72 - index * 0.07,
      });
    }
    if (spinLike) {
      for (let index = 0; index < 5; index++) {
        this.items.push({
          type: 'ring', age: -index * 0.035, delay: index * 0.035,
          life: 0.54 + index * 0.055, layer: 10 + index,
          x: spec.x, y: spec.y, z: spec.z || 8,
          radius: 54 + index * 21, width: 4 + index * 0.8,
          color: palette[index % 3], alpha: 0.7 - index * 0.065,
        });
      }
    }
  }

  ring(spec) {
    const high = fxLevel() === 'high';
    this.items.push({ type: 'ring', age: 0, delay: 0, life: spec.life || 0.4, layer: 0, ...spec });
    if (!high) return;
    const palette = paletteFor(spec.color);
    const count = (spec.radius || 0) > 100 ? 6 : 3;
    for (let index = 1; index <= count; index++) {
      this.items.push({
        type: 'ring', age: -index * 0.032, delay: index * 0.032,
        life: (spec.life || 0.4) * (1 + index * 0.075), layer: index,
        ...spec,
        radius: Math.max(16, (spec.radius || 70) * (0.62 + index * 0.13)),
        width: Math.max(2, (spec.width || 8) * (0.62 + index * 0.06)),
        color: palette[index % 3], alpha: 0.78 - index * 0.075,
      });
    }
  }

  damageText(x, y, value, heavy = false) {
    this.texts.push({ x, y, value, heavy, age: 0, life: heavy ? 0.85 : 0.65 });
  }

  hitShake(amount) {
    this.shake = Math.max(this.shake, fxLevel() === 'high' ? amount * 1.18 : amount);
  }

  update(dt) {
    for (const item of this.items) item.age += dt;
    for (const text of this.texts) {
      text.age += dt;
      text.y -= dt * (text.heavy ? 46 : 34);
    }
    this.items = this.items.filter(item => item.age < item.life);
    this.texts = this.texts.filter(text => text.age < text.life);
    this.shake *= Math.pow(0.02, dt);
    if (this.shake < 0.05) this.shake = 0;
  }

  drawWorld(ctx, project, particlesEnabled) {
    const level = fxLevel();
    const high = particlesEnabled && level === 'high';
    for (const item of this.items) {
      if (item.age < 0) continue;
      const progress = clamp(item.age / item.life, 0, 1);
      const alpha = (1 - progress) * (item.alpha ?? 1);
      const point = project(item.x, item.y, item.z || 10);
      ctx.save();
      ctx.globalCompositeOperation = particlesEnabled ? 'lighter' : 'source-over';
      ctx.globalAlpha = alpha;
      ctx.translate(point.x, point.y);
      ctx.scale(1, 0.62);
      const palette = paletteFor(item.color);

      if (item.type === 'arc') {
        const radius = (item.radius || 110) * (0.82 + progress * 0.24);
        const gradient = ctx.createLinearGradient(-radius, 0, radius, 0);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.36, palette[1]);
        gradient.addColorStop(0.66, item.color || palette[0]);
        gradient.addColorStop(0.82, palette[3]);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.lineCap = 'round';

        if (high) {
          ctx.strokeStyle = gradient;
          ctx.shadowColor = item.color || palette[0];
          ctx.shadowBlur = item.layer ? 24 : 38;
          ctx.lineWidth = (item.width || 16) * (item.layer ? 1.25 : 2.0) * (1 - progress * 0.62);
          ctx.globalAlpha = alpha * (item.layer ? 0.34 : 0.26);
          ctx.beginPath();
          ctx.arc(0, 0, radius, item.start, item.end, item.ccw || false);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = alpha;
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = (item.width || 16) * (1 - progress * 0.72);
        if (particlesEnabled) {
          ctx.shadowColor = item.color || palette[0];
          ctx.shadowBlur = high ? 27 : 18;
        }
        ctx.beginPath();
        ctx.arc(0, 0, radius, item.start, item.end, item.ccw || false);
        ctx.stroke();

        if (particlesEnabled) {
          ctx.globalAlpha = alpha * (high ? 0.98 : 0.75);
          ctx.strokeStyle = '#ffffff';
          ctx.shadowBlur = high ? 13 : 6;
          ctx.shadowColor = '#ffffff';
          ctx.lineWidth = Math.max(high ? 2.5 : 1.5, (item.width || 16) * (high ? 0.22 : 0.18));
          ctx.beginPath();
          ctx.arc(0, 0, (item.radius || 110) * (0.84 + progress * 0.22), item.start, item.end, item.ccw || false);
          ctx.stroke();
        }
      } else {
        const radius = (item.radius || 70) * (0.35 + progress * 0.9);
        if (high) {
          ctx.globalAlpha = alpha * 0.46;
          ctx.lineWidth = Math.max(3, (item.width || 8) * 2.25 * (1 - progress));
          ctx.shadowBlur = 34;
          ctx.shadowColor = item.color || palette[0];
          ctx.strokeStyle = item.color || palette[0];
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = alpha;
        }
        ctx.lineWidth = Math.max(1, (item.width || 8) * (1 - progress));
        ctx.strokeStyle = item.color || palette[0];
        if (particlesEnabled) {
          ctx.shadowBlur = high ? 25 : 16;
          ctx.shadowColor = item.color || palette[0];
        }
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, TAU);
        ctx.stroke();
        if (high) {
          ctx.globalAlpha = alpha * 0.94;
          ctx.strokeStyle = '#ffffff';
          ctx.shadowBlur = 9;
          ctx.shadowColor = '#ffffff';
          ctx.lineWidth = Math.max(1.5, (item.width || 8) * 0.2 * (1 - progress));
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.96, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawText(ctx, project) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const text of this.texts) {
      const progress = text.age / text.life;
      const point = project(text.x, text.y, 48);
      ctx.globalAlpha = 1 - progress;
      ctx.font = `${text.heavy ? 900 : 800} ${text.heavy ? 24 : 17}px system-ui`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.72)';
      ctx.strokeText(String(text.value), point.x, point.y);
      ctx.fillStyle = text.heavy ? '#ffe88a' : '#f1fbff';
      ctx.fillText(String(text.value), point.x, point.y);
    }
    ctx.restore();
  }
}
