import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Draggable, InputQueue, Transform, Shape, HexBoard, HexPos, Tag, Flag, Resource, Tween, Clickable, DropZone, Signal } from '@engine/protocol/components.js';
import { hexCellToPoint, hexPointToCell } from './grid-move.js';
import { findByComponentId } from '@engine/core/query.js';
import { inCircle } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  drag-place —— 拖拽摆放（REQ-F-045；备战上场/调位/回席的输入桥，战棋/卡牌摆子通用）。
//
//  消费 InputQueue 的 drag 动作（壳层 pointerup 合成：{key:'drag', x/y:起点世界坐标,
//  values:[终点x,终点y]}，坐标已在采集期逆投影——与 pointer 同纪律，lockstep 安全）：
//    ① 命中：起点对全部 Draggable 实体做 Shape 命中（box AABB / circle；实体 id 升序首中，确定）；
//    ② 门：Draggable.onlyFlag 设了且全局 Flag 非真 → 忽略（备战期专用；读上一拍相位，人手速不可感知）；
//    ③ 落点：snap:'hex' 且终点落板内 → 吸附棋盘格，写 HexPos{q,r} + Transform=格投影（上场/调位）；
//       落板外（或无 snap）→ 写原始 Transform，并移除 HexPos（回席=离板失格）；
//    ④ 限额：从「无 HexPos」进板且 capTagMask/capResource 设了 → 数「Tag&mask 且带 HexPos」的在板
//       单位，≥cap 资源值 → 整次拒绝（场上数≤level 在执行点强制，v2 操作表原话）。
//
//  每拍至多处理一条 drag（人手速操作；同拍多条=退化输入，取 InputQueue 首条，确定）。
//  定序（输入先行纪律，同 card-pile）：本系统写 Transform 会汇入 overlap→trigger→hitbox→
//  resource-apply 结算链，而它又读 Flag/Resource（门/限额）——runsBefore 六件套删反向边，
//  读上一拍相位/限额（备战级操作，一拍不可感知）。写 HexPos 与 grid-move 互为 RMW → 同钉。
//  确定性：命中按实体 id 升序、反拾取纯算术、限额计数集合语义——全部确定。
// ═══════════════════════════════════════════════════════════════

// 落子 juice（REQ-F-057）：成功落点后倒带重放实体自带的 Tween（keep:true 的压扁回弹等）——
// 「拖放重播自带动画」的通用钩子；实体没挂 Tween 则零开销。被拒（相位门/限额/未命中）不重放。
function replayTween(world: IWorld, eid: string): void {
  const tw = world.getComponent<Tween>(eid, 'Tween');
  if (tw) { tw.elapsed = 0; tw.done = false; }
}

// 投放区命中（多区按 id 升序首中，确定）。
function hitDropZone(world: IWorld, x: number, y: number): string | null {
  const zones: string[] = [];
  for (const [zid] of world.query('DropZone')) zones.push(zid);
  zones.sort();
  for (const zid of zones) {
    const zt = world.getComponent<Transform>(zid, 'Transform');
    const zs = world.getComponent<Shape>(zid, 'Shape');
    if (!zt || !zs) continue;
    const hw = ((zs.width ?? 16) / 2) * Math.abs(zt.scaleX), hh = ((zs.height ?? 16) / 2) * Math.abs(zt.scaleY);
    if (Math.abs(x - zt.x) <= hw && Math.abs(y - zt.y) <= hh) return zid;
  }
  return null;
}

function hitDraggable(world: IWorld, x: number, y: number): string | null {
  const ids: string[] = [];
  for (const [eid] of world.query('Draggable')) ids.push(eid);
  ids.sort();
  for (const eid of ids) {
    const t = world.getComponent<Transform>(eid, 'Transform');
    const sh = world.getComponent<Shape>(eid, 'Shape');
    if (!t || !sh) continue;
    if (sh.kind === 'circle') {
      const rr = sh.radius ?? 8;
      if (inCircle(x, y, t.x, t.y, rr)) return eid;
    } else {
      const w = (sh.width ?? 16) / 2, h = (sh.height ?? 16) / 2;
      if (Math.abs(x - t.x) <= w && Math.abs(y - t.y) <= h) return eid;
    }
  }
  return null;
}

export const dragPlaceCapability = defineCapability({
  id: 't2-drag-place',
  version: '1.0.0',

  describe: {
    name: 'drag-place',
    summary: '拖拽摆放：消费壳层合成的 drag 动作，命中 Draggable 实体 → 落板内吸附六角格写 HexPos+Transform（上场/调位），落板外回席（移除 HexPos）；上板限额在执行点强制。',
    semantic: ['tier2', 'input', 'drag', 'grid'],
    whenToUse:
      '备战摆子/卡牌拖放/塔防放塔。可拖实体挂 Draggable{snap:"hex", onlyFlag:"in_prep", capTagMask, capResource} + Transform + Shape（命中体）。壳层 PointerInputSource 自动合成 drag 动作。',
    examples: [
      "摆子：席位实体 Draggable{snap:'hex', onlyFlag:'in_prep', capTagMask:ALLY位, capResource:'level'} → 拖上板吸附格、超 level 拒绝、拖下板回席",
    ],
  },

  components: {
    provides: {
      Draggable: {
        category: 'config',
        describe: '可拖实体标记+落点规则：snap 吸附棋盘、onlyFlag 相位门、capTagMask/capResource 上板限额。',
        fields: {
          snap: { type: 'string', describe: "'hex'=落点吸附 HexBoard 格（写 HexPos+投影 Transform）；缺省自由落点" },
          onlyFlag: { type: 'string', describe: '全局 Flag id：为真才可拖（如 in_prep 备战门）' },
          capTagMask: { type: 'number', describe: '上板限额计数掩码（数 Tag&mask 且带 HexPos 的在板单位）' },
          capResource: { type: 'string', describe: '上板限额资源 id（如 level）；从板外进板且已满 → 整次拒绝' },
        },
      },
      DropZone: {
        category: 'marker',
        describe: '拖放投放区（REQ-F-058 垃圾桶/出售槽）：自由落点命中本实体 Shape → 替被拖者发它自带 Clickable.action 的 Signal（source=被拖者）。',
        fields: {},
      },
    },
    reads: ['Draggable', 'InputQueue', 'Transform', 'Shape', 'HexBoard', 'HexPos', 'Tag', 'Flag', 'Resource'],
    writes: ['Transform', 'HexPos'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'drag-place',
      phase: SystemPhase.Update,
      // 输入先行（同 card-pile 纪律）：写 Transform 汇入 overlap→…→resource-apply 链、又读 Flag/Resource
      // → runsBefore 删反向边（grid-move/motion-apply 同写 Transform 的 RMW 对、flow/zone 的 Flag、
      // group-count/self-rule/resource-apply 的 Resource）。读上一拍相位/限额，备战级操作不可感知。
      // 'motion-apply'：REQ-F-050——与 grid-move 同类的 Transform RMW 对，首个两者同场的世界（game-f
      // 主角自由移动+拖拽）即成 22 系统 SCC；输入先行语义不变（先落拖拽终点、同拍再积分速度）。
      // REQ-F-058 注：投放区命中时本系统**只负责不动**（信号由下方独立 drop-zone 小系统种——它只写
      // Signal、零 Transform/Resource 牵连，可安然排在 event-when 全局清扫之后；本系统若兼职写 Signal
      // 会陷入「既要早于结算链、又要晚于 event-when」的死结，实测三角环）。
      runsBefore: ['grid-move', 'motion-apply', 'tween', 'flow', 'zone-occupancy', 'group-count', 'self-rule', 'resource-apply'],
      reads: ['Draggable', 'InputQueue', 'Transform', 'Shape', 'HexBoard', 'HexPos', 'Tag', 'Flag', 'Resource', 'Tween', 'Clickable', 'DropZone'],
      writes: ['Transform', 'HexPos', 'Tween'],
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

        const eid = hitDraggable(world, drag.fx, drag.fy);
        if (!eid) return;
        const d = world.getComponent<Draggable>(eid, 'Draggable')!;

        // 投放区命中（REQ-F-058，**先于相位门**——拖进垃圾桶任何相位可投）：本系统只负责「被拖者原地
        // 不动」，代点信号由独立 drop-zone 系统种（见下方第二系统）。
        if (hitDropZone(world, drag.tx, drag.ty)) return;

        // 相位门（读上一拍全局 Flag）。
        if (d.onlyFlag) {
          const fe = findByComponentId(world, 'Flag', 'id', d.onlyFlag);
          const f = fe ? world.getComponent<Flag>(fe, 'Flag') : undefined;
          if (!f?.active) return;
        }

        // 棋盘单例（snap 用；无板=自由落点）。
        let board: HexBoard | undefined;
        { const bid = world.singleton('HexBoard'); if (bid !== undefined) board = world.getComponent<HexBoard>(bid, 'HexBoard'); } // 黑板单例（P1b）：严格模式多份即抛·生产按创建序取首个（= 旧 for…break 语义）

        const t = world.getComponent<Transform>(eid, 'Transform');
        if (!t) return;
        const cell = d.snap === 'hex' && board ? hexPointToCell(board, drag.tx, drag.ty) : null;

        if (cell) {
          // 换位（REQ-F-058 ①）：目标格被同族占（Tag&capTagMask 的另一可拖单位）→ 两子交换：
          // 板→板=对方去我原格；席→板=对方失格回席（tray 自动落座）。净在板数不变 → 不过限额门。
          const hadPos = world.hasComponent(eid, 'HexPos');
          let occupant: string | null = null;
          if (d.capTagMask) {
            const occIds: string[] = [];
            for (const [uid] of world.query('HexPos')) {
              if (uid === eid) continue;
              const uhp = world.getComponent<HexPos>(uid, 'HexPos')!;
              const utg = world.getComponent<Tag>(uid, 'Tag');
              if (uhp.q === cell.q && uhp.r === cell.r && utg && (utg.flags & d.capTagMask) !== 0) occIds.push(uid);
            }
            occIds.sort();
            occupant = occIds[0] ?? null;
          }
          if (occupant) {
            const ot = world.getComponent<Transform>(occupant, 'Transform');
            if (hadPos) {
              const myCell = world.getComponent<HexPos>(eid, 'HexPos')!;
              const op = world.getComponent<HexPos>(occupant, 'HexPos')!;
              op.q = myCell.q; op.r = myCell.r;
              if (ot && board) { const pp = hexCellToPoint(board, op.q, op.r); ot.x = pp.x; ot.y = pp.y; }
            } else {
              world.removeComponent(occupant, 'HexPos'); // 席→板：对方回席（tray 捡座）
            }
            replayTween(world, occupant);
          }
          // 进板/调位：限额只在「从板外进板且非换位」时强制（板内调位/换位不改在板数）。
          if (!hadPos && !occupant && d.capTagMask && d.capResource) {
            const capRe = findByComponentId(world, 'Resource', 'id', d.capResource);
            const cap = capRe ? world.getComponent<Resource>(capRe, 'Resource')!.current : 0;
            let onBoard = 0;
            for (const [uid] of world.query('HexPos')) {
              const tg = world.getComponent<Tag>(uid, 'Tag');
              if (tg && (tg.flags & d.capTagMask) !== 0) onBoard++;
            }
            if (onBoard >= cap) return; // 场上已满 → 整次拒绝（牌不动）
          }
          if (hadPos) {
            const hp = world.getComponent<HexPos>(eid, 'HexPos')!;
            hp.q = cell.q; hp.r = cell.r;
          } else {
            world.addComponent(eid, { type: 'HexPos', q: cell.q, r: cell.r } as HexPos);
          }
          const p = hexCellToPoint(board!, cell.q, cell.r);
          t.x = p.x; t.y = p.y;
          replayTween(world, eid);
        } else {
          // 落板外（或无 snap/无板）：自由落点 + 离板失格（回席）。
          t.x = drag.tx; t.y = drag.ty;
          if (world.hasComponent(eid, 'HexPos')) world.removeComponent(eid, 'HexPos');
          replayTween(world, eid);
        }
      },
    },
    {
      // ── drop-zone（REQ-F-058 ②）：投放代点——drag 落点命中 DropZone → 替被拖者发它自带的
      // Clickable.action 信号（**种在区实体上**，source=被拖者：'@signal-source' 解析 source 字段，
      // 载体无所谓；种在被拖者身上会被 clickable 步①自清扫）。绕过 Clickable.onlyFlag 指针门与
      // Draggable.onlyFlag 相位门（拖进垃圾桶=明确意图，任何相位可卖=自走棋操作表）。
      // 定序：只写 Signal、不碰 Transform/Resource → 排 event-when（全局先清后标）与 card-pile
      // （读 Signal 又写 Flag/Resource，先行会与 card→event-when 合围）之后即链条死端，零环面。
      id: 'drop-zone',
      phase: SystemPhase.Update,
      runsAfter: ['event-when', 'card-pile'],
      reads: ['InputQueue', 'DropZone', 'Draggable', 'Clickable', 'Transform', 'Shape'],
      writes: ['Signal'],
      consumes: [],
      execute(world: IWorld) {
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
        const zid = hitDropZone(world, drag.tx, drag.ty);
        if (!zid) return;
        const eid = hitDraggable(world, drag.fx, drag.fy);
        if (!eid) return;
        const click = world.getComponent<Clickable>(eid, 'Clickable');
        if (click && !world.hasComponent(zid, 'Signal')) {
          world.addComponent(zid, { type: 'Signal', name: click.action, source: eid } as Signal);
        }
      },
    },
  ],
});
