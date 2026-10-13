import { createAppClient, type AppContract } from 'dokiworlds-app-sdk';
import { mount } from '../../../games/game-theft/game-theft.js';
import { DEFAULT_THEFT_CONFIG, resolveTheftDifficulty, type TheftGameConfig, type TheftItemSpec } from '../../../games/game-theft/config.js';
import type { RiskRevealReceipt } from '@zerocraft/engine/engine/protocol/components.js';

const APP_ID = 'game-theft';
const stage = document.querySelector<HTMLElement>('#app');
if (!stage) throw new Error('#app not found');
const app = createAppClient({ appId: APP_ID, targetOrigin: '*' });
let dispose: (() => void) | undefined;
let hostSession = false;

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new Error(`${name} 非法`);
  return value;
}
function secureSeed(): number { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0]!; }
function isEmptyPreviewInput(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}
function configFrom(input: AppContract<unknown>): { requestId: string; config: TheftGameConfig } {
  if (input.contract !== 'doki.game.theft-input' || input.version !== 3 || !input.data || typeof input.data !== 'object') throw new Error('不支持的潜取输入合同');
  const data = input.data as Record<string, unknown>;
  const requestId = text(data.requestId, 'requestId');
  if (!Number.isSafeInteger(data.difficulty)) throw new Error('difficulty 必须是安全整数');
  if (!data.target || typeof data.target !== 'object') throw new Error('target 非法');
  const target = data.target as Record<string, unknown>;
  if (!Array.isArray(data.items) || data.items.length < 1) throw new Error('items 不能为空');
  const items: TheftItemSpec[] = data.items.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`items[${index}] 非法`);
    const item = raw as Record<string, unknown>;
    return { entryId: text(item.entryId, `items[${index}].entryId`), itemId: text(item.itemId, `items[${index}].itemId`), displayName: text(item.displayName, `items[${index}].displayName`), quantity: typeof item.quantity === 'number' && Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : (() => { throw new Error(`items[${index}].quantity 非法`); })(), ...(typeof item.image === 'string' && item.image.startsWith('https://') ? { imageUrl: item.image } : {}) };
  });
  return { requestId, config: { sessionId: requestId, title: typeof (data.presentation as Record<string, unknown> | undefined)?.title === 'string' ? (data.presentation as Record<string, unknown>).title as string : '潜取', targetName: text(target.displayName, 'target.displayName'), seed: secureSeed(), difficulty: resolveTheftDifficulty(data.difficulty as number), items } };
}
function output(requestId: string, seed: number, receipt: RiskRevealReceipt) {
  return { contract: 'doki.game.theft-receipt', version: 3, data: { requestId, outcome: receipt.status, elapsedTicks: receipt.elapsedTicks, exposureBp: receipt.riskBp, acquiredEntryIds: receipt.acquiredIds, revealedSlots: receipt.revealedSlots, qteAttempts: receipt.qteAttempts, perfectQtes: receipt.perfectQtes, randomSeed: seed } };
}
const disconnect = app.connect();
void app.whenReady({ timeoutMs: 10_000 }).then((input) => {
  if (isEmptyPreviewInput(input.data)) {
    dispose = mount(stage, { config: DEFAULT_THEFT_CONFIG });
    return;
  }
  const { requestId, config } = configFrom(input);
  hostSession = true;
  dispose = mount(stage, { config, onComplete: (receipt) => {
    if (hostSession) void app.complete(output(requestId, config.seed, receipt));
  } });
}).catch((error) => {
  console.error('[game-theft] initialization failed', error);
  stage.textContent = error instanceof Error ? `启动失败：${error.message}` : '启动失败：输入无效';
  app.requestExit();
});
window.addEventListener('pagehide', () => { dispose?.(); disconnect(); app.dispose(); }, { once: true });
