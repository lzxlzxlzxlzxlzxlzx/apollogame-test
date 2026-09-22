import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Orbit, Transform } from '@engine/protocol/components.js';
import { len } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  orbit-motion —— 圆周运动能力（REQ-SURVIVOR护盾绕转·VBUG-02）。绕 centerId（缺省世界原点）
//  半径 radius 匀速环绕，每 tick 写自身 Transform.x/y。绕转护盾/卫星/环刃/环绕摄像机通用。
//
//  真缺口（Lead 裁决 2026-07-24）：`hierarchy-resolve` 明写「子偏移不随父 rotation 旋转（避免 sin/cos）」、
//  `rotation-apply` 只转朝向不移位 → 引擎无「真圆周运动」；game-103 护盾环只是 authoring 期 cos/sin 摆的**静态**
//  环上光球（blueprint 一次性 Math.cos·非运行时）。→ 下沉专用件。
//
//  确定性/lockstep 安全（关键设计）：**运行时零 sin/cos**——存单位方向 (dirX,dirY) 为 rotor 状态，每 tick 用
//  常量旋转步 (cosStep,sinStep) 做旋量乘：(dx',dy')=(dx·c−dy·s, dx·s+dy·c)，再 sqrt 归一防长期漂移。
//  四个 trig 常量是**数据**（`orbitAt` 在 authoring 期一次性算好、烤进蓝图=跨机同字节）→ sim 全程只用 +−×÷/sqrt，
//  进 hash、rollback/回放安全。（sin/cos 只在 authoring 出现一次，同 2D polygon 预烘焙顶点绕开 sin/cos 的先例。）
//
//  定序：写 Transform（绝对位置）·不写 Velocity（非 motion-apply 那条积分链）。读 centerId 的 Transform →
//  runsAfter motion-apply（圆心若自身移动·本 tick 取其新位）；缺 center Transform → 保持不动（idle）。
// ═══════════════════════════════════════════════════════════════

/** authoring 助手：由半径 + 起始角(rad) + 每 tick 角步(rad·正=逆时针) 算出 Orbit 组件数据（一次性 Math.cos/sin·
 *  运行时不再用）。作者在蓝图里调它、把结果烤成纯数据 → 跨机同字节 + 运行时 sin/cos-free。 */
export function orbitAt(radius: number, startAngle: number, angularStep: number, centerId?: string): Omit<Orbit, 'type'> {
  return {
    ...(centerId !== undefined ? { centerId } : {}),
    radius,
    /* eslint-disable zerocraft/no-transcendental -- authoring-only：蓝图装配期一次性算 rotor 初值存进数据，运行时零 trig（本文件头注） */
    dirX: Math.cos(startAngle),
    dirY: Math.sin(startAngle),
    cosStep: Math.cos(angularStep),
    sinStep: Math.sin(angularStep),
    /* eslint-enable zerocraft/no-transcendental */
  };
}

export const orbitMotionCapability = defineCapability({
  id: 't2-orbit-motion',
  version: '1.0.0',

  describe: {
    name: 'orbit-motion',
    summary:
      '圆周运动：绕 centerId(缺省原点) 半径 radius 匀速环绕→每 tick 写 Transform.x/y。运行时零 sin/cos（rotor 状态 dirX/dirY + 常量步 cosStep/sinStep·sqrt 归一防漂移）·确定性 lockstep 安全。护盾/卫星/环刃/环绕通用。',
    semantic: ['tier2', 'movement', 'orbit', 'determinism'],
    whenToUse:
      '要实体绕另一实体(或原点)做匀速圆周运动而不写 sin/cos AI。挂 Orbit{centerId,radius,dirX,dirY,cosStep,sinStep}（用 orbitAt(radius,startAngle,angularStep,centerId) 算数据）。绕转护盾/卫星武器/环绕镜头。',
    examples: [
      '护盾环单球绕玩家：Orbit = orbitAt(40, 0, 0.05, "player") → 每 tick 逆时针 0.05 rad 绕玩家半径 40',
      '双球对位：两实体 orbitAt(40, 0, s) 与 orbitAt(40, Math.PI, s) → 相位差 180° 对绕',
      '绕世界原点：Orbit = orbitAt(100, 0, 0.02)（省 centerId）',
    ],
  },

  components: {
    provides: {
      Orbit: {
        category: 'config',
        describe: '声明绕 centerId(缺省原点) 半径 radius 的匀速圆周运动。dirX/dirY=rotor 单位方向状态、cosStep/sinStep=每 tick 旋转步常量（authoring 算·运行时免 sin/cos）。用 orbitAt 生成。',
        fields: {
          centerId: { type: 'string', describe: '圆心实体 id（读其 Transform）；缺省绕世界原点 (0,0)' },
          radius: { type: 'number', describe: '轨道半径' },
          dirX: { type: 'number', describe: '当前单位方向 x（rotor 状态·初值=起始角 cos）' },
          dirY: { type: 'number', describe: '当前单位方向 y（初值=起始角 sin）' },
          cosStep: { type: 'number', describe: '每 tick 旋转步的 cos（数据·免运行时 sin/cos）' },
          sinStep: { type: 'number', describe: '每 tick 旋转步的 sin（>0 逆时针 / <0 顺时针）' },
        },
      },
    },
    reads: ['Orbit', 'Transform'],
    writes: ['Transform', 'Orbit'], // Orbit：rotor 状态 dirX/dirY 每拍推进（P1a 严格模式补齐·此前漏报）
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'orbit-motion',
      // 定序（首个真消费者 game-103 撞环暴露·2026-07-24）：orbit 读圆心 Transform + 写自身 Transform=RMW Transform，
      // 与 hierarchy-resolve（PostResolve·同 RMW Transform）在同组件上互为前驱→纯拓扑成环。orbit 本质=「基于已解算
      // 结果再定位」（同 hierarchy 跟随），故落 **PostResolve 阶段**（跨阶段按阶段号定序·自动排在 Update 的 motion-apply /
      // 默认阶段 camera-follow 之后、Commit 的 bounds-clamp 之前=无环）；阶段内对 hierarchy-resolve 显式 runsAfter
      // 钉死（圆心的层级位先解算完再绕）。
      phase: SystemPhase.PostResolve,
      runsAfter: ['motion-apply', 'hierarchy-resolve'],
      reads: ['Orbit', 'Transform'],
      writes: ['Transform', 'Orbit'], // Orbit：rotor 状态 dirX/dirY 每拍推进（P1a 严格模式补齐·此前漏报）
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'Orbit', 'Transform');
        for (const id of ids) {
          const o = world.getComponent<Orbit>(id, 'Orbit')!;
          // rotor 步进：把单位方向绕原点转一个常量步（无 sin/cos）。
          const ndx = o.dirX * o.cosStep - o.dirY * o.sinStep;
          const ndy = o.dirX * o.sinStep + o.dirY * o.cosStep;
          // sqrt 归一（防旋量长期累积漂移·量级回到 1）。退化零向量 → 不推进（保持）。
          const m = len(ndx, ndy);
          if (m > 0) {
            o.dirX = ndx / m;
            o.dirY = ndy / m;
          }
          // 圆心：给了 centerId 读其 Transform（缺则本 tick 不动=idle）；缺省绕原点。
          let cx = 0;
          let cy = 0;
          if (o.centerId !== undefined) {
            const ct = world.getComponent<Transform>(o.centerId, 'Transform');
            if (!ct) continue; // 圆心实体不在 → 保持原位
            cx = ct.x;
            cy = ct.y;
          }
          const t = world.getComponent<Transform>(id, 'Transform')!;
          t.x = cx + o.radius * o.dirX;
          t.y = cy + o.radius * o.dirY;
        }
      },
    },
  ],
});
