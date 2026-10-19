import { World } from '@engine/core/world.js';
import { applyCommands } from './commands.js';
import type { Command } from './commands.js';
import { hashWorld, scheduleFingerprint } from './world-hash.js';
import { FixedStepClock } from './fixed-step.js';
import { buildMpWorld, addPlayer, playerEntityId, renderEnts, PLAYER_COLORS } from './mp-world.js';
import type { RenderEnt } from './mp-world.js';

export interface Dir {
  dx: number;
  dy: number;
  jump?: number; // 0/1：平台跳跃用；俯视世界不带（默认 0）
}

// 对端之间交换的报文（经 BroadcastChannel / 任意 Channel 传输）。
export type NetMsg =
  | { t: 'hello'; peer: string; sched?: string } // sched（P2d）：调度指纹（系统序 + tickRate）·不一致的对端不入 epoch
  | { t: 'bye'; peer: string }
  | { t: 'input'; peer: string; epoch: string; tick: number; dx: number; dy: number; jump?: number }
  | { t: 'hash'; peer: string; epoch: string; tick: number; hash: string };

// 传输抽象：浏览器里用 BroadcastChannel，测试里用内存 mock。
export interface Channel {
  post(msg: NetMsg): void;
  onMessage(cb: (msg: NetMsg) => void): void;
  close(): void;
}

export interface ClientView {
  epoch: string;
  tick: number;
  hash: string;
  youPlayerId: string;
  youEntityId: string;
  youColor: number;
  peerCount: number;
  /** 真三态的布尔投影：仅 syncState==='synced'（或 solo）为 true。缺可比数据不再默认 true。 */
  inSync: boolean;
  /** solo=单人 · pending=尚无可比拍（对齐中/hash 未回流）· synced=最近可比拍一致 · desynced=已确认分叉（本 epoch 内不摘牌）。 */
  syncState: 'solo' | 'pending' | 'synced' | 'desynced';
  /** 首次确认分叉的 tick（未分叉 = null）。 */
  desyncTick: number | null;
  ents: RenderEnt[];
}

/** 首次确认分叉的一次性事件载荷（REQ-DESYNC②·供上层停机/重同步决策）。 */
export interface DesyncInfo {
  epoch: string;
  tick: number;
  peer: string;
  myHash: string;
  peerHash: string;
}

export interface LockstepOptions {
  peerId: string;
  channel: Channel;
  getInput: () => Dir;
  now?: () => number;
  tickRate?: number;
  inputDelay?: number;
  // 世界构建器（注入 → 同一套 lockstep 既能跑俯视 mp-world，也能跑平台世界）。
  // 入参为按 slot 排好的 playerId 列表；缺省构建 mp-world。所有对端必须构建顺序一致 → 同哈希。
  buildWorld?: (playerIds: string[]) => World;
  // 首次确认分叉时回调一次（每 epoch 至多一次·与 console.error 大声报告同刻）。不传则只有 console.error。
  onDesync?: (info: DesyncInfo) => void;
  // 调度指纹不一致的对端（P2d）：每个对端至多回调一次；该对端不入 epoch（不与它组局）。不传则只有 console.error。
  onIncompatible?: (info: { peer: string; theirs: string; mine: string }) => void;
}

const HEARTBEAT_MS = 250;
const PEER_TIMEOUT_MS = 1200;
// 输入缓存保留的 epoch 桶数上界（当前 epoch + 若干个「将来可能进入」的）。见 pruneInputEpochs。
const MAX_INPUT_EPOCHS = 4;
// 分叉判定的 hash 留存窗口（拍）。留本端+对端最近这么多拍的 hash 供「最近可比拍」比对；
// 领先端与落后端的 tick 差至多 ≈ inputDelay（个位数），128 拍绰绰有余且封住内存上界。
const HASH_COMPARE_WINDOW = 128;

// ═══════════════════════════════════════════════════════════════
//  帧同步客户端（lockstep）—— 每个标签页一个。
//
//  各端各跑一份**完整的确定性世界**，只通过 channel 交换"每 tick 的输入"。
//  铁律：第 N tick 必须在所有对端应用**完全相同的输入集合**，状态才能逐位一致。
//  → 严格 lockstep：未集齐本 tick 全部对端输入就等待（同浏览器 ≈ 0 延迟，不会卡）。
//  → 输入提前 inputDelay 个 tick 广播，给传播留出余量。
//  成员变化（开/关标签页）→ 整体回到 tick 0 按新成员重建世界，重新对齐。
//  注意：本类不碰渲染/键盘/网络具体实现，故可在 headless 下用 mock channel 单测。
// ═══════════════════════════════════════════════════════════════
export class LockstepClient {
  private readonly peerId: string;
  private readonly channel: Channel;
  private readonly getInput: () => Dir;
  private readonly buildWorld: (playerIds: string[]) => World;
  private readonly now: () => number;
  private readonly inputDelay: number;
  private readonly clock: FixedStepClock;

  private world!: World;
  private epoch = '';
  private membership: string[] = [];
  private slotOf = new Map<string, number>();
  private simTick = 0;
  private committedInputTick = 0;

  private lastSeen = new Map<string, number>();
  private lastHeartbeat = -Infinity;
  // inputs: epoch -> tick -> peerId -> Dir
  private inputs = new Map<string, Map<number, Map<string, Dir>>>();
  // ── 分叉判定（REQ-DESYNC）：两边到齐的拍立刻比，谁后到谁触发——领先端也躲不掉 ──
  private myHashAt = new Map<number, string>(); // 本端每拍 hash（窗口内留存·stepTo 顺手记，不额外算）
  private peerHashAt = new Map<number, Map<string, string>>(); // tick -> peer -> hash
  private lastComparedTick: number | null = null; // 本 epoch 是否真比过至少一拍（null = 无凭据，不得报 synced）
  private desyncInfo: DesyncInfo | null = null; // 首次确认的分叉（本 epoch 内不清、不重复报告）
  private readonly onDesync?: (info: DesyncInfo) => void;
  private readonly onIncompatible?: LockstepOptions['onIncompatible'];
  private readonly tickRate: number;
  private sched = ''; // 本端调度指纹（世界建好后算）
  private readonly incompatible = new Set<string>();

  constructor(opts: LockstepOptions) {
    this.peerId = opts.peerId;
    this.channel = opts.channel;
    this.getInput = opts.getInput;
    this.buildWorld = opts.buildWorld ?? defaultBuildWorld;
    this.onDesync = opts.onDesync;
    this.onIncompatible = opts.onIncompatible;
    this.tickRate = opts.tickRate ?? 30;
    // eslint-disable-next-line zerocraft/no-wall-clock -- 宿主时钟缺省值·可注入（opts.now·测试注入假钟）·只喂 FixedStepClock 的帧间隔，不进 sim/hash
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.inputDelay = Math.max(1, opts.inputDelay ?? 4);
    this.clock = new FixedStepClock(opts.tickRate ?? 30, { maxSteps: 8 });

    this.channel.onMessage((m) => this.onMessage(m));
    this.recomputeEpoch(); // 建立初始（单人）epoch + 世界
  }

  // 渲染 / HUD 读取的当前视图。
  view(): ClientView {
    const hash = hashWorld(this.world); // P2c 增量·同值于 hashSnapshot(snapshot)
    // 三态判定（REQ-DESYNC①）：旧实现只看 peerHashAt.get(simTick)、缺数据默认 true——
    // 领先端本 tick 永远等不到对端 hash，60/60 拍全分叉也显示同步。现在：
    // 没有真比过一拍 = pending（不谎报）；确认过分叉 = desynced（本 epoch 内不摘牌）。
    let syncState: ClientView['syncState'];
    if (this.membership.length <= 1) syncState = 'solo';
    else if (this.desyncInfo) syncState = 'desynced';
    else if (this.lastComparedTick !== null) syncState = 'synced';
    else syncState = 'pending';
    const slot = this.slotOf.get(this.peerId) ?? 0;
    const youPlayerId = playerIdForSlot(slot);
    return {
      epoch: this.epoch,
      tick: this.simTick,
      hash,
      youPlayerId,
      youEntityId: playerEntityId(youPlayerId),
      youColor: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      peerCount: this.membership.length,
      inSync: syncState === 'solo' || syncState === 'synced',
      syncState,
      desyncTick: this.desyncInfo?.tick ?? null,
      ents: renderEnts(this.world),
    };
  }

  // 渲染循环每帧调用：推进尽可能多的确定性 tick（受输入集齐与否限制）。
  pump(elapsedMs: number): void {
    const t = this.now();
    if (t - this.lastHeartbeat >= HEARTBEAT_MS) {
      this.lastHeartbeat = t;
      this.channel.post({ t: 'hello', peer: this.peerId, sched: this.sched });
    }
    this.recomputeEpoch();

    const steps = this.clock.advance(elapsedMs);
    for (let i = 0; i < steps; i++) {
      this.commitLocalInputs();
      const target = this.simTick + 1;
      if (!this.inputsReady(target)) break; // lockstep：等齐对端输入
      this.stepTo(target);
    }
  }

  dispose(): void {
    this.channel.post({ t: 'bye', peer: this.peerId });
    this.channel.close();
  }

  // 当前确定性世界（只读，供渲染后端 sync）。
  getWorld(): World {
    return this.world;
  }

  // ── 成员管理（心跳发现 + 超时剔除；成员串变化即重建 epoch）──
  private recomputeEpoch(): void {
    const t = this.now();
    this.lastSeen.set(this.peerId, t); // 自己永不超时
    const alive = [...this.lastSeen.entries()]
      .filter(([, ts]) => t - ts <= PEER_TIMEOUT_MS)
      .map(([id]) => id)
      .sort();
    const key = alive.join('|');
    if (key !== this.epoch) this.resetEpoch(key, alive);
  }

  private resetEpoch(key: string, members: string[]): void {
    this.epoch = key;
    this.membership = members;
    this.slotOf = new Map(members.map((id, i) => [id, i]));
    this.world = this.buildWorld(members.map((_, i) => playerIdForSlot(i)));
    this.sched = scheduleFingerprint(this.world, this.tickRate); // P2d：握手指纹随世界重建刷新
    this.simTick = 0;
    this.committedInputTick = this.inputDelay; // 前 inputDelay 个 tick 视为零输入热身
    // 保留本 epoch 已缓存的输入（错峰期间对端先发来的那几拍就在这里，正是 P0 修复的关键：
    // 不能像旧实现那样在此重置成空桶，否则等于把缓存又丢一次）。
    if (!this.inputs.has(key)) this.inputs.set(key, new Map());
    this.pruneInputEpochs(key);
    // 分叉状态随 epoch 清零：成员变化 = 世界从 tick 0 重建，旧分叉凭据全部作废。
    this.myHashAt.clear();
    this.peerHashAt.clear();
    this.lastComparedTick = null;
    this.desyncInfo = null;
  }

  // ── 报文处理 ──
  private onMessage(m: NetMsg): void {
    if ('peer' in m && m.peer === this.peerId) return; // 忽略自身回声
    switch (m.t) {
      case 'hello':
        // P2d：调度指纹握手——对端系统序/tickRate 与本端不同 = 两份不同的引擎/数据，组局必分叉 → 开局即拒。
        // 旧版对端（无 sched）照旧接纳（兼容）。
        if (m.sched !== undefined && this.sched && m.sched !== this.sched) {
          if (!this.incompatible.has(m.peer)) {
            this.incompatible.add(m.peer);
            console.error(`[lockstep] 对端 ${m.peer} 调度指纹 ${m.sched} ≠ 本端 ${this.sched}（系统序/tickRate 不同）——不与它组局。`);
            this.onIncompatible?.({ peer: m.peer, theirs: m.sched, mine: this.sched });
          }
          break;
        }
        this.lastSeen.set(m.peer, this.now());
        this.recomputeEpoch();
        break;
      case 'bye':
        this.lastSeen.delete(m.peer);
        this.recomputeEpoch();
        break;
      case 'input':
        // 刻意**不按 epoch 过滤**（P0 死锁修复·engine-review-2026-08-04 §3.3）：
        // 成员变化时各端切 epoch 的时刻不同，先切的一方会在对端还没进入新 epoch 时就
        // 广播该 epoch 的输入。旧实现在此丢弃，而发送方 committedInputTick 单调递增、
        // 永不重发 → 后进入者永久缺那几拍；它一卡住，自身 commitLocalInputs 的 target
        // 也不再前进（target = simTick + inputDelay）→ 停止产出新输入 → 两端互等、
        // **永久卡死**（实测：A 停在 2*inputDelay、B 停在 inputDelay）。
        // inputs 本身是 epoch-keyed 的，未知/未来 epoch 的输入照常收下即可——进入该
        // epoch 时正好用上；不属于任何将来 epoch 的桶由 resetEpoch 按上界淘汰。
        this.recordInput(m.epoch, m.tick, m.peer, { dx: m.dx, dy: m.dy, jump: m.jump ?? 0 });
        break;
      case 'hash':
        if (m.epoch === this.epoch) {
          let bt = this.peerHashAt.get(m.tick);
          if (!bt) {
            bt = new Map();
            this.peerHashAt.set(m.tick, bt);
          }
          bt.set(m.peer, m.hash);
          // 落后端视角：对端（领先）hash 先到，等本端拍到 stepTo 再比；
          // 领先端视角：本端 hash 早就记下了，对端 hash 一到**这里立刻比**——旧实现的盲区就在此。
          const mine = this.myHashAt.get(m.tick);
          if (mine !== undefined) this.noteComparable(m.tick, m.peer, mine, m.hash);
        }
        break;
    }
  }

  // ── 输入提交 / 查询 ──
  private commitLocalInputs(): void {
    const target = this.simTick + this.inputDelay;
    while (this.committedInputTick < target) {
      this.committedInputTick++;
      const inp = this.getInput();
      this.recordInput(this.epoch, this.committedInputTick, this.peerId, inp);
      this.channel.post({
        t: 'input',
        peer: this.peerId,
        epoch: this.epoch,
        tick: this.committedInputTick,
        dx: inp.dx,
        dy: inp.dy,
        jump: inp.jump ?? 0,
      });
    }
  }

  /** 淘汰过期 epoch 的输入桶，给「按 epoch 缓存」封上界。
   *  当前 epoch 永不淘汰；其余按插入序（Map 语义）淘汰最旧的，保留最近若干桶——
   *  成员反复抖动（多端进出）时可能同时存在几个「将来可能进入」的 epoch，全清会把
   *  下一个 epoch 的错峰缓存也清掉、把 P0 换个姿势复发；故留窗口而非只留当前。 */
  private pruneInputEpochs(current: string): void {
    if (this.inputs.size <= MAX_INPUT_EPOCHS) return;
    for (const k of [...this.inputs.keys()]) {
      if (this.inputs.size <= MAX_INPUT_EPOCHS) break;
      if (k !== current) this.inputs.delete(k);
    }
  }

  private recordInput(epoch: string, tick: number, peer: string, inp: Dir): void {
    let e = this.inputs.get(epoch);
    if (!e) {
      e = new Map();
      this.inputs.set(epoch, e);
    }
    let bt = e.get(tick);
    if (!bt) {
      bt = new Map();
      e.set(tick, bt);
    }
    bt.set(peer, inp);
  }

  private inputFor(tick: number, peer: string): Dir | undefined {
    if (tick <= this.inputDelay) return { dx: 0, dy: 0, jump: 0 }; // 热身：全员零输入
    return this.inputs.get(this.epoch)?.get(tick)?.get(peer);
  }

  private inputsReady(tick: number): boolean {
    return this.membership.every((p) => this.inputFor(tick, p) !== undefined);
  }

  private stepTo(tick: number): void {
    const cmds: Command[] = [];
    for (const peer of this.membership) {
      const inp = this.inputFor(tick, peer)!;
      cmds.push({ playerId: playerIdForSlot(this.slotOf.get(peer)!), tick, move: { dx: inp.dx, dy: inp.dy }, jump: inp.jump === 1 });
    }
    applyCommands(this.world, cmds);
    this.world.tick();
    this.simTick = tick;
    const hash = hashWorld(this.world); // P2c 增量·同值于 hashSnapshot(snapshot)
    this.myHashAt.set(tick, hash);
    // 落后端视角：对端 hash 已先到、本端刚拍到这一拍 → 立刻比（最近可比拍判定的另一半）。
    const bt = this.peerHashAt.get(tick);
    if (bt) for (const [peer, ph] of bt) this.noteComparable(tick, peer, hash, ph);
    this.pruneHashWindow(tick);
    this.channel.post({ t: 'hash', peer: this.peerId, epoch: this.epoch, tick, hash });
  }

  /** 一拍两端 hash 到齐时的判定汇点。一致 → 记下「真比过」；不一致 → 首次确认即
   *  一次性大声报告（console.error + onDesync 事件），本 epoch 内不重复、不摘牌——
   *  分叉后两个世界只是各玩各的，「后来又相等」大概率是巧合，不能当恢复。 */
  private noteComparable(tick: number, peer: string, myHash: string, peerHash: string): void {
    this.lastComparedTick = this.lastComparedTick === null ? tick : Math.max(this.lastComparedTick, tick);
    if (myHash === peerHash || this.desyncInfo) return;
    this.desyncInfo = { epoch: this.epoch, tick, peer, myHash, peerHash };
    console.error(
      `[lockstep] DESYNC 确认：epoch=${this.epoch} tick=${tick} 本端(${this.peerId})=${myHash} 对端(${peer})=${peerHash}` +
        ' —— 两份世界已分叉，继续推进只是各玩各的；上层应停机/重同步（onDesync 事件已发）。',
    );
    this.onDesync?.(this.desyncInfo);
  }

  /** hash 留存封窗。本端表按拍严格递增插入 → 删到窗口内即止；
   *  对端表多人交错时插入序不保证递增 → 全扫（尺寸本身被窗口封着，全扫恒 ≤ 窗口+乱序余量）。 */
  private pruneHashWindow(tick: number): void {
    const cutoff = tick - HASH_COMPARE_WINDOW;
    for (const k of this.myHashAt.keys()) {
      if (k >= cutoff) break;
      this.myHashAt.delete(k);
    }
    for (const k of [...this.peerHashAt.keys()]) {
      if (k < cutoff) this.peerHashAt.delete(k);
    }
  }
}

function playerIdForSlot(slot: number): string {
  return `p${slot + 1}`;
}

// 缺省世界：俯视 mp-world + 每个 slot 一个玩家（保持原 lockstep 行为，向后兼容）。
function defaultBuildWorld(playerIds: string[]): World {
  const w = buildMpWorld();
  playerIds.forEach((pid, i) => addPlayer(w, i, pid));
  return w;
}
