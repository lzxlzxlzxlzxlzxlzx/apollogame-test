import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { BlockGrid, BlockShapeDef, PlaceBlockIntent, BoardCell, Color, Flag, ResourceModify, RandomSeed } from '@engine/protocol/components.js';
import { findByComponentId } from '@engine/core/query.js';
import { randomInt } from '@atom-skills/index.js';
import { index } from '@engine/math/grid.js';

// ═══════════════════════════════════════════════════════════════
//  block-grid —— 方块网格棋盘机制（REQ-CAP-block-grid；Tier 3「算法/解释器型机制」大类）。
//
//  Condition→Event→Effect 是反应式布尔逻辑，表达不了「多格形状落点合法性 + 整行整列扫描消除 +
//  无子可落判负」这类带网格扫描/循环的算法——Block Blast / Woodoku / 俄罗斯方块类正是这缺口。
//  现有 t2-drag-place 只吸附六边格（HexPos），t3-match3-board 是「交换→三连→重力→补块」的正交规则，
//  都表达不了本机制。本能力对标 match3-board：一台 config 驱动、确定性的网格算法机。
//
//  数据（游戏蓝图静态建 BlockGrid 单例 + BoardCell 视图格 + RandomSeed）：
//    · BlockGrid.cells：长 cols*rows 的占位网格，-1=空、≥0=已填（值=该块底色 tint，视图直接用）。
//    · BlockGrid.shapes：形状目录（polyomino，cells=扁平 [dc,dr,dc,dr,…] 相对锚点偏移）。
//    · BlockGrid.tray：当前托盘=shapes 下标数组（-1=该槽已用空）；全空 → 按 RandomSeed 确定性补 traySize 个。
//
//  输入接缝：消费 PlaceBlockIntent{slot,col,row}（放置意图）——现在可由测试/点击直接写；
//  之后 grid-drag-square（方形吸附+polyomino 预览+合法高亮）作输入桥写同一意图。本能力只管「判定+结算」。
//
//  每拍：取一条放置意图 → 合法（形状全部格在界内且空）则落子、写 tray 槽=-1、扫整行整列全满 → 清空、
//  按 cellScore*落格数 + lineScore*清行列数 发 ResourceModify（走现成 resource-apply 计分链）；
//  托盘清空则确定性补新；补后判负：所有非空托盘形状在全盘都无处可落 → 置 gameOverFlag。
//  非法意图整次拒绝（no-op·落点预览/高亮反馈是 grid-drag-square 的活）。
//  确定性：整数网格 + 大小比较 + RandomSeed（mulberry32 整数 PRNG）→ lockstep/录放安全。
// ═══════════════════════════════════════════════════════════════

// ── 纯算法 helper（导出供单测；无副作用·确定性）────────────────────────────

/** cells 扁平下标。 */
export function bgIndex(c: number, r: number, cols: number): number {
  return index(c, r, cols);
}

/** 遍历形状的每个 (dc,dr) 偏移对，回调绝对格 (c+dc, r+dr)。cells 为扁平 [dc,dr,…]，奇数长度末位忽略。 */
function forEachShapeCell(shapeCells: readonly number[], c: number, r: number, fn: (cc: number, rr: number) => void): void {
  for (let i = 0; i + 1 < shapeCells.length; i += 2) {
    fn(c + shapeCells[i], r + shapeCells[i + 1]);
  }
}

/** 形状锚在 (c,r) 时能否落：所有格必须在界内且为空(-1)。空形状=不可落（false）。 */
export function canPlace(cells: readonly number[], cols: number, rows: number, shapeCells: readonly number[], c: number, r: number): boolean {
  if (shapeCells.length < 2) return false;
  let ok = true;
  forEachShapeCell(shapeCells, c, r, (cc, rr) => {
    if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) ok = false;
    else if (cells[bgIndex(cc, rr, cols)] !== -1) ok = false;
  });
  return ok;
}

/** 落子：把形状各格写为 fill（原地改 cells）。调用前须 canPlace 为真。 */
export function applyPlace(cells: number[], cols: number, shapeCells: readonly number[], c: number, r: number, fill: number): void {
  forEachShapeCell(shapeCells, c, r, (cc, rr) => { cells[bgIndex(cc, rr, cols)] = fill; });
}

/** 找全满的整行、整列（下标数组）。行满=该行全部 ≠ -1；列满同理。 */
export function fullLines(cells: readonly number[], cols: number, rows: number): { rows: number[]; cols: number[] } {
  const fr: number[] = [];
  const fc: number[] = [];
  for (let r = 0; r < rows; r++) {
    let full = true;
    for (let c = 0; c < cols; c++) if (cells[bgIndex(c, r, cols)] === -1) { full = false; break; }
    if (full) fr.push(r);
  }
  for (let c = 0; c < cols; c++) {
    let full = true;
    for (let r = 0; r < rows; r++) if (cells[bgIndex(c, r, cols)] === -1) { full = false; break; }
    if (full) fc.push(c);
  }
  return { rows: fr, cols: fc };
}

/** 清除给定行/列（置 -1，原地）。返回被清除的格数（行列交叉只算一次）。 */
export function clearLines(cells: number[], cols: number, rows: number, clrRows: readonly number[], clrCols: readonly number[]): number {
  const gone = new Set<number>();
  for (const r of clrRows) for (let c = 0; c < cols; c++) gone.add(bgIndex(c, r, cols));
  for (const c of clrCols) for (let r = 0; r < rows; r++) gone.add(bgIndex(c, r, cols));
  for (const idx of gone) cells[idx] = -1;
  return gone.size;
}

/** 该形状在全盘是否存在任一可落锚点（用于判负）。 */
export function canPlaceAnywhere(cells: readonly number[], cols: number, rows: number, shapeCells: readonly number[]): boolean {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (canPlace(cells, cols, rows, shapeCells, c, r)) return true;
  return false;
}

/** 托盘里任一非空形状还有处可落 → true（可继续）；全都无处可落 → false（游戏结束）。 */
export function anyTrayPlaceable(cells: readonly number[], cols: number, rows: number, shapes: readonly BlockShapeDef[], tray: readonly number[]): boolean {
  for (const si of tray) {
    if (si < 0 || si >= shapes.length) continue;
    if (canPlaceAnywhere(cells, cols, rows, shapes[si].cells)) return true;
  }
  return false;
}

// ── 副作用 helper ────────────────────────────────────────────────

// 在某资源自己的实体上发 ResourceModify（按 id 全局定位；一种一份=不撞一实体多组件）。
function emitResourceModify(world: IWorld, resourceId: string, amount: number): void {
  if (!resourceId || amount === 0) return;
  const e = findByComponentId(world, 'Resource', 'id', resourceId);
  if (e) world.addComponent(e, { type: 'ResourceModify', resourceId, amount, scope: 'global' } as ResourceModify);
}

// 全空托盘按 RandomSeed 确定性补 traySize 个形状下标（index 序推进 seed）。无 seed=不补（托盘耗尽即停）。
function refillTray(b: BlockGrid, seed: RandomSeed | undefined): void {
  if (!seed || b.shapes.length === 0) return;
  const want = b.traySize > 0 ? b.traySize : b.tray.length;
  b.tray = [];
  for (let i = 0; i < want; i++) b.tray.push(randomInt(seed, 0, b.shapes.length));
}

export const blockGridCapability = defineCapability({
  id: 't3-block-grid',
  version: '1.0.0',

  describe: {
    name: 'block-grid',
    summary: '方块网格棋盘：config 驱动的确定性算法机——多格 polyomino 落点合法判定、整行整列消除、托盘确定性补形、无子可落判负。消行走 ResourceModify 计分，视图同步到 BoardCell.Color。',
    semantic: ['tier3', 'mechanic', 'grid', 'puzzle', 'algorithm'],
    whenToUse:
      'Block Blast / Woodoku / 俄罗斯方块类方格放置消除。挂 BlockGrid 单例（cols/rows/cells 网格 + shapes 形状目录 + tray 托盘 + scoreResource/cellScore/lineScore + gameOverFlag）+ RandomSeed；视图格 BoardCell 由蓝图静态建。放置意图写 PlaceBlockIntent{slot,col,row}（grid-drag-square 输入桥或点击/测试产生），本能力判定+落子+消行+计分+判负。',
    examples: [
      "8×8 棋盘：BlockGrid{cols:8,rows:8,cells:[…-1],shapes:[{id:'L',cells:[0,0,0,1,0,2,1,2],tint:16729156}],tray:[0,1,2],traySize:3,scoreResource:'score',cellScore:1,lineScore:10,gameOverFlag:'game_over'} + RandomSeed；拖形状到格→写 PlaceBlockIntent{slot:0,col:3,row:5}→落子、整行满则清、加分",
    ],
  },

  components: {
    provides: {
      BlockGrid: {
        category: 'config',
        describe: '方块网格棋盘单例：尺寸/占位 cells + 形状目录 shapes + 托盘 tray + 计分/判负配置 + 视图底色。',
        fields: {
          cols: { type: 'number', describe: '列数' },
          rows: { type: 'number', describe: '行数' },
          cells: { type: 'number[]', describe: '长 cols*rows 的占位网格：-1=空，≥0=已填（值=该块底色 tint）' },
          shapes: { type: 'string', describe: '形状目录（复杂对象数组·占位类型）：BlockShapeDef[]={id, cells:扁平[dc,dr,…]相对锚点偏移, tint?}' },
          tray: { type: 'number[]', describe: '当前托盘=shapes 下标数组，-1=该槽已用空' },
          traySize: { type: 'number', describe: '托盘槽数（全空时确定性补这么多个新形状）' },
          scoreResource: { type: 'string', describe: '计分 Resource id（空=不计分）' },
          cellScore: { type: 'number', describe: '每落一格给的分' },
          lineScore: { type: 'number', describe: '每清一行/列给的分' },
          gameOverFlag: { type: 'string', describe: '判负 Flag id：托盘所有形状全盘无处可落时置真（空=不判负）' },
          fillTint: { type: 'number', describe: '可选·已填格视图底色（cells 值缺省时用；一般 cells 值本身即 tint）' },
          emptyTint: { type: 'number', describe: '可选·空格视图底色' },
          originX: { type: 'number', describe: '可选·格(0,0)中心世界 x（grid-drag-square 吸附几何；缺省=无几何走点击/测试意图）' },
          originY: { type: 'number', describe: '可选·格(0,0)中心世界 y' },
          cellSize: { type: 'number', describe: '可选·单格边长（世界像素）' },
        },
      },
      BoardCell: {
        category: 'render',
        describe: '视图格（与 match3-board 同一接口共用）：把逻辑格 index 绑到一个可显示实体，block-view-sync 据 cells 写其 Color.tint。蓝图静态建。',
        fields: {
          boardId: { type: 'EntityId', describe: '所属 BlockGrid 实体 id' },
          index: { type: 'number', describe: '逻辑格下标（row*cols+col）' },
        },
      },
      PlaceBlockIntent: {
        category: 'intent',
        describe: '放置意图（一次性·被 block-place 消费）：把 tray[slot] 的形状落到锚点 (col,row)。由 grid-drag-square/点击/测试产生。',
        fields: {
          slot: { type: 'number', describe: '托盘槽下标（0..traySize-1）' },
          col: { type: 'number', describe: '锚点列' },
          row: { type: 'number', describe: '锚点行' },
        },
      },
    },
    reads: ['BlockGrid', 'PlaceBlockIntent', 'RandomSeed', 'Resource', 'Flag', 'BoardCell', 'Color'],
    writes: ['BlockGrid', 'ResourceModify', 'Flag', 'Color'],
    consumes: ['PlaceBlockIntent'],
  },

  config: {},

  systems: [
    {
      // 放置解算：消费一条 PlaceBlockIntent → 判定/落子/消行列/计分/补托盘/判负。
      // Update 相位·runsAfter resource-apply（读上一拍资源·同 match3 纪律，产 ResourceModify 下一拍结算）。
      id: 'block-place',
      phase: SystemPhase.Update,
      runsAfter: ['resource-apply'],
      reads: ['BlockGrid', 'PlaceBlockIntent', 'RandomSeed', 'Resource', 'Flag'],
      writes: ['BlockGrid', 'ResourceModify', 'Flag', 'RandomSeed'], // RandomSeed：nextRandom 推进 seed（P1a 严格模式补齐·此前漏报）
      consumes: ['PlaceBlockIntent'],
      execute(world: IWorld) {
        let board: BlockGrid | undefined;
        let boardId = '';
        { const bid = world.singleton('BlockGrid'); if (bid !== undefined) { board = world.getComponent<BlockGrid>(bid, 'BlockGrid'); boardId = bid; } } // 黑板单例（P1b）：严格模式多份即抛·生产按创建序取首个（= 旧 for…break 语义）
        if (!board) return;

        // 取本拍首条放置意图（按实体 id 升序，确定），处理后清除全部意图。
        const intentIds: string[] = [];
        for (const [iid] of world.query('PlaceBlockIntent')) intentIds.push(iid);
        intentIds.sort();
        const first = intentIds[0];
        if (first !== undefined) {
          const it = world.getComponent<PlaceBlockIntent>(first, 'PlaceBlockIntent')!;
          const slot = it.slot | 0;
          if (slot >= 0 && slot < board.tray.length) {
            const si = board.tray[slot];
            if (si >= 0 && si < board.shapes.length) {
              const shape = board.shapes[si];
              if (canPlace(board.cells, board.cols, board.rows, shape.cells, it.col | 0, it.row | 0)) {
                // 落子（值=形状 tint，视图直接用；缺省 1=已填占位）。
                const fill = typeof shape.tint === 'number' ? shape.tint : 1;
                let placed = 0;
                forEachShapeCell(shape.cells, it.col | 0, it.row | 0, () => { placed++; });
                applyPlace(board.cells, board.cols, shape.cells, it.col | 0, it.row | 0, fill);
                board.tray[slot] = -1; // 用掉该槽
                // 整行整列消除。
                const lines = fullLines(board.cells, board.cols, board.rows);
                const clearedLines = lines.rows.length + lines.cols.length;
                if (clearedLines > 0) clearLines(board.cells, board.cols, board.rows, lines.rows, lines.cols);
                // 计分（落格 + 清行列）走 ResourceModify → resource-apply。
                const gain = placed * (board.cellScore ?? 0) + clearedLines * (board.lineScore ?? 0);
                if (board.scoreResource) emitResourceModify(world, board.scoreResource, gain);
                // 托盘全空 → 确定性补新。
                if (board.tray.every((s) => s < 0)) {
                  const seed = world.getComponent<RandomSeed>(boardId, 'RandomSeed');
                  refillTray(board, seed);
                }
              }
              // 非法落点：整次拒绝（no-op·反馈由 grid-drag-square 在拖拽期给）。
            }
          }
          for (const iid of intentIds) world.removeComponent(iid, 'PlaceBlockIntent');
        }

        // 判负：托盘所有非空形状全盘无处可落 → 置 gameOverFlag（读现成 Flag·走 flow/condition 链）。
        if (board.gameOverFlag && board.tray.some((s) => s >= 0)) {
          if (!anyTrayPlaceable(board.cells, board.cols, board.rows, board.shapes, board.tray)) {
            const fe = findByComponentId(world, 'Flag', 'id', board.gameOverFlag);
            if (fe) { const f = world.getComponent<Flag>(fe, 'Flag'); if (f) f.active = true; }
          }
        }
      },
    },
    {
      // 视图同步：把逻辑 cells 写到各 BoardCell 视图实体的 Color.tint（已填=该格值/fillTint，空=emptyTint）。
      // Commit 相位（最终表现写入·同 match3-view-sync 纪律）。
      id: 'block-view-sync',
      phase: SystemPhase.Commit,
      reads: ['BlockGrid', 'BoardCell'],
      writes: ['Color'],
      consumes: [],
      execute(world: IWorld) {
        let board: BlockGrid | undefined;
        let boardId = '';
        { const bid = world.singleton('BlockGrid'); if (bid !== undefined) { board = world.getComponent<BlockGrid>(bid, 'BlockGrid'); boardId = bid; } } // 黑板单例（P1b）：严格模式多份即抛·生产按创建序取首个（= 旧 for…break 语义）
        if (!board) return;
        for (const [eid] of world.query('BoardCell')) {
          const bc = world.getComponent<BoardCell>(eid, 'BoardCell')!;
          if (bc.boardId !== boardId) continue;
          if (bc.index < 0 || bc.index >= board.cells.length) continue;
          const color = world.getComponent<Color>(eid, 'Color');
          if (!color) continue;
          const v = board.cells[bc.index];
          color.tint = v >= 0 ? (typeof board.fillTint === 'number' && v === 1 ? board.fillTint : v) : (board.emptyTint ?? color.tint);
        }
      },
    },
  ],
});
