import { describe, it, expect, vi, afterEach } from 'vitest';
import { LockstepClient } from './lockstep-tab.js';
import type { Channel, NetMsg, DesyncInfo } from './lockstep-tab.js';
import { buildMpWorld, addPlayer } from './mp-world.js';
import type { Transform } from '@engine/protocol/components.js';

// 内存版 BroadcastChannel：post 投递给**除发送者外**的所有订阅者（与浏览器语义一致）。
class MockBus {
  private recv = new Map<string, (m: NetMsg) => void>();
  readonly log: NetMsg[] = [];
  channel(tag: string): Channel {
    return {
      post: (m) => {
        this.log.push(m);
        for (const [id, cb] of this.recv) if (id !== tag) cb(structuredClone(m));
      },
      onMessage: (cb) => this.recv.set(tag, cb),
      close: () => this.recv.delete(tag),
    };
  }
}

const STEP = 1000 / 30;

describe('LockstepClient — 同浏览器双标签页帧同步（mock BroadcastChannel）', () => {
  it('两个对端逐 tick 状态完全一致：同 epoch 下每个 tick 的 hash 必相等', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    let inA: { dx: number; dy: number } = { dx: 0, dy: 0 };
    let inB: { dx: number; dy: number } = { dx: 0, dy: 0 };

    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => inA, now, tickRate: 30, inputDelay: 4 });
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => inB, now, tickRate: 30, inputDelay: 4 });

    // 发现阶段：推进时钟越过心跳 → 两端互相看见 → 收敛到 epoch 'A|B'
    for (let i = 0; i < 12; i++) {
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }
    expect(A.view().epoch).toBe('A|B');
    expect(B.view().epoch).toBe('A|B');
    expect(A.view().peerCount).toBe(2);

    // 用各异且变化的输入跑一段
    const dirs = [
      { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
    ];
    for (let s = 0; s < 90; s++) {
      inA = dirs[s % dirs.length];
      inB = dirs[(s + 3) % dirs.length];
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }

    // 逐 tick 校验：epoch 'A|B' 下，凡两端都报告过 hash 的 tick，hash 必相等。
    const hashAt = new Map<string, string>(); // `${peer}@${tick}` -> hash
    const ticks = new Set<number>();
    for (const m of bus.log) {
      if (m.t !== 'hash' || m.epoch !== 'A|B') continue;
      hashAt.set(`${m.peer}@${m.tick}`, m.hash);
      ticks.add(m.tick);
    }
    let compared = 0;
    let maxCommon = 0;
    for (const tk of ticks) {
      const ha = hashAt.get(`A@${tk}`);
      const hb = hashAt.get(`B@${tk}`);
      if (ha !== undefined && hb !== undefined) {
        expect(ha).toBe(hb); // ← 帧同步的硬证据：同 tick、两端逐位一致
        compared++;
        maxCommon = Math.max(maxCommon, tk);
      }
    }
    expect(compared).toBeGreaterThan(40); // 确实比对了足够多的 tick
    expect(maxCommon).toBeGreaterThan(40);
  });

  it('单端也能独立推进（等待第二端时不卡死、不报错）', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const solo = new LockstepClient({
      peerId: 'solo',
      channel: bus.channel('solo'),
      getInput: () => ({ dx: 1, dy: 0 }),
      now,
      tickRate: 30,
      inputDelay: 4,
    });
    for (let i = 0; i < 30; i++) {
      clock += STEP;
      solo.pump(STEP);
    }
    expect(solo.view().peerCount).toBe(1);
    expect(solo.view().tick).toBeGreaterThan(10); // 单人自由推进
  });

  it('第二端加入 → 两端按新成员从 tick 0 重新对齐（membership 变化触发 reset）', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    // A 先单独跑一会
    for (let i = 0; i < 20; i++) {
      clock += STEP;
      A.pump(STEP);
    }
    expect(A.view().epoch).toBe('A');
    const tickBeforeJoin = A.view().tick;
    expect(tickBeforeJoin).toBeGreaterThan(5);

    // B 加入
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4 });
    for (let i = 0; i < 12; i++) {
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }
    expect(A.view().epoch).toBe('A|B'); // 新 epoch
    expect(B.view().epoch).toBe('A|B');
    expect(A.view().peerCount).toBe(2);
  });

  // ── P0 回归（engine-review-2026-08-04 §3.3·实测复现）────────────────────
  // 加入死锁：两端**切 epoch 的时刻不同**。先切的一方在对端还没进新 epoch 时就广播了
  // 该 epoch 的输入，对端按 epoch 不符丢弃；而发送方 committedInputTick 单调递增、
  // 永不重发 → 后进入者永久缺那几拍，卡住后自己也不再产出新输入 → 两端互等、永久卡死。
  it('加入错峰（对端尚未进入新 epoch 时收到该 epoch 的输入）→ 两端仍必须继续推进，不得死锁', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    // A 先单独跑几拍：把 A 的心跳时刻钉在 clock=0，后面几轮 A 都不会再发 hello
    // （HEARTBEAT_MS=250）——这是造出「A 已切新 epoch、B 还没切」错峰的关键。
    A.pump(STEP);
    for (let i = 0; i < 4; i++) { clock += STEP; A.pump(STEP); }

    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4 });
    // 错峰窗口：B 先 pump（B 的 hello 让 A 立刻切到 'A|B'），而 A 尚未到心跳点、
    // 不发 hello → B 仍停在 epoch 'B'。此间 A 在 'A|B' 下广播的输入会被 B 全部丢弃。
    for (let i = 0; i < 3; i++) {
      clock += STEP;
      B.pump(STEP);
      A.pump(STEP);
    }
    expect(A.view().epoch).toBe('A|B'); // A 已切
    expect(B.view().epoch).toBe('B');   // B 未切 → 错峰已成立（前置条件，非结论）

    // 放开长跑：A 心跳到点 → B 也切进 'A|B'。修复前两端会分别永久停在
    // 2*inputDelay 与 inputDelay（A 缺 B 的新输入、B 缺被丢弃的那几拍）。
    for (let i = 0; i < 120; i++) {
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }
    expect(A.view().epoch).toBe('A|B');
    expect(B.view().epoch).toBe('A|B');
    // 核心断言：两端都真的推进了（死锁时 A=8 / B=4 永远不动）。
    expect(B.view().tick).toBeGreaterThan(30);
    expect(A.view().tick).toBeGreaterThan(30);

    // 且修死锁不能靠「放宽输入集齐」换来 desync：把落后一端追到同一 tick 再比 hash。
    // （瞬时 tick 差一两拍属正常——本 harness 每轮 A 先 pump；逐 tick 全等由本文件
    //   第一个用例覆盖，这里只需确认错峰加入后两端仍收敛到同一状态。）
    for (let i = 0; i < 40 && A.view().tick !== B.view().tick; i++) {
      clock += STEP;
      if (B.view().tick < A.view().tick) B.pump(STEP); else A.pump(STEP);
    }
    expect(A.view().tick).toBe(B.view().tick);
    expect(A.view().hash).toBe(B.view().hash);
  });
});

// ═══ REQ-DESYNC（深审 A2 发现①）：分叉要大声 ═══
// 病灶（修前实证）：view() 只看 peerHashAt.get(simTick)、缺对端数据默认 true——
// 领先端本 tick 的对端 hash 永远还没到 → 60/60 拍全分叉、零报警、照跑。
describe('LockstepClient — REQ-DESYNC 三态同步判定 + 首次分叉一次性大声报告', () => {
  afterEach(() => vi.restoreAllMocks());

  // 构建不一致的世界（多一个 ghost 实体）→ 从 tick 1 起每拍 hash 必分叉。
  const ghostBuild = (ids: string[]) => {
    const w = buildMpWorld();
    ids.forEach((pid, i) => addPlayer(w, i, pid));
    addPlayer(w, ids.length, 'ghost');
    return w;
  };

  it('健康双端 → synced（有真实可比拍才算同步）·全程零 console.error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4 });
    for (let i = 0; i < 40; i++) { clock += STEP; A.pump(STEP); B.pump(STEP); }
    expect(A.view().syncState).toBe('synced');
    expect(B.view().syncState).toBe('synced');
    expect(A.view().inSync).toBe(true);
    expect(A.view().desyncTick).toBeNull();
    expect(err).not.toHaveBeenCalled();
  });

  it('hash 报文全丢 → pending 而非谎报同步（①缺数据不得默认 true·旧实现此处恒 true）', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    // 信道剪掉全部 hash 报文：输入照走（世界照推进），但两端谁也拿不到对端凭据。
    const deaf = (tag: string): Channel => {
      const inner = bus.channel(tag);
      return { ...inner, post: (m) => { if (m.t !== 'hash') inner.post(m); } };
    };
    const A = new LockstepClient({ peerId: 'A', channel: deaf('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    const B = new LockstepClient({ peerId: 'B', channel: deaf('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4 });
    for (let i = 0; i < 40; i++) { clock += STEP; A.pump(STEP); B.pump(STEP); }
    expect(A.view().tick).toBeGreaterThan(10); // 世界确实在推进（不是卡死出来的 pending）
    expect(A.view().syncState).toBe('pending');
    expect(A.view().inSync).toBe(false); // ← 修的就是这里：零凭据不许挂绿灯
    expect(B.view().syncState).toBe('pending');
  });

  it('构建不一致 → 两端都确诊 desynced；**领先端也能看见**（工单点名·旧实现盲区）；onDesync 载荷可用', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const seen: DesyncInfo[] = [];
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4, onDesync: (d) => seen.push(d) });
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4 });
    // A 每轮 pump 两次 → 吃满 inputDelay 提前量、稳居领先端；B 的 hash 只会指向 A 的**过去拍**。
    // 旧实现在这个形态下 A.inSync 永远 true（peerHashAt.get(simTick) 恒 undefined）。
    for (let i = 0; i < 10; i++) { clock += STEP; A.pump(STEP); A.pump(STEP); B.pump(STEP); }
    expect(A.view().syncState).toBe('synced'); // 健康跑过热身期（分叉必须发生在这之后）
    // 分叉源 = 运行中途篡改 B 的世界（复查建议·2026-08-16：构建期就不一致的世界在 epoch
    // 成型的 tick 1 即被 stepTo 同拍路径确诊，测不到盲区）——此处世界健康跑到 A 已拉开领先
    // 才注入分叉，B 的 hash 指向 A 的过去拍 → 确诊只能走领先端 onMessage 收报路径。
    const t = B.getWorld().getComponent<Transform>('player:p1', 'Transform');
    t!.x += 50;
    for (let i = 0; i < 30; i++) { clock += STEP; A.pump(STEP); A.pump(STEP); B.pump(STEP); }
    expect(A.view().tick).toBeGreaterThan(B.view().tick); // 领先端身份坐实（前置条件）
    expect(A.view().syncState).toBe('desynced');
    expect(A.view().inSync).toBe(false);
    expect(B.view().syncState).toBe('desynced');
    expect(A.view().desyncTick).not.toBeNull();
    expect(A.view().desyncTick!).toBeGreaterThan(4); // 确诊在热身期之后 = 真走了领先端收报路径
    // 事件载荷：epoch/tick/两端 hash 齐备且确实不等（上层停机/重同步的决策料）。
    expect(seen).toHaveLength(1);
    expect(seen[0].epoch).toBe('A|B');
    expect(seen[0].tick).toBe(A.view().desyncTick);
    expect(seen[0].myHash).not.toBe(seen[0].peerHash);
    // 大声报告确有其声（A、B 各一次·内容点名 DESYNC）。
    const desyncErrs = err.mock.calls.filter((c) => String(c[0]).includes('DESYNC'));
    expect(desyncErrs).toHaveLength(2);
  });

  it('持续分叉 60+ 拍 → 每端只报告一次（一次性·不刷屏），红牌整个 epoch 不摘', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4, buildWorld: ghostBuild });
    for (let i = 0; i < 90; i++) { clock += STEP; A.pump(STEP); B.pump(STEP); }
    expect(A.view().tick).toBeGreaterThan(60);
    expect(A.view().syncState).toBe('desynced');
    const firstAt = A.view().desyncTick;
    expect(err.mock.calls.filter((c) => String(c[0]).includes('DESYNC'))).toHaveLength(2); // A+B 各一次
    for (let i = 0; i < 30; i++) { clock += STEP; A.pump(STEP); B.pump(STEP); }
    expect(err.mock.calls.filter((c) => String(c[0]).includes('DESYNC'))).toHaveLength(2); // 再跑 30 拍不加声
    expect(A.view().desyncTick).toBe(firstAt); // 首诊 tick 不漂
  });

  it('单端 → syncState=solo·inSync=true（单人没有"分叉"概念）', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const solo = new LockstepClient({ peerId: 'S', channel: bus.channel('S'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    for (let i = 0; i < 20; i++) { clock += STEP; solo.pump(STEP); }
    expect(solo.view().syncState).toBe('solo');
    expect(solo.view().inSync).toBe(true);
  });
});

// ═══ REQ-NETGAPS（2026-08-26 引擎测试收尾·大扫除 B 路转单三件）═══════════════════

// 乱序/延迟信道夹具：post 只入队，flushAdversarial() 把当轮报文**逆序**投递、并把每 3 条中的
// 1 条压到下一轮（有界延迟 1 轮 ≈ 1 tick << inputDelay=4 的预算·远小于 PEER_TIMEOUT）。
// 全确定性：无随机无真钟。
class AdversarialBus {
  private recv = new Map<string, (m: NetMsg) => void>();
  private queue: { from: string; m: NetMsg }[] = [];
  private held: { from: string; m: NetMsg }[] = [];
  channel(tag: string): Channel {
    return {
      post: (m) => this.queue.push({ from: tag, m }),
      onMessage: (cb) => this.recv.set(tag, cb),
      close: () => this.recv.delete(tag),
    };
  }
  flushAdversarial(): void {
    const batch = [...this.held, ...this.queue];
    this.queue = [];
    this.held = [];
    batch.reverse(); // 逆序投递
    batch.forEach((it, i) => {
      if (i % 3 === 2) { this.held.push(it); return; } // 每 3 条压 1 条到下一轮
      for (const [id, cb] of this.recv) if (id !== it.from) cb(structuredClone(it.m));
    });
  }
  flushAll(): void { // 收尾清空（不再扣压）
    const batch = [...this.held, ...this.queue];
    this.queue = []; this.held = [];
    for (const it of batch) for (const [id, cb] of this.recv) if (id !== it.from) cb(structuredClone(it.m));
  }
}

describe('LockstepClient — 乱序/延迟信道（REQ-NETGAPS①·输入按 tick 键控的耐乱序契约）', () => {
  it('逆序+有界延迟投递 40 轮：双端持续推进·零 desync·终态同拍同 hash', () => {
    const bus = new AdversarialBus();
    let clock = 0;
    const now = () => clock;
    const desyncs: DesyncInfo[] = [];
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4, onDesync: (i) => desyncs.push(i) });
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4, onDesync: (i) => desyncs.push(i) });
    const STEP2 = 1000 / 30;
    // 发现阶段（正常投递·先收敛成员）
    for (let i = 0; i < 12; i++) { clock += STEP2; A.pump(STEP2); B.pump(STEP2); bus.flushAll(); }
    expect(A.view().epoch).toBe('A|B');
    // 对抗阶段：逆序+压单投递
    for (let i = 0; i < 40; i++) { clock += STEP2; A.pump(STEP2); B.pump(STEP2); bus.flushAdversarial(); }
    bus.flushAll();
    // 收尾对齐：再正常跑几轮让落后端追平
    for (let i = 0; i < 8; i++) { clock += STEP2; A.pump(STEP2); B.pump(STEP2); bus.flushAll(); }
    expect(desyncs).toEqual([]); // 乱序≠分叉：输入按 tick 键控·到达序无关
    expect(A.view().syncState).toBe('synced'); // 真实可比拍背书（非缺数据默认）
    expect(B.view().syncState).toBe('synced');
    expect(A.view().tick).toBeGreaterThan(20); // 真在推进（掉输入会停摆·此断言即咬）
    expect(A.view().tick).toBe(B.view().tick);
    expect(A.view().hash).toBe(B.view().hash); // 同拍逐位一致
  });
});

describe('LockstepClient — epoch 桶淘汰（REQ-NETGAPS②·MAX_INPUT_EPOCHS=4 上界下现役桶不被误逐）', () => {
  it('成员抖动产 5+ 个 epoch 桶后·幸存双端仍能推进且同步（现役桶被逐=永久停摆·此测即咬）', () => {
    const bus = new AdversarialBus();
    let clock = 0;
    const now = () => clock;
    const desyncs: DesyncInfo[] = [];
    const STEP2 = 1000 / 30;
    const mk = (id: string): LockstepClient => new LockstepClient({ peerId: id, channel: bus.channel(id), getInput: () => ({ dx: 0, dy: 0 }), now, tickRate: 30, inputDelay: 4, onDesync: (i) => desyncs.push(i) });
    const A = mk('A');
    const B = mk('B');
    const settle = (clients: LockstepClient[], rounds: number): void => {
      for (let i = 0; i < rounds; i++) { clock += STEP2; for (const c of clients) c.pump(STEP2); bus.flushAll(); }
    };
    settle([A, B], 12);
    expect(A.view().epoch).toBe('A|B');
    // 四轮抖动：C1..C4 各进各出 → 桶键 {A|B, A|B|C1..C4} = 5 个 > MAX_INPUT_EPOCHS(4)
    const seen: string[] = [];
    for (const cid of ['C1', 'C2', 'C3', 'C4']) {
      const ch = bus.channel(cid);
      const C = new LockstepClient({ peerId: cid, channel: ch, getInput: () => ({ dx: 0, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
      settle([A, B, C], 14);
      seen.push(A.view().epoch);
      ch.close(); // C 离场：停 pump + 关信道 → 等心跳超时(1200ms)被 A/B 剔除
      settle([A, B], Math.ceil(1200 / STEP2) + 6);
      seen.push(A.view().epoch);
    }
    expect(seen).toEqual(['A|B|C1', 'A|B', 'A|B|C2', 'A|B', 'A|B|C3', 'A|B', 'A|B|C4', 'A|B']); // 抖动真发生（锚点）
    // 抖动后现役 epoch 必须还活着：能推进、能同步
    const t0 = A.view().tick;
    settle([A, B], 20);
    expect(desyncs).toEqual([]);
    expect(A.view().epoch).toBe('A|B');
    expect(A.view().tick).toBeGreaterThan(t0); // 现役桶被误逐会停在 t0
    expect(A.view().syncState).toBe('synced');
    expect(A.view().hash).toBe(B.view().hash);
  });
});

// ── P2d · 调度指纹握手（engine-architecture-review-2026-09-02 D2b）──
describe('LockstepClient — 调度指纹握手（系统序 + tickRate）', () => {
  it('两端调度不同（对端多装一个系统）→ 不组局：epoch 各自 solo·onIncompatible 一次·console.error 一次', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: Array<{ peer: string }> = [];
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 0, dy: 0 }), now, tickRate: 30, inputDelay: 4, onIncompatible: (i) => seen.push(i) });
    const B = new LockstepClient({
      peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 0 }), now, tickRate: 30, inputDelay: 4,
      buildWorld: (ids) => { const w = buildMpWorld(); ids.forEach((id, i) => addPlayer(w, i, id)); w.addSystem({ id: 'extra-sys', reads: [], writes: [], consumes: [], execute() {} }); return w; },
    });
    for (let i = 0; i < 12; i++) { clock += STEP; A.pump(STEP); B.pump(STEP); }
    expect(A.view().epoch).toBe('A'); // 没把 B 收进来
    expect(B.view().epoch).toBe('B');
    expect(seen.map((i) => i.peer)).toEqual(['B']); // A 只报一次
    expect(errSpy.mock.calls.filter((c) => String(c[0]).includes('调度指纹')).length).toBeGreaterThanOrEqual(1);
  });

  it('tickRate 不同 = 调度不同（同一份数据联机时快慢不一）→ 同样拒组局', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 0, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 0 }), now, tickRate: 60, inputDelay: 4 });
    for (let i = 0; i < 12; i++) { clock += STEP; A.pump(STEP); B.pump(STEP); }
    expect(A.view().epoch).toBe('A');
    expect(B.view().epoch).toBe('B');
  });

  it('旧版对端（hello 无 sched）照旧接纳（兼容）', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 0, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    const legacy = bus.channel('L');
    legacy.onMessage(() => {});
    for (let i = 0; i < 12; i++) { clock += STEP; legacy.post({ t: 'hello', peer: 'L' }); A.pump(STEP); }
    expect(A.view().epoch).toBe('A|L');
  });
});
