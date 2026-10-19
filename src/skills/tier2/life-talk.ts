import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { DialogueScript } from '@skills/tier3/dialogue.js';
import type { DebugTrace, InputQueue, LifeActionResult, LifeActivityContext, LifeDialogueCatalog, LifeDialogueSession, LifePlacement, LifeSelectedTarget, LifeTalkActionResult } from '@engine/protocol/components.js';
import { LIFE_TALK_REASONS } from '@engine/protocol/components/life-world.js';
import { DEFAULT_LIFE_DIALOGUE_SESSION_POLICY } from '@engine/protocol/life-sim.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

/** Deterministic host action for closing an authored terminal Life dialogue. */
export const LIFE_DIALOGUE_CLOSE_ACTION = 'life.dialogue.close';
const LIFE_DIALOGUE_SESSION_ID = 'life:dialogue-session:player';
const LIFE_DIALOGUE_FSM_ID = 'life-dialogue';

type LifeDialogueState = {
  readonly type: 'State';
  fsmId: string;
  current: string;
  previous?: string;
};

type LifeTalkTraceRecord = (
  kind: 'decision' | 'transition' | 'commit' | 'reject',
  what: string,
  why?: string,
) => void;

function closeRequested(world: IWorld): boolean {
  for (const [entityId] of world.query('InputQueue')) {
    const queue = world.getComponent<InputQueue>(entityId, 'InputQueue');
    if (queue?.actions.some((action) => action.phase === 'action' && action.key === LIFE_DIALOGUE_CLOSE_ACTION)) return true;
  }
  return false;
}

/**
 * Reconcile the reserved session before t3-dialogue runs. Save data keeps only its authored cursor,
 * so runtime script/text are rebuilt from the static catalog. Legacy/corrupt cursors fail closed,
 * and the closed proximity policy expires a valid cursor against the same-tick activity context.
 */
function reconcileDialogueRuntime(world: IWorld, record: LifeTalkTraceRecord): 'none' | 'ready' | 'cleared' {
  const session = world.getComponent<LifeDialogueSession>(LIFE_DIALOGUE_SESSION_ID, 'LifeDialogueSession');
  const hasRuntimeResidue = world.hasComponent(LIFE_DIALOGUE_SESSION_ID, 'DialogueScript')
    || world.hasComponent(LIFE_DIALOGUE_SESSION_ID, 'State')
    || world.hasComponent(LIFE_DIALOGUE_SESSION_ID, 'Text')
    || world.hasComponent(LIFE_DIALOGUE_SESSION_ID, 'DialogueChoiceResult');
  if (!session) {
    if (!hasRuntimeResidue) return 'none';
    world.destroyEntity(LIFE_DIALOGUE_SESSION_ID);
    record('reject', 'life:player restored dialogue rejected', 'orphan-dialogue-runtime');
    record('transition', 'life:player dialogue runtime→cleared', 'orphan-dialogue-runtime');
    return 'cleared';
  }

  const catalogId = world.singleton('LifeDialogueCatalog');
  const catalog = catalogId === undefined ? undefined : world.getComponent<LifeDialogueCatalog>(catalogId, 'LifeDialogueCatalog');
  const dialogue = catalog?.dialogues.find((candidate) => candidate.id === session.dialogueId);
  const state = world.getComponent<LifeDialogueState>(LIFE_DIALOGUE_SESSION_ID, 'State');
  const invalid = session.status !== 'open' ? 'invalid-session-status'
    : !catalog ? 'missing-dialogue-catalog'
      : !dialogue ? 'missing-dialogue'
        : !state ? 'missing-state'
          : state.fsmId !== LIFE_DIALOGUE_FSM_ID ? 'state-fsm-mismatch'
            : !dialogue.graph[state.current] ? 'unknown-dialogue-node'
              : undefined;
  if (invalid) {
    world.destroyEntity(LIFE_DIALOGUE_SESSION_ID);
    record('reject', 'life:player restored dialogue rejected', invalid);
    record('transition', 'life:player LifeDialogueSession=open→cleared', invalid);
    return 'cleared';
  }

  const sessionPolicy = catalog!.sessionPolicy ?? DEFAULT_LIFE_DIALOGUE_SESSION_POLICY;
  if (sessionPolicy === 'proximity') {
    const context = world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext');
    if (!context?.nearbyPlacementIds.includes(session.npcPlacementId)) {
      const reason = context ? 'target-out-of-range' : 'missing-activity-context';
      world.destroyEntity(LIFE_DIALOGUE_SESSION_ID);
      record('decision', 'life:player proximity dialogue expired', reason);
      record('transition', 'life:player LifeDialogueSession=open→cleared', reason);
      return 'cleared';
    }
  }

  const script = world.getComponent<DialogueScript>(LIFE_DIALOGUE_SESSION_ID, 'DialogueScript');
  const missingText = !world.hasComponent(LIFE_DIALOGUE_SESSION_ID, 'Text');
  const staleScript = !script || script.fsmId !== LIFE_DIALOGUE_FSM_ID || script.nodes !== dialogue!.graph;
  if (staleScript) {
    world.addComponent(LIFE_DIALOGUE_SESSION_ID, {
      type: 'DialogueScript', fsmId: LIFE_DIALOGUE_FSM_ID, nodes: dialogue!.graph,
    } as DialogueScript);
  }
  if (missingText) {
    world.addComponent(LIFE_DIALOGUE_SESSION_ID, { type: 'Text', content: '', fontSize: 16, fontFamily: 'ui', anchor: 'left', lineSpacing: 1 });
  }
  if (staleScript || missingText) {
    record('transition', 'life:player dialogue runtime=rehydrated', `${session.dialogueId}:${state!.current}`);
  }
  return 'ready';
}

export const lifeTalkCapability = defineCapability({
  id: 't2-life-talk', version: '1.4.0',
  describe: {
    name: 'life talk bridge', summary: 'Opens t3-dialogue from an accepted nearby NPC talk, applies the authored session range policy, rehydrates persisted cursors, and closes terminal sessions through the deterministic input queue.',
    semantic: ['life-sim'], whenToUse: 'After life action. LifeDialogueCatalog.sessionPolicy chooses legacy persistent or proximity-bound sessions; persisted cursors rebuild runtime scripts from the catalog; progression stays in t3-dialogue and terminal close uses life.dialogue.close.', examples: [],
  },
  components: { provides: {
    LifeDialogueCatalog: defineComponent('LifeDialogueCatalog', { dialogues: t.arr(t.obj({ id: t.str(), graph: t.any() })), sessionPolicy: t.opt(t.enum(['persistent', 'proximity'] as const)) }, { category: 'config', describe: 'Static Life dialogue catalog and closed session lifetime policy. Omission preserves legacy persistent sessions.' }),
    LifeDialogueSession: defineComponent('LifeDialogueSession', { npcPlacementId: t.str(), dialogueId: t.str(), status: t.enum(['open'] as const) }, { category: 'resource', describe: 'Open player dialogue session.' }),
    LifeTalkActionResult: defineComponent('LifeTalkActionResult', { status: t.enum(['opened', 'rejected'] as const), reason: t.opt(t.enum(LIFE_TALK_REASONS)), npcPlacementId: t.opt(t.str()), dialogueId: t.opt(t.str()) }, { category: 'event', describe: 'Talk outcome.' }),
  }, reads: ['InputQueue', 'LifeActionResult', 'LifeActivityContext', 'LifeSelectedTarget', 'LifePlacement', 'LifeDialogueCatalog', 'LifeDialogueSession', 'DialogueScript', 'State', 'DebugTrace'], writes: ['LifeDialogueSession', 'LifeTalkActionResult', 'DialogueScript', 'DialogueChoiceResult', 'State', 'Text'], consumes: [] }, config: {},
  systems: [{
    id: 'life-talk', phase: SystemPhase.Resolve, runsAfter: ['life-action', 'life-target-selection'], runsBefore: ['dialogue'],
    reads: ['InputQueue', 'LifeActionResult', 'LifeActivityContext', 'LifeSelectedTarget', 'LifePlacement', 'LifeDialogueCatalog', 'LifeDialogueSession', 'DialogueScript', 'State', 'DebugTrace'], writes: ['LifeDialogueSession', 'LifeTalkActionResult', 'DialogueScript', 'DialogueChoiceResult', 'State', 'Text'], consumes: [],
    execute(world: IWorld) {
      const actorId = 'life:player';
      if (world.hasComponent(actorId, 'LifeTalkActionResult')) world.removeComponent(actorId, 'LifeTalkActionResult');
      const trace = findDebugTrace(world); let traceCount = 0;
      const record: LifeTalkTraceRecord = (kind, what, why): void => {
        if (!trace || traceCount >= 3) return;
        appendTrace(trace, trace.tick ?? world.getVersion(), 'life-talk', kind, what, why); traceCount += 1;
      };
      const sessionId = LIFE_DIALOGUE_SESSION_ID;
      if (reconcileDialogueRuntime(world, record) === 'cleared') return;
      if (closeRequested(world)) {
        const session = world.getComponent<LifeDialogueSession>(sessionId, 'LifeDialogueSession');
        if (session?.status !== 'open') record('reject', `${actorId} dialogue close rejected`, 'no-open-session');
        else {
          const script = world.getComponent<DialogueScript>(sessionId, 'DialogueScript');
          const state = world.getComponent<{ readonly type: 'State'; current: string }>(sessionId, 'State');
          const node = script && state ? script.nodes[state.current] : undefined;
          if (node?.kind !== 'line' || node.next !== null) record('reject', `${actorId} dialogue close rejected`, 'not-terminal');
          else {
            world.destroyEntity(sessionId);
            record('commit', `${actorId} LifeDialogueSession=closed`, session.npcPlacementId);
          }
        }
        return;
      }
      const action = world.getComponent<LifeActionResult>(actorId, 'LifeActionResult');
      if (action?.status !== 'accepted' || action.action !== 'talk') return;
      const reject = (reason: typeof LIFE_TALK_REASONS[number]): void => {
        world.addComponent(actorId, { type: 'LifeTalkActionResult', status: 'rejected', reason } as LifeTalkActionResult);
        record('reject', `${actorId} talk rejected`, reason);
      };
      const selected = world.getComponent<LifeSelectedTarget>(actorId, 'LifeSelectedTarget');
      const context = world.getComponent<LifeActivityContext>(actorId, 'LifeActivityContext');
      if (!selected) { reject('missing-selection'); return; }
      if (!context) { reject('invalid-scene'); return; }
      if (!context.nearbyPlacementIds.includes(selected.placementId)) { reject('target-not-nearby'); return; }
      let placement: LifePlacement | undefined;
      for (const entityId of sortedIds(world, 'LifePlacement')) {
        const candidate = world.getComponent<LifePlacement>(entityId, 'LifePlacement');
        if (candidate?.placementId === selected.placementId) { placement = candidate; break; }
      }
      if (!placement) { reject('invalid-target'); return; }
      if (placement.kind !== 'npc') { reject('not-npc'); return; }
      if (placement.visible === false || placement.interactive === false) { reject('invalid-target'); return; }
      const catalogId = world.singleton('LifeDialogueCatalog');
      const catalog = catalogId === undefined ? undefined : world.getComponent<LifeDialogueCatalog>(catalogId, 'LifeDialogueCatalog');
      const dialogue = placement.npcDialogueId ? catalog?.dialogues.find((candidate) => candidate.id === placement!.npcDialogueId) : undefined;
      if (!dialogue) { reject('missing-dialogue'); return; }
      if (world.getComponent<LifeDialogueSession>(sessionId, 'LifeDialogueSession')?.status === 'open') { reject('session-conflict'); return; }
      const first = Object.keys(dialogue.graph)[0];
      if (!first) { reject('missing-dialogue'); return; }
      record('decision', `${actorId} talk ${placement.placementId}`, `dialogue=${dialogue.id}`);
      if (!world.hasComponent(sessionId, 'LifeDialogueSession')) world.createEntity(sessionId);
      world.addComponent(sessionId, { type: 'LifeDialogueSession', npcPlacementId: placement.placementId, dialogueId: dialogue.id, status: 'open' } as LifeDialogueSession);
      world.addComponent(sessionId, { type: 'DialogueScript', fsmId: LIFE_DIALOGUE_FSM_ID, nodes: dialogue.graph } as DialogueScript);
      world.addComponent(sessionId, { type: 'State', fsmId: LIFE_DIALOGUE_FSM_ID, current: first, previous: first });
      world.addComponent(sessionId, { type: 'Text', content: '', fontSize: 16, fontFamily: 'ui', anchor: 'left', lineSpacing: 1 });
      world.addComponent(actorId, { type: 'LifeTalkActionResult', status: 'opened', npcPlacementId: placement.placementId, dialogueId: dialogue.id } as LifeTalkActionResult);
      record('commit', `${actorId} LifeDialogueSession=open`, placement.placementId);
    },
  }],
});
