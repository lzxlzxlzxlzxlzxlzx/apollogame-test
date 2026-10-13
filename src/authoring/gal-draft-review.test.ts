import { describe, expect, it } from 'vitest';
import {
  canonicalGalDraftJson, galDraftContentHash, validateGalDraftData,
} from './gal-draft-validate.js';
import {
  applyGalReviewDecision, currentApprovedGalDraft, emptyGalDraftLedger,
  galDraftAssemblyReadiness, galDraftEligibility, galDraftView, submitGalDraftData,
} from './gal-draft-review.js';
import type { GalBrief, GalDraftKind, GalDraftLedger, StoryGraphDraft } from './gal-draft-types.js';

const projectId = 'gal-test';
const brief = (): GalBrief => ({ id: 'work', defaultLocale: 'zh-CN', locales: ['zh-CN'], target: { minutes: 10, routes: 1, endings: 1 }, genre: ['mystery'], audience: 'teen', themes: ['truth'], prohibitedContent: ['gore'], artDirection: { style: 'ink', palette: ['blue'], referenceIds: [] }, platforms: ['web'], constraints: [] });
const bible = () => ({ briefId: 'work', world: { premise: 'A small town secret', rules: [] }, locations: [{ id: 'pier', name: 'Pier', description: 'Quiet shore' }], characters: [{ id: 'lin', name: 'Lin', role: 'lead', motivation: 'seek truth', traits: ['calm'], arc: 'trust', visualNeed: { silhouette: 'tall', costume: 'coat', expressions: ['neutral'] } }], relationships: [], canonRules: [], narrativeProhibitions: ['gore'] });
const routes = (bibleId: string) => ({ bibleId, routes: [{ id: 'r1', leadCharacterId: 'lin', premise: 'Search the pier', milestoneIds: ['m1'], endingIds: ['e1'] }], forks: [], milestones: [{ id: 'm1', summary: 'Find clue' }], endings: [{ id: 'e1', routeId: 'r1', outcome: 'Truth' }] });
const graph = (routesDraftId: string): StoryGraphDraft => ({ routesDraftId, entry: { chapterId: 'c1', nodeId: 'n1' }, chapters: { c1: { title: 'Arrival', start: 'n1', sceneId: 's1', nodes: { n1: { kind: 'line-slot', next: { chapterId: 'c1', nodeId: 'n2' }, routeId: 'r1', milestoneId: 'm1' }, n2: { kind: 'ending', endingId: 'e1', routeId: 'r1' } } } }, sceneSlots: [{ id: 's1', locationId: 'pier' }] });
const beats = (graphDraftId: string) => ({ graphDraftId, beats: { b1: { anchor: { chapterId: 'c1', nodeId: 'n1' }, sceneSlotId: 's1', castIds: ['lin'], mood: 'tense', dramaticPurpose: 'introduce clue', backgroundNeedId: 'bg1', presentationNeeds: { motions: [] }, order: 0 } }, mediaNeeds: [{ id: 'bg1', kind: 'background', brief: 'night pier' }] });
const kinds = ['brief', 'bible', 'routes', 'graph', 'beats'] as const;

function dataFor(kind: GalDraftKind, ledger: GalDraftLedger): unknown {
  if (kind === 'brief') return brief();
  if (kind === 'bible') return bible();
  if (kind === 'routes') return routes(currentApprovedGalDraft(ledger, projectId, 'bible')!.draftId);
  if (kind === 'graph') return graph(currentApprovedGalDraft(ledger, projectId, 'routes')!.draftId);
  return beats(currentApprovedGalDraft(ledger, projectId, 'graph')!.draftId);
}

function submit(ledger: GalDraftLedger, kind: GalDraftKind, revision = 1, data = dataFor(kind, ledger)) {
  const predecessor = kinds[kinds.indexOf(kind) - 1];
  const basedOn = predecessor ? [currentApprovedGalDraft(ledger, projectId, predecessor)!.draftId] : [];
  const draftId = `${kind}-${revision}`;
  return submitGalDraftData(ledger, { projectId, kind, draftId, revision, basedOn, summary: `${kind} revision ${revision}` }, data);
}

function decide(ledger: GalDraftLedger, draftId: string, action: 'approve' | 'reject' | 'revoke', reason = 'human review') {
  return applyGalReviewDecision(ledger, { eventId: `${action}-${draftId}`, action, projectId, draftId, reviewerId: 'reviewer-1', reviewerRole: action === 'revoke' ? 'owner' : 'reviewer', reason });
}

function chain(): GalDraftLedger {
  let ledger = emptyGalDraftLedger();
  for (const kind of kinds) {
    const submitted = submit(ledger, kind);
    expect(submitted.ok, JSON.stringify(submitted.issues)).toBe(true);
    ledger = submitted.ledger;
    const approved = decide(ledger, `${kind}-1`, 'approve');
    expect(approved.ok, JSON.stringify(approved.issues)).toBe(true);
    ledger = approved.ledger;
  }
  return ledger;
}

describe('GAL-PIPE-01A pure P0–P4 contract', () => {
  it('hashes canonical finite JSON; basedOn and array order affect identity without mutating input', () => {
    expect(canonicalGalDraftJson({ b: 1, a: [2, 3] })).toBe(canonicalGalDraftJson({ a: [2, 3], b: 1 }));
    const input = brief(), before = structuredClone(input);
    const first = submit(emptyGalDraftLedger(), 'brief', 1, input);
    expect(first.ok).toBe(true); expect(input).toEqual(before);
    const record = first.draft!;
    expect(record.contentHash).toBe(galDraftContentHash(record));
    expect(record.contentHash).not.toBe(galDraftContentHash({ ...record, basedOn: ['other'] }));
    expect(record.contentHash).not.toBe(galDraftContentHash({ ...record, data: { ...input, locales: ['en', 'zh-CN'] } }));
    expect(Object.isFrozen(record.data)).toBe(true);
    expect(validateGalDraftData('brief', input)).toEqual(validateGalDraftData('brief', input));
  });

  it('rejects closed-schema, malformed JSON, forged envelope fields and bad upstream identity with stable paths', () => {
    const bad = { ...brief(), status: 'approved', target: { ...brief().target, minutes: NaN } };
    expect(submit(emptyGalDraftLedger(), 'brief', 1, bad).issues.map((item) => item.path)).toContain('$.data.target.minutes');
    expect(submit(emptyGalDraftLedger(), 'brief', 1, { ...brief(), status: 'approved' }).issues).toContainEqual(expect.objectContaining({ path: '$.data.status', code: 'unknown_field' }));
    expect(validateGalDraftData('brief', { ...brief(), audience: 'adult' }).issues).toContainEqual(expect.objectContaining({ path: '$.data.audience', code: 'enum' }));
    const cyclic: Record<string, unknown> = { ...brief() }; cyclic.self = cyclic;
    expect(validateGalDraftData('brief', cyclic).issues).toContainEqual(expect.objectContaining({ code: 'cycle' }));
    const sparseLocales = new Array<string>(2); sparseLocales[0] = 'zh-CN';
    const sparse = submit(emptyGalDraftLedger(), 'brief', 1, { ...brief(), locales: sparseLocales });
    expect(sparse.ok).toBe(false);
    expect(sparse.issues).toContainEqual(expect.objectContaining({ path: '$.data.locales[1]', code: 'json' }));
    const hostile = new Proxy(brief(), { ownKeys: () => { throw new Error('hostile model object'); } });
    expect(validateGalDraftData('brief', hostile).issues).toContainEqual(expect.objectContaining({ path: '$.data', code: 'json' }));
    const approved = decide(submit(emptyGalDraftLedger(), 'brief').ledger, 'brief-1', 'approve').ledger;
    expect(submitGalDraftData(approved, { projectId: 'foreign', kind: 'bible', draftId: 'bible-1', revision: 1, basedOn: ['brief-1'], summary: 'foreign' }, bible()).issues).toContainEqual(expect.objectContaining({ path: '$.basedOn[0]', code: 'reference' }));
    expect(submitGalDraftData(approved, { projectId, kind: 'bible', draftId: 'bible-1', revision: 1, basedOn: [], summary: 'missing' }, bible()).issues).toContainEqual(expect.objectContaining({ path: '$.basedOn', code: 'arity' }));
    const altered = structuredClone(approved); (altered.drafts[0] as { contentHash: string }).contentHash = 'sha256:' + '0'.repeat(64);
    expect(submitGalDraftData(altered, { projectId, kind: 'bible', draftId: 'bible-1', revision: 1, basedOn: ['brief-1'], summary: 'bible' }, bible()).issues).toContainEqual(expect.objectContaining({ code: 'hash' }));
    const malformed = structuredClone(submit(emptyGalDraftLedger(), 'brief').ledger);
    (malformed.drafts[0] as { data: unknown }).data = { ...brief(), audience: 'invalid' };
    (malformed.drafts[0] as { contentHash: string }).contentHash = galDraftContentHash(malformed.drafts[0]);
    expect(applyGalReviewDecision(malformed, { eventId: 'review-bad', action: 'approve', projectId, draftId: 'brief-1', reviewerId: 'human', reviewerRole: 'reviewer', reason: 'looks good' }).issues).toContainEqual(expect.objectContaining({ code: 'enum' }));
    expect(validateGalDraftData('brief', { ...brief(), titleHint: '<script>x</script>' }).issues).toContainEqual(expect.objectContaining({ path: '$.data.titleHint', code: 'markup' }));
  });

  it('keeps review decisions human-only and append-only; rejection does not retire prior approval', () => {
    let ledger = chain();
    const next = submit(ledger, 'brief', 2); expect(next.ok).toBe(true); ledger = next.ledger;
    expect(decide(ledger, 'brief-2', 'reject', '').issues).toContainEqual(expect.objectContaining({ path: '$.reason' }));
    const rejected = decide(ledger, 'brief-2', 'reject'); expect(rejected.ok).toBe(true); ledger = rejected.ledger;
    expect(galDraftView(ledger, projectId, 'brief-2')?.status).toBe('rejected');
    expect(galDraftEligibility(ledger, projectId, 'beats-1')).toBe('current');
    expect(decide(ledger, 'brief-2', 'approve').issues).toContainEqual(expect.objectContaining({ code: 'terminal' }));
    expect(decide(ledger, 'brief-1', 'approve').issues).toContainEqual(expect.objectContaining({ code: 'terminal' }));
    expect(applyGalReviewDecision(ledger, { eventId: 'bad', action: 'revoke', projectId, draftId: 'brief-1', reviewerId: 'model', reviewerRole: 'reviewer', reason: 'no' }).issues).toContainEqual(expect.objectContaining({ code: 'authority' }));
  });

  it('scopes identical draft IDs and review projections to their project', () => {
    let ledger = decide(submit(emptyGalDraftLedger(), 'brief').ledger, 'brief-1', 'approve').ledger;
    const other = submitGalDraftData(ledger, { projectId: 'other-gal', kind: 'brief', draftId: 'brief-1', revision: 1, basedOn: [], summary: 'other brief' }, { ...brief(), id: 'other-work' });
    expect(other.ok).toBe(true); ledger = other.ledger;
    expect(galDraftView(ledger, projectId, 'brief-1')?.status).toBe('approved');
    expect(galDraftView(ledger, 'other-gal', 'brief-1')?.status).toBe('draft');
    expect(galDraftEligibility(ledger, 'other-gal', 'brief-1')).toBe('blocked');
  });

  it.each(kinds.slice(0, 4))('invalidates only downstream current chain when %s replacement is approved', (kind) => {
    let ledger = chain(); const candidate = submit(ledger, kind, 2);
    expect(candidate.ok, JSON.stringify(candidate.issues)).toBe(true); ledger = candidate.ledger;
    expect(galDraftEligibility(ledger, projectId, 'beats-1')).toBe('current');
    const approved = decide(ledger, `${kind}-2`, 'approve'); expect(approved.ok, JSON.stringify(approved.issues)).toBe(true); ledger = approved.ledger;
    expect(galDraftView(ledger, projectId, `${kind}-1`)?.status).toBe('superseded');
    expect(galDraftEligibility(ledger, projectId, `${kind}-2`)).toBe('current');
    const index = kinds.indexOf(kind);
    for (let i = index + 1; i < kinds.length; i++) expect(galDraftEligibility(ledger, projectId, `${kinds[i]}-1`)).toBe('stale');
    for (let i = 0; i < index; i++) expect(galDraftEligibility(ledger, projectId, `${kinds[i]}-1`)).toBe('current');
    if (index < kinds.length - 1) expect(currentApprovedGalDraft(ledger, projectId, kinds[index + 1]!)).toBeUndefined();
  });

  it('replaces P4 without invalidating its upstream chain', () => {
    let ledger = chain(); ledger = submit(ledger, 'beats', 2).ledger;
    ledger = decide(ledger, 'beats-2', 'approve').ledger;
    expect(galDraftView(ledger, projectId, 'beats-1')?.status).toBe('superseded');
    for (const kind of kinds.slice(0, 4)) expect(galDraftEligibility(ledger, projectId, `${kind}-1`)).toBe('current');
  });

  it('blocks dependents after owner revocation and refuses stale approval', () => {
    let ledger = chain(); const candidate = submit(ledger, 'bible', 2); ledger = candidate.ledger;
    const replaced = submit(ledger, 'brief', 2); ledger = decide(replaced.ledger, 'brief-2', 'approve').ledger;
    expect(decide(ledger, 'bible-2', 'approve').issues).toContainEqual(expect.objectContaining({ code: 'stale' }));
    const revoked = decide(ledger, 'brief-2', 'revoke'); expect(revoked.ok).toBe(true);
    expect(galDraftEligibility(revoked.ledger, projectId, 'bible-1')).toBe('blocked');
    expect(galDraftEligibility(revoked.ledger, projectId, 'beats-1')).toBe('blocked');
  });

  it('diagnoses stage references, structural graph reachability and beat coverage without claiming condition feasibility', () => {
    const base = chain();
    expect(validateGalDraftData('bible', { ...bible(), relationships: [{ from: 'lin', to: 'ghost', kind: 'ally', note: 'lost' }] }, { brief: brief() }).issues).toContainEqual(expect.objectContaining({ path: '$.data.relationships[0].to', code: 'reference' }));
    expect(validateGalDraftData('routes', { ...routes('bible-1'), endings: [{ id: 'e1', routeId: 'missing', outcome: 'Truth' }] }, { bible: bible(), brief: brief(), bibleDraftId: 'bible-1' }).issues).toContainEqual(expect.objectContaining({ path: '$.data.endings[0].routeId', code: 'reference' }));
    const broken: any = structuredClone(graph('routes-1')); broken.chapters.c1.nodes.n1.next.nodeId = 'missing';
    expect(validateGalDraftData('graph', broken, { routes: routes('bible-1'), routesDraftId: 'routes-1', bible: bible() }).issues).toContainEqual(expect.objectContaining({ code: 'reference' }));
    const noExit: any = structuredClone(graph('routes-1')); noExit.chapters.c1.nodes.n1.next.nodeId = 'n1';
    expect(validateGalDraftData('graph', noExit, { routes: routes('bible-1'), routesDraftId: 'routes-1', bible: bible() }).issues).toContainEqual(expect.objectContaining({ code: 'no_exit' }));
    const duplicateOption: any = structuredClone(graph('routes-1'));
    duplicateOption.chapters.c1.nodes.n1 = { kind: 'choice', options: [{ id: 'same', next: { chapterId: 'c1', nodeId: 'n2' } }, { id: 'same', next: { chapterId: 'c1', nodeId: 'n2' } }] };
    expect(validateGalDraftData('graph', duplicateOption, { routes: routes('bible-1'), routesDraftId: 'routes-1', bible: bible() }).issues).toContainEqual(expect.objectContaining({ code: 'duplicate' }));
    const conditional = graph('routes-1') as unknown as Record<string, unknown>;
    const chapter = (conditional.chapters as Record<string, any>).c1;
    chapter.nodes.n1 = { kind: 'check', checkIntent: 'trust threshold', pass: { chapterId: 'c1', nodeId: 'n2' }, fail: { chapterId: 'c1', nodeId: 'n2' } };
    const report = validateGalDraftData('graph', conditional, { routes: routes('bible-1'), routesDraftId: 'routes-1', bible: bible() });
    expect(report.ok).toBe(true);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'intent_only', severity: 'warning' }));
    const wrongBeat = beats('graph-1'); wrongBeat.beats.b1.castIds[0] = 'ghost';
    expect(validateGalDraftData('beats', wrongBeat, { graph: graph('routes-1'), graphDraftId: 'graph-1', bible: bible() }).issues).toContainEqual(expect.objectContaining({ code: 'reference' }));
    const noCoverage = { ...beats('graph-1'), beats: {} };
    expect(validateGalDraftData('beats', noCoverage, { graph: graph('routes-1'), graphDraftId: 'graph-1', bible: bible() }).issues).toContainEqual(expect.objectContaining({ code: 'coverage' }));
    expect(galDraftEligibility(base, projectId, 'beats-1')).toBe('current');
  });

  it('refuses to treat a fully approved P0–P4 chain as a playable package', () => {
    const ledger = chain();
    expect(kinds.map((kind) => currentApprovedGalDraft(ledger, projectId, kind)?.kind)).toEqual([...kinds]);
    expect(galDraftAssemblyReadiness()).toEqual({ ready: false, code: 'not_ready', missing: ['P5', 'P6', 'P7', 'P8'] });
  });
});
