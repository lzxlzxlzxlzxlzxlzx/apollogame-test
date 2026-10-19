import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Facing, Transform, Velocity, Relation } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  facing —— 朝向翻转（表现层）。按移动方向(velocity)或目标方向(Relation target)把实体水平翻转：
//  Transform.scaleX 取正=朝右、取负=朝左镜像。碰撞/命中/渲染对 scaleX 都按绝对值取尺寸（tile-collision/
//  clickable/collision 已 Math.abs），所以翻转只改"朝向"、不改碰撞体大小，安全。静止时保持上次朝向，不抖。
//
//  铁律：朝向是表现/手感，不驱动逻辑。Commit 相位读已结算的最终速度/位置。确定性：只读 Velocity/Relation/Transform、
//  写 Transform.scaleX 符号（由 sim 派生），录放一致。
// ═══════════════════════════════════════════════════════════════

const FACE_EPS = 1e-6;

export const facingCapability = defineCapability({
  id: 't2-facing',
  version: '1.0.0',

  describe: {
    name: 'facing',
    summary: '朝向翻转：按移动方向或 Relation(target) 方向把实体水平镜像(Transform.scaleX 符号)。静止保持上次朝向。表现层、不驱动逻辑。',
    semantic: ['tier2', 'render', 'facing'],
    whenToUse:
      '想让角色面朝移动/攻击方向而不写翻转代码时。挂 Facing{mode:"velocity"|"target"}。配 anim-state 走路动画即"朝哪走脸朝哪"。',
    examples: [
      '朝移动方向：Facing{ mode:"velocity" } → 向左走则镜像朝左',
      '朝目标：Facing{ mode:"target" } + aggro 的 Relation(target) → 面朝追/打的对象',
    ],
  },

  components: {
    provides: {
      Facing: {
        category: 'config',
        describe: '声明「按 mode(velocity/target) 方向把实体水平翻转(scaleX 符号)」。静止保持上次朝向。',
        fields: {
          mode: { type: 'string', describe: "'velocity'(按移动方向) | 'target'(按 Relation target 方向)" },
        },
      },
    },
    reads: ['Facing', 'Transform', 'Velocity', 'Relation'],
    writes: ['Transform'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'facing',
      phase: SystemPhase.Commit, // 读已结算的最终速度/位置
      reads: ['Facing', 'Transform', 'Velocity', 'Relation'],
      writes: ['Transform'],
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'Facing', 'Transform');
        for (const id of ids) {
          const f = world.getComponent<Facing>(id, 'Facing')!;
          const t = world.getComponent<Transform>(id, 'Transform')!;
          let dx = 0;
          if (f.mode === 'velocity') {
            const v = world.getComponent<Velocity>(id, 'Velocity');
            dx = v?.vx ?? 0;
          } else {
            const rel = world.getComponent<Relation>(id, 'Relation');
            if (rel && rel.kind === 'target') {
              const tt = world.getComponent<Transform>(rel.targetId, 'Transform');
              if (tt) dx = tt.x - t.x;
            }
          }
          const mag = Math.abs(t.scaleX) || 1;
          if (dx > FACE_EPS) t.scaleX = mag; // 朝右
          else if (dx < -FACE_EPS) t.scaleX = -mag; // 朝左镜像
          // |dx| ~ 0：保持上次朝向。
        }
      },
    },
  ],
});
