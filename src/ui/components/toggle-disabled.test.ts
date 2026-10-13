// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { mountUI } from './server.js';
import { validateLayoutNode } from './validate.js';
import type { LayoutNode, ActionSink } from './types.js';

function mountToggle(checked: boolean, disabled?: boolean) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const calls: Array<{ name: string; arg?: string }> = [];
  const sink: ActionSink = { enqueueAction(name, value) { calls.push({ name, arg: value?.arg }); } };
  const stop = mountUI(host, { type: 'Toggle', id: 'toggle', props: { label: '确认', checked, action: 'confirm.toggle', disabled } } as LayoutNode, {}, undefined, sink);
  return { host, calls, stop: () => { stop(); host.remove(); } };
}

describe('Toggle.disabled', () => {
  it.each([[false], [true]])('keeps checked=%s visible while disabled removes native focus and action wiring', (checked) => {
    const node: LayoutNode = { type: 'Toggle', id: 'toggle', props: { label: '确认', checked, action: 'confirm.toggle', disabled: true } };
    expect(validateLayoutNode(node)).toEqual([]);
    const html = renderNode(node);
    expect(html).toContain('disabled aria-disabled="true"');
    expect(html).not.toContain('data-action="confirm.toggle"');
    expect(html).toContain(checked ? 'left:18px' : 'left:2px');
    const view = mountToggle(checked, true);
    const input = view.host.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.tabIndex).toBe(-1);
    input.checked = !checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    input.dispatchEvent(new Event('click', { bubbles: true }));
    input.dispatchEvent(new Event('pointerup', { bubbles: true }));
    input.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(view.calls).toEqual([]);
    view.stop();
  });

  it.each([[false], [true]])('keeps enabled checked=%s Toggle action contract unchanged', (checked) => {
    const view = mountToggle(checked);
    const input = view.host.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.tabIndex).toBe(0);
    input.checked = !checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(view.calls).toEqual([{ name: 'confirm.toggle', arg: String(!checked) }]);
    view.stop();
  });
});
