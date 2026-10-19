// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLifeKeyboard, type LifeKeyboardSink } from './life-input.js';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function fixture() {
  const host = document.createElement('section');
  const button = document.createElement('button'); button.textContent = 'HUD'; host.append(button); document.body.append(host);
  const calls: string[] = [];
  const sink: LifeKeyboardSink = {
    enqueueAction: (name, arg) => calls.push(`${name}:${arg?.arg ?? ''}`),
    requestInteraction: () => calls.push('request'), cycleInteraction: (delta) => calls.push(`cycle:${delta}`),
    confirmInteraction: () => calls.push('confirm'), backInteraction: () => calls.push('back'), closeInteraction: () => calls.push('close'),
  };
  let enabled = true; let open = false;
  const binding = installLifeKeyboard(window, sink, document, { host, enabled: () => enabled, interactionOpen: () => open });
  const key = (code: string, shiftKey = false, target: EventTarget = button, type = 'keydown') => {
    const event = new KeyboardEvent(type, { code, shiftKey, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event;
  };
  button.focus();
  return { host, button, calls, sink, binding, key, enable: (value: boolean) => { enabled = value; }, menu: (value: boolean) => { open = value; } };
}

describe('Life render-local native UI keyboard routing', () => {
  it('leaves Tab, Shift-Tab, Enter and Space native only with all three opt-in conditions', () => {
    const f = fixture(); const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      for (const code of ['Tab', 'Enter', 'Space']) expect(f.key(code).defaultPrevented).toBe(false);
      expect(f.key('Tab', true).defaultPrevented).toBe(false);
      expect(f.calls).toEqual([]);
      expect(debug).toHaveBeenCalledWith('[Life keyboard] decision:native-ui', 'Enter');
    } finally { f.binding(); }
  });

  it.each(['disabled-overlay', 'open-menu', 'outside-host', 'non-native', 'disabled-control'] as const)('preserves world Tab/Enter routing for %s', (condition) => {
    const f = fixture(); let target: HTMLElement = f.button;
    try {
      if (condition === 'disabled-overlay') f.enable(false);
      if (condition === 'open-menu') f.menu(true);
      if (condition === 'outside-host') { target = document.createElement('button'); document.body.append(target); }
      if (condition === 'non-native') { target = document.createElement('div'); target.tabIndex = 0; target.setAttribute('role', 'button'); f.host.append(target); }
      target.focus();
      if (condition === 'disabled-control') f.button.disabled = true;
      expect(f.key('Tab', false, target).defaultPrevented).toBe(true);
      expect(f.key('Tab', true, target).defaultPrevented).toBe(true);
      expect(f.key('Enter', false, target).defaultPrevented).toBe(true);
      expect(f.calls).toEqual(['cycle:1', 'cycle:-1', 'confirm']);
    } finally { f.binding(); }
  });

  it('routes menu open/close dynamically and never leaks native handling across two hosts', () => {
    const first = fixture(); const second = fixture();
    try {
      second.button.focus(); second.key('Enter');
      expect(second.calls).toEqual([]); expect(first.calls).toEqual(['confirm']);
      // Each host keeps its old outside-host contract; it does not claim another host's focus.
      second.menu(true); second.key('Tab');
      expect(second.calls).toEqual(['cycle:1']);
      second.menu(false); second.key('Tab');
      expect(second.calls).toEqual(['cycle:1']);
    } finally { first.binding(); second.binding(); }
  });

  it('permits the first native Tab from body or this playfield canvas without any pointer setup', () => {
    const f = fixture(); f.binding();
    const playfield = document.createElement('div'); const canvas = document.createElement('canvas'); canvas.tabIndex = 0;
    playfield.append(canvas); document.body.append(playfield);
    let open = false;
    const binding = installLifeKeyboard(window, f.sink, document, { host: f.host, playfield, enabled: () => true, interactionOpen: () => open });
    try {
      f.button.blur();
      expect(document.activeElement).toBe(document.body);
      expect(f.key('Tab', false, document.body).defaultPrevented).toBe(false);
      canvas.focus(); expect(f.key('Tab', false, canvas).defaultPrevented).toBe(false);
      expect(f.calls).toEqual([]);
      open = true;
      expect(f.key('Tab', false, canvas).defaultPrevented).toBe(true);
      expect(f.calls).toEqual(['cycle:1']);
    } finally { binding(); }
  });

  it('lets Tab leave the LayoutNode resource Tooltip instead of trapping the focus before HUD buttons', () => {
    const f = fixture();
    try {
      const tip = document.createElement('span'); tip.tabIndex = 0; tip.dataset.tooltip = ''; f.host.prepend(tip); tip.focus();
      expect(f.key('Tab', false, tip).defaultPrevented).toBe(false);
      expect(f.key('Tab', true, tip).defaultPrevented).toBe(false);
      expect(f.key('Enter', false, tip).defaultPrevented).toBe(true);
      expect(f.calls).toEqual(['confirm']);
    } finally { f.binding(); }
  });

  it('does not change held movement, keyup, blur, releaseAll or teardown', () => {
    const f = fixture();
    f.key('KeyD');
    expect(f.calls).toEqual(['close', 'life.move.state:8']);
    f.key('Tab'); f.key('Enter');
    expect(f.calls).toEqual(['close', 'life.move.state:8']);
    f.key('KeyD', false, f.button, 'keyup');
    expect(f.calls.at(-1)).toBe('life.move.state:0');
    f.key('KeyW'); window.dispatchEvent(new Event('blur'));
    expect(f.calls.at(-1)).toBe('life.move.state:0');
    f.key('KeyD'); f.binding.releaseAll();
    expect(f.calls.at(-1)).toBe('life.move.state:0');
    f.binding(); const before = [...f.calls];
    expect(f.key('Tab').defaultPrevented).toBe(false); expect(f.calls).toEqual(before);
  });

  it('keeps the three-argument legacy installer untouched even when a button has focus', () => {
    const f = fixture(); f.binding();
    const legacy = installLifeKeyboard(window, f.sink, document);
    try {
      expect(f.key('Tab').defaultPrevented).toBe(true); expect(f.key('Enter').defaultPrevented).toBe(true);
      expect(f.calls).toEqual(['cycle:1', 'confirm']);
    } finally { legacy(); }
  });
});
