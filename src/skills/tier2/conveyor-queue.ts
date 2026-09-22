import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld, EntityId, Component } from '@engine/core/types.js';
import { t } from '@engine/core/schema.js';
import { sortedIds } from '@engine/core/query.js';
import { resolveFlag, ctxOf } from '@engine/logic/index.js';
import type { Signal, Transform, SpawnRequest, Timer, DestroyRequest, PrefabOrigin } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  t2-conveyor-queue —— 传送带队列（REQ-G102-BURST 候选下沉·owner 2026-09-09 令补齐）
//
//  game102 撞墙实证：同一拍 6× `tapSupply` 期望 6 门炮上带，但 Caster / effect-apply spawn / SelfRule 全是「每拍最多一发」。
//  本能力 = 「按信号**出现次数**分发生成」+ 「容量（含突破态切换）」+ 「成员按带上顺序排位」三件收成一个组件：
//    · 本拍在场的 `enqueueSignal` 每一份 → 一个 SpawnRequest（各挂在一次性载体实体 `<带>:req:<seq>` 上，载体挂 Timer{life}
//      交 t1-lifetime 回收·真实例化交 prefab-spawn，next tick 展开）；超容量的份 → rejected+1 并发 `fullSignal`
//    · 成员 = 世界里 PrefabOrigin.source === 本带 的实体（创建序 = 队列序）；每拍写回 `members` 并把 Transform 排到
//      origin + i·step（带上空位自动前移）
//    · 容量 = burstFlag（全局 Flag id）为真时用 burstCapacity，否则 capacity；inFlight（已发未落地）计入占用
//    · `popSignal`：本拍在场 → 队首成员发 DestroyRequest（出带）
//  相位 PostResolve（读本拍 Update 的 Signal·写的 Signal 供本拍 Commit 的 effect-apply/cooldown 读·写的 SpawnRequest
//  下拍 Update 展开）。**不读 Transform 只写**（排位无条件赋值）——否则与同相位 hierarchy-resolve/orbit-motion 结成
//  Transform 软环；放 Commit 则经 Flag→本系统→Signal→effect-apply 闭环（SCC 棘轮实证 2026-09-09）。世界需装 k1-spawn 消费链
//  （t3-prefab）+ e1-timer + t1-lifetime + k2-destroy。确定性：多带按 id 升序；成员按创建序；零随机。
// ═══════════════════════════════════════════════════════════════

export interface ConveyorQueue extends Component {
  readonly type: 'ConveyorQueue';
  id: string;
  template: string; // 上带实体模板（PrefabLibrary 内）
  enqueueSignal: string; // 每份出现 → 上带一个
  capacity: number; // 常态容量
  burstCapacity?: number; // 突破态容量
  burstFlag?: string; // 全局 Flag id：为真时用 burstCapacity
  popSignal?: string; // 出带：队首成员 DestroyRequest
  fullSignal?: string; // 满时被拒 → 发（挂本实体·arg = 被拒份数）
  originX: number; // 队首位置
  originY: number;
  stepX: number; // 相邻位间距
  stepY: number;
  carrierLife?: number; // 载体寿命（拍·缺省 3·须 ≥2 让 prefab-spawn 先消费）
  members: EntityId[]; // 运行态：带上成员（创建序）
  inFlight: number; // 运行态：已发 SpawnRequest 未落地
  rejected: number; // 运行态：累计被拒份数
  seq: number; // 运行态：载体序号
}

/** 当前生效容量。 */
export function effectiveCapacity(cq: ConveyorQueue, burstOn: boolean): number {
  return burstOn && cq.burstCapacity !== undefined ? cq.burstCapacity : cq.capacity;
}

export const conveyorQueueCapability = defineCapability({
  id: 't2-conveyor-queue',
  version: '1.0.0',

  describe: {
    name: 'conveyor-queue',
    summary: '按信号出现次数逐份上带（同拍 N 份 → N 个 SpawnRequest）、容量与突破态、成员排位、队首出带。',
    semantic: ['queue', 'conveyor', 'spawn', 'capacity', 'burst'],
    whenToUse:
      '「排队→到位触发」玩法（补给带/生产线/召唤队列）：挂 ConveyorQueue{id, template:"cannon", enqueueSignal:"tapSupply", capacity:5, burstCapacity:10, burstFlag:"burst", originX, originY, stepX:40, stepY:0, popSignal:"fire"}。世界装 t3-prefab + e1-timer + t1-lifetime + k2-destroy。快连 N 下同拍上 N 个（Caster/effect-apply 每拍只发一次的限制不再存在）。',
    examples: [
      'ConveyorQueue{ id:"belt", template:"cannon_blue", enqueueSignal:"tapSupply:blue", capacity:5, burstCapacity:10, burstFlag:"burst", originX:100, originY:300, stepX:48, stepY:0, members:[], inFlight:0, rejected:0, seq:0 }',
    ],
  },

  components: {
    provides: {
      ConveyorQueue: {
        category: 'config',
        describe: '传送带队列配置 + 运行态（members/inFlight/rejected/seq 可存档）。',
        fields: {
          id: { type: 'string', describe: '带 id' },
          template: { type: 'string', describe: '上带实体模板 id' },
          enqueueSignal: { type: 'string', describe: '每份出现上带一个' },
          capacity: { type: 'number', describe: '常态容量' },
          burstCapacity: { type: 'number', describe: '突破态容量' },
          burstFlag: { type: 'string', describe: '全局 Flag id：为真时用突破态容量' },
          popSignal: { type: 'string', describe: '队首出带信号' },
          fullSignal: { type: 'string', describe: '满时被拒发此信号（arg=被拒份数）' },
          originX: { type: 'number', describe: '队首 x' },
          originY: { type: 'number', describe: '队首 y' },
          stepX: { type: 'number', describe: '相邻位 x 间距' },
          stepY: { type: 'number', describe: '相邻位 y 间距' },
          carrierLife: { type: 'number', describe: '载体寿命拍数（缺省 3）' },
          members: { type: 'string[]', describe: '运行态：带上成员' },
          inFlight: { type: 'number', describe: '运行态：已发未落地' },
          rejected: { type: 'number', describe: '运行态：累计被拒' },
          seq: { type: 'number', describe: '运行态：载体序号' },
        },
        schema: t.obj({
          id: t.str(), template: t.str(), enqueueSignal: t.str(), capacity: t.num(), burstCapacity: t.opt(t.num()), burstFlag: t.opt(t.str()),
          popSignal: t.opt(t.str()), fullSignal: t.opt(t.str()), originX: t.num(), originY: t.num(), stepX: t.num(), stepY: t.num(),
          carrierLife: t.opt(t.num()), members: t.arr(t.entity()), inFlight: t.num(), rejected: t.num(), seq: t.num(),
        }),
      },
    },
    reads: ['ConveyorQueue', 'Signal', 'Flag', 'PrefabOrigin'],
    writes: ['ConveyorQueue', 'Signal', 'SpawnRequest', 'Timer', 'DestroyRequest', 'Transform'],
    consumes: [],
  },

  config: {
    capacity: { type: 'number', default: 5, describe: '常态容量', question: '带上最多几个？', ui: { control: 'input' } },
  },

  systems: [
    {
      id: 'conveyor-queue',
      phase: SystemPhase.PostResolve,
      reads: ['ConveyorQueue', 'Signal', 'Flag', 'PrefabOrigin'],
      writes: ['ConveyorQueue', 'Signal', 'SpawnRequest', 'Timer', 'DestroyRequest', 'Transform'],
      consumes: [],
      execute(world: IWorld) {
        const belts = sortedIds(world, 'ConveyorQueue');
        if (belts.length === 0) return;
        // 本拍信号：名 → 出现次数
        const counts = new Map<string, number>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
        }
        // 成员归属：PrefabOrigin.source → 带（创建序）
        const membersOf = new Map<EntityId, EntityId[]>();
        for (const e of world.queryEntities('PrefabOrigin')) {
          const po = world.getComponent<PrefabOrigin>(e, 'PrefabOrigin');
          if (!po?.source) continue;
          const list = membersOf.get(po.source);
          if (list) list.push(e); else membersOf.set(po.source, [e]);
        }
        for (const bid of belts) {
          const cq = world.getComponent<ConveyorQueue>(bid, 'ConveyorQueue');
          if (!cq) continue;
          const members = membersOf.get(bid) ?? [];
          // ① 落地对账：新成员抵消 inFlight
          const landed = members.length - cq.members.length;
          if (landed > 0) cq.inFlight = Math.max(0, cq.inFlight - landed);
          cq.members = members;
          // ② 出带
          if (cq.popSignal && counts.has(cq.popSignal) && members.length > 0) {
            const head = members[0];
            world.addComponent<DestroyRequest>(head, { type: 'DestroyRequest', entityId: head });
          }
          // ③ 上带：按信号出现次数逐份发 SpawnRequest（载体实体 + Timer life 交 lifetime 回收）
          const n = counts.get(cq.enqueueSignal) ?? 0;
          if (n > 0) {
            let burstOn = false;
            if (cq.burstFlag) {
              burstOn = resolveFlag(ctxOf(world), cq.burstFlag)?.active ?? false;
            }
            const cap = effectiveCapacity(cq, burstOn);
            let rejected = 0;
            for (let i = 0; i < n; i++) {
              const used = members.length + cq.inFlight;
              if (used >= cap) { rejected++; continue; }
              const slot = used;
              const carrier = `${bid}:req:${cq.seq++}`;
              world.createEntity(carrier);
              world.addComponent<SpawnRequest>(carrier, { type: 'SpawnRequest', templateId: cq.template, x: cq.originX + slot * cq.stepX, y: cq.originY + slot * cq.stepY, source: bid });
              world.addComponent<Timer>(carrier, { type: 'Timer', id: 'life', elapsed: 0, duration: cq.carrierLife ?? 3, loop: false });
              cq.inFlight += 1;
            }
            if (rejected > 0) {
              cq.rejected += rejected;
              if (cq.fullSignal) world.addComponent<Signal>(bid, { type: 'Signal', name: cq.fullSignal, source: bid, arg: String(rejected) });
            }
          }
          // ④ 排位：成员按队列序落到 origin + i·step（空位前移）
          members.forEach((m, i) => {
            const tr = world.getComponent<Transform>(m, 'Transform');
            if (!tr) return;
            tr.x = cq.originX + i * cq.stepX;
            tr.y = cq.originY + i * cq.stepY;
          });
        }
      },
    },
  ],
});
