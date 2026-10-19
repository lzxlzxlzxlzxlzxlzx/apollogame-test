// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { mountUI } from './server.js';
import { validateLayoutNode } from './validate.js';
import type { LayoutNode, ToggleVisual, ActionSink } from './types.js';

const visual: ToggleVisual = {
  width: 75, height: 31, knobSize: 22, knobOffLeft: 4, knobOnLeft: 46, knobTop: 3,
  offBackground: { custom: '#1b2445' }, onBackground: { custom: '#5b679e' }, border: { custom: '#d8c389' },
  offKnob: { custom: '#8b9ac3' }, onKnob: { custom: '#eff1ff' },
};
const node = (checked = false, disabled = false, skin: ToggleVisual = visual): LayoutNode => ({
  type: 'Toggle', id: 'switch', props: { label: '自动语音', checked, disabled, action: 'toggle.voice', visual: skin },
});

describe('Toggle.visual opt-in measured skin', () => {
  it('preserves the default Toggle render byte-for-byte when absent', () => {
    const legacy: LayoutNode = { type: 'Toggle', id: 'switch', props: { label: '自动语音', checked: false, action: 'toggle.voice' } };
    expect(renderNode(legacy)).toBe(renderNode({ ...legacy, props: { ...legacy.props, visual: undefined } } as LayoutNode));
    expect(renderNode(legacy)).toContain('width:36px;height:20px');
    expect(renderNode(legacy)).not.toContain('data-apollo-toggle-track');
  });

  it.each([[false, '#1b2445', '#8b9ac3', '4px'], [true, '#5b679e', '#eff1ff', '46px']])('renders measured checked=%s without changing checkbox', (checked, background, knob, left) => {
    const n = node(checked);
    expect(validateLayoutNode(n)).toEqual([]);
    const html = renderNode(n);
    expect(html).toContain('width:75px;height:31px');
    expect(html).toContain('width:22px;height:22px');
    expect(html).toContain(`background:${background}`);
    expect(html).toContain(`background:${knob}`);
    expect(html).toContain(`left:${left}`);
    expect(html).toContain('border:1px solid #d8c389');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain(checked ? 'checked ' : 'data-action="toggle.voice"');
  });

  it('hides only visual-path text and keeps the checkbox named by the escaped label', () => {
    const hidden = node(false, false, { ...visual, showLabel: false });
    expect(validateLayoutNode(hidden)).toEqual([]);
    const html = renderNode(hidden);
    expect(html).toContain('aria-label="自动语音"');
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(host.querySelector('label')?.textContent?.trim()).toBe('');
    expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('自动语音');
    const shown = renderNode(node(false, false, { ...visual, showLabel: true }));
    expect(shown).toBe(renderNode(node()));
    expect(shown).not.toContain('aria-label=');
    const quoted = renderNode({ type: 'Toggle', id: 'quoted', props: { label: '语音 "开关"', visual: { ...visual, showLabel: false } } });
    expect(quoted).toContain('aria-label="语音 &quot;开关&quot;"');
  });

  it('rejects hidden visual text without a real accessible name or with non-boolean control', () => {
    for (const label of ['', '   ', '\t\n']) {
      const invalid: LayoutNode = { type: 'Toggle', id: 'nameless', props: { label, visual: { ...visual, showLabel: false } } };
      expect(validateLayoutNode(invalid).some((issue) => issue.kind === 'bad-toggle-visual')).toBe(true);
    }
    expect(validateLayoutNode(node(false, false, { ...visual, showLabel: 'false' } as unknown as ToggleVisual)).some((issue) => issue.kind === 'bad-toggle-visual')).toBe(true);
  });

  it('rejects malformed geometry, unknown fields, and unsafe color before render', () => {
    const cases: ToggleVisual[] = [
      { ...visual, knobOnLeft: 60 },
      { ...visual, height: 20 },
      { ...visual, offBackground: { custom: 'url(evil)' } },
      { ...visual, border: { custom: '#fff;opacity:0' } },
      { ...visual, width: Number.NaN },
      { ...visual, extra: true } as unknown as ToggleVisual,
      { ...visual, onKnob: { custom: 'rgb(999,0,0)' } },
    ];
    for (const skin of cases) expect(validateLayoutNode(node(false, false, skin)).some((i) => i.kind === 'bad-toggle-visual')).toBe(true);
  });

  it('does not interpolate malformed runtime numeric CSS when a caller bypasses validation', () => {
    const unsafe = { ...visual, width: '75;position:absolute' } as unknown as ToggleVisual;
    expect(validateLayoutNode(node(false, false, unsafe)).some((i) => i.kind === 'bad-toggle-visual')).toBe(true);
    const html = renderNode(node(false, false, unsafe));
    expect(html).not.toContain('75;position:absolute');
    expect(html).toContain('width:0px;height:31px');
  });

  it.each([false, true])('keeps native ActionSink and disabled contract at checked=%s', (checked) => {
    const host = document.createElement('div');
    document.body.append(host);
    const calls: Array<[string, string | undefined]> = [];
    const sink: ActionSink = { enqueueAction(name, value) { calls.push([name, value?.arg]); } };
    const view = mountUI(host, node(checked, false, { ...visual, showLabel: false }), {}, undefined, sink);
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    input.checked = !checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(calls).toEqual([['toggle.voice', String(!checked)]]);
    view();
    host.remove();

    const disabledHost = document.createElement('div');
    document.body.append(disabledHost);
    const disabledView = mountUI(disabledHost, node(checked, true, { ...visual, showLabel: false }), {}, undefined, sink);
    const disabledInput = disabledHost.querySelector('input') as HTMLInputElement;
    expect(disabledInput.disabled).toBe(true);
    expect(disabledInput.tabIndex).toBe(-1);
    expect(disabledInput.getAttribute('aria-label')).toBe('自动语音');
    disabledInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(calls).toHaveLength(1);
    expect(disabledHost.querySelector('[data-apollo-toggle-track]')).not.toBeNull();
    disabledView();
    disabledHost.remove();
  });
});
