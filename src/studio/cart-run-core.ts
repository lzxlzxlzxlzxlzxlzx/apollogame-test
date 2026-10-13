import { Engine } from '../runtime/engine.js';
import { CanvasRenderer } from '@renderer/canvas-renderer.js';
// 直指本体模块（不走 @net/index 桶·理由见 runtime/engine.ts 头注：桶会把 mp-world/playground 的原子能力拖进卡带外壳）。
import { MultiInputSource, type InputSource } from '@net/commands.js';
import { KeyboardInputSource, DEFAULT_KEYMAP, type KeyMap } from '@net/host/local-input.js';
import { PointerInputSource } from '@net/host/queued-input.js';
import { getCameraView, screenToWorld } from '@engine/protocol/camera-view.js';
import type { DebugTrace, TraceEvent } from '@engine/protocol/components.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';

// ═══════════════════════════════════════════════════════════════
//  数据卡带「纯运行核」——建引擎 + CanvasRenderer 跑一份 WorldBlueprint。
//  从 DataCartridgeRunner 的 RunOnly 抽出（无 React），供两处复用：
//    · 创作台 DataCartridgeRunner / ManifestPreview（在线：fetch manifest 后跑）
//    · cartridge-inline-run（离线单文件：从 window.__APOLLO_INLINE_CART__ 内联 manifest 跑）
//  两条路径共用同一确定性装载/输入/生命周期，杜绝「在线能跑、打包跑不了」的口径漂移。
// ═══════════════════════════════════════════════════════════════

export interface RunVp { w: number; h: number; }
export const RUN_VP: RunVp = { w: 960, h: 600 };

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
export function runBlueprintInto(div: HTMLElement, blueprint: WorldBlueprint, vp: RunVp = RUN_VP): () => void {
  div.innerHTML = '';
  const probe = new Engine({ tickRate: 60 });
  probe.load(blueprint);
  probe.world.tick();
  probe.world.tick();
  const io = cartInputFor(blueprint);
  // Canvas 由 attachRenderer 创建，Engine.input 却只能在构造期指定：用懒输入源接上真实指针。
  // 事件先由 PointerInputSource 逆投影成世界坐标，再由 Engine.step 注入 InputQueue；宿主不写玩法状态。
  let pointer: PointerInputSource | undefined;
  const input: InputSource = {
    commandsForTick: (tick) => [
      ...(io.input?.commandsForTick(tick) ?? []),
      ...(pointer?.commandsForTick(tick) ?? []),
    ],
  };
  const engine = new Engine({ tickRate: 60, input });
  engine.load(blueprint);
  // S3 机器门的只读观察口：仅本地 dev + 显式 query 开启，复用 DebugTrace（排除 hash）。
  // 不注入假动作、不改游戏结果；正式/离线包无此诊断口。
  type TracePort = { read: () => TraceEvent[] };
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
    };
    probeWindow.__ZEROCRAFT_S3_CLICK_TRACE__ = tracePort;
  }
  const renderer = new CanvasRenderer({ width: vp.w, height: vp.h });
  engine.attachRenderer(renderer, div);
  const canvas = div.querySelector('canvas');
  if (canvas) {
    canvas.style.touchAction = 'none';
    pointer = new PointerInputSource('cart-pointer', canvas, {
      worldFromScreen: (x, y) => screenToWorld(x, y, getCameraView(engine.world), vp.w, vp.h),
    });
  }
  engine.start();
  return () => {
    engine.stop();
    pointer?.dispose();
    renderer.destroy();
    io.dispose();
    if (tracePort && probeWindow.__ZEROCRAFT_S3_CLICK_TRACE__ === tracePort) delete probeWindow.__ZEROCRAFT_S3_CLICK_TRACE__;
    div.innerHTML = '';
  };
}
