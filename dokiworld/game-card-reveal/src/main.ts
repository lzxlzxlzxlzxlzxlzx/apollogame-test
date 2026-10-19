import { createAppClient } from 'dokiworlds-app-sdk';
import { AssetManager } from '@zerocraft/engine/assets/index.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { mountHost, type HostSkeleton } from '@zerocraft/engine/engine/host/mount-host.js';
import { CardRevealSession } from '../../../games/game-card-reveal/session.js';
import type { DeliveryView } from '../../../games/game-card-reveal/screen.js';
import { ACTION } from '../../../games/game-card-reveal/tracks.js';
import { inputFromContract, readyLaunchDecision, type CardRevealInput } from './contract.js';
import { CompletionGate } from './completion.js';
import { CARD_REVEAL_CANVAS_OPTIONS, CARD_REVEAL_HOST_OPTIONS } from './host-config.js';
import { CARD_ART_KEYS, CardArtCoordinator, finishLocalCardArtForLaunch, prefetchCriticalCardArt, prepareCardArt } from './card-assets.js';
import { SettlementArtCoordinator } from './settlement-art.js';
import { SettlementVisualLoader } from './settlement-visuals.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app not found');
const app = createAppClient({ appId: 'game-card-reveal', targetOrigin: '*' });
const query = new URLSearchParams(window.location.search);
const previewMode = query.get('preview') === '1';
const settlementPreview = previewMode && (query.get('settlement') === '1' || query.get('settlement') === 'source');
const sourceSettlementPreview = previewMode && query.get('settlement') === 'source';
const requestedPreviewCount = Number(query.get('cards'));
const previewCount = previewMode && Number.isInteger(requestedPreviewCount) && requestedPreviewCount >= 1 && requestedPreviewCount <= 5 ? requestedPreviewCount : 1;
const requestedPreviewFailure = Number(query.get('fallbackCard'));
const previewFailureIndex = previewMode && query.has('fallbackCard') && Number.isInteger(requestedPreviewFailure) && requestedPreviewFailure >= 0 && requestedPreviewFailure < previewCount ? requestedPreviewFailure : undefined;
const previewFixture: CardRevealInput = { presentationId: 'internal-preview', cards: Array.from({ length: previewCount }, (_, index) => ({ id: `preview-${index}`, faceImageUrl: `card.preview.${index}`, alt: '预览卡面' })) };
let mounted = true;
let started = false;
let host: HostSkeleton | undefined;
let renderer: CanvasRenderer | undefined;
const settlementLoader = new SettlementVisualLoader();
const assets = new AssetManager(settlementLoader);
let session: CardRevealSession | undefined;
let gate: CompletionGate | undefined;
let cardArt: CardArtCoordinator | undefined;
let settlementArt: SettlementArtCoordinator | undefined;
let cardArtFrozen = false;
let preview = false;
let delivery: DeliveryView = 'idle';
const disconnect = app.connect();
performance.mark('card-reveal:boot');
const localCriticalReady = prefetchCriticalCardArt(assets).then((ready) => {
  if (ready) {
    performance.mark('card-reveal:local-critical-ready');
    performance.measure('card-reveal:boot-to-local-critical', 'card-reveal:boot', 'card-reveal:local-critical-ready');
  }
  return ready;
});
async function tryComplete(): Promise<void> {
  if (!mounted || !session || !gate || preview || delivery === 'pending' || delivery === 'accepted') return;
  const state = session.view();
  if (state.status !== 'terminal' || !state.completion) return;
  gate.markP5Terminal(state.completion);
  delivery = 'pending';
  const accepted = await gate.complete((output) => app.complete(output));
  if (!mounted) return;
  delivery = accepted ? 'accepted' : 'retry';
}
function freezeCardArt(): void {
  if (cardArtFrozen || (!cardArt && !settlementArt)) return;
  (settlementArt ?? cardArt)!.freeze();
  cardArtFrozen = true;
  performance.mark('card-reveal:card-art-frozen');
  performance.measure('card-reveal:boot-to-card-art-frozen', 'card-reveal:boot', 'card-reveal:card-art-frozen');
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); app.requestExit(); return; }
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (delivery === 'retry') { void tryComplete(); return; }
    if (session?.view().status === 'playing') {
      freezeCardArt(); // A same-turn skip cannot reveal a card before its art is locked.
      session.action(ACTION.skip);
    }
  }
}
function onVisibility(): void {
  if (document.hidden) session?.action(ACTION.pause);
  else if (session?.view().status === 'paused') session.action(ACTION.resume);
}
async function load(input: CardRevealInput, isPreview: boolean): Promise<void> {
  if (!mounted || !root || started) return;
  started = true;
  preview = isPreview;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  host = mountHost(root, CARD_REVEAL_HOST_OPTIONS);
  let activeInput = input;
  try {
    if (!await finishLocalCardArtForLaunch(assets, localCriticalReady, isPreview, input.cards.length)) {
      throw new Error('Card reveal local art is unavailable.');
    }
    const previewImage = isPreview && settlementPreview ? assets.get(CARD_ART_KEYS.preview[0])?.descriptor.src : undefined;
    activeInput = previewImage ? {
      presentationId: 'settlement-preview', locale: 'zh-CN',
      pack: { packId: 'preview', title: sourceSettlementPreview ? '哈利·波特' : '结算演出预览', coverImageUrl: previewImage, titleLogoUrl: null },
      cards: input.cards.map((card, index) => ({ ...card, kind: index % 2 === 0 ? 'event' : 'item',
        name: sourceSettlementPreview ? '哈利·波特 · 通关纪念' : `奖励卡 ${index + 1}`,
        description: sourceSettlementPreview ? '完成全部主线' : '来自已完成任务的奖励展示',
        rarity: sourceSettlementPreview ? 'epic' : 'rare', worldTitle: sourceSettlementPreview ? '哈利·波特' : '演出验收',
        faceImageUrl: assets.get(CARD_ART_KEYS.preview[index])?.descriptor.src ?? '' })),
    } : input;
    if (activeInput.pack) {
      settlementArt = new SettlementArtCoordinator(assets, settlementLoader, activeInput);
      await settlementArt.start();
    } else if (isPreview) {
      await prepareCardArt(assets, input, true, async () => true, previewFailureIndex);
    } else {
      cardArt = new CardArtCoordinator(assets, input);
      await cardArt.start();
    }
    if (!mounted) return;
    if (isPreview) {
      performance.mark('card-reveal:card-art-frozen');
      performance.measure('card-reveal:boot-to-card-art-frozen', 'card-reveal:boot', 'card-reveal:card-art-frozen');
    }
  } catch (error) {
    if (!mounted) return;
    cardArt?.dispose(); settlementArt?.dispose();
    console.warn('Card reveal art unavailable:', error);
    app.requestExit();
    return;
  }
  session = new CardRevealSession(activeInput.cards, reduced ? 'reduced' : 'standard');
  gate = new CompletionGate(activeInput, isPreview);
  renderer = new CanvasRenderer({ ...CARD_REVEAL_CANVAS_OPTIONS, assets });
  const guardedRenderer = {
    init(container: HTMLElement): void { renderer!.init(container); },
    sync(world: Parameters<CanvasRenderer['sync']>[0]): void {
      // Engine notifies subscribers after rendering. Guard this boundary instead:
      // P3's first rendered frame can never precede the synchronous freeze.
      const phase = session!.view().phase;
      if ((cardArt || settlementArt) && !cardArtFrozen && phase !== 'idle' && phase !== 'P2') freezeCardArt();
      renderer!.sync(world);
    },
    destroy(): void { renderer!.destroy(); },
  };
  session.engine.attachRenderer(guardedRenderer, host.playfieldHost);
  session.engine.subscribe(() => {
    if (!mounted || !session) return;
    if (session.view().status === 'terminal' && delivery === 'idle') void tryComplete();
  });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', onKey);
  session.engine.start();
  performance.mark('card-reveal:engine-start');
  performance.measure('card-reveal:boot-to-engine-start', 'card-reveal:boot', 'card-reveal:engine-start');
}

if (previewMode) void load(previewFixture, true);
void app.whenReady({ timeoutMs: 10_000 }).then((envelope) => {
  if (!mounted) return;
  performance.mark('card-reveal:sdk-ready');
  performance.measure('card-reveal:boot-to-sdk-ready', 'card-reveal:boot', 'card-reveal:sdk-ready');
  const decision = readyLaunchDecision(envelope.data, previewMode, started);
  if (decision === 'preview') void load(previewFixture, true);
  if (decision === 'formal') void load(inputFromContract(envelope), false);
}).catch((error: unknown) => {
  if (!mounted || previewMode) return;
  console.error('Card reveal launch rejected:', error);
  app.requestExit();
});
window.addEventListener('pagehide', () => {
  mounted = false;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('keydown', onKey);
  session?.engine.stop(); cardArt?.dispose(); settlementArt?.dispose(); renderer?.destroy(); assets.clear(); host?.teardown();
  disconnect(); app.dispose();
}, { once: true });
