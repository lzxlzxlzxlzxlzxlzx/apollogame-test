import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { createArtAssets, loadGameArtInto, loadGameArtOverrides } from '@zerocraft/engine/assets/index.js';
import { mountHost, resolveSceneBg } from '@zerocraft/engine/engine/host/mount-host.js';
import { RHETORIC_FIXTURES, validateRhetoricGameConfig } from './config.js';
import { RhetoricDuelSession } from './session.js';
import { RhetoricPresentationController, type RhetoricGameResult } from './presentation-controller.js';
import { buildRhetoricDuelUI, selectLoadedRhetoricSkins } from './ui.js';
import { RHETORIC_THEME } from './theme.js';
import { mountRhetoricPlayField, RHETORIC_FIELD_H, RHETORIC_FIELD_W } from './play-field.js';
import type { RhetoricSkinMap } from './ui.js';
import { RHETORIC_PHASE_DURATION_MS, RHETORIC_PRESENTATION_TIMING_MS, rhetoricDurationFor } from './card-presentation.js';

type RhetoricHost = Readonly<{ exit: () => void; result?: (result: RhetoricGameResult) => void }>;
export { RHETORIC_PHASE_DURATION_MS, rhetoricDurationFor };
const FALLBACK_SCENE = 'radial-gradient(circle at 58% 42%,rgba(92,65,38,.18),transparent 28%),linear-gradient(90deg,rgba(3,5,8,.95),rgba(3,5,8,.38) 52%,rgba(3,5,8,.84)),repeating-linear-gradient(135deg,#111115 0,#111115 9px,#0b0d12 9px,#0b0d12 18px)';

function previewConfig(): ReturnType<typeof validateRhetoricGameConfig> {
  const fixture = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('fixture');
  const selected = fixture === 'luo-zhanggui' ? RHETORIC_FIXTURES[1]
    : fixture === 'jiang-jiaoxi' ? RHETORIC_FIXTURES[2]
      : RHETORIC_FIXTURES[0];
  return validateRhetoricGameConfig(selected);
}

/** Internal launcher entry. LayoutNode emits named actions; the controller is the sole command adapter. */
export function mount(container: HTMLElement, host?: RhetoricHost): () => void {
  const config = previewConfig();
  const reducedMotion = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('reducedMotion') === '1'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
  const manualPresentation = import.meta.env.DEV && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('manualPresentation') === '1';
  const debug = import.meta.env.DEV && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('debug') === '1';
  let lastResult: RhetoricGameResult | undefined;
  const controller = new RhetoricPresentationController(new RhetoricDuelSession(config), {
    reducedMotion,
    onResult: (result) => { lastResult = result; host?.result?.(result); },
    onExit: () => host?.exit(),
  });
  const artAssets = createArtAssets();
  let skins: RhetoricSkinMap = {};
  let skinRevision = 0;
  const shell = mountHost(container, {
    fieldW: RHETORIC_FIELD_W,
    fieldH: RHETORIC_FIELD_H,
    wrapperBackground: '#030507',
    sceneBackground: FALLBACK_SCENE,
    sceneBgSkin: { skinKey: config.encounter.backgroundSkinKey, fit: 'cover' },
  });
  shell.overlayHost.style.pointerEvents = 'auto';
  const playField = mountRhetoricPlayField(shell.scene, config, artAssets);
  const ui = mountUI(shell.overlayHost, buildRhetoricDuelUI(controller.view, config, skins, debug), {}, RHETORIC_THEME, controller);
  let active = true;
  let raf = 0;
  let timedPhase = controller.view.phase;
  let phaseStartedAt: number | undefined;
  let signature = '';

  const render = (): void => {
    const next = `${skinRevision}|${JSON.stringify(controller.view)}`;
    if (next === signature) return;
    signature = next;
    playField.update(controller.view);
    ui.update(buildRhetoricDuelUI(controller.view, config, skins, debug), RHETORIC_THEME);
  };
  void Promise.all([
    loadGameArtInto(artAssets, 'game-rhetoric-duel'),
    loadGameArtOverrides('game-rhetoric-duel'),
  ]).then(([, nextSkins]) => {
    if (!active) return;
    skins = selectLoadedRhetoricSkins(nextSkins, (key) => artAssets.isLoaded(key));
    skinRevision += 1;
    shell.scene.style.background = resolveSceneBg(FALLBACK_SCENE, {
      skinKey: config.encounter.backgroundSkinKey,
      imageUrl: skins[config.encounter.backgroundSkinKey],
      fit: 'cover',
    }) ?? FALLBACK_SCENE;
    render();
  });
  const frame = (now: number): void => {
    if (!active) return;
    const phase = controller.view.phase;
    if (phase !== timedPhase) { timedPhase = phase; phaseStartedAt = now; }
    if (phaseStartedAt === undefined) phaseStartedAt = now;
    if (!manualPresentation && controller.busy && now - phaseStartedAt >= rhetoricDurationFor(phase, reducedMotion)) {
      controller.advance();
      timedPhase = controller.view.phase;
      phaseStartedAt = now;
    }
    render();
    raf = requestAnimationFrame(frame);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key >= '1' && event.key <= '6') controller.playVisibleCard(Number(event.key) - 1);
    else if (event.key === ' ') controller.enqueueAction('rhetoric.skip-presentation');
    render();
  };
  const onBlur = (): void => { controller.recoverAfterBlur(); timedPhase = controller.view.phase; phaseStartedAt = undefined; render(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', onBlur);
  if (import.meta.env.DEV) {
    (window as unknown as { __rhetoricDuel?: unknown }).__rhetoricDuel = {
      snapshot: () => controller.session.snapshot(),
      view: () => controller.view,
      advance: () => { controller.advance(); render(); },
      skip: () => { controller.skip(); render(); },
      action: (name: string, arg?: string) => { controller.enqueueAction(name, arg ? { arg } : undefined); render(); },
      result: () => lastResult,
      timing: () => RHETORIC_PRESENTATION_TIMING_MS,
    };
  }
  render();
  raf = requestAnimationFrame(frame);
  return () => {
    active = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', onBlur);
    delete (window as unknown as { __rhetoricDuel?: unknown }).__rhetoricDuel;
    ui();
    playField.destroy();
    shell.teardown();
  };
}
