// game111 —— 回合驱动（**宿主层·sim 之外**，与 `net/commands` 的地位相同；契约明许，零玩法规则）。
//
// 它做的全部事情是「把异步的外部决策，按确定性的次序喂进 sim」——规则本身一条都不在这里：
// 需求怎么衰减在 `MemoryRules`/`OverTime` 数据里，意图落地在预展开的 `KeyBinding`+`Effect` 表里，
// 收齐/排序/超期降级在引擎件 `t2-intent-barrier` 里。本文件只负责**次序与传话**。
//
// 一个回合的六步（framework.md §4.2 的相位，在宿主侧摊开）：
//   ① TURN_START   turn +1（具名动作 → keybind → Effect）
//   ② PERCEIVE     为每个 L4+ NPC 填 AgentContext（只读切片）
//   ③ INTENT       并发调端口 → deliverIntents / failIntents（**乱序回包随便来**）
//   ④ COMMIT       步进 → barrier 收齐或超期 → resolved（按 npcId 升序）
//   ⑤ APPLY        resolved → 具名动作入输入队列 → applyCommands → keybind → Effect 落地
//   ⑥ SETTLE       记忆入账 + 发衰减信号（**账期在此**：本回合的事下回合才读得到）
//
// 两处坑的封法（`docs/playbooks/opponent-ai.md` 八件坑·capability-plan §4.65 已申报）：
// · **坑① 定手窗**：③ 只开一次，④ 之后当回合不再收意图——NPC 不能在别人行动之后改主意。
// · **坑② 账期**：记忆入账在 ⑥，而 ② 的感知发生在它之前——NPC 读不到自己本回合刚做的事（自我喂招）。
import type { World } from '@zerocraft/engine/engine/core/world.js';
import type { Intent, NpcAgentPort } from '@zerocraft/engine/engine/protocol/agent.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import {
  openBarrier, deliverIntents, failIntents, setBarrierTurn, findBarrier,
} from '@zerocraft/engine/skills/tier2/intent-barrier.js';
import { remember } from '@zerocraft/engine/skills/tier2/memory.js';
import { AGENT_NPC_IDS, BARRIER_ID, DEFAULT_VERB, INTENT_VERBS, intentSignal } from './world-data.js';
import { buildAgentContext } from './agent-context.js';

/** 一次动作注入 = 一拍（照 game-103 测试的既有形状：enqueueAction → applyCommands → keybind → Effect）。 */
function fireActions(world: World, names: readonly string[], tick: number): void {
  const q = new QueuedInputSource('town');
  for (const n of names) q.enqueueAction(n);
  applyCommands(world, q.commandsForTick(tick));
  world.tick();
}

/** 空跑一拍（不注入动作·仍要清掉上一拍的 InputQueue，否则陈留动作会重复触发）。 */
function idleStep(world: World): void {
  applyCommands(world, []);
  world.tick();
}

export interface TurnReport {
  readonly turn: number;
  /** 本回合实际落地的意图（按 npcId 升序 = barrier 的产物序）。 */
  readonly resolved: readonly Intent[];
  /** 哪些 NPC 是超期降级补出来的（降级率的可观测落点）。 */
  readonly filled: readonly string[];
  /** 端口报错的（npcId → 原因）。 */
  readonly failures: readonly { npcId: string; reason: string }[];
}

/**
 * 跑一个回合。`port` 为 undefined = 全员走降级路径（断网 / 无 key 的可玩性验证）。
 *
 * 确定性保证不在本文件，而在它调用的引擎件里：产物只由「pending 列表 + 每个 id 拿到了什么」决定，
 * 与回包到达次序无关（`intent-barrier-core.test.ts` 拿全排列钉死）。
 */
export async function runTurn(world: World, turn: number, port?: NpcAgentPort): Promise<TurnReport> {
  const failures: { npcId: string; reason: string }[] = [];

  // ① TURN_START
  fireActions(world, ['turn:advance'], turn * 10 + 1);

  // ② PERCEIVE（在记忆入账之前——账期坑②）
  const contexts = AGENT_NPC_IDS.map((id) => buildAgentContext(world, id, turn));

  // ③ INTENT：开门登记 → 并发问端口。**只开这一次**（定手窗坑①）。
  setBarrierTurn(world, BARRIER_ID, turn);
  openBarrier(world, 'barrier', {
    id: BARRIER_ID,
    npcIds: [...AGENT_NPC_IDS],
    turn,
    deadlineTurns: 1,
    defaultVerb: DEFAULT_VERB,
    verbs: INTENT_VERBS,
    settleSignal: 'intents:settled',
    authority: true,
  });

  if (port) {
    // 并发发起，谁先回来都行——次序不进世界（这正是 barrier 存在的理由）。
    await Promise.all(contexts.map(async (ctx) => {
      const intents = await port.decide(ctx);
      if (intents.length === 0) {
        failures.push({ npcId: ctx.npcId, reason: 'empty' });
        failIntents(world, BARRIER_ID, ctx.npcId, 'empty');
      } else {
        deliverIntents(world, BARRIER_ID, ctx.npcId, intents);
      }
    }));
  }

  // ④ COMMIT：步进让门结算（未收齐也会在 deadlineTurns 内超期降级，不会卡死）。
  let resolved: readonly Intent[] = [];
  let filled: readonly string[] = [];
  for (let i = 0; i < 4; i++) {
    idleStep(world);
    const found = findBarrier(world, BARRIER_ID);
    if (found?.b.state === 'settled') {
      resolved = [...found.b.resolved];
      filled = [...found.b.filled];
      break;
    }
    // 没结算就把门的回合号往前推一格，触发超期判据（整数回合数·零墙钟）。
    setBarrierTurn(world, BARRIER_ID, turn + 1 + i);
  }

  // ⑤ APPLY：意图 → 具名动作 → 输入队列 → keybind → Effect。闭集外的早在 ④ 就被门拒了。
  if (resolved.length > 0) {
    fireActions(world, resolved.map((it) => intentSignal(it.npcId, it.verb, it.args)), turn * 10 + 7);
  }

  // ⑥ SETTLE：记忆入账（账期在此）+ 发衰减信号。
  for (const it of resolved) {
    const target = it.args && it.args.length > 0 ? String(it.args[0]) : undefined;
    remember(world, `npc-${it.npcId}`, {
      id: `t${turn}:${it.npcId}:${it.verb}`,
      subject: it.npcId,
      object: target,
      turn,
      strength: 60,
      tags: it.verb === 'talk_to' ? ['talk'] : it.verb === 'move_to' ? ['move'] : ['talk'],
      // 链式影响的可观测落点：这条记忆从哪来。降级补的标 'fallback'，可断言。
      source: filled.includes(it.npcId) ? 'fallback' : 'intent',
    });
  }
  fireActions(world, ['turn:decay'], turn * 10 + 8);

  return { turn, resolved, filled, failures };
}
