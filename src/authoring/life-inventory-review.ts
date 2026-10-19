import type { AssetSlotBrief } from '@assets/asset-slot-brief.js';
import type { LifeGamePackage } from '@engine/protocol/life-sim.js';
import {
  canonicalLifeGenerationJson,
  checkLifeGenerationBundle,
  type LifeGenerationBundleV1,
  type LifeGenerationDiagnostic,
} from './life-generation-bundle.js';

export const LIFE_INVENTORY_REVIEW_SCHEMA = 'zerocraft.life-inventory-review.v1' as const;

export type LifeInventorySource =
  | { readonly kind: 'starter'; readonly count: number }
  | { readonly kind: 'crop-seed'; readonly cropId: string }
  | { readonly kind: 'crop-product'; readonly cropId: string }
  | { readonly kind: 'resource-drop'; readonly sceneId: string; readonly placementId: string; readonly action: 'forage' | 'mine'; readonly quantity: number }
  | { readonly kind: 'construction-material'; readonly projectId: string; readonly count: number }
  | { readonly kind: 'catalog-only' };

export interface LifeInventoryReviewItem {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly skinKey: string;
  readonly starterCount: number;
  readonly sources: readonly LifeInventorySource[];
  readonly icon: {
    readonly slotId: string;
    readonly consumer: { readonly document: 'life.json'; readonly jsonPointer: string };
    readonly status: AssetSlotBrief['governance']['approval'];
  };
}

export interface LifeInventoryReviewV1 {
  readonly schemaVersion: typeof LIFE_INVENTORY_REVIEW_SCHEMA;
  readonly game: string;
  readonly inputHash: string;
  readonly capacity: { readonly slots: number; readonly usedSlots: number; readonly maxStack: number };
  readonly starterStacks: readonly { readonly itemId: string; readonly count: number }[];
  readonly items: readonly LifeInventoryReviewItem[];
}

export interface LifeInventoryReviewDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type LifeInventoryReviewBuildResult =
  | { readonly valid: true; readonly diagnostics: readonly []; readonly review: LifeInventoryReviewV1 }
  | { readonly valid: false; readonly diagnostics: readonly LifeInventoryReviewDiagnostic[] };

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const pointerEscape = (value: string): string => value.replace(/~/g, '~0').replace(/\//g, '~1');

function titleFromId(id: string): string {
  const tail = id.split(':').at(-1) ?? id;
  return tail.split(/[._-]+/u).filter(Boolean)
    .map((part) => /^[a-z]/u.test(part) ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part)
    .join(' ') || id;
}

function fromBundleDiagnostic(value: LifeGenerationDiagnostic): LifeInventoryReviewDiagnostic {
  return { path: value.path, code: `bundle_${value.code}`, message: value.message };
}

const sourceRank: Readonly<Record<LifeInventorySource['kind'], number>> = {
  starter: 0,
  'crop-seed': 1,
  'crop-product': 2,
  'resource-drop': 3,
  'construction-material': 4,
  'catalog-only': 5,
};

function sourceIdentity(value: LifeInventorySource): string {
  switch (value.kind) {
    case 'starter': return `${value.count}`;
    case 'crop-seed':
    case 'crop-product': return value.cropId;
    case 'resource-drop': return `${value.sceneId}\0${value.placementId}\0${value.action}\0${value.quantity}`;
    case 'construction-material': return `${value.projectId}\0${value.count}`;
    case 'catalog-only': return '';
  }
}

function stableSources(values: readonly LifeInventorySource[]): LifeInventorySource[] {
  return [...values].sort((a, b) => sourceRank[a.kind] - sourceRank[b.kind] || sourceIdentity(a).localeCompare(sourceIdentity(b)));
}

/**
 * Read-only projection of an already legal generation bundle. It never mutates the
 * bundle, creates assets, or invents acquisition sources absent from Life JSON.
 */
export function buildLifeInventoryReview(rawBundle: unknown): LifeInventoryReviewBuildResult {
  const checked = checkLifeGenerationBundle(rawBundle);
  if (!checked.ok || checked.canonicalHash === undefined) {
    return { valid: false, diagnostics: checked.diagnostics.map(fromBundleDiagnostic) };
  }
  const bundle = rawBundle as LifeGenerationBundleV1;
  const life = bundle.game.lifePackage as LifeGamePackage;
  const catalog = life.itemCatalog ?? [];
  const inventory = life.playerInventory ?? { slots: 10, maxStack: 99, items: [] };
  const sources = new Map<string, LifeInventorySource[]>();
  const add = (itemId: string, source: LifeInventorySource): void => {
    const values = sources.get(itemId) ?? [];
    values.push(source);
    sources.set(itemId, values);
  };
  for (const stack of inventory.items) add(stack.itemId, { kind: 'starter', count: stack.count });
  for (const crop of life.cropCatalog ?? []) {
    add(crop.seedItemId, { kind: 'crop-seed', cropId: crop.id });
    add(crop.harvestItemId, { kind: 'crop-product', cropId: crop.id });
  }
  for (const scene of life.scenes) for (const placement of scene.placements) if (placement.resourceNode) {
    add(placement.resourceNode.itemId, {
      kind: 'resource-drop', sceneId: scene.id, placementId: placement.id,
      action: placement.resourceNode.action, quantity: placement.resourceNode.quantity,
    });
  }
  for (const project of life.constructionProjects ?? []) for (const material of project.materials) {
    add(material.itemId, { kind: 'construction-material', projectId: project.id, count: material.count });
  }

  const diagnostics: LifeInventoryReviewDiagnostic[] = [];
  const items: LifeInventoryReviewItem[] = [];
  for (let index = 0; index < catalog.length; index++) {
    const item = catalog[index]!;
    const jsonPointer = `/itemCatalog/${index}/skinKey`;
    const matches = bundle.assetSlots.draft.slots.filter((slot) => slot.kind === 'item'
      && slot.assetKey === item.skinKey
      && slot.consumers.some((consumer) => consumer.document === 'life.json' && consumer.jsonPointer === jsonPointer));
    if (matches.length !== 1) {
      diagnostics.push({
        path: `/game/lifePackage${jsonPointer}`,
        code: matches.length === 0 ? 'item_icon_consumer_missing' : 'item_icon_consumer_ambiguous',
        message: `item ${item.id} must have exactly one item AssetSlot consumer at life.json#${jsonPointer}`,
      });
      continue;
    }
    const itemSources = sources.get(item.id) ?? [];
    items.push({
      id: item.id,
      title: titleFromId(item.id),
      kind: item.kind,
      skinKey: item.skinKey,
      starterCount: inventory.items.reduce((total, stack) => stack.itemId === item.id ? total + stack.count : total, 0),
      sources: itemSources.length > 0 ? stableSources(itemSources) : [{ kind: 'catalog-only' }],
      icon: {
        slotId: matches[0]!.slotId,
        consumer: { document: 'life.json', jsonPointer },
        status: matches[0]!.governance.approval,
      },
    });
  }
  if (diagnostics.length > 0) return { valid: false, diagnostics };
  return {
    valid: true,
    diagnostics: [],
    review: {
      schemaVersion: LIFE_INVENTORY_REVIEW_SCHEMA,
      game: bundle.game.slug,
      inputHash: checked.canonicalHash,
      capacity: { slots: inventory.slots, usedSlots: inventory.items.length, maxStack: inventory.maxStack },
      starterStacks: inventory.items.map((stack) => ({ itemId: stack.itemId, count: stack.count })),
      items,
    },
  };
}

/** Strict transport validator: the persisted review must equal the fresh one-way projection. */
export function validateLifeInventoryReview(rawBundle: unknown, rawReview: unknown): readonly LifeInventoryReviewDiagnostic[] {
  const built = buildLifeInventoryReview(rawBundle);
  if (!built.valid) return built.diagnostics;
  if (!record(rawReview)) return [{ path: '$', code: 'review_type', message: 'inventory review must be an object' }];
  const expectedKeys = ['capacity', 'game', 'inputHash', 'items', 'schemaVersion', 'starterStacks'];
  const actualKeys = Object.keys(rawReview).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return [{ path: '$', code: 'review_closed', message: 'inventory review must use the closed v1 shape' }];
  }
  if (rawReview.schemaVersion !== LIFE_INVENTORY_REVIEW_SCHEMA) return [{ path: '/schemaVersion', code: 'review_schema', message: 'inventory review schema does not match v1' }];
  if (rawReview.inputHash !== built.review.inputHash) return [{ path: '/inputHash', code: 'stale_input_hash', message: 'inventory review inputHash does not match the current bundle' }];
  for (const key of ['game', 'capacity', 'starterStacks'] as const) {
    if (canonicalLifeGenerationJson(rawReview[key]) !== canonicalLifeGenerationJson(built.review[key])) {
      return [{ path: `/${key}`, code: 'review_drift', message: `${key} does not match the current bundle projection` }];
    }
  }
  if (!Array.isArray(rawReview.items)) return [{ path: '/items', code: 'review_items', message: 'items must be an array' }];
  if (rawReview.items.length !== built.review.items.length) return [{ path: '/items', code: 'review_item_set', message: 'item rows do not match the catalog' }];
  for (let index = 0; index < built.review.items.length; index++) {
    if (canonicalLifeGenerationJson(rawReview.items[index]) !== canonicalLifeGenerationJson(built.review.items[index])) {
      return [{ path: `/items/${index}`, code: 'review_item_drift', message: 'item row does not match the current catalog/source/slot projection' }];
    }
  }
  return [];
}

export function parseLifeInventoryReview(rawBundle: unknown, rawReview: unknown): LifeInventoryReviewV1 {
  const diagnostics = validateLifeInventoryReview(rawBundle, rawReview);
  if (diagnostics.length > 0) throw new Error(`Invalid LifeInventoryReview:\n${diagnostics.map((entry) => `${entry.path} [${entry.code}] ${entry.message}`).join('\n')}`);
  return rawReview as LifeInventoryReviewV1;
}
