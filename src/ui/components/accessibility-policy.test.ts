// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { accessibilityTheme, mountUI } from './server.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UIScale } from './types.js';

afterEach(() => document.body.replaceChildren());

const tree = (withModal = true): LayoutNode => ({
  type: 'Panel', id: 'access-root', props: { title: 'Accessibility' }, layout: { direction: 'column', gap: 8 }, children: [
    { type: 'Label', id: 'access-copy', props: { text: 'Readable', color: 'dim' } },
    { type: 'Button', id: 'access-action', props: { label: 'Continue', action: 'continue' } },
    ...(withModal ? [{ type: 'Modal' as const, id: 'access-modal', props: { title: 'Confirm', closeAction: 'close' }, children: [] }] : []),
  ],
});

describe('REQ-GAL-PUI-ACCESSIBILITY-POLICY-01 · work accessibility policy', () => {
  it('keeps old mounts byte-compatible and makes only closed scale tokens effective', () => {
    const host = document.createElement('div'); document.body.append(host);
    const stop = mountUI(host, tree());
    expect(host.hasAttribute('data-apollo-high-contrast')).toBe(false);
    expect(host.hasAttribute('data-apollo-ui-scale')).toBe(false);
    expect(host.style.zoom).toBe('');
    stop();

    for (const [scale, zoom] of [['90', '0.9'], ['100', ''], ['110', '1.1']] as const) {
      const scaled = document.createElement('div'); document.body.append(scaled);
      const unmount = mountUI(scaled, tree(), {}, undefined, undefined, undefined, { scale });
      expect(scaled.style.zoom).toBe(zoom);
      expect(scaled.getAttribute('data-apollo-ui-scale')).toBe(scale === '100' ? null : scale);
      unmount();
      expect(scaled.style.zoom).toBe('');
    }
  });

  it('applies high contrast after the theme, preserves focusable controls, and hot-updates without actions changing', () => {
    const host = document.createElement('div'); document.body.append(host);
    let actions = 0;
    const handle = mountUI(host, tree(false), { continue: () => { actions++; } }, SHELL, undefined, undefined, { highContrast: true, scale: '90' });
    expect(host.hasAttribute('data-apollo-high-contrast')).toBe(true);
    expect(host.style.zoom).toBe('0.9');
    expect(host.querySelector('#access-copy')?.getAttribute('style')).toContain('#e6e6e6');
    const button = host.querySelector<HTMLButtonElement>('#access-action')!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(actions).toBe(1);
    handle.update(tree(), undefined, undefined, { highContrast: true, scale: '90' });
    expect(host.querySelector('[data-modal-dialog]')).not.toBeNull();

    handle.update(tree(), undefined, undefined, { highContrast: false, scale: '110' });
    expect(host.hasAttribute('data-apollo-high-contrast')).toBe(false);
    expect(host.style.zoom).toBe('1.1');
    expect(host.querySelector('#access-copy')?.getAttribute('style')).toContain(SHELL.dim);
    handle();
  });

  it('has a single semantic palette and does not convert custom art escapes into a CSS filter', () => {
    const contrast = accessibilityTheme(SHELL, { highContrast: true });
    expect(contrast.text).toBe('#ffffff');
    expect(contrast.bg0).toBe('#000000');
    expect(contrast.fontUi).toBe(SHELL.fontUi);
    expect(contrast.fontMono).toBe(SHELL.fontMono);
    expect(accessibilityTheme(SHELL)).toBe(SHELL);
    const invalid = '125' as UIScale;
    const host = document.createElement('div'); document.body.append(host);
    const stop = mountUI(host, tree(), {}, undefined, undefined, undefined, { scale: invalid });
    expect(host.style.zoom).toBe('');
    stop();
  });

  it('keeps mounts isolated and restores a caller zoom after teardown', () => {
    const first = document.createElement('div'); first.style.zoom = '1.25';
    const second = document.createElement('div'); document.body.append(first, second);
    const a = mountUI(first, tree(), {}, undefined, undefined, undefined, { highContrast: true, scale: '110' });
    const b = mountUI(second, tree());
    expect(first.style.zoom).toBe('1.1');
    expect(second.style.zoom).toBe('');
    a();
    expect(first.style.zoom).toBe('1.25');
    expect(first.hasAttribute('data-apollo-high-contrast')).toBe(false);
    b();
  });
});
