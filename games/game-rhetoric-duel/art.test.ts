import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAssetIndex } from '@zerocraft/engine/assets/asset-index.js';
import { pickArtOverrides } from '@zerocraft/engine/assets/game-art-load.js';
import { RHETORIC_CATALOG, RHETORIC_ENCOUNTERS } from './config.js';
import { RHETORIC_CARD_BACK_KEY } from './ui.js';

const indexPath = resolve('public/games/game-rhetoric-duel/art/index.json');
const ledgerPath = resolve('public/games/game-rhetoric-duel/art/art-ledger.json');
const raw = JSON.parse(readFileSync(indexPath, 'utf8')) as unknown;
const index = parseAssetIndex(raw);
const expected = new Set([
  ...RHETORIC_CATALOG.map((card) => card.skinKey),
  ...RHETORIC_ENCOUNTERS.flatMap((encounter) => [encounter.backgroundSkinKey, encounter.portraitSkinKey]),
  RHETORIC_CARD_BACK_KEY,
]);

describe('game-rhetoric-duel · W5 formal art inventory', () => {
  it('登记且仅登记全部 17 个正式消费槽，skinMap 按同一 key 解析', () => {
    expect(expected.size).toBe(17);
    expect(new Set(index.assets.map((entry) => entry.id))).toEqual(expected);
    expect(index.assets.every((entry) => entry.status === 'filled')).toBe(true);
    expect(Object.keys(pickArtOverrides(raw, 'game-rhetoric-duel')).sort()).toEqual([...expected].sort());
  });

  it('每条资产文件存在，来源/授权/哈希齐全且 provenance 哈希吻合磁盘', () => {
    for (const entry of index.assets) {
      expect(entry.path, entry.id).toMatch(/^\/games\/game-rhetoric-duel\/art\//);
      expect(entry.source, entry.id).toBeTruthy();
      expect(entry.license, entry.id).toBe('project-original');
      expect(entry.spec, entry.id).toMatchObject({ usage: 'sprite', colorSpace: 'srgb', wrap: 'clamp' });
      const file = resolve(`public${entry.path}`);
      expect(existsSync(file), entry.id).toBe(true);
      const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
      expect(entry.provenance?.sha256, entry.id).toBe(sha);
    }
  });

  it('art ledger 与 index 一一对应且零孤儿', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as { count: number; rows: Array<{ skinKey: string; slot?: unknown }> };
    expect(ledger.count).toBe(17);
    expect(new Set(ledger.rows.map((row) => row.skinKey))).toEqual(expected);
    expect(ledger.rows.every((row) => row.slot !== undefined)).toBe(true);
  });
});
