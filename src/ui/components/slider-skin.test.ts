// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('Slider skin layers', () => {
  it.each([
    [0, '0.0000%'],
    [1, '50.0000%'],
    [2, '100.0000%'],
  ])('keeps the native range as input while binding value %i to the %s thumb position', (value, position) => {
    const html = renderNode({ type: 'Slider', id: 'lock', props: { min: 0, max: 2, step: 1, value, action: 'set', trackSkin: '/rail.png', thumbSkin: '/knob.png', thumbSize: 40, motionMs: 150 } });
    expect(html).toContain('data-skin-slider');
    expect(html).toContain(`left:calc(${position} - 20px)`);
    expect(html).toContain('data-skin-slider-thumb');
    expect(html).toContain('z-index:1');
    expect(html).toContain('opacity:0;cursor:pointer;pointer-events:auto;touch-action:none');
    expect(html).toContain('type="range"');
  });
  it('sanitizes skin URLs and bounds visual-only size and motion', () => {
    const html = renderNode({ type: 'Slider', id: 'safe', props: { value: 0, trackSkin: " /rail bad(')", thumbSkin: ' /knob bad.png ', thumbSize: 999, motionMs: 9999 } });
    expect(html).toContain("background:url('/railbad')");
    expect(html).toContain('src="/knobbad.png"');
    expect(html).toContain('width:128px;height:128px');
    expect(html).toContain('transition:left 2000ms ease');
  });
  it('does not alter the legacy native Slider without both skins', () => {
    const html = renderNode({ type: 'Slider', id: 'legacy', props: { value: 3, min: 0, max: 10 } });
    expect(html).not.toContain('data-skin-slider');
    expect(html).toContain('accent-color:');
  });
  it('keeps a terminal value visible while a disabled slider cannot receive input or dispatch', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const received: string[] = [];
    const handle = mountUI(host, {
      type: 'Slider', id: 'terminal', props: { min: 0, max: 2, value: 2, action: 'set', disabled: true, thumbSkin: '/knob.png', thumbSize: 40 },
    } as LayoutNode, { set: (arg) => received.push(arg ?? '') });
    const range = host.querySelector('input[type=range]') as HTMLInputElement;
    expect(range.disabled).toBe(true);
    expect(range.getAttribute('aria-disabled')).toBe('true');
    expect(range.dataset['action']).toBeUndefined();
    expect(range.style.pointerEvents).toBe('none');
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(received).toEqual([]);
    handle(); host.remove();
  });
  it('keeps keyboard and pointer/touch completion on the native range action channel', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const received: string[] = [];
    const handle = mountUI(host, {
      type: 'Slider', id: 'interactive', props: {
        min: 0, max: 2, step: 1, value: 0, action: 'lockpick.set',
        trackSkin: '/rail.png', thumbSkin: '/knob.png', thumbSize: 40, motionMs: 150,
      },
    } as LayoutNode, { 'lockpick.set': (arg) => received.push(arg ?? '') });
    const range = host.querySelector('input[type=range]') as HTMLInputElement;
    expect(range).toBeTruthy();
    expect(range.style.opacity).toBe('0');
    expect(range.tabIndex).toBe(0);
    range.focus();
    range.value = '1';
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    range.value = '2';
    range.dispatchEvent(new Event('pointerup', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(received).toEqual(['1', '2']);
    handle();
    host.remove();
  });
  it('follows a release-snap drag locally and commits exactly once after pointer release', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const received: string[] = [];
    const handle = mountUI(host, {
      type: 'Slider', id: 'snap', props: {
        min: 0, max: 2, step: 1, value: 0, action: 'lockpick.set', releaseSnap: true,
        trackSkin: '/rail.png', thumbSkin: '/knob.png', thumbSize: 40, motionMs: 150,
      },
    } as LayoutNode, { 'lockpick.set': (arg) => received.push(arg ?? '') });
    const range = host.querySelector('input[type=range]') as HTMLInputElement;
    Object.defineProperty(range, 'getBoundingClientRect', { value: () => ({ left: 100, width: 300 }) });
    const pointer = (type: string, x: number): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerId: { value: 7 }, clientX: { value: x } });
      return event;
    };
    range.dispatchEvent(pointer('pointerdown', 100));
    window.dispatchEvent(pointer('pointermove', 320));
    expect(received).toEqual([]);
    expect(range.value).not.toBe('0');
    window.dispatchEvent(pointer('pointerup', 400));
    expect(received).toEqual(['2']);
    expect(range.value).toBe('2');
    expect(host.querySelector<HTMLElement>('[data-skin-slider-thumb]')?.style.transitionDuration).toBe('150ms');
    handle();
    host.remove();
  });
});
