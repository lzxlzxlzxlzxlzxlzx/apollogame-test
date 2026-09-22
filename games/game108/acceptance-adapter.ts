// game108《拳律》—— 验收剧本薄适配契约（PE 落·**纯接线零规则**·不改剧本）。
// 对接通用 runner（scripts/acceptance-run.mjs）：
//   createWorld(seed, config) → world（.tick() / .getAllEntities() / .getComponent(id,type)）
//   applySignal(world, signal, args?, by?) → void（把剧本动作词翻成引擎输入）
//   readWorld(world) → worldLike（投影机读态）
//
// **动作词表 = 真 UI 的 `data-action`**【R-108-70·词表对齐律】：剧本里写 `charge.rock` / `throw.paper`，
// 与屏上按钮的 `action`、DOM 的 `data-action` **同一串字符**（`theme.ts` 的 `ACT` 是唯一真相）。
// 本文件**零规则判断**：谁克谁、打多少、什么时候清零，全在 blueprint 数据 + 引擎能力里。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { IWorld } from '@zerocraft/engine/engine/core/types.js';
import type { Resource, GameFlow, StringVar } from '@zerocraft/engine/engine/protocol/components.js';
import { buildBlueprint, throwSignal, aiChargeSignal } from './blueprint.js';
import { SIDES, HANDS, type Hand, type Side, type OpponentId } from './theme.js';

interface AccWorld {
  engine: Engine;
  input: QueuedInputSource;
  tk: number;
  seq: number;
  tick(): void;
  getAllEntities(): string[];
  getComponent(id: string, type: string): unknown;
}

export function createWorld(seed: number, config: Record<string, unknown> = {}): AccWorld {
  const input = new QueuedInputSource('p1');
  const engine = new Engine({ input });
  // 剧本可用 config.opponent 选对手（缺省 parrot 复读机）——五档是同一份数据表的不同行。
  const bp = buildBlueprint((config.opponent as OpponentId | undefined) ?? 'parrot');
  // 剧本的 seed 覆盖蓝图默认种子——同 seed 同结果（确定性断言的前提）。
  (bp.entities.seed as { RandomSeed: { seed: number } }).RandomSeed.seed = seed;
  engine.load(bp);
  const w: AccWorld = {
    engine, input, tk: 0, seq: 0,
    // 走 applyCommands + world.tick()（**不是** engine.world.tick()）——那一句正是把入队动作
    // 注进世界的接缝，绕过它队列就永远没人取（REQ-S3CLICK 抓到过的形态）。
    tick(): void { applyCommands(engine.world, input.commandsForTick(++w.tk)); engine.world.tick(); },
    getAllEntities(): string[] { return engine.world.getAllEntities() as string[]; },
    getComponent(id: string, type: string): unknown { return engine.world.getComponent(id, type as never); },
  };
  return w;
}

/**
 * 对手侧发信号（剧本用 `by:"p2"` 指定）。
 *
 * **这是「剧本指定的输入」，不是 AI 决策**——剧本说「对手这回合出剪刀」，等价于人类对手按了那个键；
 * 「AI 自己选哪只手」是另一件事（【R-108-30】条件加权表·`REQ-108-ENG-05` 待 owner 判 A/B）。
 * 两者分开，所以核心循环的验收**不被那张单阻断**。
 *
 * 落法：把 `EventWhen` 挂在**对局侧实体**上 → `event-when` 产的 `Signal.source` 就是该侧，
 * 正是 matrix-duel 出招接缝认侧要的那一位（`matrix-duel.ts:848`）。
 * 每次换一个 flag id（`seq` 递增），免得复用同一条边沿导致第二次不触发。
 */
function fireAs(w: AccWorld, side: Side, signal: string): void {
  const fid = `acc.${side}.${++w.seq}`;
  w.engine.world.addComponent(side, { type: 'EventWhen', signal, when: { kind: 'flag', id: fid }, mode: 'edge', armed: false } as never);
  const fe = `flag:${fid}`;
  if (!w.engine.world.hasComponent(fe, 'Flag')) w.engine.world.createEntity(fe);
  w.engine.world.addComponent(fe, { type: 'Flag', id: fid, active: true } as never);
}

export function applySignal(w: AccWorld, signal: string, _args?: Record<string, unknown>, by?: string): void {
  const side = (by ?? 'p1') as Side;
  const [verb, hand] = signal.split('.') as [string, Hand];

  if (side === 'p1') {
    // 玩家侧一律走**真输入通路**（InputQueue → keybind → Signal）——与人手点屏逐字节同一条路。
    w.input.enqueueAction(signal);
    return;
  }
  // 对手侧：蓄力走内部信号名（不进玩家动作词表），出招与玩家共用信号名（接缝靠 source 认侧）。
  if (verb === 'charge') { fireAs(w, side, aiChargeSignal(hand)); return; }
  if (verb === 'throw') { fireAs(w, side, throwSignal(hand)); return; }
  throw new Error(`game108 adapter: 不认识的动作 "${signal}"（词表见 theme.ts ACT）`);
}

/**
 * 机读态投影。两处**必须**投影，否则剧本写不出断言：
 *  ① **血量两侧同 id `hp`**（matrix-duel 的 hpResource 按侧 local 寻址）→ 全局 id 断言分不清哪一侧，
 *    故投成 `p1.hp` / `p2.hp` 两条各侧唯一的合成资源。
 *  ② `GameFlow.current` 不是标量组件 → 投成 StringVar `flow`，剧本才能断言「现在是哪个时区」。
 * 其余（六条蓄力槽 `<侧>.charge.<手>`、`<侧>.lastThrow`）本就各侧唯一，直读。
 */
export function readWorld(w: AccWorld): Pick<IWorld, 'getAllEntities' | 'getComponent'> {
  const world = w.engine.world;
  const cur = world.getComponent<GameFlow>('flow', 'GameFlow')?.current ?? 'charge';
  const synth: Record<string, Record<string, unknown>> = {
    '@flow': { StringVar: { type: 'StringVar', id: 'flow', value: cur } },
  };
  for (const s of SIDES) {
    const hp = world.getComponent<Resource>(s, 'Resource');
    synth[`@hp:${s}`] = { Resource: { type: 'Resource', id: `${s}.hp`, current: hp?.current ?? 0, min: 0, max: hp?.max ?? 0 } };
  }
  return {
    getAllEntities(): string[] { return [...(world.getAllEntities() as string[]), ...Object.keys(synth)] as never; },
    getComponent(id: string, type: string): unknown {
      if (synth[id]) return synth[id][type];
      return world.getComponent(id, type as never);
    },
  } as never;
}

export { HANDS, SIDES, type Hand, type StringVar };
