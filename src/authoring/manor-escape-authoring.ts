import ledgerFile from '../../docs/design/galgame/drafts/manor-escape/ledger.json';
import scriptFile from '../../docs/design/galgame/drafts/manor-escape/script-candidate.json';
import artFile from '../../docs/design/galgame/drafts/manor-escape/art-approval.json';

const candidateUrls = import.meta.glob('../../docs/design/galgame/drafts/manor-escape/art-candidates/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function candidateSrc(file: string): string {
  const hit = Object.entries(candidateUrls).find(([path]) => path.replaceAll('\\', '/').endsWith(`/${file}`));
  return hit?.[1] ?? '';
}
import manuscriptFile from '../../docs/design/galgame/drafts/manor-escape/manuscript.md?raw';
import { authoringSteps, type AuthoringSession } from './gal-authoring-flow.js';
import type { AuthoringWork } from './gal-authoring-works.js';
import { applyGalReviewDecision, currentApprovedGalDraft, submitGalDraftData } from './gal-draft-review.js';
import { reachableGalGraphNodes } from './gal-draft-validate.js';
import type { GalDraftLedger, NarrativeBible, SceneBeatSheet, StoryGraphDraft, StoryRef } from './gal-draft-types.js';

interface CandidateNode {
  readonly kind?: string;
  readonly speaker?: string;
  readonly text?: unknown;
  readonly prompt?: unknown;
  readonly next?: StoryRef;
  readonly ending?: string;
  readonly options?: readonly { id?: string; text?: unknown; next?: StoryRef }[];
  readonly presentation?: { scene?: string; cg?: { show?: string }; cast?: Record<string, { emotion?: string }> };
}

function zh(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'zh-CN' in value) {
    const text = (value as { 'zh-CN'?: unknown })['zh-CN'];
    if (typeof text === 'string') return text;
  }
  return '';
}

function approve(ledger: GalDraftLedger, kind: 'manuscript' | 'script', draftId: string, basedOn: string, summary: string, data: unknown): GalDraftLedger {
  const submitted = submitGalDraftData(ledger, { projectId: 'manor-escape', kind, draftId, revision: 1, basedOn: [basedOn], summary }, data);
  if (!submitted.ok || !submitted.ledger) throw new Error(`${kind}: ${submitted.issues.map((item) => `${item.path} ${item.message}`).join('; ')}`);
  const reviewed = applyGalReviewDecision(submitted.ledger, {
    eventId: `import-${draftId}`, action: 'approve', projectId: 'manor-escape', draftId,
    reviewerId: 'studio-owner', reviewerRole: 'owner', reason: '导入已完成的庄园出逃',
  });
  if (!reviewed.ok || !reviewed.ledger) throw new Error(`${kind} approval: ${reviewed.issues.map((item) => item.message).join('; ')}`);
  return reviewed.ledger;
}

/** The completed manor-escape authoring desk. Source files stay where they are; this only projects them into one work. */
export function manorEscapeAuthoringWork(): AuthoringWork {
  const ledger = ledgerFile as GalDraftLedger;
  const bible = currentApprovedGalDraft(ledger, 'manor-escape', 'bible')?.data as NarrativeBible;
  const graph = currentApprovedGalDraft(ledger, 'manor-escape', 'graph')?.data as StoryGraphDraft;
  const beats = currentApprovedGalDraft(ledger, 'manor-escape', 'beats')?.data as SceneBeatSheet;
  const reachable = reachableGalGraphNodes(graph);
  const scenes = new Set(graph.sceneSlots.map((item) => item.id));
  const cgs = new Set(beats.mediaNeeds.filter((item) => item.kind === 'cg').map((item) => item.id));
  const expressions = new Map(bible.characters.map((item) => [item.id, new Set(item.visualNeed.expressions)]));
  const chapterStart = new Map(Object.entries(graph.chapters).map(([id, chapter]) => [id, { chapterId: id, nodeId: chapter.start }]));
  const script = scriptFile as { entry: StoryRef; chapters: Record<string, { title: unknown; start: string; nodes: Record<string, CandidateNode> }> };
  const passages: { id: string; anchor: StoryRef; speakerId?: string; text: string }[] = [];
  const chapters: Record<string, { title: string; start: string; nodes: Record<string, unknown> }> = {};
  for (const [chapterId, chapter] of Object.entries(script.chapters)) {
    const nodes: Record<string, unknown> = {};
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      const self = { chapterId, nodeId };
      const anchor = reachable.has(`${chapterId}/${nodeId}`) ? self : chapterStart.get(chapterId) ?? script.entry;
      const speakerId = node.speaker && expressions.has(node.speaker) ? node.speaker : undefined;
      if (node.kind === 'choice') {
        const prompt = zh(node.prompt);
        passages.push({ id: `${chapterId}.${nodeId}`, anchor, text: prompt });
        nodes[nodeId] = { kind: 'choice', prompt, options: (node.options ?? []).map((option) => ({ id: option.id, text: zh(option.text), next: option.next })) };
      } else if (node.kind === 'ending') {
        const text = zh(node.text);
        passages.push({ id: `${chapterId}.${nodeId}`, anchor, text });
        nodes[nodeId] = { kind: 'ending', endingId: node.ending, text };
      } else {
        const text = zh(node.text);
        const emotion = speakerId ? node.presentation?.cast?.[speakerId]?.emotion : undefined;
        const scene = node.presentation?.scene;
        const cg = node.presentation?.cg?.show;
        passages.push({ id: `${chapterId}.${nodeId}`, anchor, ...(speakerId ? { speakerId } : {}), text });
        nodes[nodeId] = {
          kind: 'line', text, next: node.next, ...(speakerId ? { speakerId } : {}),
          ...(speakerId && emotion && expressions.get(speakerId)?.has(emotion) ? { emotion } : {}),
          ...(scene && scenes.has(scene) ? { sceneSlotId: scene } : {}),
          ...(cg && cgs.has(cg) ? { cgNeedId: cg } : {}),
        };
      }
    }
    chapters[chapterId] = { title: zh(chapter.title), start: chapter.start, nodes };
  }
  const withManuscript = approve(ledger, 'manuscript', 'manuscript-1', 'beats-3', '庄园出逃对话文稿', { beatsDraftId: 'beats-3', locale: 'zh-CN', passages });
  const finished = approve(withManuscript, 'script', 'script-1', 'manuscript-1', '庄园出逃逐句', { manuscriptDraftId: 'manuscript-1', locale: 'zh-CN', entry: script.entry, chapters });
  const art = artFile as { portraits: { characterId: string; emotion: string; file: string; assetKey: string }[]; backgrounds: { id: string; file: string; assetKey: string; title: string }[]; cg: { id: string; file: string; assetKey: string; title: string }[]; omittedAudio?: string[] };
  const pictures = [
    ...art.portraits.map((item) => ({ src: candidateSrc(item.file), title: `${item.characterId} · ${item.emotion}`, caption: item.file, group: 'portrait' as const, assetKey: item.assetKey })),
    ...art.backgrounds.map((item) => ({ src: candidateSrc(item.file), title: item.title, caption: item.file, group: 'background' as const, assetKey: item.assetKey })),
    ...art.cg.map((item) => ({ src: candidateSrc(item.file), title: item.title, caption: item.file, group: 'cg' as const, assetKey: item.assetKey })),
  ].filter((item) => item.src);
  const session: AuthoringSession = {
    projectId: 'manor-escape',
    ledger: finished,
    stepId: 'brief',
    castApproved: true,
    cast: bible.characters.map((item) => ({
      id: item.id, name: item.name, source: item.id === 'mechanic' ? 'library' as const : 'new' as const,
      reference: item.id === 'mechanic' ? '锁芯。参考图在 characters/mechanic/suo-xin/。' : item.visualNeed.costume,
    })),
    materials: [
      { id: 'idea', title: '想法', role: 'note', text: '机械师和囚徒在一场原创庄园游戏里相识，两个结局都在一起。' },
      { id: 'manuscript-prose', title: '对话文稿', role: 'note', text: manuscriptFile },
    ],
    exhibits: {
      art: { summary: '立绘、背景和 CG 已按批准清单收回', data: art, pictures: pictures.map(({ assetKey: _assetKey, ...item }) => item) },
      assets: { summary: '资源编号已确认。立绘回到角色，背景和 CG 留在这部作品。', data: { portraits: art.portraits, backgrounds: art.backgrounds, cg: art.cg, omittedAudio: art.omittedAudio ?? [] }, pictures: pictures.map((item) => ({ ...item, caption: item.assetKey })) },
      play: { summary: '已组装为可试玩的游戏包', data: { id: 'manor-escape', title: '庄园出逃', packagePath: 'public/games/manor-escape/package.json', omittedAudio: art.omittedAudio ?? [] } },
    },
  };
  if (authoringSteps(session).some((step) => step.status !== 'approved')) throw new Error('manor escape import did not approve every step');
  return {
    id: 'manor-escape', title: '庄园出逃', session,
    threads: { brief: [{ role: 'assistant', content: '庄园出逃的十一个步骤都已经导入，状态都是已通过。点左边任意一步可以看那一步的产物。' }] },
  };
}
