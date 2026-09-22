import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Velocity, Transform, Collider3D, Mass, Overlap3D } from '@engine/protocol/components.js';
import { contact3d } from '@engine/spatial/contact3d.js';
import { cmpStr } from '@engine/math/scalar.js';
import { len } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  collision-resolve-3d（REQ-3D-Collision · P2 响应·确定性 sim·进 hash·rollback 安全）。
//  镜像 2D `collision-resolve`：读 `overlap-detect-3d` 的接触对 → 顺序冲量 + NGS 位置修正，把动态体推出静态墙。
//  **地面平面解算**：实体走 2D `Transform`(x→X、y→Z)、垂直锁在 `Collider3D.baseY`（无竖直 Transform 自由度）→
//  推开只在 **XZ 水平面**（取接触法线的水平分量·归一）；纯竖直接触(法线水平分量≈0)跳过（地面锁靠 baseY 处理）。
//  逆质量：无 Velocity=静态(0·墙/石)；有 Velocity+Mass=1/value；否则单位质量 1。trigger 对不解算（触发区可穿入）。
//  确定性：contact3d 纯函数·接触对按 (a,b) 升序·sqrt 为 IEEE（同 2D/steering 先例）。Resolve 阶段（晚于 Update 的检测）。
// ═══════════════════════════════════════════════════════════════

const VEL_ITERS = 6;
const POS_ITERS = 4;
const EPS = 1e-6;

function inverseMass(world: IWorld, id: string): number {
  if (!world.hasComponent(id, 'Velocity')) return 0; // 无速度 = 静态
  const m = world.getComponent<Mass>(id, 'Mass');
  if (m) return m.value > 0 ? 1 / m.value : 0;
  return 1;
}

interface Manifold3 {
  a: string; b: string;
  aT: Transform; bT: Transform; ac: Collider3D; bc: Collider3D;
  aV: Velocity | undefined; bV: Velocity | undefined;
  nx: number; nz: number; // 水平单位法线（a→b·XZ）
  invA: number; invB: number;
}

export const collisionResolve3dCapability = defineCapability({
  id: 'd-collision-resolve-3d',
  version: '1.0.0',

  describe: {
    name: 'collision-resolve-3d',
    summary: '3D 碰撞响应（XZ 地面解算）：读 Overlap3D → 冲量 + NGS 位置修正，把动态体（角色）推出静态墙/障碍·不穿墙。',
    semantic: ['collision', 'resolution', '3d'],
    whenToUse: '需要角色被 3D 关卡碰撞体真正挡住（不穿墙）时。读 Overlap3D+Transform+Collider3D+Velocity+Mass，写 Transform+Velocity，Resolve 阶段。trigger 不解算。',
    examples: ['小黄鸭撞墙被挡住、贴墙滑动', '角色推不进石墩', '触发区可正常走入（trigger 跳过解算）'],
  },

  config: {},

  components: {
    provides: {},
    reads: ['Overlap3D', 'Transform', 'Collider3D', 'Velocity', 'Mass'],
    writes: ['Transform', 'Velocity'],
    consumes: [],
  },

  systems: [
    {
      id: 'collision-resolve-3d',
      phase: SystemPhase.Resolve,
      reads: ['Overlap3D', 'Transform', 'Collider3D', 'Velocity', 'Mass'],
      writes: ['Transform', 'Velocity'],
      consumes: [],
      execute(world) {
        // 接触对（来自 overlap-detect-3d）·确定序。
        const pairs: Array<[string, string]> = [];
        for (const [oid] of world.query('Overlap3D')) {
          const o = world.getComponent<Overlap3D>(oid, 'Overlap3D')!;
          pairs.push(o.entityA < o.entityB ? [o.entityA, o.entityB] : [o.entityB, o.entityA]);
        }
        pairs.sort((p, q) => cmpStr(p[0], q[0]) || cmpStr(p[1], q[1]));

        // 窄相位一次 → 接触流形（固定水平法线/逆质量）。
        const manifolds: Manifold3[] = [];
        for (const [a, b] of pairs) {
          const ac = world.getComponent<Collider3D>(a, 'Collider3D');
          const bc = world.getComponent<Collider3D>(b, 'Collider3D');
          if (!ac || !bc) continue;
          if (ac.trigger || bc.trigger) continue; // 触发区不解算（可穿入）
          const aT = world.getComponent<Transform>(a, 'Transform');
          const bT = world.getComponent<Transform>(b, 'Transform');
          if (!aT || !bT) continue;
          const c = contact3d(aT, ac, bT, bc); // 法线 a→b
          if (!c) continue;
          const hlen = len(c.nx, c.nz);
          if (hlen < EPS) continue; // 纯竖直接触 → 地面锁(baseY)负责·水平无从推
          const invA = inverseMass(world, a), invB = inverseMass(world, b);
          if (invA + invB === 0) continue; // 双静态
          manifolds.push({ a, b, aT, bT, ac, bc, aV: world.getComponent<Velocity>(a, 'Velocity'), bV: world.getComponent<Velocity>(b, 'Velocity'), nx: c.nx / hlen, nz: c.nz / hlen, invA, invB });
        }

        // 速度求解：固定水平法线上 K 遍冲量（restitution=0），消除接近的相对法向速度（vx→X、vy→Z）。
        for (let it = 0; it < VEL_ITERS; it++) {
          for (const m of manifolds) {
            const rvn = ((m.bV?.vx ?? 0) - (m.aV?.vx ?? 0)) * m.nx + ((m.bV?.vy ?? 0) - (m.aV?.vy ?? 0)) * m.nz;
            if (rvn >= 0) continue; // 正在分离
            const j = -rvn / (m.invA + m.invB);
            if (m.aV) { m.aV.vx -= j * m.invA * m.nx; m.aV.vy -= j * m.invA * m.nz; }
            if (m.bV) { m.bV.vx += j * m.invB * m.nx; m.bV.vy += j * m.invB * m.nz; }
          }
        }

        // 位置求解（NGS·水平面）：M 遍重算穿透、沿水平法线全量分离。只动位置·不碰速度。
        for (let it = 0; it < POS_ITERS; it++) {
          for (const m of manifolds) {
            const c = contact3d(m.aT, m.ac, m.bT, m.bc);
            if (!c) continue;
            const hlen = len(c.nx, c.nz);
            if (hlen < EPS) continue;
            const hx = c.nx / hlen, hz = c.nz / hlen;
            const corr = c.depth / (m.invA + m.invB);
            m.aT.x -= hx * corr * m.invA; m.aT.y -= hz * corr * m.invA;
            m.bT.x += hx * corr * m.invB; m.bT.y += hz * corr * m.invB;
          }
        }
      },
    },
  ],
});
