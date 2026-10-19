import { mulberry32 } from '@engine/logic/index.js';
import { weightedPick } from '@skills/tier2/weighted-pick.js';

export type ImageRef = Readonly<{ assetId?: string; src?: string; alt?: string }>;
export type Quantity = Readonly<{ fixed: number }> | Readonly<{ min: number; max: number }>;
export type ItemNode = Readonly<{ type: 'item'; itemId: string; name?: string; quantity: Quantity; image?: ImageRef }>;
export type EmptyNode = Readonly<{ type: 'empty' }>;
export type AllNode = Readonly<{ type: 'all'; children: readonly LootNode[] }>;
export type ChooseNode = Readonly<{ type: 'choose'; entries: readonly Readonly<{ weight: number; child: LootNode }>[] }>;
export type RepeatNode = Readonly<{ type: 'repeat'; count: number; replacement: boolean; child: LootNode }>;
export type LootNode = ItemNode | EmptyNode | AllNode | ChooseNode | RepeatNode;
export type ChestInput = Readonly<{
  sessionId: string;
  tableId: string;
  tableVersion?: number;
  tableDigest?: string;
  chest?: Readonly<{ name?: string }>;
  rng: Readonly<{ algorithm: 'mulberry32-v1'; seed: number }>;
  root: LootNode;
}>;
export type ChestResultData = Readonly<{
  sessionId: string;
  tableId: string;
  tableVersion?: number;
  tableDigest?: string;
  outcome: 'opened';
  rewards: readonly Readonly<{ itemId: string; quantity: number }>[];
}>;

const MAX_REPEAT_COUNT = 100;
const MAX_QUANTITY = 1_000_000;
const MAX_DEPTH = 16;
const MAX_NODES = 500;
const MAX_WEIGHT = 1_000_000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveInt = (value: unknown, max = MAX_QUANTITY): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value;
};

function image(value: unknown): ImageRef | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error('Invalid image reference.');
  if (value.assetId !== undefined && typeof value.assetId !== 'string') throw new Error('Invalid image assetId.');
  if (value.src !== undefined && (typeof value.src !== 'string' || !/^https:\/\//.test(value.src))) throw new Error('Invalid image src.');
  if (value.alt !== undefined && typeof value.alt !== 'string') throw new Error('Invalid image alt.');
  if (value.assetId === undefined && value.src === undefined && value.alt === undefined) throw new Error('Image reference must not be empty.');
  return {
    ...(typeof value.assetId === 'string' ? { assetId: value.assetId } : {}),
    ...(typeof value.src === 'string' ? { src: value.src } : {}),
    ...(typeof value.alt === 'string' ? { alt: value.alt } : {}),
  };
}

function quantity(value: unknown): Quantity {
  if (!isObject(value)) throw new Error('Invalid reward quantity.');
  if (positiveInt(value.fixed)) return { fixed: value.fixed };
  if (positiveInt(value.min) && positiveInt(value.max) && value.min <= value.max) return { min: value.min, max: value.max };
  throw new Error('Reward quantity must be a positive fixed value or inclusive range.');
}

function node(value: unknown, depth: number, counter: { value: number }): LootNode {
  if (!isObject(value) || depth > MAX_DEPTH) throw new Error('Invalid loot node or tree is too deep.');
  counter.value += 1;
  if (counter.value > MAX_NODES) throw new Error('Loot tree has too many nodes.');
  switch (value.type) {
    case 'empty': return { type: 'empty' };
    case 'item': {
      const itemId = text(value.itemId, 'itemId');
      if (value.name !== undefined && typeof value.name !== 'string') throw new Error('Invalid item name.');
      const imageRef = image(value.image);
      return {
        type: 'item', itemId,
        ...(typeof value.name === 'string' ? { name: value.name } : {}),
        quantity: quantity(value.quantity),
        ...(imageRef ? { image: imageRef } : {}),
      };
    }
    case 'all':
      if (!Array.isArray(value.children) || value.children.length === 0) throw new Error('An all node needs children.');
      return { type: 'all', children: value.children.map((child) => node(child, depth + 1, counter)) };
    case 'choose': {
      if (!Array.isArray(value.entries) || value.entries.length === 0) throw new Error('A choose node needs entries.');
      const entries = value.entries.map((entry) => {
        if (!isObject(entry) || !positiveInt(entry.weight, MAX_WEIGHT)) throw new Error('Every choice entry needs a positive integer weight.');
        return { weight: entry.weight, child: node(entry.child, depth + 1, counter) };
      });
      const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
      if (!Number.isSafeInteger(totalWeight)) throw new Error('Choice weight total is too large.');
      return { type: 'choose', entries };
    }
    case 'repeat': {
      if (!positiveInt(value.count, MAX_REPEAT_COUNT) || typeof value.replacement !== 'boolean') throw new Error('Invalid repeat configuration.');
      const child = node(value.child, depth + 1, counter);
      if (!value.replacement) {
        if (child.type !== 'choose') throw new Error('A non-replacement repeat must contain a choose node.');
        if (value.count > child.entries.length) throw new Error('A non-replacement repeat cannot exceed its choice entries.');
      }
      return { type: 'repeat', count: value.count, replacement: value.replacement, child };
    }
    default: throw new Error('Unknown loot node type.');
  }
}

export function parseChestInput(value: unknown): ChestInput {
  if (!isObject(value)) throw new Error('Invalid chest input.');
  const sessionId = text(value.sessionId, 'sessionId');
  const tableId = text(value.tableId, 'tableId');
  if (!isObject(value.rng)) throw new Error('Invalid chest random configuration.');
  const seed = value.rng.seed;
  if (value.rng.algorithm !== 'mulberry32-v1' || typeof seed !== 'number' || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('Invalid chest random configuration.');
  }
  if (value.tableVersion !== undefined && !positiveInt(value.tableVersion)) throw new Error('Invalid tableVersion.');
  if (value.tableDigest !== undefined && typeof value.tableDigest !== 'string') throw new Error('Invalid tableDigest.');
  let chest: ChestInput['chest'];
  if (value.chest !== undefined) {
    if (!isObject(value.chest)) throw new Error('Invalid chest display data.');
    if (value.chest.name !== undefined && typeof value.chest.name !== 'string') throw new Error('Invalid chest name.');
    // 宝箱本体是游戏固定美术；兼容旧调用方多传的 image 字段，但永远不消费、不回存。
    chest = { ...(typeof value.chest.name === 'string' ? { name: value.chest.name } : {}) };
  }
  return {
    sessionId, tableId,
    ...(value.tableVersion === undefined ? {} : { tableVersion: value.tableVersion as number }),
    ...(value.tableDigest === undefined ? {} : { tableDigest: value.tableDigest }),
    ...(chest ? { chest } : {}),
    rng: { algorithm: 'mulberry32-v1', seed },
    root: node(value.root, 0, { value: 0 }),
  };
}

function resolveQuantity(spec: Quantity, random: () => number): number {
  return 'fixed' in spec ? spec.fixed : spec.min + Math.floor(random() * (spec.max - spec.min + 1));
}

export function resolveChest(input: ChestInput): ChestResultData {
  const random = mulberry32(input.rng.seed);
  const rewards = new Map<string, number>();
  const visit = (current: LootNode, excluded?: Set<number>): void => {
    if (current.type === 'empty') return;
    if (current.type === 'item') {
      rewards.set(current.itemId, (rewards.get(current.itemId) ?? 0) + resolveQuantity(current.quantity, random));
      return;
    }
    if (current.type === 'all') {
      current.children.forEach((child) => visit(child));
      return;
    }
    if (current.type === 'choose') {
      const available = current.entries.map((entry, index) => ({ ...entry, index })).filter(({ index }) => !excluded?.has(index));
      const picked = weightedPick(available, random);
      if (!picked) throw new Error('Choice pool is empty.');
      excluded?.add(picked.index);
      visit(picked.child);
      return;
    }
    if (current.replacement) {
      for (let count = 0; count < current.count; count += 1) visit(current.child);
      return;
    }
    const excludedEntries = new Set<number>();
    for (let count = 0; count < current.count; count += 1) visit(current.child, excludedEntries);
  };
  visit(input.root);
  return {
    sessionId: input.sessionId,
    tableId: input.tableId,
    ...(input.tableVersion === undefined ? {} : { tableVersion: input.tableVersion }),
    ...(input.tableDigest === undefined ? {} : { tableDigest: input.tableDigest }),
    outcome: 'opened',
    rewards: [...rewards].map(([itemId, rewardQuantity]) => ({ itemId, quantity: rewardQuantity })),
  };
}

export function toChestOutput(data: ChestResultData): Readonly<{ contract: 'doki.game.chest-result'; version: 2; data: ChestResultData }> {
  return { contract: 'doki.game.chest-result', version: 2, data };
}

export function presentation(input: ChestInput): Map<string, ItemNode> {
  const items = new Map<string, ItemNode>();
  const visit = (current: LootNode): void => {
    if (current.type === 'item') {
      if (items.has(current.itemId)) throw new Error(`Duplicate itemId in presentation: ${current.itemId}`);
      items.set(current.itemId, current);
    } else if (current.type === 'all') current.children.forEach(visit);
    else if (current.type === 'choose') current.entries.forEach(({ child }) => visit(child));
    else if (current.type === 'repeat') visit(current.child);
  };
  visit(input.root);
  return items;
}
