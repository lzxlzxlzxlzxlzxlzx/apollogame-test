import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UITheme } from './types.js';

const skin = '/art/frame.png';

describe('9-slice source slice and display border width', () => {
  it.each([
    { type: 'Panel', id: 'panel', props: { skin, skinSlice: 115, skinBorderWidth: 58 }, children: [] },
    { type: 'Button', id: 'button', props: { label: '确认', skin, skinSlice: 115, skinBorderWidth: 36 } },
    { type: 'Modal', id: 'modal', props: { skin, skinSlice: 115, skinBorderWidth: 36 }, children: [] },
    { type: 'dialog', id: 'dialog', props: { skin, skinSlice: 115, skinBorderWidth: 58 } },
  ] as LayoutNode[])('$type separates 115px source slice from display width', (node) => {
    expect(validateLayoutNode(node)).toEqual([]);
    const html = renderNode(node);
    const width = (node.props as { skinBorderWidth: number }).skinBorderWidth;
    expect(html).toContain(`border-width:${width}px`);
    expect(html).toContain(`border-image:url('/art/frame.png') 115 fill / ${width}px / 0 stretch`);
  });

  it('keeps skinSlice-only HTML/CSS byte-compatible', () => {
    const html = renderNode({ type: 'Button', id: 'old', props: { label: '旧皮', skin, skinSlice: 8 } });
    expect(html).toContain('border-width:8px;border-image:url(\'/art/frame.png\') 8 fill / 8px / 0 stretch');
  });

  it('applies the same split contract to theme button skins', () => {
    const theme: UITheme = { ...SHELL, buttonSkins: { primary: { skin, skinSlice: 115, skinBorderWidth: 58 } } };
    const html = renderNode({ type: 'Button', id: 'theme', props: { label: '主题皮', kind: 'primary' } }, theme);
    expect(html).toContain('border-width:58px');
    expect(html).toContain("border-image:url('/art/frame.png') 115 fill / 58px / 0 stretch");
  });

  it.each([
    { skinBorderWidth: 0 }, { skinBorderWidth: -1 }, { skinBorderWidth: Number.NaN }, { skinBorderWidth: 8 }, { skin: '', skinSlice: 8, skinBorderWidth: 4 },
  ])('rejects invalid or detached output width %#', (props) => {
    const node: LayoutNode = { type: 'Panel', id: 'bad', props: { skin, ...props }, children: [] };
    expect(validateLayoutNode(node).some((issue) => issue.kind === 'bad-skin-border-width')).toBe(true);
  });
});
