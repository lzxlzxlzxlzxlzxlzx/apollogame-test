// ═══════════════════════════════════════════════════════════════════════════
//  game109 · 种田（暂名）—— 验收剧本薄适配契约（PE 落·**纯接线零规则**·不改剧本）
//
//  对接 Lead 通用 runner（scripts/acceptance-run.mjs）：
//    createWorld(seed, config?) → world（须可 .tick() / .getAllEntities() / .getComponent(id,type)）
//    applySignal(world, signal, args?, by?) → void（把剧本动作词翻成引擎输入）
//    readWorld(world) → worldLike（机读态投影：GameFlow.current → StringVar 'flow'）
//  动作词表 / 机读态表见 docs/design/game109/acceptance/README.md —— 词与屏上 `data-action`
//  及信号名**同一串字符**（`data.ts` 的 `SIGNALS` / `TOOLS[].pickSignal` / `hud.ts` 的 `HUD_ACTION`）。
//
//  ── 为什么这里**不 import** `game109.ts` 的 `mountRound`（Lead 点名的接缝·照实记）──────────
//   `mountRound` 是**宿主层**：里面 `mountHost` 要 `document`、`engine.start()` 要
//   `requestAnimationFrame`；而验收跑法是 `npx vite-node scripts/acceptance-run.mjs` = **纯 node**
//   （无 DOM、无 rAF）⇒ 直接搬它会在 `createWorld` 当场抛 `document is not defined`。
//   于是本文件在**世界层**照 `mountRound` 的 `start()` 逐句复现同一条构造（同一个 `buildBlueprint`、
//   同一个 `QueuedInputSource`、同一个 `Engine`），差别只有两条，都写在这里、不藏：
//     ① 不跑 rAF 圈：改由 runner 逐拍 `world.tick()`（= `Engine.step()` 的等价：先注入本拍命令，再推进世界）；
//     ② 不挂渲染器/HUD/骨架：验收只读世界机读态（runner 头注：「断言只读世界机读态，不读 DOM」）。
//   「重开」也因此等价落在世界层：弃掉本局引擎与它的输入源、用**同一 seed** 照上面这条路径重造一台
//   （= 宿主 `restart()` 的 `dispose(); start();`）——世界自然回开局态，没有世界侧复位代码要维护。
//
//  ── 红线（三条都别踩）─────────────────────────────────────────────────────
//   1) `tick()` 必须走 `applyCommands(world, input.commandsForTick(...))` 再 `world.tick()` ——
//      绕过前一句，队列里的动作**永远没人取且不报错**（宿主纪律 1 的实证，REQ-S3CLICK）。
//   2) 本文件**零规则判断**：扣几点体力、什么前置、长几阶、卖多少金，全在 blueprint 数据 + 引擎能力里。
//   3) 剧本红 = 报「哪份·哪步·期望 vs 实际」给 GD 改；**不为让剧本变绿改实现**，也不改剧本。
// ═══════════════════════════════════════════════════════════════════════════

import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands, QueuedInputSource } from '@zerocraft/engine/net/index.js';
import type { IWorld } from '@zerocraft/engine/engine/core/types.js';
import type { Transform, GameFlow } from '@zerocraft/engine/engine/protocol/components.js';
import { buildBlueprint } from './blueprint.js';
import { SIGNALS, TOOLS } from './data.js';
import { HUD_ACTION } from './hud.js';

const PLAYER = 'g109';

/** 一局的可驱动世界（runner 契约面）+ 本局的种子（重开要照同一个种子重挂）。 */
interface AccWorld {
  /** 本局引擎。**重开后是新的一台** ⇒ 一律现读 `w.engine`，别缓存（缓存的旧引擎已被弃）。 */
  engine: Engine;
  /** 本局的输入源（重开时与引擎一起换新 = 宿主 `start()` 的头两句）。 */
  input: QueuedInputSource;
  /** 本局种子（`restart` 照它重挂 ⇒ 同 seed 同局）。 */
  readonly seed: number;
  tick(): void;
  getAllEntities(): string[];
  getComponent(id: string, type: string): unknown;
}

/** 把剧本的 seed 写进蓝图的随机源（`farm-rng.RandomSeed`）——「剧本的 seed 就是这局的 seed」。 */
function seedTheWorld(bp: ReturnType<typeof buildBlueprint>, seed: number): void {
  const rng = bp.entities['farm-rng']?.RandomSeed;
  if (!rng) {
    // 锚点没了：实体 id / 组件名被改？剧本 06/08 断言它的 `sequence`，这里必须先响。
    throw new Error('game109 adapter：蓝图里没有 farm-rng.RandomSeed（实体 id 或组件名变了？剧本 06/08 要读它的 sequence）');
  }
  // 本作**零随机**（capability-plan §5）⇒ 写它不影响任何玩法；写它是为了「剧本的 seed 进了世界」
  // 这条契约在机读态里**可查**，而不是被无声丢掉（README 明写：只许断言 sequence，别断言 seed 本身）。
  rng.seed = seed;
}

/** 造一局（= 宿主 `mountRound.start()` 的头三句：输入源 → 引擎 → 装蓝图；不含 DOM/渲染/rAF）。 */
function newRound(seed: number): { engine: Engine; input: QueuedInputSource } {
  const input = new QueuedInputSource(PLAYER);
  const engine = new Engine({ input });
  const bp = buildBlueprint();
  seedTheWorld(bp, seed);
  engine.load(bp);
  return { engine, input };
}

export function createWorld(seed: number, config: Record<string, unknown> = {}): AccWorld {
  // game109 的剧本契约里**没有** config 段（GD 的 8 份剧本 config 全缺省）。出现即拒——
  // 静默忽略等于「剧本以为配了、其实没配」的假绿（runner 头注同一条纪律）。
  const keys = Object.keys(config ?? {});
  if (keys.length) {
    throw new Error(`game109 adapter：剧本给了 config{${keys.join(', ')}}，但本作没有 config 接线（要加先定契约，别静默忽略）`);
  }
  const { engine, input } = newRound(seed);
  const w: AccWorld = {
    engine,
    input,
    seed,
    // 与 `Engine.step()` 同一句：取「即将运行的那一拍」的编号注入本拍命令，再推进世界。
    tick(): void {
      applyCommands(w.engine.world, w.input.commandsForTick(w.engine.world.getVersion() + 1));
      w.engine.world.tick();
    },
    getAllEntities(): string[] { return w.engine.world.getAllEntities() as string[]; },
    getComponent(id: string, type: string): unknown { return w.engine.world.getComponent(id, type as never); },
  };
  return w;
}

/**
 * 点某个世界实体（`args.tile` = 地块实体 id 的落法·同 game102 `clickEntity`）：
 * 读它的 `Transform`，在该格**中心**入队一次 pointerdown。
 * 逆投影在这里是恒等（无相机）——屏上那条路走 `canvasPointerToScreen` 把 CSS 坐标折回逻辑坐标，
 * 验收这条路直接给世界坐标，落点同一格；不给「行/列」另造一套地址（会与实体 id 两套账）。
 */
function clickEntity(w: AccWorld, id: string): void {
  const t = w.engine.world.getComponent<Transform>(id, 'Transform');
  if (!t) {
    // 不静默：id 打错时否则只是「等了 cap 拍什么都没发生」，报错里看不出是剧本拼错了。
    throw new Error(`game109 adapter：世界里没有实体 "${id}" 的 Transform（args.tile 写错了？形如 "tile-r2c0"）`);
  }
  w.input.enqueue({ source: PLAYER, x: t.x, y: t.y, phase: 'down' });
}

/**
 * 重开（= 宿主 `game109.ts` 的 `restart`：拆掉本局 → 照原路径重挂一局，**同一 seed**）。
 *
 * 世界层等价：换一台引擎 + 换一个输入源（旧的一起弃掉）。这里没有 rAF 圈要停——
 * 本路径的引擎从没 `start()` 过（`engine.stop()` 在此是空操作），宿主那条路才有循环要停。
 * 旧世界连同它的 36 格状态一起被弃：**没有世界侧复位代码**，回初态是「新造一局」的自然结果。
 */
function restart(w: AccWorld): void {
  const { engine, input } = newRound(w.seed);
  w.engine = engine; // runner 手上的 world 对象不变 ⇒ 之后的 tick/readWorld 都落到新局上
  w.input = input;
}

export function applySignal(w: AccWorld, signal: string, args?: Record<string, unknown>, by?: string): void {
  // 本作单机：世界里没有按「谁出的手」寻址的链（blueprint.ts 的 hudActions 注：这 6 个动作的效果全是全局写）。
  // 剧本一旦写 by，说明作者以为有第二方 ⇒ 当场拒，别把这条输入无声吞掉。
  if (by !== undefined) {
    throw new Error(`game109 adapter：剧本给了 by=${JSON.stringify(by)}，但本作单机（无对手侧 / 无按 source 认人的消费方）`);
  }

  switch (signal) {
    case SIGNALS.WORK: {                        // 屏上是 Canvas 上的地块（没有 data-action）→ 指针路径
      const tile = args?.tile;
      if (typeof tile !== 'string' || tile === '') {
        throw new Error('game109 adapter：work 缺 args.tile（地块实体 id，如 {"tile":"tile-r2c0"}）');
      }
      clickEntity(w, tile);
      return;
    }
    case SIGNALS.SLEEP:                         // 睡觉 / 卖货 = HUD 动作键 → 与 DOM 路径同一句 enqueueAction
    case SIGNALS.SELL:                          //   （QueuedInputSource 当 ActionSink → InputQueue{key,phase:'action'} → keybind → Effect）
      w.input.enqueueAction(signal);
      return;
    case HUD_ACTION.restart:                    // 宿主域的动作（README「同名不同源」）→ 世界侧等价：拆局重挂
      restart(w);
      return;
    default: {
      // 4 把工具（翻土/播种/浇水/收获）：词表取自 `TOOLS[].pickSignal`——与 HUD 按钮的 data-action、
      // 蓝图的 kb-* 键位**同一个字符串来源**（加第 5 把工具时这里自动跟上，不用改）。
      if (TOOLS.some((t) => t.pickSignal === signal)) {
        w.input.enqueueAction(signal);
        return;
      }
      throw new Error(`game109 adapter：不认识的动作 "${signal}"（词表见 docs/design/game109/acceptance/README.md）`);
    }
  }
}

/**
 * 机读态投影。**只有一条**要投（其余直读引擎世界，契约表在 README）：
 *   `GameFlow.current` 不是标量组件（runner 只认 Resource/Flag/StringVar 的 id）⇒ 投成 StringVar `flow`，
 *   剧本才能断言 `sv: flow` = `playing` / `won`（同 game108 / game102 的 `@flow` 投法）。
 * 36 格共用 `Flag{id:'watered'}` / `Resource{id:'stage'}` ⇒ 逐格断言一律走 `comp` + 显式实体 id（README 明写）。
 */
export function readWorld(w: AccWorld): Pick<IWorld, 'getAllEntities' | 'getComponent'> {
  const current = w.engine.world.getComponent<GameFlow>('flow', 'GameFlow')?.current;
  // 缺实体时**不默认成 'playing'**（game102/108 的 `?? playing` 写法会掩盖「flow 实体装丢了」：
  // `sv: flow eq playing` 照样绿）→ 投一个显然假的值，断言当场红、值本身写明原因。
  const synth: Record<string, Record<string, unknown>> = {
    '@flow': { StringVar: { type: 'StringVar', id: 'flow', value: current ?? '<缺 flow 实体>' } },
  };
  return {
    getAllEntities(): string[] { return [...(w.engine.world.getAllEntities() as string[]), ...Object.keys(synth)] as never; },
    getComponent(id: string, type: string): unknown {
      if (synth[id]) return synth[id][type];
      return w.engine.world.getComponent(id, type as never);
    },
  } as never;
}
