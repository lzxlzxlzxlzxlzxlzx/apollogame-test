import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { UI_CATALOG } from './catalog.js';
import type { LayoutNode } from './types.js';

const modal = (visual?: unknown): LayoutNode => ({ type: 'Modal', id: 'v2-modal', props: {
  title: '确认', size: 'xl', closeAction: 'close', ...(visual === undefined ? {} : { visual }),
}, children: [{ type: 'Label', id: 'v2-body', props: { text: '内容' } }] } as LayoutNode);
const button = (skinFeedback?: unknown): LayoutNode => ({ type: 'Button', id: 'v2-btn', props: {
  label: '开始', skin: '/art/button.png', action: 'start', ...(skinFeedback === undefined ? {} : { skinFeedback }),
} } as LayoutNode);
const feedback = { hoverBrightness: 1.32, pressedBrightness: 0.85, glowRadius: 8,
  glowColor: { custom: '#a7b2ff99' }, transitionMs: 160 };

describe('GAL V2 generic PUI visual slots', () => {
  it('keeps Modal default bytes and provides a measured frame without replacing semantics', () => {
    const old = renderNode(modal());
    expect(renderNode(modal(undefined))).toBe(old);
    expect(old).not.toContain('min-height:310px');
    const sized = modal({ minHeight: 310, padding: 22, titleSize: 30, titleAlign: 'center', contentAlign: 'center' });
    expect(validateLayoutNode(sized)).toEqual([]);
    const html = renderNode(sized);
    expect(html).toContain('width:800px;max-width:100%;min-height:310px');
    expect(html).toContain('font-size:30px');
    expect(html).toContain('padding-left:26px;text-align:center');
    expect(html).toContain('data-modal-content style="text-align:center"');
    expect(html).toContain('aria-labelledby="v2-modal-title"');
    expect(html).toContain('data-modal-close="close"');
    expect(html).toContain('tabindex="-1"');
    expect(UI_CATALOG.find((x) => x.type === 'Modal')?.props.some((x) => x.name === 'visual')).toBe(true);
  });

  it('rejects non-closed or unsafe Modal visuals', () => {
    for (const visual of [{}, { minHeight: Infinity }, { titleSize: 0 }, { padding: 81 },
      { titleAlign: 'justify' }, { contentAlign: 'right' }, { css: 'display:none' }, []]) {
      expect(validateLayoutNode(modal(visual)).some((x) => x.kind === 'bad-modal-visual')).toBe(true);
    }
  });

  it('renders cue as a distinct 1300ms effect, preserving old pulse', () => {
    const cue: LayoutNode = { type: 'Label', id: 'cue', props: { text: '提示' }, layout: { fx: [{ kind: 'cue', ms: 1300 }] } };
    expect(validateLayoutNode(cue)).toEqual([]);
    expect(renderNode(cue)).toContain('apollo-cue 1300ms ease-in-out infinite');
    expect(renderNode({ ...cue, layout: { fx: [{ kind: 'pulse' }] } })).toContain('apollo-pulse 1600ms ease-in-out infinite');
    for (const effect of [{ kind: 'cue', ms: 0 }, { kind: 'cue', ms: NaN }, { kind: 'cue', color: 'gold' }, { kind: 'cue', intensity: 2 }]) {
      expect(validateLayoutNode({ ...cue, layout: { fx: [effect] } } as LayoutNode).some((x) => x.kind === 'bad-cue')).toBe(true);
    }
  });

  it('keeps Button default bytes and restricts feedback to safe skinned buttons', () => {
    const old = renderNode(button());
    expect(renderNode(button(undefined))).toBe(old);
    expect(old).not.toContain('data-apollo-skin-feedback');
    expect(validateLayoutNode(button(feedback))).toEqual([]);
    const html = renderNode(button(feedback));
    expect(html).toContain('data-apollo-skin-feedback');
    expect(html).toContain('--apollo-skin-hover-brightness:1.32');
    expect(html).toContain('--apollo-skin-glow-radius:8px');
    expect(html).toContain('--apollo-skin-glow-color:#a7b2ff99');
    expect(html).toContain('--apollo-skin-transition:160ms');
    expect(html).toContain('data-action="start"');
    expect(UI_CATALOG.find((x) => x.type === 'Button')?.props.some((x) => x.name === 'skinFeedback')).toBe(true);
    for (const bad of [{ ...feedback, hoverBrightness: 3 }, { ...feedback, pressedBrightness: Infinity },
      { ...feedback, glowRadius: -1 }, { ...feedback, transitionMs: 501 },
      { ...feedback, glowColor: { custom: '#fff; color:red' } }, { ...feedback, glowColor: 'red' },
      { ...feedback, css: 'filter:none' }, { hoverBrightness: 1.32 }]) {
      expect(validateLayoutNode(button(bad)).some((x) => x.kind === 'bad-skin-feedback')).toBe(true);
    }
    expect(validateLayoutNode({ ...button(feedback), props: { label: 'x', skin: '', skinFeedback: feedback } } as LayoutNode)
      .some((x) => x.kind === 'bad-skin-feedback')).toBe(true);
  });
});
