// game111《小都会》—— 世界 = 纯数据（WorldBlueprint）。**本目录零专属系统代码。**
//
//   回合推进   = turn 资源 + t2-turn-order（NPC 轮转）——由 turn-driver 在 sim 外推进（同 net/commands 的地位）
//   需求衰减   = 每个需求一实体：Resource + t2-over-time（amountPerTick 负值·period=TICKS_PER_TURN）
//   NPC 所在地 = j1-state（分区 = 状态）→ 故 move_to 落地 = set-state，零自定义组件
//   记忆       = t2-memory（MemoryRules 逐标签衰减 + share 打折 = 链式影响载体）
//   外部决策   = NpcAgentPort（sim 外）→ t2-intent-barrier（收齐·排序·超期降级）
//                → **QueuedInputSource → net/applyCommands → t2-keybind → Signal → t2-effect-apply**
//                这条尾巴不是绕路，而是本作的架构论点在代码上的落点：**LLM NPC 与远端人类玩家同构**，
//                走的是同一条 `InputSource → 按 id 排序 → 应用` 的路（framework.md §1.2）。
//                宿主**不许**直接往世界里塞 Signal——`event-when` 每拍开头清全场 Signal，拍间塞的必被清掉；
//                而 keybind 申报了 `runsAfter event-when`，是数据驱动的合法入口。
//   称号       = t2-event-when(好感度 gte·edge) → t2-effect-apply(set-flag)——「NPC 给的」不是系统发的
//
// **意图落地没有解释器**：driver 发 `intentSignal(npc,verb,args)` 名字的信号，本文件预先展开好的 Effect
// 实体接住它（`intentEffectEntities`）。表展开 ≠ 解释器——同 game-103 的 `ringSpawnerEntities()`。
//
// 能力总览：docs/design/game111/capability-plan.md。
//
// ⚠ **引擎侧缺口（已报·非本层可修）**：`src/assembly/component-map.ts` 的 `ComponentDataMap` 尚未登记
// `TurnOrder` / `Memory` / `MemoryRules` / `IntentBarrier` / `IntentInbox` 五型，故它们**不能写进 blueprint**。
// 本版改走引擎自己的运行时挂载路径（`openBarrier` / `remember` 自建组件 + `setupTown` 补两型），
// 语义等价。`component-map.ts` 属跨游戏共享面 = 🔴 主程域，本层不自行改动（CLAUDE.md 施工归属第 1 条）。
//
// ⚠ **与 plan §3 的一处偏差（记债·非默许）**：plan 写「回合七相位 = t3-flow」。本版只用 GameFlow 承载
// 粗粒度世界态（setup→living），**七相位未摊开**——因为 `INTENT` 相位要等异步回包，把它并进 flow 会让
// flow 与 barrier 互为前驱，正是 🔴 主程面那类「一放 Update 就闭合成环、而 topological-sort 只告警不抛」
// 的坑（CLAUDE.md ENG-02/03 实证）。摊开前需主程给定序结论。偏差已记 docs/design/game111/impl-notes.md。
import type { WorldBlueprint, EntityBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import {
  resourceCapability, flagCapability, stateCapability, stringVariableCapability,
  relationCapability, randomCapability, textCapability,
} from '@zerocraft/engine/atom-skills/index.js';
import {
  eventWhenCapability, effectApplyCapability, overTimeCapability, keybindCapability,
  turnOrderCapability, memoryCapability, intentBarrierCapability,
} from '@zerocraft/engine/skills/tier2/index.js';
import {
  NPCS, NEEDS, ZONES, ZONE_IDS, NPC_IDS, TITLES, INTENT_VERBS, MEMORY_DECAY, TOPICS,
  TICKS_PER_TURN, SHARE_DISCOUNT, MEMORY_MAX, FORGET_BELOW, DEFAULT_VERB,
  BARRIER_ID, MEMORY_RULES_ID, TURN_RESOURCE, MAX_TURNS,
  needId, zoneFsm, affinityId, titleFlag, intentSignal, saySignal,
} from './world-data.js';

/** 一次 rest 回多少精力 / 一次 observe 回多少好奇心 / 一次 talk 回多少社交欲（纯数据·手感调校面）。 */
export const REST_ENERGY = 25;
export const OBSERVE_CURIOSITY = 20;
export const TALK_SOCIAL = 18;
/** 搭话/闲逛顺带回的心情（同一个信号挂第二条 Effect·order 定序·纯数据）。 */
export const SIDE_MOOD = 6;

// ── 每个 NPC 的需求实体（Resource + OverTime 各一实体·组件模型每型一份）────────
function needEntities(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (const npc of NPCS) {
    for (const need of NEEDS) {
      out[`need-${npc.id}-${need.key}`] = {
        Resource: { id: needId(npc.id, need.key), current: need.start, min: 0, max: need.max },
        // 衰减 = 负增量。duration<=0 = 永久（世界一直在转）。
        OverTime: {
          effects: [{
            id: `decay-${need.key}`,
            resource: needId(npc.id, need.key),
            amountPerTick: -need.decay,
            period: TICKS_PER_TURN,
            duration: 0,
            elapsed: 0,
          }],
        },
      };
    }
  }
  return out;
}

// ── 每个 NPC 的本体：所在分区(State) · 记忆(Memory) · 对玩家好感度(Resource) ────
function npcEntities(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (const npc of NPCS) {
    out[`npc-${npc.id}`] = {
      State: { fsmId: zoneFsm(npc.id), current: npc.homeZone, previous: npc.homeZone },
      Text: { content: '' }, // NPC 当前台词（表现层读·L4 由端口回填）
      // Memory 由 `remember()` 首次记账时自建（引擎既有路径）。
    };
    out[`aff-${npc.id}`] = { Resource: { id: affinityId(npc.id), current: 0, min: 0, max: 100 } };
  }
  return out;
}

// ── 意图 → Effect 的**预展开表**（笛卡尔积·纯数据·零解释器）──────────────────
function intentEffectEntities(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (const npc of NPC_IDS) {
    // move_to(zone)：分区 = 状态 → set-state
    for (const zone of ZONE_IDS) {
      const sig = intentSignal(npc, 'move_to', [zone]);
      out[`kb-${npc}-move-${zone}`] = { KeyBinding: { key: sig, signal: sig, phase: 'action' } };
      out[`fx-${npc}-move-${zone}`] = {
        Effect: { onSignal: sig, kind: 'set-state', targetId: zoneFsm(npc), value: zone },
      };
    }
    // talk_to(other)：搭话回社交欲
    for (const other of NPC_IDS) {
      if (other === npc) continue;
      const sig = intentSignal(npc, 'talk_to', [other]);
      out[`kb-${npc}-talk-${other}`] = { KeyBinding: { key: sig, signal: sig, phase: 'action' } };
      out[`fx-${npc}-talk-${other}`] = {
        Effect: { onSignal: sig, kind: 'modify-resource', targetId: needId(npc, 'social'), op: 'add', value: TALK_SOCIAL, order: 0 },
      };
      out[`fx-${npc}-talk-${other}-mood`] = {
        Effect: { onSignal: sig, kind: 'modify-resource', targetId: needId(npc, 'mood'), op: 'add', value: SIDE_MOOD, order: 1 },
      };
    }
    // rest / observe：无参
    for (const [verb, res, amt] of [['rest', 'energy', REST_ENERGY], ['observe', 'curiosity', OBSERVE_CURIOSITY]] as const) {
      const sig = intentSignal(npc, verb);
      out[`kb-${npc}-${verb}`] = { KeyBinding: { key: sig, signal: sig, phase: 'action' } };
      out[`fx-${npc}-${verb}`] = {
        Effect: { onSignal: sig, kind: 'modify-resource', targetId: needId(npc, res), op: 'add', value: amt, order: 0 },
      };
      out[`fx-${npc}-${verb}-mood`] = {
        Effect: { onSignal: sig, kind: 'modify-resource', targetId: needId(npc, 'mood'), op: 'add', value: SIDE_MOOD, order: 1 },
      };
    }
  }
  return out;
}

// ── 玩家说话 → 好感度（**与 NPC 意图同一条输入路径**·预展开表·零解释器）────────
// 引擎眼里玩家和 LLM 没有区别：两者都只能发具名动作，都经 keybind 变信号，都由 Effect 落地。
// 这不是巧合，正是 framework §1.2 的论点——写代码时它就长这样。
function sayEffectEntities(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (const npc of NPC_IDS) {
    for (const t of TOPICS) {
      const sig = saySignal(npc, t.id);
      out[`kb-say-${npc}-${t.id}`] = { KeyBinding: { key: sig, signal: sig, phase: 'action' } };
      out[`fx-say-${npc}-${t.id}`] = {
        Effect: { onSignal: sig, kind: 'modify-resource', targetId: affinityId(npc), op: 'add', value: t.affinity, order: 0 },
      };
      // 说话也让对方心情好一点（顺带效果·同一信号挂第二条 Effect）。
      out[`fx-say-${npc}-${t.id}-mood`] = {
        Effect: { onSignal: sig, kind: 'modify-resource', targetId: needId(npc, 'mood'), op: 'add', value: 4, order: 1 },
      };
    }
  }
  return out;
}

// ── 称号：好感度达标(edge) → 置解锁旗。归属具体 NPC（framework §5.1 铁律）──────
function titleEntities(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (const t of TITLES) {
    out[`title-${t.id}`] = { Flag: { id: titleFlag(t.id), active: false } };
    out[`title-gate-${t.id}`] = {
      EventWhen: {
        signal: `unlock:${t.id}`,
        when: { kind: 'resource', id: affinityId(t.byNpc), cmp: 'gte', value: t.minAffinity },
        mode: 'edge', armed: false,
      },
    };
    out[`title-fx-${t.id}`] = {
      Effect: { onSignal: `unlock:${t.id}`, kind: 'set-flag', targetId: titleFlag(t.id), value: true },
    };
  }
  return out;
}

export function buildBlueprint(seed = 111): WorldBlueprint {
  const entities: Record<string, EntityBlueprint> = {
    // ── 世界单例 ──
    world: {
      RandomSeed: { seed, state: seed >>> 0 },
      Resource: { id: TURN_RESOURCE, current: 0, min: 0, max: MAX_TURNS },
      StringVar: { id: 'phase', value: 'setup' },
    },




    // ── 回合节拍：宿主发这两个具名动作，keybind 转成 sim 内信号 ──
    // 宿主**不许**直接塞 Signal（event-when 每拍开头清全场），走 keybind 是唯一合法入口。
    'kb-turn-advance': { KeyBinding: { key: 'turn:advance', signal: 'turn:advance', phase: 'action' } },
    'fx-turn-advance': { Effect: { onSignal: 'turn:advance', kind: 'modify-resource', targetId: TURN_RESOURCE, op: 'add', value: 1 } },
    // 记忆衰减：MemoryRules.decaySignal = 'turn:decay'，一回合恰好一次。
    'kb-turn-decay': { KeyBinding: { key: 'turn:decay', signal: 'turn:decay', phase: 'action' } },

    ...needEntities(),
    ...npcEntities(),
    ...intentEffectEntities(),
    ...sayEffectEntities(),
    ...titleEntities(),
  };

  return {
    capabilities: [
      resourceCapability, flagCapability, stateCapability, stringVariableCapability,
      relationCapability, randomCapability, textCapability,
      eventWhenCapability, effectApplyCapability, overTimeCapability, keybindCapability,
      turnOrderCapability, memoryCapability, intentBarrierCapability,
    ],
    entities,
    meta: { tickRate: 1 },
  };
}

/** 分区 id → 名称（表现层/prompt 用·查表不是逻辑）。 */
export const ZONE_NAME: Readonly<Record<string, string>> =
  Object.fromEntries(ZONES.map((z) => [z.id, z.name]));

// ═══════════════════════════════════════════════════════════════
//  宿主层装配（sim 外·契约明许，同 game-103 的 mount/host 地位）
//
//  为什么这四型不在 blueprint 里：见文件头「引擎侧缺口」。这里走的是引擎**自己的**挂载路径：
//  `openBarrier` 建 IntentBarrier、`remember` 首次记账时建 Memory；只剩 MemoryRules / TurnOrder
//  两型用 addComponent 补。零自造语义。
// ═══════════════════════════════════════════════════════════════
import type { IWorld } from '@zerocraft/engine/engine/core/types.js';
import { openBarrier } from '@zerocraft/engine/skills/tier2/intent-barrier.js';

/** 把 blueprint 装不下的四型补齐，并开第一道门。返回本回合待决的 NPC 实体 id。 */
export function setupTown(world: IWorld, turn = 0): void {
  world.createEntity('memory-rules');
  world.addComponent('memory-rules', {
    type: 'MemoryRules',
    id: MEMORY_RULES_ID,
    decay: [...MEMORY_DECAY],
    defaultDecay: 4,
    forgetBelow: FORGET_BELOW,
    max: MEMORY_MAX,
    shareDiscount: SHARE_DISCOUNT,
    decaySignal: 'turn:decay', // 回合制：一回合恰好衰减一次，由 driver 发
  });

  world.createEntity('rotation');
  world.addComponent('rotation', {
    type: 'TurnOrder',
    id: 'npc-rotation',
    order: NPC_IDS.map((id) => `npc-${id}`),
    current: 0,
    round: 1,
    direction: 1,
    advanceSignal: 'npc:advance',
    changedSignal: 'npc:changed',
    roundSignal: 'town:round',
  });

  world.createEntity('barrier');
  openBarrier(world, 'barrier', {
    id: BARRIER_ID,
    npcIds: [],
    turn,
    deadlineTurns: 1, // 等一个回合，超期就降级补 DEFAULT_VERB
    defaultVerb: DEFAULT_VERB,
    verbs: INTENT_VERBS,
    settleSignal: 'intents:settled',
    authority: true,
  });
}
