import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import { cmpStr } from '@engine/math/scalar.js';
import type { IWorld } from '@engine/core/types.js';
import type { DebugTrace, LifeActionResult, LifeActivityContext, LifeActor, LifePosition, Signal } from '@engine/protocol/components.js';
import { LIFE_ACTION_REJECT_REASONS, type LifeActionRejectReason } from '@engine/protocol/components/life-action.js';
import { LIFE_ACTIONS, type LifeAction } from '@engine/protocol/life-sim.js';
import { LIFE_INPUT_SIGNALS } from './life-input.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

export const LIFE_ACTION_CAPABILITY_ID = 't2-life-action';
export const LIFE_ACTION_SIGNAL = 'life.action';
const actions = new Set<string>(LIFE_ACTIONS);
const navigationSignals = new Set<string>(LIFE_INPUT_SIGNALS);
interface ActionIntents { valid: Set<LifeAction>; invalid: boolean; navigationConflict: boolean }

function baseResult(position: LifePosition, context: LifeActivityContext | undefined): Pick<LifeActionResult, 'sceneId' | 'x' | 'y' | 'zoneIds'> {
  return context ? { sceneId: context.sceneId, x: context.x, y: context.y, zoneIds: [...context.zoneIds].sort(cmpStr) }
    : { sceneId: position.sceneId, x: position.x, y: position.y, zoneIds: [] };
}

/** Closed life.action Signal → an accepted/rejected one-tick judgement. It never applies action effects. */
export const lifeActionCapability = defineCapability({
  id: LIFE_ACTION_CAPABILITY_ID, version: '1.0.0',
  describe: {
    name: 'life action judgement', summary: 'Validates a closed life.action Signal against LifeActivityContext and emits one structured accepted/rejected result per actor.',
    semantic: ['tier2', 'life-sim', 'action', 'signal', 'activity'],
    whenToUse: 'After t2-life-activity, bind semantic InputQueue action life.action with KeyBinding.source set to a player LifeActor. Downstream farming/resource/dialogue/shop capabilities consume accepted LifeActionResult; this capability never applies effects or selects a target.',
    examples: ['Signal{ name:"life.action", source:"life:player", arg:"till" } + allowedActions:["till"] → accepted LifeActionResult', 'town action "till" → rejected reason:"not-allowed-here"'],
  },
  components: { provides: {
    LifeActionResult: defineComponent('LifeActionResult', {
      action: t.opt(t.enum(LIFE_ACTIONS)), status: t.enum(['accepted', 'rejected'] as const), reason: t.opt(t.enum(LIFE_ACTION_REJECT_REASONS)), sceneId: t.str(), x: t.num(), y: t.num(), zoneIds: t.arr(t.str()),
    }, { category: 'event', describe: 'One-tick Life action judgement. accepted has a closed LifeAction and no reason; invalid/ambiguous rejected input omits action; reason is a closed reject code.' }),
  }, reads: ['Signal', 'LifeActor', 'LifePosition', 'LifeActivityContext', 'DebugTrace'], writes: ['LifeActionResult'], consumes: [] }, config: {},
  systems: [{
    id: 'life-action', runsAfter: ['life-activity', 'life-item-selection'],
    reads: ['Signal', 'LifeActor', 'LifePosition', 'LifeActivityContext', 'DebugTrace'], writes: ['LifeActionResult'], consumes: [],
    execute(world: IWorld) {
      const actorIds = sortedIds(world, 'LifeActor');
      for (const actorId of actorIds) if (world.hasComponent(actorId, 'LifeActionResult')) world.removeComponent(actorId, 'LifeActionResult');
      const intents = new Map<string, ActionIntents>();
      for (const signalEntity of sortedIds(world, 'Signal')) {
        const signal = world.getComponent<Signal>(signalEntity, 'Signal');
        if (!signal) continue;
        if (signal.name !== LIFE_ACTION_SIGNAL && !navigationSignals.has(signal.name)) continue;
        const set = intents.get(signal.source) ?? { valid: new Set<LifeAction>(), invalid: false, navigationConflict: false };
        intents.set(signal.source, set);
        if (navigationSignals.has(signal.name)) { set.navigationConflict = true; continue; }
        if (typeof signal.arg !== 'string' || signal.arg.trim().length === 0 || !actions.has(signal.arg)) set.invalid = true;
        else set.valid.add(signal.arg as LifeAction);
      }
      if (intents.size === 0) return;
      const trace = findDebugTrace(world); let traceCount = 0;
      const record = (kind: 'decision' | 'commit' | 'reject', what: string, why?: string) => {
        if (!trace || traceCount >= 3) return;
        appendTrace(trace, trace.tick ?? world.getVersion(), 'life-action', kind, what, why); traceCount++;
      };
      const writeReject = (source: string, position: LifePosition, context: LifeActivityContext | undefined, reason: LifeActionRejectReason, action?: LifeAction) => {
        world.addComponent(source, { type: 'LifeActionResult', ...(action === undefined ? {} : { action }), status: 'rejected', reason, ...baseResult(position, context) } as LifeActionResult);
        record('reject', `${source} life.action rejected`, reason);
      };
      for (const [source, set] of [...intents.entries()].sort(([a], [b]) => cmpStr(a, b))) {
        const actor = world.getComponent<LifeActor>(source, 'LifeActor'); const position = world.getComponent<LifePosition>(source, 'LifePosition');
        if (!actor || !position) { record('reject', `${source} life.action rejected`, 'not-player'); continue; }
        const context = world.getComponent<LifeActivityContext>(source, 'LifeActivityContext');
        const action = set.valid.size === 1 ? [...set.valid][0] : undefined;
        if (actor.kind !== 'player') { writeReject(source, position, context, 'not-player', action); continue; }
        if (set.invalid) { writeReject(source, position, context, 'invalid-action'); continue; }
        if (set.valid.size !== 1) { writeReject(source, position, context, 'ambiguous-action'); continue; }
        if (set.navigationConflict) { writeReject(source, position, context, 'navigation-conflict', action); continue; }
        if (!context) { writeReject(source, position, undefined, 'missing-context', action); continue; }
        if (!context.allowedActions.includes(action!)) { writeReject(source, position, context, 'not-allowed-here', action); continue; }
        record('decision', `${source} selected ${action}`, `scene=${context.sceneId}`);
        world.addComponent(source, { type: 'LifeActionResult', action, status: 'accepted', ...baseResult(position, context) } as LifeActionResult);
        record('commit', `${source} LifeActionResult=accepted`, `action=${action}`);
      }
    },
  }],
});
