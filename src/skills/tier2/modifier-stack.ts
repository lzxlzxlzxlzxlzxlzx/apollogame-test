import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { ConditionExpr, ModifierSource, ModifierTotals, ModifierOp } from '@engine/protocol/components.js';
import { evaluateCondition, buildConditionLookup, type ConditionLookup } from './condition.js';
import { cmpStr } from '@engine/math/scalar.js';

// ═══════════════════════════════════════════════════════════════
//  modifier-stack —— 修正聚合栈（REQ-CAP 下沉·最难那件）的**确定性纯函数核 + Update 相位系统**。
//
//  「一堆声明式修正贡献（字段表）+ 每字段合并策略 + 条件门控 → 一张聚合总表」这个模式在库里出现三次却
//  各写一套：game-e 小丑计分（add/mul 作用 chips/mult/money + 门控 + countTag）、game-g 天罡 TengangFx
//  （逐字段 +=/取最大）、game-g 地煞 DishaFx（逐字段 sum/max/or 策略）。t2-stats 只覆盖其**实体属性特例**
//  （(base+Σadd)×Πmul、无门控、无 max/or/floor 字段策略），表达不了「字段表 + 混合合并策略 + 门控」——真缺口。
//
//  双形态（照 dice.ts 先例）：
//    · aggregateModifiers(rows, ctx, base?) —— 纯函数核，确定性聚合（order→id 排序、固定应用序），可无头单测。
//    · modifier-stack 系统 —— 每 tick 收集全场 ModifierSource（一实体一条）→ 聚合 → 写全部 ModifierTotals。
//
//  应用序铁律（对齐 clash-resolve 已文档化的 pEff 序 base+Σadd → ×Πmul → floor → clamp）：
//    add → mul → max → min → or → floor。组内先 order 升序、再 id 升序（乘性非交换 → 必须显式定序）。
//  确定性：只做整数/IEEE 算术 + 字符串比较；聚合与遍历序无关（先排序）→ lockstep / 录放安全，绝不 Math.random。
// ═══════════════════════════════════════════════════════════════

// 一条修正行（= ModifierSource 组件去掉 type）。纯函数核以行数组为输入，不依赖 World。
export interface ModifierRow {
  id: string;
  target: string;
  op: ModifierOp;
  value?: number;
  valueFrom?: { resourceId: string; scale?: number };
  gate?: ConditionExpr;
  order?: number;
}

// 聚合上下文：valueFrom 读资源当前值、gate 求值。gate 复用 condition.ts 求值器（见 modifierCtx）。
export interface ModifierCtx {
  resource(id: string): number | undefined; // Resource(id).current
  gate(expr: ConditionExpr): boolean; // 条件门求值
}

// 从 World 构建 ctx —— **复用 tier2/condition.ts 的既有求值器**（buildConditionLookup + evaluateCondition），
// 与 event-when 读 Resource/Flag/State 的惯例对齐（同一 lookup、同一叶子语义）。
export function modifierCtx(world: IWorld, lookup: ConditionLookup = buildConditionLookup(world)): ModifierCtx {
  return {
    resource: (id) => lookup.resource(id)?.current,
    gate: (expr) => evaluateCondition(world, expr, lookup),
  };
}

// 一行的数值贡献：valueFrom 优先（资源 current × scale），否则静态 value（缺省 0）。
function rowValue(row: ModifierRow, ctx: ModifierCtx): number {
  if (row.valueFrom) return (ctx.resource(row.valueFrom.resourceId) ?? 0) * (row.valueFrom.scale ?? 1);
  return row.value ?? 0;
}

// 一行的布尔贡献（op:'or'）：无 value 视作 true；value=0 视作 false；否则 Boolean(value)。
function rowBool(row: ModifierRow): boolean {
  return row.value === undefined ? true : Boolean(row.value);
}

/**
 * 确定性聚合一组修正行 → { target: 值 } 总表。
 *  - gate 不成立的行剔除；其余按 order 升序、再 id 升序稳定排序（乘性非交换 → 序必须确定）。
 *  - 按 target 分组，逐 target 走固定应用序：add → mul → max → min → or → floor。
 *  - 数值 target 起点 = base[target] ?? 0（消费方可注入 base，如 clash-resolve 的基础点数）；
 *    纯 'or' target（组内全是 or）起点 = base[target] ?? false，产出布尔。
 * 纯函数（除读 ctx.resource/ctx.gate 外无副作用）；同输入 → 同输出。
 */
export function aggregateModifiers(
  rows: readonly ModifierRow[],
  ctx: ModifierCtx,
  base: Readonly<Record<string, number | boolean>> = {},
): Record<string, number | boolean> {
  const active = rows
    .filter((r) => r.gate === undefined || ctx.gate(r.gate))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || cmpStr(a.id, b.id));

  const byTarget = new Map<string, ModifierRow[]>();
  for (const r of active) {
    const g = byTarget.get(r.target);
    if (g) g.push(r);
    else byTarget.set(r.target, [r]);
  }

  const out: Record<string, number | boolean> = { ...base };
  for (const [target, group] of byTarget) {
    if (group.every((r) => r.op === 'or')) {
      // 纯布尔字段（DishaFx 的 firstStrike/noRout/phalanxAdj8…）。
      let v = Boolean(base[target] ?? false);
      for (const r of group) v = v || rowBool(r);
      out[target] = v;
      continue;
    }
    // 数值字段：base + Σadd → ×Πmul → max → min → floor（floor=末端下限钳）。
    let v = typeof base[target] === 'number' ? (base[target] as number) : 0;
    for (const r of group) if (r.op === 'add') v += rowValue(r, ctx);
    for (const r of group) if (r.op === 'mul') v *= rowValue(r, ctx);
    for (const r of group) if (r.op === 'max') v = Math.max(v, rowValue(r, ctx));
    for (const r of group) if (r.op === 'min') v = Math.min(v, rowValue(r, ctx));
    for (const r of group) if (r.op === 'floor') v = Math.max(v, rowValue(r, ctx));
    out[target] = v;
  }
  return out;
}

export const modifierStackCapability = defineCapability({
  id: 't2-modifier-stack',
  version: '1.0.0',

  describe: {
    name: 'modifier-stack',
    summary:
      '修正聚合栈：收集全场 ModifierSource（每条 {target,op,value/valueFrom,gate,order}）→ 按固定应用序 add→mul→max→min→or→floor 确定性聚合成一张 ModifierTotals.totals（字段表 + 每字段混合合并策略 + 条件门控）。stats 是它的实体属性特例。',
    semantic: ['tier2', 'logic', 'aggregation', 'modifier'],
    whenToUse:
      '把「一堆声明式修正贡献 → 一张聚合总表」下沉为数据时（计分修正 chips/mult、战斗修正的逐字段 sum/max/or、buff 汇总）。挂多条 ModifierSource（一实体一条）+ 一个 ModifierTotals 单例；消费方读 totals 与自身 base 结合。逐字段单策略用它；实体级 (base+add)×mul 用 t2-stats。',
    examples: [
      "计分修正：ModifierSource{ id:'joker', target:'mult', op:'add', value:4 } + ModifierSource{ id:'duo', target:'mult', op:'mul', value:2, gate:{kind:'flag',id:'has_pair'} } → totals.mult",
      "动态量：ModifierSource{ id:'bull', target:'chips', op:'add', valueFrom:{resourceId:'money', scale:2} }（每 $1 +2 筹）",
      "逐字段策略：ModifierSource{ id:'thermopylae', target:'homeHp', op:'max', value:2 } + ModifierSource{ id:'burnboats', target:'noRout', op:'or' }（取大 / 布尔或）",
    ],
  },

  components: {
    provides: {
      ModifierSource: {
        category: 'config',
        describe: '一条修正行：对字段 target 施合并算子 op（add/mul/max/min/or/floor）；量取静态 value 或 valueFrom 资源×scale；gate 门控；order 定聚合序。一实体一条，系统收集全场聚合。',
        fields: {
          id: { type: 'string', describe: '修正行稳定标识（同 order 时 id 升序 tie-break）' },
          target: { type: 'string', describe: '作用字段 id（聚合结果按 target 归入 totals）' },
          op: { type: 'string', describe: "合并算子 add|mul|max|min|or|floor（应用序固定：add→mul→max→min→or→floor）" },
          value: { type: 'number', describe: '静态贡献量（缺省 0；op:or 缺省 true、value=0 为 false）' },
          valueFrom: { type: 'string', describe: '动态量 {resourceId,scale?}：value = Resource.current × (scale ?? 1)' },
          gate: { type: 'string', describe: '条件门 ConditionExpr（不成立则本行不参与聚合；复用 condition 求值器）' },
          order: { type: 'number', describe: '聚合序（缺省 0；同 op 相位内 order 升序、再 id 升序）' },
        },
      },
      ModifierTotals: {
        category: 'render',
        describe: '聚合总表（系统每 tick 从全场 ModifierSource 重算写入）：target → 聚合值。消费方读取后与自身 base 结合。',
        fields: {
          totals: { type: 'string', describe: '按 target 归组的聚合值表 {[target]: number|boolean}' },
        },
      },
    },
    reads: ['ModifierSource', 'ModifierTotals', 'Resource', 'Flag', 'State', 'Timer', 'StringVar'],
    writes: ['ModifierTotals'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'modifier-stack',
      reads: ['ModifierSource', 'ModifierTotals', 'Resource', 'Flag', 'State', 'Timer', 'StringVar'],
      writes: ['ModifierTotals'],
      consumes: [],
      execute(world: IWorld) {
        const sinks = world.query('ModifierTotals');
        if (sinks.length === 0) return; // 无消费口 → 不聚合（同 group-count：目标不存在则不动）

        const rows: ModifierRow[] = [];
        for (const [eid] of world.query('ModifierSource')) {
          const ms = world.getComponent<ModifierSource>(eid, 'ModifierSource');
          if (ms) rows.push(ms); // ModifierSource 结构上即 ModifierRow（多一个 type 字段，聚合忽略）
        }

        // 每 tick 从 0/false 起**全量重算**并 set（幂等，同 group-count；绝不把上帧聚合当 base → 无累积漂移）。
        // 需要「base + 聚合」的消费方（如 clash-resolve 的基础点数）自行读 totals 与其 base 结合，或直调纯函数核传 base。
        const ctx = modifierCtx(world);
        for (const [tid] of sinks) {
          const mt = world.getComponent<ModifierTotals>(tid, 'ModifierTotals');
          if (mt) mt.totals = aggregateModifiers(rows, ctx);
        }
      },
    },
  ],
});
