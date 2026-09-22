import type { CapabilityDefinition } from '@engine/core/define-capability.js';

// ═══════════════════════════════════════════════════════════════
//  能力索引（P2e · engine-architecture-review-2026-09-02 §5 P2e · D10）
//
//  「从组件反推能力」「共用组件不猜」「id → 能力对象」这三件事此前只存在于静态注册表
//  capability-registry.ts（它 import 了全部 ~150 个能力 → 谁碰 manifest 谁就把整个引擎拖进 bundle）。
//  本文件把它们抽成**只依赖元数据**的纯函数：条目只需 `{ id, provides }`——静态注册表用真能力对象喂它，
//  懒注册表（capability-registry.gen.ts）用生成期抄下来的 provides 喂它，两边算出的表**逐项相同**
//  （capability-registry.gen.test.ts 对拍）。于是 manifest 的推断/校验不再需要先装载全部能力。
// ═══════════════════════════════════════════════════════════════

/** 索引条目：能力 id + 它提供的组件类型名（登记序）。 */
export interface CapabilityMeta {
  readonly id: string;
  readonly provides: readonly string[];
}

/** 懒注册表条目：元数据 + 按需装载（`() => import()`·rollup 可按子集摇树）。 */
export interface CapabilityLoader extends CapabilityMeta {
  readonly load: () => Promise<CapabilityDefinition>;
}

export interface CapabilityIndex {
  /** 组件类型 → **全部**声明提供它的 capability id（登记序）。 */
  readonly providersAll: ReadonlyMap<string, readonly string[]>;
  /** 被多个能力共同提供的组件 → 提供者清单。推断**刻意不碰**这些（不猜）。 */
  readonly ambiguous: ReadonlyMap<string, readonly string[]>;
  /** 组件类型 → 唯一提供者（多提供者组件不入表）。 */
  readonly providers: ReadonlyMap<string, string>;
}

/** 由元数据建索引（登记序保持）。 */
export function buildCapabilityIndex(metas: Iterable<CapabilityMeta>): CapabilityIndex {
  const all = new Map<string, string[]>();
  for (const m of metas) {
    for (const type of m.provides) {
      const list = all.get(type);
      if (list) list.push(m.id);
      else all.set(type, [m.id]);
    }
  }
  const ambiguous = new Map<string, readonly string[]>();
  const providers = new Map<string, string>();
  for (const [type, ids] of all) {
    if (ids.length > 1) ambiguous.set(type, ids);
    else providers.set(type, ids[0]!);
  }
  return { providersAll: all, ambiguous, providers };
}

/** 能力对象 → 索引元数据。 */
export function metaOf(cap: CapabilityDefinition): CapabilityMeta {
  return { id: cap.id, provides: Object.keys(cap.components?.provides ?? {}) };
}

/**
 * 从 entities 用到的组件类型，反推"提供这些组件"的能力 id 集合（只认唯一提供者）。
 * 只覆盖**提供组件**的能力；纯行为系统(如 motion-apply)不提供组件、推不出来——manifest 最好显式带 capabilities。
 */
export function inferCapabilityIdsWith(index: CapabilityIndex, entities: Record<string, Record<string, unknown>>): string[] {
  const ids = new Set<string>();
  for (const comps of Object.values(entities)) {
    for (const type of Object.keys(comps)) {
      const capId = index.providers.get(type);
      if (capId) ids.add(capId);
    }
  }
  return [...ids];
}

/** 未注册 id 的统一判词（同步 resolveCapabilities 与异步 loadCapabilities 共用一句）。 */
export function unknownCapabilityError(unknown: readonly string[]): Error {
  return new Error(`manifest: 未知 capability id: ${unknown.join(', ')}（不在能力注册表内）`);
}

/**
 * 按 id 列表并行装载能力（懒注册表路径）。任一 id 未注册即抛（装载前就抛·不半装）。
 * 返回顺序 = 传入顺序（与同步 resolveCapabilities 一致）。
 */
export async function loadCapabilities(ids: readonly string[], loaders: readonly CapabilityLoader[]): Promise<CapabilityDefinition[]> {
  const byId = new Map<string, CapabilityLoader>();
  for (const l of loaders) byId.set(l.id, l);
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) throw unknownCapabilityError(unknown);
  return Promise.all(ids.map((id) => byId.get(id)!.load()));
}
