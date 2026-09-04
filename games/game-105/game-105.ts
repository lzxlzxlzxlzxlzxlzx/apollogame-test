import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { ThreeRenderer } from '@zerocraft/engine/renderer/three-renderer.js';
import { apolloBrocade, mountUI, type LayoutNode, type MountHandle, type UITheme } from '@zerocraft/engine/ui/components/index.js';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { createArtAssets, loadGameArtInto, loadGameArtOverrides } from '@zerocraft/engine/assets/index.js';
import { TOWER_BLOCKS, towerBlueprint, type TowerBlock } from './tower-blueprint.js';
import { TowerGameSession, type AIPenaltyCard, type InteractionCard } from './tower-session.js';
import { TowerActionExecutor } from './tower-action-executor.js';
import { AITurnDirector } from './ai-turn-director.js';
import { createLocalAIObservation } from './local-ai-observation.js';
import { companionPortrait, GAME105_SKINS, type Game105Skins } from './game-105-art.js';
import './game-105-s5.css';

export type Game105ReplyMode = 'llm' | 'template' | 'mixed';

export interface Game105AIReplyRequest {
  ticket: string;
  kind: 'draw' | 'penalty';
  sessionId: string | null;
  characterName: string;
  playerPersonaName: string;
  round: number;
  heartDelta: number;
  card: { effectId: string; channel: TowerBlock['channel']; title: string; prompt: string; sequence: number; total: number; };
  fallbackReply: string;
}

export interface Game105MountHost {
  /** M2-only opt-in. Standalone Release M1 never calls Host dialogue or result callbacks by default. */
  enableHostAdapter?: boolean;
  exit?: () => void;
  companionName?: string;
  playerPersonaName?: string;
  sessionId?: string | null;
  seed?: number;
  resolveAIReply?: (request: Game105AIReplyRequest) => Promise<{ text: string; mode?: 'llm' | 'template' } | null>;
  onComplete?: (summary: {
    session: TowerGameSession;
    replyMode: Game105ReplyMode;
    companionName: string;
    playerPersonaName: string;
    sessionId: string | null;
  }) => void;
}

/** Keeps retained M2 seams inert unless an explicitly future-gated host opts in. */
export function isHostAdapterEnabled(host: Game105MountHost): boolean {
  return host.enableHostAdapter === true;
}

/** S5 applies paint only: S4 owns every LayoutNode's location, order, and interaction path. */
export const HEART_TOWER_THEME: UITheme = {
  ...apolloBrocade,
  bg0: '#2d1d24', bg1: '#f4dfd2', bg2: '#fffaf2', bg3: '#fffdf9',
  pageBg: 'radial-gradient(100% 88% at 50% 0%,#fff8ef 0%,#f5dfd2 56%,#e9c9c5 100%)',
  texture: 'radial-gradient(circle,rgba(190,132,43,.13) 1px,transparent 1.6px) 0 0/24px 24px,radial-gradient(circle,rgba(157,48,79,.09) 1px,transparent 1.5px) 12px 12px/24px 24px,repeating-linear-gradient(45deg,rgba(185,122,42,.045) 0 1px,transparent 1px 22px)',
  wash: 'radial-gradient(80% 65% at 20% 5%,rgba(255,226,190,.28),transparent 60%),radial-gradient(75% 70% at 92% 100%,rgba(146,38,75,.10),transparent 64%)',
  line: 'rgba(184,123,36,.62)', text: '#442a31', sub: '#73525a', dim: '#e7c9cf', ink: '#2d1d24',
  jade: '#a93d5b', jadeWash: 'rgba(169,61,91,.14)', jadeLine: 'rgba(169,61,91,.50)',
  gold: '#b87924', warn: '#ce8b35', warnWash: 'rgba(206,139,53,.16)', inputBg: '#fffdf8',
  fontUi: "'Noto Serif SC','Songti SC','STSong',serif", fontSerif: "'Noto Serif SC','Songti SC','STSong',serif",
};

function normalizeReplyMode(llmReplies: number, templateReplies: number): Game105ReplyMode {
  if (llmReplies > 0 && templateReplies > 0) return 'mixed';
  return llmReplies > 0 ? 'llm' : 'template';
}

export function hud(
  s: TowerGameSession,
  restarts: number,
  skins: Game105Skins = {},
  companionName = '绮光 · 本地陪伴模式',
): Parameters<typeof mountUI>[1] {
  const skin = (key: keyof Game105Skins) => skins[key];
  const primarySkin = skin(GAME105_SKINS.buttonPrimary);
  const secondarySkin = skin(GAME105_SKINS.buttonSecondary);
  const text = s.phase === 'collapse-locked' ? '这一局先到这里，塔仍在自然落下。'
    : s.phase === 'player-interaction' ? `${s.interactionQueue[0]?.title}：${s.interactionQueue[0]?.text}`
    : s.phase === 'ai-response' ? (s.aiReplyVisible ? s.templateReply : 'TA 正在回应这张卡…')
        : s.phase === 'ai-observe' ? 'TA 正在找一根。'
          : s.phase === 'ai-pulling' ? 'TA 正在抽取。'
            : s.phase === 'player-pulling' ? '慢一点，塔还在回应你。'
              : s.phase === 'player-ready' ? '轮到你抽取一根积木。' : '等待真实物理塔落定...';
  const interaction = s.interactionQueue[0];
  const aiCard = s.aiInteractionQueue[0];
  const channelName = interaction ? ({ pink: '轻语 / 樱粉', purple: '心动 / 星紫', blue: '默契 / 夜蓝', gold: '勇气 / 流金' } as const)[interaction.block.channel] : '';
  const responseFields: LayoutNode[] = interaction?.kind === 'summary' ? [] : [
    { type: 'Input', id: 'g105-response-input', props: { placeholder: '写下一句回应（仅本局可见）', value: s.draftResponse, action: 'tower.response.draft' } },
    { type: 'Panel', id: 'g105-quick-replies', props: { bare: true }, layout: { direction: 'row', gap: 6, justify: 'center' }, children: [
      { type: 'Button', id: 'g105-quick-one', props: { label: '我记住了', kind: 'quiet', action: 'tower.response.quick', actionArg: '我记住了。' } },
      { type: 'Button', id: 'g105-quick-two', props: { label: '谢谢你', kind: 'quiet', action: 'tower.response.quick', actionArg: '谢谢你愿意分享。' } },
      { type: 'Button', id: 'g105-quick-three', props: { label: '慢慢来', kind: 'quiet', action: 'tower.response.quick', actionArg: '我们可以慢慢来。' } },
    ] },
  ];
  const interactionActions: LayoutNode[] = [
    { type: 'Button', id: 'g105-interaction-complete', props: { label: interaction?.kind === 'summary' ? '记下这一块' : '提交回应', kind: 'hero', skin: primarySkin, action: interaction?.kind === 'summary' ? 'tower.interaction.complete' : 'tower.interaction.submit' }, layout: { press3d: true, fx: [{ kind: 'sheen-hover' }] } },
    ...(interaction?.kind === 'main' ? [{ type: 'Button' as const, id: 'g105-interaction-swap', props: { label: s.swapsRemaining ? '换一张（1）' : '换卡已用', disabled: !s.swapsRemaining, kind: 'quiet' as const, skin: secondarySkin, action: 'tower.interaction.swap' } }] : []),
    { type: 'Button', id: 'g105-interaction-skip', props: { label: '这次跳过', kind: 'quiet', skin: secondarySkin, action: 'tower.interaction.skip' } },
  ];
  const wrapResolution: LayoutNode[] = s.loser === 'player' ? [
    { type: 'Input', id: 'g105-wrap-input', props: { placeholder: '写下一句收尾（仅本局可见）', value: s.draftResponse, action: 'tower.response.draft' } },
    { type: 'Panel', id: 'g105-wrap-actions', props: { bare: true }, layout: { direction: 'row', gap: 8, justify: 'center' }, children: [
      { type: 'Button', id: 'g105-wrap-submit', props: { label: '提交回应', kind: 'primary', skin: primarySkin, action: 'tower.wrap.submit' } },
      { type: 'Button', id: 'g105-wrap-light', props: { label: '慢慢来也可以', kind: 'quiet', skin: secondarySkin, action: 'tower.response.quick', actionArg: '慢慢来也可以。' } },
      { type: 'Button', id: 'g105-wrap-skip', props: { label: '这次跳过', kind: 'quiet', skin: secondarySkin, action: 'tower.wrap.skip' } },
    ] },
  ] : s.loser === 'ai' && !s.aiWrapAcknowledged && s.aiPenaltyCompleted ? [
    { type: 'Button', id: 'g105-ai-wrap-continue', props: { label: '继续结算', kind: 'primary', skin: primarySkin, action: 'tower.wrap.continue' }, layout: { press3d: true, fx: [{ kind: 'sheen-hover' }] } },
  ] : [];
  const memoryCard: LayoutNode[] = s.heartDelta >= 8 ? [{ type: 'Panel', id: 'g105-memory-card', props: { bg: 'raised', edge: 'gold' }, layout: { padding: 10 }, children: [
    { type: 'Label', id: 'g105-memory-title', props: { text: '本局回忆', size: 'sm', color: 'ink', bold: true } },
    { type: 'Label', id: 'g105-memory-copy', props: { text: `今晚的塔摇过 ${Math.max(1, s.linkedExtractions)} 次，但你们没有急着松手。`, size: 'sm', color: 'text', font: 'cnwen' } },
  ] }] : [];
  const children: LayoutNode[] = [
    { type: 'Panel', id: 'g105-companion-card', props: { bg: { custom: 'linear-gradient(145deg,#37212f,#171924)' }, edge: 'gold', skin: skin(GAME105_SKINS.panelM), skinSlice: 28, title: '今晚的陪玩', titleIcon: skin(companionPortrait(s.phase)) }, layout: { x: 20, y: 18, width: 300, padding: 14, gap: 5, fx: [{ kind: 'glow', color: 'gold', intensity: .45 }, { kind: 'sheen-hover' }] }, children: [
      { type: 'Label', id: 'g105-title', props: { text: '心动叠叠塔', size: 'xl', font: 'cnwen', color: { custom: '#e7bf70' }, glow: true } },
      { type: 'Label', id: 'g105-companion-name', props: { text: companionName, size: 'sm', color: { custom: '#f7e9e5' }, bold: true } },
      { type: 'Label', id: 'g105-status', props: { text, size: 'sm', color: s.phase === 'collapse-locked' ? { custom: '#ffd58b' } : { custom: '#f3bbc8' } } },
    ] },
    { type: 'Panel', id: 'g105-ledger', props: { bg: { custom: 'linear-gradient(150deg,#fffdf7,#f7ead8)' }, edge: 'gold', skin: skin(GAME105_SKINS.panelS), skinSlice: 28 }, layout: { x: 956, y: 18, width: 304, padding: 14, gap: 6, fx: [{ kind: 'sheen-hover' }] }, children: [
      { type: 'Label', id: 'g105-ledger-title', props: { text: '本局心动账', size: 'sm', color: 'ink', bold: true, spans: [{ text: '本局心动账', img: skin(GAME105_SKINS.heartIcon) }] } },
      { type: 'Label', id: 'g105-heart', props: { text: `心动值  ${s.heartDelta}`, size: 'xl', font: 'cnround', color: { custom: '#875118' }, glow: true, spans: [{ text: `心动值  ${s.heartDelta}`, img: skin(GAME105_SKINS.heartSpark) }] }, layout: s.heartDelta > 0 ? { fx: [{ kind: 'pop', color: 'gold', once: true }] } : undefined },
      { type: 'ProgressBar', id: 'g105-heart-slots', props: { value: Math.min(s.heartDelta, 12), max: 12, tone: 'gold', label: '今晚的心动刻度', trackSkin: skin(GAME105_SKINS.heartSlot), fillSkin: skin(GAME105_SKINS.heartFill) } },
      { type: 'Label', id: 'g105-ledger-detail', props: { text: `完成互动 ${s.completedInteractions} · 战利品 ${s.loot.length}`, size: 'xs', color: 'sub' } },
    ] },
    { type: 'Panel', id: 'g105-controls', props: { bg: { custom: 'linear-gradient(90deg,rgba(37,22,35,.92),rgba(73,31,51,.88))' }, edge: 'jade', skin: skin(GAME105_SKINS.panelL), skinSlice: 28 }, layout: { x: 356, y: 632, width: 568, padding: 12, direction: 'row', justify: 'center', gap: 18, radius: 18, fx: [{ kind: 'sheen-hover' }] }, children: [
      { type: 'Label', id: 'g105-note', props: { text: s.phase === 'player-ready' ? '左键抽取  ·  右键环视  ·  Esc 收手' : s.phase === 'ai-observe' || s.phase === 'ai-pulling' ? '请看着 TA 的真实操作' : '真实物理持续运行中', size: 'sm', color: { custom: '#fff0e8' }, font: 'cnwen' } },
    ] },
  ];
  if (s.phase === 'player-interaction') {
    // Keep the lower centre clear so the player can still read the detached body's real fall.
    children.push({ type: 'Panel', id: 'g105-interaction-card', props: { bg: { custom: 'linear-gradient(145deg,#fffdf7 0%,#f8ead4 58%,#f1ddbd 100%)' }, edge: 'gold', skin: skin(GAME105_SKINS.cardFrame), skinSlice: 22 }, layout: { x: 20, y: 430, width: 484, padding: 20, gap: 10, anim: 'slideUp', animMs: 220, fx: [{ kind: 'sheen-hover' }] }, children: [
      { type: 'Label', id: 'g105-card-title', props: { text: interaction?.title ?? '今晚的小卡', size: 18, color: 'ink', font: 'cnwen', bold: true } },
      { type: 'Label', id: 'g105-card-kicker', props: { text: `${interaction?.kind === 'summary' ? `余波 x${interaction.total}` : interaction?.kind === 'aftershock' ? `余波 ${interaction.sequence}/${interaction.total}` : '主卡'}  ·  ${channelName}`, size: 'xs', color: 'ink', tracking: 1, bold: true } },
      { type: 'Label', id: 'g105-card-text', props: { text: interaction?.text ?? '', size: 18, font: 'cnwen', color: 'ink', bold: true } },
      ...responseFields,
      { type: 'Panel', id: 'g105-card-actions', props: { bare: true }, layout: { direction: 'row', gap: 8, justify: 'center' }, children: interactionActions },
      { type: 'Label', id: 'g105-card-safety', props: { text: '不想展开时，可以跳过；本局不会记录到长期记忆。', size: 'xs', color: 'sub' } },
      ...(s.aftershockSummary ? [{ type: 'Label' as const, id: 'g105-aftershock-summary', props: { text: `余波 x${s.aftershockSummary} 逐块结算，不再连续抛出完整问题。`, size: 'xs' as const, color: 'sub' as const } }] : []),
    ] });
  }
  if (s.phase === 'ai-response' && aiCard) children.push({ type: 'Panel', id: 'g105-ai-interaction-card', props: { bg: { custom: 'linear-gradient(145deg,#fffdf7 0%,#f8ead4 58%,#f1ddbd 100%)' }, edge: 'gold', skin: skin(GAME105_SKINS.cardFrame), skinSlice: 22 }, layout: { x: 776, y: 402, width: 484, padding: 20, gap: 10, anim: 'slideUp', animMs: 220 }, children: [
    { type: 'Label', id: 'g105-ai-card-heading', props: { text: 'TA 抽到的卡', size: 'sm', color: 'sub', bold: true } },
    { type: 'Label', id: 'g105-ai-card-title', props: { text: aiCard.title, size: 18, color: 'ink', font: 'cnwen', bold: true } },
    { type: 'Label', id: 'g105-ai-card-kicker', props: { text: `${aiCard.kind === 'main' ? '主卡' : `余波 ${aiCard.sequence}/${aiCard.total}`} · ${({ pink: '轻语 / 樱粉', purple: '心动 / 星紫', blue: '默契 / 夜蓝', gold: '勇气 / 流金' } as const)[aiCard.block.channel]}`, size: 'xs', color: 'ink', bold: true } },
    { type: 'Label', id: 'g105-ai-card-text', props: { text: aiCard.text, size: 18, color: 'ink', font: 'cnwen', bold: true } },
    { type: 'Label', id: 'g105-ai-card-reply', props: { text: s.aiReplyVisible ? s.templateReply : 'TA 正在回应…', size: 'sm', color: 'sub', font: 'cnwen' } },
    ...(s.aiReplyVisible ? [{ type: 'Button' as const, id: 'g105-ai-reply-continue', props: { label: s.aiInteractionQueue.length > 1 ? '下一张卡' : '轮到你了', kind: 'hero' as const, skin: primarySkin, action: 'tower.ai.reply.continue' }, layout: { press3d: true, fx: [{ kind: 'sheen-hover' as const }] } }] : []),
  ] });
  if (s.phase === 'collapse-locked') children.push({ type: 'Panel', id: 'g105-wrap-card', props: { bg: { custom: 'linear-gradient(145deg,#fffdf8,#f4e3cf)' }, edge: 'gold', bgTexture: skin(GAME105_SKINS.bannerWrap), bgTextureSize: 460 }, layout: { x: 410, y: 330, width: 460, padding: 20, gap: 10, anim: 'pop', animMs: 220, fx: [{ kind: 'sheen-hover' }] }, children: [
    { type: 'Label', id: 'g105-wrap-title', props: { text: '这一局先到这里', size: 18, color: 'ink', font: 'cnwen', bold: true } },
    { type: 'Label', id: 'g105-wrap-copy', props: { text: `${s.loser === 'player' ? '你' : 'TA'}接下这张收尾卡。${s.wrapUpText}`, size: 18, color: 'ink', font: 'cnwen' } },
    { type: 'Label', id: 'g105-wrap-fact', props: { text: `第 ${s.round} 轮 · 你抽取 ${s.playerDraws} · TA 抽取 ${s.aiDraws} · 完成互动 ${s.completedInteractions} · 连带 ${s.linkedExtractions}`, size: 'sm', color: 'ink' } },
    ...(s.loser === 'ai' && s.aiPenaltyCard ? [
      { type: 'Label' as const, id: 'g105-ai-penalty-heading', props: { text: 'TA 的收尾卡', size: 'sm' as const, color: 'sub' as const, bold: true } },
      { type: 'Label' as const, id: 'g105-ai-penalty-title', props: { text: s.aiPenaltyCard.title, size: 18, color: 'ink' as const, bold: true } },
      { type: 'Label' as const, id: 'g105-ai-penalty-prompt', props: { text: s.aiPenaltyCard.prompt, size: 'sm' as const, color: 'ink' as const } },
      { type: 'Label' as const, id: 'g105-ai-penalty-reply', props: { text: s.aiPenaltyCompleted ? s.templateReply : 'TA 正在回应…', size: 'sm' as const, color: 'sub' as const } },
    ] : []),
    ...wrapResolution,
    ...memoryCard,
    { type: 'Button', id: 'g105-restart', props: { label: '再来一局', kind: 'hero', skin: primarySkin, action: 'tower.restart' }, layout: { press3d: true, fx: [{ kind: 'sheen-hover' }] } },
  ] });
  else children.push({ type: 'Panel', id: 'g105-restart-slot', props: { bare: true }, layout: { x: 20, y: 215, width: 164 }, children: [
    { type: 'Button', id: 'g105-restart', props: { label: `重开本局（${restarts}）`, kind: 'quiet', skin: secondarySkin, action: 'tower.restart' } },
  ] });
  return { type: 'Panel', id: 'g105-probe-hud', props: { bare: true }, layout: { x: 20, y: 18, gap: 6 }, children };
}

export function mount(container: HTMLElement, host: Game105MountHost = {}): () => void {
  const shellHost = mountHost(container, { fieldW: 1280, fieldH: 720, sceneBackground: 'radial-gradient(ellipse at 50% 18%,#7a3958 0%,#3a2138 48%,#1c1728 100%)', wrapperBackground: '#1c1728' });
  const engine = new Engine(); engine.load(towerBlueprint());
  const artAssets = createArtAssets();
  const renderer = new ThreeRenderer({ width: 1280, height: 720, transparent: true, antialias: false, dprCap: 1.5, shadowMapSize: 1024, assets: artAssets });
  engine.attachRenderer(renderer, shellHost.scene);
  const session = new TowerGameSession(host.seed); let restarts = 0; let restartPending = false; let dragId: number | null = null; let orbit: { id: number; x: number; y: number } | null = null;
  const companionName = host.companionName?.trim() ? `${host.companionName.trim()} · 联调模式` : '绮光 · 本地陪伴模式';
  const playerPersonaName = host.playerPersonaName?.trim() ?? '';
  const hostAdapterEnabled = isHostAdapterEnabled(host);
  let skins: Game105Skins = {};
  let ui: MountHandle;
  let lifecycleToken = 0;
  let completionReported = false;
  let activeAIResponseTicket = '';
  let pendingAIResponse = false;
  let llmReplyCount = 0;
  let templateReplyCount = 0;
  const refresh = () => ui.update(hud(session, restarts, skins, companionName));
  let director: AITurnDirector | null = null;
  const restart = () => {
    if (restartPending) return;
    lifecycleToken += 1;
    director?.cancel();
    session.restart();
    completionReported = false;
    activeAIResponseTicket = '';
    pendingAIResponse = false;
    llmReplyCount = 0;
    templateReplyCount = 0;
    for (const id of engine.world.getAllEntities()) engine.world.destroyEntity(id);
    restarts++;
    restartPending = true;
    refresh();
  };
  const executor = new TowerActionExecutor({ world: engine.world, session, invalidate: () => renderer.invalidate(), restart }); director = new AITurnDirector(executor);
  ui = mountUI(shellHost.overlayHost, hud(session, restarts, skins, companionName), {
    'tower.restart': restart,
    'tower.interaction.complete': () => { session.resolveInteraction(true); refresh(); },
    'tower.interaction.skip': () => { session.resolveInteraction(false); refresh(); },
    'tower.interaction.submit': () => { session.submitInteraction(); refresh(); },
    'tower.interaction.swap': () => { session.swapInteraction(); refresh(); },
    'tower.response.draft': (value) => { session.setDraftResponse(String(value ?? '')); refresh(); },
    'tower.response.quick': (value) => { session.useQuickReply(String(value ?? '')); refresh(); },
    'tower.wrap.submit': () => { session.submitWrapUp(); refresh(); },
    'tower.wrap.skip': () => { session.skipWrapUp(); refresh(); },
    'tower.wrap.continue': () => { session.acknowledgeAIWrap(); refresh(); },
    'tower.ai.reply.continue': () => { session.advanceAIResponse(); refresh(); },
  }, HEART_TOWER_THEME);
  const canvas = shellHost.scene.querySelector('canvas');
  void Promise.all([loadGameArtInto(artAssets, 'game-105'), loadGameArtOverrides('game-105')]).then(([loaded, next]) => {
    skins = next;
    const scene = skins[GAME105_SKINS.sceneNightRoom];
    if (scene) shellHost.scene.style.background = `url("${scene}") center/cover no-repeat`;
    if (loaded) renderer.invalidate();
    refresh();
  });
  const hover = (e: PointerEvent) => {
    const hit = renderer.pick(e.clientX, e.clientY);
    const active = session.phase === 'player-ready' && hit?.signal === 'g105-pick';
    executor.execute('player', { type: 'hover', blockId: active ? hit.entityId : null });
    // A visual-only cursor ring makes the same player/AI hover affordance discoverable without a new world entity.
    canvas && (canvas.style.cursor = active && skins[GAME105_SKINS.hoverRing] ? `url("${skins[GAME105_SKINS.hoverRing]}") 48 48, pointer` : '');
  };
  const down = (e: PointerEvent) => {
    if (e.button === 2) { if (session.phase !== 'collapse-locked') { e.preventDefault(); canvas?.setPointerCapture?.(e.pointerId); orbit = { id: e.pointerId, x: e.clientX, y: e.clientY }; } return; }
    if (e.button !== 0 || session.phase !== 'player-ready') return;
    const hit = renderer.pick(e.clientX, e.clientY);
    if (hit?.signal === 'g105-pick' && executor.execute('player', { type: 'grab', blockId: hit.entityId })) {
      // Continue receiving moves even when the pointer crosses the canvas boundary.
      canvas?.setPointerCapture?.(e.pointerId);
      dragId = e.pointerId;
    }
    refresh();
  };
  const move = (e: PointerEvent) => {
    if (orbit?.id === e.pointerId) { executor.execute('player', { type: 'observe', yaw: (e.clientX - orbit.x) * .008, pitch: -(e.clientY - orbit.y) * .006 }); orbit = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    if (!executor.isGrabbing) { hover(e); return; }
    if (dragId !== e.pointerId || executor.dragPlaneY === null) return;
    const point = renderer.screenToWorld(e.clientX, e.clientY, executor.dragPlaneY, 'y'); const distance = point && executor.projectPullDistance(point);
    if (distance !== null && distance !== undefined) executor.execute('player', { type: 'pull', delta: distance - executor.requestedPullDistance });
  };
  const up = (e: PointerEvent) => { if (orbit?.id === e.pointerId) { canvas?.releasePointerCapture?.(e.pointerId); orbit = null; return; } if (dragId === e.pointerId) { executor.execute('player', { type: 'release' }); canvas?.releasePointerCapture?.(e.pointerId); dragId = null; refresh(); } };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') up({ pointerId: dragId } as PointerEvent); if (e.key.toLowerCase() === 'r') restart(); };
  canvas?.addEventListener('pointerdown', down); canvas?.addEventListener('pointermove', move); canvas?.addEventListener('pointerup', up); canvas?.addEventListener('pointercancel', up); window.addEventListener('keydown', key); canvas?.addEventListener('contextmenu', (e) => e.preventDefault());
  const activeAIReplyCard = (): InteractionCard | AIPenaltyCard | null => session.phase === 'ai-response' ? session.aiInteractionQueue[0] ?? null : session.aiPenaltyCard;
  const aiResponseTicket = (): string => {
    const card = activeAIReplyCard();
    return card ? `${session.round}:${session.aiDraws}:${card.effectId}` : '';
  };
  const aiReplyRequest = (): Game105AIReplyRequest | null => {
    const card = activeAIReplyCard();
    if (!card) return null;
    const isPenalty = 'prompt' in card;
    return {
      ticket: aiResponseTicket(), kind: isPenalty ? 'penalty' : 'draw',
    sessionId: host.sessionId ?? null,
    characterName: host.companionName?.trim() || '绮光',
    playerPersonaName,
    round: session.round,
    heartDelta: session.heartDelta,
    card: isPenalty
      ? { effectId: card.effectId, channel: card.channel, title: card.title, prompt: card.prompt, sequence: card.sequence, total: card.total }
      : { effectId: card.effectId, channel: card.block.channel, title: card.title, prompt: card.text, sequence: card.sequence, total: card.total },
    fallbackReply: session.templateReply,
    };
  };
  const fallbackFor = (request: Game105AIReplyRequest): string => {
    if (request.fallbackReply) return request.fallbackReply;
    if (request.kind === 'penalty') return ({
      '真心收尾': '这一局我有点急了，但我会记住你刚才没有催我。',
      '勇气承认': '其实我刚才也紧张，只是想装得从容一点。',
      '温柔约定': '下一局我会把步子放慢，和你好好看着塔。',
      '反向鼓励': '你刚才愿意停下来观察，这一点真的很厉害。',
    } as Record<string, string>)[request.card.title] ?? '这局先收在这里。下次我们慢一点，也认真一点。';
    const replies: Record<TowerBlock['channel'], readonly string[]> = {
      pink: ['这件小事听起来很暖，我会好好把它放在心上。', '原来你会留意这样的细节，和你聊天会让人安心。'],
      purple: ['这一块让我有点心动，我想认真回应你。', '你选的这句话很轻，我却记得很清楚。'],
      blue: ['这个小计划不错，我们可以从不赶时间的那一步开始。', '和你一起把它慢慢完成，听起来很有意思。'],
      gold: ['谢谢你把勇气放在这一块上，我收到了。', '这句鼓励很具体，我会带着它继续下一轮。'],
    };
    const choices = replies[request.card.channel];
    return choices[(request.card.sequence - 1) % choices.length]!;
  };
  const settleAIReply = (request: Game105AIReplyRequest, text: string, mode: 'llm' | 'template'): void => {
    session.templateReply = text || fallbackFor(request);
    if (mode === 'llm') llmReplyCount += 1;
    else templateReplyCount += 1;
    pendingAIResponse = false;
    if (request.kind === 'penalty') session.finishAIPenaltyReply();
    else session.finishAIResponse();
    refresh();
  };
  const unsubscribe = engine.subscribe(() => {
    if (restartPending) { engine.load(towerBlueprint()); renderer.drainPhysicsSignals(); restartPending = false; return; }
    executor.observePhysicalPull(); executor.observeTowerMembership(); const signals = renderer.drainPhysicsSignals().filter((x) => x.signal === 'g105-toppled' || x.signal === 'g105-settled');
    const ids = TOWER_BLOCKS.filter((b) => !session.extractedBlocks.has(b.id)).map((b) => b.id); const before = session.phase;
    session.observePhysics(renderer.arePhysicsBodiesSleeping(ids), signals.filter((x) => x.signal === 'g105-toppled').map((x) => x.arg));
    session.observeSleepingExtractions(new Set(TOWER_BLOCKS.filter((block) => session.extractedBlocks.has(block.id) && renderer.arePhysicsBodiesSleeping([block.id])).map((block) => block.id)));
    const request = aiReplyRequest();
    const needsAIReply = !!request && (
      (session.phase === 'ai-response' && !session.aiReplyVisible)
      || (session.phase === 'collapse-locked' && session.loser === 'ai' && !session.aiPenaltyCompleted)
    );
    if (needsAIReply && request && aiResponseTicket() !== activeAIResponseTicket) {
      const ticket = aiResponseTicket(); activeAIResponseTicket = ticket;
      if (!hostAdapterEnabled || !host.resolveAIReply) settleAIReply(request, fallbackFor(request), 'template');
      else {
        pendingAIResponse = true;
        const token = lifecycleToken;
        void Promise.resolve(host.resolveAIReply(request))
          .then((result) => {
            if (token !== lifecycleToken || activeAIResponseTicket !== ticket) return;
            const text = typeof result?.text === 'string' ? result.text.trim().slice(0, 80) : '';
            settleAIReply(request, text, result?.mode === 'template' || !text ? 'template' : 'llm');
          })
          .catch(() => {
            if (token !== lifecycleToken || activeAIResponseTicket !== ticket) return;
            settleAIReply(request, fallbackFor(request), 'template');
          });
      }
    }
    if (session.phase === 'collapse-locked') {
      director?.cancel();
      executor.clear();
      if (!completionReported && (session.loser !== 'ai' || session.aiPenaltyCompleted)) {
        completionReported = true;
        if (hostAdapterEnabled) host.onComplete?.({
          session,
          replyMode: normalizeReplyMode(llmReplyCount, templateReplyCount),
          companionName,
          playerPersonaName,
          sessionId: host.sessionId ?? null,
        });
      }
    } else if (session.phase !== 'ai-response') director?.tick(createLocalAIObservation({ phase: session.phase, turn: session.turn, layout: TOWER_BLOCKS, extractedIds: session.extractedBlocks, retiredIds: session.retiredBlocks, settledExtractionHistory: session.settledExtractionHistory, selectedBlockId: executor.selectedBlockId, consumedSignals: signals.map((x) => ({ signal: x.signal, blockId: x.arg })) }));
    if (before !== session.phase || signals.length) refresh();
  });
  engine.start();
  return () => { lifecycleToken += 1; unsubscribe(); canvas?.removeEventListener('pointerdown', down); canvas?.removeEventListener('pointermove', move); canvas?.removeEventListener('pointerup', up); canvas?.removeEventListener('pointercancel', up); window.removeEventListener('keydown', key); ui(); engine.stop(); renderer.destroy(); shellHost.teardown(); };
}
