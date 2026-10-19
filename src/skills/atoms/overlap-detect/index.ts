import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { Transform, Shape, Overlap } from '@engine/protocol/components.js';
import { contactBetween, aabbOf } from '@engine/spatial/contact.js';
import { DynamicAabbTree } from '@engine/spatial/aabb-tree.js';

export type { Overlap };

export const overlapDetectCapability = defineCapability({
  id: 'd1-overlap-detect',
  version: '1.0.0',

  describe: {
    name: 'overlap-detect',
    summary: '哪两个实体重叠了？法线和穿透深度？（动态 AABB 树宽相位 + 精确窄相位）',
    semantic: ['collision', 'detection', 'broad-phase'],
    whenToUse:
      '需要碰撞事实时。每帧从组件重建动态 AABB 树（宽相位），仅对 AABB 相交的候选对做精确接触测试（窄相位），为重叠对创建 Overlap（法线 A→B、穿透深度）。响应（推开/弹性/触发）是消费者，归组合层。box 暂按 AABB（不含旋转）。每帧重建 → rollback 安全。',
    examples: ['玩家撞墙：Overlap{entityA:player, entityB:wall, normal, depth}', '子弹命中：collision-resolve 读 Overlap 推开', '触发区：trigger-zone 读 Overlap + tag'],
  },

  components: {
    provides: {
      Overlap: {
        category: 'event',
        describe: '一对重叠实体的事实。法线从 A 指向 B，depth 为穿透深度。每帧重算（挂在 overlap:<a>:<b> 实体上，a<b）。',
        fields: {
          entityA: { type: 'EntityId', describe: '重叠对的第一个实体（id 较小）' },
          entityB: { type: 'EntityId', describe: '重叠对的第二个实体（id 较大）' },
          normalX: { type: 'number', describe: '分离法线 X（A→B）' },
          normalY: { type: 'number', describe: '分离法线 Y（A→B）' },
          depth: { type: 'number', describe: '穿透深度' },
        },
      },
    },
    reads: ['Transform', 'Shape'],
    writes: ['Overlap'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'overlap-detect',
      reads: ['Transform', 'Shape'],
      writes: ['Overlap'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('Overlap')) world.destroyEntity(id);

        // 宽相位：每帧从组件重建动态 AABB 树（按 id 升序插入 → 确定性、rollback 安全）。
        const ids = sortedIds(world, 'Transform', 'Shape');
        const tree = new DynamicAabbTree();
        for (const id of ids) {
          const t = world.getComponent<Transform>(id, 'Transform')!;
          const s = world.getComponent<Shape>(id, 'Shape')!;
          tree.insert(id, aabbOf(t, s));
        }

        // 窄相位：仅对 AABB 相交的候选对做精确接触测试。queryPairs 返回 (aId<bId)。
        for (const [aId, bId] of tree.queryPairs()) {
          const at = world.getComponent<Transform>(aId, 'Transform')!;
          const as = world.getComponent<Shape>(aId, 'Shape')!;
          const bt = world.getComponent<Transform>(bId, 'Transform')!;
          const bs = world.getComponent<Shape>(bId, 'Shape')!;

          // 碰撞分层过滤（REQ-OVERLAP-LAYER）：插在宽相位候选对之后、窄相位/建实体之前——
          // 被滤掉的对既不做精确接触测试也不建 Overlap 实体（省 churn）。缺省 category/mask = 全 1
          // （`?? ~0`），两边都不设 → 与旧行为逐字节一致。标准 Box2D 双向语义：双方都愿碰对方所在层才算。
          const catA = as.category ?? ~0;
          const maskA = as.mask ?? ~0;
          const catB = bs.category ?? ~0;
          const maskB = bs.mask ?? ~0;
          if ((catA & maskB) === 0 || (catB & maskA) === 0) continue;

          const hit = contactBetween(at, as, bt, bs);
          if (!hit) continue;
          const oid = `overlap:${aId}:${bId}`;
          world.createEntity(oid);
          const overlap: Overlap = { type: 'Overlap', entityA: aId, entityB: bId, normalX: hit.nx, normalY: hit.ny, depth: hit.depth };
          world.addComponent(oid, overlap);
        }
      },
    },
  ],
});
