import { createAppClient } from 'dokiworlds-app-sdk';
import { AssetManager, ImageAssetLoader } from '@zerocraft/engine/assets/index.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { mountHost, type HostSkeleton } from '@zerocraft/engine/engine/host/mount-host.js';
import { CardRevealSession } from '../../../games/game-card-reveal/session.js';
import type { DeliveryView } from '../../../games/game-card-reveal/screen.js';
import { ACTION } from '../../../games/game-card-reveal/tracks.js';
import { inputFromContract, readyLaunchDecision, type CardRevealInput } from './contract.js';
import { CompletionGate } from './completion.js';
import { CARD_REVEAL_CANVAS_OPTIONS, CARD_REVEAL_HOST_OPTIONS } from './host-config.js';
import { prepareCardArt } from './card-assets.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app not found');
const app = createAppClient({ appId: 'game-card-reveal', targetOrigin: '*' });
const query = new URLSearchParams(window.location.search);
const previewMode = query.get('preview') === '1';
const requestedPreviewCount = Number(query.get('cards'));
const previewCount = previewMode && Number.isInteger(requestedPreviewCount) && requestedPreviewCount >= 1 && requestedPreviewCount <= 5 ? requestedPreviewCount : 1;
const requestedPreviewFailure = Number(query.get('fallbackCard'));
const previewFailureIndex = previewMode && query.has('fallbackCard') && Number.isInteger(requestedPreviewFailure) && requestedPreviewFailure >= 0 && requestedPreviewFailure < previewCount ? requestedPreviewFailure : undefined;
const previewFixture: CardRevealInput = { presentationId: 'internal-preview', cards: Array.from({ length: previewCount }, (_, index) => ({ id: `preview-${index}`, faceImageUrl: `card.preview.${index}`, alt: '预览卡面' })) };
let mounted = true;
let started = false;
let host: HostSkeleton | undefined;
let renderer: CanvasRenderer | undefined;
let assets: AssetManager | undefined;
let session: CardRevealSession | undefined;
let gate: CompletionGate | undefined;
let preview = false;
let delivery: DeliveryView = 'idle';
const disconnect = app.connect();
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
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); app.requestExit(); return; }
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (delivery === 'retry') { void tryComplete(); return; }
    session?.action(ACTION.skip);
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
  assets = new AssetManager(new ImageAssetLoader());
  try {
    await prepareCardArt(assets, input, isPreview, undefined, isPreview ? previewFailureIndex : undefined);
    if (!mounted) return;
  } catch (error) {
    if (!mounted) return;
    console.warn('Card reveal art unavailable:', error);
    app.requestExit();
    return;
  }
  session = new CardRevealSession(input.cards, reduced ? 'reduced' : 'standard');
  gate = new CompletionGate(input, isPreview);
  renderer = new CanvasRenderer({ ...CARD_REVEAL_CANVAS_OPTIONS, assets });
  session.engine.attachRenderer(renderer, host.playfieldHost);
  session.engine.subscribe(() => {
    if (!mounted || !session) return;
    if (session.view().status === 'terminal' && delivery === 'idle') void tryComplete();
  });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', onKey);
  session.engine.start();
}

if (previewMode) void load(previewFixture, true);
void app.whenReady({ timeoutMs: 10_000 }).then((envelope) => {
  if (!mounted) return;
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
  session?.engine.stop(); renderer?.destroy(); assets?.clear(); host?.teardown();
  disconnect(); app.dispose();
}, { once: true });
