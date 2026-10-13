import { describe, expect, it } from 'vitest';
import { parseAssetIndex, validateAssetSlotClosure, validateAssetSlotManifest } from '@zerocraft/engine/assets/index.js';
import localIndex from '../../public/games/game-simlife/art/index.json';
import rawLife from './little-valley.life.json';
import { createLifeDemoSession, LITTLE_VALLEY_ASSET_SLOTS, LITTLE_VALLEY_VISUAL_CATALOG } from './game-simlife.js';

function skinKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(skinKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => key.toLowerCase().endsWith('skinkey') && typeof child === 'string' ? [child] : skinKeys(child));
}

describe('Little Valley AssetSlotBrief vertical slice', () => {
  it('closes every Life visual key while keeping the two new surface candidates pending human asset review', () => {
    const keys = [...new Set(skinKeys(rawLife))].sort();
    expect(validateAssetSlotManifest(LITTLE_VALLEY_ASSET_SLOTS)).toEqual([]);
    expect(validateAssetSlotClosure(LITTLE_VALLEY_ASSET_SLOTS, { 'little-valley.life.json': rawLife }, parseAssetIndex(localIndex), keys)).toEqual([
      { path: 'slot:little-valley.tile.farmable-earth', code: 'missing_asset', message: 'art:little-valley:tile:farmable-earth must resolve to a filled texture' },
      { path: 'slot:little-valley.tile.watered-soil', code: 'missing_asset', message: 'art:little-valley:tile:watered-soil must resolve to a filled texture' },
    ]);
    expect(LITTLE_VALLEY_ASSET_SLOTS.slots).toHaveLength(23);
    expect(skinKeys(rawLife)).toHaveLength(26); // two dynamic surfaces plus the return landmark reuse are explicit consumers
  });

  it('provides render-only rules for tile/crop/player/NPC/building/resource without leaking authoring metadata', () => {
    const consumerKeys = [...new Set(skinKeys(rawLife))].sort();
    expect([...LITTLE_VALLEY_VISUAL_CATALOG.keys()].sort()).toEqual(consumerKeys);
    const kinds = new Set([...LITTLE_VALLEY_VISUAL_CATALOG.values()].map((rule) => rule.kind));
    expect([...kinds]).toEqual(expect.arrayContaining(['tile', 'crop', 'player', 'npc', 'building', 'resource']));
    for (const rule of LITTLE_VALLEY_VISUAL_CATALOG.values()) {
      const renderOnlyFields = [
        'anchor', 'assetKey', 'display', 'fallbackRole', 'fit', 'kind', 'offset',
        'sampling', 'slotId', 'sourcePx',
        ...(rule.frameIndex === undefined ? [] : ['frameIndex']),
      ].sort();
      expect(Object.keys(rule).sort()).toEqual(renderOnlyFields);
      for (const authoringField of [
        'generation', 'governance', 'prompt', 'negativePrompt', 'briefVersion',
        'styleId', 'path', 'license', 'provider', 'model', 'generatedAt', 'contentHash',
      ]) expect(rule).not.toHaveProperty(authoringField);
    }
    expect(LITTLE_VALLEY_VISUAL_CATALOG.get('art:little-valley:tile:meadow-grass')?.display).toEqual({ unit: 'cell', width: 1, height: 1 });
    expect(LITTLE_VALLEY_VISUAL_CATALOG.get('art:little-valley:crop:turnip-growing')?.display).toEqual({ unit: 'pixel', width: 16, height: 16 });
    expect(LITTLE_VALLEY_VISUAL_CATALOG.get('art:little-valley:player:farmer')?.display).toEqual({ unit: 'pixel', width: 28.8, height: 43.2 });
    expect(LITTLE_VALLEY_VISUAL_CATALOG.get('art:little-valley:placement:farmhouse')?.display).toEqual({ unit: 'pixel', width: 230.4, height: 86.4 });
  });

  it('keeps prompt/path/license/provider/model outside Life package and World snapshots', () => {
    const lifeText = JSON.stringify(rawLife); const snapshotText = JSON.stringify(createLifeDemoSession().engine.world.snapshot());
    // Dialogue legitimately owns a field named `prompt`; generation-specific fields/text must not cross the edge.
    for (const forbidden of ['negativePrompt', 'briefVersion', 'styleId', 'license', 'provider', 'generatedAt', 'contentHash', '/games/game-simlife/art/']) {
      expect(lifeText).not.toContain(forbidden); expect(snapshotText).not.toContain(forbidden);
    }
    expect(snapshotText).not.toContain('seamless warm rural pixel meadow tile');
  });
});
