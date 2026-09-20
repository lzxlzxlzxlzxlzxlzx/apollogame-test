import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { QueuedInputSource } from '@net/queued-input.js';
import type { State } from '@engine/protocol/components.js';
import { assembleWorld } from './world.js';

export type Phase = 'shop' | 'deploy' | 'battle' | 'result';
/** Session owns the engine and input lifetime; stage/selection live in public State. */
export class McFightSession {
  readonly input = new QueuedInputSource('mcfight.player');
  readonly engine = new Engine({ tickRate: 20, input: this.input });
  private disposed = false;
  constructor() { assembleWorld(this.engine); }
  get phase(): Phase { return this.engine.world.getComponent<State>('session', 'State')!.current as Phase; }
  get selectedUnitId(): string { return this.engine.world.getComponent<State>('selection', 'State')!.current; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.stop();
    this.input.commandsForTick(0);
    this.engine.world.setObserver(undefined);
    for (const id of this.engine.world.getAllEntities()) this.engine.world.destroyEntity(id);
  }
}
