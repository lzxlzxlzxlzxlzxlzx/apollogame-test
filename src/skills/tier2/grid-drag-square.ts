import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { BlockGrid, BlockTrayPiece, PlaceBlockIntent, InputQueue, Transform, Shape } from '@engine/protocol/components.js';
import { cellNearest } from '@engine/math/grid.js';

// ═══════════════════════════════════════════════════════════════
//  grid-drag-square —— 方形网格拖放输入桥（REQ-CAP-grid-drag-square；Block Blast 核心机制②）。
//
//  t2-drag-place 只吸附六边格（HexPos·单实体上场/调位）；本能力是方形网格的 polyomino「盖章」输入：
//  拖起点命中一个托盘块（BlockTrayPiece）→ 取其 slot；拖终点按方格几何吸附成 (col,row) → 写一条
//  PlaceBlockIntent{slot,col,row}（block-grid 的放置意图接缝）。合法性判定/落子/消行/判负全在 block-grid
//  ——本能力只把「拖到哪个方格」翻译成意图，是纯输入桥（与 drag-place 同定位，只是方形+盖章而非六边+移子）。
//
//  壳层合成的 drag 动作（PointerInputSource·pointerup 超阈值）：{key:'drag', x/y:起点世界坐标,
//  values:[终点x,终点y]}——坐标已逆投影，lockstep 安全。每拍至多处理一条（人手速；同拍多条取首条，确定）。
//  定序：runsBefore block-place → 同拍写意图、同拍被消费（落子零延迟可感）。
//  确定性：命中按实体 id 升序、方格吸附纯算术（round）。
//
//  注：拖拽中「合法/非法高亮预览」需壳层开 pointermove 实时流 + 一套预览渲染约定（本引擎尚无先例）——
//  作为独立后续件评审（见 requests.md REQ-CAP-grid-drag-square「高亮反馈」残项）；本能力先落可玩的落子桥。
// ═══════════════════════════════════════════════════════════════

/** 世界点吸附到方格：origin 为格 (0,0) 中心、cellSize 为边长 → 最近格 (col,row)。纯函数·导出供单测。 */
export function squarePointToCell(originX: number, originY: number, cellSize: number, x: number, y: number): { col: number; row: number } {
  return cellNearest(x, y, originX, originY, cellSize);
}

// 命中托盘块（多块按 id 升序首中，确定）：起点落在某 BlockTrayPiece 实体的 Shape 命中体内。
function hitTrayPiece(world: IWorld, x: number, y: number): { eid: string; piece: BlockTrayPiece } | null {
  const ids: string[] = [];
  for (const [eid] of world.query('BlockTrayPiece')) ids.push(eid);
  ids.sort();
  for (const eid of ids) {
    const t = world.getComponent<Transform>(eid, 'Transform');
    const sh = world.getComponent<Shape>(eid, 'Shape');
    if (!t || !sh) continue;
    let hit = false;
    if (sh.kind === 'circle') {
      const rr = sh.radius ?? 8;
      const dx = x - t.x, dy = y - t.y;
      hit = dx * dx + dy * dy <= rr * rr;
    } else {
      const w = (sh.width ?? 16) / 2, h = (sh.height ?? 16) / 2;
      hit = Math.abs(x - t.x) <= w && Math.abs(y - t.y) <= h;
    }
    if (hit) return { eid, piece: world.getComponent<BlockTrayPiece>(eid, 'BlockTrayPiece')! };
  }
  return null;
}

export const gridDragSquareCapability = defineCapability({
  id: 't2-grid-drag-square',
  version: '1.0.0',

  describe: {
    name: 'grid-drag-square',
    summary: '方形网格拖放输入桥：拖起点命中托盘块（BlockTrayPiece）取 slot、拖终点按方格几何吸附成 (col,row) → 写 PlaceBlockIntent。block-grid 的配套输入半（方形+polyomino 盖章，区别于 drag-place 的六边+移子）。',
    semantic: ['tier2', 'input', 'drag', 'grid', 'square'],
    whenToUse:
      'Block Blast/Woodoku 类：托盘里拖形状到方格棋盘。BlockGrid 补方格像素几何 {originX,originY,cellSize}；每个托盘形状实体挂 BlockTrayPiece{boardId,slot} + Transform + Shape（命中体）。壳层 PointerInputSource 自动合成 drag 动作 → 本能力吸附成格并写 PlaceBlockIntent，block-grid 判定+落子。',
    examples: [
      "拖块：托盘形状实体 BlockTrayPiece{boardId:'board', slot:0} + Transform + Shape{kind:'box',width:48,height:48}；拖到棋盘 (3,5) 格 → 写 PlaceBlockIntent{slot:0,col:3,row:5}",
    ],
  },

  components: {
    provides: {
      BlockTrayPiece: {
        category: 'config',
        describe: '托盘块：把一个可拖托盘形状实体绑到 (棋盘 boardId, 槽位 slot)。蓝图静态建（配 Transform+Shape 命中体）。',
        fields: {
          boardId: { type: 'EntityId', describe: '所属 BlockGrid 实体 id（取其 originX/originY/cellSize 做吸附）' },
          slot: { type: 'number', describe: '对应 BlockGrid.tray 的槽下标' },
        },
      },
    },
    reads: ['InputQueue', 'BlockTrayPiece', 'BlockGrid', 'Transform', 'Shape'],
    writes: ['PlaceBlockIntent'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'grid-drag-square',
      phase: SystemPhase.Update,
      // 写 PlaceBlockIntent → block-place 消费；同拍先写后吃 → 落子零延迟。block-grid 未装时此依赖被忽略。
      runsBefore: ['block-place'],
      reads: ['InputQueue', 'BlockTrayPiece', 'BlockGrid', 'Transform', 'Shape'],
      writes: ['PlaceBlockIntent'],
      consumes: [],
      execute(world: IWorld) {
        // 取本拍首条 drag（每拍至多一条，确定）。
        let drag: { fx: number; fy: number; tx: number; ty: number } | null = null;
        for (const [qid] of world.query('InputQueue')) {
          const q = world.getComponent<InputQueue>(qid, 'InputQueue');
          if (!q) continue;
          for (const a of q.actions) {
            if (a.key === 'drag' && a.x !== undefined && a.y !== undefined && a.values && a.values.length >= 2) {
              drag = { fx: a.x, fy: a.y, tx: a.values[0], ty: a.values[1] };
              break;
            }
          }
          if (drag) break;
        }
        if (!drag) return;

        const hit = hitTrayPiece(world, drag.fx, drag.fy);
        if (!hit) return;
        const board = world.getComponent<BlockGrid>(hit.piece.boardId, 'BlockGrid');
        if (!board) return;
        if (typeof board.originX !== 'number' || typeof board.originY !== 'number' || !board.cellSize) return; // 无几何=不吸附

        const { col, row } = squarePointToCell(board.originX, board.originY, board.cellSize, drag.tx, drag.ty);
        // 写放置意图（承载在托盘块实体上·block-place 全局扫描 PlaceBlockIntent 并消费后清除）。非法落点由 block-place 拒。
        if (!world.hasComponent(hit.eid, 'PlaceBlockIntent')) {
          world.addComponent(hit.eid, { type: 'PlaceBlockIntent', slot: hit.piece.slot, col, row } as PlaceBlockIntent);
        }
      },
    },
  ],
});
