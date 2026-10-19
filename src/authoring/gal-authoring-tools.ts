import { authoringSteps, submitAuthoringData, type AuthoringSession } from './gal-authoring-flow.js';
import { currentApprovedGalDraft, galDraftStatus } from './gal-draft-review.js';
import type { GalDraftIssue } from './gal-draft-types.js';

export const GAL_AUTHORING_TOOLS = ['read_step', 'read_material', 'read_character', 'read_spec', 'read_rules', 'submit_candidate'] as const;
export type GalAuthoringTool = typeof GAL_AUTHORING_TOOLS[number];
export interface AuthoringToolTrace { readonly reads: readonly string[] }
export interface AuthoringToolResult {
  readonly session: AuthoringSession;
  readonly trace: AuthoringToolTrace;
  readonly issues: readonly GalDraftIssue[];
  readonly output: unknown;
}

const issue = (path: string, code: string, message: string): GalDraftIssue => ({ path, code, message, severity: 'error' });
const emptyTrace = (): AuthoringToolTrace => ({ reads: [] });

const SCRIPT_RULES = [
  '一句台词只让当前该露脸的人 visible 为 true，其他人显式 visible 为 false。visible 和 zOrder 会留到下一句。',
  '旁白不写 cast 就继续用上一句的在场名单。旁白要给某个人时，把他设成唯一可见。',
  '画面上的 CG 只来自 presentation.cg.show。unlockCg 只解锁回想，不能代替 show。',
  '一段 CG 里不要写 cg.hide，也不要换 scene。不要在 show 的下一句马上 hide。',
].join('');

function stepData(session: AuthoringSession, stepId: string): unknown {
  const step = authoringSteps(session).find((item) => item.id === stepId);
  if (!step) return undefined;
  if (step.id === 'cast') return session.cast;
  if (!step.kind) return { summary: step.summary };
  const pending = session.ledger.drafts.find((draft) => draft.projectId === session.projectId && draft.kind === step.kind && galDraftStatus(session.ledger, session.projectId, draft.draftId) === 'draft');
  return pending?.data ?? currentApprovedGalDraft(session.ledger, session.projectId, step.kind)?.data ?? null;
}

function requireReads(trace: AuthoringToolTrace, session: AuthoringSession): GalDraftIssue[] {
  const missing: string[] = [];
  if (!trace.reads.includes('rules')) missing.push('read_rules');
  if (!trace.reads.includes(`spec:${session.stepId}`)) missing.push('read_spec');
  if (!trace.reads.includes(`step:${session.stepId}`)) missing.push('read_step');
  for (const material of session.materials) if (!trace.reads.includes(`material:${material.id}`)) missing.push(`read_material:${material.id}`);
  for (const member of session.cast) if (!trace.reads.includes(`character:${member.id}`)) missing.push(`read_character:${member.id}`);
  return missing.length ? [issue('$.reads', 'required', `missing ${missing.join(',')}`)] : [];
}

/** Closed tool directory. A call can read the project or submit the current step. It cannot approve or rewrite uploads. */
export function runAuthoringTool(session: AuthoringSession, trace: AuthoringToolTrace, name: string, args: Readonly<Record<string, unknown>>): AuthoringToolResult {
  const note = (read: string, output: unknown): AuthoringToolResult => ({ session, trace: { reads: [...trace.reads, read] }, issues: [], output });
  if (name === 'read_rules') return note('rules', { portrait: 'one visible speaker', cg: SCRIPT_RULES });
  if (name === 'read_spec') return note(`spec:${session.stepId}`, { stepId: session.stepId, rules: session.stepId === 'script' ? SCRIPT_RULES : '只改当前这一步，不能自己通过。' });
  if (name === 'read_step') {
    const stepId = typeof args.stepId === 'string' ? args.stepId : session.stepId;
    const output = stepData(session, stepId);
    if (output === undefined) return { session, trace, issues: [issue('$.stepId', 'reference', 'unknown step')], output: null };
    return note(`step:${stepId}`, output);
  }
  if (name === 'read_material') {
    const material = session.materials.find((item) => item.id === args.id);
    if (!material) return { session, trace, issues: [issue('$.id', 'reference', 'unknown material')], output: null };
    return note(`material:${material.id}`, material);
  }
  if (name === 'read_character') {
    const member = session.cast.find((item) => item.id === args.id);
    if (!member) return { session, trace, issues: [issue('$.id', 'reference', 'unknown character')], output: null };
    return note(`character:${member.id}`, { ...member, href: `/?character=${encodeURIComponent(member.id)}` });
  }
  if (name === 'submit_candidate') {
    if (typeof args.stepId === 'string' && args.stepId !== session.stepId) return { session, trace, issues: [issue('$.stepId', 'step', 'a candidate can only change the current step')], output: null };
    const missing = requireReads(trace, session);
    if (missing.length) return { session, trace, issues: missing, output: null };
    const submitted = submitAuthoringData(session, args.data, typeof args.summary === 'string' ? args.summary : '模型候选');
    return { session: submitted.session, trace, issues: submitted.issues, output: submitted.issues.length ? null : { status: 'draft' } };
  }
  return { session, trace, issues: [issue('$.tool', 'enum', 'unknown tool')], output: null };
}

export function emptyAuthoringToolTrace(): AuthoringToolTrace {
  return emptyTrace();
}
