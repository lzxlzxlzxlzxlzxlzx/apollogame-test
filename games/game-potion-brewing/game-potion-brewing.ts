import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/canvas-renderer.js';
import { PointerInputSource } from '@zerocraft/engine/net/host/queued-input.js';
import { KeyboardInputSource } from '@zerocraft/engine/net/host/local-input.js';
import { DragPreviewLayer } from '@zerocraft/engine/runtime/drag-preview.js';
import { createArtAssets, loadGameArtInto } from '@zerocraft/engine/assets/game-art-load.js';
import { findDraggableAt, findDropZoneAt } from '@zerocraft/engine/skills/tier2/drop-zone-hit.js';
import type { OrderedActionSession, RawInputData, Signal } from '@zerocraft/engine/engine/protocol/components.js';
import type { InputSource } from '@zerocraft/engine/net/commands.js';
import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { buildPotionBlueprint } from './blueprint.js';
import { MOON_ROUND } from './fixtures.js';
import { addSignal, type PotionRound } from './recipe.js';
import { localResultBottleKey, POTION_ART } from './art.js';
import { createPotionAudio, cueForPotionTransition } from './potion-sfx.js';
import {
  POTION_RECIPE_HOST, POTION_RACK_HOST, POTION_SCENE_HOST, POTION_THEME, POTION_LIQUID_HOST, POTION_STATUS_HOST, POTION_EXIT_HOST, POTION_TITLE_HOST,
  buildPotionShell, buildRackScreen, buildRecipeScreen, buildLiquidScreen, buildStatusScreen, buildResultScreen, buildExitScreen, buildTitleScreen, liquidColor, type PotionViewState,
} from './screen.js';

export interface PotionMountOptions {
  readonly round?: PotionRound;
  readonly exit?: () => void;
  /** 宿主薄接线：世界终局只投影一次；调用方负责 versioned output 与 SDK complete。 */
  readonly complete?: (outcome: 'success' | 'failure') => void | Promise<void>;
}

/** S4 可玩入口。DokiWorld 严格输入/输出接线在 S7，缺省只作本地 fixture 预览。 */
export function mount(container: HTMLElement, options: PotionMountOptions = {}): () => void {
  const round = options.round ?? MOON_ROUND;
  // S1-P-06 是定尺 1440×900 舞台；共享宿主负责信箱居中和等比缩放。
  const frame = mountHost(container, { fieldW: 1440, fieldH: 900, topBarH: 900 });
  const shell = mountUI(frame.topHost, buildPotionShell(), {}, POTION_THEME);
  const scene = frame.topHost.querySelector<HTMLElement>(`[id="${POTION_SCENE_HOST}"]`);
  const recipeHost = frame.topHost.querySelector<HTMLElement>(`[id="${POTION_RECIPE_HOST}"]`);
  const rackHost = frame.topHost.querySelector<HTMLElement>(`[id="${POTION_RACK_HOST}"]`);
  const liquidHost = frame.topHost.querySelector<HTMLElement>(`[id="${POTION_LIQUID_HOST}"]`);
  const statusHost = frame.topHost.querySelector<HTMLElement>(`[id="${POTION_STATUS_HOST}"]`);
  const exitHost = frame.topHost.querySelector<HTMLElement>(`[id="${POTION_EXIT_HOST}"]`);
  const titleHost = frame.topHost.querySelector<HTMLElement>(`[id="${POTION_TITLE_HOST}"]`);
  if (!scene || !recipeHost || !rackHost || !liquidHost || !statusHost || !exitHost || !titleHost) {
    shell();
    frame.teardown();
    throw new Error('[game-potion-brewing] LayoutNode 宿主未生成，不能静默挂载');
  }

  let view: PotionViewState = { status: 'active', stepIndex: 0, confirmedCount: 0 };
  const audio = createPotionAudio();
  const artAssets = createArtAssets();
  let bottleSrc: string | undefined = round.recipe.resultImageUrl;
  let disposed = false;
  let resultTimer: ReturnType<typeof setTimeout> | undefined;
  let resultVisible = false;
  let completionSent = false;
  let liquidCue: 'add' | 'stir' | 'failure' | undefined;
  let liquidCuePhase: 'attack' | 'decay' = 'decay';
  let liquidCuePhaseTimer: ReturnType<typeof setTimeout> | undefined;
  let liquidCueTimer: ReturnType<typeof setTimeout> | undefined;
  let liquidTransitionFrom: string | undefined;
  let liquidTransitionTimer: ReturnType<typeof setTimeout> | undefined;
  let liquidCueKey = 0;
  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const recipeUi = mountUI(recipeHost, buildRecipeScreen(round.recipe, view), {}, POTION_THEME);
  const titleUi = mountUI(titleHost, buildTitleScreen(round.recipe, view), {}, POTION_THEME);
  const liquidTree = () => buildLiquidScreen(round.recipe, view, reducedMotionQuery?.matches ?? false, liquidCue, liquidTransitionFrom, liquidCueKey, liquidCuePhase);
  const liquidUi = mountUI(liquidHost, liquidTree(), {}, POTION_THEME);
  const refreshLiquid = (): void => liquidUi.update(liquidTree(), POTION_THEME);
  const onMotionChange = (): void => refreshLiquid();
  reducedMotionQuery?.addEventListener?.('change', onMotionChange);
  let selectedId: string | undefined;
  let hoveredId: string | undefined;
  let pointer: PointerInputSource | undefined;
  let keyboard: KeyboardInputSource | undefined;
  let exitOpen = false;
  const statusUi = mountUI(statusHost, buildStatusScreen(round.recipe, view), {}, POTION_THEME, {
    enqueueAction(action): void { pointer?.enqueueAction(action); },
  });
  const input: InputSource = { commandsForTick: (tick) => {
    const commands = [...(pointer?.commandsForTick(tick) ?? []), ...(keyboard?.commandsForTick(tick) ?? [])];
    return exitOpen ? [] : commands;
  } };
  const engine = new Engine({ input });
  engine.load(buildPotionBlueprint(round));
  const preview = new DragPreviewLayer({ entityIds: round.recipe.ingredients.map((item) => `ingredient:${item.ingredientId}`) });
  const renderer = new CanvasRenderer({ width: 1440, height: 900, background: 'transparent', dragPreview: preview, assets: artAssets });
  engine.attachRenderer(renderer, scene);
  const canvas = scene.querySelector<HTMLCanvasElement>('canvas');
  if (!canvas) {
    statusUi(); liquidUi(); titleUi(); recipeUi(); renderer.destroy(); shell(); frame.teardown();
    throw new Error('[game-potion-brewing] CanvasRenderer 未提供画布');
  }
  let potClick = false;
  let lastExitVersion = -1;
  const updatePresentation = (): void => {
    const session = engine.world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession');
    const next: PotionViewState = {
      status: session?.status ?? 'active', stepIndex: session?.stepIndex ?? 0,
      confirmedCount: session?.confirmedCount ?? 0,
    };
    const exitSignal = engine.world.getComponent<Signal>('input:exit', 'Signal');
    if (exitSignal?.name === 'brew.ui.requestExit' && engine.world.getVersion() !== lastExitVersion) {
      lastExitVersion = engine.world.getVersion();
      if (next.status === 'active') {
        exitOpen = true;
        exitUi.update(buildExitScreen(true), POTION_THEME);
      }
    }
    if (next.status === view.status && next.stepIndex === view.stepIndex && next.confirmedCount === view.confirmedCount) return;
    const beforeColor = liquidColor(round.recipe, view);
    const afterColor = liquidColor(round.recipe, next);
    if (beforeColor !== afterColor && !(reducedMotionQuery?.matches ?? false)) {
      liquidTransitionFrom = beforeColor;
      if (liquidTransitionTimer !== undefined) clearTimeout(liquidTransitionTimer);
      liquidTransitionTimer = setTimeout(() => {
        liquidTransitionTimer = undefined;
        if (disposed) return;
        liquidTransitionFrom = undefined;
        refreshLiquid();
      }, 900);
    }
    const cue = cueForPotionTransition(view, next, round.recipe.steps);
    if (cue) audio.play(cue);
    const visualCue = cue === 'success' ? round.recipe.steps[view.stepIndex]?.kind ?? 'stir' : cue;
    if (visualCue === 'add' || visualCue === 'stir' || visualCue === 'failure') {
      liquidCue = visualCue;
      liquidCueKey++;
      liquidCuePhase = 'attack';
      if (liquidCuePhaseTimer !== undefined) clearTimeout(liquidCuePhaseTimer);
      liquidCuePhaseTimer = setTimeout(() => {
        liquidCuePhaseTimer = undefined;
        if (disposed) return;
        liquidCuePhase = 'decay';
        refreshLiquid();
      }, 180);
      if (liquidCueTimer !== undefined) clearTimeout(liquidCueTimer);
      liquidCueTimer = setTimeout(() => {
        liquidCueTimer = undefined;
        if (disposed) return;
        liquidCue = undefined;
        refreshLiquid();
      }, 950);
    }
    if (next.stepIndex !== view.stepIndex && selectedId) {
      selectedId = undefined;
      rackUi.update(buildRackScreen(round.recipe, undefined, hoveredId), POTION_THEME);
    }
    view = next;
    rackUi.update(buildRackScreen(round.recipe, selectedId, hoveredId), POTION_THEME);
    recipeUi.update(buildRecipeScreen(round.recipe, view), POTION_THEME);
    titleUi.update(buildTitleScreen(round.recipe, view), POTION_THEME);
    refreshLiquid();
    statusUi.update(buildStatusScreen(round.recipe, view, selectedId), POTION_THEME);
    if (next.status !== 'active' && !resultVisible && resultTimer === undefined) {
      // 世界终局即时权威；弹窗只延后表现，保留原型的紫汤/成功药液可见停留帧。
      resultTimer = setTimeout(() => {
        resultTimer = undefined;
        if (disposed) return;
        resultVisible = true;
        resultUi.update(buildResultScreen(round.recipe, view, bottleSrc), POTION_THEME);
        if (!completionSent && options.complete && (view.status === 'success' || view.status === 'failure')) {
          completionSent = true;
          void Promise.resolve().then(() => options.complete!(view.status as 'success' | 'failure')).catch((error) => {
            console.error('[game-potion-brewing] 终局交付失败；世界终局保持锁定', error);
          });
        }
      }, reducedMotionQuery?.matches ? 0 : next.status === 'failure' ? 880 : 1250);
    }
  };
  const selectMaterial = (id: string): void => {
    if (view.status !== 'active') return;
    selectedId = id;
    rackUi.update(buildRackScreen(round.recipe, selectedId, hoveredId), POTION_THEME);
    statusUi.update(buildStatusScreen(round.recipe, view, selectedId), POTION_THEME);
  };
  const onPointerSample = (action: RawInputData): void => {
    preview.sample(action, engine.world.readView(), performance.now());
    if (action.phase === 'down' && action.x !== undefined && action.y !== undefined) {
      const material = findDraggableAt(engine.world, action.x, action.y);
      if (material?.startsWith('ingredient:')) selectMaterial(material.slice('ingredient:'.length));
      potClick = !material && !!selectedId && findDropZoneAt(engine.world, action.x, action.y) === 'cauldron-mouth';
    } else if (action.phase === 'up') {
      if (potClick && selectedId && action.x !== undefined && action.y !== undefined
        && findDropZoneAt(engine.world, action.x, action.y) === 'cauldron-mouth') {
        pointer?.enqueueAction(addSignal(selectedId));
      }
      potClick = false;
    } else if (action.phase === 'drag' || action.phase === 'cancel' || action.phase === 'blur') potClick = false;
  };
  pointer = new PointerInputSource('player', canvas, { move: true, onPointerSample });
  // Canvas 在材料架之上接权威拖拽；悬停只读同一 Draggable 命中，不产生第二套玩法提交。
  const onRackHover = (event: PointerEvent): void => {
    if (view.status !== 'active') return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * 1440 / rect.width;
    const y = (event.clientY - rect.top) * 900 / rect.height;
    const hit = findDraggableAt(engine.world, x, y);
    const next = hit?.startsWith('ingredient:') ? hit.slice('ingredient:'.length) : undefined;
    if (next === hoveredId) return;
    hoveredId = next;
    rackUi.update(buildRackScreen(round.recipe, selectedId, hoveredId), POTION_THEME);
  };
  const clearRackHover = (): void => {
    if (hoveredId === undefined) return;
    hoveredId = undefined;
    rackUi.update(buildRackScreen(round.recipe, selectedId), POTION_THEME);
  };
  canvas.addEventListener('pointermove', onRackHover);
  canvas.addEventListener('pointerleave', clearRackHover);
  keyboard = new KeyboardInputSource('potion-keyboard', window, Object.fromEntries([
    ...round.recipe.ingredients.map((ingredient, index) => [`Digit${index + 1}`, { action: addSignal(ingredient.ingredientId) }] as const),
    ['Escape', { action: 'brew.ui.requestExit' }] as const,
  ]));
  const rackUi = mountUI(rackHost, buildRackScreen(round.recipe), {}, POTION_THEME);
  // 舞台级 overlay 自身覆盖完整 1440×900；Modal 不再受 1×1 占位宿主的定位上下文影响。
  const resultUi = mountUI(frame.overlayHost, buildResultScreen(round.recipe, view, bottleSrc), {}, POTION_THEME);
  const exitUi = mountUI(exitHost, buildExitScreen(false), {}, POTION_THEME, {
    enqueueAction(action): void {
      if (action === 'brew.ui.continue') {
        exitOpen = false;
        exitUi.update(buildExitScreen(false), POTION_THEME);
      } else if (action === 'brew.ui.cancel') {
        cleanupCurrent();
        options.exit?.();
      }
    },
  });
  const unsubscribe = engine.subscribe(updatePresentation);
  void loadGameArtInto(artAssets, 'game-potion-brewing', { onlyKeys: [POTION_ART.cauldron, POTION_ART.rod, POTION_ART.moonBottle, ...Object.values(POTION_ART.ingredients)] }).then((loaded) => {
    if (!loaded || disposed) return;
    const bottle = artAssets.get(localResultBottleKey(round.recipe.recipeId) ?? '')?.descriptor;
    // 本地月相瓶只适配月露样例；赤焰及其它宿主配方不可错配成青蓝药剂。
    if (bottle?.kind === 'texture' && !round.recipe.resultImageUrl) {
      bottleSrc = bottle.src;
      if (view.status === 'active' || resultVisible) resultUi.update(buildResultScreen(round.recipe, view, bottleSrc), POTION_THEME);
    }
  });
  engine.start();
  const cleanupCurrent = (): void => {
    if (disposed) return;
    disposed = true;
    if (resultTimer !== undefined) clearTimeout(resultTimer);
    if (liquidCueTimer !== undefined) clearTimeout(liquidCueTimer);
    if (liquidCuePhaseTimer !== undefined) clearTimeout(liquidCuePhaseTimer);
    if (liquidTransitionTimer !== undefined) clearTimeout(liquidTransitionTimer);
    unsubscribe();
    engine.stop();
    audio.stopAll();
    reducedMotionQuery?.removeEventListener?.('change', onMotionChange);
    pointer?.dispose();
    canvas.removeEventListener('pointermove', onRackHover);
    canvas.removeEventListener('pointerleave', clearRackHover);
    keyboard?.dispose();
    exitUi(); resultUi(); rackUi(); statusUi(); liquidUi(); titleUi(); recipeUi(); renderer.destroy(); shell(); frame.teardown();
  };
  return cleanupCurrent;
}
