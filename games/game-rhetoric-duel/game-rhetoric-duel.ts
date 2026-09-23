import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { RHETORIC_FIXTURES, validateRhetoricGameConfig } from './config.js';
import { RhetoricDuelSession } from './session.js';
import { RhetoricPresentationController, type RhetoricGameResult } from './presentation-controller.js';
import { buildRhetoricDuelUI } from './ui.js';
import { RHETORIC_THEME } from './theme.js';
import { mountRhetoricPlayField, RHETORIC_FIELD_H, RHETORIC_FIELD_W } from './play-field.js';

type RhetoricHost = Readonly<{ exit: () => void; result?: (result: RhetoricGameResult) => void }>;
const PHASE_FRAMES: Readonly<Record<string, number>> = {
  camera: 42, 'reveal-intent': 20, 'deal-opening-hand': 42,
  'card-lift': 8, 'card-flight': 11, impact: 23, 'opponent-response': 22,
  'round-end': 23, 'enemy-intent': 30, 'enemy-impact': 20, 'focus-refresh': 20, 'deal-new-cards': 42,
  'victory-impact': 23, 'portrait-resolve': 22, 'failure-impact': 23, 'portrait-dominates': 22,
};
const framesFor = (phase: string, reducedMotion: boolean): number => reducedMotion ? 1 : PHASE_FRAMES[phase] ?? 1;

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
  let lastResult: RhetoricGameResult | undefined;
  const controller = new RhetoricPresentationController(new RhetoricDuelSession(config), {
    reducedMotion,
    onResult: (result) => { lastResult = result; host?.result?.(result); },
    onExit: () => host?.exit(),
  });
  const shell = mountHost(container, {
    fieldW: RHETORIC_FIELD_W,
    fieldH: RHETORIC_FIELD_H,
    wrapperBackground: '#030507',
    sceneBackground: 'radial-gradient(circle at 61% 43%,rgba(111,72,34,.34),transparent 31%),linear-gradient(90deg,rgba(3,5,8,.94),rgba(3,5,8,.48) 52%,rgba(3,5,8,.82)),repeating-linear-gradient(135deg,#111115 0,#111115 9px,#0b0d12 9px,#0b0d12 18px)',
    sceneBgSkin: { skinKey: config.encounter.backgroundSkinKey, fit: 'cover' },
  });
  shell.overlayHost.style.pointerEvents = 'auto';
  const playField = mountRhetoricPlayField(shell.scene, config);
  const ui = mountUI(shell.overlayHost, buildRhetoricDuelUI(controller.view, config, true), {}, RHETORIC_THEME, controller);
  let active = true;
  let raf = 0;
  let frames = 0;
  let signature = '';

  const render = (): void => {
    const next = JSON.stringify(controller.view);
    if (next === signature) return;
    signature = next;
    playField.update(controller.view);
    ui.update(buildRhetoricDuelUI(controller.view, config, true), RHETORIC_THEME);
  };
  const frame = (): void => {
    if (!active) return;
    if (!manualPresentation && controller.busy && ++frames >= framesFor(controller.view.phase, reducedMotion)) {
      frames = 0;
      controller.advance();
    }
    render();
    raf = requestAnimationFrame(frame);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key >= '1' && event.key <= '6') controller.playVisibleCard(Number(event.key) - 1);
    else if (event.key === ' ') controller.enqueueAction('rhetoric.skip-presentation');
    render();
  };
  const onBlur = (): void => { controller.recoverAfterBlur(); frames = 0; render(); };
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
