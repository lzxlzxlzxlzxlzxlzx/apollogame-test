import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateGalDraftData } from './gal-draft-validate.js';
import { currentApprovedGalDraft, galDraftView } from './gal-draft-review.js';
import { listCharacterFacts } from './gal-character-library.js';
import { loadCharacterLibrary } from '../services/character-library/disk.js';
import type { GalBrief, GalDraftLedger, NarrativeBible, RouteOutline, SceneBeatSheet, StoryGraphDraft } from './gal-draft-types.js';

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../docs/design/galgame/drafts/manor-escape/${name}.json`, import.meta.url), 'utf8'));

describe('manor escape approved P0 and P1', () => {
  it('keeps the owner approval and the new group without taking in the existing mechanic page', () => {
    const brief = read('brief');
    const bible = read('bible');
    const ledger = read('ledger') as GalDraftLedger;
    expect(validateGalDraftData('brief', brief).ok).toBe(true);
    expect(validateGalDraftData('bible', bible, { brief: brief as GalBrief }).ok).toBe(true);
    expect(galDraftView(ledger, 'manor-escape', 'brief-1')?.status).toBe('approved');
    expect(galDraftView(ledger, 'manor-escape', 'bible-1')?.status).toBe('superseded');
    expect(galDraftView(ledger, 'manor-escape', 'bible-2')?.status).toBe('rejected');
    expect(galDraftView(ledger, 'manor-escape', 'bible-3')?.status).toBe('approved');
    expect(currentApprovedGalDraft(ledger, 'manor-escape', 'bible')?.draftId).toBe('bible-3');
    expect((bible as NarrativeBible).characters.find((item) => item.id === 'mechanic')?.visualNeed.costume).toContain('锁芯');
    expect((bible as NarrativeBible).locations?.some((item) => item.id === 'outside')).toBe(false);
    const routes = read('routes');
    expect(validateGalDraftData('routes', routes, { brief: brief as GalBrief, bible: bible as NarrativeBible, bibleDraftId: 'bible-3' }).ok).toBe(true);
    expect(galDraftView(ledger, 'manor-escape', 'routes-1')?.status).toBe('rejected');
    expect(galDraftView(ledger, 'manor-escape', 'routes-2')?.status).toBe('superseded');
    expect(galDraftView(ledger, 'manor-escape', 'routes-3')?.status).toBe('superseded');
    expect(galDraftView(ledger, 'manor-escape', 'routes-4')?.status).toBe('approved');
    expect(currentApprovedGalDraft(ledger, 'manor-escape', 'routes')?.draftId).toBe('routes-4');
    expect((routes as RouteOutline).locations?.map((item) => item.id)).toContain('outside');
    const graph = read('graph');
    expect(validateGalDraftData('graph', graph, {
      routes: routes as RouteOutline, routesDraftId: 'routes-4', bible: bible as NarrativeBible,
    }).ok).toBe(true);
    expect(galDraftView(ledger, 'manor-escape', 'graph-1')?.status).toBe('rejected');
    expect(galDraftView(ledger, 'manor-escape', 'graph-2')?.status).toBe('superseded');
    expect(galDraftView(ledger, 'manor-escape', 'graph-3')?.status).toBe('approved');
    expect(currentApprovedGalDraft(ledger, 'manor-escape', 'graph')?.draftId).toBe('graph-3');
    expect((graph as StoryGraphDraft).chapters['c-outside']?.sceneId).toBe('s-outside');
    const beats = read('beats');
    expect(validateGalDraftData('beats', beats, {
      graph: graph as StoryGraphDraft, graphDraftId: 'graph-3', bible: bible as NarrativeBible,
    }).ok).toBe(true);
    expect(galDraftView(ledger, 'manor-escape', 'beats-1')?.status).toBe('rejected');
    expect(galDraftView(ledger, 'manor-escape', 'beats-2')?.status).toBe('superseded');
    expect(galDraftView(ledger, 'manor-escape', 'beats-3')?.status).toBe('approved');
    expect(currentApprovedGalDraft(ledger, 'manor-escape', 'beats')?.draftId).toBe('beats-3');
    expect((beats as SceneBeatSheet).mediaNeeds.filter((item) => item.kind === 'cg').map((item) => item.brief)).toEqual([
      '离开结局：机械师和囚徒在庄园外接吻',
      '留下结局：机械师和囚徒成为庄园的一部分时接吻',
    ]);
    const library = loadCharacterLibrary('characters');
    expect(library.rejected).toEqual([]);
    expect(library.groups.map((group) => group.id)).toEqual(['identity-v', 'original', 'manor-escape']);
    expect(listCharacterFacts('characters', 'manor-escape').map((item) => item.id)).toEqual(['doctor', 'factory-chief', 'gardener', 'prisoner']);
    expect(library.characters.find((item) => item.id === 'mechanic')).toMatchObject({ groupId: 'identity-v', name: '机械师' });
    const mechanic = library.characters.find((item) => item.id === 'mechanic');
    expect(mechanic).toBeDefined();
    expect(listCharacterFacts('characters', 'identity-v').find((item) => item.id === 'mechanic')?.relations).toEqual([{ toId: 'prisoner', relation: '恋慕：同一场庄园游戏里从互相利用走到相爱，两个结局都在一起' }]);
  });

  it('keeps the owner-approved line script aligned with the bible expressions', () => {
    const bible = read('bible') as NarrativeBible;
    const script = read('script-candidate') as {
      status: string; basedOn: string[]; entry: { chapterId: string; nodeId: string };
      chapters: Record<string, { start: string; nodes: Record<string, { kind: string; speaker?: string; next?: { chapterId: string; nodeId: string } | null; options?: { id: string; next: { chapterId: string; nodeId: string } }[]; ending?: string; presentation?: { background?: string; cg?: { show?: string }; cast?: Record<string, { emotion?: string }> } }> }>;
    };
    const expressions = new Map(bible.characters.map((item) => [item.id, new Set(item.visualNeed.expressions)]));
    expect(script.status).toBe('approved');
    expect(script.basedOn).toEqual(['beats-3']);
    expect(script.entry).toEqual({ chapterId: 'c-hall', nodeId: 'n-meet' });
    expect(script.chapters['c-gate']?.start).toBe('n-gate-01');
    expect(script.chapters['c-gate']?.nodes['n-choice']?.options?.map((item) => item.id)).toEqual(['opt-leave', 'opt-stay']);
    const shown: string[] = [];
    for (const [chapterId, chapter] of Object.entries(script.chapters)) {
      expect(chapter.nodes[chapter.start]).toBeDefined();
      for (const [nodeId, node] of Object.entries(chapter.nodes)) {
        if (node.speaker) expect(expressions.has(node.speaker)).toBe(true);
        const refs = [node.next, ...(node.options?.map((item) => item.next) ?? [])].filter((item): item is { chapterId: string; nodeId: string } => item != null);
        for (const ref of refs) expect(script.chapters[ref.chapterId]?.nodes[ref.nodeId], `${chapterId}/${nodeId}`).toBeDefined();
        if (node.presentation?.cg?.show) shown.push(node.presentation.cg.show);
        for (const [characterId, pose] of Object.entries(node.presentation?.cast ?? {})) {
          if (pose.emotion) expect(expressions.get(characterId)?.has(pose.emotion), `${chapterId}/${nodeId}/${characterId}`).toBe(true);
        }
      }
    }
    expect(shown).toEqual(['cg-outside', 'cg-belong']);
  });
});
