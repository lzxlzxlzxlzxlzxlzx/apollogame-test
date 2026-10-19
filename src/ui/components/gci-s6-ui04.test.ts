import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import type { LayoutNode } from './types.js';
import { UI_CATALOG } from './catalog.js';

const modal = (visual?: Record<string, unknown>): LayoutNode => ({ type: 'Modal', id: 'complete', props: { title: '完成', ...(visual ? { visual } : {}) }, children: [{ type: 'Label', id: 'copy', props: { text: '线索已集齐' } }] } as LayoutNode);
const button = (props: Record<string, unknown> = {}): LayoutNode => ({ type: 'Button', id: 'restart', props: { label: '重新开始', kind: 'ghost', ...props } } as LayoutNode);

describe('GCI-S6-UI-04 opt-in chrome', () => {
  it('renders a translucent outer ring and dialog-only lift without moving the scrim', () => {
    const old = renderNode(modal());
    const exact = modal({ outerRing: { width: 12, color: '#d2a54c22' }, enter: 'lift-600' });
    expect(validateLayoutNode(exact)).toEqual([]);
    const html = renderNode(exact);
    expect(html).toContain('data-modal-scrim');
    expect(html).toContain('box-shadow:0 24px 70px rgba(0,0,0,0.7),0 0 0 12px #d2a54c22;animation:apollo-modal-lift 600ms');
    expect(html.split('data-modal-dialog')[0]).not.toContain('apollo-modal-lift');
    expect(renderNode(modal())).toBe(old);
  });

  it('rejects unsafe ring and freeform entrance values', () => {
    for (const visual of [
      { outerRing: { width: 12, color: '#d2a54c' } },
      { outerRing: { width: 30, color: '#d2a54c22' } },
      { outerRing: { width: 12, color: '#d2a54c00' } },
      { outerRing: { width: 12, color: '#d2a54c22;opacity:0' } },
      { enter: 'translateY(100px)' },
    ]) expect(validateLayoutNode(modal(visual)).length).toBeGreaterThan(0);
    expect(renderNode(modal({ outerRing: { width: 12, color: '#fff;opacity:0' } }))).not.toContain('opacity:0');
  });

  it('keeps accessible focus and measures non-skinned border with stateColors', () => {
    const old = renderNode(button());
    const colors = Object.fromEntries(['default', 'hover', 'pressed', 'disabled'].map((state) => [state, { background: 'transparent', border: 'ink' }]));
    const exact = button({ stateColors: colors, borderWidth: 2, focusRingVisual: { color: { custom: '#2eafc3' }, width: 3, offset: 3 } });
    expect(validateLayoutNode(exact)).toEqual([]);
    const html = renderNode(exact);
    expect(html).toContain('--apollo-btn-border-width:2px');
    expect(html).toContain('--apollo-focus-ring:#2eafc3;--apollo-focus-ring-width:3px;--apollo-focus-ring-offset:3px');
    expect(html).not.toContain('data-apollo-focus-ring="off"');
    expect(renderNode(button())).toBe(old);
    const explicitlyUnskinned = button({ skin: '', stateColors: colors, borderWidth: 2 });
    expect(validateLayoutNode(explicitlyUnskinned)).toEqual([]);
    expect(renderNode(explicitlyUnskinned)).toContain('--apollo-btn-border-width:2px');
  });

  it('rejects border/keyboard ring escapes and advertises fields', () => {
    for (const props of [
      { borderWidth: 9 }, { borderWidth: '2;display:none' }, { borderWidth: 2, skin: '/button.png' },
      { focusRing: false, focusRingVisual: { color: 'jade', width: 3, offset: 3 } },
      { focusRingVisual: { color: { custom: '#fff;display:none' }, width: 3, offset: 3 } },
      { focusRingVisual: { color: 'jade', width: 0, offset: 3 } },
      { focusRingVisual: { color: 'jade', width: 3, offset: 9 } },
    ]) expect(validateLayoutNode(button(props)).length).toBeGreaterThan(0);
    expect(UI_CATALOG.find((entry) => entry.type === 'Button')?.props.map((p) => p.name)).toEqual(expect.arrayContaining(['borderWidth', 'focusRingVisual']));
  });
});
