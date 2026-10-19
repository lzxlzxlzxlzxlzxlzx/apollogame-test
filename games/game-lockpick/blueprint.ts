import type { WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { randomCapability } from '@zerocraft/engine/atom-skills/index.js';
import { discreteCombinationSessionCapability } from '@zerocraft/engine/skills/tier3/index.js';
import { LOCKPICK_SESSION, LOCKPICK_SIGNALS, SLOT_COUNT, type LockpickDifficulty } from './config.js';
export function buildLockpickManifest(difficulty: LockpickDifficulty, seed: number): WorldBlueprint {
  return { capabilities: [randomCapability, discreteCombinationSessionCapability], entities: {
    rng: { RandomSeed: { seed, sequence: 0 } },
    [LOCKPICK_SESSION]: { DiscreteCombinationSession: { id: LOCKPICK_SESSION, slotCount: SLOT_COUNT[difficulty], valueCount: 3, initialValue: 1, initialStrategy: 'random', setSignal: LOCKPICK_SIGNALS.set, giveUpSignal: LOCKPICK_SIGNALS.giveUp, feedbackSignal: LOCKPICK_SIGNALS.feedback, successSignal: LOCKPICK_SIGNALS.success, failureSignal: LOCKPICK_SIGNALS.failure } },
  } } as const;
}
