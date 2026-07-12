(() => {
  'use strict';

  const MAP = new Map([
    ['KeyK', { code: 'KeyQ', key: 'q', action: 'slash' }],
    ['KeyL', { code: 'KeyE', key: 'e', action: 'spin' }],
    ['KeyU', { code: 'KeyR', key: 'r', action: 'dash' }],
  ]);

  const settingsBackdrop = () => document.getElementById('settingsBackdrop');

  function forwardKeyboardEvent(event) {
    if (event.__warriorRemapped) return;
    const mapping = MAP.get(event.code);
    if (!mapping) return;

    // Do not fire combat actions through the settings dialog or system shortcuts.
    if (settingsBackdrop() && !settingsBackdrop().hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const forwarded = new KeyboardEvent(event.type, {
      code: mapping.code,
      key: event.shiftKey ? mapping.key.toUpperCase() : mapping.key,
      repeat: event.repeat,
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: event.shiftKey,
    });
    Object.defineProperty(forwarded, '__warriorRemapped', { value: true });
    globalThis.dispatchEvent(forwarded);
  }

  globalThis.addEventListener('keydown', forwardKeyboardEvent, { capture: true });
  globalThis.addEventListener('keyup', forwardKeyboardEvent, { capture: true });

  globalThis.__WARRIOR_KEYMAP__ = Object.freeze({
    KeyJ: 'attack',
    KeyK: 'slash',
    KeyL: 'spin',
    KeyU: 'dash',
    KeyI: 'reserved',
    KeyO: 'reserved',
  });
})();
