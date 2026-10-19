import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { UI_CATALOG } from './catalog.js';
import type { LayoutNode } from './types.js';
import { SHELL } from '../shell-theme.js';

const label = (props: Record<string, unknown>): LayoutNode => ({ type: 'Label', id: 'evidence-text', props: { text: '两行\n证据', ...props } } as LayoutNode);
const panel = (props: Record<string, unknown>): LayoutNode => ({ type: 'Panel', id: 'stamp', props: { bg: 'transparent', ...props }, layout: { radius: 0 }, children: [label({ text: '已收录', weight: 900 })] } as LayoutNode);

describe('GCI-S6-UI-03 constrained typography and transparent stamp border', () => {
  it('preserves old bytes and adds px line-height plus weight 900', () => {
    const old = renderNode(label({ bold: true }));
    expect(old).toContain('font-weight:700');
    expect(old).not.toContain('line-height:');
    const exact = label({ size: 19, bold: true, lineHeight: 30.4, weight: 900 });
    expect(validateLayoutNode(exact)).toEqual([]);
    expect(renderNode(exact)).toContain('font-weight:900;line-height:30.4px');
    expect(renderNode(label({ bold: true }))).toBe(old);
  });

  it('rejects invalid line-height, weight and direct-render CSS injection', () => {
    for (const props of [{ lineHeight: 7 }, { lineHeight: Infinity }, { lineHeight: '30;opacity:0' }, { weight: 800 }, { weight: '900;display:none' }]) {
      expect(validateLayoutNode(label(props)).length).toBeGreaterThan(0);
    }
    const html = renderNode(label({ lineHeight: '30;opacity:0', weight: '900;display:none' }));
    expect(html).not.toContain('opacity:0');
    expect(html).not.toContain('display:none');
  });

  it('draws a 5px exact red edge while the Panel center stays transparent', () => {
    const old = renderNode(panel({}));
    expect(old).toContain('border:1px solid');
    const exact = panel({ border: { width: 5, color: { custom: '#9d3e38' } } });
    expect(validateLayoutNode(exact)).toEqual([]);
    expect(renderNode(exact)).toContain('background:transparent;border:5px solid #9d3e38;border-radius:0px');
    const paperTheme = { ...SHELL, panelTexture: 'url(paper.png)' };
    expect(renderNode(exact, paperTheme)).toContain('background:transparent;border:5px solid #9d3e38');
    expect(renderNode(exact, paperTheme)).not.toContain('url(paper.png)');
    expect(renderNode(panel({}))).toBe(old);
  });

  it('rejects arbitrary CSS, alpha, bare and skin border combinations', () => {
    for (const props of [
      { border: { width: 25, color: 'gold' } },
      { border: { width: 5, color: { custom: '#ff000080' } } },
      { border: { width: 5, color: { custom: '#fff;display:none' } } },
      { border: { width: 5, color: 'gold', style: 'dotted' } },
      { border: { width: 5, color: 'gold' }, bare: true },
      { border: { width: 5, color: 'gold' }, skin: '/stamp.png' },
    ]) expect(validateLayoutNode(panel(props)).length).toBeGreaterThan(0);
    const html = renderNode(panel({ border: { width: '5;opacity:0', color: { custom: '#fff;display:none' } } }));
    expect(html).not.toContain('opacity:0');
    expect(html).not.toContain('display:none');
    expect(html).toContain('border:1px solid');
  });

  it('advertises fields in the catalog', () => {
    for (const [type, names] of [['Label', ['lineHeight', 'weight']], ['Panel', ['border']]] as const) {
      const fields = UI_CATALOG.find((entry) => entry.type === type)?.props.map((p) => p.name) ?? [];
      for (const name of names) expect(fields).toContain(name);
    }
  });
});
