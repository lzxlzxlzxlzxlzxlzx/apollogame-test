import { describe, expect, it } from 'vitest';
import { validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { buildChestErrorScreen, buildChestScreen, CHEST_SKIN_KEYS, CHEST_SKIN_MAP, CHEST_THEME } from '../src/chest-screen.js';
import { parseChestInput, presentation, resolveChest } from '../src/chest.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';

const input = parseChestInput({
  sessionId: 'screen-test', tableId: 'screen-table', chest: { name: '测试宝箱' },
  rng: { algorithm: 'mulberry32-v1', seed: 9 },
  root: { type: 'item', itemId: 'gold', name: '金币', quantity: { fixed: 8 } },
});

function findNode(root: LayoutNode, id: string): LayoutNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

describe('loot chest LayoutNode screen', () => {
  it('keeps the DokiWorld iframe background fully transparent', () => {
    expect(CHEST_THEME.pageBg).toBe('transparent');
    expect(CHEST_THEME.texture).toBe('');
    expect(CHEST_THEME.wash).toBe('');
  });

  it('validates the automatic opening presentation', () => {
    expect(validateLayoutNode(buildChestScreen(input, 'closed', undefined, presentation(input)))).toEqual([]);
    expect(validateLayoutNode(buildChestScreen(input, 'opening', undefined, presentation(input)))).toEqual([]);
  });

  it('validates the revealed and SDK failure screens', () => {
    const result = resolveChest(input);
    expect(validateLayoutNode(buildChestScreen(input, 'revealed', result, presentation(input)))).toEqual([]);
    expect(validateLayoutNode(buildChestErrorScreen('bad input', 'session-1'))).toEqual([]);
  });

  it('shows the automatic chest opening without an input hotspot', () => {
    const closed = buildChestScreen(input, 'closed', undefined, presentation(input));
    const screen = buildChestScreen(input, 'opening', undefined, presentation(input));
    expect(findNode(closed, 'chest-image')?.props).toMatchObject({ src: CHEST_SKIN_MAP.get(CHEST_SKIN_KEYS.closed), alt: '即将开启的宝箱' });
    expect(findNode(screen, 'opening-copy')?.props).toMatchObject({ text: '宝箱正在开启……', size: 28, color: 'gold' });
    expect(findNode(screen, 'chest-opening-stars')?.type).toBe('Particles');
    expect(findNode(screen, 'qte-overlay')).toBeUndefined();
    expect(findNode(screen, 'qte-hit-area')).toBeUndefined();
  });

  it('keeps every approved visual connected through a named skin key', () => {
    expect([...Object.values(CHEST_SKIN_KEYS)].every((key) => CHEST_SKIN_MAP.has(key))).toBe(true);
    expect(CHEST_SKIN_MAP.get(CHEST_SKIN_KEYS.open)).toBe('./assets/treasure-chest-open.png');
  });

  it('centers the reward grid around its actual number of columns', () => {
    const result = resolveChest(input);
    const screen = buildChestScreen(input, 'revealed', result, presentation(input));
    const grid = findNode(screen, 'reward-grid');
    const columns = Math.max(1, Math.min(result.rewards.length, 4));

    expect(grid?.layout).toMatchObject({ cols: columns, width: Math.min(680, columns * 174) });
  });
});
