import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Transform, Collider3D, NavMesh, NavGraph, NavAgent, Velocity } from '@engine/protocol/components.js';
import { aabb3dOf } from '@engine/spatial/contact3d.js';
import { gridFromBounds, rasterizeBlocked, bakeNavGraph, type Rect2 } from '@engine/spatial/navmesh.js';

export type { NavMesh };

// ═══════════════════════════════════════════════════════════════
//  navmesh-bake（REQ-3D-Nav · owner「自动摆放」）—— 导航网格**自动烘焙**（确定性 sim·NavGraph 进 hash）。
//  读单例 `NavMesh`（范围 + 格边长 + 智能体半径）+ 场上 `Collider3D` 障碍 → 栅格化（「寻路碰撞」）→ 把可行走格
//  **自动织成主程的 `NavGraph`** 写回（节点=空格、边=相邻空格）。下游主程 `pathfind` 照常消费（A*+跟随+避让）。
//  即 Recast「从几何自动生成 navmesh」的轻量确定性版。**与手摆 NavGraph 共存**：场上摆 NavMesh→自动烘焙；
//  只摆 NavGraph（无 NavMesh）→ 本能力不动、用手摆图。每帧重烘 → rollback 安全（静态障碍可后续只在变更时重烘）。
//  排除：trigger（感知区不挡路）、NavAgent / 带 Velocity 的动态体（移动角色不当静态障碍·含玩家自身）。runsBefore nav-follow（图先就绪）。
// ═══════════════════════════════════════════════════════════════

export const navmeshBakeCapability = defineCapability({
  id: 'd2-navmesh-bake',
  version: '1.0.0',

  describe: {
    name: 'navmesh-bake',
    summary: '导航网格自动烘焙：把 Collider3D 障碍栅格化、可行走格自动织成主程 NavGraph（喂 pathfind）。Recast 式自动生成的轻量确定性版。',
    semantic: ['navigation', 'pathfinding', 'collision', 'bake', '3d'],
    whenToUse:
      '不想手摆航点、要从碰撞几何自动生成可走拓扑时。世界摆一个 NavMesh{范围,格边长,半径}，本能力每帧栅格化 Collider3D → 写 NavGraph，主程 pathfind 照常用。与手摆 NavGraph 共存（二选一）。XZ 连续平面。',
    examples: ['盒庭自动寻路：摆 NavMesh 罩住地台 → 追兵自动绕石墩逼近玩家（零手摆航点）'],
  },

  config: {},

  // NavGraph 由主程 pathfind 定义/provides；本能力只是另一个 writer（自动烘焙写入）。
  // NavMesh（烘焙范围声明）此前无 provider（C 治理）——它只被本能力读 → 在此登记契约。
  components: {
    provides: {
      NavMesh: {
        category: 'config',
        describe: '导航烘焙范围（世界 XZ 矩形 + 栅格边长 + 智能体半径）。挂在世界单例；有它才烘焙 NavGraph，无则走手摆 NavGraph。',
        fields: {
          minX: { type: 'number', describe: '烘焙范围 minX' },
          minZ: { type: 'number', describe: '烘焙范围 minZ' },
          maxX: { type: 'number', describe: '烘焙范围 maxX' },
          maxZ: { type: 'number', describe: '烘焙范围 maxZ' },
          cellSize: { type: 'number', describe: '栅格边长（越小越精细越慢）' },
          agentRadius: { type: 'number', describe: '障碍按此膨胀（Minkowski·缺省 0）' },
        },
      },
    },
    reads: ['NavMesh', 'Collider3D', 'Transform', 'NavAgent'], writes: ['NavGraph'], consumes: [],
  },

  systems: [
    {
      id: 'navmesh-bake',
      phase: SystemPhase.Update,
      // NavGraph 必须在 pathfind 读它之前烘好；显式排在 motion-apply 之前（覆盖「读 Transform vs 它写 Transform」
      // 的反向推断边·同 nav-follow 破环纪律）—— 否则三系统经 Transform 成环。
      runsBefore: ['nav-follow', 'motion-apply'],
      reads: ['NavMesh', 'Collider3D', 'Transform', 'Velocity', 'NavAgent'], // NavAgent=移动体排除判定（申报对账·根因①）
      writes: ['NavGraph'],
      consumes: [],
      execute(world: IWorld) {
        const meshIds = sortedIds(world, 'NavMesh');
        if (meshIds.length === 0) return; // 无 NavMesh → 不烘（手摆 NavGraph 模式）
        const meshId = meshIds[0]!;
        const nm = world.getComponent<NavMesh>(meshId, 'NavMesh')!;
        const g = gridFromBounds(nm.minX, nm.minZ, nm.maxX, nm.maxZ, nm.cellSize);
        const r = nm.agentRadius ?? 0;

        // 障碍 footprint：非 trigger、非 NavAgent（移动体不当障碍）。按 id 升序·确定性。
        const rects: Rect2[] = [];
        for (const [id] of world.query('Transform', 'Collider3D').sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
          const c = world.getComponent<Collider3D>(id, 'Collider3D')!;
          // 跳过：触发区、寻路智能体、带 Velocity 的动态体（玩家/追兵不当静态障碍·避免移动体在图上挖洞）。
          if (c.trigger || world.getComponent<NavAgent>(id, 'NavAgent') || world.getComponent<Velocity>(id, 'Velocity')) continue;
          const bb = aabb3dOf(world.getComponent<Transform>(id, 'Transform')!, c);
          rects.push({ minX: bb.minX - r, maxX: bb.maxX + r, minZ: bb.minZ - r, maxZ: bb.maxZ + r });
        }

        const blocked = rasterizeBlocked(g, rects);
        const baked = bakeNavGraph(g, blocked);

        // 写回 NavGraph（挂 NavMesh 同实体·主程 pathfind 取首个 NavGraph）。存在则原地替换 nodes/edges。
        const existing = world.getComponent<NavGraph>(meshId, 'NavGraph');
        if (existing) {
          (existing as unknown as { nodes: typeof baked.nodes; edges: typeof baked.edges }).nodes = baked.nodes;
          (existing as unknown as { nodes: typeof baked.nodes; edges: typeof baked.edges }).edges = baked.edges;
        } else {
          world.addComponent(meshId, { type: 'NavGraph', nodes: baked.nodes, edges: baked.edges } as NavGraph);
        }
      },
    },
  ],
});
