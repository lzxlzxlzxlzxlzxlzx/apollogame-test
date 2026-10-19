import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAssetIndex } from '@zerocraft/engine/assets/index.js';
import { buildCardRevealBlueprint } from '../../../games/game-card-reveal/blueprint.js';
import indexRaw from '../../../public/games/game-card-reveal/art/index.json';
import ledger from '../../../public/games/game-card-reveal/art/art-ledger.json';
import pending from '../../../public/games/game-card-reveal/art/ai/pending.json';

const artRoot = fileURLToPath(new URL('../../../public/games/game-card-reveal/art/', import.meta.url));
const prefix = '/games/game-card-reveal/art/';

describe('S5 local art closure', () => {
  it('keeps every approved file indexed and every ledger row a real consumer', () => {
    const index = parseAssetIndex(indexRaw);
    const byKey = new Map(index.assets.map((entry) => [entry.id, entry]));
    const skinKeys = ledger.rows.map((row) => row.skinKey);
    expect(new Set(skinKeys).size).toBe(9);
    expect(ledger.count).toBe(9);
    expect(skinKeys).not.toContain('pack.back'); // approved inventory, no frozen P2–P5 back-face frame
    expect(byKey.has('pack.back')).toBe(true);
    expect(pending.pending).toEqual([]);

    for (const row of ledger.rows) {
      const entry = byKey.get(row.skinKey);
      expect(entry?.status).toBe('filled');
      expect(entry?.type).toBe('texture');
      expect(entry?.path).toBe(row.gen.servedPath);
      expect(entry?.spec?.width).toBe(row.spec.w);
      expect(entry?.spec?.height).toBe(row.spec.h);
      expect(row.slot.entity).toBeTruthy();
    }
    const indexedFiles = index.assets.map((entry) => entry.path).filter((path): path is string => typeof path === 'string');
    expect(indexedFiles).toHaveLength(10);
    for (const path of indexedFiles) {
      expect(path.startsWith(prefix)).toBe(true);
      expect(existsSync(resolve(artRoot, path.slice(prefix.length)))).toBe(true);
    }
    const physicalFiles = ['cards', 'textures'].flatMap((folder) => readdirSync(`${artRoot}/${folder}`).map((name) => `${prefix}${folder}/${name}`));
    expect(physicalFiles.sort()).toEqual(indexedFiles.sort());
  });

  it('matches frozen visible pack consumers without inventing a back-face entity', () => {
    const cards = [{ id: 'test', faceImageUrl: 'https://cards.example/card.png' }];
    const blueprint = buildCardRevealBlueprint(cards);
    const sprites = Object.values(blueprint.entities).flatMap((entity) => {
      const sprite = entity.Sprite as { textureKey?: string } | undefined;
      return sprite?.textureKey ? [sprite.textureKey] : [];
    });
    expect(sprites).toEqual(expect.arrayContaining(['pack.front', 'pack.tearTop', 'pack.tearBody', 'card.fallback', 'host-card:0']));
    expect(sprites).not.toContain('pack.back');
  });
});
