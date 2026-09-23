/** Render-only projection for a state change that has already committed in a simulation. */
export type CommittedTransition<Snapshot> = Readonly<{ kind: string; before: Snapshot; after: Snapshot }>;
/** A per-game closed vocabulary: every referenced phase must be declared here. */
export type PresentationCatalog = Readonly<{ phases: readonly string[]; sequences: Readonly<Record<string, readonly string[]>>; settledPhases: readonly string[] }>;
export type PresentationReject = Readonly<{ accepted: false; reason: string }>;
export type PresentationAccepted<Snapshot> = Readonly<{ accepted: true; controller: CommittedTransitionController<Snapshot> }>;
export type PresentationProjection<Snapshot> = PresentationReject | PresentationAccepted<Snapshot>;

function catalogProblem(catalog: PresentationCatalog): string | undefined {
  const phases = new Set(catalog.phases);
  if (phases.size === 0) return 'phase vocabulary is empty';
  if (catalog.settledPhases.length === 0 || catalog.settledPhases.some((phase) => !phases.has(phase))) return 'settled phase is outside vocabulary';
  for (const [kind, sequence] of Object.entries(catalog.sequences)) {
    if (!kind || sequence.length === 0) return `invalid sequence for ${kind || '(empty kind)'}`;
    if (sequence.some((phase) => !phases.has(phase))) return `sequence ${kind} references an unknown phase`;
    if (!catalog.settledPhases.includes(sequence[sequence.length - 1]!)) return `sequence ${kind} does not end in a settled phase`;
  }
  return undefined;
}

/** Moving the cursor changes only this render-side object; normal, skip, and reduced-motion share `after`. */
export class CommittedTransitionController<Snapshot> {
  private cursor = 0;
  constructor(readonly catalog: PresentationCatalog, readonly transition: CommittedTransition<Snapshot>, readonly reducedMotion: boolean) {}
  get sequence(): readonly string[] { return this.catalog.sequences[this.transition.kind]!; }
  get phase(): string { return this.sequence[this.cursor]!; }
  get after(): Snapshot { return this.transition.after; }
  get settled(): boolean { return this.catalog.settledPhases.includes(this.phase); }
  advance(): string { if (!this.settled) this.cursor += 1; return this.phase; }
  skip(): string { this.cursor = this.sequence.length - 1; return this.phase; }
}

/** Fail-closed construction. Caller owns optional DebugTrace.reject because this service never touches a World. */
export function projectCommittedTransition<Snapshot>(catalog: PresentationCatalog, transition: CommittedTransition<Snapshot>, reducedMotion = false): PresentationProjection<Snapshot> {
  const problem = catalogProblem(catalog);
  if (problem) return { accepted: false, reason: problem };
  if (!Object.prototype.hasOwnProperty.call(catalog.sequences, transition.kind)) return { accepted: false, reason: `unknown committed transition kind: ${transition.kind}` };
  return { accepted: true, controller: new CommittedTransitionController(catalog, transition, reducedMotion) };
}

/** Optional opt-in trace bridge; the only World write is DebugTrace, which is excluded from hashes. */
export function projectCommittedTransitionWithTrace<Snapshot>(world: IWorld, catalog: PresentationCatalog, transition: CommittedTransition<Snapshot>, reducedMotion = false): PresentationProjection<Snapshot> {
  const result = projectCommittedTransition(catalog, transition, reducedMotion);
  if (!result.accepted) {
    const trace = findDebugTrace(world);
    appendTrace(trace, trace?.tick ?? 0, 'committed-transition', 'reject', `projection rejected: ${transition.kind}`, result.reason);
  }
  return result;
}
import type { IWorld } from '@engine/core/types.js';
import { appendTrace, findDebugTrace } from '@skills/debug-trace.js';
