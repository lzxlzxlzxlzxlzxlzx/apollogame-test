import { defineCapability } from '@engine/core/define-capability.js';
import type { Transform, Tag, Zone } from '@engine/protocol/components.js';
import { buildConditionLookup } from './condition.js';

// zone-occupancy —— 声明式区域占据目标（REQ-006，把 coop-goal 这类游戏专属胜负代码下沉成通用能力）。
//
// 每个 Zone 声明一个世界矩形 + 目标选择器 + 数量阈值 + 输出旗标。系统每 tick 数「中心点落入矩形」的匹配目标，
// 达到阈值 → 置 outFlag.active=true，否则 false（level 语义，和 coop-goal 一致：进则亮、离则灭）。
//
// 选择器二选一：
//   - requiredEntities：指定实体名单（如双人协作的两名玩家）；阈值缺省 = 名单长度（全部在内才算）。
//   - requiredTag    ：按 Tag 位匹配（位与非零）；阈值缺省 = 1。
//   - 都不给         ：数所有带 Transform 的实体；阈值缺省 = 1。
//
// 这样「两人都进目标区 → 过关」「区内站够 N 个 → 开门」「到达点」「收集齐」全是蓝图里一个 Zone 数据，
// 不再有早期 coop-goal.ts 那种游戏专属手写系统。outFlag 由 event-when/condition 下游消费（接通关/开门/演出）。
// 确定性：只读 Transform/Tag + 矩形比较，写确定布尔。复用 buildConditionLookup 的按 id 索引取 Flag。
export const zoneOccupancyCapability = defineCapability({
  id: 't2-zone-occupancy',
  version: '1.0.0',

  describe: {
    name: 'zone-occupancy',
    summary: '数声明矩形内的匹配目标（按实体名单/Tag/全体），达数量阈值 → 置 outFlag。通关/到达/区域占据/收集齐通用。',
    semantic: ['tier2', 'logic', 'objective'],
    whenToUse:
      '想把「胜负/通关/到达/区域占据」表达成数据而不写游戏代码时。挂 Zone{outFlag,矩形,requiredEntities|requiredTag,count}；下游 event-when/condition 读 outFlag。' +
      '⚠ 契约：同一 outFlag 挂多个 Zone = 按创建序末位胜（每 tick 逐 Zone 覆写同一 Flag·非或/非与·2026-08-26 测试收尾实证钉死）；要或/与语义 → 各 Zone 各自独立 outFlag，经 condition 组合。',
    examples: [
      '双人协作通关：Zone{ outFlag:"coop-clear", 矩形=目标区, requiredEntities:["playerA","playerB"] }（全部在内）',
      '压力台需 2 人：Zone{ outFlag:"plate_on", 矩形=台子, requiredTag:PLAYER_BIT, count:2 }',
      '到达点：Zone{ outFlag:"reached", 矩形=终点, requiredEntities:["hero"] }',
    ],
  },

  components: {
    provides: {
      Zone: {
        category: 'config',
        describe: '声明「矩形内匹配目标达 count → 置 outFlag」。requiredEntities/requiredTag 选目标，count 定阈值。',
        fields: {
          outFlag: { type: 'string', describe: '满足时 true、否则 false 的 Flag id' },
          minX: { type: 'number', describe: '世界矩形左界' },
          minY: { type: 'number', describe: '世界矩形上界' },
          maxX: { type: 'number', describe: '世界矩形右界' },
          maxY: { type: 'number', describe: '世界矩形下界' },
          requiredTag: { type: 'number', describe: '选择器A：Tag 位掩码（位与非零即匹配）' },
          requiredEntities: { type: 'EntityId', describe: '选择器B：指定实体名单（数组）' },
          count: { type: 'number', describe: '数量阈值（entities 模式缺省=名单长度，其余缺省=1）' },
        },
      },
    },
    reads: ['Zone', 'Transform', 'Tag', 'Flag'],
    writes: ['Flag'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'zone-occupancy',
      reads: ['Zone', 'Transform', 'Tag', 'Flag'],
      writes: ['Flag'],
      consumes: [],
      execute(world) {
        const lookup = buildConditionLookup(world);
        for (const [zid] of world.query('Zone')) {
          const z = world.getComponent<Zone>(zid, 'Zone')!;
          const flag = lookup.flag(z.outFlag);
          if (!flag) continue;

          let count = 0;
          let threshold: number;
          if (z.requiredEntities && z.requiredEntities.length > 0) {
            for (const id of z.requiredEntities) {
              if (insideZone(world.getComponent<Transform>(id, 'Transform'), z)) count++;
            }
            threshold = z.count ?? z.requiredEntities.length;
          } else {
            for (const [eid] of world.query('Transform')) {
              if (z.requiredTag !== undefined) {
                const tag = world.getComponent<Tag>(eid, 'Tag');
                if (!tag || (tag.flags & z.requiredTag) === 0) continue;
              }
              if (insideZone(world.getComponent<Transform>(eid, 'Transform'), z)) count++;
            }
            threshold = z.count ?? 1;
          }
          flag.active = count >= threshold;
        }
      },
    },
  ],
});

// 实体中心点是否落入矩形（含边界）。
function insideZone(t: Transform | undefined, z: Zone): boolean {
  return !!t && t.x >= z.minX && t.x <= z.maxX && t.y >= z.minY && t.y <= z.maxY;
}
