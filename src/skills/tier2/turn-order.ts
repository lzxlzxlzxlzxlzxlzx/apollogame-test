import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld, EntityId } from '@engine/core/types.js';
import { t } from '@engine/core/schema.js';
import { sortedIds } from '@engine/core/query.js';
import { resolveFlag } from '@engine/logic/index.js';
import type { Component } from '@engine/core/types.js';
import type { Signal } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  t2-turn-order —— 回合 / 座位轮转（owner 2026-09-09 令补齐·底层评审 §3.1「回合不是原子」+ §7 第一档）
//
//  掼蛋 / 日麻 / 德州 / game-g 各自手写「下一个是谁、跳过已出局、一圈结束」；game-a 记录了 t3-flow 表达不了
//  「四家轮转 + 墩圈计数 + 接风」。本能力 = 座位序（数组·可直接是 Group.members 的拷贝）+ 游标 + 三条规则，全是数据：
//    · 收到 `advanceSignal` → 游标沿 `direction` 走到下一个**未被跳过**的座位（座位实体挂 Flag{id: skipFlag, active} = 出局/跳过）
//    · 绕回起点 → round+1 并发 `roundSignal`；每次换人发 `changedSignal`（Signal.source = 新的当前座位·下游按 source 认人）
//    · 全员被跳过 → 不动（reject·不死循环）
//  信号纪律同 keybind/clickable：runsAfter event-when（它每拍开头清全场 Signal）；本系统发的 Signal 挂在 TurnOrder 实体上，
//  下一拍被 event-when 清扫——同拍消费。确定性：多个 TurnOrder 按实体 id 升序处理。
// ═══════════════════════════════════════════════════════════════

export interface TurnOrder extends Component {
  readonly type: 'TurnOrder';
  id: string;
  order: EntityId[];
  current: number; // 当前座位下标（order 内）
  round: number; // 圈数（从 1 起·绕回起点 +1）
  direction: number; // 1 顺时针 / -1 逆时针
  advanceSignal: string; // 收到此名信号 → 走一位
  changedSignal?: string; // 换人后在本实体发此信号（source = 新当前座位）
  roundSignal?: string; // 绕回起点时发
  skipFlag?: string; // 座位实体上此 id 的 Flag.active 为真 → 跳过（出局/弃权）
}

/** 当前座位实体 id（order 为空 → undefined）。 */
export function currentSeat(tn: TurnOrder): EntityId | undefined {
  return tn.order[tn.current];
}

/** 从 current 起沿 direction 找下一个未跳过的下标；全员跳过 → -1；wrapped 表示是否绕回起点。 */
export function nextIndex(tn: TurnOrder, isSkipped: (seat: EntityId) => boolean): { index: number; wrapped: boolean } {
  const n = tn.order.length;
  if (n === 0) return { index: -1, wrapped: false };
  const dir = tn.direction < 0 ? -1 : 1;
  let i = tn.current;
  let wrapped = false;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (dir > 0 ? i === 0 : i === n - 1) wrapped = true;
    if (!isSkipped(tn.order[i])) return { index: i, wrapped };
  }
  return { index: -1, wrapped: false };
}

export const turnOrderCapability = defineCapability({
  id: 't2-turn-order',
  version: '1.0.0',

  describe: {
    name: 'turn-order',
    summary: '座位轮转：收到信号走到下一个未出局座位；绕圈计数；换人/换圈发信号。',
    semantic: ['turn', 'seat', 'rotation', 'round', 'board-game'],
    whenToUse:
      '回合制/牌桌/棋类「该谁行动」：挂 TurnOrder{id, order:[座位实体…], advanceSignal:"endTurn", changedSignal:"turn", roundSignal:"newRound", skipFlag:"out"} 于桌实体；出局的座位挂 Flag{id:"out", active:true} 即被跳过。下游 event-when/effect-apply 按 Signal.source 认当前座位。方向 direction=-1 为逆时针。',
    examples: [
      'TurnOrder{ id:"table", order:["p1","p2","p3","p4"], current:0, round:1, direction:1, advanceSignal:"endTurn", changedSignal:"turn", roundSignal:"newRound", skipFlag:"out" }',
      '德州死钮：出局玩家 Flag{id:"out",active:true} → 轮转自动跳过',
    ],
  },

  components: {
    provides: {
      TurnOrder: {
        category: 'config',
        describe: '座位序 + 游标 + 圈数 + 三个信号名。current/round 为运行态（可存档）。',
        fields: {
          id: { type: 'string', describe: '桌 id（全局语义 id）' },
          order: { type: 'string[]', describe: '座位实体 id（顺序即轮转序）' },
          current: { type: 'number', describe: '当前座位下标' },
          round: { type: 'number', describe: '圈数（从 1 起）' },
          direction: { type: 'number', describe: '1 顺时针 / -1 逆时针' },
          advanceSignal: { type: 'string', describe: '收到此信号走一位' },
          changedSignal: { type: 'string', describe: '换人后发（source=新当前座位）' },
          roundSignal: { type: 'string', describe: '绕回起点时发' },
          skipFlag: { type: 'string', describe: '座位上此 Flag.active 为真 → 跳过' },
        },
        schema: t.obj({
          id: t.str(), order: t.arr(t.entity()), current: t.num(), round: t.num(), direction: t.num(),
          advanceSignal: t.str(), changedSignal: t.opt(t.str()), roundSignal: t.opt(t.str()), skipFlag: t.opt(t.str()),
        }),
      },
    },
    reads: ['TurnOrder', 'Signal', 'Flag'],
    writes: ['TurnOrder', 'Signal'],
    consumes: [],
  },

  config: {
    advanceSignal: { type: 'string', default: 'endTurn', describe: '推进信号名', question: '收到什么信号换人？', ui: { control: 'input' } },
    direction: { type: 'number', default: 1, describe: '方向', question: '顺时针(1)还是逆时针(-1)？', ui: { control: 'input' } },
  },

  systems: [
    {
      id: 'turn-order',
      reads: ['TurnOrder', 'Signal', 'Flag'],
      writes: ['TurnOrder', 'Signal'],
      consumes: [],
      runsAfter: ['event-when', 'keybind', 'clickable'],
      execute(world: IWorld) {
        const tables = sortedIds(world, 'TurnOrder');
        if (tables.length === 0) return;
        // 本拍在场的信号名集合（一次收集）。
        const names = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) names.add(s.name);
        }
        for (const tid of tables) {
          const tn = world.getComponent<TurnOrder>(tid, 'TurnOrder');
          if (!tn || !names.has(tn.advanceSignal)) continue;
          const skipped = (seat: EntityId): boolean => {
            if (!tn.skipFlag) return false;
            const f = resolveFlag({ world, self: seat }, tn.skipFlag);
            return !!f && f.active;
          };
          const { index, wrapped } = nextIndex(tn, skipped);
          if (index < 0) continue; // 全员跳过：reject·不动
          tn.current = index;
          if (wrapped) tn.round += 1;
          const seat = tn.order[index];
          if (tn.changedSignal) world.addComponent<Signal>(tid, { type: 'Signal', name: tn.changedSignal, source: seat });
          if (wrapped && tn.roundSignal && !tn.changedSignal) world.addComponent<Signal>(tid, { type: 'Signal', name: tn.roundSignal, source: seat });
          else if (wrapped && tn.roundSignal) {
            // 一实体一 Signal：换圈信号挂在 `<桌>:round` 伴生实体上，与换人信号并存。
            const rid = `${tid}:round`;
            if (!world.getAllEntities().includes(rid)) world.createEntity(rid);
            world.addComponent<Signal>(rid, { type: 'Signal', name: tn.roundSignal, source: seat });
          }
        }
      },
    },
  ],
});
