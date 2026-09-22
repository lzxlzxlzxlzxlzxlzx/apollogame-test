// ═══════════════════════════════════════════════════════════════
//  engine/math/grid —— 行主序矩形网格数学（engine-base-tier-review-2026-09-06 §3.2 B-2）
//
//  实证：`r*cols+c` 在 tier2/3 有 6 个独立定义 + 22 处裸写（match3-board 一个文件 16 处）；`cellIndex` 同名不同签名
//  两份（flow-field-core / match3-board）+ `bgIndex` 第三份；世界点 → 格 三份且已分叉：flow-field 用 **floor**
//  （origin = 格 (0,0) 的左上角），grid-drag-square 用 **round**（origin = 格 (0,0) 的中心）。两种都对，语义不同——
//  这里分两个名字 `cellFloor` / `cellNearest`，谁也别再手写 `Math.floor((x - ox) / size)`。
//  六边形网格另在 tier2/hex.ts（axial/odd-r 是另一套坐标系，不并入）。
// ═══════════════════════════════════════════════════════════════

/** 行主序扁平下标 r*cols + c（不查界·调用方保证在界内）。 */
export function index(c: number, r: number, cols: number): number {
  return r * cols + c;
}

/** 行主序扁平下标；越界 → -1。 */
export function indexOrNeg(c: number, r: number, cols: number, rows: number): number {
  if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
  return r * cols + c;
}

/** 扁平下标 → 列（i % cols）。 */
export function colOf(i: number, cols: number): number {
  return i % cols;
}

/** 扁平下标 → 行（floor(i / cols)）。 */
export function rowOf(i: number, cols: number): number {
  return Math.floor(i / cols);
}

/** (c,r) 是否在 cols×rows 内。 */
export function inBounds(c: number, r: number, cols: number, rows: number): boolean {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

/** 两个扁平下标是否四邻（同行相邻列 或 同列相邻行）。 */
export function adjacent4(a: number, b: number, cols: number): boolean {
  const ra = Math.floor(a / cols);
  const ca = a % cols;
  const rb = Math.floor(b / cols);
  const cb = b % cols;
  return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
}

/** 世界点 → 格（**向下取整**·origin = 格 (0,0) 的左上角·负坐标同样成立）。flow-field / tilemap 口径。 */
export function cellFloor(x: number, y: number, originX: number, originY: number, cellSize: number): { col: number; row: number } {
  return {
    col: Math.floor((x - originX) / cellSize),
    row: Math.floor((y - originY) / cellSize),
  };
}

/** 世界点 → 最近格（**四舍五入**·origin = 格 (0,0) 的中心）。grid-drag-square 落子口径。 */
export function cellNearest(x: number, y: number, originX: number, originY: number, cellSize: number): { col: number; row: number } {
  return {
    col: Math.round((x - originX) / cellSize),
    row: Math.round((y - originY) / cellSize),
  };
}

/** 格中心的世界坐标（与 cellFloor 互逆：origin 为格 (0,0) 左上角 → 中心 = origin + (c + 0.5) * size）。 */
export function cellCenter(c: number, r: number, originX: number, originY: number, cellSize: number): { x: number; y: number } {
  return { x: originX + (c + 0.5) * cellSize, y: originY + (r + 0.5) * cellSize };
}

/** 格原点（与 cellNearest 互逆：origin 为格 (0,0) 中心 → 该格中心 = origin + c * size）。 */
export function cellOrigin(c: number, r: number, originX: number, originY: number, cellSize: number): { x: number; y: number } {
  return { x: originX + c * cellSize, y: originY + r * cellSize };
}

/** 四邻偏移（右·下·左·上·确定性顺序）。 */
export const NEIGHBORS4: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** 八邻偏移（先四正向再四斜向·确定性顺序）。 */
export const NEIGHBORS8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [-1, -1], [1, -1],
];

/**
 * 遍历 (c,r) 的邻格（越界跳过）。dirs 缺省四邻。回调返回 false 可提前终止。
 */
export function forEachNeighbor(
  c: number, r: number, cols: number, rows: number,
  fn: (nc: number, nr: number, ni: number) => boolean | void,
  dirs: ReadonlyArray<readonly [number, number]> = NEIGHBORS4,
): void {
  for (const [dc, dr] of dirs) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
    if (fn(nc, nr, nr * cols + nc) === false) return;
  }
}

/** Bresenham 整数直线：从 (c0,r0) 到 (c1,r1) 经过的格（含两端·确定顺序）。 */
export function bresenhamLine(c0: number, r0: number, c1: number, r1: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  const dx = Math.abs(c1 - c0);
  const dy = -Math.abs(r1 - r0);
  const sx = c0 < c1 ? 1 : -1;
  const sy = r0 < r1 ? 1 : -1;
  let err = dx + dy;
  let c = c0; let r = r0;
  for (;;) {
    out.push([c, r]);
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; c += sx; }
    if (e2 <= dx) { err += dx; r += sy; }
  }
  return out;
}

/** 视线：(c0,r0) 到 (c1,r1) 的 Bresenham 路径上（不含起点·含终点）是否无一格被 blocked 判真。 */
export function lineOfSight(c0: number, r0: number, c1: number, r1: number, blocked: (c: number, r: number) => boolean): boolean {
  const line = bresenhamLine(c0, r0, c1, r1);
  for (let i = 1; i < line.length; i++) {
    const [c, r] = line[i];
    if (blocked(c, r)) return false;
  }
  return true;
}

/**
 * 泛洪填充（BFS·四邻·确定顺序）：从 start 下标出发，经 passable(i) 为真的格可达的全部下标（含起点）。
 * 返回按访问序的下标数组；起点不可通行 → 空数组。
 */
export function floodFill(start: number, cols: number, rows: number, passable: (i: number) => boolean, dirs: ReadonlyArray<readonly [number, number]> = NEIGHBORS4): number[] {
  if (start < 0 || start >= cols * rows || !passable(start)) return [];
  const seen = new Uint8Array(cols * rows);
  const out: number[] = [start];
  seen[start] = 1;
  for (let head = 0; head < out.length; head++) {
    const i = out[head];
    const c = i % cols; const r = Math.floor(i / cols);
    for (const [dc, dr] of dirs) {
      const nc = c + dc; const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (seen[ni] || !passable(ni)) continue;
      seen[ni] = 1;
      out.push(ni);
    }
  }
  return out;
}

/** 连通域标号（四邻·确定序）：返回每格的分量号（-1 = 不可通行）与分量数。 */
export function connectedComponents(cols: number, rows: number, passable: (i: number) => boolean, dirs: ReadonlyArray<readonly [number, number]> = NEIGHBORS4): { label: Int32Array; count: number } {
  const n = cols * rows;
  const label = new Int32Array(n).fill(-1);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] !== -1 || !passable(i)) continue;
    for (const j of floodFill(i, cols, rows, passable, dirs)) label[j] = count;
    count++;
  }
  return { label, count };
}
