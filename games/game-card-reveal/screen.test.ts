import { describe, expect, it } from 'vitest';
import { renderNode } from '@zerocraft/engine/ui/components/index.js';
import { validateLayoutNode } from '@zerocraft/engine/ui/components/validate.js';
import { buildCardRevealScreen } from './screen.js';

describe('transparent card-reveal UI shell', () => {
  const states = [
    [{ status: 'playing', phase: 'P3' }, false, 'idle'],
    [{ status: 'paused', phase: 'P4' }, false, 'idle'],
    [{ status: 'terminal', phase: 'P5', completion: 'natural' }, false, 'retry'],
    [{ status: 'terminal', phase: 'P5', completion: 'natural' }, true, 'idle'],
  ] as const;
  it.each(states)('validates UI state %#', (view, preview, delivery) => {
    expect(validateLayoutNode(buildCardRevealScreen(view, preview, delivery))).toEqual([]);
  });
  it('renders no panel, label, button or action chrome', () => {
    const tree = buildCardRevealScreen({ status: 'playing', phase: 'P4' }, false, 'idle');
    expect(tree).toMatchObject({ type: 'Screen', id: 'reveal-ui-root', props: { fill: true, bg: 'transparent' }, children: [] });
    const html = renderNode(tree);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('data-action=');
    expect(html).not.toContain('reveal-controls-row');
    expect(html).not.toContain('星辉启封');
  });
  it('keeps loading, fallback and delivery states visually empty', () => {
    const idle = { status: 'idle', phase: 'idle' } as const;
    for (const [status, delivery, fallbackCount] of [['loading', 'idle', 0], ['error', 'retry', 0], ['ready', 'accepted', 2]] as const) {
      const tree = buildCardRevealScreen(idle, false, delivery, { status, fallbackCount });
      expect(validateLayoutNode(tree)).toEqual([]);
      const html = renderNode(tree);
      expect(html).not.toContain('<button');
      expect(html).not.toContain('<label');
      expect(html).not.toContain('加载');
      expect(html).not.toContain('回报');
    }
  });
});
