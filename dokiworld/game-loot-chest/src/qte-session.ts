import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/commands.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { Resource, State, Timer } from '@zerocraft/engine/engine/protocol/components.js';
import { buildChestQteBlueprint } from './qte-blueprint.js';

export type ChestQtePhase = 'ready' | 'playing' | 'opening' | 'revealed';
export type ChestQteSnapshot = Readonly<{
  phase: ChestQtePhase;
  feedback: 'idle' | 'hit' | 'miss';
  locks: number;
  misses: number;
  attempts: number;
  elapsed: number;
  duration: number;
}>;

function resource(engine: Engine, id: string): number {
  for (const [eid] of engine.world.query('Resource')) {
    const value = engine.world.getComponent<Resource>(eid, 'Resource');
    if (value?.id === id) return value.current;
  }
  return 0;
}

function state(engine: Engine, id: string): string {
  for (const [eid] of engine.world.query('State')) {
    const value = engine.world.getComponent<State>(eid, 'State');
    if (value?.fsmId === id) return value.current;
  }
  return '';
}

/** 浏览器宿主薄层：输入进队列、固定 tick 推世界、只读投影快照。 */
export class ChestQteSession {
  readonly engine = new Engine({ tickRate: 60 });
  readonly input = new QueuedInputSource('chest-ui');

  constructor() {
    this.engine.load(buildChestQteBlueprint());
  }

  enqueue(action: string): void {
    this.input.enqueueAction(action);
  }

  tick(count = 1): void {
    for (let index = 0; index < count; index += 1) {
      applyCommands(this.engine.world, this.input.commandsForTick(this.engine.world.getVersion() + 1));
      this.engine.world.tick();
    }
  }

  snapshot(): ChestQteSnapshot {
    const timer = this.engine.world.getComponent<Timer>('qte-cycle', 'Timer');
    return {
      phase: (state(this.engine, 'chest-qte') || 'ready') as ChestQtePhase,
      feedback: (state(this.engine, 'chest-qte-feedback') || 'idle') as ChestQteSnapshot['feedback'],
      locks: resource(this.engine, 'qte-locks'),
      misses: resource(this.engine, 'qte-misses'),
      attempts: resource(this.engine, 'qte-attempts'),
      elapsed: timer?.elapsed ?? 0,
      duration: timer?.duration ?? 100,
    };
  }
}
