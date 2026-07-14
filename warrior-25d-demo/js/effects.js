const TAU = Math.PI * 2;

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export class ParticleSystem {
  constructor() {
    this.enabled = true;
    this.items = [];
    this.nextId = 1;
    this.frame = 0;
    this.profile = { slices: 2, max: 850, draw: 650, spawn: 1, glow: 1 };
    this.stats = { emitted: 0, dropped: 0, drawn: 0 };
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
  }

  clear() {
    this.items.length = 0;
    this.stats.drawn = 0;
  }

  configure(profile) {
    this.profile = {
      slices: Math.max(1, profile.particleSlices || 2),
      max: Math.max(0, profile.maxParticles || 500),
      draw: Math.max(0, profile.drawParticles || 350),
      spawn: clamp(profile.particleSpawn ?? 1, 0, 1),
      glow: clamp(profile.glow ?? 1, 0.2, 1)
    };
    if (this.items.length > this.profile.max) this.items.splice(0, this.items.length - this.profile.max);
  }

  add(spec, important = false) {
    if (!this.enabled) return null;
    if (!important && Math.random() > this.profile.spawn) return null;
    if (this.items.length >= this.profile.max) {
      if (!important) {
        this.stats.dropped++;
        return null;
      }
      const replace = this.items.findIndex(item => !item.important);
      if (replace >= 0) this.items.splice(replace, 1);
      else this.items.shift();
    }
    const now = performance.now();
    const item = {
      id: this.nextId++, bucket: this.nextId % 8, important,
      x: spec.x || 0, y: spec.y || 0, z: spec.z || 0,
      vx: spec.vx || 0, vy: spec.vy || 0, vz: spec.vz || 0,
      gravity: spec.gravity ?? -18, drag: spec.drag ?? 0.92,
      life: spec.life ?? 0.55, born: now, updated: now,
      size: spec.size ?? 4, endSize: spec.endSize ?? 0.6,
      color: spec.color || '#8ff7e2', alpha: spec.alpha ?? 1,
      shape: spec.shape || 'dot', rotation: spec.rotation || 0, spin: spec.spin || 0,
      length: spec.length || 12, width: spec.width || 2,
      dead: false
    };
    this.items.push(item);
    this.stats.emitted++;
    return item;
  }

  burst(kind, x, y, options = {}) {
    if (!this.enabled) return;
    const count = Math.max(1, Math.round((options.count || 12) * this.profile.spawn));
    const color = options.color || '#8ff7e2';
    for (let i = 0; i < count; i++) {
      const angle = options.angle == null ? Math.random() * TAU : options.angle + rand(-(options.spread || 0.8), options.spread || 0.8);
      const speed = rand(options.speedMin || 55, options.speedMax || 190);
      const spec = {
        x: x + rand(-4, 4), y: y + rand(-4, 4), z: options.z || rand(6, 24),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        vz: rand(options.vzMin ?? 15, options.vzMax ?? 85),
        gravity: options.gravity ?? -110, drag: options.drag ?? 0.92,
        life: rand(options.lifeMin || 0.24, options.lifeMax || 0.62),
        size: rand(options.sizeMin || 2, options.sizeMax || 6), endSize: options.endSize ?? 0.4,
        color: Array.isArray(color) ? color[i % color.length] : color,
        shape: kind === 'spark' ? 'streak' : kind === 'shard' ? 'diamond' : 'dot',
        length: rand(8, 24), width: rand(1, 3), rotation: angle, spin: rand(-6, 6), alpha: options.alpha ?? 1
      };
      this.add(spec, Boolean(options.important && i < 6));
    }
  }

  aura(x, y, color = '#77f4db') {
    if (!this.enabled || Math.random() > 0.45 * this.profile.spawn) return;
    const angle = Math.random() * TAU;
    const radius = rand(20, 38);
    this.add({
      x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius,
      z: rand(0, 18), vx: -Math.cos(angle) * rand(4, 15), vy: -Math.sin(angle) * rand(4, 15),
      vz: rand(16, 42), gravity: 5, drag: 0.98, life: rand(0.45, 0.9),
      size: rand(2, 5), endSize: 0.3, color, alpha: 0.72, shape: 'dot'
    });
  }

  dashTrail(x, y, direction) {
    if (!this.enabled) return;
    const sideX = -direction.y, sideY = direction.x;
    for (let i = 0; i < Math.max(2, Math.round(5 * this.profile.spawn)); i++) {
      const lateral = rand(-24, 24);
      this.add({
        x: x - direction.x * rand(10, 55) + sideX * lateral,
        y: y - direction.y * rand(10, 55) + sideY * lateral,
        z: rand(0, 14), vx: -direction.x * rand(35, 90) + sideX * rand(-18, 18),
        vy: -direction.y * rand(35, 90) + sideY * rand(-18, 18), vz: rand(8, 28),
        gravity: -20, drag: 0.9, life: rand(0.2, 0.48), size: rand(5, 12),
        endSize: 1.5, color: i % 2 ? '#7fe9ff' : '#d8ffff', alpha: 0.65, shape: 'smoke'
      });
    }
  }

  update(dt, now = performance.now()) {
    this.frame++;
    if (!this.enabled || !this.items.length) return;
    const slices = this.profile.slices;
    const activeBucket = this.frame % slices;
    for (let i = activeBucket; i < this.items.length; i += slices) {
      const p = this.items[i];
      if (!p || p.dead) continue;
      const age = (now - p.born) / 1000;
      if (age >= p.life) { p.dead = true; continue; }
      const elapsed = Math.min(0.085, Math.max(0, (now - p.updated) / 1000));
      if (!elapsed) continue;
      const drag = Math.pow(p.drag, elapsed * 60);
      p.vx *= drag; p.vy *= drag;
      p.vz += p.gravity * elapsed;
      p.x += p.vx * elapsed; p.y += p.vy * elapsed; p.z += p.vz * elapsed;
      if (p.z < 0) { p.z = 0; p.vz *= -0.22; p.vx *= 0.72; p.vy *= 0.72; }
      p.rotation += p.spin * elapsed;
      p.updated = now;
    }
    if (this.frame % 24 === 0 || this.items.length > this.profile.max * 1.05) {
      this.items = this.items.filter(p => !p.dead && (now - p.born) / 1000 < p.life);
      if (this.items.length > this.profile.max) this.items.splice(0, this.items.length - this.profile.max);
    }
  }

  draw(ctx, project, now = performance.now(), viewport = { width: innerWidth, height: innerHeight }) {
    this.stats.drawn = 0;
    if (!this.enabled || !this.items.length || this.profile.draw <= 0) return;
    const alive = this.items.length;
    const stride = Math.max(1, Math.ceil(alive / this.profile.draw));
    const offset = this.frame % stride;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = offset; i < alive; i += stride) {
      const p = this.items[i];
      if (!p || p.dead) continue;
      const age = (now - p.born) / 1000;
      if (age < 0 || age >= p.life) continue;
      const lag = Math.min(0.05, Math.max(0, (now - p.updated) / 1000));
      const pos = project(p.x + p.vx * lag, p.y + p.vy * lag, Math.max(0, p.z + p.vz * lag));
      if (pos.x < -40 || pos.x > viewport.width + 40 || pos.y < -40 || pos.y > viewport.height + 40) continue;
      const t = age / p.life;
      const fade = (1 - t) * p.alpha;
      const size = p.size + (p.endSize - p.size) * t;
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.shape === 'streak') {
        const angle = Math.atan2(p.vy, p.vx);
        const len = p.length * (1 - t * 0.55);
        ctx.lineWidth = Math.max(0.7, p.width * (1 - t));
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x - Math.cos(angle) * len, pos.y - Math.sin(angle) * len * 0.62);
        ctx.stroke();
      } else if (p.shape === 'diamond') {
        ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(p.rotation);
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .65, 0); ctx.lineTo(0, size); ctx.lineTo(-size * .65, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (p.shape === 'smoke') {
        ctx.globalAlpha = fade * 0.45;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, Math.max(0.5, size), 0, TAU); ctx.fill();
      } else {
        ctx.shadowBlur = 7 * this.profile.glow; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, Math.max(0.5, size), 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      }
      this.stats.drawn++;
      if (this.stats.drawn >= this.profile.draw) break;
    }
    ctx.restore();
  }
}

export class VisualEffects {
  constructor() { this.items = []; this.texts = []; this.shake = 0; }
  arc(spec) { this.items.push({ type: 'arc', age: 0, life: spec.life || 0.32, ...spec }); }
  ring(spec) { this.items.push({ type: 'ring', age: 0, life: spec.life || 0.4, ...spec }); }
  ghost(spec) { this.items.push({ type: 'ghost', age: 0, life: spec.life || 0.22, ...spec }); }
  damageText(x, y, value, heavy = false) { this.texts.push({ x, y, value, heavy, age: 0, life: heavy ? 0.85 : 0.65 }); }
  hitShake(amount) { this.shake = Math.max(this.shake, amount); }
  update(dt) {
    for (const item of this.items) item.age += dt;
    for (const text of this.texts) { text.age += dt; text.y -= dt * (text.heavy ? 46 : 34); }
    this.items = this.items.filter(item => item.age < item.life);
    this.texts = this.texts.filter(text => text.age < text.life);
    this.shake *= Math.pow(0.02, dt);
    if (this.shake < 0.05) this.shake = 0;
  }
  drawWorld(ctx, project, particlesEnabled) {
    for (const item of this.items) {
      const t = item.age / item.life;
      const alpha = (1 - t) * (item.alpha ?? 1);
      const pos = project(item.x, item.y, item.z || 10);
      ctx.save();
      ctx.globalCompositeOperation = particlesEnabled ? 'lighter' : 'source-over';
      ctx.globalAlpha = alpha;
      if (item.type === 'arc') {
        ctx.translate(pos.x, pos.y);
        ctx.scale(1, .62);
        ctx.strokeStyle = item.color || '#b7fff1';
        ctx.lineWidth = (item.width || 16) * (1 - t * .72);
        ctx.lineCap = 'round';
        if (particlesEnabled) { ctx.shadowColor = item.color || '#8ef3e2'; ctx.shadowBlur = 18; }
        ctx.beginPath(); ctx.arc(0, 0, (item.radius || 110) * (0.82 + t * .24), item.start, item.end, item.ccw || false); ctx.stroke();
        if (particlesEnabled) {
          ctx.globalAlpha = alpha * .75; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, (item.width || 16) * .18);
          ctx.beginPath(); ctx.arc(0, 0, (item.radius || 110) * (0.84 + t * .22), item.start, item.end, item.ccw || false); ctx.stroke();
        }
      } else if (item.type === 'ring') {
        ctx.translate(pos.x, pos.y); ctx.scale(1, .62);
        ctx.strokeStyle = item.color || '#72eaff'; ctx.lineWidth = Math.max(1, (item.width || 8) * (1 - t));
        if (particlesEnabled) { ctx.shadowBlur = 16; ctx.shadowColor = item.color || '#72eaff'; }
        ctx.beginPath(); ctx.arc(0, 0, (item.radius || 70) * (0.35 + t * .9), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }
  drawText(ctx, project) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const text of this.texts) {
      const t = text.age / text.life;
      const pos = project(text.x, text.y, 48);
      ctx.globalAlpha = 1 - t;
      ctx.font = `${text.heavy ? 900 : 800} ${text.heavy ? 24 : 17}px system-ui`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.72)'; ctx.strokeText(String(text.value), pos.x, pos.y);
      ctx.fillStyle = text.heavy ? '#ffe88a' : '#f1fbff'; ctx.fillText(String(text.value), pos.x, pos.y);
    }
    ctx.restore();
  }
}
