import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import type { IWorld } from '@engine/core/types.js';
import type { Signal } from '@engine/protocol/components.js';
import type { Intent, IntentVerbSpec } from '@engine/protocol/agent.js';
import { findDebugTrace, appendTrace } from '../debug-trace.js';
import {
  allAccountedFor, barrierNow, draftSettle, normalizePending, orderIntents,
  type IntentBarrier, type IntentInbox,
} from './intent-barrier-core.js';

// ═══════════════════════════════════════════════════════════════
//  t2-intent-barrier —— 异步意图收齐门（REQ-111-AINPC · owner 2026-09-12 判 A · 与 NpcAgentPort 捆绑）
//
//  **这格是整条「外部 AI → 确定性 sim」链上唯一会污染确定性的地方。** 回包次序由网络抖动决定：
//  按到达序应用 → 每次跑出的世界都不同 → 存档 / 录放 / lockstep 全废，症状是「偶发 desync /
//  存档读出来不一样」，本仓最难查的 bug 形状。`net/commands.ts` 的铁律（「应用前一律按 playerId
//  排序——顺序只由内容决定，与网络到达次序无关」）就是为这件事写的，但它没覆盖「回包迟到 / 失败」。
//  实查：`tier3/flow` 管相位跳转但不等异步回包；`net/lockstep.ts` 的 barrier 等的是**同步到达的对端命令**
//  不是 Promise。两者之间缺这一格。
//
//  三件事：① **登记**本回合待决的 N 个实体 → ② **收**乱序回包进 `IntentInbox` →
//  ③ **结**：pending 全有着落或超期，一次性产出 `resolved`（按 npcId 升序），没着落的补 `defaultVerb` 并记进 `filled`。
//  **判定逻辑全在 `intent-barrier-core.ts`**（纯函数核）：闭集校验 / 结算产物 / 收齐判据。本文件只剩读写世界 + 系统声明。
//
//  ── 确定性红线（🔴 本件进 hash）────────────────────────────────────────
//  · **超期判据是整数回合数，零墙钟、零浮点**（`debug-trace` 红线②同源：回放要对得上）。回合号由
//    **回合时钟的主人**用 `setBarrierTurn` 推进；没人推就退化成本门自己数的拍数。两条都是整数自增，
//    没有第三条。**门刻意不自己去读 `TurnOrder`**——首版那么写，被全库 SCC 棘轮咬住，经过记在系统声明处。
//  · **产物与到达次序无关**：只由「pending 列表 + 每个 id 拿到了什么」决定（`intent-barrier-core.test.ts`
//    拿全排列钉死，`intent-barrier.test.ts` 再钉一遍 hash）。
//  · **`IntentInbox` 必须登记 `NON_DETERMINISTIC`**。它装的是「谁先回包」这种本地事实，进 hash 就是
//    把网络抖动焊进指纹。`determinism.ts` 原文：「名单靠手维护，拼错一个名字即静默失效
//    ——多算→误报 desync，少算→假绿」。测试对着那份名单直接断言。
//  · **lockstep：门只在权威端自结算。** 非权威端挂 `authority:false`——永不自己结算，只接权威端广播来的
//    结果（`applySettled`，经 `net/commands` 同一条路进来）。少了这条，两端各自等各自的回包：
//    权威端收到真意图、对端全部超期补默认 → 第一回合就分叉，**而两端各自全绿**。
//
//  定序：跑在 `Update`，`runsAfter event-when`（它每拍开头清全场 Signal）。不申报任何 `runsBefore`——
//  门对外只有一条出边（写 Signal），不与任何系统互为前驱，落序不依赖平局裁决（经过见系统声明处）。
// ═══════════════════════════════════════════════════════════════

export type { IntentBarrier, IntentInbox, IntentCheck, SettleDraft } from './intent-barrier-core.js';
export { checkIntent, draftSettle, allAccountedFor, normalizePending, orderIntents, barrierNow } from './intent-barrier-core.js';

/** 取某个 id 的门（找不到 → undefined）。 */
export function findBarrier(world: IWorld, barrierId: string): { eid: string; b: IntentBarrier } | undefined {
  for (const eid of sortedIds(world, 'IntentBarrier')) {
    const b = world.getComponent<IntentBarrier>(eid, 'IntentBarrier');
    if (b && b.id === barrierId) return { eid, b };
  }
  return undefined;
}

function inboxOf(world: IWorld, eid: string, barrierId: string): IntentInbox {
  const existing = world.getComponent<IntentInbox>(eid, 'IntentInbox');
  if (existing) return existing;
  world.addComponent<IntentInbox>(eid, { type: 'IntentInbox', id: barrierId, deliveries: [], failures: [] });
  return world.getComponent<IntentInbox>(eid, 'IntentInbox')!;
}

export interface OpenBarrierSpec {
  id: string;
  /** 本回合待决的实体 id（内部会去重 + 排序）。 */
  npcIds: readonly string[];
  /** 当前回合号（整数）。 */
  turn: number;
  /** 超期前最多等几个回合（缺省 1·0 = 当拍就降级）。 */
  deadlineTurns?: number;
  /** 降级动词（缺省 `'rest'`）。 */
  defaultVerb?: string;
  /** 动词闭集（缺省空表 = 不校验动词名）。 */
  verbs?: readonly IntentVerbSpec[];
  settleSignal?: string;
  authority?: boolean;
}

/** 开门：把本回合待决的 id 登记进去（已有同 id 的门则重置它，连暂存一起清）。 */
export function openBarrier(world: IWorld, entityId: string, spec: OpenBarrierSpec): IntentBarrier {
  const pending = normalizePending(spec.npcIds);
  world.addComponent<IntentBarrier>(entityId, {
    type: 'IntentBarrier',
    id: spec.id,
    state: pending.length === 0 ? 'idle' : 'waiting',
    pending,
    openedTurn: Math.trunc(spec.turn),
    deadlineTurns: Math.max(0, Math.trunc(spec.deadlineTurns ?? 1)),
    ticks: 0,
    verbs: [...(spec.verbs ?? [])],
    defaultVerb: spec.defaultVerb ?? 'rest',
    resolved: [],
    filled: [],
    settledTurn: -1,
    settleSignal: spec.settleSignal,
    authority: spec.authority,
  });
  const inbox = world.getComponent<IntentInbox>(entityId, 'IntentInbox');
  if (inbox) { inbox.deliveries = []; inbox.failures = []; }
  return world.getComponent<IntentBarrier>(entityId, 'IntentBarrier')!;
}

/**
 * 回包到了（**异步侧唯一入口**·随便什么次序调都行）。
 * 只往暂存里放，不做任何裁决——校验与排序统一在结算那一刻做，免得「什么时候校验」本身成为次序依赖。
 * 门不在 / 不在 waiting → 丢弃并返回 false（调用方据此知道回包迟到了整整一个回合）。
 */
export function deliverIntents(world: IWorld, barrierId: string, npcId: string, intents: readonly Intent[]): boolean {
  const found = findBarrier(world, barrierId);
  if (!found || found.b.state !== 'waiting') return false;
  inboxOf(world, found.eid, barrierId).deliveries.push({ npcId, intents: [...intents] });
  return true;
}

/** 回包失败（后端挂 / 超时 / 端口返回空）。记下来，结算时该 id 走降级补默认动词。 */
export function failIntents(world: IWorld, barrierId: string, npcId: string, reason: string): boolean {
  const found = findBarrier(world, barrierId);
  if (!found || found.b.state !== 'waiting') return false;
  inboxOf(world, found.eid, barrierId).failures.push({ npcId, reason });
  return true;
}

/**
 * 非权威端落地权威端广播来的结果（lockstep 用）。
 * 不做二次校验：这份结果已在权威端过过门，两端各校验一次只会在「两端闭集表不同」时悄悄分叉——
 * 那种情况该由 manifest 指纹去拦，不该由这里各自裁决。
 */
export function applySettled(world: IWorld, barrierId: string, intents: readonly Intent[], turn: number): boolean {
  const found = findBarrier(world, barrierId);
  if (!found) return false;
  const b = found.b;
  b.resolved = orderIntents(intents);
  b.filled = [];
  b.state = 'settled';
  b.settledTurn = Math.trunc(turn);
  return true;
}

/**
 * 推进门的回合号（**回合时钟的主人调**：宿主 / 驱动代码在每个回合边界调一次）。
 * 门自己不去别处读回合号——理由见 `barrierNow` 的注释（那条读边会把本门拖进全库软环 blob）。
 * 门不在 → false。
 */
export function setBarrierTurn(world: IWorld, barrierId: string, turn: number): boolean {
  const found = findBarrier(world, barrierId);
  if (!found) return false;
  found.b.currentTurn = Math.trunc(turn);
  return true;
}

const INTENT_SCHEMA = t.obj({ npcId: t.str(), verb: t.str(), args: t.opt(t.arr(t.union([t.str(), t.num()]))), turn: t.num() });

export const intentBarrierCapability = defineCapability({
  id: 't2-intent-barrier',
  version: '1.0.0',

  describe: {
    name: 'intent-barrier',
    summary: '异步意图收齐门：登记本回合待决实体 → 乱序回包进暂存 → 收齐或按整数回合数超期 → 按 id 升序一次性产出意图流，没着落的补默认动词。',
    semantic: ['tier2', 'npc', 'async', 'determinism', 'lockstep', 'intent'],
    whenToUse:
      '外部异步决策者（LLM / 远端服务 / 云校验）要把结果喂进确定性 sim：openBarrier() 登记待决 id，异步侧 deliverIntents()/failIntents() 随便什么次序回包，系统在收齐或超期时产出 IntentBarrier.resolved（按 id 升序）。回包迟到/失败 → 补 defaultVerb 并记进 filled。回合号由 setBarrierTurn() 推（不推则按拍计数）。非权威端挂 authority:false + applySettled() 接广播结果。',
    examples: [
      'openBarrier(world,"town",{ id:"turn-intents", npcIds:["npc-b","npc-a"], turn:7, deadlineTurns:2, defaultVerb:"rest", verbs:[{verb:"move_to",arity:1},{verb:"rest"}], settleSignal:"intentsReady" })',
      'setBarrierTurn(world,"turn-intents",8) → 回合时钟的主人在回合边界推一次；不推则按拍计数退化',
      'deliverIntents(world,"turn-intents","npc-a",[{ npcId:"npc-a", verb:"move_to", args:["zone-lib"], turn:7 }])',
      'failIntents(world,"turn-intents","npc-b","http 503") → 结算时 npc-b 补 rest 并进 filled',
      '闭集外动词 {verb:"hack_world"} → 拒收并记一条 reject（什么都没发生的分支必须留痕）',
    ],
  },

  components: {
    provides: {
      IntentBarrier: {
        category: 'config',
        describe: '收齐门：pending(排好序) + 整数回合判据 + 动词闭集 + 结算产物 resolved/filled。进 hash。',
        fields: {
          id: { type: 'string', describe: '门 id' },
          state: { type: 'string', describe: 'idle | waiting | settled' },
          pending: { type: 'string[]', describe: '本回合待决实体 id（登记即排序）' },
          openedTurn: { type: 'number', describe: '开门时回合号（整数）' },
          deadlineTurns: { type: 'number', describe: '最多等几个回合（0 = 当拍降级）' },
          currentTurn: { type: 'number', describe: '当前回合号（由 setBarrierTurn 推·缺席则退化用拍计数）' },
          ticks: { type: 'number', describe: '开门后跑过的拍数（currentTurn 缺席时的退化时钟）' },
          verbs: { type: 'string[]', describe: 'IntentVerbSpec[]：[{verb,arity?}] 动词闭集' },
          defaultVerb: { type: 'string', describe: '降级补的动词' },
          resolved: { type: 'string[]', describe: 'Intent[]：结算产物（按 npcId 升序·settled 那一拍有效）' },
          filled: { type: 'string[]', describe: '降级补出来的 id（可断言的降级率落点）' },
          settledTurn: { type: 'number', describe: '结算时回合号（-1 未结算）' },
          settleSignal: { type: 'string', describe: '结算时发此信号' },
          authority: { type: 'boolean', describe: 'false = 非权威端·永不自结算，只接 applySettled' },
        },
        schema: t.obj({
          id: t.str(),
          state: t.enum(['idle', 'waiting', 'settled'] as const),
          pending: t.arr(t.str()),
          openedTurn: t.num(), deadlineTurns: t.num(), ticks: t.num(),
          currentTurn: t.opt(t.num()),
          verbs: t.arr(t.obj({ verb: t.str(), arity: t.opt(t.num()) })),
          defaultVerb: t.str(),
          resolved: t.arr(INTENT_SCHEMA),
          filled: t.arr(t.str()),
          settledTurn: t.num(),
          settleSignal: t.opt(t.str()),
          authority: t.opt(t.bool()),
        }),
      },
      IntentInbox: {
        category: 'effect',
        describe: '异步回包暂存（**不进 hash**·已登记 NON_DETERMINISTIC）：装「谁先回包」这种本地事实。',
        fields: {
          id: { type: 'string', describe: '对应门 id' },
          deliveries: { type: 'string[]', describe: '[{npcId,intents}]：已到达的回包（次序随网络）' },
          failures: { type: 'string[]', describe: '[{npcId,reason}]：明确失败的' },
        },
        schema: t.obj({
          id: t.str(),
          deliveries: t.arr(t.obj({ npcId: t.str(), intents: t.arr(INTENT_SCHEMA) })),
          failures: t.arr(t.obj({ npcId: t.str(), reason: t.str() })),
        }),
      },
    },
    reads: ['IntentBarrier', 'IntentInbox'],
    writes: ['IntentBarrier', 'IntentInbox', 'Signal'],
    consumes: [],
  },

  config: {
    deadlineTurns: { type: 'number', default: 1, describe: '超期回合数', question: '最多等几个回合就不等了？', ui: { control: 'input' } },
    defaultVerb: { type: 'string', default: 'rest', describe: '降级动词', question: '没拿到决策时让它做什么？', ui: { control: 'input' } },
  },

  systems: [
    {
      id: 'intent-barrier',
      // 发信号的系统一律排在 event-when 之后（它每拍开头清全场 Signal）。
      runsAfter: ['event-when'],
      // **这里刻意不申报任何 runsBefore**，而且是改过一版才变成这样的，经过值得记下（两条结论，别混）：
      // ① 首版让门自己读 `TurnOrder.round` 当回合号 → `reads:['TurnOrder']` + `writes:['Signal']`，
      //    与 turn-order 的 `reads:['Signal']` + `writes:['TurnOrder']` 互为前驱 → **真 2-环**。
      //    第一版修法是补 `runsBefore:['turn-order']` 压掉反向推断边，单文件定序测试因此全绿；
      //    但那只是压住环，没去掉成因。治本 = 把读边去掉：回合号交给回合时钟的主人用 `setBarrierTurn`
      //    推进（见 `barrierNow`）。读边一去，2-环没了，显式边也就不必要了——落序不再依赖平局裁决。
      // ② **但本系统仍在 p0 那个全库软环 blob 里**（SCC 基线点名有它·一开始我判错过这点）。
      //    入边 = `runsAfter event-when`（环内来），出边 = `writes Signal`（去环内所有读 Signal 的系统）。
      //    turn-order / keybind / clickable 进去的也是同一个形状：凡「排在事件清扫之后且发信号」必然在里面。
      //    那是 CYCLEHAZ 的类问题（正解是方案 C 相位化），不是本件的申报缺陷，故按棘轮纪律更新基线并留理由。
      reads: ['IntentBarrier', 'IntentInbox'],
      writes: ['IntentBarrier', 'IntentInbox', 'Signal'],
      consumes: [],
      execute(world: IWorld) {
        const gates = sortedIds(world, 'IntentBarrier');
        if (gates.length === 0) return;
        const trace = findDebugTrace(world);
        const tk = trace?.tick ?? 0;

        for (const eid of gates) {
          const b = world.getComponent<IntentBarrier>(eid, 'IntentBarrier');
          if (!b) continue;

          // 上一拍结算过 → 产物只活一拍（同 Signal 的口径），本拍收走。
          if (b.state === 'settled') {
            b.state = 'idle';
            b.resolved = [];
            b.filled = [];
            continue;
          }
          if (b.state !== 'waiting') continue;

          b.ticks += 1;
          const now = barrierNow(b);
          const inbox = world.getComponent<IntentInbox>(eid, 'IntentInbox');

          if (b.authority === false) continue;   // 非权威端永不自结算（见文件头 lockstep 红线）

          const complete = allAccountedFor(b, inbox);
          const expired = now - b.openedTurn >= b.deadlineTurns;
          if (!complete && !expired) continue;

          const draft = draftSettle(b, inbox, now);
          b.resolved = draft.resolved;
          b.filled = draft.filled;
          b.state = 'settled';
          b.settledTurn = now;
          if (inbox) { inbox.deliveries = []; inbox.failures = []; }
          if (b.settleSignal) world.addComponent<Signal>(eid, { type: 'Signal', name: b.settleSignal, source: eid });

          // 密度：每拍 ≤3 条。拒收单独一条（「什么都没发生」的分支必须记）。
          if (draft.rejected > 0) appendTrace(trace, tk, 'intent-barrier', 'reject', `${b.id} 拒收 ${draft.rejected} 条`, complete ? 'complete' : 'expired');
          appendTrace(trace, tk, 'intent-barrier', 'transition', `${b.id} waiting→settled`, complete ? `turn=${now}·收齐` : `turn=${now}·超期(${b.deadlineTurns})`);
          appendTrace(trace, tk, 'intent-barrier', 'commit', `${b.id} resolved=${draft.resolved.length}`, draft.filled.length > 0 ? `filled=${draft.filled.join(',')}` : undefined);
        }
      },
    },
  ],
});
