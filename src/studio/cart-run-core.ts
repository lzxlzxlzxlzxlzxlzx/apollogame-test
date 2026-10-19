import { Engine } from '../runtime/engine.js';
import { CanvasRenderer } from '@renderer/canvas-renderer.js';
import { pointerFeedbackToneColor } from '@renderer/pointer-feedback2d.js';
// 直指本体模块（不走 @net/index 桶·理由见 runtime/engine.ts 头注：桶会把 mp-world/playground 的原子能力拖进卡带外壳）。
import { MultiInputSource, type InputSource } from '@net/commands.js';
import { KeyboardInputSource, DEFAULT_KEYMAP, type KeyMap } from '@net/host/local-input.js';
import { PointerInputSource } from '@net/host/queued-input.js';
import { QueuedInputSource } from '@net/host/queued-input.js';
import { getCameraView, screenToWorld } from '@engine/protocol/camera-view.js';
import { clickableHalfExtents, clickableMaskPlan, collectClickableTargets, pickClickableTarget } from '@engine/protocol/clickable-hit-test.js';
import { mountHost } from '@engine/host/mount-host.js';
import { createWorldDataSource } from '@engine/host/ui-data-source.js';
import { mountUI } from '@ui/components/server.js';
import { resolveBindings } from '@ui/components/bindings.js';
import { apolloOnyx, apolloBrocade } from '@ui/components/apollo-kit.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { projectWorldUi2D } from '@renderer/world-ui2d.js';
import { CartPointerFeedback } from './cart-pointer-feedback.js';
import { focusLabelWorldPoint } from './cart-focus-placement.js';
import { cartMaskProbeTargets, type CartMaskProbeTarget } from './cart-click-probe-points.js';
import type { DebugTrace, TraceEvent } from '@engine/protocol/components.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import type { CartPresentation } from '../assembly/cart-presentation.js';
import type { IWorld } from '@engine/core/types.js';
import type { AssetManager } from '@assets/asset-manager.js';

// ═══════════════════════════════════════════════════════════════
//  数据卡带「纯运行核」——建引擎 + CanvasRenderer 跑一份 WorldBlueprint。
//  从 DataCartridgeRunner 的 RunOnly 抽出（无 React），供两处复用：
//    · 创作台 DataCartridgeRunner / ManifestPreview（在线：fetch manifest 后跑）
//    · cartridge-inline-run（离线单文件：从 window.__APOLLO_INLINE_CART__ 内联 manifest 跑）
//  两条路径共用同一确定性装载/输入/生命周期，杜绝「在线能跑、打包跑不了」的口径漂移。
// ═══════════════════════════════════════════════════════════════

export interface RunVp { w: number; h: number; }
export const RUN_VP: RunVp = { w: 960, h: 600 };

/** A one-launch render asset session. The runner only owns its lifecycle; it never sees URLs or mask rows. */
export interface CartHostVisualSession {
  bindWorld(world: object): () => void;
  dispose(): void;
}

/** Plain-value terminal projection for a host adapter. No World or component references escape this boundary. */
export interface CartTerminalSnapshot {
  readonly flows: readonly Readonly<{ id: string; current: string }> [];
  readonly resources: readonly Readonly<{ id: string; current: number; min: number; max: number }> [];
  readonly flags: readonly Readonly<{ id: string; active: boolean }> [];
}

export interface CartTerminalPort {
  readonly flowIds?: readonly string[];
  readonly resourceIds?: readonly string[];
  readonly flagIds?: readonly string[];
  onSnapshot(snapshot: CartTerminalSnapshot): void;
}

export interface CartRunOptions {
  /** Must already have loaded and validated its host PNGs before this runner is entered. */
  readonly hostVisualSession?: CartHostVisualSession;
  /** Explicit, value-only world projection for SDK adapters; absent on normal/preview carts. */
  readonly terminal?: CartTerminalPort;
}

function terminalSnapshot(world: IWorld, port: CartTerminalPort): CartTerminalSnapshot {
  const flowIds = new Set(port.flowIds ?? []);
  const resourceIds = new Set(port.resourceIds ?? []);
  const flagIds = new Set(port.flagIds ?? []);
  if (flowIds.size + resourceIds.size + flagIds.size === 0) throw new Error('cart terminal requires at least one declared id');
  const flows: Array<Readonly<{ id: string; current: string }>> = [];
  const resources: Array<Readonly<{ id: string; current: number; min: number; max: number }>> = [];
  const flags: Array<Readonly<{ id: string; active: boolean }>> = [];
  for (const [eid] of world.query('GameFlow')) {
    const value = world.getComponent<{ type: 'GameFlow'; id: string; current: string }>(eid, 'GameFlow');
    if (value && flowIds.has(value.id)) flows.push(Object.freeze({ id: value.id, current: value.current }));
  }
  for (const [eid] of world.query('Resource')) {
    const value = world.getComponent<{ type: 'Resource'; id: string; current: number; min: number; max: number }>(eid, 'Resource');
    if (value && resourceIds.has(value.id)) resources.push(Object.freeze({ id: value.id, current: value.current, min: value.min, max: value.max }));
  }
  for (const [eid] of world.query('Flag')) {
    const value = world.getComponent<{ type: 'Flag'; id: string; active: boolean }>(eid, 'Flag');
    if (value && flagIds.has(value.id)) flags.push(Object.freeze({ id: value.id, active: value.active }));
  }
  flows.sort((a, b) => a.id.localeCompare(b.id));
  resources.sort((a, b) => a.id.localeCompare(b.id));
  flags.sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({ flows: Object.freeze(flows), resources: Object.freeze(resources), flags: Object.freeze(flags) });
}

/** Render-only projection: named comparison flags extend the existing Resource/Flag/StringVar/list data source. */
export function cartUiDataSource(world: IWorld, presentation: CartPresentation) {
  const base = createWorldDataSource(world, presentation.lists);
  return {
    ...base,
    flag: (name: string) => {
      const rule = presentation.flags?.[name];
      if (!rule) return base.flag?.(name);
      if (rule.kind === 'resource-equals') return base.resource?.(rule.id)?.current === rule.value;
      for (const [entityId] of world.query('GameFlow')) {
        const flow = world.getComponent<{ type: 'GameFlow'; id: string; current: string }>(entityId, 'GameFlow');
        if (flow?.id === rule.id) return flow.current === rule.value;
      }
      return false;
    },
  };
}

export function cartTheme(presentation: Pick<CartPresentation, 'theme' | 'font'>) {
  const base = presentation.theme === 'apolloBrocade' ? apolloBrocade : presentation.theme === 'apolloToon' ? apolloToon : apolloOnyx;
  return presentation.font === 'system-yahei'
    ? { ...base, fontUi: "'Microsoft YaHei', '微软雅黑', sans-serif" }
    : base;
}

/** Only interactive UI descendants take pointer events; transparent HUD areas leave Canvas clickable. */
function enableUiTargets(host: HTMLElement): void {
  host.querySelectorAll<HTMLElement>('[data-action], [data-modal-close], [data-modal-dialog], [data-modal-scrim]').forEach((el) => { el.style.pointerEvents = 'auto'; });
}

/** 蓝图里出现过的玩家 id（Controllable.playerId 去重升序）。导出供单测。 */
export function controllablePlayerIds(bp: WorldBlueprint): string[] {
  const ids = new Set<string>();
  for (const comps of Object.values(bp.entities)) {
    const c = (comps as Record<string, unknown>).Controllable as { playerId?: unknown } | undefined;
    if (c && typeof c.playerId === 'string' && c.playerId) ids.add(c.playerId);
  }
  return [...ids].sort();
}

// 双人键位（与 platformer2p 同理·卡带线固定约定）：玩家1=方向键+空格跳；玩家2=WASD+左Shift跳。
const P1_KEYMAP: KeyMap = {
  ArrowUp: { dy: -1 }, ArrowDown: { dy: 1 }, ArrowLeft: { dx: -1 }, ArrowRight: { dx: 1 }, Space: { jump: true },
};
const P2_KEYMAP: KeyMap = {
  KeyW: { dy: -1 }, KeyS: { dy: 1 }, KeyA: { dx: -1 }, KeyD: { dx: 1 }, ShiftLeft: { jump: true },
};

// 卡带键盘接线：按蓝图里的 Controllable.playerId 自动配源——
// 单人=方向键+WASD 都归他；双人=玩家1 方向键、玩家2 WASD。无 Controllable=不挂（省监听器）。
export function cartInputFor(bp: WorldBlueprint): { input?: InputSource; dispose: () => void } {
  const players = controllablePlayerIds(bp);
  if (players.length === 0) return { dispose: () => {} };
  if (players.length === 1) {
    const src = new KeyboardInputSource(players[0], window, DEFAULT_KEYMAP);
    return { input: src, dispose: () => src.dispose() };
  }
  const s1 = new KeyboardInputSource(players[0], window, P1_KEYMAP);
  const s2 = new KeyboardInputSource(players[1], window, P2_KEYMAP);
  const multi = new MultiInputSource([s1, s2]);
  return { input: multi, dispose: () => multi.dispose() };
}

/**
 * 建引擎 + CanvasRenderer 跑蓝图，返回清理函数。
 * 装载探针（一次性 load + 空跑 2 tick，与落盘门 manifest-check 同一套检查）先同步引爆坏稿——
 * 首 tick 崩溃发生在 rAF 循环里、try 不住，先在这里明文抛出；调用方 try 住转成错误态。
 */
export function runBlueprintInto(
  div: HTMLElement,
  blueprint: WorldBlueprint,
  vp: RunVp = RUN_VP,
  presentation?: CartPresentation,
  assets?: AssetManager,
  options: CartRunOptions = {},
): () => void {
  try {
    return runBlueprintIntoUnsafe(div, blueprint, vp, presentation, assets, options);
  } catch (error) {
    options.hostVisualSession?.dispose();
    div.innerHTML = '';
    throw error;
  }
}

function runBlueprintIntoUnsafe(
  div: HTMLElement,
  blueprint: WorldBlueprint,
  vp: RunVp,
  presentation: CartPresentation | undefined,
  assets: AssetManager | undefined,
  options: CartRunOptions,
): () => void {
  div.innerHTML = '';
  const probe = new Engine({ tickRate: 60 });
  const unbindProbe = options.hostVisualSession?.bindWorld(probe.world);
  try {
    probe.load(blueprint);
    probe.world.tick();
    probe.world.tick();
  } finally {
    unbindProbe?.();
  }
  // Input sources may install DOM listeners.  Do not create them until the
  // formal host-session bind and blueprint load have both succeeded; either
  // operation is allowed to fail closed before there is a runnable cartridge.
  let io: ReturnType<typeof cartInputFor> | undefined;
  const uiActions = presentation ? new QueuedInputSource('cart-ui') : undefined;
  // Canvas 由 attachRenderer 创建，Engine.input 却只能在构造期指定：用懒输入源接上真实指针。
  // 事件先由 PointerInputSource 逆投影成世界坐标，再由 Engine.step 注入 InputQueue；宿主不写玩法状态。
  let pointer: PointerInputSource | undefined;
  const input: InputSource = {
    commandsForTick: (tick) => [
      ...(io?.input?.commandsForTick(tick) ?? []),
      ...(pointer?.commandsForTick(tick) ?? []),
      ...(uiActions?.commandsForTick(tick) ?? []),
    ],
  };
  const engine = new Engine({ tickRate: 60, input });
  // The formal World is bound before load, so first-frame Clickable evaluation uses
  // the same validated host-mask catalog as the load probe.
  const unbindFormal = options.hostVisualSession?.bindWorld(engine.world);
  try {
    engine.load(blueprint);
  } catch (error) {
    unbindFormal?.();
    throw error;
  }
  io = cartInputFor(blueprint);
  const view = presentation ? { w: presentation.viewport.width, h: presentation.viewport.height } : vp;
  // S3 机器门的只读观察口：仅本地 dev + 显式 query 开启，复用 DebugTrace（排除 hash）。
  // 不注入假动作、不改游戏结果；正式/离线包无此诊断口。
  type TracePort = { read: () => TraceEvent[]; maskTargets: () => CartMaskProbeTarget[] };
  const probeWindow = window as Window & { __ZEROCRAFT_S3_CLICK_TRACE__?: TracePort };
  let tracePort: TracePort | undefined;
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('s3Probe')) {
    const traceId = '__s3-click-probe-trace';
    engine.world.createEntity(traceId);
    engine.world.addComponent(traceId, { type: 'DebugTrace', events: [], max: 128, tick: 0 } as DebugTrace);
    tracePort = {
      read: () => (engine.world.getComponent<DebugTrace>(traceId, 'DebugTrace')?.events ?? [])
        .filter((event) => event.system === 'clickable' && event.kind === 'commit')
        .map((event) => ({ ...event })),
      maskTargets: () => {
        const world = engine.world.readView();
        return cartMaskProbeTargets(collectClickableTargets(world), getCameraView(world), view.w, view.h);
      },
    };
    probeWindow.__ZEROCRAFT_S3_CLICK_TRACE__ = tracePort;
  }
  const host = presentation ? mountHost(div, { fieldW: view.w, fieldH: view.h }) : undefined;
  const feedback = presentation?.pointerFeedback
    ? new CartPointerFeedback(presentation, view.w, view.h, (world, name) => !!cartUiDataSource(world, presentation).flag(name))
    : undefined;
  const renderer = new CanvasRenderer({ width: view.w, height: view.h, ...(feedback ? { pointerFeedback: feedback } : {}), ...(assets ? { assets } : {}) });
  engine.attachRenderer(renderer, host?.playfieldHost ?? div);
  const canvas = (host?.playfieldHost ?? div).querySelector('canvas');
  if (canvas) {
    canvas.style.touchAction = 'none';
    if (host) { canvas.style.position = 'absolute'; canvas.style.inset = '0'; canvas.style.zIndex = '0'; }
    pointer = new PointerInputSource('cart-pointer', canvas, {
      worldFromScreen: (x, y) => screenToWorld(x, y, getCameraView(engine.world), view.w, view.h),
    });
    feedback?.attach(canvas, () => engine.world.readView());
  }
  // Dev-only, read-only walkthrough port. The browser probe must still dispatch
  // real DOM/Canvas gestures; this only reports currently reachable targets.
  const cartProbe = import.meta.env.DEV ? {
    gameId: new URLSearchParams(window.location.search).get('game') ?? 'cart',
    supported: !!presentation,
    reason: presentation ? undefined : '卡带未声明 presentation，通用 UI 走查不支持',
    actions: () => {
      const actions: ReturnType<NonNullable<Window['__zcProbe']>['actions']> = [];
      if (!presentation || !host) return actions;
      const world = engine.world.readView();
      const ds = cartUiDataSource(world, presentation);
      const rect = canvas?.getBoundingClientRect();
      const camera = getCameraView(world);
      const clickable = collectClickableTargets(world);
      for (const target of presentation.focusTargets ?? []) {
        if (target.when && !ds.flag(target.when)) continue;
        const hit = clickable.find((item) => item.eid === target.entity);
        if (!hit || !rect?.width || !rect.height) continue;
        const plan = hit.click.hitMaskKey ? clickableMaskPlan(hit) : null;
        if (hit.click.hitMaskKey && !plan) continue;
        const extents = hit.s ? clickableHalfExtents(hit.t, hit.s) : null;
        const samples = [0, -0.25, 0.25, -0.4, 0.4];
        let point: ReturnType<typeof projectWorldUi2D> | undefined;
        for (const oy of samples) {
          for (const ox of samples) {
            const wx = plan ? hit.t.x + (plan.destination.x + plan.destination.width * (0.5 + ox)) * hit.t.scaleX
              : hit.t.x + (extents?.hw ?? 0) * ox * 2;
            const wy = plan ? hit.t.y + (plan.destination.y + plan.destination.height * (0.5 + oy)) * hit.t.scaleY
              : hit.t.y + (extents?.hh ?? 0) * oy * 2;
            if (pickClickableTarget(clickable, wx, wy, hit.click.phase ?? 'down')?.eid !== target.entity) continue;
            const projected = projectWorldUi2D(wx, wy, camera, view.w, view.h);
            if (projected.visible) { point = projected; break; }
          }
          if (point) break;
        }
        if (!point) continue;
        actions.push({ action: target.action, entity: target.entity, surface: 'canvas',
          x: rect.left + point.x * rect.width / view.w, y: rect.top + point.y * rect.height / view.h,
          disabled: false });
      }
      host.overlayHost.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
        if (el.dataset.uiId?.startsWith('cart-focus-') || !el.getClientRects().length) return;
        actions.push({ action: el.dataset.action ?? '', arg: el.dataset.arg, uiId: el.dataset.uiId,
          surface: 'dom', disabled: (el as HTMLButtonElement).disabled === true });
      });
      return actions;
    },
  } satisfies NonNullable<Window['__zcProbe']> : undefined;
  if (cartProbe) window.__zcProbe = cartProbe;
  let disposeUi: (() => void) | undefined;
  let disposeShortcuts: (() => void) | undefined;
  let disposeFocus: (() => void) | undefined;
  if (presentation && host && uiActions) {
    const uiHost = host.overlayHost;
    const theme = cartTheme(presentation);
    const project = (world: IWorld) => resolveBindings(presentation.ui, cartUiDataSource(world, presentation));
    const mounted = mountUI(uiHost, project(engine.world.readView()), {}, theme, uiActions);
    disposeUi = mounted;
    enableUiTargets(uiHost);
    let last = JSON.stringify(project(engine.world.readView()));
    engine.attachService({ sync: (world) => {
      const next = project(world);
      const signature = JSON.stringify(next);
      if (signature === last) return;
      last = signature;
      mounted.update(next);
      enableUiTargets(uiHost);
    } });
    if (presentation.shortcuts?.length) {
      const onKeydown = (event: KeyboardEvent): void => {
        if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !host.wrapper.isConnected) return;
        const active = document.activeElement;
        if (active && active !== document.body && active !== document.documentElement && !host.wrapper.contains(active)) return;
        if (active instanceof HTMLElement && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))) return;
        // Modal Escape is owned by mountUI.closeAction, so a global shortcut must not emit twice.
        if (uiHost.querySelector('[data-modal-dialog]')) return;
        const ds = cartUiDataSource(engine.world.readView(), presentation);
        const binding = presentation.shortcuts?.find((item) => item.key === event.code
          && (!item.when || ds.flag(item.when)) && (!item.unless || !ds.flag(item.unless)));
        if (!binding) return;
        event.preventDefault();
        event.stopPropagation();
        uiActions.enqueueAction(binding.action);
      };
      window.addEventListener('keydown', onKeydown);
      disposeShortcuts = () => window.removeEventListener('keydown', onKeydown);
    }
    if (presentation.focusTargets?.length) {
      const focusHost = document.createElement('div');
      focusHost.style.cssText = 'position:absolute;inset:0;z-index:15;pointer-events:none';
      host.scene.appendChild(focusHost);
      const items = presentation.focusTargets.map((target) => {
        const anchor = document.createElement('div');
        anchor.style.cssText = 'position:absolute;transform:translate(-50%,-100%);pointer-events:none';
        focusHost.appendChild(anchor);
        const dispose = mountUI(anchor, {
          type: 'Button', id: `cart-focus-${target.entity}`,
          props: { label: target.label, action: target.action, kind: 'quiet',
            ...(target.labelSize !== undefined ? { labelSize: target.labelSize } : {}) },
        }, {}, theme, uiActions);
        const button = anchor.querySelector<HTMLElement>('[data-action]');
        if (button) { button.style.pointerEvents = 'none'; button.style.opacity = '0'; }
        if (button && (target.tone || presentation.pointerFeedback?.visual?.colors)) {
          const color = pointerFeedbackToneColor(target.tone ?? presentation.pointerFeedback!.tone, presentation.pointerFeedback?.visual);
          button.style.borderColor = color;
          button.style.color = color;
        }
        return { target, anchor, button, dispose };
      });
      const reveal = (event: FocusEvent, show: boolean): void => {
        const el = event.target;
        if (el instanceof HTMLElement && el.matches('[data-action]')) el.style.opacity = show ? '1' : '0';
      };
      const onFocusIn = (event: FocusEvent) => reveal(event, true);
      const onFocusOut = (event: FocusEvent) => reveal(event, false);
      focusHost.addEventListener('focusin', onFocusIn);
      focusHost.addEventListener('focusout', onFocusOut);
      engine.attachService({ sync: (world) => {
        const ds = cartUiDataSource(world, presentation);
        const camera = getCameraView(world);
        const clickable = collectClickableTargets(world);
        for (const item of items) {
          const transform = world.getComponent<{ type: 'Transform'; x: number; y: number }>(item.target.entity, 'Transform');
          const hit = clickable.find((target) => target.eid === item.target.entity);
          const anchorWorld = hit ? focusLabelWorldPoint(hit, item.target.labelPlacement) : transform;
          const point = anchorWorld ? projectWorldUi2D(anchorWorld.x, anchorWorld.y, camera, view.w, view.h) : undefined;
          const pointerState = feedback?.current?.entity === item.target.entity ? feedback.current.mode : undefined;
          // A committed click may close its onlyFlag on the same tick. Keep the
          // render-local 145ms press confirmation visible without reopening input.
          const visible = !!point?.visible && (pointerState === 'pressed' || !item.target.when || !!ds.flag(item.target.when));
          item.anchor.style.display = visible ? 'block' : 'none';
          if (!visible) { if (item.button === document.activeElement) item.button?.blur(); continue; }
          item.anchor.style.left = `${point!.x}px`;
          item.anchor.style.top = `${point!.y - (item.target.labelPlacement === 'above' ? (item.target.labelGap ?? 0) : 0)}px`;
          if (item.button) {
            item.button.style.opacity = item.button === document.activeElement || pointerState ? '1' : '0';
            if (pointerState) item.button.dataset.pointerFeedbackState = pointerState;
            else delete item.button.dataset.pointerFeedbackState;
          }
        }
      } });
      disposeFocus = () => {
        focusHost.removeEventListener('focusin', onFocusIn);
        focusHost.removeEventListener('focusout', onFocusOut);
        for (const item of items) item.dispose();
        focusHost.remove();
      };
    }
  }
  const teardown = (disposeHostVisualSession: boolean): void => {
    engine.stop();
    disposeShortcuts?.();
    disposeFocus?.();
    disposeUi?.();
    feedback?.dispose();
    pointer?.dispose();
    renderer.destroy();
    io?.dispose();
    host?.teardown();
    unbindFormal?.();
    if (disposeHostVisualSession) options.hostVisualSession?.dispose();
    if (tracePort && probeWindow.__ZEROCRAFT_S3_CLICK_TRACE__ === tracePort) delete probeWindow.__ZEROCRAFT_S3_CLICK_TRACE__;
    if (cartProbe && window.__zcProbe === cartProbe) delete window.__zcProbe;
    div.innerHTML = '';
  };
  const stop = (): void => teardown(true);
  if (options.terminal) {
    let last: string | undefined;
    try {
      engine.attachService({ sync: (world) => {
        const snapshot = terminalSnapshot(world, options.terminal!);
        const signature = JSON.stringify(snapshot);
        if (signature === last) return;
        last = signature;
        options.terminal!.onSnapshot(snapshot);
      } });
    } catch (error) {
      // The public wrapper owns the one-and-only session disposal for a
      // construction failure.  This still releases every installed local
      // resource before the exception crosses the runner boundary.
      teardown(false);
      throw error;
    }
  }
  engine.start();
  return stop;
}
