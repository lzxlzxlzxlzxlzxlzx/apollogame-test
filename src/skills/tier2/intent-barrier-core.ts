import { cmpStr } from '@engine/math/scalar.js';
import type { Component } from '@engine/core/types.js';
import type { Intent, IntentVerbSpec } from '@engine/protocol/agent.js';

// ═══════════════════════════════════════════════════════════════
//  intent-barrier-core —— `t2-intent-barrier` 的**纯函数核**（零 `defineCapability` 调用·零 `IWorld`）。
//
//  这里住着整件事的承重墙：**「给定 pending 列表 + 暂存里有什么，产物是什么」这个函数必须与
//  回包到达次序无关**。把它拆出来的理由不是行数——是它能被直接喂数据断言，
//  而「乱序投递同产物」这条性质若只能经 `new World()` + tick 间接验，反例很难摆干净。
//  形状照 `flow-field-core.ts` / `memory-core.ts` 的先例。
// ═══════════════════════════════════════════════════════════════

/** 收齐门（进 hash 的那一半：全是整数与排好序的 id）。 */
export interface IntentBarrier extends Component {
  readonly type: 'IntentBarrier';
  /** 门 id（一个世界可有多个门·按 id 定位）。 */
  id: string;
  /** `idle` 没开门 · `waiting` 等回包 · `settled` 本拍刚结算（产物在 `resolved`，下一拍自清）。 */
  state: 'idle' | 'waiting' | 'settled';
  /** 本回合待决的实体 id（**登记即排序**·结算按此序产出）。 */
  pending: string[];
  /** 开门时的回合号（整数）。 */
  openedTurn: number;
  /** 超期判据：`now - openedTurn >= deadlineTurns` → 降级结算。0 = 当拍就超期（立即降级）。 */
  deadlineTurns: number;
  /**
   * 当前回合号（由**回合时钟的主人**推进·`setBarrierTurn`）。
   * 缺席 = 没人推 → 退化用本门自己的拍计数（`openedTurn + ticks`）。见 `barrierNow`。
   */
  currentTurn?: number;
  /** 自开门起本系统跑过的拍数（`currentTurn` 缺席时的退化时钟）。 */
  ticks: number;
  /** 动词闭集（纯数据·进门校验用）。空表 = 不校验动词名（只校验 pending 归属）。 */
  verbs: IntentVerbSpec[];
  /** 降级补的默认动词（无着落的 NPC 补它）。 */
  defaultVerb: string;
  /** 结算产物：**按 npcId 升序**的意图流。`settled` 那一拍有效，下一拍自清。 */
  resolved: Intent[];
  /** 哪些 id 是降级补出来的（降级率/链式影响的可观测落点·可断言）。 */
  filled: string[];
  /** 结算时的回合号（-1 = 未结算过）。 */
  settledTurn: number;
  /** 结算时在本实体发此信号（下游 event-when 接）。 */
  settleSignal?: string;
  /** 本端是否权威（缺省 true）。false = 永不自结算，只接 `applySettled`。 */
  authority?: boolean;
}

/** 异步暂存（**不进 hash**·装的是「谁先回包」这种本地事实·已登记 `NON_DETERMINISTIC`）。 */
export interface IntentInbox extends Component {
  readonly type: 'IntentInbox';
  /** 对应门的 id。 */
  id: string;
  /** 已到达的回包（次序随网络·结算前会被排序，故次序不影响产物）。 */
  deliveries: Array<{ npcId: string; intents: Intent[] }>;
  /** 明确失败的（后端报错 / 端口返回空 / 本地判定放弃）。 */
  failures: Array<{ npcId: string; reason: string }>;
}

/** 闭集校验结果。 */
export type IntentCheck = { ok: true } | { ok: false; why: string };

/**
 * 一条意图过不过门。三道：
 * ① 必须是本回合登记过的 id（否则谁都能代别的 NPC 下指令）。
 * ② 动词必须在闭集内（`verbs` 为空表时跳过这道）。
 * ③ 参数个数必须等于该动词声明的 arity（定长标量·framework §2.2），且数字参数必须有限。
 */
export function checkIntent(b: IntentBarrier, intent: Intent): IntentCheck {
  if (!b.pending.includes(intent.npcId)) return { ok: false, why: 'not-pending' };
  if (b.verbs.length > 0) {
    const spec = b.verbs.find((v) => v.verb === intent.verb);
    if (!spec) return { ok: false, why: 'verb-not-in-set' };
    const want = Math.trunc(spec.arity ?? 0);
    const got = intent.args?.length ?? 0;
    if (got !== want) return { ok: false, why: `arity ${got}≠${want}` };
  }
  for (const a of intent.args ?? []) {
    if (typeof a === 'number' && !Number.isFinite(a)) return { ok: false, why: 'arg-not-finite' };
  }
  return { ok: true };
}

/** 结算用的中间态。 */
export interface SettleDraft {
  resolved: Intent[];
  filled: string[];
  rejected: number;
}

/**
 * 由「pending + 暂存内容」算出结算产物（**这就是承重墙**）。
 * · 产出序**只由 `b.pending` 决定**（它开门时已排好），绝不由「谁先回包」决定。
 * · 投递先按 npcId 排序再处理；同一 id 多次投递 **先到的那次算**，后到的整批拒收——
 *   取「后到覆盖」会让结果依赖到达次序，正是本件要消灭的东西。
 */
export function draftSettle(b: IntentBarrier, inbox: IntentInbox | undefined, now: number): SettleDraft {
  const accepted = new Map<string, Intent[]>();
  let rejected = 0;
  const sorted = [...(inbox?.deliveries ?? [])].sort((x, y) => cmpStr(x.npcId, y.npcId));
  for (const d of sorted) {
    if (accepted.has(d.npcId)) { rejected += d.intents.length; continue; }
    const ok: Intent[] = [];
    for (const it of d.intents) {
      const verdict = checkIntent(b, { ...it, npcId: d.npcId });
      if (verdict.ok) ok.push({ npcId: d.npcId, verb: it.verb, args: it.args, turn: it.turn });
      else rejected += 1;
    }
    if (ok.length > 0) accepted.set(d.npcId, ok);
  }
  const resolved: Intent[] = [];
  const filled: string[] = [];
  for (const npcId of b.pending) {
    const got = accepted.get(npcId);
    if (got && got.length > 0) { resolved.push(...got); continue; }
    resolved.push({ npcId, verb: b.defaultVerb, turn: now });
    filled.push(npcId);
  }
  return { resolved, filled, rejected };
}

/** 每个 pending 都有着落了吗（有效回包 或 明确失败）——收齐判据，与超期判据并列。 */
export function allAccountedFor(b: IntentBarrier, inbox: IntentInbox | undefined): boolean {
  if (!inbox) return false;
  const seen = new Set<string>();
  for (const d of inbox.deliveries) seen.add(d.npcId);
  for (const f of inbox.failures) seen.add(f.npcId);
  return b.pending.every((id) => seen.has(id));
}

/** 登记序归一：去重 + 按 id 升序（产出序就是它，排序这件事绝不能留到结算时再说）。 */
export function normalizePending(npcIds: readonly string[]): string[] {
  return [...new Set(npcIds)].sort(cmpStr);
}

/**
 * 门当前的回合号（**纯函数·全整数·零墙钟**）。
 *
 * 两条路，没有第三条：
 * ① 有人推过回合（`currentTurn` 在场）→ 就用它。推的人是**回合时钟的主人**（宿主/驱动代码），
 *    不是本门。门去别处「读回合号」曾是个真缺陷：首版 `reads: ['TurnOrder']`，于是
 *    「写 Signal + 读 TurnOrder」与 `turn-order` 的「读 Signal + 写 TurnOrder」互为前驱 → **真 2-环**，
 *    严格模式当场抛；而生产缺省只告警，落序交字典序平局裁决（那次恰好排对，纯属碰巧）。
 *    把时钟交给主人之后那条读边消失，2-环随之消失。
 * ② 没人推 → 退化成本门自己数的拍数。无回合概念的游戏照样能用。
 *
 * **别把这条当成「脱离了全库软环 blob」**：本系统仍在 p0 那个 blob 里（SCC 基线点名有它），
 * 原因与 turn-order / keybind / clickable 同款——`runsAfter event-when` 是入边、`writes Signal` 是出边，
 * 任何「排在事件清扫之后且发信号」的系统都必然落进去。那是 CYCLEHAZ 的类问题，不是本件能治的。
 */
export function barrierNow(b: IntentBarrier): number {
  return b.currentTurn ?? (b.openedTurn + b.ticks);
}

/** 意图流按 npcId 升序（`applySettled` 落地广播结果时用·顺序只由内容决定）。 */
export function orderIntents(intents: readonly Intent[]): Intent[] {
  return [...intents].sort((x, y) => cmpStr(x.npcId, y.npcId));
}
