// S4 验收薄适配：剧本具名输入进入同一个 InputQueue，规则仍由真实蓝图能力解释。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import { buildPotionBlueprint } from './blueprint.js';
import { EMBER_ROUND, MOON_ROUND, REPEAT_ROUND } from './fixtures.js';

interface AcceptanceWorld {
  readonly engine: Engine;
  readonly input: QueuedInputSource;
  tick(): void;
  getAllEntities(): string[];
  getComponent(id: string, type: string): unknown;
}

export function createWorld(_seed: number, config: Record<string, unknown> = {}): AcceptanceWorld {
  const fixture = config.fixture ?? 'moon';
  const round = fixture === 'moon' ? MOON_ROUND : fixture === 'ember' ? EMBER_ROUND
    : fixture === 'repeat' ? REPEAT_ROUND : undefined;
  if (!round) throw new Error(`未知炼药验收 fixture: ${String(fixture)}`);
  const input = new QueuedInputSource('potion-acceptance');
  const engine = new Engine({ input, tickRate: 60 });
  engine.load(buildPotionBlueprint(round));
  return {
    engine, input,
    tick(): void {
      applyCommands(engine.world, input.commandsForTick(engine.world.getVersion() + 1));
      engine.world.tick();
    },
    getAllEntities(): string[] { return engine.world.getAllEntities() as string[]; },
    getComponent(id: string, type: string): unknown { return engine.world.getComponent(id, type as never); },
  };
}

export function applySignal(world: AcceptanceWorld, signal: string): void {
  world.input.enqueueAction(signal);
}

export function readWorld(world: AcceptanceWorld): AcceptanceWorld { return world; }
