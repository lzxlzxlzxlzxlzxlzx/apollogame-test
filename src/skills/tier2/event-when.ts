import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { ConditionExprSchema } from '@engine/protocol/schemas/logic.js';
import type { EventWhen, Signal } from '@engine/protocol/components.js';
import { evaluateCondition, buildConditionLookup } from './condition.js';

// event-when —— B 轴逻辑枢纽的最简版：「条件成立 → 发信号」。
//
// 每个 EventWhen 实体声明一棵布尔条件树 `when` + 信号名 `signal` + 触发模式 `mode`：
//   - level：条件为真时每帧都发信号（如「两人都在台上时台子亮着」）。
//   - edge ：上升沿（false→true）只发一次，条件回落（→false）后复位再武装（迟滞，如「好感越过 60 只弹一次」）。
// 触发即在 `signal:<eid>` 实体上产出 Signal{name, source}，每帧先清后标，供下游消费。
//
// 设计边界（已与 owner 敲定）：只发信号，不直接改世界（Effect 后置）。`armed` 是纯 POD，
// 随 world.snapshot() 走 → 边沿检测在 lockstep / 录放下确定。
export const eventWhenCapability = defineCapability({
  id: 't2-event-when',
  version: '1.0.0',

  describe: {
    name: 'event-when',
    summary: '条件成立时发信号：读 EventWhen + 求值布尔条件树（resource/flag/state 叶子），edge/level 触发 → 产出 Signal。',
    semantic: ['tier2', 'logic', 'condition', 'event'],
    whenToUse:
      '需要「某组合条件成立时触发一个信号」时。声明 EventWhen{ signal, when, mode }；下游 query Signal 消费。threshold/状态判定/机关门控都用它，不必各写一套。',
    examples: [
      '好感越过 60：EventWhen{ signal:"S_love_60", when:{kind:"resource",id:"affection_S",cmp:"gte",value:60}, mode:"edge" }',
      '机关门控：when = and(flagA, flagB) → 门开信号',
      '重量台：when = and(plate_p1, plate_p2)，mode:"level" → 台子持续激活',
    ],
  },

  components: {
    provides: {
      EventWhen: defineComponent('EventWhen', {
        signal: t.str('触发时产出的信号名'),
        when: ConditionExprSchema,
        mode: t.enum(['edge', 'level'] as const, "触发模式：edge=上升沿一次(迟滞)；level=为真时每帧持续"),
        armed: t.bool('边沿检测内部状态（初始 false）'),
        source: t.opt(t.entity('代发：产出的 Signal.source 填这个实体而非本实体。给**按 source 认人**的消费方用（如 matrix-duel 出招接缝按侧认人）；缺省=本实体')),
      }, {
        category: 'config',
        describe: '声明「条件 → 信号」：条件树 when + 信号名 signal + 触发模式 mode + 边沿状态 armed。',
      }),
      Signal: defineComponent('Signal', {
        name: t.str('信号名（= EventWhen.signal）'),
        source: t.entity('发出信号的 EventWhen 实体 id'),
        arg: t.opt(t.str('可选参数载荷（带参动作·如「买哪件」card_42）')),
      }, {
        category: 'event',
        describe: '某 EventWhen 这帧触发了。每帧先清后标，直接挂在该 EventWhen 实体上，下游 query Signal 消费。',
      }),
    },
    reads: ['EventWhen', 'Resource', 'Flag', 'State', 'Timer', 'StringVar', 'Cooldowns'], // Timer/StringVar：条件树 kind:'timer'/'string' 经 buildConditionLookup 读（P1a 严格模式补齐·此前漏报）
    writes: ['Signal', 'EventWhen'], // EventWhen：edge 模式改自身 armed（P1a 严格模式补齐·此前漏报）
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'event-when',
      reads: ['EventWhen', 'Resource', 'Flag', 'State', 'Timer', 'StringVar', 'Cooldowns'], // Timer/StringVar：条件树 kind:'timer'/'string' 经 buildConditionLookup 读（P1a 严格模式补齐·此前漏报）
      writes: ['Signal', 'EventWhen'], // EventWhen：edge 模式改自身 armed（P1a 严格模式补齐·此前漏报）
      consumes: [],
      execute(world) {
        // 每帧重算：先清掉上一帧的 Signal（直接挂在 EventWhen 实体上，removeComponent 即可，
        // 不销毁/重建实体 → 规避 V8 内存碎片与 GC 停顿，Reviewer #4）。
        for (const [sid] of world.query('Signal')) world.removeComponent(sid, 'Signal');

        // 本帧按 id 建一次索引，供所有条件求值 O(1) 复用（Reviewer #3）。
        const lookup = buildConditionLookup(world);

        for (const [eid] of world.query('EventWhen')) {
          const ew = world.getComponent<EventWhen>(eid, 'EventWhen')!;
          const now = evaluateCondition(world, ew.when, lookup);

          let fire = false;
          if (ew.mode === 'level') {
            fire = now;
          } else {
            // edge：上升沿触发一次，回落复位（迟滞）。
            if (now && !ew.armed) {
              fire = true;
              ew.armed = true;
            } else if (!now) {
              ew.armed = false;
            }
          }

          // 信号直接挂在本 EventWhen 实体上（Signal 逻辑从属于它），下游照样 query('Signal') 消费。
          // `source`：缺省=本实体（零回归）；填了=代发给该实体（REQ-108-ENG-05·见组件注释）。
          // 代发只改 `Signal.source` 这一个字段，**不改信号的生命周期**（仍挂本实体、仍每帧先清后标）。
          if (fire) {
            // 代发落盘门：空串 = 永不自愈的数据错（发出去的信号没有主体，按 source 认人的
            // 消费方只会静默认不到）——点名硬抛，不静默退回 eid（同本库「坏数据不许静默」教条）。
            if (ew.source !== undefined && ew.source === '') {
              throw new Error(`event-when: 实体 "${eid}" 的 EventWhen.source 是空串（代发要填真实体 id；不代发就别填这个字段）`);
            }
            world.addComponent(eid, { type: 'Signal', name: ew.signal, source: ew.source ?? eid } as Signal);
          }
        }
      },
    },
  ],
});
