import { World } from '@engine/core/world.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { NARRATIVE_READ_COMPLETE, storyRefKey,
  type NarrativeOutbox, type NarrativePackage, type NarrativeProjection, type StoryRuntime } from '@skills/tier3/narrative-director.js';

/** Opaque identity for one actually displayed projection, not proof that it has finished rendering. */
export interface PresentedStoryToken {
  readonly packageId: string;
  readonly entity: string;
  readonly refKey: string;
  readonly generation: number;
}

export type ReadGateResult =
  | { status: 'queued'; refKey: string }
  | { status: 'pending'; reason: 'input-busy' | 'input-unavailable' }
  | { status: 'ignored'; reason: 'stale' | 'already-queued' | 'invalid-projection' };

interface ActivePresentation {
  world: World;
  entity: string;
  source: NarrativePackage;
  runtime: StoryRuntime;
  projection: NarrativeProjection;
  token: PresentedStoryToken;
  queued: boolean;
  queuedAtSeq?: number;
}

/**
 * Host presentation seam. `begin` is called when a projection is displayed; it never marks it read.
 * Only the presentation layer may call `fullyPresented` after the final character is visible.
 * It does not tick the World or write Profile/Outbox; the Director is the final authority.
 */
export class PresentationReadGate {
  private active: ActivePresentation | undefined;
  private nextGeneration = 1;

  begin(world: World, entity: string): PresentedStoryToken | undefined {
    const source = world.peek<NarrativePackage>(entity, 'NarrativePackage');
    const runtime = world.peek<StoryRuntime>(entity, 'StoryRuntime');
    const projection = world.peek<NarrativeProjection>(entity, 'NarrativeProjection');
    const node = source?.package.chapters[projection?.chapterId ?? '']?.nodes[projection?.nodeId ?? ''];
    if (!source || !runtime || !projection || world.query('StoryRuntime').length !== 1 ||
        source.package.id !== runtime.packageId || projection.packageId !== runtime.packageId ||
        !node || node.kind === 'jump' || node.kind !== projection.kind ||
        runtime.current.chapterId !== projection.chapterId || runtime.current.nodeId !== projection.nodeId) {
      this.active = undefined;
      return undefined;
    }
    const refKey = storyRefKey(runtime.current);
    if (runtime.activeNodeKey !== refKey) { this.active = undefined; return undefined; }
    if (this.active?.world === world && this.active.entity === entity && this.active.source === source &&
        this.active.runtime === runtime && this.active.projection === projection &&
        this.active.token.refKey === refKey) return this.active.token;
    const token: PresentedStoryToken = Object.freeze({
      packageId: runtime.packageId, entity, refKey, generation: this.nextGeneration++,
    });
    this.active = { world, entity, source, runtime, projection, token, queued: false };
    return token;
  }

  fullyPresented(activeWorld: World, token: PresentedStoryToken): ReadGateResult {
    const active = this.active;
    if (!active || active.world !== activeWorld || active.token !== token)
      return { status: 'ignored', reason: 'stale' };
    const { entity, source, runtime, projection, token: current } = active;
    if (activeWorld.query('StoryRuntime').length !== 1 ||
        activeWorld.peek<NarrativePackage>(entity, 'NarrativePackage') !== source ||
        activeWorld.peek<StoryRuntime>(entity, 'StoryRuntime') !== runtime ||
        activeWorld.peek<NarrativeProjection>(entity, 'NarrativeProjection') !== projection ||
        runtime.packageId !== current.packageId || source.package.id !== current.packageId ||
        projection.packageId !== current.packageId || storyRefKey(runtime.current) !== current.refKey ||
        runtime.activeNodeKey !== current.refKey ||
        projection.chapterId !== runtime.current.chapterId || projection.nodeId !== runtime.current.nodeId)
      return { status: 'ignored', reason: 'stale' };
    const queues = activeWorld.query('InputQueue');
    if (queues.length !== 1) return { status: 'pending', reason: 'input-unavailable' };
    const [inputEntity] = queues[0];
    const queue = activeWorld.peek<InputQueue>(inputEntity, 'InputQueue');
    if (!queue || !Array.isArray(queue.actions)) return { status: 'ignored', reason: 'invalid-projection' };
    if (active.queued) {
      if (queue.actions.some(action => action.source === 'gal-presentation-read-gate' &&
          action.phase === 'action' && action.key === NARRATIVE_READ_COMPLETE && action.arg === current.refKey))
        return { status: 'ignored', reason: 'already-queued' };
      const outbox = activeWorld.peek<NarrativeOutbox>(entity, 'NarrativeOutbox');
      // The Director increments nextSeq when it consumes the read action. An ack may already
      // have cleared pending; nextSeq still proves consumption without a second read action.
      if (active.queuedAtSeq === undefined ||
          (outbox && (!Number.isSafeInteger(outbox.nextSeq) || outbox.packageId !== current.packageId)))
        return { status: 'ignored', reason: 'invalid-projection' };
      if (outbox && (outbox.nextSeq > active.queuedAtSeq || outbox.pending?.some(event =>
        event.kind === 'read-complete' && event.contentId === current.refKey && event.packageId === current.packageId)))
        return { status: 'ignored', reason: 'already-queued' };
    }
    if (queue.actions.length) return { status: 'pending', reason: 'input-busy' };
    const outbox = activeWorld.peek<NarrativeOutbox>(entity, 'NarrativeOutbox');
    if (outbox && (!Number.isSafeInteger(outbox.nextSeq) || outbox.nextSeq < 1 ||
        outbox.packageId !== current.packageId))
      return { status: 'ignored', reason: 'invalid-projection' };
    if (outbox?.pending?.some(event => event.kind === 'read-complete' &&
        event.contentId === current.refKey && event.packageId === current.packageId))
      return { status: 'ignored', reason: 'already-queued' };
    activeWorld.addComponent<InputQueue>(inputEntity, { type: 'InputQueue', actions: [
      { source: 'gal-presentation-read-gate', phase: 'action', key: NARRATIVE_READ_COMPLETE, arg: current.refKey },
    ] });
    active.queued = true;
    active.queuedAtSeq = outbox?.nextSeq ?? 1;
    return { status: 'queued', refKey: current.refKey };
  }
}
