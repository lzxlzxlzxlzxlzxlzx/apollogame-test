import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { FaceDir, FaceRotate, Transform, Velocity, Relation } from '@engine/protocol/components.js';
import { len2 } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  face-rotate —— 俯视有向物按方向旋转贴图（REQ-FACE-ROTATE）。仿 t2-facing 取方向的口径
//  （velocity 或 Relation(target)），但输出不是 Transform.scaleX 翻转，而是一个**单位方向向量** FaceDir{x,y}：
//  渲染器读它、自己算 atan2 转成视觉旋转角，覆盖/优先于 Transform.rotation（render-only，2D 渲染路径见
//  renderer/renderable.ts `resolveRotation2D`）。
//
//  为什么不直接写 Transform.rotation（那需要 atan2）：sim 跨机不保证 sin/cos/atan2 逐位一致——同一有向量
//  在不同机器/JIT 上 atan2 可能有 ULP 级差异，一旦写进会被 hash 的 Transform.rotation 就是 lockstep 危险
//  （同 orbit-motion.ts 文件头「运行时零 sin/cos，只用 rotor + sqrt 归一」的先例）。FaceDir 只存**方向**
//  （sqrt 归一的单位向量，纯 IEEE +-*/ 确定性类，可安全进 hash/快照），把仅有的一次 atan2 推给渲染器
//  ——那里帧帧重算、不进 sim/hash，安全。
//
//  静止/无方向（velocity 为零向量 或 target 距离为零/缺失）→ 保持上次 FaceDir 不写（不抖，同 facing
//  「静止保持上次朝向」）；从未写过且此刻也无方向 → 默认朝右 (1,0)（同 Transform.scaleX 缺省朝向先例）。
//
//  确定性：sqrt/÷ 归一化（steering.ts 同类先例）+ 实体 id 排序遍历，无随机、无墙钟。
//  相位：Commit——读已结算的最终速度/位置（同 facing）。表现层，不驱动逻辑，不被 Condition 读。
// ═══════════════════════════════════════════════════════════════

const FACE_ROTATE_EPS_SQ = 1e-12; // (1e-6)^2 量级：距离/速度平方小于此视为"无方向"

export const faceRotateCapability = defineCapability({
  id: 't2-face-rotate',
  version: '1.0.0',

  describe: {
    name: 'face-rotate',
    summary:
      '俯视有向物按方向旋转贴图：按移动方向或 Relation(target) 方向算单位向量写 FaceDir{x,y}（sqrt 归一·零 trig）；渲染器读它算 atan2 转视觉旋转角。静止保持上次朝向。表现层、不驱动逻辑、不进 sim atan2。',
    semantic: ['tier2', 'render', 'rotation', 'facing'],
    whenToUse:
      '想让贴图整体转向朝目标/移动方向（激光炮塔/俯视载具/箭头指示）而非左右镜像时。挂 FaceRotate{source:"velocity"|"target"}。碰撞仍走 AABB，不随视觉旋转（P2 观感，激光判定仍轴对齐）。',
    examples: [
      '朝移动方向转贴图：FaceRotate{ source:"velocity" } → 斜向移动时贴图跟着转向那个角度',
      '朝目标转贴图：FaceRotate{ source:"target" } + aggro 写的 Relation(target) → 炮塔/箭头指向敌人',
    ],
  },

  components: {
    provides: {
      FaceRotate: {
        category: 'config',
        describe: '声明「按 source(velocity/target) 方向写 FaceDir 单位向量」。静止/无方向保持上次 FaceDir。',
        fields: {
          source: { type: 'string', describe: "'velocity'(按移动方向) | 'target'(按 Relation target 方向)" },
        },
      },
      FaceDir: {
        category: 'render',
        describe: 'face-rotate 系统每 tick 写出的单位方向向量（|FaceDir|≈1，sqrt 归一，零 trig）。渲染器读它算 atan2 转视觉旋转角，2D 渲染路径专用，不驱动逻辑/碰撞。',
        fields: {
          x: { type: 'number', describe: '单位方向向量 x' },
          y: { type: 'number', describe: '单位方向向量 y' },
        },
      },
    },
    reads: ['FaceRotate', 'Transform', 'Velocity', 'Relation', 'FaceDir'],
    writes: ['FaceDir'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'face-rotate',
      phase: SystemPhase.Commit, // 读已结算的最终速度/位置（同 facing）
      reads: ['FaceRotate', 'Transform', 'Velocity', 'Relation', 'FaceDir'],
      writes: ['FaceDir'],
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'FaceRotate', 'Transform');
        for (const id of ids) {
          const cfg = world.getComponent<FaceRotate>(id, 'FaceRotate')!;
          const t = world.getComponent<Transform>(id, 'Transform')!;

          let dx = 0;
          let dy = 0;
          if (cfg.source === 'velocity') {
            const v = world.getComponent<Velocity>(id, 'Velocity');
            dx = v?.vx ?? 0;
            dy = v?.vy ?? 0;
          } else {
            const rel = world.getComponent<Relation>(id, 'Relation');
            if (rel && rel.kind === 'target') {
              const tt = world.getComponent<Transform>(rel.targetId, 'Transform');
              if (tt) {
                dx = tt.x - t.x;
                dy = tt.y - t.y;
              }
            }
          }

          const distSq = len2(dx, dy);
          const fd = world.getComponent<FaceDir>(id, 'FaceDir');
          if (distSq > FACE_ROTATE_EPS_SQ) {
            const dist = Math.sqrt(distSq); // 唯一非 +-*/ 运算：sqrt，与 steering/collision-resolve 同属确定性类，零 trig
            const ux = dx / dist;
            const uy = dy / dist;
            if (fd) {
              fd.x = ux;
              fd.y = uy;
            } else {
              world.addComponent(id, { type: 'FaceDir', x: ux, y: uy } as FaceDir);
            }
          } else if (!fd) {
            // 无方向且从未写过 FaceDir → 默认朝右（同 Transform.scaleX 缺省朝向先例），|FaceDir|=1 恒成立
            world.addComponent(id, { type: 'FaceDir', x: 1, y: 0 } as FaceDir);
          }
          // |dx,dy|~0 且已有 FaceDir → 保持上次朝向，不写（不抖）
        }
      },
    },
  ],
});
