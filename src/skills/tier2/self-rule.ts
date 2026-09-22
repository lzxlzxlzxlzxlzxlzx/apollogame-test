import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { ConditionExprSchema, SelfActionSchema } from '@engine/protocol/schemas/logic.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld, EntityId } from '@engine/core/types.js';
import type { SelfRule, SelfAction, ConditionExpr, DestroyRequest, Transform, Relation, SpawnRequest } from '@engine/protocol/components.js';
import { evaluateCondition, buildConditionLookup } from './condition.js';
import { evalCondition, selfCtx, applyWrite, writeTargetOf } from '@engine/logic/index.js';

// ═══════════════════════════════════════════════════════════════
//  self-rule —— 逻辑链的「实体本地(self)」作用域（REQ-021；引擎的"实体寻址轴"）。
//
//  前 5 个游戏的 Condition→Event→Effect 只碰**全局单例**（按 id 路由 lookup.resource(id) 找唯一持有者）。
//  自走棋等"动态多实体各自治"——100 个 prefab 展开的同模板单位，每个要"读自身 HP→自身死亡/狂暴"——
//  全局链表达不了（唯一 id 烘不进共享模板）。self-rule 补这格：**对每个挂 SelfRule 的实体，用其自身组件
//  求 when、对自身施 do**。mortal(自身资源≤阈值→destroy)、over-time 是它的特例，self-rule 是通用化。
//
//  复用 ConditionExpr，但按 **self 实体的组件**求值（非全局 id）：resource/flag/state/timer/string 各读
//  该实体自己那一份组件（一实体一 type，天然单份）；id 字段在 self 下作可选校验（给了且不符→该叶子 false）。
//  do 动作（set-flag/modify-resource/set-state/destroy）施于**自身**。
//  once：上升沿只施一次（armed 迟滞，仿 event-when edge）；缺省 level（条件成立每拍施）。
//  确定性：每实体只读/写**自身**组件 → 跨实体无干扰、与 query 遍历序无关；纯整数/IEEE 比较，录放一致。
// ═══════════════════════════════════════════════════════════════

// 对 self 实体的组件求值 ConditionExpr（P2a：与全局求值同一份内核实现·self 作用域=读自身那一份·id 空串通配）。
export function evaluateSelfCondition(world: IWorld, eid: EntityId, expr: ConditionExpr): boolean {
  return evalCondition(selfCtx(world, eid), expr);
}

function applySelfAction(world: IWorld, eid: EntityId, a: SelfAction): void {
  switch (a.kind) {
    // 三种逻辑动词走规则内核 applyWrite（P2a）：self 作用域·目标 = 自身那一份（id 通配）·唯一的一份 clamp。
    case 'set-flag':
    case 'modify-resource':
    case 'set-state': {
      applyWrite(selfCtx(world, eid), { to: writeTargetOf(a.kind, ''), op: a.op, value: a.value });
      break;
    }
    case 'destroy': {
      if (!world.hasComponent(eid, 'DestroyRequest')) {
        world.addComponent(eid, { type: 'DestroyRequest', entityId: eid } as DestroyRequest);
      }
      break;
    }
    case 'spawn': {
      // self 轴的 caster 对偶：自身条件触发自身生成。位置取自身或自身目标的 Transform。
      // at:'target' 无 Relation(target) → 不生成（目标存在性天然当战斗门，免全局 in_combat 旗标）。
      if (!a.template) break;
      const originId = a.at === 'target'
        ? (() => { const rel = world.getComponent<Relation>(eid, 'Relation'); return rel && rel.kind === 'target' ? rel.targetId : undefined; })()
        : eid;
      if (!originId) break;
      const t = world.getComponent<Transform>(originId, 'Transform');
      if (!t) break;
      // SpawnRequest 挂自身（一实体一组件：同拍多个 spawn 动作会相互覆盖，普攻一拍一发不受影响）。
      world.addComponent(eid, { type: 'SpawnRequest', templateId: a.template, x: t.x, y: t.y, source: eid } as SpawnRequest); // source(REQ-F-065)=普攻发起者自身（普攻链的施法者）
      break;
    }
  }
}

export const selfRuleCapability = defineCapability({
  id: 't2-self-rule',
  version: '1.0.0',

  describe: {
    name: 'self-rule',
    summary: '逻辑链的实体本地(self)作用域：对每个挂 SelfRule 的实体，用其自身组件求 when 条件、对自身施 do 动作（set-flag/modify-resource/set-state/destroy）。补"动态多实体各自治"缺口（全局 id 路由表达不了）。',
    semantic: ['tier2', 'logic', 'self', 'autonomy'],
    whenToUse:
      '动态多实体各自治（自走棋单位、弹幕敌群、塔防、组队 RPG 成员）：每个实体"读自身条件→对自身施效"。挂 SelfRule{when(读自身),do(施自身),once?}。与全局 event-when/effect-apply 互补（那是全局单例，这是 per-entity self）。',
    examples: [
      '单位死亡：SelfRule{ when:{kind:"resource",cmp:"lte",value:0}, do:[{kind:"destroy"}] }（=通用化的 mortal）',
      '血<30% 狂暴（一次）：SelfRule{ when:{kind:"resource",id:"hp",cmp:"lt",value:30}, do:[{kind:"set-flag",targetId-不需,value:true}], once:true }（置自身 berserk Flag）',
      '满怒气清零（每拍检）：SelfRule{ when:{kind:"resource",id:"rage",cmp:"gte",value:100}, do:[{kind:"modify-resource",op:"set",value:0}] }',
    ],
  },

  components: {
    provides: {
      SelfRule: defineComponent('SelfRule', {
        when: ConditionExprSchema,
        do: t.arr(SelfActionSchema, 'SelfAction[]：施于自身；spawn 发 SpawnRequest(at self/target)'),
        once: t.opt(t.bool('true=条件上升沿只施一次（armed 迟滞，回落复位）；缺省=条件成立每拍施')),
        armed: t.opt(t.bool('内部（once 迟滞状态）')),
        whenGlobal: t.opt(ConditionExprSchema),
      }, {
        category: 'config',
        describe: '实体本地规则：对自身组件求 when、对自身施 do。once=上升沿一次（迟滞）；缺省每拍。whenGlobal=按全局 id 求值的阶段门(REQ-F-035)，与 when 取 AND。',
      }),
    },
    reads: ['SelfRule', 'Resource', 'Flag', 'State', 'Timer', 'StringVar', 'Transform', 'Relation', 'Cooldowns'],
    writes: ['SelfRule', 'Flag', 'Resource', 'State', 'DestroyRequest', 'SpawnRequest'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'self-rule',
      phase: SystemPhase.Update,
      // REQ-F-035 排雷 + REQ-F-036 二刷：self-rule 与 flow/zone-occupancy/group-count/resource-apply
      // 互为 RMW（Flag/Resource/State）；且 self-rule 写 Resource 被 hitbox 读（攻防数值）→ 经
      // hitbox→(ResourceModify)→resource-apply 闭成三元环（F-036 实测残环的真核，报错列的 10 系统
      // = 环 + Kahn 剩余下游）。显式 runsAfter 钉死语义方向：**决策系统坐结算链尾**——先定相位(flow)/
      // 判定伤害(hitbox)/落账(resource-apply)/数清事实(占位/计数)，单位再据**本拍终值**自治行动；
      // whenGlobal 的同帧阶段门依赖 flow 先行。注意不可反向（runsBefore hitbox 会与既有显式链
      // hitbox→resource-apply→self-rule 合成显式环，无解）。写 SpawnRequest/DestroyRequest 与
      // caster/mortal 仅为同汇（请求集合语义，writer 间无需定序）。无这些系统的世界 id 被忽略。
      runsAfter: ['flow', 'resource-apply', 'hitbox', 'zone-occupancy', 'group-count'],
      reads: ['SelfRule', 'Resource', 'Flag', 'State', 'Timer', 'StringVar', 'Transform', 'Relation', 'Cooldowns'],
      writes: ['SelfRule', 'Flag', 'Resource', 'State', 'DestroyRequest', 'SpawnRequest'],
      consumes: [],
      execute(world: IWorld) {
        // REQ-F-035 全局阶段门：id→全局容器索引。lazy——仅存在带 whenGlobal 的规则时构建一次。
        let lookup: ReturnType<typeof buildConditionLookup> | null = null;
        for (const [eid] of world.query('SelfRule')) {
          const rule = world.getComponent<SelfRule>(eid, 'SelfRule')!;
          // 全局门先求值（与 when 取 AND，短路）：备战/结算期 in_combat=false → 整条跳过
          // （armed 不动：once 规则跨相位保持待发，开战后首个自身上升沿才触发）。
          if (rule.whenGlobal) {
            if (!lookup) lookup = buildConditionLookup(world);
            if (!evaluateCondition(world, rule.whenGlobal, lookup)) continue;
          }
          const now = evaluateSelfCondition(world, eid, rule.when);
          let fire = false;
          if (rule.once) {
            if (now && !rule.armed) { fire = true; rule.armed = true; }
            else if (!now) { rule.armed = false; } // 回落复位（下次上升沿再触发）
          } else {
            fire = now; // level：条件成立每拍施
          }
          if (fire) for (const a of rule.do) applySelfAction(world, eid, a);
        }
      },
    },
  ],
});
