import { describe, expect, it } from 'vitest';
import { parseChestInput, resolveChest, toChestOutput } from '../src/chest.js';

const item = (itemId: string, quantity: object = { fixed: 1 }) => ({ type: 'item', itemId, quantity });
const valid = (): any => ({
  sessionId: 'test-session',
  tableId: 'test-table',
  rng: { algorithm: 'mulberry32-v1', seed: 1 },
  root: item('item'),
});

describe('loot chest v2 contract', () => {
  it('resolves an all node and aggregates repeated deterministic rewards', () => {
    const input = valid();
    input.root = {
      type: 'all',
      children: [
        item('gold', { fixed: 50 }),
        { type: 'repeat', count: 3, replacement: true, child: { type: 'choose', entries: [{ weight: 1, child: item('potion', { fixed: 2 }) }] } },
      ],
    };
    expect(resolveChest(parseChestInput(input)).rewards).toEqual([
      { itemId: 'gold', quantity: 50 },
      { itemId: 'potion', quantity: 6 },
    ]);
  });

  it('uses the same seed for the same result and supports no-drop branches', () => {
    const input = valid();
    input.root = { type: 'choose', entries: [{ weight: 1, child: item('gem') }, { weight: 9, child: { type: 'empty' } }] };
    expect(resolveChest(parseChestInput(input))).toEqual(resolveChest(parseChestInput(input)));
  });

  it('draws without replacement and never selects one entry twice', () => {
    const input = valid();
    input.root = {
      type: 'repeat', count: 3, replacement: false,
      child: { type: 'choose', entries: [{ weight: 1, child: item('a') }, { weight: 1, child: item('b') }, { weight: 1, child: item('c') }] },
    };
    const rewards = resolveChest(parseChestInput(input)).rewards;
    expect(rewards).toHaveLength(3);
    expect(new Set(rewards.map((reward) => reward.itemId)).size).toBe(3);
  });

  it('returns the declared output envelope', () => {
    const output = toChestOutput(resolveChest(parseChestInput(valid())));
    expect(output).toEqual({
      contract: 'doki.game.chest-result', version: 2,
      data: { sessionId: 'test-session', tableId: 'test-table', outcome: 'opened', rewards: [{ itemId: 'item', quantity: 1 }] },
    });
  });

  it('ignores caller-provided chest artwork while retaining the title', () => {
    const input = valid();
    input.chest = { name: '宿主宝箱', image: { src: 'https://example.test/override.png', alt: 'override' } };
    expect(parseChestInput(input).chest).toEqual({ name: '宿主宝箱' });
  });

  it.each([
    ['missing root', (() => { const input = valid(); delete input.root; return input; })()],
    ['unknown node', { ...valid(), root: { type: 'mystery' } }],
    ['zero weight', { ...valid(), root: { type: 'choose', entries: [{ weight: 0, child: item('x') }] } }],
    ['unsafe image', { ...valid(), root: { ...item('x'), image: { src: 'javascript:alert(1)' } } }],
    ['repeat exceeds entries', { ...valid(), root: { type: 'repeat', count: 2, replacement: false, child: { type: 'choose', entries: [{ weight: 1, child: item('x') }] } } }],
  ])('rejects %s', (_label, input) => expect(() => parseChestInput(input)).toThrow());
});
