import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { UI_CATALOG } from './catalog.js';
import { SHELL } from '../shell-theme.js';
import type { ButtonStateColors, LayoutNode } from './types.js';

const stateColors: ButtonStateColors = {
  default: { background: { custom: 'rgba(16,26,54,0.81)' }, border: { custom: '#e4d6aa88' } },
  hover: { background: { custom: '#535c91' }, border: 'gold', text: 'text' },
  pressed: { background: 'sunken', border: 'gold', text: 'gold' },
  disabled: { background: 'ink', border: 'dim', text: 'dim' },
};

describe('Button.stateColors', () => {
  it('is documented in the catalog and validates a complete four-state palette', () => {
    expect(UI_CATALOG.find((spec) => spec.type === 'Button')?.props.some((prop) => prop.name === 'stateColors')).toBe(true);
    const node: LayoutNode = { type: 'Button', id: 'ghost', props: { label: '回想', kind: 'ghost', shape: 'pill', stateColors, action: 'open.memory' } };
    expect(validateLayoutNode(node)).toEqual([]);
    const html = renderNode(node);
    expect(html).toContain('data-apollo-state-colors');
    expect(html).toContain('--apollo-btn-default-bg:rgba(16,26,54,0.81)');
    expect(html).toContain('--apollo-btn-default-border:#e4d6aa88');
    expect(html).toContain('--apollo-btn-hover-bg:#535c91');
    expect(html).toContain('--apollo-btn-pressed-text:#d4bd8a');
    expect(html).toContain('data-action="open.memory"');
    expect(html).toContain('border-radius:999px');
  });

  it('uses labelColor as text fallback and keeps unstyled old buttons byte-for-byte', () => {
    const legacy: LayoutNode = { type: 'Button', id: 'old', props: { label: '旧', kind: 'ghost' } };
    const before = renderNode(legacy);
    expect(before).not.toContain('data-apollo-state-colors');
    expect(before).not.toContain('--apollo-btn-');
    const palette = renderNode({ type: 'Button', id: 'new', props: { label: '新', kind: 'ghost', labelColor: { custom: '#F4EEFF' }, stateColors } });
    expect(palette).toContain('--apollo-btn-default-text:#F4EEFF');
    expect(palette).toContain('--apollo-btn-hover-text:#e6e6f4');
    expect(renderNode(legacy)).toBe(before);
    const themed = { ...SHELL, buttonSkins: { ghost: { skin: '/art/theme-ghost.png' } } };
    expect(renderNode(legacy, themed)).toContain('data-apollo-skin');
    expect(renderNode({ type: 'Button', id: 'new-themed', props: { label: '状态优先', kind: 'ghost', stateColors } }, themed)).not.toContain('data-apollo-skin');
  });

  it('retains native disabled semantics without the legacy blanket opacity when a disabled palette is supplied', () => {
    const html = renderNode({ type: 'Button', id: 'off', props: { label: '关闭', kind: 'ghost', disabled: true, stateColors, action: 'noop' } });
    expect(html).toContain(' disabled');
    expect(html).toContain('opacity:1');
    expect(html).toContain('--apollo-btn-disabled-bg:');
  });

  it('rejects missing/extra states, unsafe colors and incompatible skin', () => {
    const bad = [
      { ...stateColors, pressed: undefined },
      { ...stateColors, extra: stateColors.default },
      { ...stateColors, hover: { ...stateColors.hover, background: { custom: '#fff;color:red' } } },
      { ...stateColors, hover: { ...stateColors.hover, border: '#ffffff' } },
      { ...stateColors, default: { ...stateColors.default, background: { custom: 'rgba(999,0,0,1)' } } },
      { ...stateColors, default: { ...stateColors.default, background: { custom: 'linear-gradient(red,blue)' } } },
    ];
    for (const palette of bad) {
      const issues = validateLayoutNode({ type: 'Button', id: 'bad', props: { label: 'x', stateColors: palette } } as never);
      expect(issues.some((issue) => issue.kind === 'bad-button-state-colors')).toBe(true);
    }
    expect(validateLayoutNode({ type: 'Button', id: 'bad-skin', props: { label: 'x', skin: '/art/key.png', stateColors } }).some((i) => i.kind === 'bad-button-state-colors')).toBe(true);
  });
});
