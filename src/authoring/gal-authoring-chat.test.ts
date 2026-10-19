import { describe, expect, it } from 'vitest';
import { authoringDirectory, runAuthoringChat } from './gal-authoring-chat.js';
import { emptyAuthoringSession, submitAuthoringData } from './gal-authoring-flow.js';
import { currentApprovedGalDraft, galDraftStatus } from './gal-draft-review.js';
import type { GalBrief } from './gal-draft-types.js';

const brief = (): GalBrief => ({ id: 'work', defaultLocale: 'zh-CN', locales: ['zh-CN'], target: { minutes: 10, routes: 1, endings: 1 }, genre: ['mystery'], audience: 'teen', themes: ['truth'], prohibitedContent: ['gore'], artDirection: { style: 'ink', palette: ['blue'], referenceIds: [] }, platforms: ['web'], constraints: [] });

describe('GAL authoring chat', () => {
  it('sends titles to the model and keeps novel text behind a tool', async () => {
    const session = submitAuthoringData(emptyAuthoringSession(), brief(), 'brief').session;
    const withNovel = { ...session, materials: [{ id: 'novel-1', title: '小说', text: '这是整篇小说正文', role: 'novel' as const }] };
    const seen: string[] = [];
    const result = await runAuthoringChat(withNovel, [], '把结局改短一点', async (messages) => {
      seen.push(messages.map((item) => item.content).join('\n'));
      if (!seen.some((item) => item.includes('工具结果'))) return JSON.stringify({ kind: 'tool', name: 'read_material', args: { id: 'novel-1' } });
      return JSON.stringify({ kind: 'reply', text: '看完了，还要你点通过。' });
    });
    expect(seen[0]).toContain('小说');
    expect(seen[0]).not.toContain('这是整篇小说正文');
    expect(seen[1]).toContain('这是整篇小说正文');
    expect(result.reply).toBe('看完了，还要你点通过。');
    expect(currentApprovedGalDraft(result.session.ledger, result.session.projectId, 'brief')).toBeUndefined();
    expect(authoringDirectory(withNovel).materials).toEqual([{ id: 'novel-1', title: '小说', role: 'novel', kind: 'text' }]);
  });

  it('can leave a draft and cannot approve it', async () => {
    const session = emptyAuthoringSession();
    const result = await runAuthoringChat(session, [], '写简报', async (messages) => {
      const text = messages.map((item) => item.content).join('\n');
      if (!text.includes('read_rules')) return JSON.stringify({ kind: 'tool', name: 'read_rules', args: {} });
      if (!text.includes('read_spec')) return JSON.stringify({ kind: 'tool', name: 'read_spec', args: {} });
      if (!text.includes('read_step')) return JSON.stringify({ kind: 'tool', name: 'read_step', args: { stepId: 'brief' } });
      if (!text.includes('submit_candidate')) return JSON.stringify({ kind: 'tool', name: 'submit_candidate', args: { summary: '模型候选', data: brief() } });
      return JSON.stringify({ kind: 'reply', text: '候选放好了。' });
    });
    const draft = result.session.ledger.drafts.at(-1);
    expect(draft?.draftId).toBe('brief-1');
    expect(galDraftStatus(result.session.ledger, result.session.projectId, 'brief-1')).toBe('draft');
    expect(result.history.at(-1)?.content).toBe('候选放好了。');
  });

  it('keeps an uploaded picture out of the directory and shows it when the model reads that material', async () => {
    const dataUrl = 'data:image/png;base64,aaaa';
    const session = {
      ...emptyAuthoringSession(),
      materials: [{ id: 'ref-1', title: '门厅参考.png', text: '图片 门厅参考.png', role: 'reference' as const, kind: 'image' as const, image: dataUrl }],
    };
    const seen: string[] = [];
    await runAuthoringChat(session, [], '看这张图', async (messages) => {
      seen.push(JSON.stringify(messages));
      if (!seen.some((item) => item.includes('工具结果'))) return JSON.stringify({ kind: 'tool', name: 'read_material', args: { id: 'ref-1' } });
      return JSON.stringify({ kind: 'reply', text: '看到了。' });
    });
    expect(seen[0]).not.toContain(dataUrl);
    expect(seen[1]).toContain(dataUrl);
    expect(seen[1]).toContain('"images"');
  });
});
