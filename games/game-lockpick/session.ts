import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { DiscreteCombinationInput, DiscreteCombinationReceipt, DiscreteCombinationSession } from '@zerocraft/engine/engine/protocol/components.js';
import { buildLockpickManifest } from './blueprint.js';
import { LOCKPICK_SESSION, type LockpickDifficulty } from './config.js';
export class LockpickSession {
  readonly engine = new Engine(); private seq = 0;
  constructor(difficulty: LockpickDifficulty, seed: number) { this.engine.load(buildLockpickManifest(difficulty, seed)); this.tick(); }
  set(slot: number, value: number): void { this.input({ action: 'set', slot, value }); }
  giveUp(): void { this.input({ action: 'give-up' }); }
  tick(): void { this.engine.world.tick(); }
  state(): DiscreteCombinationSession { return this.engine.world.getComponent<DiscreteCombinationSession>(LOCKPICK_SESSION, 'DiscreteCombinationSession')!; }
  receipt(): DiscreteCombinationReceipt | undefined { return this.engine.world.getComponent<DiscreteCombinationReceipt>(LOCKPICK_SESSION, 'DiscreteCombinationReceipt'); }
  private input(value: Omit<DiscreteCombinationInput, 'type' | 'sessionId'>): void { const id = `lockpick-input:${this.seq++}`; this.engine.world.createEntity(id); this.engine.world.addComponent(id, { type: 'DiscreteCombinationInput', sessionId: LOCKPICK_SESSION, ...value } as DiscreteCombinationInput); }
}
