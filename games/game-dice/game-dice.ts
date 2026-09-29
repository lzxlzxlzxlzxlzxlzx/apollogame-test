/** 《轻掷》DokiWorld App 入口：SDK 处理跨窗口会话；物理骰面由调用方的判定表解释。 */
import { createAppClient, type AppContract } from 'dokiworlds-app-sdk';
import { DICE_BRIDGE_RESULT, DICE_BRIDGE_ROLL, normalizeDiceInput, type DiceRollInput } from '@engine/host/dice-overlay.js';
import { mountThreeDiceOverlay, type PhysicalDiceResult } from '@engine/host/three-dice-overlay.js';
import type { ExternalGameOutput } from '@engine/host/external-game-session.js';
import { mountUI, type ActionSink } from '@zerocraft/engine/ui/components/index.js';
import { buildDiceWindow, DICE_WINDOW_THEME } from './dice-window.js';
import { applyDiceDebugAction, diceDebugEnabled, dicePreviewInput, syncDiceDebugUrl } from './dice-debug.js';

export const DOKIWORLD_DICE_APP_ID = 'game-physics-dice';
export const DOKIWORLD_DICE_INPUT_CONTRACT = 'doki.game.dice-input';
export const DOKIWORLD_DICE_INPUT_VERSION = 1 as const;
/** 物理层判定文字渐入后，至少保留此时长再让宿主关闭 iframe。 */
export const DICE_VERDICT_VISIBLE_MS = 1_200;

type DiceAppInput = DiceRollInput;
type GameResultOutcome = 'win' | 'loss' | 'draw' | 'completed' | 'exited';
type GameResultData = Readonly<{
  normalizedScore: number;
  outcome: GameResultOutcome;
  metrics: Readonly<Record<string, string | number | boolean>>;
}>;

function requestFromInput(input: AppContract<unknown>, fallbackId: string): { requestId: string; input: DiceRollInput } {
  if (input.contract !== DOKIWORLD_DICE_INPUT_CONTRACT || input.version !== DOKIWORLD_DICE_INPUT_VERSION) {
    throw new Error(`Unsupported dice input contract: ${input.contract}/${input.version}`);
  }
  const normalized = normalizeDiceInput(input.data);
  if (!normalized) throw new Error('Invalid dice input. Supply one to three d4, d6, d8, or d20 dice.');
  return { requestId: fallbackId, input: normalized };
}

const emptyInputData = (value: unknown): boolean => typeof value === 'object'
  && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;

export function outputFromPhysicalResult(result: PhysicalDiceResult, input: DiceRollInput): AppContract<GameResultData> {
  const maximum = input.dice.reduce((sum, die) => sum + die.sides, 0);
  const finalTotal = result.finalTotal ?? result.total;
  return Object.freeze({
    contract: 'doki.game.result',
    version: 1,
    data: Object.freeze({
      normalizedScore: Math.max(0, Math.min(100, Math.round(finalTotal / maximum * 100))),
      outcome: result.passed === true ? 'win' : result.passed === false ? 'loss' : 'completed',
      metrics: Object.freeze({
        total: result.total,
        diceCount: result.dice.length,
        roll: result.dice.map((die) => `d${die.sides}:${die.value}`).join(','),
        randomSource: result.randomSource,
        physics: true,
        ...(result.modifier === undefined ? {} : { modifier: result.modifier }),
        ...(result.finalTotal === undefined ? {} : { finalTotal: result.finalTotal }),
        ...(result.difficulty === undefined ? {} : { difficulty: result.difficulty }),
        ...(result.passed === undefined ? {} : { passed: result.passed }),
        ...(result.outcome === undefined ? {} : { diceOutcome: result.outcome }),
      }),
    }),
  });
}

/**
 * 对外遵循 dokiworld.app/2；Apollo 的事件仅留在卡带内部，隔离渲染层与 DokiWorld 协议。
 * 独立运行时读取 URL 预览参数；收到 SDK 初始化后改用宿主指定的骰局。
 */
export function mount(container: HTMLElement): () => void {
  const debug = import.meta.env.DEV && diceDebugEnabled(window.location.search);
  let activeInput = dicePreviewInput(window.location.search);
  let ui: ReturnType<typeof mountUI> | undefined;
  let unmountDice: () => void = () => {};
  let previewSequence = 0;
  let dokiSession = false;
  let completing = false;
  let completionTimer: number | undefined;
  let mounted = true;

  const resetWindow = (input: DiceRollInput, requestId: string): void => {
    // 参数切换发生在新会话开始前；重挂 Three 画布可同时刷新透明画框与骰池。
    unmountDice();
    ui?.();
    ui = mountUI(container, buildDiceWindow(input, { debug }), {}, DICE_WINDOW_THEME, debugSink);
    const stage = container.querySelector<HTMLElement>('#dice-3d-stage');
    if (!stage) throw new Error('Dice window stage is missing after update.');
    unmountDice = mountThreeDiceOverlay(stage);
    window.postMessage({ type: DICE_BRIDGE_ROLL, request: { version: 1, requestId, input } }, window.location.origin);
  };

  const debugSink: ActionSink = {
    enqueueAction(name, value): void {
      if (!debug || !name.startsWith('dice.debug.')) return;
      const next = applyDiceDebugAction(activeInput, name, value?.arg);
      if (next === activeInput) return;
      activeInput = next;
      dokiSession = false;
      syncDiceDebugUrl(next);
      resetWindow(next, `preview-dice-${++previewSequence}`);
    },
  };

  resetWindow(activeInput, `preview-dice-${++previewSequence}`);
  // Published DokiWorld hosts may embed this package from a different origin.
  // The SDK still pins source=parent, protocol, appId, instanceId and runId.
  const app = createAppClient({ appId: DOKIWORLD_DICE_APP_ID, targetOrigin: '*' });

  const resultListener = (event: Event): void => {
    const output = (event as CustomEvent<ExternalGameOutput<PhysicalDiceResult>>).detail;
    if (!dokiSession || completing || output?.status !== 'settled') return;
    completing = true;
    // three-dice-overlay 先展示「成功/失败」再派发 settled；若立刻 complete，宿主会在文字刚渐入时卸载 iframe。
    completionTimer = window.setTimeout(() => {
      completionTimer = undefined;
      void app.complete(outputFromPhysicalResult(output.result, activeInput))
        .catch((error) => console.error('[game-physics-dice] DokiWorld completion failed', error))
        .finally(() => { completing = false; });
    }, DICE_VERDICT_VISIBLE_MS);
  };
  window.addEventListener(DICE_BRIDGE_RESULT, resultListener);

  const disconnect = app.connect();
  void app.whenReady({ timeoutMs: 10_000 }).then((input) => {
    if (!mounted) return;
    try {
      const request = requestFromInput(input, `dokiworld-${app.runId ?? crypto.randomUUID()}`);
      activeInput = request.input;
      dokiSession = true;
      completing = false;
      // 向同窗口的物理覆盖层送入经过 SDK 校验的骰池与展示数据；不暴露 Apollo 协议给外部宿主。
      resetWindow(request.input, request.requestId);
    } catch (error) {
      // APPS 面板直接启动只有空 data：保留明确的本地预览，不把它伪装成已消费宿主骰局。
      dokiSession = false;
      if (!emptyInputData(input.data)) app.requestExit();
      console.error('[game-physics-dice] Invalid DokiWorld launch input; preview remains active', error);
    }
  }).catch((error) => {
    if (mounted) console.error('[game-physics-dice] DokiWorld initialization failed; preview remains active', error);
  });

  return () => {
    mounted = false;
    disconnect();
    window.removeEventListener(DICE_BRIDGE_RESULT, resultListener);
    if (completionTimer !== undefined) window.clearTimeout(completionTimer);
    app.dispose();
    unmountDice();
    ui?.();
  };
}
