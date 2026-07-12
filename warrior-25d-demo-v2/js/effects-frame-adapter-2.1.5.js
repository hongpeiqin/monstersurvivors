import { ParticleSystem } from './effects-2.1.5.js?v=2.1.5-r2';

// Particle draw cost alone can underestimate Canvas2D/GPU pressure. Fold the whole RAF interval
// into the advanced-effect budget so a monster-heavy frame reduces FX within four frames.
ParticleSystem.prototype.adapt = function adaptAdvancedBudget(cost) {
  this.drawEma = this.drawEma ? this.drawEma * 0.84 + cost * 0.16 : cost;
  if (this.level !== 'high' || this.frame % 4) return;
  const frameMs = Number(globalThis.__WARRIOR_FRAME_MS__) || 16.7;
  if (frameMs > 34 || this.drawEma > 9) this.runtimeScale *= 0.72;
  else if (frameMs > 25 || this.drawEma > 6) this.runtimeScale *= 0.86;
  else if (frameMs > 20.5 || this.drawEma > 4.6) this.runtimeScale *= 0.94;
  else if (frameMs < 18 && this.drawEma < 2.8) this.runtimeScale += 0.022;
  this.runtimeScale = Math.max(0.34, Math.min(1, this.runtimeScale));
};
