import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { MatchBoard, BoardCell, Signal, Color, Text, ResourceModify, RandomSeed, Sprite } from '@engine/protocol/components.js';
import { findByComponentId } from '@engine/core/query.js';
import { randomInt } from '@atom-skills/index.js';
import { index, rowOf, colOf, adjacent4 } from '@engine/math/grid.js';

// ═══════════════════════════════════════════════════════════════
//  match3-board —— 三消棋盘机制（REQ-C-001 一期 + REQ-M3-三消二期；Tier 3「算法/解释器型机制」大类）。
//
//  Condition→Event→Effect 是反应式布尔逻辑，表达不了「带网格邻接扫描 / 循环」的算法——三消正是这类缺口。
//  本能力把「交换 / 找连 / 消除产出 / 重力 / 补块 / 连锁 / 特殊糖 / 格层」做成 config 驱动、确定性的相位状态机：
//
//    idle    ：读点击选格（BoardCell 上由 clickable 发的选中 Signal）→ 选/换；相邻两格 → 交换、转 swapped。
//    swapped ：首扫；有连线 或 特殊糖组合交换（球/纹+纹…）→ clear；否则回退交换 → idle（非法步）。
//    match   ：全盘找 ≥3 同色横/竖连线；有 → clear；无 → idle（稳定）。
//    clear   ：结算——特殊糖连锁引爆（有界工作队列）+ 按 run 形状生成新特殊糖 + 格层减层 + 产料/币 → fall。
//    fall    ：每列非空块下沉到底（尊重石块=分段重力）→ refill。
//    refill  ：顶部空位用 RandomSeed 整数 PRNG 确定性补新（跳过石块）→ match（连锁再扫）。
//
//  二期新增（REQ-M3·全整数位运算保确定性）：
//   · 格编码：cells 仍纯整数——低 8 位=色 0..kindCount-1（COLORLESS=0xFF=彩球无色哨值），bit8-10=特殊糖 flag。
//   · 特殊糖：4 连=条纹（方向随 stripedOrientation）· L/T 交叉=包装 · 5 连=彩球；消除结算按 run 形状生成。
//   · 触发：条纹清整行/列 · 包装清 3×3 · 彩球清全盘该色 · comboTable 双特殊糖组合；连锁引爆=显式队列+已处理集（有界）。
//   · 格层：jelly（果冻·参与消除减层）· blockers（>0=hp 邻接减；-1=石块不可动不可消·重力/补块绕行）。
//
//  产出走现成 ResourceModify（写到各材料自己的 Resource 实体）→ resource-apply 结算 → 游戏已装配好的
//  升级/解锁/展示链自动点亮，游戏数据不动一行。视图格（BoardCell）由游戏蓝图静态建好，本能力只改其外观、不增删实体。
//  确定性：整数网格 + 大小比较 + RandomSeed（mulberry32 整数 PRNG）→ lockstep/录放安全。
// ═══════════════════════════════════════════════════════════════

// ── 格编码（纯整数位运算·确定性）────────────────────────────────────────────
//  一个格 = 非负整数（低位色 + 高位特殊糖 flag）或 EMPTY(-1)。旧纯色值 0..255 编码后=自身 → 一期数据逐字节兼容。
export const EMPTY = -1; // 空格
export const COLOR_MASK = 0xff; // 低 8 位=色
export const SPECIAL_SHIFT = 8; // 特殊糖 flag 起始位
export const COLORLESS = 0xff; // 彩球「无色」哨值（色位，永不与真色相等）

// 特殊糖 flag 闭集（bit8-10·仅 0..4）。STRIPED_H=横纹清整行；STRIPED_V=竖纹清整列。
export const NONE = 0;
export const STRIPED_H = 1; // 横条纹 → 引爆清所在「行」
export const STRIPED_V = 2; // 竖条纹 → 引爆清所在「列」
export const WRAPPED = 3; // 包装糖 → 引爆清 3×3
export const COLORBOMB = 4; // 彩球 → 引爆清全盘某色

// 组合成一格整数。color=色（彩球传 COLORLESS）；special=flag 闭集。
export function makeCell(color: number, special: number): number {
  return ((special & 0x7) << SPECIAL_SHIFT) | (color & COLOR_MASK);
}
// 取色（EMPTY 透传；彩球得 COLORLESS）。
export function cellColor(cell: number): number {
  return cell < 0 ? cell : cell & COLOR_MASK;
}
// 取特殊糖 flag（EMPTY→NONE）。
export function cellSpecial(cell: number): number {
  return cell < 0 ? NONE : (cell >> SPECIAL_SHIFT) & 0x7;
}

// combo 归一：条纹横/竖在组合表里视作同一「条纹」种类（用 STRIPED_H 作 key）。
function comboKey(special: number): number {
  return special === STRIPED_V ? STRIPED_H : special;
}

// ── 纯算法 helper（导出供单测；无副作用，确定性）────────────────────────────
export function cellIndex(c: number, r: number, cols: number): number {
  return index(c, r, cols);
}

// 两格是否四邻（同行相邻列 或 同列相邻行）。
export function adjacent(a: number, b: number, cols: number): boolean {
  return adjacent4(a, b, cols);
}

// 某格「用于连线的色」：空格/彩球/被格层锁住（blockers≠0）→ -1（不参与连线）；否则=色。
function matchColorAt(cells: readonly number[], i: number, blockers?: readonly number[]): number {
  if (blockers && (blockers[i] ?? 0) !== 0) return -1; // 石块/被锁格不参与连线
  const col = cellColor(cells[i]);
  return col < 0 || col === COLORLESS ? -1 : col;
}

// ── run（一条同色 ≥3 的直线连）收集：横向 + 纵向各扫一遍。
interface Run {
  cells: number[];
  horizontal: boolean;
  color: number;
}
function collectRuns(cells: readonly number[], cols: number, rows: number, blockers?: readonly number[]): Run[] {
  const runs: Run[] = [];
  // 横向
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const col = matchColorAt(cells, index(c, r, cols), blockers);
      if (col < 0) {
        c++;
        continue;
      }
      let c2 = c;
      while (c2 < cols && matchColorAt(cells, index(c2, r, cols), blockers) === col) c2++;
      if (c2 - c >= 3) {
        const cc: number[] = [];
        for (let k = c; k < c2; k++) cc.push(index(k, r, cols));
        runs.push({ cells: cc, horizontal: true, color: col });
      }
      c = c2;
    }
  }
  // 纵向
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const col = matchColorAt(cells, index(c, r, cols), blockers);
      if (col < 0) {
        r++;
        continue;
      }
      let r2 = r;
      while (r2 < rows && matchColorAt(cells, index(c, r2, cols), blockers) === col) r2++;
      if (r2 - r >= 3) {
        const cc: number[] = [];
        for (let k = r; k < r2; k++) cc.push(index(c, k, cols));
        runs.push({ cells: cc, horizontal: false, color: col });
      }
      r = r2;
    }
  }
  return runs;
}

// 全盘找 ≥3 同色横/竖连线，返回被消除格 index 集合（按色比较·空格/彩球/锁格不参与）。
// blockers 可选：被格层锁住（≠0）的格不参与连线（一期无 blockers 时逐字节等价旧行为）。
export function findMatches(cells: readonly number[], cols: number, rows: number, blockers?: readonly number[]): Set<number> {
  const matched = new Set<number>();
  for (const run of collectRuns(cells, cols, rows, blockers)) for (const i of run.cells) matched.add(i);
  return matched;
}

// 每列非空块下沉到底（保持列内相对顺序），上方补 EMPTY。原地修改 cells。
// blockers 可选：任何障碍（blockers[i]≠0：石块-1 / 障碍 hp>0）都是不可动隔板——每列被障碍分段，各段内各自重力（"重力绕石块"）。
export function applyGravity(cells: number[], cols: number, rows: number, blockers?: readonly number[]): void {
  const collapseSeg = (c: number, topR: number, botR: number): void => {
    const stack: number[] = [];
    for (let r = botR; r >= topR; r--) {
      const v = cells[index(c, r, cols)];
      if (v !== EMPTY) stack.push(v); // 自底向上收集非空块
    }
    for (let r = botR, i = 0; r >= topR; r--, i++) {
      cells[index(c, r, cols)] = i < stack.length ? stack[i] : EMPTY; // 自底向下回填，其余置空
    }
  };
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 0; r < rows; r++) {
      if (blockers && (blockers[index(c, r, cols)] ?? 0) !== 0) {
        if (r - 1 >= start) collapseSeg(c, start, r - 1); // 结算障碍上方这一段
        start = r + 1; // 段在障碍之上继续
      }
    }
    if (rows - 1 >= start) collapseSeg(c, start, rows - 1); // 结算顶段
  }
}

// 顶部（任意 EMPTY）按确定性 PRNG 补新色（index 序，确定）。原地修改 cells + 推进 seed。
// blockers 可选：障碍位（blockers[i]≠0：石块/存活 hp）不补；已被打掉的障碍已在结算时置 0+EMPTY，会被正常补。
export function refillEmpty(cells: number[], kindCount: number, seed: RandomSeed, blockers?: readonly number[]): void {
  for (let i = 0; i < cells.length; i++) {
    if (blockers && (blockers[i] ?? 0) !== 0) continue; // 障碍位不补（石块/存活障碍）
    if (cells[i] === EMPTY) cells[i] = randomInt(seed, 0, kindCount);
  }
}

function swapCells(cells: number[], a: number, b: number): void {
  const t = cells[a];
  cells[a] = cells[b];
  cells[b] = t;
}

// ── 几何：行/列/盒/同色 全格集（纯确定性·供触发效果与 combo）────────────────
function rowCells(i: number, cols: number, rows: number): number[] {
  const r = rowOf(i, cols);
  const out: number[] = [];
  for (let c = 0; c < cols; c++) out.push(index(c, r, cols));
  return out;
}
function colCells(i: number, cols: number, rows: number): number[] {
  const c = colOf(i, cols);
  const out: number[] = [];
  for (let r = 0; r < rows; r++) out.push(index(c, r, cols));
  return out;
}
// 以 i 为心、半径 rad 的方块（rad=1 → 3×3；rad=2 → 5×5），越界裁掉。
function boxCells(i: number, cols: number, rows: number, rad: number): number[] {
  const r0 = rowOf(i, cols);
  const c0 = colOf(i, cols);
  const out: number[] = [];
  for (let r = r0 - rad; r <= r0 + rad; r++) {
    if (r < 0 || r >= rows) continue;
    for (let c = c0 - rad; c <= c0 + rad; c++) {
      if (c < 0 || c >= cols) continue;
      out.push(index(c, r, cols));
    }
  }
  return out;
}
function threeRows(i: number, cols: number, rows: number): number[] {
  const r0 = rowOf(i, cols);
  const out: number[] = [];
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    if (r < 0 || r >= rows) continue;
    for (let c = 0; c < cols; c++) out.push(index(c, r, cols));
  }
  return out;
}
function threeCols(i: number, cols: number, rows: number): number[] {
  const c0 = colOf(i, cols);
  const out: number[] = [];
  for (let c = c0 - 1; c <= c0 + 1; c++) {
    if (c < 0 || c >= cols) continue;
    for (let r = 0; r < rows; r++) out.push(index(c, r, cols));
  }
  return out;
}
function colorCellsOf(cells: readonly number[], color: number): number[] {
  if (color < 0 || color === COLORLESS) return [];
  const out: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cellColor(cells[i]) === color) out.push(i);
  return out;
}
// 全盘最多数的色（并列取最小色号·确定）。空盘/无色 → -1。
function dominantColor(cells: readonly number[]): number {
  const cnt = new Map<number, number>();
  for (const cell of cells) {
    const c = cellColor(cell);
    if (c >= 0 && c !== COLORLESS) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  }
  let best = -1;
  let bestN = -1;
  for (const [c, n] of cnt) {
    if (n > bestN || (n === bestN && c < best)) {
      best = c;
      bestN = n;
    }
  }
  return best;
}
function neighbors4(i: number, cols: number, rows: number): number[] {
  const r = rowOf(i, cols);
  const c = colOf(i, cols);
  const out: number[] = [];
  if (r > 0) out.push(i - cols);
  if (r < rows - 1) out.push(i + cols);
  if (c > 0) out.push(i - 1);
  if (c < cols - 1) out.push(i + 1);
  return out;
}

// ── 单个特殊糖的引爆波及格（几何·不含格层裁剪·裁剪在 resolveClear 里做）──────────
export function effectCells(cells: readonly number[], cols: number, rows: number, i: number, special: number): number[] {
  switch (special) {
    case STRIPED_H:
      return rowCells(i, cols, rows);
    case STRIPED_V:
      return colCells(i, cols, rows);
    case WRAPPED:
      return boxCells(i, cols, rows, 1); // 3×3（V1 一次爆）
    case COLORBOMB:
      // 连锁中被波及的彩球：确定性清「当前全盘最多色」（swap 主动引爆彩球的目标色另由 combo 路径预置）。
      return colorCellsOf(cells, dominantColor(cells));
    default:
      return [];
  }
}

// ── 连锁引爆解算（**有界**：显式工作队列 + 已处理集，杜绝互指条纹环的无界递归）──────
//  seed：初始清除格（连线集 / combo 预置集）。alreadyDetonated：已被上层消化效果的特殊糖 index（不再自行引爆）。
//  blockers：石块/锁格（≠0）不可被清（波及也跳过）。返回最终要清的全部格 index。
export function resolveClear(
  cells: readonly number[],
  cols: number,
  rows: number,
  seed: Iterable<number>,
  blockers?: readonly number[],
  alreadyDetonated?: Iterable<number>,
): Set<number> {
  const clearable = (i: number): boolean => (blockers?.[i] ?? 0) === 0; // 石块/锁格不可清
  const toClear = new Set<number>();
  const queue: number[] = [];
  const queued = new Set<number>();
  const processed = new Set<number>(alreadyDetonated ?? []);
  const enqueue = (i: number): void => {
    if (cellSpecial(cells[i]) !== NONE && !queued.has(i)) {
      queue.push(i);
      queued.add(i);
    }
  };
  for (const i of seed) {
    if (!clearable(i)) continue;
    toClear.add(i);
    enqueue(i);
  }
  // 每个特殊糖 index 至多被 processed 一次 → 循环 ≤ 特殊糖数 → 有界终止。
  while (queue.length) {
    const i = queue.shift()!;
    if (processed.has(i)) continue;
    processed.add(i);
    for (const j of effectCells(cells, cols, rows, i, cellSpecial(cells[i]))) {
      if (!clearable(j)) continue;
      toClear.add(j);
      enqueue(j);
    }
  }
  return toClear;
}

// ── 特殊糖生成：按 run 形状分类（消除结算时调用）──────────────────────────────
export interface Spawn {
  index: number;
  special: number;
  color: number;
}
// 条纹方向：perpendicular（缺省）= 与连线垂直；parallel = 与连线同向。
function stripeSpecial(runHorizontal: boolean, orientation: string | undefined): number {
  const perp = orientation !== 'parallel';
  if (perp) return runHorizontal ? STRIPED_V : STRIPED_H;
  return runHorizontal ? STRIPED_H : STRIPED_V;
}
// 分析本次连线的所有 run，按形状产出应生成的新特殊糖（含生成位）。
//  preferA/preferB：玩家交换的两格——若落在某组 run 内则在此生成（"玩家交换格优先"）；否则取最长 run 中点（"连锁时 run 中点"）。
export function classifySpawns(
  cells: readonly number[],
  cols: number,
  rows: number,
  preferA: number,
  preferB: number,
  orientation?: string,
  blockers?: readonly number[],
): Spawn[] {
  const runs = collectRuns(cells, cols, rows, blockers);
  if (runs.length === 0) return [];
  // 并查集：共享格的 run 归一组（横+竖同色交叉 = L/T）。
  const parent = runs.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };
  const cellRuns = new Map<number, number[]>();
  runs.forEach((run, ri) =>
    run.cells.forEach((ci) => {
      const arr = cellRuns.get(ci) ?? [];
      arr.push(ri);
      cellRuns.set(ci, arr);
    }),
  );
  for (const arr of cellRuns.values()) for (let k = 1; k < arr.length; k++) union(arr[0], arr[k]);
  const groups = new Map<number, number[]>();
  runs.forEach((_, ri) => {
    const root = find(ri);
    const arr = groups.get(root) ?? [];
    arr.push(ri);
    groups.set(root, arr);
  });
  // 组按最小格 index 排序 → 确定性遍历。
  const summary = [...groups.values()]
    .map((ris) => {
      let minCell = Infinity;
      let maxLen = 0;
      let hasH = false;
      let hasV = false;
      let color = -1;
      let longest = runs[ris[0]];
      const allCells = new Set<number>();
      for (const ri of ris) {
        const run = runs[ri];
        if (run.horizontal) hasH = true;
        else hasV = true;
        if (run.cells.length > maxLen) {
          maxLen = run.cells.length;
          longest = run;
        }
        color = run.color;
        for (const ci of run.cells) {
          allCells.add(ci);
          if (ci < minCell) minCell = ci;
        }
      }
      return { minCell, maxLen, hasH, hasV, color, longest, allCells };
    })
    .sort((a, b) => a.minCell - b.minCell);

  const spawns: Spawn[] = [];
  for (const g of summary) {
    let special = NONE;
    let color = g.color;
    if (g.maxLen >= 5) {
      special = COLORBOMB; // 直线 5 连 = 彩球（无色）
      color = COLORLESS;
    } else if (g.hasH && g.hasV) {
      special = WRAPPED; // L/T 交叉 = 包装糖
    } else if (g.maxLen === 4) {
      special = stripeSpecial(g.longest.horizontal, orientation); // 直线 4 连 = 条纹
    } else {
      continue; // 纯 3 连不生成
    }
    let idx: number;
    if (preferA >= 0 && g.allCells.has(preferA)) idx = preferA;
    else if (preferB >= 0 && g.allCells.has(preferB)) idx = preferB;
    else idx = g.longest.cells[Math.floor(g.longest.cells.length / 2)];
    spawns.push({ index: idx, special, color });
  }
  return spawns;
}

// ── 特殊糖组合交换（swap 两个特殊糖 / 彩球+任意）─────────────────────────────
export type ComboEffect = 'cross' | 'threeRowsCols' | 'fiveByFive' | 'wholeBoard';
export interface ComboRule {
  a: number;
  b: number;
  effect: string;
}
// 预置 4 条组合（config 未给 comboTable 时的默认闭集）：纹+纹=十字、纹+包=3行3列、包+包=5×5、球+球=全盘。
export const DEFAULT_COMBO_TABLE: ComboRule[] = [
  { a: STRIPED_H, b: STRIPED_H, effect: 'cross' },
  { a: STRIPED_H, b: WRAPPED, effect: 'threeRowsCols' },
  { a: WRAPPED, b: WRAPPED, effect: 'fiveByFive' },
  { a: COLORBOMB, b: COLORBOMB, effect: 'wholeBoard' },
];
function lookupCombo(table: ComboRule[], sa: number, sb: number): string {
  const ka = comboKey(sa);
  const kb = comboKey(sb);
  for (const r of table) {
    const ra = comboKey(r.a);
    const rb = comboKey(r.b);
    if ((ra === ka && rb === kb) || (ra === kb && rb === ka)) return r.effect;
  }
  return 'cross'; // 兜底：当十字处理
}
function comboEffectCells(effect: string, i: number, cols: number, rows: number, cells: readonly number[]): number[] {
  switch (effect) {
    case 'cross':
      return [...rowCells(i, cols, rows), ...colCells(i, cols, rows)];
    case 'threeRowsCols':
      return [...threeRows(i, cols, rows), ...threeCols(i, cols, rows)];
    case 'fiveByFive':
      return boxCells(i, cols, rows, 2);
    case 'wholeBoard':
      return cells.map((_, k) => k);
    default:
      return [...rowCells(i, cols, rows), ...colCells(i, cols, rows)];
  }
}
// 交换的两格是否构成「特殊糖组合」（双特殊糖 或 含彩球）——这类即使无同色连线也算合法步并引爆。
export function isSwapCombo(cells: readonly number[], a: number, b: number): boolean {
  const sa = cellSpecial(cells[a]);
  const sb = cellSpecial(cells[b]);
  return (sa !== NONE && sb !== NONE) || sa === COLORBOMB || sb === COLORBOMB;
}
// 组合交换的清除种子集（含两交换格）。彩球+普通=清该色；球+球=全盘；纹/包组合按 comboTable。
export function computeSwapComboClear(
  cells: readonly number[],
  cols: number,
  rows: number,
  a: number,
  b: number,
  table: ComboRule[],
): Set<number> {
  const sa = cellSpecial(cells[a]);
  const sb = cellSpecial(cells[b]);
  const aBomb = sa === COLORBOMB;
  const bBomb = sb === COLORBOMB;
  const set = new Set<number>([a, b]);
  if (aBomb && bBomb) {
    for (let i = 0; i < cells.length; i++) set.add(i); // 球+球=全盘
    return set;
  }
  if (aBomb || bBomb) {
    const otherIdx = aBomb ? b : a;
    const col = cellColor(cells[otherIdx]);
    for (const i of colorCellsOf(cells, col)) set.add(i); // 彩球+普通/特殊=清该色
    return set;
  }
  const effect = lookupCombo(table, sa, sb); // 纹/包 双特殊糖组合
  for (const i of comboEffectCells(effect, a, cols, rows, cells)) set.add(i);
  return set;
}

// 在某资源自己的实体上发 ResourceModify（按 id 全局定位；一种一份=不撞一实体多组件）。
function emitResourceModify(world: IWorld, resourceId: string | undefined, amount: number): void {
  if (!resourceId || amount === 0) return;
  const e = findByComponentId(world, 'Resource', 'id', resourceId);
  if (e) world.addComponent(e, { type: 'ResourceModify', resourceId, amount, scope: 'global' } as ResourceModify);
}

// 结算某次清除对格层的作用（纯逻辑·原地改 b.cells/jelly/blockers），返回各类产出计数。
//  jelly：被清格所在的果冻减 1（每格一次）。blockers：与被清格四邻、hp>0 的障碍减 1（每障碍每次至多减 1）。
function applyLayerEffects(
  b: MatchBoard,
  toClear: Set<number>,
): { gain: Map<string, number>; coin: number; jellyHits: number; blockerHits: number } {
  const gain = new Map<string, number>();
  let coin = 0;
  let jellyHits = 0;
  let blockerHits = 0;
  for (const i of toClear) {
    const kind = cellColor(b.cells[i]);
    if (kind >= 0 && kind < b.kindResource.length) {
      const rid = b.kindResource[kind];
      gain.set(rid, (gain.get(rid) ?? 0) + b.matAmount);
    }
    coin += b.coinPerTile;
    if (b.jelly && b.jelly[i] > 0) {
      b.jelly[i] -= 1; // 果冻参与消除减一层
      jellyHits += 1;
    }
  }
  if (b.blockers) {
    const hit = new Set<number>();
    for (const i of toClear) for (const n of neighbors4(i, b.cols, b.rows)) if ((b.blockers[n] ?? 0) > 0) hit.add(n);
    for (const n of hit) {
      b.blockers[n] -= 1; // 邻接消除损障碍 1 hp
      blockerHits += 1;
      if (b.blockers[n] === 0) b.cells[n] = EMPTY; // hp 归零=障碍清除，格转空待补
    }
  }
  for (const i of toClear) b.cells[i] = EMPTY; // 清空（特殊糖生成在 caller 里覆盖回填）
  return { gain, coin, jellyHits, blockerHits };
}

// idle 相位：读本 tick 选中信号（clickable 命中 BoardCell 时发），驱动选/换逻辑。
function handleIdleInput(world: IWorld, boardId: string, b: MatchBoard): void {
  let picked = -1;
  for (const [eid] of world.query('BoardCell', 'Signal')) {
    const bc = world.getComponent<BoardCell>(eid, 'BoardCell')!;
    if (bc.boardId !== boardId) continue;
    if ((b.blockers?.[bc.index] ?? 0) !== 0) continue; // 石块/被锁格不可选/换
    const sig = world.getComponent<Signal>(eid, 'Signal')!;
    if (sig.name !== b.selectAction) continue;
    if (picked === -1 || bc.index < picked) picked = bc.index; // 同 tick 多选取最小 index（确定性）
  }
  if (picked === -1) return;
  if (b.selIndex === -1) {
    b.selIndex = picked;
  } else if (picked === b.selIndex) {
    b.selIndex = -1; // 再点自己 = 取消
  } else if (adjacent(b.selIndex, picked, b.cols)) {
    swapCells(b.cells, b.selIndex, picked);
    b.swapA = b.selIndex;
    b.swapB = picked;
    b.selIndex = -1;
    b.phase = 'swapped';
    b.stepTimer = 0;
  } else {
    b.selIndex = picked; // 非相邻 = 改选
  }
}

export const match3BoardCapability = defineCapability({
  id: 't3-match3-board',
  version: '1.1.0',

  describe: {
    name: 'match3-board',
    summary:
      '三消棋盘机制：config 驱动的确定性相位状态机（交换/找连/消除产出/重力/补块/连锁 + 特殊糖/格层/目标）。消除按 kindResource 产料+币、格层减层产料，视图同步到 BoardCell 实体外观。',
    semantic: ['tier3', 'mechanic', 'grid', 'match3', 'algorithm'],
    whenToUse:
      '三消/连连看/网格解谜（含糖果传奇级特殊糖+果冻/障碍格层）。挂 MatchBoard 单例（config+cells+相位）+ RandomSeed；视图格 BoardCell+Clickable+Color+Text 由蓝图静态建。点格→clickable 发选中信号→本能力选/换/消，产料/减层/扣步走 ResourceModify → 胜负走现成 Condition。',
    examples: [
      '6 色 8×8 材料三消：MatchBoard{ cols:8,rows:8,kindCount:6, kindResource:[...6 材料 id], coinResource:"coin", coinPerTile:1 }',
      '4 连生成条纹（stripedOrientation:"perpendicular"），L/T 生成包装糖，5 连生成彩球；引爆走行/列/3×3/全色',
      '格层：jelly:[0,1,2,…] 果冻减层写 jellyResource；blockers:[…-1 石块/2 障碍] 邻接减 hp 写 blockerResource → Condition 判胜负',
    ],
  },

  components: {
    provides: {
      MatchBoard: {
        category: 'config',
        describe: '三消棋盘单例：尺寸/种类/cells 网格 + 产出映射 + 相位状态机字段 + 特殊糖/格层可选扩展。',
        fields: {
          cols: { type: 'number', describe: '列数' },
          rows: { type: 'number', describe: '行数' },
          kindCount: { type: 'number', describe: '棋子种类数' },
          cells: { type: 'number[]', describe: '长 cols*rows 的网格：低 8 位=色 0..kindCount-1（-1=空·0xFF=彩球无色），bit8-10=特殊糖 flag' },
          kindResource: { type: 'string[]', describe: '种类→产出 Resource id' },
          matAmount: { type: 'number', describe: '每消一格给对应材料的量' },
          coinResource: { type: 'string', describe: '货币 Resource id（空串=不产币）' },
          coinPerTile: { type: 'number', describe: '每消一格给的货币' },
          kindTint: { type: 'number[]', describe: '种类→视图底色' },
          kindLabel: { type: 'string[]', describe: '种类→视图文字' },
          phase: { type: 'string', describe: "'idle'|'swapped'|'match'|'clear'|'fall'|'refill'" },
          selIndex: { type: 'number', describe: '当前选中格（-1=无）' },
          swapA: { type: 'number', describe: '本次交换格 A（-1=无）' },
          swapB: { type: 'number', describe: '本次交换格 B（-1=无）' },
          stepTimer: { type: 'number', describe: '相位节拍计数' },
          stepDelay: { type: 'number', describe: '相位间等待 tick（0=即时）' },
          selectAction: { type: 'string', describe: '选中格的信号名（clickable 发的 Signal.name）' },
          movesResource: { type: 'string', describe: '可选·步数 Resource id：合法交换（产生连线/组合）-1，非法步弹回不扣；缺省/空=不限步' },
          kindSkinEntities: { type: 'string[]', describe: '可选·种类→皮肤定义实体 id（各持 Sprite{textureKey:"art:…"}）：view-sync 把已解析贴图 key 写到 BoardCell.Sprite——糖果式图片皮；缺省=色块+文字' },
          stripedOrientation: { type: 'string', describe: "可选·条纹方向 'perpendicular'（缺省·与连线垂直）|'parallel'（与连线同向）。组合表 comboTable（对象数组·见组件契约）缺省=预置 4 条" },
          jelly: { type: 'number[]', describe: '可选·果冻层 0/1/2（长 cols*rows）：本格参与消除减 1；缺省=无果冻' },
          blockers: { type: 'number[]', describe: '可选·障碍层（长 cols*rows）：>0=hp（邻接消除减 1，0=解锁）；-1=石块（不可动/消·重力补块绕行）；0=无；缺省=无障碍' },
          jellyResource: { type: 'string', describe: '可选·果冻减层写入的 Resource id（沿 kindResource 模式→Condition 判目标）' },
          blockerResource: { type: 'string', describe: '可选·障碍减 hp 写入的 Resource id（→Condition 判目标）' },
        },
      },
      BoardCell: {
        category: 'config',
        describe: '视图格：把逻辑格 index 绑到一个可点/可显示的实体。',
        fields: {
          boardId: { type: 'EntityId', describe: '所属棋盘实体 id' },
          index: { type: 'number', describe: '逻辑格下标（0..cols*rows-1）' },
        },
      },
    },
    reads: ['MatchBoard', 'BoardCell', 'Signal', 'RandomSeed', 'Resource'],
    writes: ['MatchBoard', 'ResourceModify', 'Color', 'Text'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      // 相位状态机：推进逻辑网格、产出 ResourceModify。Update 相位（晚于 clickable 产选中信号、早于 resource-apply 结算）。
      id: 'match-resolve',
      reads: ['MatchBoard', 'BoardCell', 'Signal', 'RandomSeed', 'Resource'],
      writes: ['MatchBoard', 'ResourceModify', 'RandomSeed'], // RandomSeed：补位随机 nextRandom 推进 seed（P1a 严格模式补齐·此前漏报）
      consumes: [],
      // 定序（R10 修订·game-j 撞出四系统环 resource-apply→event-when→clickable→match-resolve→resource-apply）：
      // 显式排在 resource-apply **之后**压制 writer→consumer 自动边——产料/扣步**下一拍**被结算
      // （离散反馈一拍延迟=引擎教义·effect-apply 同款）；与 event-when/clickable 共存的世界不再成环。
      runsAfter: ['resource-apply'],
      execute(world: IWorld) {
        for (const [bid] of world.query('MatchBoard')) {
          const b = world.getComponent<MatchBoard>(bid, 'MatchBoard')!;

          if (b.phase === 'idle') {
            handleIdleInput(world, bid, b);
            continue;
          }

          // 结算相位按 stepDelay 节拍推进（让连锁可见；stepDelay=0 即时）。
          if (b.stepTimer < b.stepDelay) {
            b.stepTimer += 1;
            continue;
          }
          b.stepTimer = 0;

          switch (b.phase) {
            case 'swapped': {
              const combo = b.swapA >= 0 && b.swapB >= 0 && isSwapCombo(b.cells, b.swapA, b.swapB);
              if (combo || findMatches(b.cells, b.cols, b.rows, b.blockers).size > 0) {
                emitResourceModify(world, b.movesResource, -1); // 合法步扣 1（缺省不限步）
                b.phase = 'clear'; // 保留 swapA/swapB 供 clear 判组合 / 优先生成位；clear 里消化后再清零
              } else {
                // 无连线且非组合 → 回退交换（非法步）。
                if (b.swapA >= 0 && b.swapB >= 0) swapCells(b.cells, b.swapA, b.swapB);
                b.swapA = -1;
                b.swapB = -1;
                b.phase = 'idle';
              }
              break;
            }
            case 'match': {
              if (findMatches(b.cells, b.cols, b.rows, b.blockers).size > 0) {
                b.phase = 'clear';
              } else {
                b.swapA = -1;
                b.swapB = -1;
                b.phase = 'idle'; // 稳定，无连线
              }
              break;
            }
            case 'clear': {
              const swapCombo = b.swapA >= 0 && b.swapB >= 0 && isSwapCombo(b.cells, b.swapA, b.swapB);
              let seed: Set<number>;
              let preDetonated: number[] = [];
              let spawns: Spawn[] = [];
              if (swapCombo) {
                // 组合交换：预置组合清除集，两交换糖标记 already（不再自行按几何引爆·其组合效果已入 seed）。
                seed = computeSwapComboClear(b.cells, b.cols, b.rows, b.swapA, b.swapB, b.comboTable ?? DEFAULT_COMBO_TABLE);
                preDetonated = [b.swapA, b.swapB];
              } else {
                // 普通连线：按 run 形状生成新特殊糖（生成位优先玩家交换格·连锁取 run 中点）。
                seed = findMatches(b.cells, b.cols, b.rows, b.blockers);
                spawns = classifySpawns(b.cells, b.cols, b.rows, b.swapA, b.swapB, b.stripedOrientation, b.blockers);
              }
              // 连锁引爆（有界工作队列）→ 最终清除集。
              const toClear = resolveClear(b.cells, b.cols, b.rows, seed, b.blockers, preDetonated);
              // 结算格层 + 产出（内部把 toClear 全置 EMPTY）。
              const { gain, coin, jellyHits, blockerHits } = applyLayerEffects(b, toClear);
              for (const [rid, amt] of gain) emitResourceModify(world, rid, amt);
              emitResourceModify(world, b.coinResource, coin);
              if (jellyHits) emitResourceModify(world, b.jellyResource, jellyHits);
              if (blockerHits) emitResourceModify(world, b.blockerResource, blockerHits);
              // 回填新生成的特殊糖（覆盖刚被置空的生成位）。
              for (const s of spawns) if (toClear.has(s.index)) b.cells[s.index] = makeCell(s.color, s.special);
              b.swapA = -1;
              b.swapB = -1;
              b.phase = 'fall';
              break;
            }
            case 'fall': {
              applyGravity(b.cells, b.cols, b.rows, b.blockers);
              b.phase = 'refill';
              break;
            }
            case 'refill': {
              const seed = world.getComponent<RandomSeed>(bid, 'RandomSeed');
              if (seed) refillEmpty(b.cells, b.kindCount, seed, b.blockers);
              b.phase = 'match'; // 连锁再扫
              break;
            }
          }
        }
      },
    },
    {
      // 视图同步：把逻辑 cells 写到各 BoardCell 视图实体的 Color.tint/Text.content。Commit 相位（最终表现写入）。
      id: 'match-view-sync',
      phase: SystemPhase.Commit,
      reads: ['MatchBoard', 'BoardCell', 'Sprite'],
      writes: ['Color', 'Text', 'Sprite'],
      consumes: [],
      execute(world: IWorld) {
        for (const [bid] of world.query('MatchBoard')) {
          const b = world.getComponent<MatchBoard>(bid, 'MatchBoard')!;
          // 皮肤定义实体（可选）：种类→已解析贴图 key（美术管线换装即换全盘·糖果式图片皮）
          const skins = (b.kindSkinEntities ?? []).map((defId) => world.getComponent<Sprite>(defId, 'Sprite')?.textureKey ?? '');
          for (const [eid] of world.query('BoardCell')) {
            const bc = world.getComponent<BoardCell>(eid, 'BoardCell')!;
            if (bc.boardId !== bid) continue;
            const kind = cellColor(b.cells[bc.index]); // 按色取视图（特殊糖仍显其色·彩球=COLORLESS 越界→回退空观感）
            const color = world.getComponent<Color>(eid, 'Color');
            if (color && kind >= 0 && kind < b.kindTint.length) color.tint = b.kindTint[kind];
            const text = world.getComponent<Text>(eid, 'Text');
            if (text) text.content = kind >= 0 && kind < b.kindLabel.length ? b.kindLabel[kind] : '';
            const sp = world.getComponent<Sprite>(eid, 'Sprite');
            if (sp && skins.length) sp.textureKey = kind >= 0 && kind < skins.length ? skins[kind] : '';
          }
        }
      },
    },
  ],
});
