import type { IWorld } from '@engine/core/types.js';
import type { ConditionExpr } from '@engine/protocol/components.js';
import { buildIdLookup, evalCondition, type IdLookup } from '@engine/logic/index.js';

// Condition —— 布尔条件树的确定性求值。
//
// P2a（engine-architecture-review-2026-09-02 §5 P2a）：求值器与「按 id 找值」索引已下沉进引擎规则内核
// `@engine/logic`（唯一的一份 compare / 寻址 / clamp）。本文件只留兼容入口：既有消费方（event-when / flow /
// dialogue / modifier-stack / group-count / craft-recipe / zone-occupancy / timeline）的调用形状不变。
// 语义逐字一致：叶子按语义 id 全局查找（同 id 多份取首份）、缺失叶子按「不成立」、只做确定性比较。

export type ConditionLookup = IdLookup;

/** 按 id 建索引（懒加载、按类型 memo）。= engine/logic buildIdLookup。 */
export function buildConditionLookup(world: IWorld): ConditionLookup {
  return buildIdLookup(world);
}

/**
 * 求值一棵条件树（global 寻址）。缺失叶子（找不到对应 id）按「不成立」处理。
 * 可传入 lookup 复用（同一 tick 多次求值只建一次索引）；不传则内部建一次。
 */
export function evaluateCondition(
  world: IWorld,
  expr: ConditionExpr,
  lookup: ConditionLookup = buildConditionLookup(world),
): boolean {
  return evalCondition({ world, lookup }, expr);
}
