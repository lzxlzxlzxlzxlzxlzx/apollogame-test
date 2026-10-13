import { World } from '@engine/core/world.js';
import type { InputQueue } from '@engine/protocol/components.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { NARRATIVE_ACK, NARRATIVE_ADVANCE, NARRATIVE_BACK, NARRATIVE_CHOOSE, createStoryRuntime,
  narrativeDirectorCapability, readNarrativeEvents, type NarrativePackage,
  type NarrativeProjection, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { parseGalProfile, type GalProfile } from '../gal-profile/gal-profile.js';

export type GalReplayFailure = 'busy' | 'package-mismatch' | 'locked' | 'bad-entry' | 'missing-resource' | 'runtime-error';
export type GalReplayOpen = { readonly status: 'opened'; readonly session: GalReplaySession } |
  { readonly status: 'rejected'; readonly reason: GalReplayFailure };
export type GalReplayStep = { readonly status: 'applied' | 'complete' } |
  { readonly status: 'rejected'; readonly reason: string };

/** Private narrative container. It deliberately has no SavePort, Profile bridge or active World reference. */
export class GalReplaySession {
  private closed = false;
  private constructor(readonly packageId: string, readonly memoryId: string,
    readonly world: World, readonly entity: string, private readonly input: string) {}

  static open(pkg: GalPackage, profile: GalProfile, memoryId: string, baseline: World): GalReplayOpen {
    if (profile.packageId !== pkg.id) return { status: 'rejected', reason: 'package-mismatch' };
    const sources = baseline.query('NarrativePackage');
    const runtimes = baseline.query('StoryRuntime');
    if (sources.length !== 1 || runtimes.length !== 1 ||
        baseline.peek<NarrativePackage>(sources[0]![0], 'NarrativePackage')?.package.id !== pkg.id ||
        baseline.peek<StoryRuntime>(runtimes[0]![0], 'StoryRuntime')?.packageId !== pkg.id)
      return { status: 'rejected', reason: 'package-mismatch' };
    let canonical: GalProfile;
    try { canonical = parseGalProfile(profile, pkg); }
    catch { return { status: 'rejected', reason: 'package-mismatch' }; }
    const memory = Object.hasOwn(pkg.gallery.memories, memoryId) ? pkg.gallery.memories[memoryId] : undefined;
    if (!memory || !canonical.unlockedMemoryIds.includes(memoryId)) return { status: 'rejected', reason: 'locked' };
    const node = pkg.chapters[memory.entry.chapterId]?.nodes[memory.entry.nodeId];
    if (!node) return { status: 'rejected', reason: 'bad-entry' };
    try {
      const world = new World();
      for (const system of narrativeDirectorCapability.systems) world.addSystem(system);
      const occupied = new Set<string>();
      // Only deterministic story inputs are copied. Neither active runtime/history/outbox nor saves are inherited.
      for (const [id, components] of Object.entries(baseline.snapshot())) {
        for (const type of ['Resource', 'Flag', 'RandomSeed'] as const) {
          const component = components[type];
          if (!component) continue;
          if (!occupied.has(id)) { world.createEntity(id); occupied.add(id); }
          world.addComponent(id, component);
        }
      }
      let entity = '__gal_replay_story__';
      while (occupied.has(entity)) entity += '_';
      world.createEntity(entity);
      occupied.add(entity);
      world.addComponent(entity, { type: 'NarrativePackage', package: pkg });
      world.addComponent(entity, { ...createStoryRuntime(pkg), current: { ...memory.entry } });
      let input = '__gal_replay_input__';
      while (occupied.has(input)) input += '_';
      world.createEntity(input);
      world.addComponent<InputQueue>(input, { type: 'InputQueue', actions: [] });
      world.tick();
      const projection = world.peek<NarrativeProjection>(entity, 'NarrativeProjection');
      const runtime = world.peek<StoryRuntime>(entity, 'StoryRuntime');
      if (!projection || projection.packageId !== pkg.id || runtime?.lastReceipt?.status === 'rejected')
        return { status: 'rejected', reason: 'missing-resource' };
      const session = new GalReplaySession(pkg.id, memoryId, world, entity, input);
      if (!session.discardPrivateMilestones()) return { status: 'rejected', reason: 'runtime-error' };
      return { status: 'opened', session };
    } catch { return { status: 'rejected', reason: 'runtime-error' }; }
  }

  get projection(): NarrativeProjection | undefined {
    return this.closed ? undefined : this.world.peek<NarrativeProjection>(this.entity, 'NarrativeProjection');
  }

  /** Acknowledge only inside this private World; never dispatch to the global Profile bridge. */
  private discardPrivateMilestones(): boolean {
    const pending = readNarrativeEvents(this.world, this.entity);
    if (!pending.length) return true;
    this.world.addComponent<InputQueue>(this.input, { type: 'InputQueue', actions: [
      { source: 'gal-replay', phase: 'action', key: NARRATIVE_ACK, arg: String(pending[pending.length - 1]!.seq) },
    ] });
    this.world.tick();
    this.world.addComponent<InputQueue>(this.input, { type: 'InputQueue', actions: [] });
    return this.world.peek<StoryRuntime>(this.entity, 'StoryRuntime')?.lastReceipt?.status === 'applied';
  }

  step(action: string, arg?: string): GalReplayStep {
    if (this.closed) return { status: 'rejected', reason: 'closed' };
    if (action !== NARRATIVE_ADVANCE && action !== NARRATIVE_BACK && action !== NARRATIVE_CHOOSE)
      return { status: 'rejected', reason: 'invalid-action' };
    const projection = this.projection;
    if (!projection || projection.packageId !== this.packageId) return { status: 'rejected', reason: 'missing-resource' };
    if (action === NARRATIVE_ADVANCE && projection.kind === 'ending') return { status: 'complete' };
    if (action === NARRATIVE_CHOOSE && !projection.options?.some(option => option.id === arg && option.available))
      return { status: 'rejected', reason: 'invalid-choice' };
    const queue = this.world.peek<InputQueue>(this.input, 'InputQueue');
    if (!queue || queue.actions.length) return { status: 'rejected', reason: 'busy' };
    try {
      this.world.addComponent<InputQueue>(this.input, { type: 'InputQueue', actions: [
        { source: 'gal-replay', phase: 'action', key: action, ...(arg === undefined ? {} : { arg }) },
      ] });
      this.world.tick();
      this.world.addComponent<InputQueue>(this.input, { type: 'InputQueue', actions: [] });
      const runtime = this.world.peek<StoryRuntime>(this.entity, 'StoryRuntime');
      if (!this.projection || !runtime || runtime.lastReceipt?.status === 'rejected')
        return { status: 'rejected', reason: runtime?.lastReceipt?.reason ?? 'missing-resource' };
      if (!this.discardPrivateMilestones()) return { status: 'rejected', reason: 'bad-outbox' };
      return { status: 'applied' };
    } catch {
      this.close();
      return { status: 'rejected', reason: 'runtime-error' };
    }
  }

  close(): void { this.closed = true; }
}
