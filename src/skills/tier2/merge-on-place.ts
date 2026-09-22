import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { MergeDrop, PrefabOrigin, Transform, MergeRule, DestroyRequest, SpawnRequest, MergeEvent } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  merge-on-place —— 玩家**拖放**触发的位置感知合并（REQ-MERGE-ON-PLACE·Gossip Harbor/合并品类手感）。
//
//  区别 t3-merge-rule（自动合并·每拍数同模板≥need 即合·不看位置）：本件**只在拖放时**裁决，物品平时不自动合。
//  宿主层把「拖 from 落到 to 格」合成一条 MergeDrop{from,to?,x,y}（host 解析源实例 from + 落格占用实例 to）：
//    ① to 存在且与 from **同模板** 且该模板有 MergeRule（need≤2）→ 销毁 from+to，在 to 处 SpawnRequest{into}（合成次级）；
//    ② to 存在但异模板 / 封顶（无 MergeRule）→ **交换** from↔to 位置（整理板面）；
//    ③ to 缺省（空格）→ **移动** from 到落点 (x,y)。
//  链数据复用 MergeRule{template,need,into}（同一份链表·本件读之作 template→into 查询；不注册 merge-rule 则无自动合并）。
//  确定性：只读/写确定状态、按落放意图逐条结算（host 合成序确定）；写 DestroyRequest/SpawnRequest 汇入 destroy-apply/prefab。
// ═══════════════════════════════════════════════════════════════

export const mergeOnPlaceCapability = defineCapability({
  id: 't2-merge-on-place',
  version: '1.0.0',

  describe: {
    name: 'merge-on-place',
    summary: '拖放合并：拖 from 落 to 格——同模板+有 MergeRule→在 to 处合成次级；异模板/封顶→交换位置；空格→移动 from。玩家拖拽触发的位置感知合并（区别 merge-rule 自动合并）。',
    semantic: ['tier2', 'merge', 'drag', 'interpreter'],
    whenToUse:
      '合并游戏的拖拽手感（Gossip Harbor/合并品类：拖同类才合·物品平时不自动合）。宿主拖拽手势合成 MergeDrop{from,to?,x,y}；MergeRule{template,need,into} 提供链数据（本件复用之）。',
    examples: [
      '拖同类合成：MergeDrop{ from:"item_a", to:"item_b", x, y }（a/b 同模板）→ 销毁 a,b + 在 b 处 spawn into',
      '拖到空格移动：MergeDrop{ from:"item_a", x, y }（无 to）→ a 移到落点',
      '拖到异类：MergeDrop{ from:"item_a", to:"item_c" }（异模板）→ a↔c 交换位置',
    ],
  },

  components: {
    provides: {
      // C 治理：MergeEvent 由本能力在合并落点产出（瞬时载体实体），此前无 provider。
      MergeEvent: {
        category: 'event',
        describe: '一次合并发生的事实（落点世界坐标）。merge-proximity-clear 等消费。',
        fields: {
          x: { type: 'number', describe: '合并落点 X' },
          y: { type: 'number', describe: '合并落点 Y' },
        },
      },
      MergeDrop: {
        category: 'intent',
        describe: '拖放合并意图（宿主合成·消费即清）。from=被拖实例·to=落格占用实例(可空)·x/y=落点世界坐标。',
        fields: {
          from: { type: 'EntityId', describe: '被拖的物品实例（带 PrefabOrigin+Transform）' },
          to: { type: 'EntityId', describe: '落格占用的物品实例（host 解析·空格则缺省=移动）' },
          x: { type: 'number', describe: '落点世界 x（空格移动时 from 落此处）' },
          y: { type: 'number', describe: '落点世界 y' },
        },
      },
    },
    reads: ['MergeDrop', 'PrefabOrigin', 'Transform', 'MergeRule'],
    writes: ['Transform', 'DestroyRequest', 'SpawnRequest', 'MergeEvent'],
    consumes: ['MergeDrop'],
  },

  config: {},

  systems: [
    {
      id: 'merge-on-place',
      phase: SystemPhase.Update,
      reads: ['MergeDrop', 'PrefabOrigin', 'Transform', 'MergeRule'],
      writes: ['Transform', 'DestroyRequest', 'SpawnRequest', 'MergeEvent'],
      consumes: ['MergeDrop'],
      execute(world: IWorld) {
        // 链数据：template → into（合并品类 need≤2）。
        const into = new Map<string, string>();
        for (const [rid] of world.query('MergeRule')) {
          const r = world.getComponent<MergeRule>(rid, 'MergeRule');
          if (r && r.need <= 2 && r.template && r.into) into.set(r.template, r.into);
        }

        // 载体/事件实体 id 必须**跨拍**唯一：mergeN 每拍归零，若只用它命名，一旦下游没消费掉
        // 上一拍的实体（例如游戏没装 merge-proximity-clear/juice 这类 MergeEvent 消费者），
        // 次拍再发生合并就会撞上同名实体 → `createEntity` 直接硬抛「already exists」崩局
        // （engine-review-2026-08-04 §3.3 · P1）。
        // 取 world.getVersion() 作拍号前缀：它在 tick() 内每拍 +1、同一拍内所有系统看到同一值，
        // 全对端一致 → 既跨拍唯一又不破确定性（不可用墙钟/随机）。
        const tickTag = world.getVersion();
        let mergeN = 0;
        const drops = world.query('MergeDrop').map(([id, comps]) => ({ id, size: comps.size }));
        for (const { id: did, size } of drops) {
          const d = world.getComponent<MergeDrop>(did, 'MergeDrop');
          if (d) {
            const fromPO = world.getComponent<PrefabOrigin>(d.from, 'PrefabOrigin');
            const fromT = world.getComponent<Transform>(d.from, 'Transform');
            if (fromPO && fromT) {
              if (d.to && d.to !== d.from) {
                const toPO = world.getComponent<PrefabOrigin>(d.to, 'PrefabOrigin');
                const toT = world.getComponent<Transform>(d.to, 'Transform');
                if (toPO && toT) {
                  if (toPO.templateId === fromPO.templateId && into.has(fromPO.templateId)) {
                    // ① 合成：销毁 from+to，在 to 处产出次级。
                    if (!world.hasComponent(d.from, 'DestroyRequest')) world.addComponent(d.from, { type: 'DestroyRequest', entityId: d.from } as DestroyRequest);
                    if (!world.hasComponent(d.to, 'DestroyRequest')) world.addComponent(d.to, { type: 'DestroyRequest', entityId: d.to } as DestroyRequest);
                    const n = mergeN++;
                    const carrier = `mop:${into.get(fromPO.templateId)}:${tickTag}:${n}`;
                    world.createEntity(carrier);
                    world.addComponent(carrier, { type: 'SpawnRequest', templateId: into.get(fromPO.templateId)!, x: toT.x, y: toT.y } as SpawnRequest);
                    // 合并事件（下游 merge-proximity-clear/juice 响应·read-then-consume）：在合并落点发一条。
                    const ev = `mev:${tickTag}:${n}`;
                    world.createEntity(ev);
                    world.addComponent(ev, { type: 'MergeEvent', x: toT.x, y: toT.y } as MergeEvent);
                  } else {
                    // ② 异模板/封顶：交换位置。
                    const fx = fromT.x, fy = fromT.y;
                    fromT.x = toT.x; fromT.y = toT.y;
                    toT.x = fx; toT.y = fy;
                  }
                }
              } else {
                // ③ 空格：移动 from 到落点。
                fromT.x = d.x; fromT.y = d.y;
              }
            }
          }
          // 消费：专用载体（仅 MergeDrop）展开后回收；挂在持久实体上则仅去组件。
          if (size === 1) world.destroyEntity(did);
          else world.removeComponent(did, 'MergeDrop');
        }
      },
    },
  ],
});
