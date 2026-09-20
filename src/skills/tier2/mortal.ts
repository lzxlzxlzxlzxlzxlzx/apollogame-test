import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Mortal, Resource, DestroyRequest, Transform, SpawnRequest } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  mortal —— 逐实体死亡 / 可破坏（D-001 配套）。自身 Resource(resource) <= atOrBelow → 发
//  DestroyRequest{entityId:self} 销毁自己；destroy-apply 随后移除实体。
//
//  现有缺口（验证过）：涌现逻辑层 event-when/effect-apply 是全局-id / 单例取向——表达不了
//  "N 个怪各自在自己 hp<=0 时死亡"。effect-apply 的 destroy 走固定 targetEntity（要点名一个实体），
//  做不到"每个挂了它的实体监视自己的血、自己死"。mortal 把这块逐实体补上，与 hitbox 的"逐目标伤害"成对。
//
//  定序：runsAfter resource-apply（看到本帧 hitbox/over-time 扣血后的血量，同帧判死）；
//  写 DestroyRequest → destroy-apply 消费（writer-before-consumer 由组件拓扑自动定序）。
//  确定性：只读 Resource + 数值比较；多个同帧死亡互不影响（各自只销毁自己）。
//
//  复用：怪死、可破坏障碍/木桶、到期/被捡走的拾取物（current 归零即清）。把"死亡=数据"。
// ═══════════════════════════════════════════════════════════════

export const mortalCapability = defineCapability({
  id: 't2-mortal',
  version: '1.0.0',

  describe: {
    name: 'mortal',
    summary: '逐实体死亡：自身 Resource(resource) <= atOrBelow 时发 DestroyRequest 销毁自己。补"全局-id 逻辑层表达不了 N 怪各自死亡"的缺口。',
    semantic: ['tier2', 'lifecycle', 'combat'],
    whenToUse:
      '怪/可破坏物在自身某资源(通常 hp)归零时消失。挂 Mortal{resource,atOrBelow} + 该 Resource。配 hitbox(扣血) + destroy 原子(执行移除)，整套死亡=纯数据。',
    examples: [
      '怪死亡：Mortal{ resource:"hp", atOrBelow:0 } → hp 被打到 0 → 销毁',
      '可破坏木桶：Mortal{ resource:"hp", atOrBelow:0 }',
      '护盾耗尽消失：Mortal{ resource:"shield", atOrBelow:0 }',
    ],
  },

  components: {
    provides: {
      Mortal: {
        category: 'config',
        describe: '声明「自身 Resource(resource) <= atOrBelow 即销毁自己」，可选死亡时在原地掉落 dropTemplate。配 hitbox/destroy/prefab 把死亡+掉落变纯数据。',
        fields: {
          resource: { type: 'string', describe: '监视的 Resource id（如 "hp"）' },
          atOrBelow: { type: 'number', describe: 'current <= 此值即销毁自身（通常 0）' },
          dropTemplate: { type: 'string', describe: '死亡时在原地展开此 prefab 模板（掉落物/尸体/爆炸）；缺省不掉' },
        },
      },
    },
    reads: ['Mortal', 'Resource', 'Transform'],
    writes: ['DestroyRequest', 'SpawnRequest'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'mortal',
      phase: SystemPhase.Resolve,
      runsAfter: ['resource-apply'],
      reads: ['Mortal', 'Resource', 'Transform'],
      writes: ['DestroyRequest', 'SpawnRequest'],
      consumes: [],
      execute(world: IWorld) {
        for (const [id] of world.query('Mortal', 'Resource')) {
          const m = world.getComponent<Mortal>(id, 'Mortal')!;
          const r = world.getComponent<Resource>(id, 'Resource')!;
          if (r.id !== m.resource || r.current > m.atOrBelow) continue;

          // 死亡时在原地掉落（SpawnRequest 挂到独立载体实体——自身即将被销毁，挂自身会随之消失，
          // 赶不上 prefab 展开）。每实体只死一次，故 `drop:<id>` 唯一、无需 seq。
          if (m.dropTemplate) {
            const t = world.getComponent<Transform>(id, 'Transform');
            const carrier = `drop:${id}`;
            world.createEntity(carrier);
            world.addComponent(carrier, {
              type: 'SpawnRequest',
              templateId: m.dropTemplate,
              spawnPhase: 'resolve',
              x: t?.x ?? 0,
              y: t?.y ?? 0,
            } as SpawnRequest);
          }
          world.addComponent(id, { type: 'DestroyRequest', entityId: id } as DestroyRequest);
        }
      },
    },
  ],
});
