import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/determinism.js';
import {
  memoryCapability, remember, recall, recallFrom, scoreEntry, shareMemory, findMemoryRules, decayAmount,
  DEFAULT_WEIGHTS, type Memory, type MemoryEntry, type MemoryRules,
} from './memory.js';
import { eventWhenCapability } from './event-when.js';
import type { Flag, EventWhen, DebugTrace } from '@engine/protocol/components.js';

// t2-memory（REQ-111-MEMORY）点名测试：
//   ① 记账/刷新/容量淘汰 ② 衰减两种触发（信号 / 拍周期）+ 遗忘 ③ **整数** top-K 检索与同分全序
//   ④ 跨实体转述打折 + source 落点 ⑤ 确定性：插入序不改 hash、禁浮点入排序
//
// 承重点（sabotage 锚在这几条）：**检索的全序兜底**（同分按 id）与**整数归一**。二者都属
// 「跑得出结果但跨端会分叉」的形状——不钉住，症状是偶发 desync，属本仓最难查的 bug。

const E = (over: Partial<MemoryEntry> & { id: string }): MemoryEntry => ({
  subject: 'player', object: 'npc-a', turn: 0, strength: 50, tags: ['gossip'], source: 'talk:1', ...over,
});

function world(rules?: Partial<MemoryRules>): World {
  const w = new World();
  for (const c of [eventWhenCapability, memoryCapability]) for (const s of c.systems) w.addSystem(s);
  w.createEntity('rules');
  w.addComponent<MemoryRules>('rules', {
    type: 'MemoryRules', id: 'town',
    decay: [{ tag: 'gossip', amount: 5 }, { tag: 'trauma', amount: 1 }],
    defaultDecay: 2, forgetBelow: 1, shareDiscount: 600, period: 1, ...rules,
  });
  for (const id of ['npc-a', 'npc-b']) w.createEntity(id);
  return w;
}
const mem = (w: World, id: string) => w.getComponent<Memory>(id, 'Memory');

describe('① 记账 remember：新建 / 同 id 刷新 / 容量淘汰', () => {
  it('无 Memory 组件 → 自动建；强度与回合号 Math.trunc 归一（小数进 hash 就是跨端漂移源）', () => {
    const w = world();
    remember(w, 'npc-a', E({ id: 'm1', strength: 80.9, turn: 7.7 }));
    const m = mem(w, 'npc-a')!;
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].strength).toBe(80);
    expect(m.entries[0].turn).toBe(7);
    expect(Number.isInteger(m.entries[0].strength)).toBe(true);
  });

  it('负强度归零（不许出现负强度把排序掀翻）', () => {
    const w = world();
    remember(w, 'npc-a', E({ id: 'm1', strength: -40 }));
    expect(mem(w, 'npc-a')!.entries[0].strength).toBe(0);
  });

  it('同 id 再记 → 刷新而非叠第二条；强度取较大者（再提一次的事更难忘，不该被弱的覆盖）', () => {
    const w = world();
    remember(w, 'npc-a', E({ id: 'm1', strength: 80 }));
    remember(w, 'npc-a', E({ id: 'm1', strength: 30, turn: 9, source: 'talk:2' }));
    const m = mem(w, 'npc-a')!;
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].strength).toBe(80);
    expect(m.entries[0].turn).toBe(9);          // 回合号与来源按新的
    expect(m.entries[0].source).toBe('talk:2');
  });

  it('超 max → 丢最弱（同强度按 id 升序丢·全序，不留「看谁先来」）', () => {
    const w = world({ max: 2 });
    remember(w, 'npc-a', E({ id: 'b', strength: 10 }));
    remember(w, 'npc-a', E({ id: 'a', strength: 10 }));
    remember(w, 'npc-a', E({ id: 'hi', strength: 90 }));
    expect(mem(w, 'npc-a')!.entries.map((e) => e.id)).toEqual(['a', 'hi']);   // 留下的两条按 id 升序存
  });
});

describe('② 衰减与遗忘：信号触发 / 拍周期触发（照 t2-over-time 的形状）', () => {
  it('period=1：每拍按标签速率减，降到 forgetBelow 以下即遗忘（移除）', () => {
    const w = world({ period: 1 });
    remember(w, 'npc-a', E({ id: 'g', strength: 12, tags: ['gossip'] }));   // 每拍 -5
    remember(w, 'npc-a', E({ id: 't', strength: 12, tags: ['trauma'] }));   // 每拍 -1
    w.tick();
    expect(mem(w, 'npc-a')!.entries.map((e) => e.strength)).toEqual([7, 11]);
    w.tick(); w.tick();
    const left = mem(w, 'npc-a')!.entries;
    expect(left.map((e) => e.id)).toEqual(['t']);   // gossip 12→7→2→(-3→0) < 1 → 忘了
    expect(left[0].strength).toBe(9);
  });

  it('period=3：两拍不动、第三拍才减一次（周期判据是整数取模，不是每拍都减）', () => {
    const w = world({ period: 3 });
    remember(w, 'npc-a', E({ id: 'g', strength: 30 }));
    w.tick(); w.tick();
    expect(mem(w, 'npc-a')!.entries[0].strength).toBe(30);
    w.tick();
    expect(mem(w, 'npc-a')!.entries[0].strength).toBe(25);
  });

  it('decaySignal 在场 → 只按信号衰减（回合制：一回合恰好一次·period 被忽略）', () => {
    const w = world({ decaySignal: 'newTurn', period: 1 });
    w.createEntity('btn');
    w.addComponent<Flag>('btn', { type: 'Flag', id: 'press', active: false });
    w.addComponent<EventWhen>('btn', { type: 'EventWhen', signal: 'newTurn', when: { kind: 'flag', id: 'press' }, mode: 'level' } as EventWhen);
    remember(w, 'npc-a', E({ id: 'g', strength: 30 }));
    w.tick();                                               // 无信号 → 不动（period 不生效）
    expect(mem(w, 'npc-a')!.entries[0].strength).toBe(30);
    w.getComponent<Flag>('btn', 'Flag')!.active = true;
    w.tick();
    expect(mem(w, 'npc-a')!.entries[0].strength).toBe(25);
  });

  it('period=0 且无 decaySignal → 永不自动衰减（不配触发就别偷偷衰减）', () => {
    const w = world({ period: 0 });
    remember(w, 'npc-a', E({ id: 'g', strength: 30 }));
    w.tick(); w.tick();
    expect(mem(w, 'npc-a')!.entries[0].strength).toBe(30);
  });

  it('多标签命中取最快那个速率（忘得最快的说了算）；无命中用 defaultDecay', () => {
    const rules: MemoryRules = { type: 'MemoryRules', id: 'town', decay: [{ tag: 'gossip', amount: 5 }, { tag: 'trauma', amount: 1 }], defaultDecay: 2 };
    expect(decayAmount(E({ id: 'x', tags: ['gossip', 'trauma'] }), rules)).toBe(5);
    expect(decayAmount(E({ id: 'x', tags: ['nope'] }), rules)).toBe(2);
  });

  it('无 MemoryRules → 整个系统不动（缺规则不等于用一套隐含默认值偷偷改世界）', () => {
    const w = new World();
    for (const s of memoryCapability.systems) w.addSystem(s);
    w.createEntity('npc-a');
    remember(w, 'npc-a', E({ id: 'g', strength: 30 }));
    w.tick();
    expect(mem(w, 'npc-a')!.entries[0].strength).toBe(30);
  });
});

describe('③ 检索：整数打分 top-K + 同分全序', () => {
  it('打分 = 命中×tagHit + 强度×strength + 时近×recency（**整数**·窗口外时近项为 0）', () => {
    const e = E({ id: 'x', strength: 40, turn: 10, tags: ['gossip'] });
    // 命中 1×100 + 40×1 + (50-2)×2 = 236
    expect(scoreEntry(e, { tags: ['gossip'], now: 12 })).toBe(236);
    expect(Number.isInteger(scoreEntry(e, { tags: ['gossip'], now: 12 }))).toBe(true);
    // 距今 60 回合 > 窗口 50 → 时近项截零：1×100 + 40 = 140
    expect(scoreEntry(e, { tags: ['gossip'], now: 70 })).toBe(140);
    expect(DEFAULT_WEIGHTS.recencyWindow).toBe(50);
  });

  it('top-K 按分降序；**同分按条目 id 升序**（没这条兜底，结果跟着插入序走 → 同世界两次跑出不同 prompt）', () => {
    const entries = [E({ id: 'zz', strength: 50 }), E({ id: 'aa', strength: 50 }), E({ id: 'mm', strength: 90 })];
    expect(recallFrom(entries, { k: 3, now: 0 }).map((e) => e.id)).toEqual(['mm', 'aa', 'zz']);
    // 插入序反过来 → 结果必须逐字相同（这才是「确定性检索」的真判据）
    expect(recallFrom([...entries].reverse(), { k: 3, now: 0 }).map((e) => e.id)).toEqual(['mm', 'aa', 'zz']);
  });

  it('按客体/主体筛 + k 截断；无 Memory 的实体 → 空数组（不抛）', () => {
    const w = world();
    remember(w, 'npc-a', E({ id: 'm1', object: 'npc-a' }));
    remember(w, 'npc-a', E({ id: 'm2', object: 'npc-b' }));
    expect(recall(w, 'npc-a', { object: 'npc-b' }).map((e) => e.id)).toEqual(['m2']);
    expect(recall(w, 'npc-a', { subject: 'nobody' })).toEqual([]);
    expect(recall(w, 'npc-a', { k: 1 })).toHaveLength(1);
    expect(recall(w, 'ghost')).toEqual([]);
  });

  it('标签命中多个 → 逐个加分（一条既是绯闻又是创伤的记忆更容易被想起）', () => {
    const e = E({ id: 'x', strength: 0, turn: 0, tags: ['gossip', 'trauma'] });
    expect(scoreEntry(e, { tags: ['gossip', 'trauma'], now: 100 })).toBe(200);
  });
});

describe('④ 跨实体转述 shareMemory：打折强度 + source 落点', () => {
  it('副本 id=`<原>><收方>`·强度 floor(原×折扣/1000)·source=share:<转述方>', () => {
    const w = world();
    remember(w, 'npc-a', E({ id: 'm1', strength: 80, source: 'talk:3' }));
    expect(shareMemory(w, 'npc-a', 'npc-b', 'm1')).toBe(48);   // 80×600/1000
    const copy = mem(w, 'npc-b')!.entries[0];
    expect(copy.id).toBe('m1>npc-b');
    expect(copy.strength).toBe(48);
    expect(copy.source).toBe('share:npc-a');                   // framework §6④ 判 B 的可观测落点
    expect(Number.isInteger(copy.strength)).toBe(true);
  });

  it('再转述一次不增殖（同 id 走刷新路径），且链条在 source 上读得出来', () => {
    const w = world();
    remember(w, 'npc-a', E({ id: 'm1', strength: 80 }));
    shareMemory(w, 'npc-a', 'npc-b', 'm1');
    shareMemory(w, 'npc-a', 'npc-b', 'm1');
    expect(mem(w, 'npc-b')!.entries).toHaveLength(1);
    // 二跳：npc-b 再讲给 npc-c → 48×600/1000 = 28，source 指向 npc-b
    w.createEntity('npc-c');
    expect(shareMemory(w, 'npc-b', 'npc-c', 'm1>npc-b')).toBe(28);
    expect(mem(w, 'npc-c')!.entries[0].source).toBe('share:npc-b');
  });

  it('原条目不存在 / 折后为 0 → 不写任何东西并记一条 reject（「什么都没发生」必须留痕）', () => {
    const w = world();
    w.createEntity('tr');
    w.addComponent<DebugTrace>('tr', { type: 'DebugTrace', events: [], tick: 4 } as DebugTrace);
    remember(w, 'npc-a', E({ id: 'weak', strength: 1 }));     // 1×600/1000 = 0（floor）
    expect(shareMemory(w, 'npc-a', 'npc-b', 'nope')).toBe(0);
    expect(shareMemory(w, 'npc-a', 'npc-b', 'weak')).toBe(0);
    expect(mem(w, 'npc-b')).toBeUndefined();
    const tr = w.getComponent<DebugTrace>('tr', 'DebugTrace')!;
    const rejects = tr.events.filter((e) => e.kind === 'reject');
    expect(rejects).toHaveLength(2);
    expect(rejects.map((e) => e.why)).toEqual(['no-entry', 'discounted-to-zero']);
    expect(rejects[0].tick).toBe(4);                           // 拍号取世界的，不是墙钟
  });

  it('shareDiscount 缺省 = 1000（不打折）', () => {
    const w = world({ shareDiscount: undefined });
    remember(w, 'npc-a', E({ id: 'm1', strength: 77 }));
    expect(shareMemory(w, 'npc-a', 'npc-b', 'm1')).toBe(77);
  });
});

describe('⑤ 确定性：插入序不改 hash · 规则表按 id 定位', () => {
  it('两个世界以相反次序记同一批记忆 → hash 逐字节相同', () => {
    const batch = [E({ id: 'm1', strength: 10 }), E({ id: 'm2', strength: 20 }), E({ id: 'm3', strength: 30 })];
    const wa = world(); for (const e of batch) remember(wa, 'npc-a', e);
    const wb = world(); for (const e of [...batch].reverse()) remember(wb, 'npc-a', e);
    // 这条只有在 remember 恒按 id 排序存时才成立——数组序会进 canonical，按插入序存就等于
    // 把「谁先被记」焊进世界指纹，而那是个本地事实（哪个 NPC 先回包）。
    expect(hashSnapshot(wa.snapshot())).toBe(hashSnapshot(wb.snapshot()));
    expect(mem(wa, 'npc-a')!.entries.map((e) => e.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('规则表：rulesId 指名命中；指名不存在 → undefined（不悄悄退回别的表）', () => {
    const w = world();
    expect(findMemoryRules(w)!.id).toBe('town');
    expect(findMemoryRules(w, 'town')!.id).toBe('town');
    expect(findMemoryRules(w, 'nowhere')).toBeUndefined();
  });

  it('Memory / MemoryRules **进** hash（记忆是世界状态，不是表现层）', () => {
    const w = world();
    const before = hashSnapshot(w.snapshot());
    remember(w, 'npc-a', E({ id: 'm1' }));
    expect(hashSnapshot(w.snapshot())).not.toBe(before);
  });
});
