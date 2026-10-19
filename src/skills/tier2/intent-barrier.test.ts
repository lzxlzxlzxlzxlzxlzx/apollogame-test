import { describe, it, expect, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { hashSnapshot, NON_DETERMINISTIC } from '@net/determinism.js';
import type { Intent } from '@engine/protocol/agent.js';
import type { DebugTrace, Signal } from '@engine/protocol/components.js';
import type { SystemDeclaration } from '@engine/core/types.js';
import {
  intentBarrierCapability, openBarrier, deliverIntents, failIntents, applySettled, setBarrierTurn,
  findBarrier, checkIntent, draftSettle, allAccountedFor, barrierNow,
  type IntentBarrier, type IntentInbox,
} from './intent-barrier.js';
import { eventWhenCapability } from './event-when.js';
import { turnOrderCapability, type TurnOrder } from './turn-order.js';
import { memoryCapability } from './memory.js';
import { effectApplyCapability } from './effect-apply.js';
import { overTimeCapability } from './over-time.js';
import { flowCapability } from '@skills/tier3/flow.js';
import { zoneOccupancyCapability } from './zone-occupancy.js';
import type { Effect, Flag, GameFlow } from '@engine/protocol/components.js';

// t2-intent-barrier（REQ-111-AINPC）点名测试。承重点只有一个：**产物与回包到达次序无关**。
//   ① 收齐即结算（按 id 升序） ② 乱序投递 → hash 逐字节相同 ③ 超期降级补默认动词（整数回合判据·零墙钟）
//   ④ 闭集拒收留 reject 痕 ⑤ IntentInbox 不进 hash（对着 NON_DETERMINISTIC 名单直接断言）
//   ⑥ lockstep：非权威端永不自结算 ⑦ 定序：排得出来**且 warn 数为零**
//
// 为什么 ⑦ 要单独一条：`topological-sort` 在 CYCLEHAZ 方案 B 之后对软环**只告警不抛**，
// 落序不合语义仍照跑 → 接缝静默失效（game108 ENG-03 实证：定序用例全绿、第一轮复查仍漏）。
// 绿灯不等于没话说，所以这条既断言排得出来、也断言 console.warn 一次都没响。

const I = (npcId: string, verb: string, args?: (string | number)[], turn = 7): Intent =>
  args ? { npcId, verb, args, turn } : { npcId, verb, turn };

const VERBS = [{ verb: 'move_to', arity: 1 }, { verb: 'talk_to', arity: 2 }, { verb: 'rest' }];

function gate(spec: Partial<Parameters<typeof openBarrier>[2]> = {}): World {
  const w = new World();
  for (const c of [eventWhenCapability, intentBarrierCapability]) for (const s of c.systems) w.addSystem(s);
  w.createEntity('town');
  openBarrier(w, 'town', {
    id: 'turn-intents', npcIds: ['npc-b', 'npc-a'], turn: 7, deadlineTurns: 2,
    defaultVerb: 'rest', verbs: VERBS, settleSignal: 'intentsReady', ...spec,
  });
  return w;
}
const bar = (w: World) => w.getComponent<IntentBarrier>('town', 'IntentBarrier')!;
const inbox = (w: World) => w.getComponent<IntentInbox>('town', 'IntentInbox');

describe('① 登记与收齐：pending 登记即排序，收齐即按 id 升序产出', () => {
  it('openBarrier 排序 + 去重；空名单 → 直接 idle（没人待决不算开门）', () => {
    const w = gate({ npcIds: ['npc-c', 'npc-a', 'npc-c'] });
    expect(bar(w).pending).toEqual(['npc-a', 'npc-c']);
    expect(bar(w).state).toBe('waiting');
    openBarrier(w, 'town', { id: 'turn-intents', npcIds: [], turn: 7 });
    expect(bar(w).state).toBe('idle');
  });

  it('两个 NPC 都回包 → 当拍结算；resolved 按 npcId 升序；发 settleSignal；filled 为空', () => {
    const w = gate();
    deliverIntents(w, 'turn-intents', 'npc-b', [I('npc-b', 'rest')]);
    deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'move_to', ['zone-lib'])]);
    w.tick();
    const b = bar(w);
    expect(b.state).toBe('settled');
    expect(b.resolved.map((r) => `${r.npcId}:${r.verb}`)).toEqual(['npc-a:move_to', 'npc-b:rest']);
    expect(b.filled).toEqual([]);
    expect(b.settledTurn).toBe(8);                 // openedTurn 7 + 自家拍计数 1
    const sig = w.getComponent<Signal>('town', 'Signal');
    expect(sig?.name).toBe('intentsReady');
    expect(inbox(w)!.deliveries).toEqual([]);      // 结算即清暂存
  });

  it('结算产物只活一拍（同 Signal 口径）：下一拍自清、回 idle，settledTurn 留痕', () => {
    const w = gate();
    deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'rest')]);
    failIntents(w, 'turn-intents', 'npc-b', 'http 503');
    w.tick();
    expect(bar(w).resolved).toHaveLength(2);
    w.tick();
    expect(bar(w).state).toBe('idle');
    expect(bar(w).resolved).toEqual([]);
    expect(bar(w).filled).toEqual([]);
    expect(bar(w).settledTurn).toBe(8);
  });

  it('一个 NPC 可以产多条意图（一回合里「走过去 + 搭话」）', () => {
    const w = gate();
    deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'move_to', ['zone-lib']), I('npc-a', 'talk_to', ['npc-b', 'topic-1'])]);
    failIntents(w, 'turn-intents', 'npc-b', 'skip');
    w.tick();
    expect(bar(w).resolved.map((r) => r.verb)).toEqual(['move_to', 'talk_to', 'rest']);
  });
});

describe('② 承重点：产物与到达次序无关（乱序投递 → hash 逐字节相同）', () => {
  const batch: Array<[string, Intent[]]> = [
    ['npc-a', [I('npc-a', 'move_to', ['zone-lib'])]],
    ['npc-b', [I('npc-b', 'talk_to', ['npc-a', 'topic-3'])]],
    ['npc-c', [I('npc-c', 'rest')]],
  ];

  const runWith = (order: Array<[string, Intent[]]>): World => {
    const w = gate({ npcIds: ['npc-a', 'npc-b', 'npc-c'] });
    for (const [id, ints] of order) deliverIntents(w, 'turn-intents', id, ints);
    w.tick();
    return w;
  };

  it('六种投递次序全排列 → 同一个 hash、同一串 resolved', () => {
    const perms: Array<Array<[string, Intent[]]>> = [
      [batch[0], batch[1], batch[2]], [batch[0], batch[2], batch[1]],
      [batch[1], batch[0], batch[2]], [batch[1], batch[2], batch[0]],
      [batch[2], batch[0], batch[1]], [batch[2], batch[1], batch[0]],
    ];
    const hashes = new Set<string>();
    for (const p of perms) {
      const w = runWith(p);
      hashes.add(hashSnapshot(w.snapshot()));
      expect(bar(w).resolved.map((r) => r.npcId)).toEqual(['npc-a', 'npc-b', 'npc-c']);
    }
    expect(hashes.size).toBe(1);
  });

  it('同一 id 重复投递 → **先到的那次算**，后到的整批拒收（取「后到覆盖」就等于让结果依赖到达次序）', () => {
    const w = gate();
    deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'rest')]);
    deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'move_to', ['zone-hill'])]);
    failIntents(w, 'turn-intents', 'npc-b', 'skip');
    w.tick();
    expect(bar(w).resolved.filter((r) => r.npcId === 'npc-a').map((r) => r.verb)).toEqual(['rest']);
  });
});

describe('③ 超期降级：整数回合判据（零墙钟·零浮点）', () => {
  it('没人回包 → 等到 deadline 才结算，全员补 defaultVerb 并进 filled', () => {
    const w = gate({ deadlineTurns: 2 });
    w.tick();
    expect(bar(w).state).toBe('waiting');            // now-opened = 1 < 2
    w.tick();
    const b = bar(w);
    expect(b.state).toBe('settled');
    expect(b.resolved.map((r) => r.verb)).toEqual(['rest', 'rest']);
    expect(b.filled).toEqual(['npc-a', 'npc-b']);    // 降级率的可观测落点
    expect(b.settledTurn).toBe(9);
  });

  it('deadlineTurns=0 → 当拍就降级（给 0 就是「不等」，不是「永远等」）', () => {
    const w = gate({ deadlineTurns: 0 });
    w.tick();
    expect(bar(w).state).toBe('settled');
    expect(bar(w).filled).toHaveLength(2);
  });

  it('半数回包 + 超期 → 回来的按原意图、没回来的补默认（混合结算）', () => {
    const w = gate({ deadlineTurns: 1 });
    deliverIntents(w, 'turn-intents', 'npc-b', [I('npc-b', 'move_to', ['zone-hill'])]);
    w.tick();
    expect(bar(w).resolved.map((r) => `${r.npcId}:${r.verb}`)).toEqual(['npc-a:rest', 'npc-b:move_to']);
    expect(bar(w).filled).toEqual(['npc-a']);
  });

  it('**回合时钟交给主人**：setBarrierTurn 推了才算过回合，跑多少拍都不超期', () => {
    const w = gate({ deadlineTurns: 1 });
    setBarrierTurn(w, 'turn-intents', 7);                 // 主人说：还在第 7 回合
    expect(barrierNow(bar(w))).toBe(7);
    w.tick(); w.tick(); w.tick();
    expect(bar(w).state).toBe('waiting');                 // 拍数涨了，回合号没涨 → 不超期
    setBarrierTurn(w, 'turn-intents', 8);                 // 过了一个回合
    w.tick();
    expect(bar(w).state).toBe('settled');
    expect(bar(w).settledTurn).toBe(8);
  });

  it('没人推回合 → 退化成本门自己的拍计数（无回合概念的游戏照样能用·不卡死在 waiting）', () => {
    const w = gate({ deadlineTurns: 1 });
    expect(barrierNow(bar(w))).toBe(7);                   // openedTurn + ticks(0)
    w.tick();
    expect(bar(w).state).toBe('settled');
  });

  it('setBarrierTurn 对不存在的门 → false（不抛·不凭空建门）', () => {
    const w = gate();
    expect(setBarrierTurn(w, 'no-such-gate', 9)).toBe(false);
    expect(setBarrierTurn(w, 'turn-intents', 9.9)).toBe(true);
    expect(bar(w).currentTurn).toBe(9);                   // 小数被 trunc
  });

  it('判据全整数：deadlineTurns / openedTurn 小数输入被 trunc，负数被夹到 0', () => {
    const w = gate({ deadlineTurns: 2.9, turn: 7.8 });
    expect(bar(w).deadlineTurns).toBe(2);
    expect(bar(w).openedTurn).toBe(7);
    const w2 = gate({ deadlineTurns: -5 });
    expect(bar(w2).deadlineTurns).toBe(0);
  });
});

describe('④ 闭集拒收：动词/参数/归属三道门 + reject 留痕', () => {
  it('checkIntent 三道门逐条（纯函数）', () => {
    const w = gate();
    const b = bar(w);
    expect(checkIntent(b, I('npc-a', 'move_to', ['z']))).toEqual({ ok: true });
    expect(checkIntent(b, I('npc-x', 'rest'))).toEqual({ ok: false, why: 'not-pending' });
    expect(checkIntent(b, I('npc-a', 'hack_world'))).toEqual({ ok: false, why: 'verb-not-in-set' });
    expect(checkIntent(b, I('npc-a', 'move_to'))).toEqual({ ok: false, why: 'arity 0≠1' });
    expect(checkIntent(b, I('npc-a', 'talk_to', ['npc-b']))).toEqual({ ok: false, why: 'arity 1≠2' });
    expect(checkIntent(b, I('npc-a', 'move_to', [Number.NaN]))).toEqual({ ok: false, why: 'arg-not-finite' });
  });

  it('闭集外动词的 NPC = 等于没决策 → 补默认动词，且 reject 计数进 trace（什么都没发生的分支必须留痕）', () => {
    const w = gate({ deadlineTurns: 0 });
    w.createEntity('tr');
    w.addComponent<DebugTrace>('tr', { type: 'DebugTrace', events: [], tick: 12 } as DebugTrace);
    deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'hack_world')]);
    deliverIntents(w, 'turn-intents', 'npc-b', [I('npc-b', 'rest')]);
    w.tick();
    expect(bar(w).filled).toEqual(['npc-a']);
    const ev = w.getComponent<DebugTrace>('tr', 'DebugTrace')!.events;
    const kinds = ev.filter((e) => e.system === 'intent-barrier').map((e) => e.kind);
    expect(kinds).toEqual(['reject', 'transition', 'commit']);    // 密度：每拍 ≤3 条
    expect(ev.find((e) => e.kind === 'reject')!.what).toContain('拒收 1 条');
    expect(ev[0].tick).toBe(12);                                  // 拍号取世界的，不是墙钟
  });

  it('空动词表 = 不校验动词名，但 pending 归属照查（两道门互不替代）', () => {
    const w = gate({ verbs: [] });
    expect(checkIntent(bar(w), I('npc-a', 'anything', [1, 2, 3]))).toEqual({ ok: true });
    expect(checkIntent(bar(w), I('ghost', 'anything'))).toEqual({ ok: false, why: 'not-pending' });
  });

  it('不在 waiting 的门拒收投递（回包迟了整整一个回合 → 返回 false，调用方知情）', () => {
    const w = gate({ deadlineTurns: 0 });
    w.tick();
    expect(bar(w).state).toBe('settled');
    expect(deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'rest')])).toBe(false);
    expect(failIntents(w, 'turn-intents', 'npc-a', 'late')).toBe(false);
    expect(deliverIntents(w, 'no-such-gate', 'npc-a', [I('npc-a', 'rest')])).toBe(false);
  });

  it('纯函数 draftSettle / allAccountedFor 可脱离世界单测', () => {
    const w = gate();
    const b = bar(w);
    const ib: IntentInbox = { type: 'IntentInbox', id: 'turn-intents', deliveries: [{ npcId: 'npc-b', intents: [I('npc-b', 'rest')] }], failures: [] };
    expect(allAccountedFor(b, ib)).toBe(false);
    ib.failures.push({ npcId: 'npc-a', reason: 'x' });
    expect(allAccountedFor(b, ib)).toBe(true);
    expect(allAccountedFor(b, undefined)).toBe(false);
    const d = draftSettle(b, ib, 9);
    expect(d.resolved.map((r) => r.npcId)).toEqual(['npc-a', 'npc-b']);
    expect(d.filled).toEqual(['npc-a']);
    expect(d.rejected).toBe(0);
  });
});

describe('⑤ IntentInbox 不进 hash（对着 NON_DETERMINISTIC 名单直接断言）', () => {
  it('名单里有 IntentInbox，没有 IntentBarrier（门的产物该被校验，暂存不该）', () => {
    expect(NON_DETERMINISTIC.has('IntentInbox')).toBe(true);
    expect(NON_DETERMINISTIC.has('IntentBarrier')).toBe(false);
  });

  it('只往暂存里塞东西 → hash 一个字节都不动', () => {
    const w = gate();
    const before = hashSnapshot(w.snapshot());
    deliverIntents(w, 'turn-intents', 'npc-a', [I('npc-a', 'move_to', ['zone-lib'])]);
    failIntents(w, 'turn-intents', 'npc-b', 'http 503');
    expect(inbox(w)!.deliveries).toHaveLength(1);
    expect(hashSnapshot(w.snapshot())).toBe(before);
  });

  it('结算后 hash 必变（门的产物是世界状态，该进指纹）', () => {
    const w = gate({ deadlineTurns: 0 });
    const before = hashSnapshot(w.snapshot());
    w.tick();
    expect(hashSnapshot(w.snapshot())).not.toBe(before);
  });
});

describe('⑥ lockstep：非权威端永不自结算，只接权威端广播的结果', () => {
  it('authority:false → 超期也不结算（否则对端全部超期补默认，第一回合就与权威端分叉）', () => {
    const w = gate({ authority: false, deadlineTurns: 0 });
    w.tick(); w.tick(); w.tick();
    expect(bar(w).state).toBe('waiting');
    expect(bar(w).resolved).toEqual([]);
  });

  it('applySettled 落地广播结果（排序照做·不再二次校验），两端 hash 一致', () => {
    const host = gate({ deadlineTurns: 0 });
    deliverIntents(host, 'turn-intents', 'npc-a', [I('npc-a', 'move_to', ['zone-lib'])]);
    deliverIntents(host, 'turn-intents', 'npc-b', [I('npc-b', 'rest')]);
    host.tick();
    const peer = gate({ authority: false, deadlineTurns: 0 });
    // 广播过来的顺序反着给，applySettled 仍按 npcId 升序落地。
    expect(applySettled(peer, 'turn-intents', [...bar(host).resolved].reverse(), bar(host).settledTurn)).toBe(true);
    expect(bar(peer).resolved.map((r) => r.npcId)).toEqual(['npc-a', 'npc-b']);
    expect(bar(peer).state).toBe('settled');
    expect(applySettled(peer, 'no-such-gate', [], 1)).toBe(false);
  });

  it('findBarrier 按 id 定位（多门共存时不串门）', () => {
    const w = gate();
    w.createEntity('other');
    openBarrier(w, 'other', { id: 'gossip-intents', npcIds: ['npc-z'], turn: 7 });
    expect(findBarrier(w, 'turn-intents')!.eid).toBe('town');
    expect(findBarrier(w, 'gossip-intents')!.eid).toBe('other');
    expect(findBarrier(w, 'nope')).toBeUndefined();
  });
});

// ⑧ 与 `t3-flow` 同装（REQ-111-ENG-04 附带的定序问询·game111 PE 2026-09-14 提）。
// PE 报的理由是「七相位并进 flow 会和 barrier 互为前驱成环」。**实跑复现不出来**：两者共享零个组件
// （flow 碰 GameFlow/Resource/Flag/State/Cooldowns/Timer/StringVar，门碰 IntentBarrier/IntentInbox/Signal），
// 任一方向都没有推断边，落序干净得出、warn 数为零。所以「成环」不是不摊开七相位的理由。
// 真正的约束是另一件事，也钉在下面：**flow 读不到 `IntentBarrier.state`**（不在它的 reads 里，
// 条件树也没有这个 kind）⇒ 不能直接拿「门结算了」当转移条件。桥是现成的纯数据：
// 门发 `settleSignal` → `Effect{onSignal, kind:'set-flag'}` 落一面旗 → flow 的 when 读那面旗。
// 代价是标准离散反馈的一拍延迟，而 `resolved` 只活一拍 —— 所以**意图的消费必须挂在结算信号上
// （同拍 Commit 相位），不能等 flow 转移过去再读**。这两条都用真世界跑出来，不靠推断。
describe('⑧ 与 t3-flow 同装：不成环 · 结算信号当相位边 · 意图同拍可消费', () => {
  const withFlow = (): SystemDeclaration[] => [
    ...eventWhenCapability.systems, ...intentBarrierCapability.systems, ...flowCapability.systems,
    ...turnOrderCapability.systems, ...memoryCapability.systems, ...effectApplyCapability.systems,
    ...zoneOccupancyCapability.systems,
  ] as SystemDeclaration[];

  it('flow 与 barrier **不成环**（PE 报的理由复现不出来）：严格模式不抛 + warn 数为零', () => {
    expect(() => topologicalSort(withFlow(), { softCycle: 'throw' })).not.toThrow();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      topologicalSort(withFlow(), { softCycle: 'warn' });
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it('落序语义正确：flow → event-when → intent-barrier（相位先推进、信号再清场、门最后结算）', () => {
    const order = topologicalSort(withFlow(), { softCycle: 'throw' }).map((s) => s.id);
    expect(order.indexOf('flow')).toBeLessThan(order.indexOf('event-when'));
    expect(order.indexOf('event-when')).toBeLessThan(order.indexOf('intent-barrier'));
  });

  it('结算信号 →（同拍 Commit）set-flag：flow 能拿这面旗当转移条件，全程零新代码', () => {
    const w = new World();
    for (const c of [eventWhenCapability, intentBarrierCapability, effectApplyCapability, flowCapability]) {
      for (const sys of c.systems) w.addSystem(sys);
    }
    w.createEntity('town');
    openBarrier(w, 'town', { id: 'g', npcIds: ['npc-a', 'npc-b'], turn: 7, deadlineTurns: 0, verbs: VERBS, settleSignal: 'intentsReady' });
    // 桥：门发的信号 → 落一面旗（纯数据·effect-apply 跑在 Commit，与门同拍）
    w.createEntity('bridge');
    w.addComponent<Flag>('bridge', { type: 'Flag', id: 'intentsReady', active: false });
    w.addComponent<Effect>('bridge', { type: 'Effect', onSignal: 'intentsReady', kind: 'set-flag', targetId: 'intentsReady', value: true } as Effect);
    // 七相位里的那一段：INTENT 等旗亮才走 COMMIT
    w.createEntity('turn');
    w.addComponent<GameFlow>('turn', {
      type: 'GameFlow', id: 'turn', current: 'INTENT',
      states: [{ id: 'INTENT', transitions: [{ when: { kind: 'flag', id: 'intentsReady' }, to: 'COMMIT' }] }, { id: 'COMMIT' }],
    } as GameFlow);

    w.tick();   // Update：门超期结算 + 发信号 → Commit：effect-apply 把旗点亮
    expect(bar(w).state).toBe('settled');
    expect(bar(w).resolved).toHaveLength(2);
    expect(w.getComponent<Flag>('bridge', 'Flag')!.active).toBe(true);
    expect(w.getComponent<GameFlow>('turn', 'GameFlow')!.current).toBe('INTENT');   // 旗本拍才亮，flow 下一拍才读到

    w.tick();   // flow 读到旗 → 转 COMMIT
    expect(w.getComponent<GameFlow>('turn', 'GameFlow')!.current).toBe('COMMIT');
    // **陷阱钉**：等 flow 转过去的时候，resolved 已经被收走了（它只活一拍）。
    // 所以意图的消费要挂在结算信号上（同拍 Commit），不能等相位转移。
    expect(bar(w).resolved).toEqual([]);
  });
});

// ⑦ 定序。**这一组是实撞出来的**：首版让门自己读 `TurnOrder.round` 当回合号，于是
// 「写 Signal + 读 TurnOrder」与 turn-order 的「读 Signal + 写 TurnOrder」互为前驱 → 真 2-环
// （strict 模式抛·生产缺省只告警，落序交字典序平局裁决，那次恰好排对）。
// 治本 = 去掉那条读边（回合号交给 setBarrierTurn 推），2-环随之消失，显式边也不必要了。
// **注意本组断言的边界**：这里断的是「本件与 turn-order 之间结构上没有环」，
// **不是**「本件不在全库软环 blob 里」——它仍在 p0 那个 blob 里（见 declaration-audit.test.ts 的
// SCC 基线与理由），因为 `runsAfter event-when` + `writes Signal` 这个形状必然入环，与 turn-order 同款。
describe('⑦ 定序：排得出来**且 warn 数为零**（绿灯不等于没话说）', () => {
  const decls = (): SystemDeclaration[] => [
    ...eventWhenCapability.systems, ...intentBarrierCapability.systems, ...memoryCapability.systems,
    ...turnOrderCapability.systems, ...effectApplyCapability.systems, ...overTimeCapability.systems,
  ] as SystemDeclaration[];

  it('严格模式（softCycle:throw）下不抛 —— 新增的两个系统没有闭合出软环', () => {
    expect(() => topologicalSort(decls(), { softCycle: 'throw' })).not.toThrow();
  });

  it('warn 模式下 console.warn **一次都不响**（软环只告警不抛，不读告警等于没 review）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      topologicalSort(decls(), { softCycle: 'warn' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('intent-barrier 排在 event-when 之后（它发 Signal，而 event-when 每拍开头清全场）', () => {
    const order = topologicalSort(decls(), { softCycle: 'throw' }).map((s) => s.id);
    expect(order.indexOf('intent-barrier')).toBeGreaterThan(order.indexOf('event-when'));
    expect(order.indexOf('memory-decay')).toBeGreaterThan(order.indexOf('event-when'));
  });

  it('门不读 TurnOrder（这条读边就是当年把它拖进全库软环 blob 的那一条·别再加回来）', () => {
    const sys = intentBarrierCapability.systems.find((s) => s.id === 'intent-barrier')!;
    expect(sys.reads).not.toContain('TurnOrder');
    expect(sys.runsBefore ?? []).toEqual([]);   // 也不靠显式边压环——结构上就没环
  });
});
