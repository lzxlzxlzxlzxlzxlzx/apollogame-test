import type { IWorld, EntityId, Component } from '@engine/core/types.js';
import type { ConditionExpr, CmpOp, Resource, Flag, State, Timer, StringVar, Tag } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  engine/logic —— 规则内核（P2a · engine-architecture-review-2026-09-02 §5 P2a · D4）
//
//  病：规则层 ≥12 套小语言各自实现「按 id 找值 / 比较 / 钳进 [min,max] 改资源」——clamp 写了 5 份
//  （effect-apply / self-rule / flow / timeline / resource-apply），`cmp()` 写了 2 份，寻址方式 5 种；每个新 DSL
//  都成为 Resource 的又一个 writer，也是 RMW 软环的来源；最弱 LLM 面对字段名各异的语法必然混用。
//
//  内核三件（第一步·只换求值器不换 JSON 形状·黄金 hash 零变）：
//   · Ref     ——「读哪个值」：{res|flag|state|timer|str: id} · {count: tagMask}；Scope=global（按 id 全局路由·同 id 取首份）
//                | self（读自身那一份·id 空串=通配·与 self-rule 既有语义逐字一致）
//   · 求值    —— evalCondition（ConditionExpr 布尔树·就是 v1 的条件语法）· evalValue（数值表达式：常量/Ref/乘/加/计数）
//                缺失引用 → 条件为 false / 数值为 undefined（上层按「无效 = 不动」跳过）
//   · Write   —— applyWrite：{to, op, value}，资源 add/mul/set 后钳 [min,max]、非有限值拒写；flag 布尔化（'true' 字符串
//                也算真）；state/str 字符串化。**唯一的一份 clamp。**
//  第二步（另立工单·改 hash）：Write 入队（与 ResourceModify 同「挂到被消费」语义）、Scope 扩 parent/source/@signal-source/
//  tag、v2 JSON 形状（Effect/SelfAction/FlowAction/TimelineCueDo 折叠成 Write[]）。
// ═══════════════════════════════════════════════════════════════

export type Ref =
  | { readonly res: string }
  | { readonly flag: string }
  | { readonly state: string }
  | { readonly timer: string }
  | { readonly str: string }
  | { readonly count: number }; // Tag 掩码命中实体数（只读）

export type WriteTarget = Extract<Ref, { res: string } | { flag: string } | { state: string } | { str: string }>;

export type ValueExpr =
  | number
  | Ref
  | { readonly mul: readonly ValueExpr[] }
  | { readonly add: readonly ValueExpr[] };

export type WriteOp = 'set' | 'add' | 'mul';
export interface Write {
  readonly to: WriteTarget;
  readonly op?: WriteOp; // 仅 res 用；缺省 add
  readonly value: number | string | boolean | undefined;
}
export interface WriteResult {
  readonly ok: boolean;
  readonly reason?: 'missing-target' | 'invalid-value';
  /** res 写入时：本步量与写后值（ScoreTrace 用）。 */
  readonly v?: number;
  readonly after?: number;
}

/** 按语义 id 的全局索引（懒建·按类型 memo·同 id 多份取首份=query 序首个）。 */
export interface IdLookup {
  resource(id: string): Resource | undefined;
  flag(id: string): Flag | undefined;
  state(fsmId: string): State | undefined;
  timer(id: string): Timer | undefined;
  string(id: string): StringVar | undefined;
}

export function buildIdLookup(world: IWorld): IdLookup {
  const tables = new Map<string, Map<string, Component>>();
  function table(type: string, idField: string): Map<string, Component> {
    let m = tables.get(type);
    if (!m) {
      m = new Map();
      for (const [e] of world.query(type)) {
        const c = world.getComponent(e, type) as (Component & Record<string, unknown>) | undefined;
        const key = c?.[idField];
        if (c && typeof key === 'string' && !m.has(key)) m.set(key, c);
      }
      tables.set(type, m);
    }
    return m;
  }
  return {
    resource: (id) => table('Resource', 'id').get(id) as Resource | undefined,
    flag: (id) => table('Flag', 'id').get(id) as Flag | undefined,
    state: (fsmId) => table('State', 'fsmId').get(fsmId) as State | undefined,
    timer: (id) => table('Timer', 'id').get(id) as Timer | undefined,
    string: (id) => table('StringVar', 'id').get(id) as StringVar | undefined,
  };
}

/** 求值/施效上下文：global（lookup 懒建）或 self（读自身那一份）。 */
export interface LogicCtx {
  readonly world: IWorld;
  /** 自身实体：给出则 Ref 按 self 解析（id 空串=通配·同 self-rule）；否则按 id 全局路由。 */
  readonly self?: EntityId;
  lookup?: IdLookup;
}

export function ctxOf(world: IWorld, lookup?: IdLookup): LogicCtx {
  return { world, lookup };
}
export function selfCtx(world: IWorld, self: EntityId): LogicCtx {
  return { world, self };
}

function lookupOf(ctx: LogicCtx): IdLookup {
  if (!ctx.lookup) ctx.lookup = buildIdLookup(ctx.world);
  return ctx.lookup;
}

// ── Ref 解析（唯一的寻址实现） ──

function selfComp<T extends Component & { id?: string; fsmId?: string }>(ctx: LogicCtx, type: string, idField: 'id' | 'fsmId', id: string): T | undefined {
  const c = ctx.world.getComponent<T>(ctx.self!, type);
  if (!c) return undefined;
  if (id && c[idField] !== id) return undefined; // self 下 id 空串 = 通配
  return c;
}

export function resolveResource(ctx: LogicCtx, id: string): Resource | undefined {
  return ctx.self !== undefined ? selfComp<Resource>(ctx, 'Resource', 'id', id) : lookupOf(ctx).resource(id);
}
export function resolveFlag(ctx: LogicCtx, id: string): Flag | undefined {
  return ctx.self !== undefined ? selfComp<Flag>(ctx, 'Flag', 'id', id) : lookupOf(ctx).flag(id);
}
export function resolveState(ctx: LogicCtx, fsmId: string): State | undefined {
  return ctx.self !== undefined ? selfComp<State>(ctx, 'State', 'fsmId', fsmId) : lookupOf(ctx).state(fsmId);
}
export function resolveTimer(ctx: LogicCtx, id: string): Timer | undefined {
  return ctx.self !== undefined ? selfComp<Timer>(ctx, 'Timer', 'id', id) : lookupOf(ctx).timer(id);
}
export function resolveString(ctx: LogicCtx, id: string): StringVar | undefined {
  return ctx.self !== undefined ? selfComp<StringVar>(ctx, 'StringVar', 'id', id) : lookupOf(ctx).string(id);
}

interface CooldownsLike { slots: Array<{ id: string; remaining: number }> }
/** 冷却槽是否就绪（engine 不依赖 tier2·按结构读 Cooldowns）。 */
export function resolveCooldownReady(ctx: LogicCtx, slotId: string): boolean {
  const w = ctx.world;
  const holders = ctx.self !== undefined ? [ctx.self] : w.queryEntities('Cooldowns');
  for (const e of holders) {
    const cd = w.getComponent<Component & CooldownsLike>(e, 'Cooldowns');
    if (!cd) continue;
    for (const s of cd.slots) if (s.id === slotId) return s.remaining <= 0;
    if (ctx.self !== undefined) return true;
  }
  return true;
}

/** Tag 掩码命中的实体数（掩码非有限/为 0 → 0）。按 id 升序扫描无关（纯计数）。 */
export function countByTag(world: IWorld, mask: number): number {
  if (!Number.isFinite(mask) || mask === 0) return 0;
  let n = 0;
  for (const [tid] of world.query('Tag')) {
    const tg = world.getComponent<Tag>(tid, 'Tag');
    if (tg && (tg.flags & mask) !== 0) n++;
  }
  return n;
}

// ── 比较（唯一的一份） ──

export function compare(a: number, op: CmpOp, b: number): boolean {
  switch (op) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'gte': return a >= b;
    case 'gt': return a > b;
  }
}

// ── 条件求值（ConditionExpr = v1 布尔语法·global 与 self 同一份实现） ──

export function evalCondition(ctx: LogicCtx, expr: ConditionExpr): boolean {
  switch (expr.kind) {
    case 'always': return true;
    case 'and': return expr.of.every((e) => evalCondition(ctx, e));
    case 'or': return expr.of.some((e) => evalCondition(ctx, e));
    case 'not': return !evalCondition(ctx, expr.of);
    case 'resource': {
      const r = resolveResource(ctx, expr.id);
      if (!r) return false;
      // vsResource：与另一资源当前值比（动态阈值）；缺资源退回静态 value。self 下无意义（一实体一 Resource）→ 静态 value。
      const threshold = ctx.self === undefined && expr.vsResource
        ? (resolveResource(ctx, expr.vsResource)?.current ?? expr.value)
        : expr.value;
      return compare(r.current, expr.cmp, threshold);
    }
    case 'flag': {
      const f = resolveFlag(ctx, expr.id);
      if (!f) return false;
      return f.active === (expr.equals ?? true);
    }
    case 'state': {
      const s = resolveState(ctx, expr.fsmId);
      return s ? s.current === expr.equals : false;
    }
    case 'timer': {
      const t = resolveTimer(ctx, expr.id);
      return t ? compare(t.elapsed, expr.cmp, expr.value) : false;
    }
    case 'cooldown': {
      // t2-cooldown 槽就绪：self → 自身 Cooldowns；global → 创建序首个持有该槽的实体。无此槽 = 就绪（未配置不受约束）。
      const ready = resolveCooldownReady(ctx, expr.id);
      return ready === (expr.ready ?? true);
    }
    case 'string': {
      const s = resolveString(ctx, expr.id);
      return s ? s.value === expr.equals : false;
    }
  }
}

// ── 数值求值：缺失引用 → undefined（上层按「无效 = 不动」） ──

export function evalValue(ctx: LogicCtx, e: ValueExpr): number | undefined {
  if (typeof e === 'number') return e;
  if ('mul' in e) {
    let acc = 1;
    for (const x of e.mul) { const v = evalValue(ctx, x); if (v === undefined) return undefined; acc *= v; }
    return acc;
  }
  if ('add' in e) {
    let acc = 0;
    for (const x of e.add) { const v = evalValue(ctx, x); if (v === undefined) return undefined; acc += v; }
    return acc;
  }
  if ('res' in e) return resolveResource(ctx, e.res)?.current;
  if ('timer' in e) return resolveTimer(ctx, e.timer)?.elapsed;
  if ('count' in e) return countByTag(ctx.world, e.count); // 计数 0 是合法结果、不算缺失
  if ('flag' in e) { const f = resolveFlag(ctx, e.flag); return f ? (f.active ? 1 : 0) : undefined; }
  return undefined; // state/str 无数值
}

// ── 施效：唯一的一份 clamp / 布尔化 / 字符串化 ──

const truthy = (v: unknown): boolean => v === true || v === 'true';

export function applyWrite(ctx: LogicCtx, w: Write): WriteResult {
  const to = w.to;
  if ('res' in to) {
    const r = resolveResource(ctx, to.res);
    if (!r) return { ok: false, reason: 'missing-target' };
    const v = Number(w.value);
    // 非有限值（漏填得 NaN、±Infinity）绝不落进 world：NaN 钳不住、会污染确定性 hash → 整步跳过。
    if (!Number.isFinite(v)) return { ok: false, reason: 'invalid-value' };
    const next = w.op === 'mul' ? r.current * v : w.op === 'set' ? v : r.current + v;
    r.current = next < r.min ? r.min : next > r.max ? r.max : next;
    return { ok: true, v, after: r.current };
  }
  if ('flag' in to) {
    const f = resolveFlag(ctx, to.flag);
    if (!f) return { ok: false, reason: 'missing-target' };
    f.active = truthy(w.value);
    return { ok: true };
  }
  if ('state' in to) {
    const s = resolveState(ctx, to.state);
    if (!s) return { ok: false, reason: 'missing-target' };
    s.current = String(w.value);
    return { ok: true };
  }
  const sv = resolveString(ctx, to.str);
  if (!sv) return { ok: false, reason: 'missing-target' };
  sv.value = String(w.value);
  return { ok: true };
}

/** 由 Effect/Flow/Self 动词 kind + targetId 折出 Write 目标（按 id 路由的三种逻辑 kind）。 */
export function writeTargetOf(kind: 'set-flag' | 'modify-resource' | 'set-state', targetId: string): WriteTarget {
  return kind === 'set-flag' ? { flag: targetId } : kind === 'set-state' ? { state: targetId } : { res: targetId };
}
