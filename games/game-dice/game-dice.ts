/** 《轻掷》DokiWorld App 入口：SDK 处理跨窗口会话；物理骰子只负责表现与物理结算。 */
import { createAppClient, type ExternalAppInitPayload } from '@dokiworld/app-sdk';
import { createGameResult, type GameResultData } from '@dokiworld/app-sdk/game-result';
import { DICE_BRIDGE_RESULT, DICE_BRIDGE_ROLL, normalizeDiceInput, type DiceRollInput } from '@engine/host/dice-overlay.js';
import { mountThreeDiceOverlay, type PhysicalDiceResult } from '@engine/host/three-dice-overlay.js';
import type { ExternalGameOutput } from '@engine/host/external-game-session.js';

export const DOKIWORLD_DICE_APP_ID = 'game-physics-dice';
export const DOKIWORLD_DICE_INPUT_CONTRACT = 'doki.game.dice-input';
export const DOKIWORLD_DICE_INPUT_VERSION = 1 as const;

type DiceAppInput = Readonly<{ dice: readonly Readonly<{ sides: 4 | 6 | 8 | 20 }>[] }>;

function requestFromInit(payload: ExternalAppInitPayload<unknown>, fallbackId: string): { requestId: string; input: DiceRollInput } {
  if (payload.input.contract !== DOKIWORLD_DICE_INPUT_CONTRACT || payload.input.version !== DOKIWORLD_DICE_INPUT_VERSION) {
    throw new Error(`Unsupported dice input contract: ${payload.input.contract}/${payload.input.version}`);
  }
  const input = normalizeDiceInput(payload.input.data);
  if (!input) throw new Error('Invalid dice input. Supply one to three d4, d6, d8, or d20 dice.');
  return { requestId: fallbackId, input };
}

function outputFromPhysicalResult(result: PhysicalDiceResult, input: DiceRollInput) {
  const maximum = input.dice.reduce((sum, die) => sum + die.sides, 0);
  return createGameResult({
    normalizedScore: Math.round(result.total / maximum * 100),
    outcome: 'completed',
    metrics: {
      total: result.total,
      diceCount: result.dice.length,
      roll: result.dice.map((die) => `d${die.sides}:${die.value}`).join(','),
      randomSource: result.randomSource,
      physics: true,
    },
  });
}

/**
 * 对外遵循 dokiworld.app/2；Apollo 的事件仅留在卡带内部，隔离渲染层与 DokiWorld 协议。
 * 独立运行时仍显示默认 d6，收到 SDK 初始化后才开启宿主指定的骰局。
 */
export function mount(container: HTMLElement): () => void {
  const unmountDice = mountThreeDiceOverlay(container);
  const app = createAppClient<DiceAppInput, GameResultData>({ appId: DOKIWORLD_DICE_APP_ID });
  let activeInput: DiceRollInput | undefined;
  let completing = false;

  const resultListener = (event: Event): void => {
    const output = (event as CustomEvent<ExternalGameOutput<PhysicalDiceResult>>).detail;
    if (!activeInput || completing || output?.status !== 'settled') return;
    completing = true;
    void app.complete(outputFromPhysicalResult(output.result, activeInput)).finally(() => { completing = false; });
  };
  window.addEventListener(DICE_BRIDGE_RESULT, resultListener);

  const disconnect = app.connect({
    onInit: (payload) => {
      const request = requestFromInit(payload, `dokiworld-${app.runId ?? crypto.randomUUID()}`);
      activeInput = request.input;
      completing = false;
      // 向同窗口的物理覆盖层送入经过 SDK 校验的骰池；不暴露 Apollo 协议给外部宿主。
      window.postMessage({ type: DICE_BRIDGE_ROLL, request: { version: 1, requestId: request.requestId, input: request.input } }, window.location.origin);
    },
    onPrepareExit: () => ({ isDirty: false, canSuspend: false }),
    onError: (error) => console.error('[game-physics-dice] DokiWorld SDK error', error),
  });

  return () => {
    disconnect();
    window.removeEventListener(DICE_BRIDGE_RESULT, resultListener);
    app.dispose();
    unmountDice();
  };
}
