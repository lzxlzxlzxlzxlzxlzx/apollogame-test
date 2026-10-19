import type { GalPackage } from '@engine/protocol/galgame.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { World } from '@engine/core/world.js';
import { canonicalEntity } from '@net/determinism.js';
import { NARRATIVE_ACK, readNarrativeEvents, storyRefKey,
  type NarrativeMilestone, type NarrativeOutbox, type NarrativePackage, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import type { SavePort } from '../save/save-port.js';
import { CorruptSaveError } from '../save/envelope.js';
import { loadGalProfile, markRead, saveGalProfile, serialGalProfile, unlock, type GalProfile } from './gal-profile.js';

export type GalMilestoneDrainResult =
  | { status: 'empty' }
  | { status: 'ack-queued'; throughSeq: number; processed: number }
  | { status: 'saved-pending-ack'; throughSeq: number; processed: number;
      reason: 'stale-world'|'input-busy'|'input-unavailable' }
  | { status: 'failed'; stage: 'validate'|'load'|'save'; error: unknown };

function sourceAt(world: World, entity: string, pkg: GalPackage):
  { runtime: StoryRuntime; source: NarrativePackage; outbox?: NarrativeOutbox } | undefined {
  if (world.query('StoryRuntime').length !== 1 || world.query('NarrativeOutbox').length > 1) return undefined;
  const runtime = world.peek<StoryRuntime>(entity, 'StoryRuntime');
  const source = world.peek<NarrativePackage>(entity, 'NarrativePackage');
  const outbox = world.peek<NarrativeOutbox>(entity, 'NarrativeOutbox');
  if (!runtime || !source || runtime.packageId !== pkg.id || source.package.id !== pkg.id ||
      (outbox && outbox.packageId !== pkg.id))
    return undefined;
  // An ID alone cannot distinguish a restored World from another publication of the same package.
  try {
    const identity = (value: GalPackage) => canonicalEntity('package',
      [['NarrativePackage', { type: 'NarrativePackage', package: value }]]);
    if (identity(source.package) !== identity(pkg)) return undefined;
  } catch { return undefined; }
  return { runtime, source, outbox };
}
function validEvent(pkg: GalPackage, event: NarrativeMilestone): boolean {
  if (event.packageId !== pkg.id || event.id !== JSON.stringify([pkg.id, event.kind, event.contentId])) return false;
  const node = pkg.chapters[event.ref.chapterId]?.nodes[event.ref.nodeId];
  if (!node) return false;
  switch (event.kind) {
    case 'reach-node': return event.contentId === storyRefKey(event.ref);
    case 'read-complete': return node.kind !== 'jump' && event.contentId === storyRefKey(event.ref);
    case 'reach-ending': return node.kind === 'ending' && node.ending === event.contentId && Object.hasOwn(pkg.endings, event.contentId);
    case 'unlockCg': return Object.hasOwn(pkg.media.cg, event.contentId);
    case 'unlockMemory': return Object.hasOwn(pkg.gallery.memories, event.contentId);
    case 'unlockMusic': return Object.hasOwn(pkg.gallery.music, event.contentId);
  }
}
function fold(pkg: GalPackage, profile: GalProfile, events: readonly NarrativeMilestone[]): GalProfile {
  let next = profile;
  for (const event of events) {
    switch (event.kind) {
      case 'reach-node': break; // Arrival is not proof that the player finished reading.
      case 'read-complete': next = markRead(next, pkg, event.ref); break;
      case 'reach-ending': next = unlock(next, pkg, 'ending', event.contentId); break;
      case 'unlockCg': next = unlock(next, pkg, 'cg', event.contentId); break;
      case 'unlockMemory': next = unlock(next, pkg, 'memory', event.contentId); break;
      case 'unlockMusic': next = unlock(next, pkg, 'music', event.contentId); break;
    }
  }
  return next;
}
function prefixStillCurrent(world: World, entity: string, pkg: GalPackage,
  captured: { runtime: StoryRuntime; source: NarrativePackage; outbox: NarrativeOutbox },
  events: readonly NarrativeMilestone[]): boolean {
  const current = sourceAt(world, entity, pkg);
  if (!current || current.runtime !== captured.runtime || current.source !== captured.source ||
      current.outbox !== captured.outbox) return false;
  try {
    const pending = readNarrativeEvents(world.readView(), entity);
    return pending.length >= events.length && events.every((event, index) => JSON.stringify(pending[index]) === JSON.stringify(event));
  } catch { return false; }
}

/** Host-side at-least-once bridge. It never ticks the World or writes narrative components. */
export class GalNarrativeProfileBridge {
  constructor(private readonly pkg: GalPackage, private readonly port: SavePort) {}

  async drain(world: World, entity: string, savedAt: number): Promise<GalMilestoneDrainResult> {
    return serialGalProfile(this.pkg.id, async () => {
      if (!Number.isSafeInteger(savedAt) || savedAt < 0)
        return { status: 'failed', stage: 'validate', error: new CorruptSaveError('GAL 档案 savedAt 无效') };
      const captured = sourceAt(world, entity, this.pkg);
      if (!captured) return { status: 'failed', stage: 'validate', error: new CorruptSaveError('GAL 剧情实体或 package 身份无效') };
      if (!captured.outbox) return { status: 'empty' };
      let events: readonly NarrativeMilestone[];
      try {
        events = readNarrativeEvents(world.readView(), entity);
        if (!events.every(event => validEvent(this.pkg, event)))
          throw new CorruptSaveError('GAL 里程碑身份、StoryRef 或目录引用无效');
      } catch (error) { return { status: 'failed', stage: 'validate', error }; }
      if (!events.length) return { status: 'empty' };
      let profile: GalProfile;
      try { profile = await loadGalProfile(this.port, this.pkg); }
      catch (error) { return { status: 'failed', stage: 'load', error }; }
      const throughSeq = events[events.length - 1].seq;
      const processed = events.length;
      try { await saveGalProfile(this.port, this.pkg, fold(this.pkg, profile, events), savedAt); }
      catch (error) { return { status: 'failed', stage: 'save', error }; }
      if (!prefixStillCurrent(world, entity, this.pkg, { ...captured, outbox: captured.outbox }, events))
        return { status: 'saved-pending-ack', throughSeq, processed, reason: 'stale-world' };
      const queues = world.query('InputQueue');
      if (queues.length !== 1)
        return { status: 'saved-pending-ack', throughSeq, processed, reason: 'input-unavailable' };
      const [inputEntity] = queues[0];
      const queue = world.peek<InputQueue>(inputEntity, 'InputQueue')!;
      if (queue.actions.length)
        return { status: 'saved-pending-ack', throughSeq, processed, reason: 'input-busy' };
      world.addComponent<InputQueue>(inputEntity, { type: 'InputQueue', actions: [
        { source: 'gal-profile-bridge', phase: 'action', key: NARRATIVE_ACK, arg: String(throughSeq) },
      ] });
      return { status: 'ack-queued', throughSeq, processed };
    });
  }
}
