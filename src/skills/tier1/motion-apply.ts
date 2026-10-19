import { defineCapability } from '@engine/core/define-capability.js';
import { defineSystem } from '@engine/core/define-system.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';

// Tier 1 涌现（直接结算）：velocity → transform。无新组件，纯系统。
// P1a 类型门试点：系统体用 defineSystem 写——run 收到的世界只认申报过的类型名，写 'Acceleration' 之类未申报名 = tsc 错；
// 运行时另有 SystemView 严格模式兜底（两门一致）。旧 `{ execute(world) }` 形状仍合法，逐能力迁移。
export const motionApplyCapability = defineCapability({
  id: 't1-motion-apply',
  version: '1.0.0',

  describe: {
    name: 'motion-apply',
    summary: '每帧把 velocity 累加到 transform（位置）。',
    semantic: ['tier1', 'kinematic'],
    whenToUse: '让有 Velocity 的实体按速度移动。读 Transform + Velocity，写 Transform。',
    examples: ['子弹飞行', '角色平移', '掉落物下坠（配合 accel-apply）'],
  },

  components: {
    provides: {},
    reads: ['Transform', 'Velocity'],
    writes: ['Transform'],
    consumes: [],
  },

  config: {},

  systems: [
    defineSystem({
      id: 'motion-apply',
      reads: ['Transform', 'Velocity'],
      writes: ['Transform'],
      run(world) {
        for (const [id] of world.query('Transform', 'Velocity')) {
          const t = world.getComponent<Transform>(id, 'Transform')!;
          const v = world.getComponent<Velocity>(id, 'Velocity')!;
          t.x += v.vx;
          t.y += v.vy;
        }
      },
    }),
  ],
});
