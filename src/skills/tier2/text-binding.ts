import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { TextBinding, Resource, Hierarchy, Text } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  text-binding —— Resource 数字 → Text 投影（REQ-F-043；gauge 的姊妹件）。
//
//  每 tick 对每个挂 TextBinding 的实体：解析目标 Resource → 写自身
//    Text.content = prefix + String(current) + suffix
//  HUD 金币/回合/玩家血/等级/楼层——任何"随资源实时变化的数字"。条用 gauge，数字用本件。
//
//  寻址与 gauge 完全同款（认知经济）：fromParent=true 读 Hierarchy.parentId 宿主实体的 Resource
//  （共享 id 场景，如单位头顶等级）；缺省=先自身后全局首个同 id（R11 auto；HUD 全局单例即此）。
//  定序：phase **PostResolve**（终态表现投影纪律，同 gauge/F-031）——读到本拍最终 Resource；
//  Text 无任何 sim 读者 → 零定序边、零环。确定性：String(number) 为 ES 规范确定转换；
//  content 进 snapshot/hash 与 gauge 宽度同纪律。
// ═══════════════════════════════════════════════════════════════

export const textBindingCapability = defineCapability({
  id: 't2-text-binding',
  version: '1.0.0',

  describe: {
    name: 'text-binding',
    summary: 'Resource 数字投影：每 tick 把目标资源 current 写成自身 Text.content（prefix+值+suffix）。HUD 金币/回合/等级数字通用；gauge 管条、本件管数字。',
    semantic: ['tier2', 'ui', 'presentation', 'text', 'resource'],
    whenToUse:
      '任何"随资源实时变化的数字"：金币/回合数/玩家血量/等级/楼层。实体挂 Text{...} + TextBinding{resourceId, prefix?, suffix?}；宿主子体共享 id 用 fromParent:true（同 gauge）。',
    examples: [
      'HUD 金币：Text + TextBinding{resourceId:"gold", prefix:"金币 "}（全局单例资源，缺省路由即可）',
      '头顶等级：子实体 Hierarchy{parentId:单位} + Text + TextBinding{resourceId:"level", fromParent:true, prefix:"Lv."}',
    ],
  },

  components: {
    provides: {
      TextBinding: {
        category: 'config',
        describe: 'Resource 数字投影（HUD/头顶数字）：text-binding 系统每拍把资源 current 写成自身 Text.content=prefix+值+suffix。',
        fields: {
          resourceId: { type: 'string', describe: '跟踪的 Resource.id' },
          fromParent: { type: 'boolean', describe: 'true=读 Hierarchy.parentId 宿主实体上的 Resource；缺省=先自身后全局按 id（R11 auto，同 gauge）' },
          prefix: { type: 'string', describe: '文案前缀（如「金币 」）；缺省空' },
          suffix: { type: 'string', describe: '文案后缀；缺省空' },
        },
      },
    },
    reads: ['TextBinding', 'Resource', 'Hierarchy'],
    writes: ['Text'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'text-binding',
      // 终态表现投影纪律（同 gauge，F-031 教训）：PostResolve 读本拍最终 Resource；Text 无 sim 读者，零边零环。
      phase: SystemPhase.PostResolve,
      reads: ['TextBinding', 'Resource', 'Hierarchy'],
      writes: ['Text'],
      consumes: [],
      execute(world: IWorld) {
        // 全局 id → Resource 首个匹配：走 World.byId 索引（B-3·创建序首个·与旧懒建 Map 同义）。
        const globalRes = (id: string): Resource | undefined => { const e = world.byId('Resource', 'id', id); return e === undefined ? undefined : world.getComponent<Resource>(e, 'Resource'); };
        for (const [eid] of world.query('TextBinding')) {
          const b = world.getComponent<TextBinding>(eid, 'TextBinding')!;
          const text = world.getComponent<Text>(eid, 'Text');
          if (!text) continue; // 数据未就绪：不动不抛

          let res: Resource | undefined;
          if (b.fromParent) {
            const h = world.getComponent<Hierarchy>(eid, 'Hierarchy');
            res = h?.parentId ? world.getComponent<Resource>(h.parentId, 'Resource') : undefined;
          } else {
            res = world.getComponent<Resource>(eid, 'Resource');
            if (!res || res.id !== b.resourceId) res = globalRes(b.resourceId);
          }
          if (!res || res.id !== b.resourceId) continue; // 资源缺失/对不上：保留原文案

          text.content = (b.prefix ?? '') + String(res.current) + (b.suffix ?? '');
        }
      },
    },
  ],
});
