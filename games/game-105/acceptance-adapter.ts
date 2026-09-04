import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { PhysicsSystem, preloadPhysics } from '@zerocraft/engine/renderer/three/physics.js';
import { TOWER_BLOCKS, towerBlueprint } from './tower-blueprint.js';
import { TowerGameSession } from './tower-session.js';
import { TowerActionExecutor } from './tower-action-executor.js';
import { AITurnDirector } from './ai-turn-director.js';
import { createLocalAIObservation } from './local-ai-observation.js';

await preloadPhysics();

interface AccWorld {
  engine: Engine; physics: PhysicsSystem; session: TowerGameSession; executor: TowerActionExecutor; director: AITurnDirector;
  frame: number; physicsAfterLock: boolean; lastRetiredSelectionRejected: boolean;
  tick(): void; getAllEntities(): string[]; getComponent(id: string, type: string): unknown;
}

const ids = ['phase', 'turn', 'loser', 'current-card-kind', 'heart-delta', 'loot-count', 'round', 'player-draws', 'ai-draws', 'completed-interactions', 'linked-extractions', 'draft-response-length', 'round-response-count', 'swaps-remaining', 'retired-block-count', 'current-card-sequence', 'ai-wrap-count', 'ai-reply-count', 'ai-penalty-request-count', 'local-ai-ready', 'tower-stable', 'interaction-open', 'aftershock-summary-open', 'current-card-is-unseen-same-channel', 'responses-are-session-only', 'local-ai-observation-has-no-physics-pose', 'last-retired-selection-rejected', 'ai-wrap-card-visible', 'ai-penalty-card-visible', 'ai-action-pending', 'ai-visible-hover', 'ai-uses-shared-action-executor', 'joint-active', 'template-reply-present', 'ai-reply-visible-once', 'ai-wrap-acknowledged', 'ai-penalty-completed', 'memory-card-visible', 'game-over', 'physics-stepping-after-lock', 'new-pulls-disabled', 'collapse-debris-produces-effects', 'shared-action-executor-idle'];

function update(w: AccWorld): void {
  w.physics.sync(w.engine.world, ++w.frame * 16.7);
  if (w.session.phase === 'collapse-locked') w.physicsAfterLock = true;
  w.executor.observePhysicalPull(); w.executor.observeTowerMembership();
  const signals = w.physics.drainSignals().filter((x) => x.signal === 'g105-toppled' || x.signal === 'g105-settled');
  const towerIds = TOWER_BLOCKS.filter((b) => !w.session.extractedBlocks.has(b.id)).map((b) => b.id);
  w.session.observePhysics(w.physics.areBodiesSleeping(towerIds), signals.filter((x) => x.signal === 'g105-toppled').map((x) => x.arg));
  w.session.observeSleepingExtractions(new Set(TOWER_BLOCKS.filter((block) => w.session.extractedBlocks.has(block.id) && w.physics.areBodiesSleeping([block.id])).map((block) => block.id)));
  if (w.session.phase === 'collapse-locked') {
    // This tick has already stepped Cannon before the lock was observed; later ticks continue
    // to call sync as well. Record that fact at the lock edge for the scenario's immediate read.
    w.physicsAfterLock = true;
    w.director.cancel(); w.executor.clear();
    // Acceptance uses the same no-host template path as the production game. The reply is
    // settled before the scripted player acknowledgement, never fabricated by the scenario.
    if (w.session.loser === 'ai' && !w.session.aiPenaltyCompleted) w.session.finishAIPenaltyReply();
    return;
  }
  if (w.session.phase === 'ai-response') {
    if (!w.session.aiReplyVisible) { w.session.templateReply = '本地模板回应。'; w.session.finishAIResponse(); }
    else w.session.advanceAIResponse();
    return;
  }
  w.director.tick(createLocalAIObservation({ phase: w.session.phase, turn: w.session.turn, layout: TOWER_BLOCKS, extractedIds: w.session.extractedBlocks, retiredIds: w.session.retiredBlocks, settledExtractionHistory: w.session.settledExtractionHistory, selectedBlockId: w.executor.selectedBlockId, consumedSignals: signals.map((x) => ({ signal: x.signal, blockId: x.arg })) }));
}

export function createWorld(_seed: number): AccWorld {
  const engine = new Engine(); engine.load(towerBlueprint());
  const session = new TowerGameSession();
  const w = { engine, physics: new PhysicsSystem(), session, frame: 0, physicsAfterLock: false, lastRetiredSelectionRejected: false } as AccWorld;
  w.executor = new TowerActionExecutor({ world: engine.world, session, invalidate: () => {}, restart: () => restart(w) });
  w.director = new AITurnDirector(w.executor);
  w.tick = () => update(w);
  w.getAllEntities = () => [...engine.world.getAllEntities(), ...ids.map((id) => `acc-${id}`)];
  w.getComponent = (id: string, type: string) => projection(w, id, type) ?? engine.world.getComponent(id, type as never);
  return w;
}

function drag(w: AccWorld, blockId: string, ratio: number, by: 'player' | 'ai'): void {
  w.lastRetiredSelectionRejected = false;
  if (!w.executor.execute(by, { type: 'grab', blockId })) {
    w.lastRetiredSelectionRejected = w.session.retiredBlocks.has(blockId);
    return;
  }
  // Calibrated against the fixed seed: use the production force with a 0.0735 anchor step and
  // keep the real point joint attached for 300 physical frames. The session still judges only
  // the measured body displacement; this never writes a transform or a success flag.
  const target = ratio >= .92 ? 2.352 : Math.max(0, Math.min(2.352, 2.1 * ratio));
  let heldFrames = 0;
  while (heldFrames++ < 300 && w.session.phase !== 'collapse-locked') {
    if (w.executor.requestedPullDistance < target) w.executor.execute(by, { type: 'pull', delta: Math.min(.0735, target - w.executor.requestedPullDistance) });
    w.tick();
  }
  w.executor.execute(by, { type: 'release' });
}

export function applySignal(w: AccWorld, signal: string, args: Record<string, unknown> = {}, by?: string): void {
  if (signal === 'tower.camera.orbit') { w.executor.execute('player', { type: 'observe', yaw: Number(args.deltaYaw) || 0, pitch: Number(args.deltaPitch) || 0 }); return; }
  if (signal === 'tower.interaction.complete') { w.session.resolveInteraction(true); return; }
  if (signal === 'tower.interaction.skip') { w.session.resolveInteraction(false); return; }
  if (signal === 'tower.interaction.swap') { w.session.swapInteraction(); return; }
  if (signal === 'tower.response.draft') { w.session.setDraftResponse(String(args.value ?? '')); return; }
  if (signal === 'tower.interaction.submit') { w.session.submitInteraction(); return; }
  if (signal === 'tower.wrap.submit') { w.session.submitWrapUp(); return; }
  if (signal === 'tower.wrap.skip') { w.session.skipWrapUp(); return; }
  if (signal === 'tower.wrap.continue') { w.session.acknowledgeAIWrap(); return; }
  if (signal === 'tower.restart') { restart(w); return; }
  if (signal !== 'tower.drag') throw new Error(`game-105 adapter: unknown action ${signal}`);
  drag(w, String(args.blockId || ''), Number(args.distanceRatio), by === 'ai' ? 'ai' : 'player');
}

function restart(w: AccWorld): void {
  w.director.cancel(); w.executor.clear(); for (const id of w.engine.world.getAllEntities()) w.engine.world.destroyEntity(id);
  w.physics.sync(w.engine.world, ++w.frame * 16.7); w.engine.load(towerBlueprint()); w.session.restart(); w.physicsAfterLock = false; w.lastRetiredSelectionRejected = false;
}

export function readWorld(w: AccWorld): Pick<AccWorld, 'getAllEntities' | 'getComponent'> { return w; }

function projection(w: AccWorld, id: string, type: string): unknown {
  if (!id.startsWith('acc-')) return undefined; const key = id.slice(4);
  if (type === 'StringVar') {
    if (key === 'phase') return { id: key, value: w.session.phase };
    if (key === 'turn') return { id: key, value: w.session.turn };
    if (key === 'loser') return { id: key, value: w.session.loser ?? '' };
    if (key === 'current-card-kind') return { id: key, value: w.session.interactionQueue[0]?.kind ?? w.session.aiInteractionQueue[0]?.kind ?? '' };
  }
  if (type === 'Resource') {
    if (key === 'heart-delta') return { id: key, current: w.session.heartDelta };
    if (key === 'loot-count') return { id: key, current: w.session.loot.length };
    if (key === 'round') return { id: key, current: w.session.round };
    if (key === 'player-draws') return { id: key, current: w.session.playerDraws };
    if (key === 'ai-draws') return { id: key, current: w.session.aiDraws };
    if (key === 'completed-interactions') return { id: key, current: w.session.completedInteractions };
    if (key === 'linked-extractions') return { id: key, current: w.session.linkedExtractions };
    if (key === 'draft-response-length') return { id: key, current: w.session.draftResponse.length };
    if (key === 'round-response-count') return { id: key, current: w.session.roundResponses.length };
    if (key === 'swaps-remaining') return { id: key, current: w.session.swapsRemaining };
    if (key === 'retired-block-count') return { id: key, current: w.session.retiredBlocks.size };
    if (key === 'current-card-sequence') return { id: key, current: w.session.interactionQueue[0]?.sequence ?? 0 };
    if (key === 'ai-wrap-count') return { id: key, current: w.session.aiWrapCount };
    if (key === 'ai-reply-count') return { id: key, current: w.session.aiReplyCount };
    if (key === 'ai-penalty-request-count') return { id: key, current: w.session.aiPenaltyRequestCount };
  }
  if (type === 'Flag') {
    const active: Record<string, boolean> = {
      'local-ai-ready': true, 'tower-stable': w.session.phase === 'player-ready', 'interaction-open': w.session.phase === 'player-interaction',
      'aftershock-summary-open': w.session.interactionQueue[0]?.kind === 'summary', 'ai-wrap-acknowledged': w.session.aiWrapAcknowledged,
      'current-card-is-unseen-same-channel': w.session.lastSwapWasUnseenSameChannel,
      'responses-are-session-only': true, 'local-ai-observation-has-no-physics-pose': true,
      'last-retired-selection-rejected': w.lastRetiredSelectionRejected,
      'ai-wrap-card-visible': w.session.phase === 'collapse-locked' && w.session.loser === 'ai',
      'ai-penalty-card-visible': w.session.phase === 'collapse-locked' && !!w.session.aiPenaltyCard,
      'ai-penalty-completed': w.session.aiPenaltyCompleted,
      'ai-reply-visible-once': w.session.aiReplyCount > 0,
      'memory-card-visible': w.session.heartDelta >= 8,
      'ai-action-pending': w.director.pending, 'ai-visible-hover': w.session.phase === 'ai-observe' || w.session.phase === 'ai-pulling',
      'ai-uses-shared-action-executor': w.session.turn === 'ai', 'joint-active': w.executor.isGrabbing, 'template-reply-present': !!w.session.templateReply,
      'game-over': w.session.phase === 'collapse-locked', 'physics-stepping-after-lock': w.physicsAfterLock, 'new-pulls-disabled': w.session.phase === 'collapse-locked',
      'collapse-debris-produces-effects': false, 'shared-action-executor-idle': !w.executor.isGrabbing,
    };
    if (key in active) return { id: key, active: active[key]! };
  }
  return undefined;
}
