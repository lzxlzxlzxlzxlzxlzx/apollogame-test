import { defineCapability } from '@engine/core/define-capability.js';
import type { Overlap, Tag, Trigger } from '@engine/protocol/components.js';

// ZONE_FLAG: Tag.flags 的第 0 位为 1 表示该实体是触发区（trigger zone）。
// 约定：zone = (Tag.flags & ZONE_FLAG) !== 0。
export const ZONE_FLAG = 1 << 0;

export const triggerZoneCapability = defineCapability({
  id: 't2-trigger-zone',
  version: '1.0.0',

  describe: {
    name: 'trigger-zone',
    summary: '读 Overlap + Tag，当一方是触发区（ZONE_FLAG）、另一方不是时，产出 Trigger 事件（每帧重算）。',
    semantic: ['tier2', 'collision', 'trigger', 'zone'],
    whenToUse: '需要感知实体进入触发区时。读 Overlap + Tag，写 Trigger。触发区用 Tag.flags & ZONE_FLAG 标识，不自行做碰撞检测，依赖 overlap-detect 的 Overlap 结果。',
    examples: [
      '陷阱区域：玩家踩入触发区 → Trigger{zone, other} → 扣血',
      '检查点：主角经过检查点区域 → Trigger → 记录进度',
      '门控触发：NPC 进入感应区 → Trigger → 开门',
    ],
  },

  components: {
    provides: {
      // C 治理：Sensor 标记由 effect-apply 的 set-sensor 写、本能力读，此前无 provider。
      Sensor: {
        category: 'marker',
        describe: '触发区标记：挂了它的 Shape 实体只产 Trigger 事件、不参与推开。',
        fields: {},
      },
      Trigger: {
        category: 'event',
        describe: '实体 other 进入了触发区 zone。每帧重算（先清后标）。挂在 trigger:<zone>:<other> 实体上。',
        fields: {
          zone: { type: 'EntityId', describe: '触发区实体 id' },
          other: { type: 'EntityId', describe: '进入触发区的实体 id' },
        },
      },
    },
    reads: ['Overlap', 'Tag'],
    writes: ['Trigger'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'trigger-zone',
      reads: ['Overlap', 'Tag'],
      writes: ['Trigger'],
      consumes: [],
      execute(world) {
        // 每帧重算：先清掉上一帧所有 Trigger 实体。
        for (const [id] of world.query('Trigger')) world.destroyEntity(id);

        for (const [oid] of world.query('Overlap')) {
          const o = world.getComponent<Overlap>(oid, 'Overlap')!;
          const tagA = world.getComponent<Tag>(o.entityA, 'Tag');
          const tagB = world.getComponent<Tag>(o.entityB, 'Tag');
          const aIsZone = tagA !== undefined && (tagA.flags & ZONE_FLAG) !== 0;
          const bIsZone = tagB !== undefined && (tagB.flags & ZONE_FLAG) !== 0;

          // 恰好一方是 zone、另一方不是 zone → 产出 Trigger。
          if (aIsZone && !bIsZone) {
            const tid = `trigger:${o.entityA}:${o.entityB}`;
            world.createEntity(tid);
            world.addComponent(tid, { type: 'Trigger', zone: o.entityA, other: o.entityB } as Trigger);
          } else if (bIsZone && !aIsZone) {
            const tid = `trigger:${o.entityB}:${o.entityA}`;
            world.createEntity(tid);
            world.addComponent(tid, { type: 'Trigger', zone: o.entityB, other: o.entityA } as Trigger);
          }
          // 两方都是 zone 或都不是 zone → 不产出 Trigger。
        }
      },
    },
  ],
});
