import { describe, expect, it } from 'vitest';
import { createAuthoringWork, emptyAuthoringWorkCatalog, installAuthoringSeed, readAuthoringWorks, saveAuthoringWork, writeAuthoringWorks } from './gal-authoring-works.js';
import { authoringMaterialFromUpload } from './gal-authoring-flow.js';
import { manorEscapeAuthoringWork } from './manor-escape-authoring.js';
import { authoringSteps } from './gal-authoring-flow.js';
import { currentApprovedGalDraft } from './gal-draft-review.js';

describe('GAL authoring works', () => {
  it('keeps a separate session and conversation for each work', () => {
    const first = createAuthoringWork(emptyAuthoringWorkCatalog(), 'manor-escape', '庄园出逃');
    const second = createAuthoringWork(first.catalog, 'second-game', '第二部');
    expect(second.issues).toEqual([]);
    const manor = saveAuthoringWork(second.catalog, 'manor-escape', first.work!.session, { brief: [{ role: 'user', content: '只改庄园' }] });
    const saved = saveAuthoringWork(manor, 'second-game', second.work!.session, { brief: [{ role: 'user', content: '只改第二部' }] });
    const restored = readAuthoringWorks(writeAuthoringWorks(saved));
    expect(restored.works.map((work) => work.id)).toEqual(['second-game', 'manor-escape']);
    expect(restored.works[0]?.threads.brief?.[0]?.content).toBe('只改第二部');
    expect(restored.works[1]?.threads.brief?.[0]?.content).toBe('只改庄园');
    expect(restored.works[0]?.session.projectId).toBe('second-game');
    expect(restored.works[1]?.session.projectId).toBe('manor-escape');
  });

  it('rejects a duplicate or unsafe work id', () => {
    const created = createAuthoringWork(emptyAuthoringWorkCatalog(), 'manor-escape', '庄园出逃');
    expect(createAuthoringWork(created.catalog, 'manor-escape', '另一份').issues).toContainEqual(expect.objectContaining({ path: '$.id' }));
    expect(createAuthoringWork(created.catalog, '../secret', '坏 id').issues).toContainEqual(expect.objectContaining({ path: '$.id' }));
    expect(created.catalog.works).toHaveLength(1);
  });

  it('installs manor escape as a finished first work without replacing a later edit', () => {
    const seed = manorEscapeAuthoringWork();
    expect(authoringSteps(seed.session).every((step) => step.status === 'approved')).toBe(true);
    expect(currentApprovedGalDraft(seed.session.ledger, 'manor-escape', 'script')?.draftId).toBe('script-1');
    expect(seed.session.materials.map((item) => item.title)).toContain('对话文稿');
    const installed = installAuthoringSeed(emptyAuthoringWorkCatalog(), seed);
    expect(installed.works.map((work) => work.title)).toEqual(['庄园出逃']);
    const edited = saveAuthoringWork(installed, 'manor-escape', seed.session, { brief: [{ role: 'user', content: '保留我的对话' }] });
    const kept = installAuthoringSeed(edited, seed);
    expect(kept.works[0]?.threads.brief?.[0]?.content).toBe('保留我的对话');
    const stripped = { ...seed, session: { ...seed.session, exhibits: { art: { summary: seed.session.exhibits!.art!.summary, data: {} }, assets: seed.session.exhibits!.assets!, play: seed.session.exhibits!.play! } } };
    expect(installAuthoringSeed({ works: [stripped] }, seed).works[0]?.session.exhibits?.art?.pictures?.length).toBe(seed.session.exhibits?.art?.pictures?.length);
    expect(seed.session.exhibits?.art?.pictures?.length).toBe(27);
    expect(seed.session.exhibits?.assets?.pictures?.[0]?.caption).toContain('art:manor-escape/');
    const blank = createAuthoringWork(emptyAuthoringWorkCatalog(), 'manor-escape', '空的');
    expect(installAuthoringSeed(blank.catalog, seed).works[0]?.session.castApproved).toBe(true);
  });

  it('stores an uploaded document as text and leaves the picture out of the catalog json', () => {
    const document = authoringMaterialFromUpload({ name: '设定.md', type: 'text/markdown', text: '门厅是暖的。' }, 1);
    expect(document.material?.text).toBe('门厅是暖的。');
    expect(document.material?.role).toBe('note');
    const image = authoringMaterialFromUpload({ name: '参考.png', type: 'image/png', dataUrl: 'data:image/png;base64,qq' }, 2);
    const created = createAuthoringWork(emptyAuthoringWorkCatalog(), 'picture-work', '带图');
    const work = { ...created.work!, session: { ...created.work!.session, materials: [image.material!] } };
    expect(writeAuthoringWorks({ works: [work] })).not.toContain('base64');
    expect(authoringMaterialFromUpload({ name: '手册.pdf', type: 'application/pdf', text: 'x' }, 3).error).toContain('txt');
  });
});
