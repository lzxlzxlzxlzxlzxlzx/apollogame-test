// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mountUI } from './server.js';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { UI_CATALOG } from './catalog.js';
import type { LayoutNode } from './types.js';

const button = (icon?: string, disabled = false): LayoutNode => ({
  type: 'Button', id: 'entry', props: { label: '背包', icon, iconOnly: { size: 48 }, kind: 'primary', action: 'open.inventory', disabled },
});
afterEach(() => document.body.replaceChildren());

describe('REQ-SIMLIFE-PUI-ICON-BUTTON-01 · native icon-only Button', () => {
  it('keeps the old rendering unchanged and documents the additive closed field', () => {
    const old: LayoutNode = { type: 'Button', id: 'old', props: { label: '背包', icon: '/games/icon.png', action: 'open.inventory' } };
    expect(renderNode(old)).toContain('margin-right:6px');
    expect(renderNode(old)).not.toContain('data-apollo-icon-only');
    expect(UI_CATALOG.find((s) => s.type === 'Button')?.props.some((p) => p.name === 'iconOnly')).toBe(true);
    expect((UI_CATALOG.find((s) => s.type === 'Button')?.demo ?? []).filter((entry) => entry.note?.includes('iconOnly'))).toHaveLength(1);
    expect(validateLayoutNode(button('/games/icon.png'))).toEqual([]);
    expect(renderNode(button('/games/icon.png'))).toContain('<button type="button"');
    expect(renderNode(button('/games/icon.png'))).toContain('aria-label="背包"');
    for (const size of [60, 42]) {
      const sized: LayoutNode = { ...button('/games/icon.png'), props: { label: '背包', icon: '/games/icon.png', iconOnly: { size } } };
      expect(validateLayoutNode(sized)).toEqual([]);
      expect(renderNode(sized)).toContain(`width:${size}px;height:${size}px`);
    }
  });

  it('rejects malformed size, whitespace name, hidden focus and unsafe image URL while renderer falls back', () => {
    for (const iconOnly of [{ size: 23 }, { size: 65 }, { size: NaN }, { size: 48, css: 'bad' }, true]) {
      expect(validateLayoutNode({ ...button(), props: { label: '背包', iconOnly } } as never).length).toBeGreaterThan(0);
    }
    expect(validateLayoutNode({ ...button(), props: { label: '  ', iconOnly: { size: 48 } } } as never).some((i) => i.kind === 'missing-required')).toBe(true);
    expect(renderNode({ ...button(), props: { label: null, iconOnly: { size: 48 } } } as never)).toContain('aria-label="按钮"');
    expect(validateLayoutNode({ ...button(), props: { label: '背包', iconOnly: { size: 48 }, focusRing: false } } as never).length).toBeGreaterThan(0);
    expect(validateLayoutNode({ ...button(), props: { label: '背包', iconOnly: { size: 48 }, shape: 'pill' } } as never).length).toBeGreaterThan(0);
    for (const url of ['javascript:alert(1)', '//evil.test/icon.png', '/icon.png" onerror="alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>']) {
      expect(validateLayoutNode(button(url)).length).toBeGreaterThan(0);
      expect(renderNode(button(url))).not.toContain('data-apollo-icon-img');
      expect(renderNode(button(url))).toContain('data-apollo-icon-label');
    }
  });

  it('only hides fallback after current image load, and restores it after failure or update', () => {
    const host = document.createElement('div'); document.body.append(host);
    const actions: string[] = [];
    const stop = mountUI(host, button('/games/icon.png'), { 'open.inventory': () => actions.push('open') });
    const native = host.querySelector<HTMLButtonElement>('#entry')!;
    expect(native.tagName).toBe('BUTTON');
    expect(native.getAttribute('aria-label')).toBe('背包');
    expect(native.hasAttribute('data-apollo-icon-loaded')).toBe(false);
    expect(native.querySelector('[data-apollo-icon-label]')?.textContent).toBe('背包');
    const image = native.querySelector<HTMLImageElement>('img')!;
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 32 });
    Object.defineProperty(image, 'complete', { configurable: true, value: true });
    image.dispatchEvent(new Event('load'));
    expect(native.hasAttribute('data-apollo-icon-loaded')).toBe(true);
    native.click();
    expect(actions).toEqual(['open']);
    image.dispatchEvent(new Event('error'));
    expect(native.hasAttribute('data-apollo-icon-loaded')).toBe(false);
    stop.update(button('/games/other.png'));
    expect(host.querySelector('#entry')?.hasAttribute('data-apollo-icon-loaded')).toBe(false);
    stop.update(button());
    expect(host.querySelector('[data-apollo-icon-label]')?.textContent).toBe('背包');
    expect(host.querySelector('[data-apollo-icon-img]')).toBeNull();
    stop();
  });

  it('disabled never acts and separate mounts/teardown do not retain image state', () => {
    const a = document.createElement('div'); const b = document.createElement('div'); document.body.append(a, b);
    let calls = 0;
    const first = mountUI(a, button('/games/a.png', true), { 'open.inventory': () => { calls++; } });
    const second = mountUI(b, button('/games/b.png'), { 'open.inventory': () => { calls++; } });
    const disabled = a.querySelector<HTMLButtonElement>('button')!;
    expect(disabled.disabled).toBe(true);
    disabled.click();
    disabled.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls).toBe(0);
    first();
    expect(a.querySelector('button')).toBeNull();
    const enabled = b.querySelector<HTMLButtonElement>('button')!;
    expect(enabled.hasAttribute('data-apollo-icon-loaded')).toBe(false);
    enabled.click();
    expect(calls).toBe(1);
    second();
  });
});
