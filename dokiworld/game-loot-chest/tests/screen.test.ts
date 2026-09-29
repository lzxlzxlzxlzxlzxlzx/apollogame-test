import { describe, expect, it } from 'vitest';
import { validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { buildChestErrorScreen, buildChestScreen, CHEST_SKIN_KEYS, CHEST_SKIN_MAP } from '../src/chest-screen.js';
import { parseChestInput, presentation, resolveChest } from '../src/chest.js';
import type { ChestQteSnapshot } from '../src/qte-session.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';

const input = parseChestInput({
  sessionId: 'screen-test', tableId: 'screen-table', chest: { name: '测试宝箱' },
  rng: { algorithm: 'mulberry32-v1', seed: 9 },
  root: { type: 'item', itemId: 'gold', name: '金币', quantity: { fixed: 8 } },
});

function qte(phase: ChestQteSnapshot['phase'], patch: Partial<ChestQteSnapshot> = {}): ChestQteSnapshot {
  return { phase, feedback: 'idle', locks: 0, misses: 0, attempts: 0, elapsed: 0, duration: 100, ...patch };
}

function findNode(root: LayoutNode, id: string): LayoutNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

describe('loot chest LayoutNode screen', () => {
  it.each([
    ['ready', qte('ready')],
    ['playing', qte('playing', { elapsed: 54, locks: 1 })],
    ['assisted', qte('playing', { elapsed: 41, misses: 3, attempts: 3, feedback: 'miss' })],
    ['opening', qte('opening', { locks: 3 })],
  ] as const)('validates the %s screen', (_name, snapshot) => {
    expect(validateLayoutNode(buildChestScreen(input, snapshot, undefined, presentation(input)))).toEqual([]);
  });

  it('validates the revealed and SDK failure screens', () => {
    const result = resolveChest(input);
    expect(validateLayoutNode(buildChestScreen(input, qte('revealed', { locks: 3 }), result, presentation(input)))).toEqual([]);
    expect(validateLayoutNode(buildChestErrorScreen('bad input', 'session-1'))).toEqual([]);
  });

  it('keeps the QTE focal area large and uses a directional needle', () => {
    const screen = buildChestScreen(input, qte('playing', { elapsed: 54, locks: 1 }), undefined, presentation(input));
    const overlay = findNode(screen, 'qte-overlay');
    const needle = findNode(screen, 'qte-needle');
    const center = findNode(screen, 'qte-dial-center');
    const hitArea = findNode(screen, 'qte-hit-area');
    const instruction = findNode(screen, 'qte-instruction');

    expect(overlay?.layout?.width).toBeGreaterThanOrEqual(264);
    expect(overlay?.layout?.height).toBeGreaterThanOrEqual(264);
    expect(needle?.type).toBe('Image');
    expect(needle?.props).toMatchObject({ src: CHEST_SKIN_MAP.get(CHEST_SKIN_KEYS.qteNeedle), fit: 'contain' });
    expect(needle?.layout?.rotate).toBe(180);
    expect(center?.props).toMatchObject({ bg: 'sunken', edge: 'gold' });
    expect(center?.layout?.width).toBe(146);
    expect(overlay?.props).not.toHaveProperty('action');
    expect(hitArea?.props).toMatchObject({ bare: true, action: 'chest.qte.attempt' });
    expect(hitArea?.layout).toMatchObject({ x: 0, y: 0, width: 264, height: 264 });
    expect(overlay?.children?.at(-1)?.id).toBe('qte-hit-area');
    expect(instruction?.props).toMatchObject({ size: 28, color: 'text' });
  });

  it('keeps every approved visual connected through a named skin key', () => {
    expect([...Object.values(CHEST_SKIN_KEYS)].every((key) => CHEST_SKIN_MAP.has(key))).toBe(true);
    expect(CHEST_SKIN_MAP.get(CHEST_SKIN_KEYS.qteDial)).toBe('./assets/ai/openai/qte-dial-face.png');
  });

  it('centers the reward grid around its actual number of columns', () => {
    const result = resolveChest(input);
    const screen = buildChestScreen(input, qte('revealed', { locks: 3 }), result, presentation(input));
    const grid = findNode(screen, 'reward-grid');
    const columns = Math.max(1, Math.min(result.rewards.length, 4));

    expect(grid?.layout).toMatchObject({ cols: columns, width: Math.min(680, columns * 174) });
  });
});
