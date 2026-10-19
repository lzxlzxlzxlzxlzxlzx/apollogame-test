import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { UI_CATALOG } from './catalog.js';
import type { LayoutNode } from './types.js';

const modal = (props: Record<string, unknown> = {}): LayoutNode => ({
  type: 'Modal', id: 'paper-modal', props: { title: '证据', size: 'xl', closeAction: 'close', ...props },
  children: [{ type: 'Label', id: 'paper-copy', props: { text: '档案内容' } }],
} as LayoutNode);

describe('GCI-S6-UI-02 constrained visual slots', () => {
  it('preserves legacy modal bytes and native dialog semantics while drawing the paper frame', () => {
    const before = renderNode(modal());
    expect(before).toContain('background:rgba(0,0,0,0.9);');
    expect(before).toContain('width:800px;max-width:100%');
    const node = modal({
      visual: { width: 820, radius: 0, padding: { top: 26, right: 40, bottom: 26, left: 40 },
        fill: { gradient: { from: '#e7ddc2', to: '#bba875' } }, border: { width: 12, color: '#5d452e' } },
      scrim: { blur: 3 },
    });
    expect(validateLayoutNode(node)).toEqual([]);
    const html = renderNode(node);
    expect(html).toContain('background:rgba(0,0,0,0.9);backdrop-filter:blur(3px);');
    expect(html).toContain('width:820px;max-width:100%');
    expect(html).toContain('background:linear-gradient(145deg,#e7ddc2,#bba875)');
    expect(html).toContain('border:12px solid #5d452e;border-radius:0px;');
    expect(html).toContain('padding:26px 40px 26px 40px;');
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="paper-modal-title" tabindex="-1"');
    expect(html).toContain('data-modal-close="close"');
    expect(renderNode(modal())).toBe(before);
  });

  it('rejects non-opaque fill, injection, bad geometry, or uncontrolled scrim', () => {
    const invalid = [
      { visual: { width: 200 } }, { visual: { width: Infinity } }, { visual: { radius: -1 } },
      { visual: { padding: { top: 26, right: 40, bottom: 26 } } },
      { visual: { fill: { gradient: { from: '#e7ddc2', to: '#bba875aa' } } } },
      { visual: { fill: { gradient: { from: '#fff;display:none', to: '#000' } } } },
      { visual: { fill: { gradient: { from: '#fff', to: '#000', angle: 90 } } } },
      { visual: { border: { width: 12, color: 'red' } } },
      { scrim: { blur: 13 } }, { scrim: { blur: 3, opacity: 0.1 } },
    ];
    for (const props of invalid) expect(validateLayoutNode(modal(props)).length).toBeGreaterThan(0);
  });

  it('keeps direct render safe when a caller bypasses validation', () => {
    const html = renderNode(modal({ visual: { width: '820;opacity:0', radius: Infinity,
      padding: { top: '26;display:none', right: 40, bottom: 26, left: 40 },
      fill: { gradient: { from: '#fff;position:fixed', to: '#bba875' } },
      border: { width: '12;opacity:0', color: '#fff;display:none' } },
    scrim: { blur: '3;opacity:0' } }));
    expect(html).not.toContain('position:fixed,');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('opacity:0;');
    expect(html).toContain('width:800px;max-width:100%');
    expect(html).toContain('padding:22px 40px 26px 40px');
    expect(html).not.toContain('backdrop-filter:');
    const badButton = { type: 'Button', id: 'bad-btn', props: { label: 'x', labelSize: '16;opacity:0', labelWeight: '700;display:none' } } as unknown as LayoutNode;
    expect(renderNode(badButton)).toContain('font-size:12px;');
    expect(renderNode(badButton)).not.toContain('display:none');
    expect(renderNode(badButton)).not.toContain('opacity:0;');
  });

  it('top-crops a cover Image without changing the default object position', () => {
    const base: LayoutNode = { type: 'Image', id: 'evidence-img', props: { src: '/art/evidence.png', fit: 'cover' }, layout: { width: 702, height: 260 } };
    const old = renderNode(base);
    expect(old).not.toContain('object-position:');
    const top = { ...base, props: { ...base.props, position: 'top' } } as LayoutNode;
    expect(validateLayoutNode(top)).toEqual([]);
    expect(renderNode(top)).toContain('object-fit:cover;object-position:center top;');
    expect(renderNode(base)).toBe(old);
    expect(validateLayoutNode({ ...base, props: { ...base.props, position: 'bottom;opacity:0' } } as unknown as LayoutNode).length).toBeGreaterThan(0);
  });

  it('native Button gains bounded typography without changing action or old bytes', () => {
    const base: LayoutNode = { type: 'Button', id: 'collect', props: { label: '收录证据', kind: 'ghost', action: 'collect' } };
    const old = renderNode(base);
    expect(old).toContain('font-size:12px;');
    const sized = { ...base, props: { ...base.props, labelSize: 16, labelWeight: 700 } } as LayoutNode;
    expect(validateLayoutNode(sized)).toEqual([]);
    const html = renderNode(sized);
    expect(html).toContain('font-size:16px;');
    expect(html).toContain('font-weight:700');
    expect(html).toContain('data-action="collect"');
    expect(renderNode(base)).toBe(old);
    for (const props of [{ labelSize: 0 }, { labelSize: Infinity }, { labelWeight: 900 }, { labelWeight: 'bold' }]) {
      expect(validateLayoutNode({ ...base, props: { ...base.props, ...props } } as LayoutNode).length).toBeGreaterThan(0);
    }
  });

  it('advertises all added data fields in the catalog', () => {
    for (const [type, names] of [['Modal', ['visual', 'scrim']], ['Image', ['position']], ['Button', ['labelSize', 'labelWeight']]] as const) {
      const fields = UI_CATALOG.find((entry) => entry.type === type)?.props.map((prop) => prop.name) ?? [];
      for (const name of names) expect(fields).toContain(name);
    }
  });
});
