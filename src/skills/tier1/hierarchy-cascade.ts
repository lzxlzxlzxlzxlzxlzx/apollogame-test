import { SystemPhase } from '@engine/core/types.js';
import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { Hierarchy, DestroyRequest } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  hierarchy-cascade —— 子随父死（REQ-026：补全 hierarchy 的生命周期语义）。
//
//  hierarchy 此前只做了"子跟父变换"(hierarchy-resolve)，漏了另一半"子的存活以父为界"：
//  父被销毁后，子(名牌/血条/光环/buff 图标/手持物等挂件)成孤儿——hierarchy-resolve 见父无
//  Transform 即 skip，孤儿原地残留(game-f：死棋子的名字残留屏幕)。任何挂件都该随宿主一并消失，
//  这是场景图(Unity/Godot/Unreal)的通用语义，不是自走棋专属。
//
//  按生命周期铁律(销毁=请求制，不在逻辑里散调 destroyEntity)：本系统排在 destroy-apply **之前**，
//  把"本帧待销毁意图"(DestroyRequest)沿 Hierarchy.parentId **传播给所有后代**(传递闭包，多级一帧)，
//  再由 destroy-apply 一趟把父+全部后代一并移除——同帧生效，绝不残留一帧孤儿。
//
//  定序(纯组件拓扑自动得出，runsBefore 仅作显式钉死)：
//    · 写 DestroyRequest → destroy-apply 消费它：writer-before-consumer 自动排在其前；
//    · 读 DestroyRequest → 自动排在 DestroyRequest 生产者(mortal/lifetime/effect-apply)之后，
//      看得到本帧全部死亡意图。
//  确定性：销毁集 = "被销毁实体的 Hierarchy 后代传递闭包"，与遍历序无关(集合语义)。
//  parentId 为空 = 根实体(无父)，永不被波及——亦是"父死子留"的逃生门(销毁前把 parentId 置空)。
//  环引用(A↔B 互为父)由 doomed 集单调增长保证终止。**零新增数据**：复用挂件本就有的 parentId 边。
// ═══════════════════════════════════════════════════════════════

export const hierarchyCascadeCapability = defineCapability({
  id: 't1-hierarchy-cascade',
  version: '1.0.0',
  describe: {
    name: 'hierarchy-cascade',
    summary:
      '子随父死：父被销毁时沿 Hierarchy.parentId 把 DestroyRequest 传播给所有后代，destroy-apply 同帧一并移除（补全 hierarchy 生命周期，杜绝孤儿挂件残留）。',
    semantic: ['tier1', 'hierarchy', 'lifecycle'],
    whenToUse:
      '任何"挂件"(名牌/血条/光环/buff 图标/手持物)需随宿主销毁而销毁时。挂 Hierarchy{parentId} 即自动级联，无需额外数据；想让子在父死后保留则销毁前把 parentId 置空。',
    examples: [
      '棋子死亡 → 头顶名字子实体随之消失',
      '怪死亡 → 血条/光环子实体一并清除',
      '多级：宿主 → 挂件 → 挂件的子件，一帧全清',
    ],
  },
  components: { provides: {}, reads: ['Hierarchy', 'DestroyRequest'], writes: ['DestroyRequest'], consumes: [] },
  config: {},
  systems: [
    {
      id: 'hierarchy-cascade',
      phase: SystemPhase.Resolve,
      runsAfter: ['mortal', 'hitbox'],
      reads: ['Hierarchy', 'DestroyRequest'],
      writes: ['DestroyRequest'],
      consumes: [],
      runsBefore: ['destroy-apply'],
      execute(world: IWorld) {
        // 本帧待销毁实体集（DestroyRequest.entityId 指向的目标；holder 可能 ≠ 目标，如 effect-apply 点名销毁）。
        const doomed = new Set<string>();
        for (const [holderId] of world.query('DestroyRequest')) {
          const req = world.getComponent<DestroyRequest>(holderId, 'DestroyRequest');
          if (req) doomed.add(req.entityId);
        }
        if (doomed.size === 0) return;

        // 缓存本帧 Hierarchy 边(id→parentId)：execute 内不增删 Hierarchy，故稳定，免去 fixpoint 反复 query。
        const edges = world
          .query('Hierarchy')
          .map(([id]) => [id, world.getComponent<Hierarchy>(id, 'Hierarchy')!.parentId] as const);

        // 传递闭包：父在 doomed 内的子也标记销毁，直到不再新增(多级一帧)。doomed 单调增 → 必终止(含环引用)。
        for (;;) {
          let grew = false;
          for (const [id, parentId] of edges) {
            if (doomed.has(id) || !parentId || !doomed.has(parentId)) continue;
            doomed.add(id);
            // 自销毁请求挂自身(mortal 同款)。已带 DestroyRequest 者必已在 doomed 中(上方已 add)，
            // 故走到这里的 id 不会有既存 DestroyRequest，hasComponent 仅作防御、绝不覆盖他人意图。
            if (!world.hasComponent(id, 'DestroyRequest')) {
              world.addComponent(id, { type: 'DestroyRequest', entityId: id } as DestroyRequest);
            }
            grew = true;
          }
          if (!grew) break;
        }
      },
    },
  ],
});

