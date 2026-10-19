import { describe, expect, it } from 'vitest';
import {
  addAuthoringMaterial, attachAuthoringReference, authoringSteps, characterLibraryHref, characterLibraryPlan, emptyAuthoringSession, openAuthoringStep, reviewAuthoringStep, setAuthoringCast, submitAuthoringData,
} from './gal-authoring-flow.js';
import { applyGalReviewDecision, currentApprovedGalDraft, emptyGalDraftLedger, galDraftAssemblyReadiness, galDraftEligibility, submitGalDraftData } from './gal-draft-review.js';
import type { GalBrief, GalDraftKind, GalDraftLedger, StoryGraphDraft } from './gal-draft-types.js';

const projectId = 'gal-test';
const brief = (): GalBrief => ({ id: 'work', defaultLocale: 'zh-CN', locales: ['zh-CN'], target: { minutes: 10, routes: 1, endings: 1 }, genre: ['mystery'], audience: 'teen', themes: ['truth'], prohibitedContent: ['gore'], artDirection: { style: 'ink', palette: ['blue'], referenceIds: [] }, platforms: ['web'], constraints: [] });
const bible = () => ({ briefId: 'work', world: { premise: 'A small town secret', rules: [] }, characters: [{ id: 'lin', name: 'Lin', role: 'lead', motivation: 'seek truth', traits: ['calm'], arc: 'trust', visualNeed: { silhouette: 'tall', costume: 'coat', expressions: ['neutral'] } }], relationships: [], canonRules: [], narrativeProhibitions: ['gore'] });
const routes = (bibleId: string) => ({ bibleId, routes: [{ id: 'r1', leadCharacterId: 'lin', premise: 'Search the pier', milestoneIds: ['m1'], endingIds: ['e1'] }], forks: [], milestones: [{ id: 'm1', summary: 'Find clue' }], endings: [{ id: 'e1', routeId: 'r1', outcome: 'Truth' }], locations: [{ id: 'pier', name: 'Pier', description: 'Quiet shore' }] });
const graph = (routesDraftId: string): StoryGraphDraft => ({ routesDraftId, entry: { chapterId: 'c1', nodeId: 'n1' }, chapters: { c1: { title: 'Arrival', start: 'n1', sceneId: 's1', nodes: { n1: { kind: 'line-slot', next: { chapterId: 'c1', nodeId: 'n2' }, routeId: 'r1', milestoneId: 'm1' }, n2: { kind: 'ending', endingId: 'e1', routeId: 'r1' } } } }, sceneSlots: [{ id: 's1', locationId: 'pier' }] });
const beats = (graphDraftId: string) => ({ graphDraftId, beats: { b1: { anchor: { chapterId: 'c1', nodeId: 'n1' }, sceneSlotId: 's1', castIds: ['lin'], mood: 'tense', dramaticPurpose: 'introduce clue', backgroundNeedId: 'bg1', presentationNeeds: { motions: [] }, order: 0 } }, mediaNeeds: [{ id: 'bg1', kind: 'background' as const, brief: 'night pier' }] });
const manuscript = (beatsDraftId: string) => ({ beatsDraftId, locale: 'zh-CN', passages: [{ id: 'p1', anchor: { chapterId: 'c1', nodeId: 'n1' }, speakerId: 'lin', text: '函呢。' }] });
const script = (manuscriptDraftId: string, emotion = 'neutral') => ({ manuscriptDraftId, locale: 'zh-CN', entry: { chapterId: 'c1', nodeId: 'n1' }, chapters: { c1: { title: 'Arrival', start: 'n1', nodes: { n1: { kind: 'line', speakerId: 'lin', emotion, text: '函呢。', sceneSlotId: 's1', next: { chapterId: 'c1', nodeId: 'n2' } }, n2: { kind: 'ending', endingId: 'e1', text: '结束' } } } } });

function chain(): GalDraftLedger {
  let ledger = emptyGalDraftLedger();
  const kinds = ['brief', 'bible', 'routes', 'graph', 'beats', 'manuscript', 'script'] as const;
  const data: Record<GalDraftKind, (ledger: GalDraftLedger) => unknown> = {
    brief: () => brief(),
    bible: () => bible(),
    routes: (current) => routes(currentApprovedGalDraft(current, projectId, 'bible')!.draftId),
    graph: (current) => graph(currentApprovedGalDraft(current, projectId, 'routes')!.draftId),
    beats: (current) => beats(currentApprovedGalDraft(current, projectId, 'graph')!.draftId),
    manuscript: (current) => manuscript(currentApprovedGalDraft(current, projectId, 'beats')!.draftId),
    script: (current) => script(currentApprovedGalDraft(current, projectId, 'manuscript')!.draftId),
  };
  for (const kind of kinds) {
    const predecessor = kinds[kinds.indexOf(kind) - 1];
    const basedOn = predecessor ? [currentApprovedGalDraft(ledger, projectId, predecessor)!.draftId] : [];
    const submitted = submitGalDraftData(ledger, { projectId, kind, draftId: `${kind}-1`, revision: 1, basedOn, summary: kind }, data[kind](ledger));
    expect(submitted.ok, JSON.stringify(submitted.issues)).toBe(true);
    const approved = applyGalReviewDecision(submitted.ledger, { eventId: `approve-${kind}`, action: 'approve', projectId, draftId: `${kind}-1`, reviewerId: 'owner', reviewerRole: 'owner', reason: 'human' });
    expect(approved.ok, JSON.stringify(approved.issues)).toBe(true);
    ledger = approved.ledger;
  }
  return ledger;
}

describe('GAL authoring manuscript and line records', () => {
  it('accepts a human-approved chain and still refuses assembly', () => {
    const ledger = chain();
    expect(currentApprovedGalDraft(ledger, projectId, 'script')?.kind).toBe('script');
    expect(galDraftAssemblyReadiness()).toEqual({ ready: false, code: 'not_ready', missing: ['P5', 'P6', 'P7', 'P8'] });
    const bad = script('manuscript-1', 'ghost');
    const rejected = submitGalDraftData(ledger, { projectId, kind: 'script', draftId: 'script-2', revision: 2, basedOn: ['manuscript-1'], summary: 'bad emotion' }, bad);
    expect(rejected.ok).toBe(false);
    expect(rejected.issues).toContainEqual(expect.objectContaining({ code: 'reference' }));
  });

  it('marks a line draft stale when its upstream approval moves', () => {
    const ledger = chain();
    const replacement = submitGalDraftData(ledger, { projectId, kind: 'beats', draftId: 'beats-2', revision: 2, basedOn: ['graph-1'], summary: 'beats again' }, beats('graph-1'));
    const approved = applyGalReviewDecision(replacement.ledger, { eventId: 'approve-beats-2', action: 'approve', projectId, draftId: 'beats-2', reviewerId: 'owner', reviewerRole: 'owner', reason: 'human' });
    expect(galDraftEligibility(approved.ledger, projectId, 'manuscript-1')).toBe('stale');
    expect(galDraftEligibility(approved.ledger, projectId, 'script-1')).toBe('stale');
  });
});

describe('GAL authoring studio session', () => {
  it('opens every step, unlocks only the next one, and keeps materials', () => {
    let session = emptyAuthoringSession();
    expect(authoringSteps(session)).toHaveLength(11);
    expect(authoringSteps(session).map((step) => step.status)).toEqual(['draft', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked']);
    session = submitAuthoringData(session, brief(), 'brief').session;
    session = reviewAuthoringStep(session, 'approve', 'human').session;
    expect(authoringSteps(session)[1]?.status).toBe('draft');
    expect(authoringSteps(session)[2]?.locked).toBe(true);
    const locked = reviewAuthoringStep(openAuthoringStep(session, 'bible'), 'approve', 'human');
    expect(locked.issues).toContainEqual(expect.objectContaining({ code: 'locked' }));
    session = setAuthoringCast(session, [{ id: 'lin', name: '林', reference: '参考图', source: 'new' }]).session;
    session = reviewAuthoringStep(openAuthoringStep(session, 'cast'), 'approve', 'human').session;
    expect(authoringSteps(session).find((step) => step.id === 'bible')?.locked).toBe(false);
    expect(characterLibraryHref('lin')).toBe('/?character=lin');
    const noted = addAuthoringMaterial(openAuthoringStep(session, 'bible'), { id: 'm1', title: '笔记', text: '留下', role: 'note' });
    expect(noted.stepId).toBe('bible');
    expect(noted.materials).toHaveLength(1);
    const novel = addAuthoringMaterial(noted, { id: 'm2', title: '小说', text: '叙述', role: 'novel' });
    expect(novel.stepId).toBe('brief');
    expect(openAuthoringStep(novel, 'script').materials).toHaveLength(2);
  });

  it('turns later approved steps stale when an approved step is edited', () => {
    let session = emptyAuthoringSession();
    session = submitAuthoringData(session, brief(), 'brief').session;
    session = reviewAuthoringStep(session, 'approve', 'human').session;
    session = setAuthoringCast(session, [{ id: 'lin', name: '林', reference: '', source: 'new' }]).session;
    session = reviewAuthoringStep(openAuthoringStep(session, 'cast'), 'approve', 'human').session;
    session = submitAuthoringData(openAuthoringStep(session, 'bible'), bible(), 'bible').session;
    session = reviewAuthoringStep(session, 'approve', 'human').session;
    const edited = submitAuthoringData(openAuthoringStep(session, 'brief'), brief(), 'brief again');
    expect(edited.issues).toEqual([]);
    const steps = authoringSteps(edited.session);
    expect(steps.find((step) => step.id === 'brief')?.status).toBe('draft');
    expect(steps.find((step) => step.id === 'bible')?.status).toBe('stale');
    expect(reviewAuthoringStep(openAuthoringStep(edited.session, 'art'), 'approve', 'human').issues).toContainEqual(expect.objectContaining({ code: 'locked' }));
  });

  it('hangs a reference on the character and refuses to overwrite an existing catalog', () => {
    let session = emptyAuthoringSession();
    session = submitAuthoringData(session, brief(), 'brief').session;
    session = reviewAuthoringStep(session, 'approve', 'human').session;
    session = setAuthoringCast(openAuthoringStep(session, 'cast'), [
      { id: 'mechanic', name: '机械师', reference: '', source: 'library' },
      { id: 'lin', name: '林', reference: '', source: 'new' },
    ]).session;
    const attached = attachAuthoringReference(session, 'mechanic', { id: 'ref-mechanic', title: '机械师外型参考', text: '锁芯海报', role: 'reference' });
    expect(attached.session.cast.find((item) => item.id === 'mechanic')?.reference).toBe('锁芯海报');
    expect(attached.session.materials.map((item) => item.id)).toEqual(['ref-mechanic']);
    const existing = new Set(['mechanic']);
    expect(characterLibraryPlan(attached.session.cast, existing)).toEqual({ link: ['mechanic'], create: ['lin'], conflict: [] });
    const clash = setAuthoringCast(attached.session, [{ id: 'mechanic', name: '另一份', reference: '', source: 'new' }]).session;
    expect(characterLibraryPlan(clash.cast, existing).conflict).toEqual(['mechanic']);
    expect(reviewAuthoringStep(clash, 'approve', 'human', existing).issues).toContainEqual(expect.objectContaining({ code: 'conflict' }));
    expect(clash.castApproved).toBe(false);
  });
});
