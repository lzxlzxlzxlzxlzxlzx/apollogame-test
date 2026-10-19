import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { FlowField, FlowAgent, Transform, Velocity, Status } from '@engine/protocol/components.js';
import { findDebugTrace, appendTrace } from '../debug-trace.js';
import { orcaVelocity, type OrcaStats } from './orca.js';
import { cmpStr } from '@engine/math/scalar.js';
import { len } from '@engine/math/vec2.js';
import {
  STRAIGHT, DIAGONAL, UNREACHABLE, SEP_MAX_WEIGHT, SEP_MAX_NEIGHBORS, SEP_GRADIENT_W,
  SEP_SCALE, SEP_SETTLE_SCALE, ORCA_TIME_HORIZON, ORCA_MAX_NEIGHBORS, ORCA_RANGE_SLACK,
  geoKey, cellIndex, cellOf, buildCostField, buildIntegration, buildFlow, bakeFlowField,
  sameInputs, getBakedField, clearFlowFieldCache, flowFieldBakes, flowFieldLookups,
  flowFieldCellVisits, orcaNeighbors, separationDir, nearestGoalDist, buildAgentIndex,
  type DensityField, type BakedField, type AgentIndex,
} from './flow-field-core.js';

// ═══════════════════════════════════════════════════════════════
//  t2-flow-field —— 群体流场寻路（REQ-FLOWFIELD·owner 2026-08-10 判 A 下沉引擎）。
//
//  ══ 为什么不是「每个单位跑一次 A*」══
//  实测（`games/game211/pathfind-scale.bench.test.ts`·可复跑）：500 单位 / 48×48 图，
//  A*-per-agent 首拍 534~619ms（60fps 下 32~37 帧画面定住）、稳态 20~23ms/tick；
//  而流场铺一次 1.0~1.1ms（**一次服务全部单位**），单位查表 1000 个 0.075ms/tick。
//  成本形状不同：A* 的成本 ∝ 单位数，流场的成本 ∝ 地图格数、与单位数无关。
//
//  ══ 三遍管线（业界标准形态·Emerson/SupCom2 一脉）══
//    ① cost field        —— blocked + cost → 每格通行代价
//    ② integration field —— 从 goals 做**多源 Dijkstra 铺满全图**
//    ③ flow field        —— 每格指向「积分值最小的邻格」
//  ②用 Dijkstra 而不是势场法：Dijkstra 铺满**没有局部极小**，凹形障碍（U 形墙）里的单位
//  会沿开口绕出去，而不是贴着墙底抖动——这正是势场法在 RTS 里的经典失败形状。
//
//  ══ 🔴 确定性（本能力进 sim/hash/lockstep·这是它归主程的原因）══
//  · **整分积分**：直走计 10、斜走计 14（≈10√2）——全程整数加法，**没有一处浮点参与积分**，
//    故跨平台/跨端逐位相同。（浮点只出现在最后「方向×速度」那一步，与 steering 同一档 IEEE 用法。）
//  · **全序 tie-break**：堆比较用 (积分值, 格索引) 二元组——不依赖插入序、不依赖 Map 迭代序。
//  · **禁墙钟禁随机**：本文件零 `Date.now`/`performance.now`/`Math.random`。
//  · **重建时机确定**：由输入摘要驱动（`blocked/cost/goals/网格几何` 任一变 → 下一 tick 重建），
//    **不是**「等空闲再重建」——那种调度依赖真实耗时，两端机器快慢不同就分叉。
//  · **缓存不是状态通道**：模块级 Map 只是**纯函数记忆化**（键覆盖全部输入），清空它不改变任何
//    输出，只改变耗时。点名测试 `缓存清空后逐位相同` 钉死这一条。
//
//  ══ 分工线（三层正交·别混）══
//  `t2-flow-field` = 走到战场 · `t2-steering{separation}` = 别互相挤 · `t2-steering{seek}` = 打谁。
// ═══════════════════════════════════════════════════════════════

// ── 纯函数核在 `./flow-field-core.ts`（算法进核·壳只接线）──────────────────────────────
// 原样 re-export：消费方（测试 / bench / 别的能力）的 import 路径一个字都不用改。
export {
  STRAIGHT, DIAGONAL, UNREACHABLE, SEP_MAX_WEIGHT, SEP_MAX_NEIGHBORS, SEP_GRADIENT_W,
  SEP_SCALE, SEP_SETTLE_SCALE, ORCA_TIME_HORIZON, ORCA_MAX_NEIGHBORS, ORCA_RANGE_SLACK,
  geoKey, cellIndex, cellOf, buildCostField, buildIntegration, buildFlow, bakeFlowField,
  sameInputs, getBakedField, clearFlowFieldCache, flowFieldBakes, flowFieldLookups,
  flowFieldCellVisits, orcaNeighbors, separationDir,
} from './flow-field-core.js';
export type { DensityField, BakedField } from './flow-field-core.js';

export const flowFieldCapability = defineCapability({
  id: 't2-flow-field',
  version: '1.0.0',

  describe: {
    name: 'flow-field',
    summary: '群体流场寻路：一张 FlowField 铺一次（多源 Dijkstra 铺满全图），全部 FlowAgent 查表得方向 → 写 Velocity。成本与单位数无关，千人同屏用它。',
    semantic: ['tier2', 'pathfinding', 'movement', 'rts', 'crowd'],
    whenToUse:
      '成百上千单位走向同一批目标（RTS 推进/塔防怪潮/攻城）。摆 FlowField{网格+goals+blocked/cost} 一张 + 每个单位挂 FlowAgent{fieldId,speed}。少量单位各走各的路用 t2-pathfind（NavGraph+A*）。',
    examples: [
      '大军推进：FlowField{cols:64,rows:64,cellSize:10,goals:[{x:600,y:600}]} + 千个 FlowAgent{fieldId,speed:2}',
      '多点占领：goals 填三个占领点 → 一次铺完，每个单位自动走向最近的那个',
      '地形代价：cost 里公路填 1、沼泽填 3 → 部队自己绕开沼泽走公路',
      '凹形障碍：blocked 摆一个 U 形墙 → 单位沿开口绕出去，不会卡在墙底（Dijkstra 无局部极小）',
    ],
  },

  components: {
    provides: {
      FlowField: {
        category: 'config',
        describe: '一张共享流场：网格几何 + 多源目标 + 静态障碍/地形代价。摆放数据，引擎负责铺。',
        fields: {
          id: { type: 'string', describe: '场 id（FlowAgent.fieldId 按它认领·多阵营/多目标可并存多张）' },
          cellSize: { type: 'number', describe: '格边长（世界单位）' },
          originX: { type: 'number', describe: '网格左下角世界 x' },
          originY: { type: 'number', describe: '网格左下角世界 y' },
          cols: { type: 'number', describe: '列数' },
          rows: { type: 'number', describe: '行数' },
          blocked: { type: 'string', describe: '行主序 0/1 数组·1=不可走（缺省全可走）' },
          cost: { type: 'string', describe: '行主序 ≥1 的地形代价（缺省全 1·公路 1/沼泽 3·非整数向上取整）' },
          goals: { type: 'string', describe: '目标点世界坐标数组 [{x,y}…]·多源一次铺完' },
          los: { type: 'string', describe: '视线直指优化（M2 未实现·M1 忽略并留痕）' },
        },
      },
      FlowAgent: {
        category: 'config',
        describe: '按 fieldId 查流场方向 → 写 Velocity。速度/到达距离/CC 掩码全是数。',
        fields: {
          fieldId: { type: 'string', describe: '认领哪张 FlowField' },
          speed: { type: 'number', describe: '移动速度（写入 Velocity 模长·单位/tick·同 Steering.speed 口径）' },
          arriveRange: { type: 'number', describe: '到最近 goal 此距离内即停（缺省 0）' },
          haltStatusMask: { type: 'number', describe: '自身 Status 含这些位时停（同 Steering/NavAgent 口径）' },
        },
      },
    },
    reads: ['FlowField', 'FlowAgent', 'Transform', 'Status', 'Velocity'],
    writes: ['Velocity'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'flow-field',
      // 与 steering/path-follow 同一条链：读 Transform / 写 Velocity 与 motion-apply 互为前驱=环，
      // 显式 runsBefore 打破（先定速度再移动）。
      //
      // ⚠ `runsAfter:['steering','path-follow']` 是**独立复查逼出来的**（M1 首版漏了）：本系统与它们
      // 都「读+写 Velocity」，组件图上互为前驱 ⇒ 判成 RMW 伪环。实证：steering+path-follow+motion-apply
      // 三件装配无告警，一加 flow-field 就打出
      //   `[topological-sort] phase 0：检测到定序环 [steering, path-follow, flow-field]（闭环组件：Velocity）… 不保证合语义`
      // 而 `topological-sort` 遇环**只告警不抛**（照跑），所以它不会把任何测试打红——
      // 全库 4783 测里这条告警一次没出现过，只因为没人把 steering 与 flow-field 装进同一个世界。
      // 隔壁 `path-follow.ts:117-121` 为**完全相同的理由**早就钉了 `runsAfter:['steering']`，照办。
      // 未装的 id 会被忽略（steering/path-follow 不在的世界里安全）。
      runsAfter: ['steering', 'path-follow'],
      runsBefore: ['motion-apply'],
      reads: ['FlowField', 'FlowAgent', 'Transform', 'Status', 'Velocity'],
      writes: ['Velocity'],
      consumes: [],
      execute(world: IWorld) {
        // 一次 query 拿到「id + 该实体的组件表」，省掉每个单位两次 Map 查找（1000 单位实测省约 25%）。
        // 仍按 id 排序：遍历序必须与 Map 内部序无关（确定性）。
        const agents = world.query('FlowAgent', 'Transform').sort((x, y) => cmpStr(x[0], y[0]));
        if (agents.length === 0) return;

        const trace = findDebugTrace(world);
        const tick = world.getVersion();

        // 场按 id 收拢（同 id 多张 → 取实体 id 排序后的第一张·并留痕，不静默挑一张）。
        const fields = new Map<string, FlowField>();
        let dupes = 0;
        for (const fid of sortedIds(world, 'FlowField')) {
          const f = world.getComponent<FlowField>(fid, 'FlowField');
          if (!f) continue;
          if (fields.has(f.id)) { dupes++; continue; }
          fields.set(f.id, f);
        }

        // **每 tick 每场只取一次铺好的场**（不是每个单位取一次）：`getBakedField` 要算输入摘要，
        // 那是 O(格数) 的一遍扫描——放进单位循环里就成了 O(单位数 × 格数)，1000 单位 × 2304 格
        // 实测把每 tick 从 0.1ms 抬到 1.17ms（写这段时真踩到，被性能判据咬住）。
        const baked = new Map<string, ReturnType<typeof getBakedField>>();
        const bakesBefore = flowFieldBakes();
        for (const [fid, f] of fields) baked.set(fid, getBakedField(f));
        const rebaked = flowFieldBakes() - bakesBefore;
        // `los` 是 M2 的活（M1 不实现）——摆了就说一声，别让作者以为已经生效。
        // ⚠ **只在真重铺那一拍说**（第二轮复查实测：原来每 tick 复读，最坏 5 条/tick，超了
        // 「每 system 每 tick ≤3 条」的密度守则——留痕过头等于没留痕，人会开始忽略它）。
        // `los` 被忽略**只在真重铺那拍说一次**（复读的留痕等于没有留痕）。
        // ⚠ `dupes`（同 id 的场）**不能挂在这道门上**（三复查实测）：中途新加一张同 id 的场
        // 不触发重铺 ⇒ 它永远不留痕。改挂到每拍都会发的 commit 行的 why 里——不占新行、也不会漏。
        if (rebaked > 0) {
          const withLos = [...fields].filter(([, f]) => f.los).map(([fid]) => fid);
          if (withLos.length > 0) {
            appendTrace(trace, tick, 'flow-field', 'reject',
              `${withLos.length} 张场的 los 被忽略（视线优化属 M2·M1 未实现）`, `场：${withLos.slice(0, 3).join(',')}`);
          }
        }

        const idxOf = (keyFn: (f: FlowField) => string, wants: (a: FlowAgent) => boolean): AgentIndex =>
          buildAgentIndex(agents as never, fields, (id) => {
            const nv = world.getComponent<Velocity>(id, 'Velocity');
            return { vx: nv?.vx ?? 0, vy: nv?.vy ?? 0 };
          }, orcaRadiusOf, keyFn, wants);


        // ORCA 的三个参数**都得先过闸**（数据驱动面：作者填得出的怪值必须当场兜住，不能靠"没人会这么填"）：
        // · `radius` 填 0/负/NaN ⇒ combinedRadius 塌掉，ORCA 表面上在跑、实际一条有效约束都没有；
        //   而且这个半径会进邻居表，**塌掉的是别人的 combinedRadius**（负半径能把别人的判定圈缩小）。
        // · `timeHorizon` 填 0 ⇒ `1/timeHorizon` = Infinity ⇒ 整条约束是 ±Infinity/NaN。
        // · `maxNeighbors` 填 0 ⇒ 环形搜索读 `found[-1]` **当场抛 TypeError**（实测踩到过，非推理）。
        // 三者任一不合法 = 当作没开 ORCA + 留痕。**返回 0 表示"不开"**。
        // ⚠ 计数放在单位循环里数（这个函数每单位会被调用好几次，在函数里数会重复计——
        // 第一版就是这么写的，点名用例一跑就报「半径非法 3」而世界里只有一个）。
        const orcaRadiusOf = (a: FlowAgent): number => {
          if (!a.orca) return 0;
          const { radius: r, timeHorizon: th, maxNeighbors: mn } = a.orca;
          if (!(Number.isFinite(r) && r > 0)) return 0;
          if (th !== undefined && !(Number.isFinite(th) && th > 0)) return 0;
          if (mn !== undefined && !(Number.isFinite(mn) && mn >= 1)) return 0;
          return r;
        };
        let badParam = 0;

        const wantSep = agents.some(([, c]) => (c.get('FlowAgent') as FlowAgent).separation !== undefined);
        const wantOrca = agents.some(([, c]) => orcaRadiusOf(c.get('FlowAgent') as FlowAgent) > 0);
        const sepIdx = wantSep ? idxOf((f) => f.id, (a) => a.separation !== undefined) : null;
        const orcaIdx = wantOrca ? idxOf(geoKey, () => true) : null;
        const orcaStats: OrcaStats = { degenerate: 0, oneSided: 0, infeasible: 0 };

        let moved = 0; let stopped = 0; let noField = 0; let offGrid = 0;
        for (let ai = 0; ai < agents.length; ai++) {
          const [id, comps] = agents[ai];
          const a = comps.get('FlowAgent') as FlowAgent;
          const t = comps.get('Transform') as Transform;
          let v = world.getComponent<Velocity>(id, 'Velocity');
          if (!v) {
            world.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
            v = world.getComponent<Velocity>(id, 'Velocity')!;
          }

          // CC（冻结/眩晕/定身）→ 停（同 Steering.haltStatusMask 口径）。
          if (a.haltStatusMask) {
            const st = world.getComponent<Status>(id, 'Status');
            if (st && (st.flags & a.haltStatusMask) !== 0) { v.vx = 0; v.vy = 0; stopped++; continue; }
          }

          const field = fields.get(a.fieldId);
          if (!field) { v.vx = 0; v.vy = 0; noField++; continue; }   // 场不在 → 停（不是原地乱走）

          // 到达（离最近 goal 够近）→ **停掉流场力，但软分离照旧**。
          // 硬停是错的（实测）：一群单位同时到点就地钉死 ⇒ 全叠在一个点上，
          // 那正是 RTS 里最显眼的假。到了地方仍然要互相让开，只是不再往前走。
          // 没人挤 ⇒ 分离力天然是 0 ⇒ 真的停住（不抖）。
          // 到达判定 + **减速带**：`arriveRange` 之内=到了（只剩软分离）；之外一个 arriveRange 的范围内
          // 流场力**线性衰减**到 0。没有这条减速带的话，被分离力挤出线外的单位会以**满速**冲回来，
          // 撞进队伍中间、把刚散开的堆又压实——实测就是队伍在终点上以 ~40 拍为周期反复聚散
          // （间距在 0.41 与 0.0007 之间来回荡）。这就是转向行为里的 arrival，RTS 里同样需要。
          let flowScale = 1;
          let arrived = false;
          if (a.arriveRange !== undefined && a.arriveRange > 0) {
            const gd = nearestGoalDist(field, t.x, t.y);
            if (gd <= a.arriveRange) arrived = true;
            else flowScale = Math.min(1, (gd - a.arriveRange) / a.arriveRange);
          }

          const bf = baked.get(a.fieldId)!;
          const { col, row } = cellOf(field, t.x, t.y);
          const ci = cellIndex(field, col, row);
          if (ci < 0) { v.vx = 0; v.vy = 0; offGrid++; continue; }   // 走出网格 → 停（越界不猜方向）

          const dx = bf.dir[ci * 2];
          const dy = bf.dir[ci * 2 + 1];

          // 软分离（可选）：把「让一让」的力叠在流场方向上。
          // **流场恒主导**（owner 红线）：权重钳在 SEP_MAX_WEIGHT，合成后最多偏 ~31°，永不掉头。
          let sx = 0; let sy = 0;
          // **ORCA 优先**（与组件注释一致）：两个都填时软分离被忽略——两套避让叠加没有意义，
          // ORCA 的目标函数本来就是「离期望速度最近」，再往期望速度里掺一个力只会让它偏离得更多。
          const useOrca = orcaRadiusOf(a) > 0;
          if (a.orca && !useOrca) badParam++;   // 每单位每 tick 恰好数一次
          const sepW = a.separation && !useOrca ? Math.min(Math.max(a.separation.weight, 0), SEP_MAX_WEIGHT) : 0;
          if (sepW > 0) {
            const d = sepIdx?.density.get(field.id);
            // 终点格（流场无方向）只用质心项——见 separationDir 的 useGradient 注释。
            const atGoal = arrived || (bf.dir[ci * 2] === 0 && bf.dir[ci * 2 + 1] === 0);
            if (d) {
              const s2 = separationDir(field, d, ai, col, row, t.x, t.y, !atGoal);
              // **钳模长**（不是归一化）：|sep| ≤ sepW ≤ SEP_MAX_WEIGHT < 1 = |flow| ⇒ 流场恒主导，
              // 而小于上限的力保持原样 ⇒ 「夹中间的不动、站边上的被弹开」这条物理留住了。
              const sm = len(s2.sx, s2.sy);
              if (sm > 0) {
                const k = sm > sepW ? sepW / sm : 1;
                sx = s2.sx * k; sy = s2.sy * k;
              }
            }
          }

          // ── 期望速度（流场 [+软分离] 定出来的「我想怎么走」）─────────────────────────
          let wantX: number; let wantY: number;
          if (arrived || (dx === 0 && dy === 0)) {
            // 已到达 / 终点格 / 墙里 / 孤岛：**没有前进方向**，只剩「互相让开」。
            // ⚠ 这里**不能直接 continue 掉**（实测逼出来的）：ORCA 是**互惠**算法——双方各让一半，
            // 对面若是个"钉死不动"的单位，我只让一半就不够，照样压上去（5v5 对穿实测最近 0.332，
            // 半径和 0.70）。让到点的单位也走 ORCA（期望速度=0），它就会被后来的挤开一点，
            // 这恰好也是 RTS 里正确的观感：站着的人会被推着让路。
            wantX = sx * a.speed * SEP_SETTLE_SCALE;
            wantY = sy * a.speed * SEP_SETTLE_SCALE;
          } else {
            // 流场方向（按到达减速带缩放）+ 软分离，再归一 × speed。
            const fm = len(dx, dy);
            const rawX = (dx / fm) * flowScale + sx;
            const rawY = (dy / fm) * flowScale + sy;
            const m0 = len(rawX, rawY);
            if (m0 === 0) { v.vx = 0; v.vy = 0; stopped++; continue; }   // 理论到不了（|sep|≤0.6<1），兜底
            wantX = (rawX / m0) * a.speed;
            wantY = (rawY / m0) * a.speed;
          }

          // ── ORCA 硬避让（owner 2026-08-24「可以上」·移植自 RVO2·见 orca.ts 文件头）────────
          // 期望速度照收，ORCA 只把它改成「最接近且 timeHorizon 拍内不会撞」的那个。
          // **走位仍归流场**——ORCA 的目标函数就是"离期望速度最近"。
          if (useOrca) {
            const d = orcaIdx?.density.get(geoKey(field));
            if (d) {
              const radius = orcaRadiusOf(a);
              const horizon = a.orca!.timeHorizon ?? ORCA_TIME_HORIZON;
              const maxN = a.orca!.maxNeighbors ?? ORCA_MAX_NEIGHBORS;
              // 邻域半径 = 前瞻拍数 × 速度 × 相对速度余量 + 自身半径（见 ORCA_RANGE_SLACK：
              // 只按自己跑多远算，会把迎面高速接近的邻居挡在门外——复查实测过一个 4.15 拍必撞的漏网）。
              const range = horizon * a.speed * ORCA_RANGE_SLACK + radius;
              const neighbors = orcaNeighbors(field, d, ai, col, row, t.x, t.y, range, maxN);
              if (neighbors.length > 0) {
                const out = orcaVelocity(
                  { x: t.x, y: t.y, vx: v.vx, vy: v.vy, radius, idx: ai },
                  neighbors, { x: wantX, y: wantY },
                  a.speed, horizon, 1,          // timeStep=1：本引擎一拍就是一个时间单位
                  orcaStats,
                );
                v.vx = out.x; v.vy = out.y;
                if (out.x === 0 && out.y === 0) stopped++; else moved++;
                continue;
              }
            }
          }

          if (wantX === 0 && wantY === 0) { v.vx = 0; v.vy = 0; stopped++; continue; }
          v.vx = wantX;
          v.vy = wantY;
          moved++;
        }

        // 密度守则：每 system 每 tick ≤3 条·无事 0 条。这里只在「有单位没动起来」时各报一条摘要。
        // ORCA 的三类**静默降级**合并成一条（密度守则：每 system 每 tick ≤3 条）。
        // 三条都是「什么都没发生 / 悄悄少做了一半」的分支，正是必须留痕的那一类。
        if (badParam > 0 || orcaStats.degenerate > 0 || orcaStats.oneSided > 0 || orcaStats.infeasible > 0) {
          appendTrace(trace, tick, 'flow-field', 'reject',
            `ORCA 降级：参数非法 ${badParam} · 退化 ${orcaStats.degenerate} · 邻居不还礼 ${orcaStats.oneSided} · 无可行解 ${orcaStats.infeasible}`,
            '参数非法=当没开 ORCA·退化=w 归零改用几何方向分开·不还礼=我独自让满·无可行解=落 LP3「最不违反」即真会压进去');
        }
        // 「找不到场」「越界」「同 id 的场」折进这一行的 why——**数字一个不少**，只是不各占一行（守则 ≤3 条）。
        //
        // ⚠ **门必须把它们也算上**（三复查实测·折叠引入的新洞）：原来的门是 `moved>0||stopped>0`，
        // 而这两类是 `continue` 掉的、两个计数都不加 ⇒ **全员 fieldId 打错时这一拍 0 条 trace**。
        // 「一个单位都没动起来」恰恰是最该喊的那一拍，却成了唯一一声不喊的——
        // 而 Demo 期 `fieldId` 打错是最高频的错，一声不吭会让人在"单位不动、日志空白"上白烧时间。
        if (moved > 0 || stopped > 0 || noField > 0 || offGrid > 0 || dupes > 0) {
          const why: string[] = [];
          if (noField > 0) why.push(`${noField} 个找不到自己的场（查 FlowAgent.fieldId 与 FlowField.id 对没对上）`);
          if (offGrid > 0) why.push(`${offGrid} 个在网格外（网格没覆盖到它们站的地方）`);
          if (dupes > 0) why.push(`${dupes} 张同 id 的场被忽略（取实体序首张）`);
          // 一个都没动 = 这不是"提交"，是"什么都没发生" ⇒ 记 reject（守则：凡什么都没发生的分支必须记）
          const kind = moved === 0 ? 'reject' : 'commit';
          appendTrace(trace, tick, 'flow-field', kind, `写 Velocity：${moved} 走 / ${stopped} 停`,
            why.length > 0 ? `场 ${fields.size} 张 · 没走成的原因：${why.join(' · ')}` : `场 ${fields.size} 张`);
        }
      },
    },
  ],
});
