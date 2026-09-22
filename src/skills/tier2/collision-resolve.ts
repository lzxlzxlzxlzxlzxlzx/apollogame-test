import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Velocity, Transform, Shape, Mass, Overlap } from '@engine/protocol/components.js';
import { contactBetween } from '@engine/spatial/contact.js';
import { cmpStr } from '@engine/math/scalar.js';

// 速度迭代在"固定流形"上做（不重算几何）；位置迭代用 NGS（重算几何、只动位置）。Box2D 同构。
const VEL_ITERS = 8;
const POS_ITERS = 3;

// 逆质量：无 Velocity = 静态（不可动，0）；有 Mass 用 1/value（value<=0 视为静态）；否则单位质量 1。
function inverseMass(world: IWorld, id: string): number {
  if (!world.hasComponent(id, 'Velocity')) return 0;
  const m = world.getComponent<Mass>(id, 'Mass');
  if (m) return m.value > 0 ? 1 / m.value : 0;
  return 1;
}

// Tier 2 涌现（约束）：顺序冲量求解器（Bullet/Box2D 风格的最小核）。
// 读 overlap-detect 的候选接触对，分段解（标准 Box2D 结构，避免几何重算与抖动）：
//   1) 窄相位一次 → 接触流形（固定法线/逆质量），速度迭代不再重跑几何检测；
//   2) 速度求解：固定流形上 K 遍冲量迭代（restitution=0），消除接近的相对法向速度，不动位置；
//   3) 位置求解（NGS）：M 遍重算穿透、按逆质量全量分离，只动位置、不污染速度（防直接平移注入伪速度→堆叠抖动）。
// 静态体逆质量=0 → 位置求解每遍把动态体完全推出 → 落地/撞墙即停、且叠放不被挤穿（迭代收敛，无需特判）。
// 动态-动态按质量分摊；动态-静态精确退化为"推出穿透 + 清侵入速度"（与旧行为一致，老测试不破）。
//
// Resolve 阶段：写 Transform/Velocity 而 overlap-detect 读 Transform，纯组件拓扑会成环，phase 显式定序。
// 接触对按 (idA,idB) 升序处理 → 与实体插入顺序无关的确定性（lockstep 安全）。
export const collisionResolveCapability = defineCapability({
  id: 't2-collision-resolve',
  version: '1.0.0',

  describe: {
    name: 'collision-resolve',
    summary: '顺序冲量求解器：逆质量 + 速度冲量 + 迭代位置修正，把动态实体推出，且不挤穿静态/堆叠。',
    semantic: ['tier2', 'collision', 'resolution'],
    whenToUse: '需要实体不穿墙/能站立/能稳定堆叠时。读 Overlap+Transform+Shape+Velocity+Mass，写 Transform+Velocity，Resolve 阶段。',
    examples: ['玩家落在平台上 → vy 归零', '方块叠方块不挤穿地面（迭代收敛）', '不同质量相撞按逆质量分摊'],
  },

  components: {
    provides: {},
    reads: ['Overlap', 'Transform', 'Shape', 'Velocity', 'Mass', 'Sensor'],
    writes: ['Transform', 'Velocity'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'collision-resolve',
      phase: SystemPhase.Resolve,
      reads: ['Overlap', 'Transform', 'Shape', 'Velocity', 'Mass', 'Sensor'], // Sensor=感知体跳过判定（申报对账·根因①·系统级此前漏）
      writes: ['Transform', 'Velocity'],
      consumes: [],
      execute(world) {
        // 候选接触对（来自 overlap-detect），确定序。
        const pairs: Array<[string, string]> = [];
        for (const [oid] of world.query('Overlap')) {
          const o = world.getComponent<Overlap>(oid, 'Overlap')!;
          pairs.push(o.entityA < o.entityB ? [o.entityA, o.entityB] : [o.entityB, o.entityA]);
        }
        pairs.sort((p, q) => cmpStr(p[0], q[0]) || cmpStr(p[1], q[1]));

        // 窄相位一次：构建接触流形（法线/逆质量/组件引用固定下来；速度迭代不再重跑几何）。
        interface Manifold {
          aT: Transform;
          bT: Transform;
          aS: Shape;
          bS: Shape;
          aV: Velocity | undefined;
          bV: Velocity | undefined;
          nx: number;
          ny: number;
          invA: number;
          invB: number;
        }
        const manifolds: Manifold[] = [];
        for (const [a, b] of pairs) {
          // REQ-002：非实心 Sensor（开关/压力板/触发区）不做物理解算，只让 overlap-detect/trigger-zone 消费。
          if (world.hasComponent(a, 'Sensor') || world.hasComponent(b, 'Sensor')) continue;
          const aT = world.getComponent<Transform>(a, 'Transform');
          const bT = world.getComponent<Transform>(b, 'Transform');
          const aS = world.getComponent<Shape>(a, 'Shape');
          const bS = world.getComponent<Shape>(b, 'Shape');
          if (!aT || !bT || !aS || !bS) continue;
          const c = contactBetween(aT, aS, bT, bS); // 法线 n: a→b
          if (!c) continue;
          const invA = inverseMass(world, a);
          const invB = inverseMass(world, b);
          if (invA + invB === 0) continue; // 双静态
          manifolds.push({ aT, bT, aS, bS, aV: world.getComponent<Velocity>(a, 'Velocity'), bV: world.getComponent<Velocity>(b, 'Velocity'), nx: c.nx, ny: c.ny, invA, invB });
        }

        // 速度求解：固定法线上 K 遍冲量迭代，消除接近的相对法向速度（restitution=0）。不动位置。
        for (let it = 0; it < VEL_ITERS; it++) {
          for (const m of manifolds) {
            const rvn = ((m.bV?.vx ?? 0) - (m.aV?.vx ?? 0)) * m.nx + ((m.bV?.vy ?? 0) - (m.aV?.vy ?? 0)) * m.ny;
            if (rvn >= 0) continue; // 正在分离
            const j = -rvn / (m.invA + m.invB);
            if (m.aV) {
              m.aV.vx -= j * m.invA * m.nx;
              m.aV.vy -= j * m.invA * m.ny;
            }
            if (m.bV) {
              m.bV.vx += j * m.invB * m.nx;
              m.bV.vy += j * m.invB * m.ny;
            }
          }
        }

        // 位置求解（NGS）：M 遍重算穿透、按逆质量全量分离。只动位置、不碰速度 → 不注入伪速度、无抖动。
        for (let it = 0; it < POS_ITERS; it++) {
          for (const m of manifolds) {
            const c = contactBetween(m.aT, m.aS, m.bT, m.bS);
            if (!c) continue;
            const corr = c.depth / (m.invA + m.invB);
            m.aT.x -= c.nx * corr * m.invA;
            m.aT.y -= c.ny * corr * m.invA;
            m.bT.x += c.nx * corr * m.invB;
            m.bT.y += c.ny * corr * m.invB;
          }
        }
      },
    },
  ],
});
