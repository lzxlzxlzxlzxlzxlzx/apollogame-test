// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

type MotionListener = (event: MediaQueryListEvent) => void;

/** Isolated OS-preference double: no browser profile or persistent setting is touched. */
function mockReducedMotion(initial = false): { set: (value: boolean) => void; listeners: Set<MotionListener>; restore: () => void } {
  const saved = window.matchMedia;
  let matches = initial;
  const listeners = new Set<MotionListener>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      get matches() { return matches; },
      media: '(prefers-reduced-motion: reduce)', onchange: null,
      addEventListener: (_: string, listener: MotionListener) => listeners.add(listener),
      removeEventListener: (_: string, listener: MotionListener) => listeners.delete(listener),
      addListener: (listener: MotionListener) => listeners.add(listener),
      removeListener: (listener: MotionListener) => listeners.delete(listener),
      dispatchEvent: () => true,
    }),
  });
  return {
    listeners,
    set(value: boolean) {
      matches = value;
      for (const listener of listeners) listener({ matches, media: '(prefers-reduced-motion: reduce)' } as MediaQueryListEvent);
    },
    restore: () => Object.defineProperty(window, 'matchMedia', { configurable: true, value: saved }),
  };
}

afterEach(() => document.body.replaceChildren());

const motionTree = (withModal = true): LayoutNode => ({
  type: 'Panel', id: 'motion-root', props: { bare: true }, layout: { anim: 'flyIn', transformTransition: { ms: 240 } }, children: [
    { type: 'Button', id: 'go', props: { label: '继续', action: 'go', skin: '/button.png', skinFeedback: { hoverBrightness: 1.2, pressedBrightness: 0.9, glowRadius: 6, glowColor: { custom: '#abcdef' }, transitionMs: 160 } } },
    { type: 'Label', id: 'cue', props: { text: '提示' }, layout: { fx: [{ kind: 'cue', ms: 1300 }] } },
    { type: 'Slider', id: 'slider', props: { min: 0, max: 2, value: 1, trackSkin: '/track.png', thumbSkin: '/thumb.png', motionMs: 150 } },
    ...(withModal ? [{ type: 'Modal' as const, id: 'modal', props: { title: '确认', closeAction: 'close', visual: { enter: 'lift-240' as const } }, children: [] }] : []),
  ],
});

describe('mountUI work-level reduced-motion policy', () => {
  it('keeps old calls unchanged, scopes work preference, and preserves actions/focusable controls', () => {
    const os = mockReducedMotion(false);
    const host = document.createElement('div'); document.body.append(host);
    let actions = 0;
    const handle = mountUI(host, motionTree(false), { go: () => { actions++; } });
    expect(host.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    handle.update(motionTree(false), undefined, { reducedMotion: true });
    expect(host.hasAttribute('data-apollo-reduced-motion')).toBe(true);
    const button = host.querySelector<HTMLButtonElement>('#go')!;
    button.click();
    expect(actions).toBe(1);
    expect(button.disabled).toBe(false);
    expect(host.querySelector<HTMLInputElement>('#slider input')).not.toBeNull();
    handle(); os.restore();
  });

  it('unions OS and work policy, updates live, and removes the OS observer on teardown', () => {
    const os = mockReducedMotion(false);
    const host = document.createElement('div'); document.body.append(host);
    const handle = mountUI(host, motionTree(), {}, undefined, undefined, { reducedMotion: false });
    expect(host.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    expect(os.listeners.size).toBe(1);
    os.set(true);
    expect(host.hasAttribute('data-apollo-reduced-motion')).toBe(true);
    handle.update(motionTree(), undefined, { reducedMotion: true });
    os.set(false);
    expect(host.hasAttribute('data-apollo-reduced-motion')).toBe(true);
    handle.update(motionTree(), undefined, { reducedMotion: false });
    expect(host.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    handle();
    expect(os.listeners.size).toBe(0);
    os.restore();
  });

  it('cleans an enabled host on teardown without leaking into another mounted work', () => {
    const os = mockReducedMotion(false);
    const first = document.createElement('div'), second = document.createElement('div'); document.body.append(first, second);
    const a = mountUI(first, motionTree(), {}, undefined, undefined, { reducedMotion: true });
    const b = mountUI(second, motionTree());
    expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(true);
    expect(second.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    a();
    expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    expect(second.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    b(); os.restore();
  });

  it('uses one scoped zero-duration rule for the closed PUI motion surface', () => {
    const os = mockReducedMotion(false);
    const host = document.createElement('div'); document.body.append(host);
    const handle = mountUI(host, motionTree(), {}, undefined, undefined, { reducedMotion: true });
    const css = document.getElementById('apollo-ui-keyframes')?.textContent ?? '';
    expect(css).toContain('[data-apollo-reduced-motion],[data-apollo-reduced-motion] *');
    expect(css).toContain('animation-duration:0ms!important');
    expect(css).toContain('transition-duration:0ms!important');
    expect(host.querySelector('#motion-root')?.getAttribute('style')).toContain('apollo-flyIn');
    expect(host.querySelector('#cue')?.getAttribute('style')).toContain('apollo-cue');
    expect(host.querySelector('[data-apollo-skin-feedback]')).not.toBeNull();
    expect(host.querySelector('[data-skin-slider-thumb]')).not.toBeNull();
    expect(host.querySelector('[data-modal-dialog]')?.getAttribute('style')).toContain('apollo-modal-lift');
    handle(); os.restore();
  });
});
