import { t, type Schema } from '@engine/core/schema.js';

// ═══════════════════════════════════════════════════════════════
//  逻辑域子 schema（P1c）—— 与 protocol/components/logic.ts 的 TS 接口逐字对应；接口改字段这里同步改
//  （determinism/manifest 测试与全库蓝图 sweep 会抓不一致）。
//  这些是「承载玩法的嵌套数据」：条件树 / 流程动作 / 自治动作。此前 provides 里被声明成 'string'，零结构校验。
// ═══════════════════════════════════════════════════════════════

export const CmpOpSchema = t.enum(['lt', 'lte', 'eq', 'ne', 'gte', 'gt'] as const, '比较算子');

/** 布尔条件树（递归·按 kind 判别）。 */
export const ConditionExprSchema: Schema = t.lazy('ConditionExpr', () =>
  t.union(
    [
      t.obj({ kind: t.lit('always') }, '恒真'),
      t.obj({ kind: t.lit('and'), of: t.arr(ConditionExprSchema) }),
      t.obj({ kind: t.lit('or'), of: t.arr(ConditionExprSchema) }),
      t.obj({ kind: t.lit('not'), of: ConditionExprSchema }),
      t.obj({ kind: t.lit('resource'), id: t.str('Resource.id'), cmp: CmpOpSchema, value: t.num('阈值'), vsResource: t.opt(t.str('与另一资源当前值比（动态阈值）')) }),
      t.obj({ kind: t.lit('flag'), id: t.str('Flag.id'), equals: t.opt(t.bool('缺省 true')) }),
      t.obj({ kind: t.lit('state'), fsmId: t.str('State.fsmId'), equals: t.str('目标状态名') }),
      t.obj({ kind: t.lit('timer'), id: t.str('Timer.id'), cmp: CmpOpSchema, value: t.num('elapsed 阈值（tick）') }),
      t.obj({ kind: t.lit('string'), id: t.str('StringVar.id'), equals: t.str() }),
      t.obj({ kind: t.lit('cooldown'), id: t.str('Cooldowns 槽名'), ready: t.opt(t.bool('缺省 true=判就绪')) }),
    ],
    'kind',
  ),
  '布尔条件树 ConditionExpr（and/or/not + resource/flag/state/timer/string/cooldown 叶子·按语义 id 读世界值）');

export const ScalarValueSchema = t.union([t.num(), t.bool(), t.str()], undefined, '数值/布尔/字符串');

/** flow 动作（Effect 动词子集）。 */
export const FlowActionSchema = t.named('FlowAction', t.obj({
  kind: t.enum(['set-flag', 'set-state', 'modify-resource'] as const),
  targetId: t.str('Flag.id / State.fsmId / Resource.id（按 id 全局定位）'),
  value: t.opt(ScalarValueSchema),
  op: t.opt(t.enum(['add', 'set'] as const, 'modify-resource：add(默认)|set')),
}));

export const FlowTransitionSchema = t.named('FlowTransition', t.obj({
  when: t.opt(ConditionExprSchema),
  after: t.opt(t.num('进入当前状态满 after 个 tick 才允许转移')),
  to: t.str('目标状态 id'),
  do: t.opt(t.arr(FlowActionSchema)),
}));

export const FlowStateSchema = t.named('FlowState', t.obj({
  id: t.str(),
  onEnter: t.opt(t.arr(FlowActionSchema)),
  transitions: t.opt(t.arr(FlowTransitionSchema)),
}));

/** self-rule 动作（施于自身）。 */
export const SelfActionSchema = t.named('SelfAction', t.obj({
  kind: t.enum(['set-flag', 'modify-resource', 'set-state', 'destroy', 'spawn'] as const),
  value: t.opt(ScalarValueSchema),
  op: t.opt(t.enum(['add', 'set'] as const)),
  template: t.opt(t.str('spawn：PrefabLibrary 模板 id')),
  at: t.opt(t.enum(['self', 'target'] as const, 'spawn 位置（缺省 self）')),
}));
