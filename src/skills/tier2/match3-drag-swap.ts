import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { InputQueue, Transform, Shape, Sprite, Clickable, BoardCell, Signal } from '@engine/protocol/components.js';
import { sign } from '@engine/math/scalar.js';

// ═══════════════════════════════════════════════════════════════
//  match3-drag-swap —— 三消拖拽滑动手势输入桥（REQ-INPUT-拖拽交换；竖屏触屏主输入）。
//
//  三消传统靠「点两格」交换（clickable 命中 BoardCell → 发选中 Signal → t3-match3-board idle 选/换）；
//  移动端更顺手的是「按住一格朝邻格滑一下」。本能力把这个手势翻译成**与点选完全同形的选中信号**，
//  让 t3-match3-board 的 idle 相位**零改动**、sim 完全不知输入是点还是拖：
//
//    · 手势的第一半（选中起点格 A）由**现有 clickable 复用**完成：BoardCell 配 Clickable{action, phase:'down'}
//      （三消默认相位），指针**按下**即命中 A、发选中 Signal → idle 置 selIndex=A（与点第一格逐字节相同）。
//    · 本能力只补第二半：读壳层 pointerup 合成的 `drag` 动作（{key:'drag', x/y:起点世界坐标, values:[终点x,终点y]}），
//      按主轴方向定出邻格 B，在 B 上发一条与「点 B」逐字节相同的选中 Signal → idle 判相邻 → 交换（转 swapped）。
//
//  「起点选中靠按下、邻格选中靠本能力」两拍天然落在 down / up 两个真实指针事件上——**无需任何跨拍暂存组件**
//  （不进 sim/hash：世界状态轨迹与"点两格"逐字节一致），是纯粹的输入→信号单拍映射。
//
//  阈值与主轴（图纸）：沿邻格方向位移 ≥ 0.4 格间距（DRAG_SWAP_THRESHOLD_CELLS）才算交换；不足=不发 B、
//  A 仍选中（= 视为点选）。斜向（|dx| 与 |dy| 都有）取**主轴**（较大分量的轴），只朝该轴的邻格换。
//  格间距由 A 与被选邻格中心的实测间距给出（不假设格尺寸/世界 Y 朝向），越界方向无邻格=不换。
//
//  确定性：命中/邻格选取全走整数与坐标差比较（无 sqrt）、并列取实体 id 升序、无时间/随机依赖 → lockstep/录放安全。
//  与 clickable/drag-place 同族（消费壳层输入→产引擎已有信号/意图，纯输入桥）；只是产出=三消选中 Signal。
// ═══════════════════════════════════════════════════════════════

// 交换阈值（图纸「0.4 格」）：沿主轴方向的拖拽位移 ≥ 本比例 × 邻格中心间距 → 判定为交换手势；否则视为点选。
export const DRAG_SWAP_THRESHOLD_CELLS = 0.4;

// 邻格候选：相对起点格 A 中心的偏移（ox,oy）+ 实体 id。纯几何，供纯函数选取（可单测）。
export interface NeighborCandidate {
  eid: string;
  ox: number;
  oy: number;
}

// 纯函数（导出供单测）：给定拖拽位移 (dx,dy) 与 A 的邻格候选，取「主轴方向上、过阈值的紧邻格」。
//  · 主轴：|dx| ≥ |dy| → 横轴，否则纵轴（并列取横轴，确定）。
//  · 沿主轴符号方向选紧邻格：候选须在该方向（sign 匹配）且「更贴主轴」（主轴分量 > 副轴分量，排除斜格），取间距最小者（id 升序并列）。
//  · 阈值：主轴位移 ≥ thresholdFrac × 该邻格中心间距。不足 / 无邻格 → 返回 null（= 点选，不交换）。
export function pickSwapTarget(dx: number, dy: number, candidates: readonly NeighborCandidate[], thresholdFrac: number): { eid: string; span: number } | null {
  if (dx === 0 && dy === 0) return null;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const dir = horizontal ? sign(dx) : sign(dy);

  let best: NeighborCandidate | null = null;
  let bestSpan = Infinity;
  for (const c of candidates) {
    let span: number;
    if (horizontal) {
      if (sign(c.ox) !== dir) continue; // 不在拖拽横向那侧
      if (Math.abs(c.oy) >= Math.abs(c.ox)) continue; // 偏纵向=非同行邻格（排除斜格）
      span = Math.abs(c.ox);
    } else {
      if (sign(c.oy) !== dir) continue;
      if (Math.abs(c.ox) >= Math.abs(c.oy)) continue;
      span = Math.abs(c.oy);
    }
    if (span < bestSpan || (span === bestSpan && (best === null || c.eid < best.eid))) {
      best = c;
      bestSpan = span;
    }
  }
  if (!best) return null;

  const along = horizontal ? Math.abs(dx) : Math.abs(dy);
  if (along < thresholdFrac * bestSpan) return null; // 未过 0.4 格阈值 → 视为点选
  return { eid: best.eid, span: bestSpan };
}

// AABB 半宽/半高（含缩放）——与 clickable 同款，保证拖拽起点命中的 A 与「点该点」命中的格一致。
function halfExtents(t: Transform, s: Shape): { hw: number; hh: number } {
  let hw = 0;
  let hh = 0;
  if (s.kind === 'box') {
    hw = (s.width ?? 0) / 2;
    hh = (s.height ?? 0) / 2;
  } else if (s.kind === 'circle') {
    hw = s.radius ?? 0;
    hh = hw;
  } else if (s.kind === 'polygon' && s.vertices) {
    for (let i = 0; i + 1 < s.vertices.length; i += 2) {
      hw = Math.max(hw, Math.abs(s.vertices[i]));
      hh = Math.max(hh, Math.abs(s.vertices[i + 1]));
    }
  }
  return { hw: hw * Math.abs(t.scaleX), hh: hh * Math.abs(t.scaleY) };
}

// 命中起点格：对全部 BoardCell（带 Transform+Shape）做 AABB，取最上层（Sprite.zOrder 最大·并列取 id 最小）——
// 与 clickable 命中同纪律，保证「拖拽起手命中的 A」= 若在此点按下 clickable 会选中的同一格。
function hitBoardCell(world: IWorld, x: number, y: number): string | null {
  let best: string | null = null;
  let bestZ = -Infinity;
  const ids: string[] = [];
  for (const [eid] of world.query('BoardCell', 'Transform', 'Shape')) ids.push(eid);
  ids.sort(); // 升序 → 同 zOrder 并列时先遇到（最小 id）胜出
  for (const eid of ids) {
    const t = world.getComponent<Transform>(eid, 'Transform')!;
    const s = world.getComponent<Shape>(eid, 'Shape')!;
    const { hw, hh } = halfExtents(t, s);
    if (Math.abs(x - t.x) <= hw && Math.abs(y - t.y) <= hh) {
      const z = world.getComponent<Sprite>(eid, 'Sprite')?.zOrder ?? 0;
      if (z > bestZ) {
        best = eid;
        bestZ = z;
      }
    }
  }
  return best;
}

export const match3DragSwapCapability = defineCapability({
  id: 't2-match3-drag-swap',
  version: '1.0.0',

  describe: {
    name: 'match3-drag-swap',
    summary:
      '三消拖拽滑动手势输入桥：读壳层合成的 drag 动作，起点格 A（由 clickable 的按下选中）→ 主轴方向邻格 B → 在 B 上发与「点 B」逐字节同形的选中 Signal，驱动 t3-match3-board idle 交换。未过 0.4 格阈值=视为点选。idle 相位零改动·sim 不知输入形态。',
    semantic: ['tier2', 'input', 'drag', 'grid', 'match3'],
    whenToUse:
      '给三消棋盘加「按住一格朝邻格滑动=交换」的移动端主手势。BoardCell 需配 Clickable{action:selectAction, phase:"down"}（三消默认相位·按下即选中起点格）+ Transform + Shape（命中体）；壳层 PointerInputSource 自动把超阈拖拽合成 drag 动作。本能力只补邻格选中，交换判定/回退全在 t3-match3-board。',
    examples: [
      '材料三消：BoardCell{...}+Clickable{action:"cell",phase:"down"}；按 (col,row) 格向右滑过 0.4 格 → 在右邻格发 Signal"cell" → idle 判相邻 → 交换',
      '斜向滑（右下、右分量更大）→ 取横轴主轴 → 与右邻格交换；未过阈值 → 不发邻格信号，起点格仍选中（点选）',
    ],
  },

  components: {
    // 不产出新组件：只消费壳层 drag 动作（InputQueue）+ 产出既有选中 Signal（与 clickable 逐字节同形）。
    provides: {},
    reads: ['InputQueue', 'BoardCell', 'Transform', 'Shape', 'Sprite', 'Clickable'],
    writes: ['Signal'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'match3-drag-swap',
      phase: SystemPhase.Update,
      // 排在 clickable 之后：clickable 每拍先清 Clickable 实体上的旧 Signal 再按命中重标；本能力在其后补发
      // 邻格 Signal，才不会被 clickable 的清扫误删。写 Signal → t3-match3-board.match-resolve 读 Signal（自动边）
      // → 本能力先于相位机、同拍被 idle 消费（与 clickable→idle 同链，逐字节等价点选）。
      runsAfter: ['clickable'],
      reads: ['InputQueue', 'BoardCell', 'Transform', 'Shape', 'Sprite', 'Clickable'],
      writes: ['Signal'],
      consumes: [],
      execute(world: IWorld) {
        // 取本拍首条 drag（每拍至多一条·同 drag-place/grid-drag-square 纪律）。
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

        // 起点格 A（与 clickable 命中同纪律）。
        const aEid = hitBoardCell(world, drag.fx, drag.fy);
        if (!aEid) return;
        const at = world.getComponent<Transform>(aEid, 'Transform')!;
        const aCell = world.getComponent<BoardCell>(aEid, 'BoardCell')!;

        // 同盘邻格候选（相对 A 中心的偏移）。
        const cands: NeighborCandidate[] = [];
        for (const [eid] of world.query('BoardCell', 'Transform')) {
          if (eid === aEid) continue;
          const bc = world.getComponent<BoardCell>(eid, 'BoardCell')!;
          if (bc.boardId !== aCell.boardId) continue;
          const t = world.getComponent<Transform>(eid, 'Transform')!;
          cands.push({ eid, ox: t.x - at.x, oy: t.y - at.y });
        }

        const target = pickSwapTarget(drag.tx - drag.fx, drag.ty - drag.fy, cands, DRAG_SWAP_THRESHOLD_CELLS);
        if (!target) return; // 未过阈值 / 越界无邻格 → 视为点选（A 已由按下选中，此处不动）

        // 在邻格 B 上发选中 Signal——与 clickable 命中 B 逐字节同形（name=该格 Clickable.action, source=B）。
        const bClick = world.getComponent<Clickable>(target.eid, 'Clickable');
        if (!bClick) return; // 邻格不可点（点它也不会产信号）→ 不换
        if (!world.hasComponent(target.eid, 'Signal')) {
          world.addComponent(target.eid, { type: 'Signal', name: bClick.action, source: target.eid } as Signal);
        }
      },
    },
  ],
});
