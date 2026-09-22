import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { HexBoard, HexPos, GridMover, Relation, Transform, Status } from '@engine/protocol/components.js';
import { hexNextStep, hexCellKey, hexDistance, type Hex } from './hex.js';
import { len } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  grid-move —— 六边形网格逐格移动（REQ-024；金铲铲/TFT 式自动战斗移动）。
//
//  读自身 Relation(kind:'target')(aggro 写的索敌目标) → 取目标 HexPos → 用 hex A*(hex.ts) 求**下一格**
//  (避开被占格、到目标相邻格停) → 每 GridMover.period 个 tick 走一格 → 写自身 HexPos + 投影 Transform。
//  取代 steering 在网格场景：aggro 仍写目标，grid-move 替算"下一格"(steering 是贪婪直线、绕不开占格)。
//
//  占位(一格一单位)：blocked = 全场其它 HexPos 单位所在格(target 格自然在内→A* 不踏、停相邻)。
//  确定性：A* 纯整数确定(见 hex.ts)；占位集与遍历序无关；HexPos 整数进 hash；Transform 由 HexPos 经
//  精确二进制分数(1/2,3/4)投影(不碰 sqrt/超越函数)→ 跨端无漂移、lockstep 安全。
//  节奏：每 period tick 才走一格(整数计数)，免每拍瞬移。
//  CC 定身(REQ-F-030)：GridMover.haltStatusMask 命中自身 Status → 不走且时钟暂停(同 Steering 语义)。
// ═══════════════════════════════════════════════════════════════

const TARGET = 'target';

// HexPos → Transform 像素(flat-ish hex；1/2、3/4 为精确二进制分数，跨端一致)。
// 两种布局都用**真投影** x=q·ts+r·ts/2（六边形晶格的忠实嵌入，视觉相邻=逻辑相邻）；'odd-r' 的
// "规整矩形"观感来自棋盘形状（每行 q 范围平移），不靠改投影（REQ-F-037，外审 Q5；旧 'offset' 已删）。
export function hexCellToPoint(board: Pick<HexBoard, 'tileSize' | 'originX' | 'originY'>, q: number, r: number): { x: number; y: number } {
  return {
    x: board.originX + q * board.tileSize + r * (board.tileSize / 2),
    y: board.originY + r * (board.tileSize * 0.75),
  };
}
const project = hexCellToPoint;

// 世界点 → 棋盘格（REQ-F-045 拖拽反拾取；矩形近似——TFT 级大格容差足够，cube-round 待真需要再上）。
// 板外/越界 → null。odd-r：先按视觉列反推 col，再换 axial q=col-(r>>1)；axial 板：col 即 q。
export function hexPointToCell(
  board: Pick<HexBoard, 'cols' | 'rows' | 'tileSize' | 'originX' | 'originY' | 'layout'>,
  x: number, y: number,
): { q: number; r: number } | null {
  const r = Math.round((y - board.originY) / (board.tileSize * 0.75));
  if (r < 0 || r >= board.rows) return null;
  const colF = (x - board.originX) / board.tileSize - (board.layout === 'odd-r' ? (r & 1) * 0.5 : 0);
  const col = Math.round(board.layout === 'odd-r' ? colF : colF - r * 0.5);
  if (col < 0 || col >= board.cols) return null;
  const q = board.layout === 'odd-r' ? col - (r >> 1) : col;
  return { q, r };
}
// Transform 同步（REQ-F-034 平滑滑行）：HexPos 永远是 SIM 真相（占位/寻路/hash），Transform 是它的
// 视觉投影。glideSpeed 未设 → 硬钉到格点（缺省=原行为，零迁移）；设了 → 以恒速 px/tick 逼近格点，
// 距离≤步长即精确贴齐（无 epsilon 渐近）。sqrt 为 IEEE-754 正确舍入（项目先例：6b9164a 弃 hypot 改
// sqrt；与 steering 同确定性类），Transform 不被 Condition 读。逻辑格与视觉位置分离=战棋标配语义。
function syncTransform(world: IWorld, eid: string, board: HexBoard, hp: HexPos, glideSpeed?: number): void {
  const t = world.getComponent<Transform>(eid, 'Transform');
  if (!t) return;
  const p = project(board, hp.q, hp.r);
  if (!glideSpeed || glideSpeed <= 0) { t.x = p.x; t.y = p.y; return; } // 缺省：瞬移（保全部既有回归）
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const d = len(dx, dy);
  if (d <= glideSpeed) { t.x = p.x; t.y = p.y; return; } // 到点贴齐（精确，不渐近）
  t.x += (dx / d) * glideSpeed;
  t.y += (dy / d) * glideSpeed;
}

export const gridMoveCapability = defineCapability({
  id: 't2-grid-move',
  version: '1.0.0',

  describe: {
    name: 'grid-move',
    summary: '六边形网格逐格移动：读 Relation(target)→hex A* 求下一格(避占格、到相邻停)→每 period tick 走一格→写 HexPos+投影 Transform。网格场景替代 steering 贪婪直线。',
    semantic: ['tier2', 'movement', 'grid', 'pathfind'],
    whenToUse:
      '六边形棋盘自动战斗(自走棋/战棋/塔防)：单位沿格寻路走向目标。挂 HexPos{q,r}+GridMover{period}+Relation(target,由 aggro 写)；世界放一个 HexBoard{cols,rows,tileSize,origin}。aggro 索敌、grid-move 走位、hitbox/mortal 结算。',
    examples: [
      '棋子追击：HexPos{q,r} + GridMover{period:8} + Relation{kind:"target",targetId:敌} → 每 8 tick 沿 A* 走一格、到相邻停（攻击距离）',
    ],
  },

  components: {
    provides: {
      HexBoard: {
        category: 'config',
        describe: '六边形棋盘(矩形区域 0≤q<cols,0≤r<rows) + 像素投影参数。单例。',
        fields: {
          cols: { type: 'number', describe: '列数' }, rows: { type: 'number', describe: '行数' },
          tileSize: { type: 'number', describe: '每格像素' },
          originX: { type: 'number', describe: '格(0,0)世界 x' }, originY: { type: 'number', describe: '格(0,0)世界 y' },
          layout: { type: 'string', describe: "棋盘布局：'axial'(缺省,平行四边形) | 'odd-r'(推荐,错位矩形,几何≡拓扑,REQ-F-037；摆子用 offsetToAxial 换算)" },
        },
      },
      HexPos: {
        category: 'config',
        describe: '单位当前所在格(axial q,r)。网格移动 SIM 真相(进 hash)；Transform 由它投影。',
        fields: { q: { type: 'number', describe: 'axial q' }, r: { type: 'number', describe: 'axial r' } },
      },
      GridMover: {
        category: 'config',
        describe: '网格移动器：每 period tick 沿 A* 走一格；haltStatusMask 被 CC 时定身。',
        fields: {
          period: { type: 'number', describe: '每多少 tick 走一格(>=1)' },
          range: { type: 'number', describe: '射程驻足(REQ-F-060)：与目标 hex 距离≤此值即停走；缺省 1=走到贴脸' },
          elapsed: { type: 'number', describe: '内部计时' },
          haltStatusMask: { type: 'number', describe: '自身 Status 含这些位时定身不走、节奏时钟暂停（冻结/眩晕 CC；同 Steering.haltStatusMask）' },
          glideSpeed: { type: 'number', describe: '视觉滑行速度 px/tick(REQ-F-034)：Transform 恒速逼近格点投影、到点贴齐；缺省不设=逐格瞬移。建议 ≥ 格距/period 免视觉掉队' },
        },
      },
    },
    reads: ['HexBoard', 'HexPos', 'GridMover', 'Relation', 'Status'],
    writes: ['HexPos', 'GridMover', 'Transform'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'grid-move',
      phase: SystemPhase.Update,
      // REQ-025：与 aggro 互为前驱成环（aggro 读 Transform/写 Relation；grid-move 读 Relation/写 Transform）。
      // 显式 runsAfter 覆盖反向的组件推断边（Transform 生产→消费）→ 破环。语义：aggro 本拍选目标→grid-move 据此走；
      // grid-move 写的 Transform 由 aggro 下一拍读（一拍反馈，确定性不变）。同 poker-eval/dialogue 显式定序先例。
      runsAfter: ['aggro'],
      // REQ-F-030：grid-move 读 Status 做 CC 定身，而 Status 由 hitbox/over-time 在
      // grid-move 写 Transform→overlap→trigger→hitbox 链末尾写 → 否则经第三方成环。
      // 与 steering 同款破法：声明跑在状态施加者之前 = 读"上一拍"的 Status（CC 延迟一帧生效，
      // 与 Condition→Effect 同纪律）。无 hitbox/over-time 的世界里这两个 id 被忽略。
      runsBefore: ['hitbox', 'over-time'],
      reads: ['HexBoard', 'HexPos', 'GridMover', 'Relation', 'Status'],
      writes: ['HexPos', 'GridMover', 'Transform'],
      consumes: [],
      execute(world: IWorld) {
        // 棋盘单例。
        let board: HexBoard | undefined;
        { const bid = world.singleton('HexBoard'); if (bid !== undefined) board = world.getComponent<HexBoard>(bid, 'HexBoard'); } // 黑板单例（P1b）：严格模式多份即抛·生产按创建序取首个（= 旧 for…break 语义）
        if (!board) return;

        // 占位集 vs 位置表（REQ-F-051 收窄，评审修正版）：两种用途分开——
        // · occupied（阻挡）：只数**单位**（HexPos∧GridMover）。带 HexPos 不带 GridMover 的「placement
        //   数据实体」（备战席位 marker 等部署源）不挡路：其格上真正阻挡的是它展开的棋子本身。
        //   未来真要静止可占位单位（炮塔类）：挂 GridMover{period 大/haltStatusMask 恒置} 即归队。
        // · posOf（位置查找，含寻路目标）：仍收**全量** HexPos——静止目标（无 GridMover）是既有受测契约；
        //   「到目标相邻停」由下方逐 mover 把目标格显式加进 blocked 保证（与目标是否为单位无关）。
        const occupied = new Set<number>();
        const posOf = new Map<string, HexPos>();
        for (const [eid] of world.query('HexPos')) {
          const hp = world.getComponent<HexPos>(eid, 'HexPos');
          if (!hp) continue;
          posOf.set(eid, hp);
          if (world.hasComponent(eid, 'GridMover')) occupied.add(hexCellKey(hp.q, hp.r, board.cols, board.layout));
        }

        for (const [eid] of world.query('HexPos', 'GridMover')) {
          const hp = posOf.get(eid)!;
          const mover = world.getComponent<GridMover>(eid, 'GridMover')!;

          // CC 定身（REQ-F-030，对齐 Steering.haltStatusMask）：被控 → 本 tick 不走且时钟暂停
          // （elapsed 不累计 → 解控后按剩余节奏恢复，无"积攒补步"突进）。检查在滑行同步**之前**：
          // 冻结=时间静止，视觉滑行一并停（REQ-F-034），解控后从原地继续滑。
          if (mover.haltStatusMask) {
            const st = world.getComponent<Status>(eid, 'Status');
            if (st && (st.flags & mover.haltStatusMask) !== 0) continue;
          }

          syncTransform(world, eid, board, hp, mover.glideSpeed); // 每拍同步：硬钉或恒速滑行（F-034）

          const rel = world.getComponent<Relation>(eid, 'Relation');
          if (!rel || rel.kind !== TARGET) continue;
          const tHp = posOf.get(rel.targetId);
          if (!tHp) continue;

          // 射程驻足（REQ-F-060）：与目标距离 ≤ range 即停走（节奏时钟暂停，同 CC 语义——目标走远按剩余
          // 节奏恢复追击）。缺省 1=贴脸原行为零迁移；远程/法师 3~4 站射程外输出（金铲铲站位）。
          if (hexDistance(hp, tHp) <= (mover.range ?? 1)) continue;

          // 节奏：未到 period 不移动（但 elapsed 累计）。
          mover.elapsed = (mover.elapsed ?? 0) + 1;
          if (mover.elapsed < mover.period) continue;

          // 占位集排除自身格（自身不挡自己）；目标格显式补进（「不踏上目标、停相邻」对静止目标同样成立——
          // 旧实现靠目标在全量占位集里自然在内，F-051 占位收窄后改为显式语义）。
          const blocked = new Set(occupied);
          blocked.delete(hexCellKey(hp.q, hp.r, board.cols, board.layout));
          blocked.add(hexCellKey(tHp.q, tHp.r, board.cols, board.layout));
          const next: Hex | null = hexNextStep(board.cols, board.rows, hp, tHp, blocked, board.layout);
          if (next) {
            // 移动：更新占位(腾出旧格、占新格) + HexPos。瞬移模式当拍贴新格（原行为）；
            // 滑行模式不在步后再滑——次拍循环顶统一滑，保证**每拍恒一次** glideSpeed（速度均匀）。
            occupied.delete(hexCellKey(hp.q, hp.r, board.cols, board.layout));
            hp.q = next.q; hp.r = next.r;
            occupied.add(hexCellKey(hp.q, hp.r, board.cols, board.layout));
            if (!mover.glideSpeed || mover.glideSpeed <= 0) syncTransform(world, eid, board, hp);
            mover.elapsed = 0;
          }
        }
      },
    },
  ],
});
