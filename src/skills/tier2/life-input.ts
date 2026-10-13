import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { DebugTrace, LifeActor, LifeMoveRequest, LifeWarpRequest, Signal } from '@engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

export const LIFE_INPUT_CAPABILITY_ID = 't2-life-input';
export const LIFE_INPUT_SIGNALS = ['life.move.up', 'life.move.down', 'life.move.left', 'life.move.right', 'life.warp'] as const;
type LifeInputSignal = typeof LIFE_INPUT_SIGNALS[number];
type LifeMoveSignal = Exclude<LifeInputSignal, 'life.warp'>;

const MOVES: Readonly<Record<LifeMoveSignal, readonly [number, number]>> = {
  'life.move.up': [0, -1], 'life.move.down': [0, 1], 'life.move.left': [-1, 0], 'life.move.right': [1, 0],
};
const accepted = new Set<string>(LIFE_INPUT_SIGNALS);
interface IntentSet { moves: Set<LifeMoveSignal>; warps: Set<string>; invalidWarp: boolean }

/** Closed Signal → Life request bridge. It never changes LifePosition. */
export const lifeInputCapability = defineCapability({
  id: LIFE_INPUT_CAPABILITY_ID, version: '1.0.0',
  describe: {
    name: 'life input', summary: 'Translates the closed life.move.* and life.warp Signals into one deterministic navigation request per actor.',
    semantic: ['tier2', 'life-sim', 'input', 'signal', 'navigation'],
    whenToUse: 'Use after t2-keybind with KeyBinding.source set to the LifeActor. Host/UI enqueue semantic actions only; this bridge creates LifeMoveRequest or LifeWarpRequest.',
    examples: ['Signal{ name:"life.move.right", source:"life:player" } → LifeMoveRequest{dx:1,dy:0}', 'Signal{ name:"life.warp", source:"life:player", arg:"town-farm-door" } → LifeWarpRequest'],
  },
  components: { provides: {}, reads: ['Signal', 'LifeActor', 'LifeMoveRequest', 'LifeWarpRequest', 'DebugTrace'], writes: ['LifeMoveRequest', 'LifeWarpRequest'], consumes: [] }, config: {},
  systems: [{
    id: 'life-input', runsAfter: ['keybind'], runsBefore: ['life-navigation'],
    reads: ['Signal', 'LifeActor', 'LifeMoveRequest', 'LifeWarpRequest', 'DebugTrace'], writes: ['LifeMoveRequest', 'LifeWarpRequest'], consumes: [],
    execute(world: IWorld) {
      const intents = new Map<string, IntentSet>();
      for (const [entityId] of world.query('Signal')) {
        const signal = world.getComponent<Signal>(entityId, 'Signal');
        if (!signal || !accepted.has(signal.name)) continue;
        const set = intents.get(signal.source) ?? { moves: new Set(), warps: new Set(), invalidWarp: false };
        intents.set(signal.source, set);
        if (signal.name === 'life.warp') {
          if (typeof signal.arg !== 'string' || signal.arg.trim().length === 0) set.invalidWarp = true;
          else set.warps.add(signal.arg);
        } else set.moves.add(signal.name as LifeMoveSignal);
      }
      if (intents.size === 0) return;

      const trace = findDebugTrace(world); let traceCount = 0;
      const record = (kind: 'decision' | 'commit' | 'reject', what: string, why?: string) => {
        if (!trace || traceCount >= 3) return;
        appendTrace(trace, trace.tick ?? world.getVersion(), 'life-input', kind, what, why); traceCount++;
      };
      for (const [source, set] of [...intents.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const actor = world.getComponent<LifeActor>(source, 'LifeActor');
        if (!actor || actor.kind !== 'player') { record('reject', `${source} life input rejected`, 'Signal.source is not a player LifeActor'); continue; }
        if (world.hasComponent(source, 'LifeMoveRequest') || world.hasComponent(source, 'LifeWarpRequest')) { record('reject', `${source} life input rejected`, 'actor already has an external navigation request'); continue; }
        const count = set.moves.size + set.warps.size;
        if (set.invalidWarp || count !== 1) { record('reject', `${source} life input rejected`, set.invalidWarp ? 'life.warp requires a non-blank string arg' : 'different navigation intents arrived in the same tick'); continue; }
        const move = [...set.moves][0];
        if (move) {
          const [dx, dy] = MOVES[move];
          record('decision', `${source} selected ${move}`);
          world.addComponent(source, { type: 'LifeMoveRequest', dx, dy } as LifeMoveRequest);
          record('commit', `${source} LifeMoveRequest=${dx},${dy}`);
        } else {
          const warpId = [...set.warps][0]!;
          record('decision', `${source} selected life.warp`, `warp=${warpId}`);
          world.addComponent(source, { type: 'LifeWarpRequest', warpId } as LifeWarpRequest);
          record('commit', `${source} LifeWarpRequest=${warpId}`);
        }
      }
    },
  }],
});
