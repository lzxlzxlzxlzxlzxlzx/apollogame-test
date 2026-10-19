import { defineCapability } from '@engine/core/define-capability.js';
import type { Tag, GroupCount } from '@engine/protocol/components.js';
import { buildConditionLookup } from './condition.js';
import { clamp } from '@engine/math/scalar.js';

// group-count —— 集合读：按 Tag 掩码数全场实体 → 写数值 Resource（REQ-022，实体寻址轴「集合计数」端）。
//
// 自走棋羁绊（场上战士数）、波次清场（敌人数→0）、人口/难度档、阵营兵力对比（两 count 经 vsResource 比）
// 全是「一组实体的数量」这个**数值事实**。Zone 是空间+布尔（矩形占据达标→旗标），表达不了它——这是真缺口。
//
// 刻意不做的（Lead 裁剪，manifesto §4 先重组）：
//   - 原案 thresholds:[{at,signal}] 越阈值锁存发信号 → 回驳。event-when{resource cmp, mode:'edge'} 的
//     armed 迟滞就是这个语义；多档阈值（3/6/9 羁绊）= 多个 EventWhen 实体。本能力只产数值事实。
//   - 原案 owner 过滤字段 → 回驳。requiredTag 用「含齐」(ALL-bits) 语义后，归属=再加一个 Tag bit
//     （P1_BIT|WARRIOR_BIT 即"P1 的战士"），无需第二个过滤维度。
//
// requiredTag 语义=「含齐」（(flags & mask) === mask，与 Status.requireMask 同款；Zone.requiredTag 是
// 「位与非零」ANY 语义——单 bit 时两者等价，多 bit 时本能力取交集，组合性更强）。缺省/0=数所有带 Tag 实体。
// 写入：每 tick 把数量 **set** 进 countResource（钳 [min,max]）——派生事实，与 stats.effective 同范式。
// 确定性：纯整数计数与遍历序无关；写侧按 id 全局路由（与 Condition 读侧对称）。
// 定序：writes Resource → 组件拓扑自动排在 event-when（读 Resource）之前，同 tick 即可触发阈值信号。
export const groupCountCapability = defineCapability({
  id: 't2-group-count',
  version: '1.0.0',

  describe: {
    name: 'group-count',
    summary: '按 Tag 掩码（含齐语义）数全场实体，把数量写进一个 Resource（set+钳限）。羁绊层数/波次存活数/人口/兵力对比的数值事实来源；越阈值发信号交给 event-when(edge) 重组。',
    semantic: ['tier2', 'logic', 'set-read', 'count'],
    whenToUse:
      '需要「一组实体的数量」作为可被 condition/event-when 读的数值时。挂 GroupCount{countResource, requiredTag}；阈值信号用 event-when{kind:resource,cmp,mode:edge} 接在 countResource 上（多档=多个 EventWhen）。',
    examples: [
      '羁绊：GroupCount{ countResource:"warrior_count", requiredTag:WARRIOR_BIT } + EventWhen{ when:{kind:"resource",id:"warrior_count",cmp:"gte",value:3}, mode:"edge", signal:"synergy_warrior" }',
      '波次清场：GroupCount{ countResource:"enemies_alive", requiredTag:ENEMY_BIT } + EventWhen{ when:{kind:"resource",id:"enemies_alive",cmp:"lte",value:0}, mode:"edge", signal:"wave_clear" }',
      'P1 的战士（owner=再加一个 bit）：GroupCount{ countResource:"p1_warriors", requiredTag:P1_BIT|WARRIOR_BIT }',
    ],
  },

  components: {
    provides: {
      GroupCount: {
        category: 'config',
        describe: '声明「数 Tag 含齐 requiredTag 的实体 → 数量 set 进 countResource」。缺省/0 掩码=数所有带 Tag 实体。',
        fields: {
          countResource: { type: 'string', describe: '计数写入的 Resource id（按 id 全局定位，set+钳 [min,max]）' },
          requiredTag: { type: 'number', describe: 'Tag.flags 须含齐此掩码（ALL-bits 交集语义）；缺省/0=所有带 Tag 实体' },
        },
      },
    },
    reads: ['GroupCount', 'Tag', 'Resource'],
    writes: ['Resource'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'group-count',
      // 与 resource-apply 同为 Update 段 Resource 读改写 → 按库内惯例显式 runsBefore 打破 RMW 伪环
      // （同 poker-eval/card-score-pass/dialogue/match3）。写 Resource → 拓扑自动排在 event-when（读侧）之前。
      // REQ-F-052：onBoard 过滤读 HexPos **存在性**——HexPos 由 drag-place/grid-move 在 Update 写，
      // 此处申报读侧让调度器知情（同拍读到拖拽后的最新放置状态）。
      runsBefore: ['resource-apply'],
      reads: ['GroupCount', 'Tag', 'Resource', 'HexPos'],
      writes: ['Resource'],
      consumes: [],
      execute(world) {
        const counters = world.query('GroupCount');
        if (counters.length === 0) return;

        // 一次扫描 Tag 实体，逐 counter 累加（多 counter 共享同一遍历；计数与序无关 → 确定性）。
        const counts = new Array<number>(counters.length).fill(0);
        const specs = counters.map(([cid]) => {
          const gc = world.getComponent<GroupCount>(cid, 'GroupCount');
          return { mask: gc?.requiredTag ?? 0, onBoard: gc?.onBoard };
        });
        for (const [eid] of world.query('Tag')) {
          const flags = world.getComponent<Tag>(eid, 'Tag')!.flags;
          for (let i = 0; i < counters.length; i++) {
            if ((flags & specs[i].mask) !== specs[i].mask) continue;
            // 上板过滤（REQ-F-052）：true=须在板（带 HexPos）、false=须在席（不带）、缺省=不过滤。
            if (specs[i].onBoard !== undefined && world.hasComponent(eid, 'HexPos') !== specs[i].onBoard) continue;
            counts[i]++;
          }
        }

        const lookup = buildConditionLookup(world);
        for (let i = 0; i < counters.length; i++) {
          const gc = world.getComponent<GroupCount>(counters[i][0], 'GroupCount');
          if (!gc) continue;
          const r = lookup.resource(gc.countResource);
          if (!r) continue; // 目标资源不存在 → 不动（与 effect-apply 同容错；引用校验归 manifest 链接器）
          const v = counts[i];
          r.current = clamp(v, r.min, r.max);
        }
      },
    },
  ],
});
