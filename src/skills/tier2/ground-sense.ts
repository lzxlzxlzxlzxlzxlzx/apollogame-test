import { SystemPhase } from '@engine/core/types.js';
import { defineCapability } from '@engine/core/define-capability.js';
import type { Overlap, Grounded } from '@engine/protocol/components.js';

// Tier 2 涌现（感知）：读 overlap-detect 产出的 Overlap，若动态实体被"向上"分离（脚下有地面），
// 给它打 Grounded 标记。每帧重算（先清后标）。与 collision-resolve 并列，都是 Overlap 的消费者、
// 互不依赖 —— 同一份检测事实，一个用来推开、一个用来感知。
//
// 跑在 Update：只写 Grounded、不碰 Transform，组件拓扑自动把它排到 overlap-detect 之后。
// 约定：有 Velocity = 动态，无 Velocity = 静态地面；up = -y（重力为 +y），故法线朝下(ny>0)推开 A、
// 或法线朝上(ny<0)推开 B，都表示对应动态体脚下踩到了静态体。阈值 0.5 滤掉墙面(ny≈0)。
export const groundSenseCapability = defineCapability({
  id: 't2-ground-sense',
  version: '1.0.0',

  describe: {
    name: 'ground-sense',
    summary: '读 Overlap，给"脚下踩到静态地面"的动态实体打 Grounded 标记（每帧重算）。',
    semantic: ['tier2', 'collision', 'sensing'],
    whenToUse: '需要知道实体是否站在地面上时（跳跃、地面/空中动画、摩擦的前置）。读 Overlap+Velocity，写 Grounded。',
    examples: ['起跳前判断是否着地', '离地即切换下落动画', '只有着地才能跳'],
  },

  components: {
    provides: {
      Grounded: {
        category: 'marker',
        describe: '实体这帧站在地面上。存在即着地，每帧由 ground-sense 先清后标。',
        fields: {},
      },
    },
    reads: ['Overlap', 'Velocity', 'Grounded', 'Sensor'],
    writes: ['Grounded'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'ground-sense',
      phase: SystemPhase.Resolve,
      runsAfter: ['overlap-detect'],
      runsBefore: ['collision-resolve'],
      reads: ['Overlap', 'Velocity', 'Sensor'],
      writes: ['Grounded'],
      consumes: [],
      execute(world) {
        // 每帧重算：先清掉上一帧的 Grounded。
        for (const [id] of world.query('Grounded')) world.removeComponent(id, 'Grounded');

        // 从每个接触对抽出"骑乘者(被向上推的动态体) + 支撑者"。法线 A→B；A 被向上推(ny>0.5)=A 骑在 B 上。
        // REQ-003：支撑者可以是静态地面，**也可以是本帧自己也 Grounded 的动态体**（踩搭档/踩箱）。
        // 与 collision-resolve 已有的"Grounded 动态当静态支撑"对齐。
        const claims: Array<{ rider: string; support: string; staticSupport: boolean }> = [];
        for (const [oid] of world.query('Overlap')) {
          const o = world.getComponent<Overlap>(oid, 'Overlap')!;
          let rider: string;
          let support: string;
          if (o.normalY > 0.5) {
            rider = o.entityA;
            support = o.entityB;
          } else if (o.normalY < -0.5) {
            rider = o.entityB;
            support = o.entityA;
          } else {
            continue; // 墙面(ny≈0)，不算落地
          }
          // 非实心 Sensor（金币/伤害区/触发区）不是支撑面：踩上去不算落地。
          // 口径同 collision-resolve REQ-002（任一方是 Sensor 即跳过）。旧实现漏了这条 →
          // **跳过金币即可判着地、于空中再跳 = 二段跳**（engine-review-2026-08-04 §3.3 · P1）。
          if (world.hasComponent(rider, 'Sensor') || world.hasComponent(support, 'Sensor')) continue;
          if (!world.hasComponent(rider, 'Velocity')) continue; // 骑乘者须是动态体才谈"落地"
          claims.push({ rider, support, staticSupport: !world.hasComponent(support, 'Velocity') });
        }

        // 不动点传播：骑乘者落地 ⟺ 支撑是静态、或支撑本帧已 Grounded。迭代到稳定（链式 A 踩 B 踩地）。
        // 结果是个集合、与 claims 顺序无关 → 确定性、lockstep 安全。迭代上界 = claims 数。
        let changed = true;
        let guard = claims.length;
        while (changed && guard-- >= 0) {
          changed = false;
          for (const { rider, support, staticSupport } of claims) {
            if (world.hasComponent(rider, 'Grounded')) continue;
            if (staticSupport || world.hasComponent(support, 'Grounded')) {
              world.addComponent(rider, { type: 'Grounded' } as Grounded);
              changed = true;
            }
          }
        }
      },
    },
  ],
});
