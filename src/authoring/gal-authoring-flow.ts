import {
  applyGalReviewDecision, currentApprovedGalDraft, emptyGalDraftLedger, galDraftEligibility, galDraftStatus, submitGalDraftData,
} from './gal-draft-review.js';
import type { GalDraftIssue, GalDraftKind, GalDraftLedger } from './gal-draft-types.js';

export const GAL_AUTHORING_STEPS = [
  { id: 'brief', name: '简报', hint: '作品边界', kind: 'brief' },
  { id: 'cast', name: '角色', hint: '入库、引用、外型参考', kind: null },
  { id: 'bible', name: '圣经', hint: '世界观与关系', kind: 'bible' },
  { id: 'routes', name: '大纲', hint: '分歧、结局、地点', kind: 'routes' },
  { id: 'graph', name: '剧情图', hint: '章节怎么走', kind: 'graph' },
  { id: 'beats', name: '节拍', hint: '背景、配乐、CG 需求', kind: 'beats' },
  { id: 'manuscript', name: '对话文稿', hint: '把小说改成对白', kind: 'manuscript' },
  { id: 'script', name: '逐句', hint: '场景、表情、CG', kind: 'script' },
  { id: 'art', name: '生图', hint: '按角色参考出图', kind: null },
  { id: 'assets', name: '资源确认', hint: '看过才入库', kind: null },
  { id: 'play', name: '组装试玩', hint: '可运行的游戏包', kind: null },
] as const;

export type AuthoringStepId = typeof GAL_AUTHORING_STEPS[number]['id'];
export type AuthoringStepStatus = 'approved' | 'draft' | 'locked' | 'stale';
export interface AuthoringMaterial {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly role: 'novel' | 'note' | 'reference';
  readonly kind?: 'text' | 'image';
  /** Data URL. Kept beside the work catalog so a picture is not written into the text archive. */
  readonly image?: string;
}
export interface AuthoringCastMember {
  readonly id: string;
  readonly name: string;
  readonly reference: string;
  readonly source: 'library' | 'new';
}
export interface AuthoringPicture { readonly src: string; readonly title: string; readonly caption: string; readonly group: 'portrait' | 'background' | 'cg' }
export interface AuthoringExhibit { readonly summary: string; readonly data: unknown; readonly pictures?: readonly AuthoringPicture[] }
export interface AuthoringSession {
  readonly projectId: string;
  readonly ledger: GalDraftLedger;
  readonly materials: readonly AuthoringMaterial[];
  readonly cast: readonly AuthoringCastMember[];
  readonly castApproved: boolean;
  readonly stepId: AuthoringStepId;
  /** Completed steps that do not have a ledger kind: generated art, confirmed assets, and the playable package. */
  readonly exhibits?: Partial<Record<'art' | 'assets' | 'play', AuthoringExhibit>>;
}
export interface AuthoringStepView {
  readonly id: AuthoringStepId;
  readonly name: string;
  readonly hint: string;
  readonly status: AuthoringStepStatus;
  readonly locked: boolean;
  readonly summary: string;
}
export interface AuthoringChange { readonly session: AuthoringSession; readonly issues: readonly GalDraftIssue[] }

const issue = (path: string, code: string, message: string): GalDraftIssue => ({ path, code, message, severity: 'error' });
const stepOf = (id: AuthoringStepId) => GAL_AUTHORING_STEPS.find((step) => step.id === id)!;
const kindOf = (id: AuthoringStepId): GalDraftKind | null => stepOf(id).kind;

export function emptyAuthoringSession(projectId = 'gal-studio'): AuthoringSession {
  return { projectId, ledger: emptyGalDraftLedger(), materials: [], cast: [], castApproved: false, stepId: 'brief' };
}

export function characterLibraryHref(id: string): string {
  return `/?character=${encodeURIComponent(id)}`;
}

function pendingEdit(ledger: GalDraftLedger, projectId: string, kind: GalDraftKind): boolean {
  const approved = currentApprovedGalDraft(ledger, projectId, kind);
  return Boolean(approved) && ledger.drafts.some((draft) => draft.projectId === projectId && draft.kind === kind && draft.draftId !== approved!.draftId && galDraftStatus(ledger, projectId, draft.draftId) === 'draft');
}

function kindStatus(session: AuthoringSession, kind: GalDraftKind): 'approved' | 'draft' | 'stale' | 'empty' {
  const current = currentApprovedGalDraft(session.ledger, session.projectId, kind);
  if (pendingEdit(session.ledger, session.projectId, kind)) return 'draft';
  if (!current) {
    const draft = session.ledger.drafts.find((item) => item.projectId === session.projectId && item.kind === kind && galDraftStatus(session.ledger, session.projectId, item.draftId) === 'draft');
    return draft ? 'draft' : 'empty';
  }
  return galDraftEligibility(session.ledger, session.projectId, current.draftId) === 'stale' ? 'stale' : 'approved';
}

export function authoringSteps(session: AuthoringSession): readonly AuthoringStepView[] {
  let open = true;
  return GAL_AUTHORING_STEPS.map((step) => {
    const exhibit = step.id === 'art' || step.id === 'assets' || step.id === 'play' ? session.exhibits?.[step.id] : undefined;
    const raw = step.id === 'cast' ? (session.castApproved ? 'approved' : 'empty') : step.kind ? kindStatus(session, step.kind) : exhibit ? 'approved' : 'empty';
    const status: AuthoringStepStatus = open ? (raw === 'empty' ? 'draft' : raw) : (raw === 'approved' || raw === 'stale' ? 'stale' : 'locked');
    const locked = status === 'locked';
    open = status === 'approved';
    const current = step.kind ? currentApprovedGalDraft(session.ledger, session.projectId, step.kind) : undefined;
    const summary = step.id === 'cast'
      ? (session.cast.length ? session.cast.map((item) => item.name).join('、') : '还没有角色')
      : exhibit ? exhibit.summary
      : step.kind === null
        ? '这一步的合同还没接入'
        : (current?.summary ?? '还没有产物');
    return { id: step.id, name: step.name, hint: step.hint, status, locked, summary };
  });
}

export function openAuthoringStep(session: AuthoringSession, stepId: AuthoringStepId): AuthoringSession {
  return { ...session, stepId };
}

export function addAuthoringMaterial(session: AuthoringSession, material: AuthoringMaterial): AuthoringSession {
  const next = { ...session, materials: [...session.materials, material] };
  return material.role === 'novel' ? { ...next, stepId: 'brief' } : next;
}

const TEXT_NAME = /\.(txt|md|json|csv)$/i;
const IMAGE_NAME = /\.(png|jpe?g|webp|gif)$/i;

/** A document stays text for the model to read. An image is a reference and does not reset the step to the brief. */
export function authoringMaterialFromUpload(file: { readonly name: string; readonly type: string; readonly text?: string; readonly dataUrl?: string }, index: number): { material?: AuthoringMaterial; error?: string } {
  const name = file.name.trim() || `upload-${index}`;
  const id = `upload-${index}-${name.replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 40)}`;
  const image = file.type.startsWith('image/') || IMAGE_NAME.test(name);
  if (image) {
    const dataUrl = file.dataUrl ?? '';
    if (!dataUrl.startsWith('data:image/') || dataUrl.length > 2_000_000) return { error: '图片请使用 png、jpg、webp 或 gif，并且小于 1.5MB' };
    return { material: { id, title: name, text: `图片 ${name}`, role: 'reference', kind: 'image', image: dataUrl } };
  }
  const textLike = file.type.startsWith('text/') || file.type === 'application/json' || TEXT_NAME.test(name);
  if (!textLike) return { error: '文档请使用 txt、md、json 或 csv' };
  const text = (file.text ?? '').trim();
  if (!text || text.length > 200_000) return { error: '文档是空的，或超过 20 万字' };
  return { material: { id, title: name, text, role: 'note', kind: 'text' } };
}

export function setAuthoringCast(session: AuthoringSession, cast: readonly AuthoringCastMember[]): AuthoringChange {
  const changed = session.castApproved ? { ...session, cast, castApproved: false } : { ...session, cast };
  return { session: changed, issues: [] };
}

/** Reference images stay on the character and in the material library. This does not write the character catalog. */
export function attachAuthoringReference(session: AuthoringSession, characterId: string, material: AuthoringMaterial): AuthoringChange {
  const member = session.cast.find((item) => item.id === characterId);
  if (!member) return { session, issues: [issue('$.cast', 'reference', 'reference image must hang on a listed character')] };
  const cast = session.cast.map((item) => item.id === characterId ? { ...item, reference: material.text } : item);
  const materials = session.materials.some((item) => item.id === material.id) ? session.materials : [...session.materials, material];
  return setAuthoringCast({ ...session, materials }, cast);
}

/** Existing library ids are links. A new id that already exists, or a library id that does not, is a conflict and is not written. */
export function characterLibraryPlan(cast: readonly AuthoringCastMember[], existingIds: ReadonlySet<string>): { link: string[]; create: string[]; conflict: string[] } {
  const link: string[] = [];
  const create: string[] = [];
  const conflict: string[] = [];
  for (const member of cast) {
    const exists = existingIds.has(member.id);
    if (member.source === 'library' && exists) link.push(member.id);
    else if (member.source === 'new' && !exists) create.push(member.id);
    else conflict.push(member.id);
  }
  return { link, create, conflict };
}

function latestDraftId(session: AuthoringSession, kind: GalDraftKind): string | undefined {
  const drafts = session.ledger.drafts.filter((draft) => draft.projectId === session.projectId && draft.kind === kind && galDraftStatus(session.ledger, session.projectId, draft.draftId) === 'draft');
  return drafts.at(-1)?.draftId;
}

export function submitAuthoringData(session: AuthoringSession, data: unknown, summary: string): AuthoringChange {
  const step = authoringSteps(session).find((item) => item.id === session.stepId)!;
  if (step.locked) return { session, issues: [issue('$.step', 'locked', 'locked step cannot be edited')] };
  const kind = kindOf(session.stepId);
  if (!kind) return { session, issues: [issue('$.step', 'unsupported', 'this step has no draft contract yet')] };
  const previous = GAL_AUTHORING_STEPS.filter((item) => item.kind).map((item) => item.kind!);
  const predecessor = previous[previous.indexOf(kind) - 1];
  const basedOn = predecessor ? [currentApprovedGalDraft(session.ledger, session.projectId, predecessor)?.draftId ?? ''] : [];
  const revision = session.ledger.drafts.filter((draft) => draft.projectId === session.projectId && draft.kind === kind).reduce((max, draft) => Math.max(max, draft.revision), 0) + 1;
  const submitted = submitGalDraftData(session.ledger, { projectId: session.projectId, kind, draftId: `${kind}-${revision}`, revision, basedOn, summary }, data);
  return submitted.ok ? { session: { ...session, ledger: submitted.ledger }, issues: [] } : { session, issues: submitted.issues };
}

export function reviewAuthoringStep(session: AuthoringSession, action: 'approve' | 'reject', reason: string, libraryIds?: ReadonlySet<string>): AuthoringChange {
  const step = authoringSteps(session).find((item) => item.id === session.stepId)!;
  if (step.locked) return { session, issues: [issue('$.step', 'locked', 'locked step cannot be reviewed')] };
  if (session.stepId === 'cast') {
    if (action === 'reject') return { session: { ...session, castApproved: false }, issues: [] };
    if (!session.cast.length || session.cast.some((item) => !item.id.trim() || !item.name.trim())) return { session, issues: [issue('$.cast', 'required', 'each character needs an id and a name')] };
    if (libraryIds) {
      const plan = characterLibraryPlan(session.cast, libraryIds);
      if (plan.conflict.length) return { session, issues: [issue('$.cast', 'conflict', `character catalog was not overwritten: ${plan.conflict.join(',')}`)] };
    }
    return { session: { ...session, castApproved: true }, issues: [] };
  }
  const kind = kindOf(session.stepId);
  if (!kind) {
    if (action === 'approve' && (session.stepId === 'art' || session.stepId === 'assets' || session.stepId === 'play') && session.exhibits?.[session.stepId]) return { session, issues: [] };
    return { session, issues: [issue('$.step', 'unsupported', 'this step has no draft contract yet')] };
  }
  const draftId = latestDraftId(session, kind);
  if (!draftId) return { session, issues: [issue('$.draftId', 'reference', 'there is no draft to review')] };
  const reviewed = applyGalReviewDecision(session.ledger, {
    eventId: `${action}-${draftId}`, action, projectId: session.projectId, draftId,
    reviewerId: 'studio-owner', reviewerRole: 'owner', reason,
  });
  return reviewed.ok ? { session: { ...session, ledger: reviewed.ledger }, issues: [] } : { session, issues: reviewed.issues };
}
