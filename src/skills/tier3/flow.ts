import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { FlowStateSchema } from '@engine/protocol/schemas/logic.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { GameFlow, FlowState, FlowAction } from '@engine/protocol/components.js';
import { evaluateCondition, buildConditionLookup } from '@skills/tier2/condition.js';
import { applyWrite, ctxOf, writeTargetOf } from '@engine/logic/index.js';

// ═══════════════════════════════════════════════════════════════
//  flow —— 声明式「游戏流程状态机」解释器（REQ-020；Tier3 解释器型，与 dialogue 同构）。
//
//  游戏流程（菜单→关卡→结算→商店、回合/拍、波次、通关/失败…）= **一份 GameFlow 数据**：
//    states:[ {id, onEnter:[动作], transitions:[{when:条件, to:目标, do:[动作]}]} ]
//  读起来像线性瀑布脚本，本质是数据：when 复用 ConditionExpr（受控表达式树）、动作复用 Effect 动词子集。
//
//  为什么建它（manifesto 治理精确化）：流程**散件能重组**（EventWhen+Effect+State 一堆实体），但那形态
//  **最弱 LLM 难一致产出**（散落、信号对齐、顺序敏感）——而不变量②（最弱 LLM 一致）才是真目的。
//  flow 不加表达力，加的是**可创作性/一致性**：把流程收成一份可读声明式数据。**红线：闭语法，不收自由代码。**
//
//  解释器（每 tick，Update 早段，runsBefore poker-eval/resource-apply 让流程动作先于本拍其余结算）：
//    ① onEnter（edge）：刚进当前状态（entered=false）→ 跑 onEnter 动作 → entered=true。
//    ② 转移：按数组序求值 transitions，**首个 when 成立**者 → 跑其 do 动作 → current=to、entered=false（次拍跑新 onEnter）。
//  确定性：转移按声明序短路、动作就地施加、条件树确定；entered 进 snapshot → 录放一致。
// ═══════════════════════════════════════════════════════════════

// 施加一条流程动作（动词=Effect 子集 set-flag/set-state/modify-resource）。P2a：走规则内核 applyWrite（global 寻址·
// 唯一的一份 clamp）；lookup 复用同一 tick 的 id 索引。
function applyAction(world: IWorld, lookup: ReturnType<typeof buildConditionLookup>, a: FlowAction): void {
  applyWrite(ctxOf(world, lookup), { to: writeTargetOf(a.kind, a.targetId), op: a.op, value: a.value });
}

export const flowCapability = defineCapability({
  id: 't3-flow',
  version: '1.0.0',

  describe: {
    name: 'flow',
    summary: '声明式游戏流程状态机解释器：读 GameFlow{states:[{id,onEnter,transitions:[{when,to,do}]}]} 数据，跑 onEnter(edge) + 按序求值转移(首个 when 成立即跳)。流程=数据，读如线性瀑布脚本。',
    semantic: ['tier3', 'flow', 'fsm', 'interpreter'],
    whenToUse:
      '任何游戏流程/状态机：菜单→关卡→结算→商店、回合/拍循环、波次、通关/失败判定。挂一个 GameFlow{id,current,states}；when 复用 ConditionExpr，动作用 set-flag/set-state/modify-resource。取代散落的 EventWhen/Effect 流程实体。',
    examples: [
      '回合：states:[{id:"playing",transitions:[{when:{kind:"resource",id:"round_score",cmp:"gte",value:0,vsResource:"blind"},to:"won"},{when:{kind:"resource",id:"hands_left",cmp:"lte",value:0},to:"lost"}]},{id:"won",onEnter:[{kind:"set-flag",targetId:"cleared",value:true}]}]',
      '线性瀑布：{id:"deal",onEnter:[{kind:"modify-resource",targetId:"hands_left",op:"set",value:4}],transitions:[{when:{kind:"always"},to:"select"}]}',
    ],
  },

  components: {
    provides: {
      GameFlow: defineComponent('GameFlow', {
        id: t.str('flow 标识（多 flow 区分）'),
        current: t.str('当前状态 id'),
        states: t.arr(FlowStateSchema, 'FlowState[]：{id,onEnter?:FlowAction[],transitions?:[{when?:ConditionExpr,after?,to,do?:FlowAction[]}]}'),
        entered: t.opt(t.bool('内部：当前状态 onEnter 是否已跑（转移后置 false）')),
        elapsed: t.opt(t.num('内部：进入当前状态后经过的 tick 数（after 时序门）')),
      }, {
        category: 'config',
        describe: '声明式流程状态机（数据）。current=当前状态 id；states=状态列表（onEnter 动作 + 带 when 条件的转移）。',
      }),
    },
    reads: ['GameFlow', 'Resource', 'Flag', 'State', 'Cooldowns', 'Timer', 'StringVar'], // Timer/StringVar：条件树 kind:'timer'/'string' 经 engine/logic 读（P1a 严格模式漏报·game-f 慢车道 2026-09-10 抓出）
    writes: ['GameFlow', 'Resource', 'Flag', 'State'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'flow',
      phase: SystemPhase.Update,
      // 流程动作（改 flag/state/resource）应先于本拍其余结算被看见；与 condition 读侧同 Update，显式排前。
      runsBefore: ['poker-eval', 'resource-apply', 'string-apply', 'event-when'],
      // REQ-F-028：flow 与 zone-occupancy(都 RMW Flag)、与 group-count(都 RMW Resource) 各成 RMW 伪环。
      // 显式 runsAfter 覆盖反向组件推断边破环（同 REQ-F-025）。语义：先数清占位/羁绊等派生事实，
      // flow 再据此判阶段转移。与上方 runsBefore 合成一致偏序：zone-occupancy/group-count → flow → event-when/resource-apply。
      runsAfter: ['zone-occupancy', 'group-count'],
      reads: ['GameFlow', 'Resource', 'Flag', 'State', 'Cooldowns', 'Timer', 'StringVar'], // Timer/StringVar：条件树 kind:'timer'/'string' 经 engine/logic 读（P1a 严格模式漏报·game-f 慢车道 2026-09-10 抓出）
      writes: ['GameFlow', 'Resource', 'Flag', 'State'],
      consumes: [],
      execute(world: IWorld) {
        const lookup = buildConditionLookup(world);
        for (const [eid] of world.query('GameFlow')) {
          const flow = world.getComponent<GameFlow>(eid, 'GameFlow')!;
          const state: FlowState | undefined = flow.states.find((s) => s.id === flow.current);
          if (!state) continue; // 未知状态 id（数据错）→ 不动
          // ① onEnter（edge）：刚进该状态跑一次；同时把"驻留 tick 数" elapsed 归零起算。
          if (!flow.entered) {
            for (const a of state.onEnter ?? []) applyAction(world, lookup, a);
            flow.entered = true;
            flow.elapsed = 0;
          } else {
            flow.elapsed = (flow.elapsed ?? 0) + 1; // 进入后每拍累计（驱动 after 时序门）
          }
          // ② 转移：按声明序，首个「when 成立 且 满 after」者跳。
          //    when 缺省=always（线性瀑布）；after 缺省=0（无时延）。两者「与」→ Kismet 条件 + Matinee 时间轴。
          for (const t of state.transitions ?? []) {
            const cond = t.when ?? { kind: 'always' as const };
            const timed = t.after === undefined || (flow.elapsed ?? 0) >= t.after;
            if (timed && evaluateCondition(world, cond, lookup)) {
              for (const a of t.do ?? []) applyAction(world, lookup, a);
              flow.current = t.to;
              flow.entered = false; // 次拍跑新状态 onEnter + elapsed 归零
              break;
            }
          }
        }
      },
    },
  ],
});
