// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mountUI } from './server.js';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { UI_CATALOG } from './catalog.js';
import type { ButtonIconFeedback, LayoutNode } from './types.js';

const feedback: ButtonIconFeedback = {
  hover: { translateY: -3, brightness: 1.2, glowRadius: 5, glowColor: { custom: '#d6b6ef' } },
  pressed: { translateY: 3, brightness: 0.85 },
  disabled: { opacity: 0.48, grayscale: 0.7 },
  transitionMs: 120,
};
const node = (iconFeedback: unknown = feedback, disabled = false): LayoutNode => ({
  type: 'Button', id: 'feedback', props: { label: '任务日志', icon: '/games/icon.png', iconOnly: { size: 60 },
    kind: 'quiet', skin: '', borderWidth: 0, iconFeedback, disabled, action: 'open.quest' },
} as LayoutNode);
afterEach(() => document.body.replaceChildren());

describe('REQ-SIMLIFE-PUI-ICON-FEEDBACK-01', () => {
  it('is opt-in and leaves the unconfigured icon-only rendering unchanged', () => {
    const old = node(undefined);
    // Explicitly remove the new prop; omission, not an undefined-valued key, is the compatibility case.
    delete (old.props as Record<string, unknown>).iconFeedback;
    expect(renderNode(old)).not.toContain('data-apollo-icon-feedback');
    expect(validateLayoutNode(old)).toEqual([]);
    expect(validateLayoutNode(node())).toEqual([]);
    expect(renderNode(node())).toContain('data-apollo-icon-feedback');
    expect(renderNode(node())).toContain('--apollo-icon-hover-y:-3px');
    expect(renderNode(node())).toContain('--apollo-icon-disabled-opacity:0.48');
    expect(UI_CATALOG.find((entry) => entry.type === 'Button')?.props.some((prop) => prop.name === 'iconFeedback')).toBe(true);
  });

  it('rejects free fields, non-finite/out-of-range values and use without iconOnly', () => {
    for (const bad of [
      { ...feedback, css: 'transform:scale(2)' },
      { ...feedback, hover: { ...feedback.hover, translateY: -9 } },
      { ...feedback, hover: { ...feedback.hover, brightness: Number.NaN } },
      { ...feedback, hover: { ...feedback.hover, glowColor: { custom: 'url(javascript:evil)' } } },
      { ...feedback, pressed: { ...feedback.pressed, translateY: -1 } },
      { ...feedback, disabled: { ...feedback.disabled, opacity: 0 } },
      { ...feedback, disabled: { ...feedback.disabled, grayscale: 2 } },
      { ...feedback, transitionMs: Infinity },
    ]) expect(validateLayoutNode(node(bad)).length).toBeGreaterThan(0);
    const noMode = node(); delete (noMode.props as Record<string, unknown>).iconOnly;
    expect(validateLayoutNode(noMode).length).toBeGreaterThan(0);
    const mixed = node(); (mixed.props as Record<string, unknown>).skinFeedback = { hoverBrightness: 1 };
    expect(validateLayoutNode(mixed).length).toBeGreaterThan(0);
  });

  it('marks keyboard press visually without replacing native action/disabled semantics and clears on blur/unmount', () => {
    const host = document.createElement('div'); document.body.append(host);
    let actions = 0;
    const stop = mountUI(host, node(), { 'open.quest': () => { actions++; } });
    const button = host.querySelector<HTMLButtonElement>('#feedback')!;
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(button.hasAttribute('data-apollo-key-pressed')).toBe(true);
    button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    expect(button.hasAttribute('data-apollo-key-pressed')).toBe(false);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(button.hasAttribute('data-apollo-key-pressed')).toBe(false);
    button.click(); expect(actions).toBe(1);
    stop(); expect(host.querySelector('button')).toBeNull();
    const disabledHost = document.createElement('div'); document.body.append(disabledHost);
    const stopDisabled = mountUI(disabledHost, node(feedback, true), { 'open.quest': () => { actions++; } });
    const disabled = disabledHost.querySelector<HTMLButtonElement>('button')!;
    disabled.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(disabled.hasAttribute('data-apollo-key-pressed')).toBe(false);
    disabled.click(); expect(actions).toBe(1);
    stopDisabled();
  });
});
