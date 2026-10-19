import { createAppClient } from 'dokiworlds-app-sdk';
import { mount } from '../../../games/game-potion-brewing/game-potion-brewing.js';
import { MOON_ROUND } from '../../../games/game-potion-brewing/fixtures.js';
import { ImageAssetLoader } from '@zerocraft/engine/assets/image-loader.js';
import type { PotionRound } from '../../../games/game-potion-brewing/recipe.js';
import { isPreviewInput, parsePotionInput, potionOutput } from './contract.js';

const stage = document.querySelector<HTMLElement>('#app');
if (!stage) throw new Error('#app not found');
const app = createAppClient({ appId: 'game-potion-brewing', targetOrigin: '*' });
let dispose: (() => void) | undefined;
let terminal = false;
let delivering = false;
let closed = false;
const disconnect = app.connect();

async function withImageFallback(round: PotionRound): Promise<PotionRound> {
  const src = round.recipe.resultImageUrl;
  if (!src) return round;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new ImageAssetLoader().load({ kind: 'texture', key: 'potion/host-result-preview', src }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('图片加载超时')), 5000); }),
    ]);
    return round;
  } catch {
    console.warn('[game-potion-brewing] 宿主结果图片不可用，使用包内回退');
    const { resultImageUrl: _unused, ...recipe } = round.recipe;
    return { ...round, recipe };
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

void app.whenReady({ timeoutMs: 10_000 }).then(async (input) => {
  if (closed) return;
  if (isPreviewInput(input.data)) {
    stage.dataset.preview = 'true';
    dispose = mount(stage, { round: MOON_ROUND, exit: () => app.requestExit() });
    return;
  }
  const round = await withImageFallback(parsePotionInput(input));
  // 图片预载是异步的；页面若在等待期间已卸载，不得事后重新挂载游戏。
  if (closed) return;
  let frozen: ReturnType<typeof potionOutput> | undefined;
  const deliver = async (): Promise<void> => {
    if (!frozen || delivering) return;
    delivering = true;
    try {
      const result = await app.complete(frozen);
      if (result === 'rejected') console.error('[game-potion-brewing] 宿主拒收同一终局结果；玩法仍锁定');
    } catch (error) {
      console.error('[game-potion-brewing] 宿主交付未确认；玩法仍锁定', error);
    } finally { delivering = false; }
  };
  dispose = mount(stage, { round, exit: () => { if (!terminal) app.requestExit(); }, complete: (outcome) => {
    if (terminal) return;
    terminal = true;
    frozen = potionOutput(round, outcome);
    void deliver();
  } });
}).catch((error) => {
  if (closed) return;
  console.error('[game-potion-brewing] 初始化失败', error);
  stage.textContent = error instanceof Error ? `启动失败：${error.message}` : '启动失败：输入无效';
  app.requestExit();
});

window.addEventListener('pagehide', () => { closed = true; dispose?.(); disconnect(); app.dispose(); }, { once: true });
