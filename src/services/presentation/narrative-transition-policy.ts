import type { IWorld } from '@engine/core/types.js';
import { appendTrace, findDebugTrace } from '@skills/debug-trace.js';
import { projectCommittedTransition, type CommittedTransitionController, type PresentationCatalog } from './committed-transition.js';

/** Closed presentation vocabulary. Callers map their own package enum onto this; the service stores neither a GalPackage nor a Profile. */
export type NarrativeTransitionKind = 'cut' | 'fade' | 'wipe' | 'dissolve';
export type NarrativeTransitionSource = Readonly<{
  packageId: string;
  chapterId: string;
  nodeId: string;
  transition?: NarrativeTransitionKind;
}>;
export type NarrativeTransitionPreferences = Readonly<{ enabled: boolean; reducedMotion: boolean }>;
export type NarrativeTransitionRef = Readonly<{ packageId: string; chapterId: string; nodeId: string }>;
export type NarrativeTransitionPhase = 'settled' | 'fade-out' | 'fade-in' | 'wipe' | 'dissolve';
export type NarrativeTransitionFrame = Readonly<{
  from: NarrativeTransitionRef | null;
  to: NarrativeTransitionRef;
  declared: NarrativeTransitionKind;
  effective: NarrativeTransitionKind;
  phase: NarrativeTransitionPhase;
  settled: boolean;
}>;
/** Identity, rather than a numeric epoch, prevents a callback from another host being accepted. */
export type NarrativeTransitionToken = Readonly<{ readonly kind: 'narrative-transition-token' }>;
export type NarrativeTransitionReject = 'disposed' | 'inactive' | 'stale-token' | 'invalid-source' | 'invalid-preferences';
export type NarrativeTransitionResult =
  | Readonly<{ accepted: true; token: NarrativeTransitionToken; frame: NarrativeTransitionFrame }>
  | Readonly<{ accepted: false; reason: NarrativeTransitionReject }>;

const CATALOG: PresentationCatalog = {
  phases: ['settled', 'fade-out', 'fade-in', 'wipe', 'dissolve'],
  sequences: {
    cut: ['settled'],
    fade: ['fade-out', 'fade-in', 'settled'],
    wipe: ['wipe', 'settled'],
    dissolve: ['dissolve', 'settled'],
  },
  settledPhases: ['settled'],
};
const KINDS: readonly NarrativeTransitionKind[] = ['cut', 'fade', 'wipe', 'dissolve'];

function sourceRef(source: NarrativeTransitionSource): NarrativeTransitionRef | null {
  if (!source || typeof source.packageId !== 'string' || !source.packageId ||
      typeof source.chapterId !== 'string' || !source.chapterId ||
      typeof source.nodeId !== 'string' || !source.nodeId) return null;
  return Object.freeze({ packageId: source.packageId, chapterId: source.chapterId, nodeId: source.nodeId });
}

function validPreferences(value: NarrativeTransitionPreferences): boolean {
  return !!value && typeof value.enabled === 'boolean' && typeof value.reducedMotion === 'boolean';
}

function note(world: IWorld | undefined, kind: 'reject' | 'decision' | 'transition', what: string, why?: string): void {
  if (!world) return;
  const trace = findDebugTrace(world);
  if (!trace) return;
  appendTrace(trace, trace.tick ?? 0, 'narrative-transition', kind, what, why);
}

/** Render-only lifecycle. The host advances phases; this service owns no timer, DOM, World or Profile. */
export class NarrativeTransitionPolicy {
  private active: { token: NarrativeTransitionToken; from: NarrativeTransitionRef | null;
    to: NarrativeTransitionRef; declared: NarrativeTransitionKind; effective: NarrativeTransitionKind;
    controller: CommittedTransitionController<NarrativeTransitionRef | null> } | null = null;
  private disposed = false;

  get frame(): NarrativeTransitionFrame | null { return this.active ? this.snapshot() : null; }

  /** Every call invalidates the previous token, including replay/load of the very same StoryRef. */
  project(source: NarrativeTransitionSource, preferences: NarrativeTransitionPreferences, world?: IWorld): NarrativeTransitionResult {
    if (this.disposed) return this.reject(world, 'disposed');
    const from = this.active?.to ?? null;
    this.active = null;
    const to = sourceRef(source);
    if (!to || (source.transition !== undefined && !KINDS.includes(source.transition))) return this.reject(world, 'invalid-source');
    if (!validPreferences(preferences)) return this.reject(world, 'invalid-preferences');
    const declared = source.transition ?? 'cut';
    // Disabled wins over reduced motion; both collapse presentation to the same committed result.
    const effective: NarrativeTransitionKind = !preferences.enabled || preferences.reducedMotion ? 'cut' : declared;
    const projection = projectCommittedTransition<NarrativeTransitionRef | null>(CATALOG, { kind: effective, before: from, after: to });
    if (!projection.accepted) return this.reject(world, 'invalid-source');
    const token: NarrativeTransitionToken = Object.freeze({ kind: 'narrative-transition-token' });
    this.active = { token, from, to, declared, effective, controller: projection.controller };
    if (effective !== declared) note(world, 'decision', `effective ${effective}`, declared);
    return { accepted: true, token, frame: this.snapshot() };
  }

  /** A settings change cancels in-flight motion and settles; enabling never replays an old scene. */
  setPreferences(token: NarrativeTransitionToken, preferences: NarrativeTransitionPreferences, world?: IWorld): NarrativeTransitionResult {
    const active = this.current(token, world);
    if (!active.accepted) return active;
    if (!validPreferences(preferences)) { this.stop(); return this.reject(world, 'invalid-preferences'); }
    const old = this.active!;
    const before = old.controller.phase;
    const next: NarrativeTransitionToken = Object.freeze({ kind: 'narrative-transition-token' });
    const phase = old.controller.skip();
    const effective: NarrativeTransitionKind = !preferences.enabled || preferences.reducedMotion ? 'cut' : old.declared;
    this.active = { ...old, token: next, effective };
    if (phase !== before || effective !== old.effective) note(world, 'transition', `${before}→${phase}`, effective);
    return { accepted: true, token: next, frame: this.snapshot() };
  }

  advance(token: NarrativeTransitionToken, world?: IWorld): NarrativeTransitionResult {
    const active = this.current(token, world);
    if (!active.accepted) return active;
    const before = this.active!.controller.phase;
    const phase = this.active!.controller.advance();
    if (phase !== before) note(world, 'transition', `${before}→${phase}`);
    return { accepted: true, token, frame: this.snapshot() };
  }

  skip(token: NarrativeTransitionToken, world?: IWorld): NarrativeTransitionResult {
    const active = this.current(token, world);
    if (!active.accepted) return active;
    const before = this.active!.controller.phase;
    const phase = this.active!.controller.skip();
    if (phase !== before) note(world, 'transition', `${before}→${phase}`, 'skip');
    return { accepted: true, token, frame: this.snapshot() };
  }

  /** Rollback, load, replay, unmount and failure may all stop here before any new projection. */
  stop(): void { this.active = null; }
  dispose(): void { this.stop(); this.disposed = true; }

  private reject(world: IWorld | undefined, reason: NarrativeTransitionReject): NarrativeTransitionResult {
    note(world, 'reject', 'projection rejected', reason);
    return { accepted: false, reason };
  }

  private current(token: NarrativeTransitionToken, world?: IWorld): NarrativeTransitionResult {
    if (this.disposed) return this.reject(world, 'disposed');
    if (!this.active) return this.reject(world, 'inactive');
    if (this.active.token !== token) return this.reject(world, 'stale-token');
    return { accepted: true, token, frame: this.snapshot() };
  }

  private snapshot(): NarrativeTransitionFrame {
    const active = this.active!;
    return Object.freeze({ from: active.from, to: active.to, declared: active.declared,
      effective: active.effective, phase: active.controller.phase as NarrativeTransitionPhase,
      settled: active.controller.settled });
  }
}
