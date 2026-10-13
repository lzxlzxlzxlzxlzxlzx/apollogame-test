import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';

describe('Label.color explicit custom contract', () => {
  it('accepts a safe explicit custom color and renders it', () => {
    const node = { type: 'Label' as const, id: 'custom', props: { text: '亮字', color: { custom: '#F4EEFF' } } };
    expect(validateLayoutNode(node)).toEqual([]);
    expect(renderNode(node)).toContain('color:#F4EEFF');
  });

  it('keeps closed color tokens valid but rejects a naked color string', () => {
    expect(validateLayoutNode({ type: 'Label', id: 'token', props: { text: '令牌', color: 'gold' } })).toEqual([]);
    expect(validateLayoutNode({ type: 'Label', id: 'naked', props: { text: '裸色', color: '#F4EEFF' as never } }).some((issue) => issue.kind === 'bad-enum')).toBe(true);
  });

  it('rejects injected or structurally widened custom values before rendering', () => {
    const injection = { type: 'Label', id: 'inject', props: { text: 'x', color: { custom: '#fff;color:red' } } } as never;
    const widened = { type: 'Label', id: 'wide', props: { text: 'x', color: { custom: '#fff', extra: 'no' } } } as never;
    expect(validateLayoutNode(injection).some((issue) => issue.kind === 'bad-custom-color')).toBe(true);
    expect(validateLayoutNode(widened).some((issue) => issue.kind === 'bad-custom-color')).toBe(true);
    expect(renderNode(injection)).not.toContain(';color:red');
  });
});
