import { createAppClient, type AppContract } from 'dokiworlds-app-sdk';
import { mountUI, type ActionSink, type MountHandle } from '@zerocraft/engine/ui/components/index.js';
import { parseChestInput, presentation, resolveChest, toChestOutput, type ChestInput, type ChestResultData } from './chest.js';
import { buildChestErrorScreen, buildChestScreen, CHEST_CLAIM_ACTION, CHEST_THEME, type ChestOpeningPhase } from './chest-screen.js';
import './style.css';

const APP_ID = 'game-loot-chest';
const INPUT_CONTRACT = 'doki.game.chest-input';
const INPUT_VERSION = 2;
const CLOSED_BEAT_MS = 180;
const OPENING_DURATION_MS = 900;
const standalonePreview = new URLSearchParams(window.location.search).get('preview') === '1';
const demo: ChestInput = parseChestInput({
  sessionId: 'local-demo', tableId: 'demo-chest', chest: { name: '遗迹青铜宝箱' },
  rng: { algorithm: 'mulberry32-v1', seed: 184728391 },
  root: {
    type: 'all',
    children: [
      { type: 'item', itemId: 'gold', name: '金币', quantity: { min: 50, max: 100 } },
      {
        type: 'repeat', count: 3, replacement: true,
        child: {
          type: 'choose',
          entries: [
            { weight: 60, child: { type: 'item', itemId: 'healing-potion', name: '回春膏', quantity: { fixed: 1 } } },
            { weight: 30, child: { type: 'item', itemId: 'spirit-stone', name: '灵石', quantity: { min: 3, max: 8 } } },
            { weight: 10, child: { type: 'item', itemId: 'ancient-key', name: '古钥匙', quantity: { fixed: 1 } } },
          ],
        },
      },
    ],
  },
});

const rootElement = document.querySelector<HTMLElement>('#app');
if (!rootElement) throw new Error('#app not found');
const root: HTMLElement = rootElement;

let current = demo;
let phase: ChestOpeningPhase = 'closed';
let result: ChestResultData | undefined;
let sent = false;
let dokiSession = false;
let failedSessionId: string | undefined;
let mounted = true;
let ui: MountHandle | undefined;
let openingTimer: ReturnType<typeof setTimeout> | undefined;
let revealTimer: ReturnType<typeof setTimeout> | undefined;
const app = createAppClient({ appId: APP_ID, targetOrigin: '*' });

function sessionIdFrom(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('sessionId' in value)) return undefined;
  const sessionId = (value as { sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string' ? sessionId.slice(0, 128) : undefined;
}

function claimRewards(): void {
  if (!result || sent || phase !== 'revealed') return;
  sent = true;
  if (dokiSession) {
    void app.complete(toChestOutput(result)).catch((error) => {
      sent = false;
      console.error('[game-loot-chest] DokiWorld completion failed', error);
      render();
    });
  }
}

const actions: ActionSink = {
  enqueueAction(name): void {
    if (name === CHEST_CLAIM_ACTION) claimRewards();
  },
};

function render(): void {
  const tree = buildChestScreen(
    current,
    phase,
    result,
    presentation(current),
    sent ? (dokiSession ? 'sent-host' : 'sent-preview') : 'idle',
  );
  if (ui) ui.update(tree, CHEST_THEME);
  else ui = mountUI(root, tree, {}, CHEST_THEME, actions);
}

function load(input: ChestInput): void {
  current = input;
  phase = 'closed';
  result = undefined;
  sent = false;
  failedSessionId = undefined;
  render();
  if (openingTimer) clearTimeout(openingTimer);
  if (revealTimer) clearTimeout(revealTimer);
  // 此计时器只控制视觉节拍；奖励始终由宿主给定的 seed/掉落树决定，不由墙钟参与结算。
  openingTimer = setTimeout(() => {
    openingTimer = undefined;
    if (!mounted) return;
    phase = 'opening';
    render();
  }, CLOSED_BEAT_MS);
  revealTimer = setTimeout(() => {
    revealTimer = undefined;
    if (!mounted) return;
    result = resolveChest(current);
    phase = 'revealed';
    render();
  }, CLOSED_BEAT_MS + OPENING_DURATION_MS);
}

function inputFromContract(input: AppContract<unknown>): ChestInput {
  if (input.contract !== INPUT_CONTRACT || input.version !== INPUT_VERSION) {
    throw new Error(`Unsupported chest input contract: ${input.contract}/${input.version}`);
  }
  return parseChestInput(input.data);
}

function emptyPreviewInput(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

function renderFailure(error: unknown, sessionId?: string): void {
  const message = error instanceof Error ? error.message : 'Invalid chest input.';
  if (sessionId) failedSessionId = sessionId;
  const tree = buildChestErrorScreen(message, failedSessionId);
  if (ui) ui.update(tree, CHEST_THEME);
  else ui = mountUI(root, tree, {}, CHEST_THEME);
}

const disconnect = app.connect();
void app.whenReady({ timeoutMs: 10_000 }).then((input) => {
  if (!mounted) return;
  try {
    load(inputFromContract(input));
    dokiSession = true;
  } catch (error) {
    dokiSession = false;
    const sessionId = sessionIdFrom(input.data);
    if (emptyPreviewInput(input.data)) load(demo);
    else {
      renderFailure(error, sessionId);
      app.requestExit();
    }
    console.error('[game-loot-chest] Invalid DokiWorld launch input', error);
  }
}).catch((error) => {
  if (mounted) console.error('[game-loot-chest] DokiWorld initialization failed', error);
});

if (standalonePreview) load(demo);

window.addEventListener('pagehide', () => {
  mounted = false;
  if (openingTimer) clearTimeout(openingTimer);
  if (revealTimer) clearTimeout(revealTimer);
  disconnect();
  app.dispose();
  ui?.();
}, { once: true });
