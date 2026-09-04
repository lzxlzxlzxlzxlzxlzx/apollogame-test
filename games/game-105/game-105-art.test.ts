import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAssetIndex } from '@zerocraft/engine/assets/asset-index.js';
import { pickArtOverrides } from '@zerocraft/engine/assets/game-art-load.js';
import { GAME105_SKINS } from './game-105-art.js';

const index = JSON.parse(readFileSync(new URL('../../public/games/game-105/art/index.json', import.meta.url), 'utf8'));

describe('S6 art contract', () => {
  it('registers every sanctioned skin key as a filled, replaceable asset', () => {
    const parsed = parseAssetIndex(index);
    const ids = new Set(parsed.assets.map((asset) => asset.id));
    expect(Object.values(GAME105_SKINS).every((key) => ids.has(key))).toBe(true);
    expect(pickArtOverrides(index, 'game-105')).toMatchObject({
      [GAME105_SKINS.sceneNightRoom]: '/games/game-105/art/scene/night-room.jpeg',
      [GAME105_SKINS.tableOak]: '/games/game-105/art/table/oak.svg',
    });
  });

  it('does not register prohibited prediction, outcome, currency, or memory art', () => {
    const raw = JSON.stringify(index).toLowerCase();
    for (const forbidden of ['bar-fill-stable', 'bar-fill-think', 'banner-win', 'banner-lose', 'banner-warn', 'icon-coin', 'obj-mail', 'obj-record', 'btn-gold-m']) {
      expect(raw).not.toContain(forbidden);
    }
  });
});
