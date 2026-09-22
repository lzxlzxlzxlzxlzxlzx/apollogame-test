import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Tray, TraySeat, Tag, Transform, HexPos } from '@engine/protocol/components.js';
import { inCircle } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  tray —— 托盘落座（REQ-F-055；自走棋备战席/手牌排/背包栏通用原语）。
//
//  成员判据：Tag 含齐 Tray.requiredTag 且 **无 HexPos**（在板上=不归托盘管）。每拍：
//    ① 离座：带 TraySeat 却有了 HexPos（被拖上板）→ 摘 TraySeat（让座）。
//    ② 落座：成员无 TraySeat（新买入/从板上拖回/合成产物）→ 落最小空槽，写 Transform=槽位。
//    ③ 挪座：成员 Transform 偏离own槽超半距（drag-place 先行写过落点）→
//       最近槽被占=两席互换（TFT 换位），空=挪过去，落点不在托盘带上=弹回原槽（地上不留单位）。
//    ④ 钉座：所有在座成员 Transform 钉回槽位（锁排版，防漂移）。
//
//  定序：runsAfter drag-place（拖拽落点先写，本拍即收口=互换/弹回零延迟可感）；
//  写 Transform 与 grid-move/motion-apply 互为 RMW → runsBefore 删反向边（同 drag-place 纪律，
//  托盘成员无 HexPos/Velocity，实际操作集不相交）。确定性：成员按实体 id 升序、空槽取最小下标、
//  几何为精确算术；TraySeat 是 POD 进 snapshot。
//  豁口（注记）：容量满后新成员顺延排出托盘右侧（index≥capacity 照常摆）——入口应由容量资源把门
//  （如 bench_space playCosts），托盘只管摆，不当裁判。
// ═══════════════════════════════════════════════════════════════

const slotPos = (t: Tray, index: number): { x: number; y: number } => ({ x: t.originX + index * t.gap, y: t.originY });

export const trayCapability = defineCapability({
  id: 't2-tray',
  version: '1.0.0',

  describe: {
    name: 'tray',
    summary: '一排槽位的自动落座/拖拽互换/离座：成员（Tag 含齐且无 HexPos）落最小空槽；拖到他槽=互换或挪动；拖上板=让座；无效落点=弹回。备战席/手牌排/背包栏通用。',
    semantic: ['tier2', 'layout', 'slots', 'drag'],
    whenToUse:
      '需要「一排可拖拽整理的格位」时：自走棋备战席（买入自动入席、席内换位、上板让座）、手牌排、装备栏。放一个 Tray{originX,originY,gap,capacity,requiredTag}，成员实体带对应 Tag；与 drag-place 配合（先拖后座）。',
    examples: [
      "备战席：Tray{originX:-176, originY:115, gap:44, capacity:9, requiredTag:BENCH_OCC}——买入 marker 自动落座、拖拽互换、上板让座",
    ],
  },

  components: {
    provides: {
      Tray: {
        category: 'config',
        describe: '托盘声明：槽排几何（originX/originY/gap/capacity）+ 成员掩码 requiredTag（含齐；成员=带掩码且无 HexPos）。',
        fields: {
          originX: { type: 'number', describe: '0 号槽世界 x' },
          originY: { type: 'number', describe: '槽排世界 y' },
          gap: { type: 'number', describe: '槽距 px' },
          capacity: { type: 'number', describe: '槽数（满则顺延排出；入口由容量资源把门）' },
          requiredTag: { type: 'number', describe: '成员 Tag 掩码（含齐语义）' },
        },
      },
      TraySeat: {
        category: 'marker',
        describe: '运行时落座状态（系统维护，POD 进 snapshot）。',
        fields: { index: { type: 'number', describe: '槽下标（0 起）' } },
      },
    },
    reads: ['Tray', 'TraySeat', 'Tag', 'Transform', 'HexPos'],
    writes: ['TraySeat', 'Transform'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'tray',
      phase: SystemPhase.Update,
      // 拖拽先行、托盘收口：drag-place 写完落点本拍立即落座/互换/弹回（runsAfter）。
      // 写 Transform 与 grid-move/motion-apply 互 RMW → runsBefore 删反向边（成员无 HexPos/Velocity，
      // 实际不相交；同 drag-place/REQ-F-050 纪律）。
      runsAfter: ['drag-place'],
      runsBefore: ['grid-move', 'motion-apply', 'tween'],
      reads: ['Tray', 'TraySeat', 'Tag', 'Transform', 'HexPos'],
      writes: ['TraySeat', 'Transform'],
      consumes: [],
      execute(world: IWorld) {
        const trays: Tray[] = [];
        for (const [tid] of world.query('Tray')) {
          const t = world.getComponent<Tray>(tid, 'Tray');
          if (t && t.gap > 0 && t.capacity > 0) trays.push(t);
        }
        if (trays.length === 0) return;

        // ① 离座：上板者（有 HexPos）摘座。
        for (const [eid] of world.query('TraySeat')) {
          if (world.hasComponent(eid, 'HexPos')) world.removeComponent(eid, 'TraySeat');
        }

        for (const t of trays) {
          // 成员（id 升序，确定）：Tag 含齐 ∧ 无 HexPos。
          const members: string[] = [];
          for (const [eid] of world.query('Tag')) {
            const tg = world.getComponent<Tag>(eid, 'Tag')!;
            if ((tg.flags & t.requiredTag) !== t.requiredTag) continue;
            if (world.hasComponent(eid, 'HexPos')) continue;
            if (!world.getComponent<Transform>(eid, 'Transform')) continue;
            members.push(eid);
          }
          members.sort();

          // 占座表（本托盘范围内）。
          const seatOf = new Map<string, number>();
          const byIndex = new Map<number, string>();
          for (const eid of members) {
            const s = world.getComponent<TraySeat>(eid, 'TraySeat');
            if (s) { seatOf.set(eid, s.index); byIndex.set(s.index, eid); }
          }
          const lowestFree = (): number => {
            for (let i = 0; ; i++) if (!byIndex.has(i)) return i; // 满则顺延（豁口注记见头注）
          };

          // ③ 挪座/互换/弹回：先按**本拍初始位置**快照「谁真偏离了own槽」（互换会同拍改对方席位，
          // 不快照会把被换方误判成又被拖了一次=换回原样），再统一执行。
          const deviated: { eid: string; k: number }[] = [];
          for (const eid of members) {
            const idx = seatOf.get(eid);
            if (idx === undefined) continue;
            const tr = world.getComponent<Transform>(eid, 'Transform')!;
            const own = slotPos(t, idx);
            if (inCircle(tr.x, tr.y, own.x, own.y, t.gap / 2)) continue; // 没动（或微动）
            // 落点是否在托盘带上：y 半距内 且 x 在槽排范围。
            const k = Math.round((tr.x - t.originX) / t.gap);
            const onBand = Math.abs(tr.y - t.originY) <= t.gap * 0.75 && k >= 0 && k < t.capacity;
            if (!onBand) continue; // 落点无效 → ④ 钉座弹回原槽（地上不留单位）
            deviated.push({ eid, k });
          }
          for (const { eid, k } of deviated) {
            const idx = seatOf.get(eid)!;
            if (k === idx) continue;
            const occupant = byIndex.get(k);
            if (occupant === undefined) {
              byIndex.delete(idx); byIndex.set(k, eid); seatOf.set(eid, k);
              world.getComponent<TraySeat>(eid, 'TraySeat')!.index = k;
            } else if (occupant !== eid) {
              // 互换（TFT 换位）：对方去本席。
              byIndex.set(k, eid); byIndex.set(idx, occupant);
              seatOf.set(eid, k); seatOf.set(occupant, idx);
              world.getComponent<TraySeat>(eid, 'TraySeat')!.index = k;
              world.getComponent<TraySeat>(occupant, 'TraySeat')!.index = idx;
            }
          }

          // ② 落座：无座成员（新买/回席/合成产物）落最小空槽。
          for (const eid of members) {
            if (seatOf.has(eid)) continue;
            const k = lowestFree();
            byIndex.set(k, eid); seatOf.set(eid, k);
            world.addComponent(eid, { type: 'TraySeat', index: k } as TraySeat);
          }

          // ④ 钉座：在座成员 Transform 钉回槽位（锁排版/弹回无效落点）。
          for (const [eid, idx] of seatOf) {
            const p = slotPos(t, idx);
            const tr = world.getComponent<Transform>(eid, 'Transform')!;
            tr.x = p.x; tr.y = p.y;
          }
        }
      },
    },
  ],
});
