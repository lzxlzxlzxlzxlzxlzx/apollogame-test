import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { NavGraph, NavAgent, NavPath, Transform, Velocity, Relation, Status } from '@engine/protocol/components.js';
import { astar } from '@engine/spatial/astar.js';
import { dist } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  pathfind —— 连续自由空间寻路（航点图 NavGraph + 通用 A* + 沿路跟随）。grid-move（六格离散）的连续坐标对偶。
//
//  读单例 NavGraph（航点 + 连边·**摆放并行数据**）+ 自身 Relation(kind:'target')(aggro 写的索敌目标) → 把
//  自身位置与目标点各吸附到最近航点 → 通用 A*(astar.ts) 求节点路径 → 缓存进 NavPath → 沿航点逐段
//  steer（写 Velocity·被 motion-apply 积分）→ 末段直奔目标点、到 arriveRange 停。
//
//  复用最大化（只下沉「图 + A* + 跟随」这一真缺口·其余全用现成）：
//   · 索敌目标 = 既有 Relation(target)（同 steering/grid-move·零新概念）；
//   · 移动 = 写 Velocity → 既有 motion-apply 积分（不自己挪 Transform）；
//   · **动态避让 = 既有 collision-resolve**（nav 定速后由它推开·正交·零新碰撞代码）；
//   · 静态可走性 = 作者只在可走处连边（NavGraph 即「可走拓扑」·或对接 tilemap 实心瓦片）。
//
//  确定性（lockstep/录放安全·进 hash，与 3D 渲染 render-only 相反）：A* 节点序按整数 id tie-break 唯一确定
//  （见 astar.ts）；Euclidean 用 IEEE sqrt（与 steering/grid-move glide 同确定性类·Velocity/NavPath 不被
//  Condition 读）；逐 agent 按 id 排序处理；NavPath via=整数下标序进 hash。
//  CC 定身：NavAgent.haltStatusMask 命中自身 Status → 速度归零（同 Steering/GridMover）。
//  定序：runsAfter aggro（目标先定）；runsBefore motion-apply（先定速再移动·破 读Transform/写Velocity 环）+
//  hitbox/over-time（读「上一拍」Status 做 CC·冻结延迟一帧·与 Condition→Effect 同纪律）。
// ═══════════════════════════════════════════════════════════════

const TARGET = 'target';

// 两点 Euclidean（确定性 IEEE sqrt）= @engine/math/vec2 `dist`（同序 dx = bx − ax, dy = by − ay）。

// 世界点 → 最近航点下标（确定性：按下标序遍历·平方距离比较·相等取小下标）。空图 → -1。
export function nearestNode(nav: NavGraph, x: number, y: number): number {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i];
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// NavGraph → 邻接表 + 边代价表（无向；cost 缺省 = Euclidean）。每 tick 现建（小图·确定性·rollback 安全·守界跳非法边）。
export function buildAdjacency(nav: NavGraph): { adj: number[][]; edgeKey: (a: number, b: number) => number; edgeCost: Map<number, number> } {
  const N = nav.nodes.length;
  const adj: number[][] = nav.nodes.map(() => []);
  const edgeCost = new Map<number, number>();
  const edgeKey = (a: number, b: number): number => Math.min(a, b) * N + Math.max(a, b);
  for (const e of nav.edges) {
    if (e.a < 0 || e.a >= N || e.b < 0 || e.b >= N || e.a === e.b) continue;
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
    const c = e.cost ?? dist(nav.nodes[e.a].x, nav.nodes[e.a].y, nav.nodes[e.b].x, nav.nodes[e.b].y);
    edgeCost.set(edgeKey(e.a, e.b), c);
  }
  return { adj, edgeKey, edgeCost };
}

export const pathfindCapability = defineCapability({
  id: 't2-pathfind',
  version: '1.0.0',

  describe: {
    name: 'pathfind',
    summary: '连续自由空间寻路：读单例 NavGraph(航点+连边·摆放数据) + Relation(target) → 通用 A* 求航点路径 → 沿路 steer 写 Velocity → 末段直奔目标。grid-move(六格) 的连续坐标对偶；动态避让复用 collision-resolve。',
    semantic: ['tier2', 'movement', 'pathfind', 'navigation'],
    whenToUse:
      '连续坐标自由空间寻路（绕障走向目标·非网格）：世界放一个 NavGraph{nodes,edges}（在可走处布航点连边）；单位挂 NavAgent{speed,arriveRange}+Relation(target,由 aggro 写)。引擎 A* 沿航点引路、写 Velocity（motion-apply 积分、collision-resolve 避让）。网格场景用 grid-move、定点贪婪用 steering。',
    examples: [
      'NPC 巡游：NavAgent{speed:2,arriveRange:8} + Relation{kind:"target",targetId:门} + 世界 NavGraph → 沿航点绕墙走到门口停',
      '怪物追击：NavAgent{speed:3,arriveRange:24,haltStatusMask:FROZEN} + aggro 写 target → 沿可走航点逼近、被冻结停',
    ],
  },

  components: {
    provides: {
      NavGraph: {
        category: 'config',
        describe: '航点图（摆放并行数据·单例）：nodes=航点世界坐标(下标即 id)，edges=连边(下标·无向·cost 缺省 Euclidean)。在可走处布点连边 = 声明「可走拓扑」。',
        fields: {
          nodes: { type: 'string', describe: '航点对象数组 [{x,y},…]（下标即节点 id）' },
          edges: { type: 'string', describe: '连边对象数组 [{a,b,cost?},…]（a/b=节点下标·无向·cost 缺省=两端 Euclidean 距离）' },
        },
      },
      NavAgent: {
        category: 'config',
        describe: '沿 NavGraph 走向 Relation(target) 的移动意图（写 Velocity）。无目标/被 CC → 停。',
        fields: {
          speed: { type: 'number', describe: '移动速度（Velocity 模长·单位/tick）' },
          arriveRange: { type: 'number', describe: '到终点此距离内即停' },
          waypointRange: { type: 'number', describe: '到当前航点此距离内即推进下一航点（缺省 max(speed,arriveRange)·防一拍一停）' },
          repathPeriod: { type: 'number', describe: '每多少 tick 强制重算路径（缺省 30）；目标移动 > arriveRange 也触发' },
          haltStatusMask: { type: 'number', describe: '自身 Status 含这些位时停（冻结/眩晕 CC·同 Steering.haltStatusMask）' },
        },
      },
      NavPath: {
        category: 'config', // 持久 per-entity 状态（同 GridMover 体例）；引擎写·游戏不手填（见 describe）。
        describe: '引擎写的缓存路径（确定性派生·进 hash·游戏不手填）：via=待经航点下标序·gx/gy=规划目标点·age=自上次重算 tick。',
        fields: {
          via: { type: 'number[]', describe: '剩余待经航点下标序（引擎写）' },
          gx: { type: 'number', describe: '规划时目标点 x' },
          gy: { type: 'number', describe: '规划时目标点 y' },
          age: { type: 'number', describe: '自上次重算的 tick 数' },
        },
      },
    },
    reads: ['NavGraph', 'NavAgent', 'NavPath', 'Transform', 'Relation', 'Status'],
    writes: ['Velocity', 'NavPath'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'nav-follow',
      phase: SystemPhase.Update,
      runsAfter: ['aggro'],                                  // 目标由 aggro 写 Relation → nav 据此寻路（同 grid-move 破环纪律）
      runsBefore: ['motion-apply', 'hitbox', 'over-time'],   // 先定速再移动；读上一拍 Status 做 CC（同 steering/grid-move）
      reads: ['NavGraph', 'NavAgent', 'NavPath', 'Transform', 'Relation', 'Status'],
      writes: ['Velocity', 'NavPath'],
      consumes: [],
      execute(world: IWorld) {
        // NavGraph 单例。
        let nav: NavGraph | undefined;
        { const gid = world.singleton('NavGraph'); if (gid !== undefined) nav = world.getComponent<NavGraph>(gid, 'NavGraph'); } // 黑板单例（P1b）：严格模式多份即抛·生产按创建序取首个（= 旧 for…break 语义）
        if (!nav || nav.nodes.length === 0) return;
        const navG = nav;

        const { adj, edgeKey, edgeCost } = buildAdjacency(navG);
        const costOf = (a: number, b: number): number =>
          edgeCost.get(edgeKey(a, b)) ?? dist(navG.nodes[a].x, navG.nodes[a].y, navG.nodes[b].x, navG.nodes[b].y);

        const ids = sortedIds(world, 'NavAgent', 'Transform');
        for (const id of ids) {
          const ag = world.getComponent<NavAgent>(id, 'NavAgent')!;
          const t = world.getComponent<Transform>(id, 'Transform')!;

          // Velocity 确保存在。
          let v = world.getComponent<Velocity>(id, 'Velocity');
          if (!v) {
            world.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
            v = world.getComponent<Velocity>(id, 'Velocity')!;
          }

          // CC 定身（冻结/眩晕）→ 停。
          if (ag.haltStatusMask) {
            const st = world.getComponent<Status>(id, 'Status');
            if (st && (st.flags & ag.haltStatusMask) !== 0) { v.vx = 0; v.vy = 0; continue; }
          }

          // 目标 = 自身 Relation(target) 的 Transform。无目标 → idle。
          const rel = world.getComponent<Relation>(id, 'Relation');
          const tt = rel && rel.kind === TARGET ? world.getComponent<Transform>(rel.targetId, 'Transform') : undefined;
          if (!tt) { v.vx = 0; v.vy = 0; continue; }
          const gx = tt.x, gy = tt.y;

          // 是否重算：无缓存 / 目标显著移动(> arriveRange) / 到期(repathPeriod)。
          let path = world.getComponent<NavPath>(id, 'NavPath');
          const repath = ag.repathPeriod ?? 30;
          const needReplan = !path || dist(path.gx, path.gy, gx, gy) > ag.arriveRange || path.age >= repath;
          if (needReplan) {
            const startNode = nearestNode(navG, t.x, t.y);
            const goalNode = nearestNode(navG, gx, gy);
            const full = startNode >= 0 && goalNode >= 0
              ? astar(startNode, goalNode, (n) => adj[n], costOf, (n) => dist(navG.nodes[n].x, navG.nodes[n].y, navG.nodes[goalNode].x, navG.nodes[goalNode].y))
              : null;
            const via = full ? full.slice(1) : []; // 去起点(已在/近)·留待经航点；无路=空 → 末段直奔目标点近似
            if (!path) {
              world.addComponent(id, { type: 'NavPath', via, gx, gy, age: 0 } as NavPath);
              path = world.getComponent<NavPath>(id, 'NavPath')!;
            } else { path.via = via; path.gx = gx; path.gy = gy; path.age = 0; }
          }
          if (!path) continue; // 安全（needReplan 含 !path → 上方必建；此守卫供 TS 收窄）
          path.age = (path.age ?? 0) + 1;

          // 推进：吃掉所有已到达的航点（防一拍一停）。
          const wpRange = ag.waypointRange ?? Math.max(ag.speed, ag.arriveRange);
          while (path.via.length > 0) {
            const n = navG.nodes[path.via[0]];
            if (dist(t.x, t.y, n.x, n.y) <= wpRange) path.via.shift();
            else break;
          }

          // 当前目标点：还有航点 → 朝 via[0]；否则末段直奔终点 (gx,gy)。
          const finalLeg = path.via.length === 0;
          const wx = finalLeg ? gx : navG.nodes[path.via[0]].x;
          const wy = finalLeg ? gy : navG.nodes[path.via[0]].y;
          const d = dist(t.x, t.y, wx, wy);
          if (finalLeg && (d <= ag.arriveRange || d === 0)) { v.vx = 0; v.vy = 0; continue; } // 到终点停
          if (d === 0) { v.vx = 0; v.vy = 0; continue; }
          v.vx = (wx - t.x) / d * ag.speed;
          v.vy = (wy - t.y) / d * ag.speed;
        }
      },
    },
  ],
});
