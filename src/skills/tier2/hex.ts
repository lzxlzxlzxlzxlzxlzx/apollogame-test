// ═══════════════════════════════════════════════════════════════
//  hex —— 六边形网格坐标 + 确定性 A* 寻路（REQ-024 的算法核心，纯函数无副作用）。
//
//  「棋盘布局/站位 = 数据；寻路算法 = 引擎代码能力」（宪法对齐）。本模块只含**确定性纯算法**：
//  hex 距离、固定邻居序、A* 求"走向目标相邻格的下一步"。供 grid-move 系统调用。
//
//  坐标：axial (q,r)。棋盘形状两种（REQ-F-037，外审 Q5 裁决 (c)）：
//    · 'axial'（缺省）：矩形区域 0≤q<cols, 0≤r<rows（axial 空间的平行四边形棋盘）；
//    · 'odd-r'：错位矩形——每行 axial q 范围随 −(r>>1) 平移（offset col = q+(r>>1) ∈ [0,cols)）。
//      sim 仍**严格 axial**（距离/邻居/A* 全部不变，封闭向量算术）；真投影 x=q·ts+r·ts/2 渲染出
//      规整矩形+六边形交错——几何与拓扑同构，视觉相邻=逻辑相邻。
//  确定性（lockstep/录放安全）：邻居固定序遍历 + 整数代价(每步 1) + 启发=hex 距离(整数、admissible) +
//  open 选取按 (fScore 升, cellKey 升) tie-break → 路径唯一确定，不依赖 Map/插入序。
// ═══════════════════════════════════════════════════════════════

import { index } from '@engine/math/grid.js';

export interface Hex {
  readonly q: number;
  readonly r: number;
}

// 棋盘布局：'axial' 平行四边形 | 'odd-r' 错位矩形（推荐，几何≡拓扑）。
// （旧 'offset' 投影错位已随 F-10 迁移完成删除——视觉≠拓扑，外审 Q5。）
export type HexLayout = 'axial' | 'odd-r';

// axial ↔ odd-r offset 坐标换算（r≥0 棋盘内；r>>1 即 floor(r/2)）。游戏侧按 offset (col,row) 摆子
// 时用 offsetToAxial 换算成 sim 的 axial (q,r)；引擎内部一律 axial。
export function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: q + (r >> 1), row: r };
}
export function offsetToAxial(col: number, row: number): Hex {
  return { q: col - (row >> 1), r: row };
}

// 六邻居固定方向序（确定性关键：所有端同序遍历）。axial。
export const HEX_DIRS: readonly Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

// axial → cube 距离：(|dq| + |dq+dr| + |dr|)/2。整数。
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

// 棋盘内 cell 唯一键 → 供确定性 tie-break 与 Set/Map 键（grid-move 占位集与 A* 内部必须同函数）。
// odd-r 下 axial q 可为负：以 offset col（板内恒 0..cols-1）为键列，杜绝跨行撞键（REQ-F-037）。
export function hexCellKey(q: number, r: number, cols: number, layout?: HexLayout): number {
  const col = layout === 'odd-r' ? q + (r >> 1) : q;
  return index(col, r, cols);
}

/**
 * 确定性 A*：求 start 走向 target 的**下一步格**（停在 target 的相邻格 = 近战射程）。
 * - 已与 target 相邻（hexDistance≤1）→ 返回 null（不移动，原地攻击）。
 * - blocked：被占格 cellKey 集合（其它单位所在格；不含 start 自身）。目标格通常被 target 占→自然不可踏。
 * - 返回 start 的某个邻居（最短路第一步）；无路 → null。
 */
export function hexNextStep(
  cols: number, rows: number, start: Hex, target: Hex, blocked: ReadonlySet<number>, layout?: HexLayout,
): Hex | null {
  if (hexDistance(start, target) <= 1) return null; // 已相邻，无需移动
  // 边界按棋盘形状：odd-r 以 offset col 检查（每行 axial q 范围随 −(r>>1) 平移）；其余 0≤q<cols。
  const inBounds = (q: number, r: number) => {
    const col = layout === 'odd-r' ? q + (r >> 1) : q;
    return col >= 0 && col < cols && r >= 0 && r < rows;
  };
  const cellKey = (q: number, r: number, _cols: number) => hexCellKey(q, r, _cols, layout);
  const isGoal = (q: number, r: number) =>
    hexDistance({ q, r }, target) === 1 && !blocked.has(cellKey(q, r, cols));

  const startKey = cellKey(start.q, start.r, cols);
  const gScore = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>(); // childKey → parentKey
  const coord = new Map<number, Hex>([[startKey, start]]); // key → {q,r}
  // open：{key,f}；小棋盘用数组 + 线性取 min（按 f 升、key 升 tie-break）→ 确定。
  const open: Array<{ key: number; f: number }> = [{ key: startKey, f: hexDistance(start, target) }];

  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f || (open[i].f === open[bi].f && open[i].key < open[bi].key)) bi = i;
    }
    const { key: cur } = open.splice(bi, 1)[0];
    const c = coord.get(cur)!;
    if (isGoal(c.q, c.r)) {
      // 回溯：从 goal 走 cameFrom 到 start；返回 parent===start 的那一格（第一步）。
      let k = cur;
      while (cameFrom.get(k) !== startKey) {
        const p = cameFrom.get(k);
        if (p === undefined) return null; // 理论不达
        k = p;
      }
      return coord.get(k) ?? null;
    }
    const g = gScore.get(cur)!;
    for (const d of HEX_DIRS) {
      const nq = c.q + d.q, nr = c.r + d.r;
      if (!inBounds(nq, nr)) continue;
      const nk = cellKey(nq, nr, cols);
      if (blocked.has(nk)) continue; // 被占格不可踏（goal 相邻格非占，isGoal 已保证可达）
      const ng = g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, cur);
        gScore.set(nk, ng);
        coord.set(nk, { q: nq, r: nr });
        const f = ng + hexDistance({ q: nq, r: nr }, target);
        const ex = open.find((o) => o.key === nk);
        if (ex) ex.f = f; else open.push({ key: nk, f });
      }
    }
  }
  return null; // 无路（被完全围死）
}
