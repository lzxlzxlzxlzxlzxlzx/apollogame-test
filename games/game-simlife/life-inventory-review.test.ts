import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveAssetSlotBriefFingerprint } from '@assets/asset-slot-brief.js';
import {
  buildLifeInventoryReview,
  LIFE_INVENTORY_REVIEW_SCHEMA,
  parseLifeInventoryReview,
  validateLifeInventoryReview,
} from '@zerocraft/engine/authoring/life-inventory-review.js';
import {
  lifeGenerationPayload,
  sha256Canonical,
  type LifeGenerationBundleV1,
} from '@zerocraft/engine/authoring/life-generation-bundle.js';
import { littleValleyGenerationBundle } from './life-generation-bundle.fixture.js';

const clone = (): LifeGenerationBundleV1 => structuredClone(littleValleyGenerationBundle());
const refreshHashes = (bundle: LifeGenerationBundleV1): LifeGenerationBundleV1 => ({
  ...bundle,
  provenance: {
    baseHash: sha256Canonical(lifeGenerationPayload(bundle)),
    sourceHashes: {
      lifePackage: sha256Canonical(bundle.game.lifePackage),
      assetSlotsDraft: sha256Canonical(bundle.assetSlots.draft),
    },
  },
});

describe('LifeInventoryReview v1', () => {
  it('projects Little Valley in catalog order with exact icon consumers and honest sources', () => {
    const result = buildLifeInventoryReview(clone());
    expect(result.valid, result.valid ? '' : JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    if (!result.valid) return;
    expect(result.review.schemaVersion).toBe(LIFE_INVENTORY_REVIEW_SCHEMA);
    expect(result.review.capacity).toEqual({ slots: 8, usedSlots: 1, maxStack: 99 });
    expect(result.review.items.map((item) => item.id)).toEqual(['seed.turnip', 'crop.turnip', 'resource.berry', 'resource.ore']);
    expect(result.review.items[0]).toMatchObject({
      title: 'Seed Turnip', starterCount: 3,
      sources: [{ kind: 'starter', count: 3 }, { kind: 'crop-seed', cropId: 'turnip' }],
      icon: { consumer: { document: 'life.json', jsonPointer: '/itemCatalog/0/skinKey' }, status: 'placeholder' },
    });
    expect(result.review.items[1]!.sources).toEqual([{ kind: 'crop-product', cropId: 'turnip' }]);
    expect(result.review.items[2]!.sources).toEqual([{ kind: 'resource-drop', sceneId: 'little-valley', placementId: 'berry-bush', action: 'forage', quantity: 3 }]);
    expect(result.review.items[3]!.sources).toEqual([{ kind: 'resource-drop', sceneId: 'mine-interior', placementId: 'ore-vein', action: 'mine', quantity: 2 }]);
    expect(validateLifeInventoryReview(clone(), JSON.parse(JSON.stringify(result.review)))).toEqual([]);
    expect(parseLifeInventoryReview(clone(), result.review)).toEqual(result.review);
  });

  it('preserves duplicate starter stacks while reporting their exact used slots and summed item total', () => {
    const bundle = clone();
    const inventory = (bundle.game.lifePackage as {
      playerInventory: { slots: number; maxStack: number; items: Array<{ itemId: string; count: number }> };
    }).playerInventory;
    inventory.items.push({ itemId: 'seed.turnip', count: 5 });
    const current = refreshHashes(bundle);
    const result = buildLifeInventoryReview(current);
    expect(result.valid, result.valid ? '' : JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    if (!result.valid) return;
    expect(result.review.capacity).toEqual({ slots: 8, usedSlots: 2, maxStack: 99 });
    expect(result.review.starterStacks).toEqual([
      { itemId: 'seed.turnip', count: 3 },
      { itemId: 'seed.turnip', count: 5 },
    ]);
    expect(result.review.items[0]).toMatchObject({
      id: 'seed.turnip',
      starterCount: 8,
      sources: [{ kind: 'starter', count: 3 }, { kind: 'starter', count: 5 }, { kind: 'crop-seed', cropId: 'turnip' }],
    });
    expect(validateLifeInventoryReview(current, JSON.parse(JSON.stringify(result.review)))).toEqual([]);
  });

  it('projects the Demon Castle candidate with construction attribution', () => {
    const bundle = JSON.parse(readFileSync('docs/design/game-demon-castle/bundle.candidate.json', 'utf8')) as unknown;
    const result = buildLifeInventoryReview(bundle);
    expect(result.valid, result.valid ? '' : JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    if (!result.valid) return;
    expect(result.review.game).toBe('game-demon-castle');
    expect(result.review.items.find((item) => item.id === 'resource.moonwood')?.sources).toEqual([
      { kind: 'resource-drop', sceneId: 'moonshadow-forest', placementId: 'moonwood-fallen-log', action: 'forage', quantity: 4 },
      { kind: 'construction-material', projectId: 'awaken-forge-core', count: 1 },
      { kind: 'construction-material', projectId: 'restore-greenhouse', count: 1 },
      { kind: 'construction-material', projectId: 'restore-throne-hall', count: 2 },
    ]);
  });

  it('uses catalog-only instead of inventing a source', () => {
    const bundle = clone();
    const life = bundle.game.lifePackage as { itemCatalog: Array<{ id: string; kind: string; skinKey: string }> };
    life.itemCatalog.push({ id: 'keepsake.old-key', kind: 'quest', skinKey: 'art:little-valley:item:old-key' });
    const sourceSlot = bundle.assetSlots.draft.slots.find((slot) => slot.kind === 'item')!;
    const slot = structuredClone(sourceSlot) as typeof sourceSlot;
    Object.assign(slot, {
      slotId: 'little-valley.item.old-key', assetKey: 'art:little-valley:item:old-key',
      consumers: [{ document: 'life.json', jsonPointer: `/itemCatalog/${life.itemCatalog.length - 1}/skinKey` }],
    });
    (slot.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(slot);
    (bundle.assetSlots.draft.slots as typeof slot[]).push(slot);
    const result = buildLifeInventoryReview(refreshHashes(bundle));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.review.items.at(-1)?.sources).toEqual([{ kind: 'catalog-only' }]);
  });

  it('fails closed for a missing precise item consumer', () => {
    const bundle = clone();
    const slot = bundle.assetSlots.draft.slots.find((entry) => entry.kind === 'item')!;
    (slot.consumers[0] as { jsonPointer: string }).jsonPointer = '/itemCatalog/1/skinKey';
    (slot.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(slot);
    const result = buildLifeInventoryReview(refreshHashes(bundle));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics.some((entry) => entry.path.includes('/itemCatalog/0/skinKey'))).toBe(true);
  });

  it('rejects unknown starters, capacity/maxStack overflow, and illegal source references through the bundle gate', () => {
    const unknown = clone();
    (unknown.game.lifePackage as { playerInventory: { items: Array<{ itemId: string; count: number }> } }).playerInventory.items[0]!.itemId = 'missing.item';
    expect(buildLifeInventoryReview(refreshHashes(unknown)).valid).toBe(false);

    const overSlots = clone();
    const inventory = (overSlots.game.lifePackage as { playerInventory: { slots: number; maxStack: number; items: Array<{ itemId: string; count: number }> } }).playerInventory;
    inventory.slots = 0;
    inventory.items[0]!.count = inventory.maxStack + 1;
    const overResult = buildLifeInventoryReview(refreshHashes(overSlots));
    expect(overResult.valid).toBe(false);
    if (!overResult.valid) expect(overResult.diagnostics.some((entry) => entry.path.includes('playerInventory'))).toBe(true);

    const source = clone();
    const placement = (source.game.lifePackage as { scenes: Array<{ placements: Array<{ resourceNode?: { itemId: string } }> }> }).scenes
      .flatMap((scene) => scene.placements).find((entry) => entry.resourceNode)!;
    placement.resourceNode!.itemId = 'missing.drop';
    const sourceResult = buildLifeInventoryReview(refreshHashes(source));
    expect(sourceResult.valid).toBe(false);
    if (!sourceResult.valid) expect(sourceResult.diagnostics.some((entry) => entry.path.includes('resourceNode'))).toBe(true);
  });

  it('rejects stale hashes and fake/orphan review rows without changing the bundle', () => {
    const bundle = clone();
    const before = JSON.stringify(bundle);
    const result = buildLifeInventoryReview(bundle);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const stale = structuredClone(result.review) as { inputHash: string };
    stale.inputHash = `sha256:${'0'.repeat(64)}`;
    expect(validateLifeInventoryReview(bundle, stale)).toEqual([expect.objectContaining({ path: '/inputHash', code: 'stale_input_hash' })]);
    const fake = structuredClone(result.review) as unknown as { items: unknown[] };
    fake.items.push({ id: 'fake.icon' });
    expect(validateLifeInventoryReview(bundle, fake)).toEqual([expect.objectContaining({ path: '/items', code: 'review_item_set' })]);
    expect(JSON.stringify(bundle)).toBe(before);
  });
});
