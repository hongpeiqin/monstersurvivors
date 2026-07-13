export class InputManager {
  constructor({ joystick, knob, activeButtons, onActive }) {
    this.keys = new Set();
    this.joystick = { x: 0, y: 0 };
    this.pointerId = null;
    this.onActive = onActive;
    this.enabled = true;
    this.bindKeyboard();
    this.bindJoystick(joystick, knob);
    this.bindButtons(activeButtons);
  }

  bindKeyboard() {
    addEventListener('keydown', event => {
      if (!this.enabled) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat && event.code !== 'KeyJ' && event.code !== 'Space') return;
      if (event.code === 'KeyJ' || event.code === 'Space') this.onActive?.('manual');
      else if (event.code === 'KeyK') this.onActive?.('dash');
      else if (event.code === 'KeyL') this.onActive?.('ultimate');
      else if (event.code === 'KeyU') this.onActive?.('magnet');
      else if (event.code === 'Escape') this.onActive?.('pause');
    }, { passive: false });

    addEventListener('keyup', event => {
      this.keys.delete(event.code);
      if (event.code === 'KeyJ' || event.code === 'Space') this.onActive?.('manual-release');
    });
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  bindJoystick(root, knob) {
    if (!root || !knob) return;
    const ring = root.querySelector('.joystick-ring');
    root.style.touchAction = 'none';
    ring.style.touchAction = 'none';
    root.style.overscrollBehavior = 'contain';
    knob.style.willChange = 'transform';

    let metrics = null;
    const refreshMetrics = () => {
      const rect = ring.getBoundingClientRect();
      metrics = {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        radius: Math.max(30, Math.min(rect.width, rect.height) * 0.40),
      };
      return metrics;
    };
    const invalidateMetrics = () => { metrics = null; };
    const latestPoint = event => {
      const coalesced = event.getCoalescedEvents?.();
      return coalesced?.length ? coalesced[coalesced.length - 1] : event;
    };

    const update = event => {
      const point = latestPoint(event);
      const current = metrics || refreshMetrics();
      const dx = point.clientX - current.centerX;
      const dy = point.clientY - current.centerY;
      const distance = Math.hypot(dx, dy);
      const raw = Math.min(1, distance / current.radius);
      const deadzone = 0.032;

      if (raw <= deadzone) {
        this.joystick.x = 0;
        this.joystick.y = 0;
        knob.style.transform = 'translate3d(0,0,0)';
        return;
      }

      const step = Math.PI / 4;
      const snappedAngle = Math.round(Math.atan2(dy, dx) / step) * step;
      const unitX = Math.cos(snappedAngle);
      const unitY = Math.sin(snappedAngle);
      this.joystick.x = Math.abs(unitX) < 1e-6 ? 0 : unitX;
      this.joystick.y = Math.abs(unitY) < 1e-6 ? 0 : unitY;

      const visualStrength = Math.min(1, (raw - deadzone) / (1 - deadzone));
      const travel = current.radius * visualStrength;
      knob.style.transform = `translate3d(${unitX * travel}px,${unitY * travel}px,0)`;
    };

    const release = event => {
      if (event && event.pointerId !== this.pointerId) return;
      if (this.pointerId !== null) {
        try {
          if (root.hasPointerCapture?.(this.pointerId)) root.releasePointerCapture(this.pointerId);
        } catch {}
      }
      this.pointerId = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
      knob.style.transform = 'translate3d(0,0,0)';
    };

    const onPointerMove = event => {
      if (event.pointerId !== this.pointerId) return;
      event.preventDefault();
      update(event);
    };

    root.addEventListener('pointerdown', event => {
      if (!this.enabled || this.pointerId !== null || event.isPrimary === false) return;
      event.preventDefault();
      refreshMetrics();
      this.pointerId = event.pointerId;
      try { root.setPointerCapture(event.pointerId); } catch {}
      update(event);
    }, { capture: true, passive: false });

    root.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    if ('onpointerrawupdate' in globalThis) {
      root.addEventListener('pointerrawupdate', onPointerMove, { capture: true, passive: false });
    }
    root.addEventListener('pointerup', event => {
      if (event.pointerId !== this.pointerId) return;
      event.preventDefault();
      release(event);
    }, { capture: true, passive: false });
    root.addEventListener('pointercancel', release, { capture: true, passive: false });
    root.addEventListener('lostpointercapture', () => release());
    root.addEventListener('contextmenu', event => event.preventDefault());

    addEventListener('resize', invalidateMetrics, { passive: true });
    addEventListener('orientationchange', invalidateMetrics, { passive: true });
    globalThis.visualViewport?.addEventListener?.('resize', invalidateMetrics, { passive: true });

    this.releaseJoystick = release;
    this.refreshJoystickMetrics = refreshMetrics;
  }

  bindButtons(root) {
    if (!root) return;
    for (const button of root.querySelectorAll('[data-active]')) {
      const action = button.dataset.active;
      const release = () => {
        button.classList.remove('pressed');
        if (action === 'manual') this.onActive?.('manual-release');
      };
      button.addEventListener('pointerdown', event => {
        if (!this.enabled) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        button.classList.add('pressed');
        this.onActive?.(action);
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    }
  }

  vector() {
    let x = this.joystick.x;
    let y = this.joystick.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x--;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x++;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y--;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y++;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  reset() {
    this.keys.clear();
    this.joystick.x = 0;
    this.joystick.y = 0;
    this.onActive?.('manual-release');
    this.releaseJoystick?.();
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) this.reset();
  }
}
