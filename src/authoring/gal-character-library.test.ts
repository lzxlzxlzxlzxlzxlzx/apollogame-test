import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyGalDraftLedger, submitGalDraftData, applyGalReviewDecision } from './gal-draft-review.js';
import { applyCharacterCatalogs, approvedBibleCharacterCatalogs, characterCatalogsFromBible, listCharacterFacts } from './gal-character-library.js';
import type { NarrativeBible } from './gal-draft-types.js';

const group = { id: 'pier-story', name: '码头故事' };
const bible = (): NarrativeBible => ({
  briefId: 'work', world: { premise: 'A small town secret', rules: [] },
  locations: [{ id: 'pier', name: 'Pier', description: 'Quiet shore' }],
  characters: [
    { id: 'lin', name: '林', role: '主角', motivation: '查清码头的信', traits: ['冷静'], arc: '学会信任同伴', visualNeed: { silhouette: '高挑', costume: '深色外套', expressions: ['平静'] } },
    { id: 'wen', name: '温', role: '旧友', motivation: '守住码头', traits: ['直率'], arc: '说出旧事', visualNeed: { silhouette: '矮', costume: '工装', expressions: ['笑'] } },
  ],
  relationships: [{ from: 'lin', to: 'wen', kind: 'ally', note: '一起查信' }],
  canonRules: [], narrativeProhibitions: [],
});

describe('GAL character library projection', () => {
  it('puts one game into one group and records each relationship once', () => {
    const projected = characterCatalogsFromBible(bible(), group);
    expect(projected.issues).toEqual([]);
    expect(projected.catalogs.every((item) => item.catalog.group === 'pier-story')).toBe(true);
    expect(projected.catalogs.find((item) => item.id === 'lin')?.catalog.relations).toEqual([{ to: 'wen', relation: '同伴：一起查信' }]);
    expect(projected.catalogs.find((item) => item.id === 'wen')?.catalog.relations).toBeUndefined();
    let ledger = emptyGalDraftLedger();
    const brief = { id: 'work', defaultLocale: 'zh-CN', locales: ['zh-CN'], target: { minutes: 10, routes: 1, endings: 1 }, genre: ['mystery'], audience: 'teen' as const, themes: ['truth'], prohibitedContent: [], artDirection: { style: 'ink', palette: [], referenceIds: [] }, platforms: ['web' as const], constraints: [] };
    ledger = submitGalDraftData(ledger, { projectId: 'p', kind: 'brief', draftId: 'brief-1', revision: 1, basedOn: [], summary: 'brief' }, brief).ledger;
    ledger = applyGalReviewDecision(ledger, { eventId: 'e1', action: 'approve', projectId: 'p', draftId: 'brief-1', reviewerId: 'owner', reviewerRole: 'owner', reason: 'ok' }).ledger;
    ledger = submitGalDraftData(ledger, { projectId: 'p', kind: 'bible', draftId: 'bible-1', revision: 1, basedOn: ['brief-1'], summary: 'bible' }, bible()).ledger;
    expect(approvedBibleCharacterCatalogs(ledger, 'p', group).issues[0]?.code).toBe('approved_bible');
    ledger = applyGalReviewDecision(ledger, { eventId: 'e2', action: 'approve', projectId: 'p', draftId: 'bible-1', reviewerId: 'owner', reviewerRole: 'owner', reason: 'ok' }).ledger;
    expect(approvedBibleCharacterCatalogs(ledger, 'p', group).catalogs.map((item) => item.id)).toEqual(['lin', 'wen']);
  });

  it('writes the game group and hides characters from other groups', () => {
    const root = mkdtempSync(join(tmpdir(), 'gal-characters-'));
    mkdirSync(join(root, 'mio'));
    writeFileSync(join(root, 'mio', 'catalog.json'), `${JSON.stringify({ name: '澪', group: 'other-game', entries: [{ title: '简介', text: '另一部作品', description: '开篇' }] }, null, 2)}\n`);
    writeFileSync(join(root, 'groups.json'), `${JSON.stringify({ groups: [{ id: 'other-game', name: '另一部' }] }, null, 2)}\n`);
    const catalogs = characterCatalogsFromBible(bible(), group).catalogs;
    expect(applyCharacterCatalogs(root, group, catalogs).written).toEqual(['lin', 'wen']);
    const groups = JSON.parse(readFileSync(join(root, 'groups.json'), 'utf8')).groups;
    expect(groups.map((item: { id: string }) => item.id)).toEqual(['other-game', 'pier-story']);
    expect(listCharacterFacts(root, 'pier-story').map((item) => item.id)).toEqual(['lin', 'wen']);
    expect(listCharacterFacts(root, 'pier-story').find((item) => item.id === 'lin')?.relations).toEqual([{ toId: 'wen', relation: '同伴：一起查信' }]);
    expect(applyCharacterCatalogs(root, { id: 'pier-story', name: '另一个名字' }, catalogs).conflicts).toEqual(['group']);
  });

  it('rejects a bible id the library cannot store', () => {
    const source = bible();
    const bad = { ...source, characters: [{ ...source.characters[0]!, id: 'Lin' }], relationships: [] };
    expect(characterCatalogsFromBible(bad, group).issues[0]?.code).toBe('library_id');
  });
});
