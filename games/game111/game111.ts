// game111《小都会》—— 卡带宿主层（mount/host·契约明许·**零玩法逻辑**）。
//
// 职责全在 sim 外：建 Engine、装配世界、把世界投影进 LayoutNode、把 UI 的 action 信号转成
// 回合驱动的调用、接 NpcAgentPort（无端点则走 Null 桩 = 断网可玩）、cleanup。
// 玩法规则一条都不在这里：全在 `blueprint.ts` 的数据 + 引擎能力里（见其头注）。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { mountUI, type MountHandle, type HandlerMap } from '@zerocraft/engine/ui/components/index.js';
import { apolloOnyx } from '@zerocraft/engine/ui/components/apollo-kit.js';
import { NullNpcAgentPort, HttpNpcAgentPort } from '@zerocraft/engine/services/npc-agent/index.js';
import type { NpcAgentPort } from '@zerocraft/engine/engine/protocol/agent.js';
import { buildBlueprint, setupTown } from './blueprint.js';
import { runTurn, type TurnReport } from './turn-driver.js';
import { buildTownView } from './project.js';
import { buildHome, buildTownBoard, buildTalkScreen } from './ui.js';
import { TITLES, titleFlag, TOPICS, NPCS, stubReply, saySignal, affinityId } from './world-data.js';
import type { Flag, Resource } from '@zerocraft/engine/engine/protocol/components.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import { remember } from '@zerocraft/engine/skills/tier2/memory.js';

/** 决策端口：给了端点就接真后端（DeepSeek 走 scripts/game111-deepseek-proxy.mjs），否则 Null 桩。 */
function makePort(endpoint?: string): NpcAgentPort {
  if (endpoint !== undefined && endpoint !== '') {
    return new HttpNpcAgentPort({ endpoint, timeoutMs: 20000 });
  }
  // 桩规则铁律：每条规则的动词必须真能回补那一项需求，否则该项垫底时进活锁
  // （实证：curiosity→move_to 而 move_to 不回好奇心 → 十回合全员卡在「动身去后山」刷屏）。
  return new NullNpcAgentPort({
    rules: [
      { whenLowest: 'energy', verb: 'rest' },
      { whenLowest: 'social', verb: 'talk_to', args: ['gud'] },
      { whenLowest: 'curiosity', verb: 'observe' },
      { whenLowest: 'mood', verb: 'observe' },
    ],
  });
}

/** 壳层钩子（launcher 契约的 mount 第二参·可选·向后兼容）。 */
export interface HostHooks {
  exit: () => void;
}

/** 决策端点覆盖（测试/演示用；正常走 `VITE_GAME111_ENDPOINT`）。 */
let endpointOverride: string | undefined;
export function setEndpointOverride(url: string | undefined): void { endpointOverride = url; }

export function mount(container: HTMLElement, host?: HostHooks): () => void {
  const endpoint = endpointOverride ?? (import.meta.env?.VITE_GAME111_ENDPOINT as string | undefined);
  const port = makePort(endpoint);

  const engine = new Engine();
  engine.load(buildBlueprint(111));
  setupTown(engine.world, 0);

  let turn = 0;
  let last: TurnReport | undefined;
  let busy = false;
  let justUnlocked: string | undefined;
  let handle: MountHandle | undefined;
  let disposed = false;
  /** 当前正在对话的 NPC（undefined = 在看板）。 */
  let talkingTo: string | undefined;
  let lastSaid: string | undefined;
  let lastReply: string | undefined;

  const unlockedIds = (): Set<string> => {
    const out = new Set<string>();
    for (const [eid] of engine.world.query('Flag')) {
      const f = engine.world.getComponent<Flag>(eid, 'Flag');
      if (f?.active !== true) continue;
      const t = TITLES.find((x) => titleFlag(x.id) === f.id);
      if (t) out.add(t.id);
    }
    return out;
  };

  const readRes = (id: string): number => {
    for (const [eid] of engine.world.query('Resource')) {
      const r = engine.world.getComponent<Resource>(eid, 'Resource');
      if (r?.id === id) return r.current;
    }
    return 0;
  };

  const render = (): void => {
    if (disposed) return;
    const node = talkingTo !== undefined
      ? buildTalkScreen({
          npcId: talkingTo,
          name: NPCS.find((n) => n.id === talkingTo)?.name ?? talkingTo,
          persona: NPCS.find((n) => n.id === talkingTo)?.persona ?? '',
          affinity: readRes(affinityId(talkingTo)),
          said: lastSaid,
          reply: lastReply,
          stubbed: true, // 回话来自桩表（world-data.ts STUB_REPLIES）——demo 里明着标出来
        })
      : turn === 0 && last === undefined
        ? buildHome({ canExit: host !== undefined })
        : buildTownBoard(buildTownView(engine.world, turn, last, { busy, justUnlocked }));
    if (handle) handle.update(node);
    else handle = mountUI(container, node, handlers, apolloOnyx);
  };

  const advance = async (): Promise<void> => {
    if (busy || disposed) return;
    busy = true;
    render(); // 立刻上「小镇在想…」——异步回包期间按钮禁用，防重入
    const before = unlockedIds();
    try {
      turn += 1;
      last = await runTurn(engine.world, turn, port);
    } finally {
      busy = false;
    }
    if (disposed) return;
    const after = unlockedIds();
    justUnlocked = [...after].find((id) => !before.has(id)); // 新解锁 → 撒粒子
    render();
  };

  /**
   * 玩家说一句话 —— **走和 NPC 意图完全相同的那条路**：具名动作 → applyCommands → keybind
   * → Signal → Effect（好感/心情）。宿主另外把这句写进该 NPC 的记忆（tag `player`·衰减最慢），
   * 于是**下一回合它的 prompt 里就带着你说过的话** —— 这就是「闲聊改变动机」的全部机制。
   */
  const say = (topicId: string): void => {
    const npcId = talkingTo;
    if (npcId === undefined) return;
    const topic = TOPICS.find((t) => t.id === topicId);
    if (topic === undefined) return; // 闭集外 → 什么都不发生（同 barrier 的拒收口径）

    const q = new QueuedInputSource('player');
    q.enqueueAction(saySignal(npcId, topic.id));
    applyCommands(engine.world, q.commandsForTick(turn * 10 + 9));
    engine.world.tick();

    remember(engine.world, `npc-${npcId}`, {
      id: `say:t${turn}:${npcId}:${topic.id}`,
      subject: 'player', object: npcId, turn,
      strength: topic.strength, tags: [...topic.tags],
      source: `player:${topic.id}`, // 链式影响的可观测落点：这条记忆是你说出来的
    });

    lastSaid = topic.text;
    lastReply = stubReply(npcId, topic.id);
    render();
  };

  // handler 里不塞自由逻辑：只把 UI 信号路由到宿主动作（信号铁律）。
  const handlers: HandlerMap = {
    'town.enter': () => { void advance(); },
    'town.next': () => { void advance(); },
    'town.about': () => { /* 说明屏待接（S5 观感阶段） */ },
    'town.exit': () => { host?.exit(); },
    'feed.open': () => { /* 帖子详情待接 */ },
    'npc.talk': (arg?: string) => { talkingTo = arg; lastSaid = undefined; lastReply = undefined; render(); },
    'talk.back': () => { talkingTo = undefined; render(); },
    // choiceList 发 arg=选项下标（t3-dialogue 口径）；这里把下标翻回话题 id。
    'talk.say': (arg?: string) => {
      const i = Number(arg);
      const topic = Number.isInteger(i) && i >= 0 && i < TOPICS.length ? TOPICS[i] : TOPICS.find((t) => t.id === arg);
      if (topic) say(topic.id);
    },
  };

  render();
  return () => {
    disposed = true;
    // MountHandle 本身就是拆卸函数（`(() => void) & { update }`·server.ts:46），调它即卸载。
    handle?.();
  };
}
