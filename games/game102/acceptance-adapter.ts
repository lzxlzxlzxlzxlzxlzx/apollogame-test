// Game 102 · Pixel Pour —— 验收剧本薄适配契约（REQ-G102-ADAPTER·PE 落·纯接线零规则·不改剧本）。
// 对接 Lead 通用 runner（scripts/acceptance-run.mjs）契约：
//   createWorld(seed, config) → world（须 .tick() / .getAllEntities() / .getComponent(id,type)）
//   applySignal(world, signal, args?, by?) → void（把剧本动作词翻成引擎输入信号）
//   readWorld(world) → worldLike（投影机读态：把 GameFlow.current 投成 StringVar 'flow'；其余 Resource 直读）
// 动作/机读态词表见 docs/design/game102/acceptance/README.md。规则真相全在 blueprint（本文件零规则判断）。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { IWorld } from '@zerocraft/engine/engine/core/types.js';
import type { Transform, Tag, GameFlow } from '@zerocraft/engine/engine/protocol/components.js';
import { buildBlueprint } from './blueprint.js';
import type { Level } from './levels.js';
import { TRAY_BIT } from './theme.js';

interface AccWorld {
  engine: Engine;
  input: QueuedInputSource;
  tk: number;
  tick(): void;
  getAllEntities(): string[];
  getComponent(id: string, type: string): unknown;
}

// config（剧本 config 段）→ Level（补默认字段）。剧本只给玩法相关字段，其余取默认。
function toLevel(seed: number, config: Record<string, unknown>): Level {
  return {
    no: 0, name: 'acc', stars: [0, 0, 0], seed,
    cols: 1, rows: 1, palette: ['blue'], ammo: 20,
    conveyorCap: 5, burstCap: 10, slots: 5, beltSpeed: 90,
    limit: { kind: 'moves', n: 99 }, goals: [{ kind: 'clear' }], bitmap: ['0'],
    ...(config as Partial<Level>),
  };
}

export function createWorld(seed: number, config: Record<string, unknown> = {}): AccWorld {
  const input = new QueuedInputSource('g102');
  const engine = new Engine({ input });
  engine.load(buildBlueprint(toLevel(seed, config)));
  const w: AccWorld = {
    engine, input, tk: 0,
    tick(): void { applyCommands(engine.world, input.commandsForTick(++w.tk)); engine.world.tick(); },
    getAllEntities(): string[] { return engine.world.getAllEntities() as string[]; },
    getComponent(id: string, type: string): unknown { return engine.world.getComponent(id, type as never); },
  };
  return w;
}

// 点某实体（逆投影已由 clickable 用世界坐标·此处直接入队该实体 Transform 中心）。
function clickEntity(w: AccWorld, id: string): void {
  const t = w.engine.world.getComponent<Transform>(id, 'Transform');
  if (t) w.input.enqueue({ source: 'g102', x: t.x, y: t.y, phase: 'down' });
}
// 第 i 门待命槽炮（Tag 含 TRAY_BIT·按实体 id 稳定序）。
function trayCannonIds(w: AccWorld): string[] {
  const ids: string[] = [];
  for (const [id] of w.engine.world.query('Tag', 'Transform')) {
    const tg = w.engine.world.getComponent<Tag>(id, 'Tag');
    if (tg && (tg.flags & TRAY_BIT) !== 0) ids.push(id);
  }
  return ids.sort();
}

export function applySignal(w: AccWorld, signal: string, _args?: Record<string, unknown>, _by?: string): void {
  const [verb, arg] = signal.split(':');
  switch (verb) {
    case 'tapSupply': {                       // tapSupply:<color> → 点补给该色 → 生成上带色炮
      clickEntity(w, `supply-${arg}`);        // 特殊炮 rainbow/chain：REQ-G102-SPECIAL 后续接（暂无补给源→无操作）
      break;
    }
    case 'tapSlot': {                         // tapSlot:<i> → 点第 i 门待命槽炮复用
      const id = trayCannonIds(w)[Number(arg) || 0];
      if (id) clickEntity(w, id);
      break;
    }
    // useSpecial:laser / aim:col|row:<i> = 激光手动瞄准（REQ-G102-SPECIAL·未实现→pending）。
    default: break;
  }
}

// 机读态投影：GameFlow.current → StringVar 'flow'（剧本读 sv:flow）；其余 Resource/Flag 直读引擎世界。
export function readWorld(w: AccWorld): Pick<IWorld, 'getAllEntities' | 'getComponent'> {
  const cur = w.engine.world.getComponent<GameFlow>('flow', 'GameFlow')?.current ?? 'playing';
  const synth: Record<string, Record<string, unknown>> = { '@flow': { StringVar: { type: 'StringVar', id: 'flow', value: cur } } };
  return {
    getAllEntities(): string[] { return [...(w.engine.world.getAllEntities() as string[]), ...Object.keys(synth)] as never; },
    getComponent(id: string, type: string): unknown {
      if (synth[id]) return synth[id][type];
      return w.engine.world.getComponent(id, type as never);
    },
  } as never;
}
