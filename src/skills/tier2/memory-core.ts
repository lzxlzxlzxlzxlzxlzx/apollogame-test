import { cmpStr } from '@engine/math/scalar.js';
import type { Component } from '@engine/core/types.js';

// ═══════════════════════════════════════════════════════════════
//  memory-core —— `t2-memory` 的**纯函数核**（零 `defineCapability` 调用·零 `IWorld`）。
//
//  为什么拆（不是为了过守卫）：记忆的承重逻辑是「打分怎么算、同分谁在前、衰减减多少、谁被忘掉」，
//  这四件都不需要世界就能判对错。放在壳里它们只能经由 `new World()` 间接测；拆出来之后
//  `memory-core.test.ts` 直接喂数组断结果，反例（浮点打分、同分无兜底）一眼能钉住。
//  形状照 `flow-field-core.ts` 的先例。壳（`memory.ts`）只剩「读写世界 + 系统声明」。
//
//  确定性口径：**全整数**、**同分按 id 兜底全序**。浮点打分跨端 JIT/FMA 可能 1 ULP 漂移，
//  纳入排序即误报 desync（`determinism.ts` 排除 Camera 的同款理由）。
// ═══════════════════════════════════════════════════════════════

/** 一条记忆（POD·进 snapshot/hash）。 */
export interface MemoryEntry {
  /** 条目 id（同一实体内唯一；`share` 的副本 id = `<原 id>><收方>`）。 */
  id: string;
  /** 主体：谁做的。 */
  subject: string;
  /** 客体：对谁做的（可缺）。 */
  object?: string;
  /** 发生时的回合号（整数）。 */
  turn: number;
  /** 强度（整数·0 起）。衰减减它，降到 `forgetBelow` 以下即遗忘。 */
  strength: number;
  /** 标签（闭集·由游戏的 MEMORY_TAGS 表定）。 */
  tags: string[];
  /** 来源：这条记忆从哪来（玩家某次发言 / 事件名 / `share:<fromId>`）。链式影响的可观测落点。 */
  source: string;
}

/** 记忆容器（每个会记事的实体一个）。 */
export interface Memory extends Component {
  readonly type: 'Memory';
  entries: MemoryEntry[];
  /** 规则表 id（对应 `MemoryRules.id`）。缺省取世界里第一个 MemoryRules。 */
  rulesId?: string;
  /** 自上次衰减起数过的拍数（`period` 模式用；`decaySignal` 模式恒 0）。 */
  ticks?: number;
}

/** 衰减与容量规则（单例数据表·按 id 定位）。 */
export interface MemoryRules extends Component {
  readonly type: 'MemoryRules';
  id: string;
  /** 逐标签衰减量（整数）。一条记忆命中多个标签时取**最大**的那个速率（忘得最快的说了算）。 */
  decay: Array<{ tag: string; amount: number }>;
  /** 未命中任何标签时的衰减量（整数·缺省 1）。 */
  defaultDecay?: number;
  /** 强度低于此值即遗忘（缺省 1 = 降到 0 就忘）。 */
  forgetBelow?: number;
  /** 每个实体的条目上限；超了丢最弱的（同强度按 id 升序丢）。缺省不限。 */
  max?: number;
  /** `share` 的折扣（千分比·如 600 = 转述一次剩六成）。缺省 1000 = 不打折。 */
  shareDiscount?: number;
  /** 衰减触发信号名。在场时**只**按信号衰减（回合制：一回合恰好一次）。 */
  decaySignal?: string;
  /** 衰减周期（拍）。`decaySignal` 缺省时用它（照 `t2-over-time` 的形状）；缺省 0 = 不自动衰减。 */
  period?: number;
}

/** 检索打分权重（全整数·缺省见 `DEFAULT_WEIGHTS`）。 */
export interface RecallWeights {
  /** 每个命中标签加多少。 */
  tagHit: number;
  /** 强度乘数。 */
  strength: number;
  /** 时近乘数（作用于 `recencyWindow - 距今回合数`，负数截零）。 */
  recency: number;
  /** 时近窗口（回合）：超出窗口的记忆时近项为 0。 */
  recencyWindow: number;
}

export const DEFAULT_WEIGHTS: RecallWeights = { tagHit: 100, strength: 1, recency: 2, recencyWindow: 50 };

export interface RecallQuery {
  /** 命中这些标签之一即加分（空/缺省 = 不看标签）。 */
  tags?: readonly string[];
  /** 只要客体是这个的（缺省 = 不筛）。 */
  object?: string;
  /** 只要主体是这个的（缺省 = 不筛）。 */
  subject?: string;
  /** 取前几条（缺省 5）。 */
  k?: number;
  /** 当前回合号（算时近用·整数）。缺省 0。 */
  now?: number;
  /** 打分权重（缺省 `DEFAULT_WEIGHTS`）。 */
  weights?: Partial<RecallWeights>;
}

/** 一条记忆的检索分（**纯整数**）。 */
export function scoreEntry(e: MemoryEntry, q: RecallQuery): number {
  const w = { ...DEFAULT_WEIGHTS, ...q.weights };
  let hits = 0;
  if (q.tags && q.tags.length > 0) for (const tg of q.tags) if (e.tags.includes(tg)) hits += 1;
  const age = (q.now ?? 0) - e.turn;
  const fresh = w.recencyWindow - age;
  return hits * w.tagHit + e.strength * w.strength + (fresh > 0 ? fresh * w.recency : 0);
}

/**
 * 确定性 top-K 检索。
 * 排序：分数降序，**同分按条目 id 升序**——没有这条兜底，同分条目的先后就跟着数组插入序走，
 * 而插入序会被「哪个 NPC 先被处理」影响 → 同一世界两次跑出不同 prompt。
 */
export function recallFrom(entries: readonly MemoryEntry[], q: RecallQuery = {}): MemoryEntry[] {
  const pool = entries.filter((e) =>
    (q.object === undefined || e.object === q.object) && (q.subject === undefined || e.subject === q.subject));
  const scored = pool.map((e) => ({ e, s: scoreEntry(e, q) }));
  scored.sort((a, b) => (b.s - a.s) || cmpStr(a.e.id, b.e.id));
  return scored.slice(0, q.k ?? 5).map((x) => x.e);
}

/** 该条目的衰减量：命中标签里取**最大**速率（忘得最快的说了算），无命中用 `defaultDecay`。 */
export function decayAmount(e: MemoryEntry, rules: MemoryRules): number {
  let amount: number | undefined;
  for (const d of rules.decay) {
    if (!e.tags.includes(d.tag)) continue;
    const a = Math.trunc(d.amount);
    if (amount === undefined || a > amount) amount = a;
  }
  return amount ?? Math.trunc(rules.defaultDecay ?? 1);
}

/**
 * 衰减一批条目（**就地改 strength**，返回还活着的那些 + 忘掉几条）。
 * 强度用整数减法并钳到 0；降到 `forgetBelow` 以下即遗忘（不返回）。入序即出序（过滤保序）。
 */
export function decayEntries(entries: MemoryEntry[], rules: MemoryRules): { survivors: MemoryEntry[]; forgot: number } {
  const floorAt = Math.trunc(rules.forgetBelow ?? 1);
  const survivors: MemoryEntry[] = [];
  let forgot = 0;
  for (const e of entries) {
    e.strength = Math.max(0, e.strength - decayAmount(e, rules));
    if (e.strength < floorAt) forgot += 1;
    else survivors.push(e);
  }
  return { survivors, forgot };
}

/** 记账归一（强度/回合号 `Math.trunc`·强度不许为负·tags 拷贝防别名共享）。 */
export function normalizeEntry(entry: MemoryEntry): MemoryEntry {
  return {
    ...entry,
    turn: Math.trunc(entry.turn),
    strength: Math.max(0, Math.trunc(entry.strength)),
    tags: [...entry.tags],
  };
}

/** 超容量淘汰：按「强度降序·同强度 id 升序」留前 max 条（全序·不留「看谁先来」）。 */
export function evictWeakest(entries: readonly MemoryEntry[], max: number): MemoryEntry[] {
  const byStrength = [...entries].sort((a, b) => (b.strength - a.strength) || cmpStr(a.id, b.id));
  return byStrength.slice(0, max);
}

/** 按 id 升序（entries 的唯一合法存序·数组序会进 hash，见 memory.ts 的说明）。 */
export function sortById(entries: MemoryEntry[]): void {
  entries.sort((a, b) => cmpStr(a.id, b.id));
}
