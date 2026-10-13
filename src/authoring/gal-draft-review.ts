import {
  canonicalGalDraftJson, galDraftContentHash, validateGalDraftData,
  type GalDraftReferences,
} from './gal-draft-validate.js';
import {
  GAL_DRAFT_KINDS,
  type GalDraftCheck, type GalDraftDataByKind, type GalDraftEligibility,
  type GalDraftIssue, type GalDraftKind, type GalDraftLedger, type GalDraftRecord,
  type GalDraftStatus, type GalDraftView, type GalReviewEvent,
} from './gal-draft-types.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KINDS: readonly GalDraftKind[] = GAL_DRAFT_KINDS;
const SHA = /^sha256:[0-9a-f]{64}$/;
const issue = (path: string, code: string, message: string): GalDraftIssue => ({ path, code, message, severity: 'error' });
const check = (issues: GalDraftIssue[]): GalDraftCheck => ({ ok: issues.length === 0, issues: issues.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en')) });
const id = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 10_000;

function frozen<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function ledgerOf(drafts: readonly GalDraftRecord[], events: readonly GalReviewEvent[]): GalDraftLedger {
  return Object.freeze({ drafts: Object.freeze([...drafts]), events: Object.freeze([...events]) });
}

export function emptyGalDraftLedger(): GalDraftLedger { return ledgerOf([], []); }

/** Events, not user/model envelope fields, are the only source of review state. */
export function galDraftStatus(ledger: GalDraftLedger, projectId: string, draftId: string): GalDraftStatus | undefined {
  if (!ledger.drafts.some((draft) => draft.projectId === projectId && draft.draftId === draftId)) return undefined;
  let status: GalDraftStatus = 'draft';
  for (const event of ledger.events) {
    if (event.projectId !== projectId || event.draftId !== draftId) continue;
    if (event.action === 'approve') status = 'approved';
    else if (event.action === 'reject') status = 'rejected';
    else if (event.action === 'supersede' || event.action === 'revoke') status = 'superseded';
  }
  return status;
}

function activeApproved(ledger: GalDraftLedger, projectId: string, kind: GalDraftKind): GalDraftRecord | undefined {
  return ledger.drafts.find((draft) => draft.projectId === projectId && draft.kind === kind && galDraftStatus(ledger, projectId, draft.draftId) === 'approved');
}

function validHash(draft: GalDraftRecord): boolean {
  try { return SHA.test(draft.contentHash) && galDraftContentHash(draft) === draft.contentHash; }
  catch { return false; }
}

function validRecord(draft: GalDraftRecord): boolean {
  return validHash(draft) && validateGalDraftData(draft.kind, draft.data).ok;
}

/** Current means approved and every directly pinned upstream is still its current approved version. */
export function galDraftEligibility(ledger: GalDraftLedger, projectId: string, draftId: string): GalDraftEligibility | undefined {
  const draft = ledger.drafts.find((item) => item.projectId === projectId && item.draftId === draftId);
  if (!draft) return undefined;
  const status = galDraftStatus(ledger, projectId, draftId);
  if (status === 'draft' || status === 'rejected') return 'blocked';
  const index = KINDS.indexOf(draft.kind);
  if (index > 0) {
    const predecessor = activeApproved(ledger, draft.projectId, KINDS[index - 1]!);
    if (!predecessor || !validRecord(predecessor)) return 'blocked';
    if (draft.basedOn.length !== 1 || draft.basedOn[0] !== predecessor.draftId) return 'stale';
    const upstream = galDraftEligibility(ledger, projectId, predecessor.draftId);
    if (upstream !== 'current') return upstream === 'blocked' ? 'blocked' : 'stale';
  }
  if (status === 'superseded') return 'stale';
  const active = activeApproved(ledger, draft.projectId, draft.kind);
  return active?.draftId === draftId && validRecord(draft) ? 'current' : 'stale';
}

export function currentApprovedGalDraft(ledger: GalDraftLedger, projectId: string, kind: GalDraftKind): GalDraftRecord | undefined {
  const draft = activeApproved(ledger, projectId, kind);
  return draft && galDraftEligibility(ledger, projectId, draft.draftId) === 'current' ? draft : undefined;
}

export function galDraftView(ledger: GalDraftLedger, projectId: string, draftId: string): GalDraftView | undefined {
  const draft = ledger.drafts.find((item) => item.projectId === projectId && item.draftId === draftId);
  const status = draft && galDraftStatus(ledger, projectId, draftId), eligibility = draft && galDraftEligibility(ledger, projectId, draftId);
  if (!draft || !status || !eligibility) return undefined;
  return frozen({ ...draft, status, eligibility, reviewNotes: ledger.events.filter((event) => event.projectId === projectId && event.draftId === draftId).map((event) => event.reason) });
}

function approvedChain(ledger: GalDraftLedger, direct: GalDraftRecord | undefined): GalDraftReferences {
  const chain: Partial<Record<GalDraftKind, GalDraftRecord>> = {};
  let cursor = direct;
  while (cursor) {
    chain[cursor.kind] = cursor;
    cursor = cursor.basedOn[0] ? ledger.drafts.find((item) => item.projectId === cursor!.projectId && item.draftId === cursor!.basedOn[0]) : undefined;
  }
  return {
    ...(chain.brief ? { brief: chain.brief.data as GalDraftDataByKind['brief'], briefDraftId: chain.brief.draftId } : {}),
    ...(chain.bible ? { bible: chain.bible.data as GalDraftDataByKind['bible'], bibleDraftId: chain.bible.draftId } : {}),
    ...(chain.routes ? { routes: chain.routes.data as GalDraftDataByKind['routes'], routesDraftId: chain.routes.draftId } : {}),
    ...(chain.graph ? { graph: chain.graph.data as GalDraftDataByKind['graph'], graphDraftId: chain.graph.draftId } : {}),
  };
}

export interface GalTrustedSubmission<K extends GalDraftKind = GalDraftKind> {
  readonly projectId: string;
  readonly kind: K;
  readonly draftId: string;
  readonly revision: number;
  readonly basedOn: readonly string[];
  readonly summary: string;
}

export interface GalDraftTransition {
  readonly ok: boolean;
  readonly ledger: GalDraftLedger;
  readonly issues: readonly GalDraftIssue[];
  readonly draft?: GalDraftRecord;
  readonly events?: readonly GalReviewEvent[];
}

/** Caller supplies trusted identity metadata; an untrusted model may only supply data. No IO/auth is performed here. */
export function submitGalDraftData(ledger: GalDraftLedger, meta: GalTrustedSubmission, data: unknown): GalDraftTransition {
  const issues: GalDraftIssue[] = [];
  if (!id(meta.projectId)) issues.push(issue('$.projectId', 'id', 'must be a safe project ID'));
  if (!KINDS.includes(meta.kind)) issues.push(issue('$.kind', 'enum', 'unknown draft kind'));
  if (!id(meta.draftId)) issues.push(issue('$.draftId', 'id', 'must be a safe draft ID'));
  if (!Number.isSafeInteger(meta.revision) || meta.revision < 1) issues.push(issue('$.revision', 'integer', 'must be a positive safe integer'));
  if (!nonempty(meta.summary)) issues.push(issue('$.summary', 'text', 'must be non-empty text'));
  if (!Array.isArray(meta.basedOn)) issues.push(issue('$.basedOn', 'array', 'must be an array'));
  else if (meta.basedOn.length !== (meta.kind === 'brief' ? 0 : 1)) issues.push(issue('$.basedOn', 'arity', 'P0 has no upstream; P1–P4 have exactly one'));
  else meta.basedOn.forEach((entry, i) => { if (!id(entry)) issues.push(issue(`$.basedOn[${i}]`, 'id', 'must be a safe draft ID')); });
  if (ledger.drafts.some((draft) => draft.projectId === meta.projectId && draft.draftId === meta.draftId)) issues.push(issue('$.draftId', 'duplicate', 'draftId must be unique within project'));
  const previous = ledger.drafts.filter((draft) => draft.projectId === meta.projectId && draft.kind === meta.kind);
  if (previous.some((draft) => draft.revision === meta.revision) || (previous.length && meta.revision <= Math.max(...previous.map((draft) => draft.revision)))) issues.push(issue('$.revision', 'sequence', 'revision must increase monotonically within project/kind'));
  let predecessor: GalDraftRecord | undefined;
  const index = KINDS.indexOf(meta.kind);
  if (index > 0 && Array.isArray(meta.basedOn) && meta.basedOn.length === 1) {
    predecessor = ledger.drafts.find((draft) => draft.draftId === meta.basedOn[0] && draft.projectId === meta.projectId);
    if (!predecessor || predecessor.kind !== KINDS[index - 1]) issues.push(issue('$.basedOn[0]', 'reference', 'must name same-project direct upstream kind'));
    else if (!validHash(predecessor)) issues.push(issue('$.basedOn[0]', 'hash', 'upstream content hash is invalid'));
    else if (currentApprovedGalDraft(ledger, meta.projectId, predecessor.kind)?.draftId !== predecessor.draftId) issues.push(issue('$.basedOn[0]', 'eligibility', 'upstream must be current approved'));
  }
  if (issues.length) return { ok: false, ledger, issues: check(issues).issues };
  const checked = validateGalDraftData(meta.kind, data, approvedChain(ledger, predecessor));
  if (!checked.ok) return { ok: false, ledger, issues: checked.issues };
  const copied = JSON.parse(canonicalGalDraftJson(data)) as GalDraftDataByKind[GalDraftKind];
  const draft = frozen({
    schemaVersion: 1 as const, kind: meta.kind, projectId: meta.projectId,
    draftId: meta.draftId, revision: meta.revision, basedOn: [...meta.basedOn],
    contentHash: galDraftContentHash({ schemaVersion: 1, kind: meta.kind, projectId: meta.projectId, basedOn: meta.basedOn, data: copied }),
    summary: meta.summary, data: copied,
  });
  return { ok: true, ledger: ledgerOf([...ledger.drafts, draft], ledger.events), issues: checked.issues, draft };
}

export interface GalReviewDecision {
  readonly eventId: string;
  readonly action: 'approve' | 'reject' | 'revoke';
  readonly projectId: string;
  readonly draftId: string;
  readonly reviewerId: string;
  readonly reviewerRole: 'reviewer' | 'owner';
  readonly reason: string;
}

/** Trusted review event reducer. Authorization of the human is the future adapter's responsibility. */
export function applyGalReviewDecision(ledger: GalDraftLedger, decision: GalReviewDecision): GalDraftTransition {
  const issues: GalDraftIssue[] = [];
  if (!id(decision.eventId) || ledger.events.some((event) => event.eventId === decision.eventId || event.eventId === `${decision.eventId}:supersede`)) issues.push(issue('$.eventId', 'id_or_duplicate', 'event ID must be safe and unique'));
  if (!['approve', 'reject', 'revoke'].includes(decision.action)) issues.push(issue('$.action', 'enum', 'unsupported review action'));
  if (!id(decision.reviewerId) || !['reviewer', 'owner'].includes(decision.reviewerRole)) issues.push(issue('$.reviewerId', 'reviewer', 'trusted human reviewer is required'));
  if (!nonempty(decision.reason)) issues.push(issue('$.reason', 'required', 'review reason is required'));
  const draft = ledger.drafts.find((item) => item.projectId === decision.projectId && item.draftId === decision.draftId);
  if (!draft) issues.push(issue('$.draftId', 'reference', 'unknown project draft'));
  if (decision.action === 'revoke' && decision.reviewerRole !== 'owner') issues.push(issue('$.reviewerRole', 'authority', 'only owner may revoke current approval'));
  if (draft) {
    const status = galDraftStatus(ledger, draft.projectId, draft.draftId);
    if (decision.action === 'approve' || decision.action === 'reject') {
      if (status !== 'draft') issues.push(issue('$.draftId', 'terminal', 'only a draft may be approved or rejected'));
      if (!validHash(draft)) issues.push(issue('$.draftId', 'hash', 'stored draft content hash is invalid'));
    } else if (status !== 'approved' || currentApprovedGalDraft(ledger, draft.projectId, draft.kind)?.draftId !== draft.draftId) issues.push(issue('$.draftId', 'terminal', 'only current approved draft may be revoked'));
    if (decision.action === 'approve' && status === 'draft') {
      const index = KINDS.indexOf(draft.kind);
      const direct = index > 0 ? currentApprovedGalDraft(ledger, draft.projectId, KINDS[index - 1]!) : undefined;
      if (index > 0 && (!direct || draft.basedOn.length !== 1 || draft.basedOn[0] !== direct.draftId)) issues.push(issue('$.draftId', 'stale', 'draft must be based on current approved upstream'));
      const checked = validateGalDraftData(draft.kind, draft.data, approvedChain(ledger, direct));
      issues.push(...checked.issues.filter((entry) => entry.severity === 'error'));
    }
  }
  if (issues.length || !draft) return { ok: false, ledger, issues: check(issues).issues };
  const events: GalReviewEvent[] = [];
  if (decision.action === 'approve') {
    const previous = activeApproved(ledger, draft.projectId, draft.kind);
    if (previous) events.push(frozen({ ...decision, eventId: `${decision.eventId}:supersede`, action: 'supersede' as const, draftId: previous.draftId }));
  }
  events.push(frozen({ ...decision }));
  return { ok: true, ledger: ledgerOf(ledger.drafts, [...ledger.events, ...events]), issues: [], draft, events };
}

/** P0–P4 are authoring drafts, never a GalPackage candidate. P5/P6/P7 and P8 remain separate gates. */
export function galDraftAssemblyReadiness(): { readonly ready: false; readonly code: 'not_ready'; readonly missing: readonly ['P5', 'P6', 'P7', 'P8'] } {
  return { ready: false, code: 'not_ready', missing: ['P5', 'P6', 'P7', 'P8'] };
}
