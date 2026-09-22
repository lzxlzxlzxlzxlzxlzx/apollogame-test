// game-103《幸存者》—— 验收剧本薄适配契约（PE 落·**纯接线零规则**·不改剧本）。
// 对接通用 runner（scripts/acceptance-run.mjs）：
//   createWorld(seed, config) → world（.tick() / .getAllEntities() / .getComponent(id,type)）
//   applySignal(world, signal, args?, by?) → void（把剧本动作词翻成引擎输入）
//   readWorld(world) → worldLike（投影机读态）
//
// 动作词表 = 蓝图 KeyBinding 闭集（`pick_<key>` / `evo_<key>`·draftPickEntities/evoPickEntities 是唯一真相）
// + `restart`（壳层重开局=重建世界·同 game-103.ts restart 语义）。**本文件零规则判断**：
// 谁打谁、掉多少经验、几点判胜，全在 blueprint 数据 + 引擎能力里。
//
// 投影键（docs/design/game-103/acceptance/README.md 表）：hp/xp/level/clock/kills + sv:status。
// **必须合成投影**（不能靠 snapshotScalars 直扫）：① `hp` 撞名——每个敌 body 也带 Resource{id:'hp'}，
// 直扫「后写覆盖」会读到某个敌的血；② `kills` 世界里叫 `score`（killbox 计分环）；③ `GameFlow.current`
// 非标量组件 → 投成 StringVar `status`。xp/level/clock 世界里本就唯一，一并走合成=同一条读法（仍是 passthrough）。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { IWorld } from '@zerocraft/engine/engine/core/types.js';
import type { Resource, GameFlow } from '@zerocraft/engine/engine/protocol/components.js';
import { buildBlueprint } from './blueprint.js';

interface AccWorld {
  engine: Engine;
  input: QueuedInputSource;
  tk: number;
  config: Record<string, unknown>;
  tick(): void;
  getAllEntities(): string[];
  getComponent(id: string, type: string): unknown;
}

// config 透传（同 game108 adapter 改 RandomSeed / game102 toLevel 的先例·改数据不写规则）：
// matchSeconds 覆盖单局时长两处消费点——clock 资源上限 + flow 胜判阈值（剧本 05 短局用·CI 免 54000 拍）。
function buildWorldBlueprint(config: Record<string, unknown>): ReturnType<typeof buildBlueprint> {
  const bp = buildBlueprint();
  const ms = config.matchSeconds;
  if (typeof ms === 'number') {
    (bp.entities.clock as { Resource: { max: number } }).Resource.max = ms;
    const flow = (bp.entities.flow as { GameFlow: { states: Array<{ id: string; transitions?: Array<{ to: string; when: { value: number } }> }> } }).GameFlow;
    for (const st of flow.states) {
      for (const tr of st.transitions ?? []) {
        if (tr.to === 'victory') tr.when.value = ms; // 胜判=活满 matchSeconds（同 MATCH_SECONDS 消费点）
      }
    }
  }
  return bp;
}

function loadEngine(w: AccWorld): void {
  w.input = new QueuedInputSource('hud'); // 同壳层 hudQueue 源名（game-103.ts:32）
  w.engine = new Engine({ input: w.input });
  w.engine.load(buildWorldBlueprint(w.config));
  w.tk = 0;
}

export function createWorld(_seed: number, config: Record<string, unknown> = {}): AccWorld {
  // seed 按契约收下但无消费方：本蓝图零 RandomSeed/零随机（生怪票/环形 spawner 全定时确定性）→ 同 seed 同轨天然成立。
  const w = {
    config,
    // 走 applyCommands + world.tick()（不是 engine 私跑）——那一句正是把入队动作注进世界的接缝（同 game108 adapter）。
    tick(): void { applyCommands(w.engine.world, w.input.commandsForTick(++w.tk)); w.engine.world.tick(); },
    getAllEntities(): string[] { return w.engine.world.getAllEntities() as string[]; },
    getComponent(id: string, type: string): unknown { return w.engine.world.getComponent(id, type as never); },
  } as AccWorld;
  loadEngine(w);
  return w;
}

export function applySignal(w: AccWorld, signal: string, _args?: Record<string, unknown>, _by?: string): void {
  if (signal === 'restart') { loadEngine(w); return; } // 壳层 restart 语义=重建世界（game-103.ts:224）
  if (signal.startsWith('pick_') || signal.startsWith('evo_')) {
    // 走真输入通路（InputQueue → keybind → Signal）——与宿主 hudQueue.enqueueAction 逐字节同一条路。
    w.input.enqueueAction(signal);
    return;
  }
  throw new Error(`game-103 adapter: 不认识的动作 "${signal}"（词表=蓝图 KeyBinding：pick_<key>/evo_<key>·外加 restart）`);
}

// 机读态投影（README 表·六键）：全部经合成实体给出（追加在实体表**末尾**→ snapshotScalars 后写覆盖=合成值胜出）。
export function readWorld(w: AccWorld): Pick<IWorld, 'getAllEntities' | 'getComponent'> {
  const world = w.engine.world;
  const resOf = (entity: string): Resource | undefined => world.getComponent<Resource>(entity, 'Resource');
  const proj = (id: string, r: Resource | undefined): Record<string, unknown> =>
    ({ Resource: { type: 'Resource', id, current: r?.current ?? 0, min: r?.min ?? 0, max: r?.max ?? 0 } });
  const cur = world.getComponent<GameFlow>('flow', 'GameFlow')?.current ?? 'playing';
  const synth: Record<string, Record<string, unknown>> = {
    '@status': { StringVar: { type: 'StringVar', id: 'status', value: cur } },
    '@hp': proj('hp', resOf('player')),        // 玩家血（敌 body 同名 id 'hp'·直扫会被覆盖→必合成）
    '@xp': proj('xp', resOf('collector')),     // 拾取环承经验
    '@level': proj('level', resOf('level')),
    '@clock': proj('clock', resOf('clock')),
    '@kills': proj('kills', resOf('killbox')), // 世界里叫 score → 剧本键 kills
  };
  return {
    getAllEntities(): string[] { return [...(world.getAllEntities() as string[]), ...Object.keys(synth)] as never; },
    getComponent(id: string, type: string): unknown {
      if (synth[id]) return synth[id][type];
      return world.getComponent(id, type as never);
    },
  } as never;
}
