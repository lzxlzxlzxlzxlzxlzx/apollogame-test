// ═══════════════════════════════════════════════════════════════════════════
//  game109 · 种田（暂名）—— 卡带宿主层（mount/host·契约明许·**零玩法逻辑**）
//
//  职责（全在 sim 外）：建 Engine + CanvasRenderer + 指针输入源；把定尺场景画进沙盒画布；cleanup。
//  玩法规则一律在 blueprint.ts 的数据 + 引擎能力里（零游戏层 system 代码）。
//
//  ⚠ 三条宿主纪律（都有实证出处）：
//   1) **不自己搓 rAF 圈**：一律 `engine.start()` —— 引擎的 step 里才注入输入（click-probe 头注记的
//      game108 实测：宿主自搓 world.tick() 绕过输入注入 → UI 动作永远没人取，且不报错）。
//   2) **输入队列由 QueuedInputSource 每拍取空**（`commandsForTick` 取完即清）→ 真链路里一次 pointerdown
//      只响一拍。S2 探针里「每拍要重投输入」是**夹具**保真度（直接写 InputQueue 组件不会自动清），
//      宿主路径不吃这个坑。
//   3) **皮肤资产在 S6 接上**（原注：「暂不接 AssetManager——S3 无美术文件，404 会在控制台留 error，
//      而渲染探针判『零控制台 error』」）。S6 本关把 `art/index.json` 落盘后 404 不再发生，于是照
//      game-103 的同一条样板（fetch + registerAssetIndex + `assets.loadAll`）补齐。纪律不变：
//      **美术是增量非依赖**——index 缺/坏/图加载失败 → 渲染器回退 Shape（`chooseRenderMode`），
//      玩法与无图观感一个字节不变（`art-pipeline.md:29`「未就绪回退 Shape=观感零变」）。
//
//  ── 局的生命周期（S4「终局出口」·brief.md:34「开始→操作→推进→**可重开**」）─────────────
//  一局 = 宿主骨架 + 引擎 + 渲染器 + 指针输入 + DOM HUD（`mountRound` 造、`dispose` 拆）。
//  「重开」= **拆掉本局、照原路径重挂**（`restart`）——同一个 `mountRound`，与首局走的是同一条路，
//  不存在「只有重开局才有」的状态。
//
//  **为什么不做世界侧复位**（刻意记录·防后人改回去）：
//   (a) 引擎没有「重置实体」通用件：36 格 × 三组件（Flag/State/Resource）逐格复位，要么生成式数据爆炸、
//       要么新增引擎件——两条都不划算；
//   (b) `self-check.md:41-43` 明许「世界动作可由**宿主生命周期**消费」，并要求逐个点名「谁消费它」；
//   (c) 先例 game108：终局屏那颗「再来一局」= 宿主换一个世界，不是 flow 里的一次状态跳转。
//  于是结算面板上那颗「重开」键**必须**挂局部 handler（`handlers` 表）——它一旦落进 ActionSink 就成了
//  一条没人认领的信号：点了没反应、且不报错（self-check.md:28 记的正是这个病）。
//  其余 6 枚键（4 工具 + 睡觉 + 卖货）**保持空表**，继续走 `enqueueAction` → keybind → Effect。
//
//  ── 主菜单屏（S7 换屏·D-13·`§4.6`「用 `buildStarterHome`」）──────────────────────────
//  装载后先出主菜单屏（挂 `overlayHost`），点「开始」收起它、进对局。那枚键走的是与「重开」**同一条**判据：
//  世界不认「开始」（蓝图里没有 `kb-start`）⇒ 它俩是 `handlers` 表里**仅有的两颗**宿主局部动作。
//  ⚠ **`restart` 不回首屏**（见 `restart` 的注）：重开 = 再开一局，不是「退出到菜单」。
// ═══════════════════════════════════════════════════════════════════════════

import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { QueuedInputSource, canvasPointerToScreen } from '@zerocraft/engine/net/index.js';
import { mountHost, resolveSceneBg } from '@zerocraft/engine/engine/host/mount-host.js';
import { AssetManager, ImageAssetLoader, parseAssetIndex, registerAssetIndex } from '@zerocraft/engine/assets/index.js';
// `filledSrc`（skinKey → URL 解析口）不在 assets 桶里 ⇒ 走深路径取（**不动 src/** 加导出**：本关零引擎改动）。
import { filledSrc } from '@zerocraft/engine/assets/asset-index.js';
import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import type { HandlerMap, MountHandle } from '@zerocraft/engine/ui/components/index.js';
import { STARTER_THEME } from '@zerocraft/engine/ui/starters/index.js';
import { buildBlueprint, VIEW } from './blueprint.js';
import { ACTIONS, TOOLS } from './data.js';
import { HUD_ACTION, buildHome, buildHud, readHudView } from './hud.js';
import { HUD_H, SCENE_BG, SCENE_SKIN, WRAPPER_BG } from './theme.js';

const PLAYER = 'g109';

/**
 * 一局（**宿主生命周期单元**）：局的一切都在这里，拆了就是没了。
 *
 * 导出这个句柄是给两件事：`mount` 只是它的薄壳（launcher 契约要 `(el) => cleanup`）；
 * 而「重开真的把世界重置成开局态」这条自证硬要求（`self-check.md:38`「点完要断言世界真的变了」）
 * 需要一个观察口——挂载路径与测试路径**共用同一个构造**，不存在只有测试才走的旁路。
 */
export interface MountedRound {
  /** 本局的引擎。**重开后是新的一台**：每次都现读这个 getter，别缓存（缓存的旧引擎已被 stop）。 */
  readonly engine: Engine;
  /** 交给 `mountUI` 的局部 handler 表 —— **唯一真相**（「重开」与主菜单的「开始」都查这张表）。 */
  readonly handlers: HandlerMap;
  /** 重开：拆掉本局 → 照原路径重挂。**结算面板那颗键的消费者就是它**。 */
  readonly restart: () => void;
  /** 拆掉本局（= `mount` 的 cleanup 契约全集：停循环 / 摘订阅 / 摘 HUD / 摘监听 / 拆渲染器 / 拆骨架）。 */
  readonly dispose: () => void;
}

/**
 * 起一局：宿主骨架 → 引擎 → 渲染器 → 指针输入 → DOM HUD → 循环。
 * 返回的 `dispose` 就是 `mount()` 的 cleanup 契约本身（逐条见函数尾）。
 */
export function mountRound(container: HTMLElement): MountedRound {
  let engine: Engine | null = null;
  let teardown: () => void = () => {}; // 当前这一局的拆卸（拆掉后置空操作 ⇒ dispose 幂等）
  /** 收起主菜单屏（「开始」键的消费者）。**由 `start` 每次重指**：没挂菜单（重开后）就是空操作。 */
  let closeHome: () => void = () => {};

  /** 拆本局：停循环 → 摘订阅 → 摘 HUD → 摘监听 → 拆渲染器 → 拆宿主骨架。一条不落。 */
  const dispose = (): void => { teardown(); teardown = () => {}; engine = null; };

  const start = (opts: { menu?: boolean } = {}): void => {
    closeHome = (): void => {}; // 本次挂载还没建菜单 ⇒ 先复位成空操作（重开那趟就是走这条）
    // 宿主骨架（定尺场景 720×910·等比信箱缩放；背景=程序化底 + 可换背景槽）。
    // `bottomBarH: HUD_H` 把底栏 host 撑到 HUD 条高——HUD 住在**场地下沿之下**（不盖 canvas 动作条，理由见 theme.ts）。
    const { scene, bottomHost, overlayHost, teardown: teardownHost } = mountHost(container, {
      fieldW: VIEW.w,
      fieldH: VIEW.h,
      bottomBarH: HUD_H,
      sceneBackground: SCENE_BG,
      wrapperBackground: WRAPPER_BG,
      sceneBgSkin: { skinKey: SCENE_SKIN }, // 无生成图 → 回退程序化底（兜底永不丢）
    });

    const input = new QueuedInputSource(PLAYER);
    const eng = new Engine({ input });
    eng.load(buildBlueprint());

    // ── 皮肤资产（S6 换皮·三条样板：fetch index → registerAssetIndex → loadAll）──────────
    //  渲染器构造时就要拿到 `assets`（贴图查这里）⇒ 先建 AssetManager、后起 fetch。
    //  `loadAll` 是异步的：图到齐之前 Sprite 解析不到贴图 ⇒ 每帧回退 Shape（素坯观感），
    //  到齐后**下一帧自动换装**（renderer 每帧末 collect，不需要重挂 / 不需要重建实体）。
    const skinAssets = new AssetManager(new ImageAssetLoader());

    // ── DOM HUD（S3 点击门的活体控件·见 hud.ts）──────────────────────────────
    //  handlers 表里**只有两颗**（「重开」+ 主菜单的「开始」·都是世界里没有消费者的宿主动作·见文件头）；
    //  其余 6 枚键查不到本地 handler → mountUI 走 ActionSink 分支 `enqueueAction(action)` 入队
    //  （UI 只发信号·逻辑在 sim 能力层·人/AI 同一动作总线）。
    //  `input` 就是那个 sink（QueuedInputSource.enqueueAction 与 ActionSink 同构）→ 键位映射在蓝图里（kb-* 的 KeyBinding）。
    // ── 主题（S5 条件②a 换皮·`capability-plan.md:59-62`「用 house 起手主题」）─────────────────
    //  第 4 参 = `UITheme` = **语义色/字体槽/光标**（`ui.md:33` 明写「换皮」），本来默认给 SHELL。
    //  换成 STARTER_THEME（= `apolloToon`）：`mountUI` 内部照 `theme.webfonts` / `theme.cursor` 自动注入，
    //  不需要宿主额外接线（`server.ts` 里 ensureWebfonts/applyThemeCursor 是它自己的事）。
    //  ⚠ S5 当时写的「只换这一颗·几何与节点树本关冻结」**已被 S7 ②b 取代**（领工声明 §(n) 的正题：
    //    两套控件并一套 ⇒ 该动的正是几何与节点树）。换过的两件：`theme.ts` 的 `HUD_H`（84→196·
    //    盖住撤空的原按钮带）与 `hud.ts` 的动作条（Button → 吃贴图皮的 Panel）。主题这一颗**没变**。
    //  ── 皮肤解析（`filledSrc`）：`art/index.json` 是**唯一**出处，宿主解析好再交树 ──────────────
    //  `hud.ts` 不做 IO、不认 skinKey 之外的任何东西 ⇒ 它拿到的是**已解析 URL**（`HudArt`）。
    //  这与 `SCENE_SKIN` 走的是同一个口子（下面那段 fetch 里已有一处先例），只是消费端从场景底换成按钮。
    //  没解析到 / index 还没到 = `art` 里没这个 key ⇒ 按钮落素坯底色（`BTN_TINT` 同色系·观感零变）。
    //  ⚠ `art` / `redraw` 必须**声明在下面那段 fetch 之前**：那个异步续体要往 `art` 里写、并调 `redraw()`
    //    换皮（`const` 的 TDZ 是词法序，不是执行序——写在后面 TS 直接判「用在其声明前」）。
    const art: Record<string, string> = {};
    const ui: MountHandle = mountUI(bottomHost, buildHud(readHudView(eng.world), art), handlers, STARTER_THEME, input);
    //  重画走 `ui.update(交树)`（最小 diff）——**不是每帧重挂**：逐个节点按 id 比对，props 没变的元素一个 DOM 字节都不动
    //  （所以「不碰它就不变」这条点击门的对照实验前提成立：没有输入时世界不动 → 树不动 → 快照不变）。
    //  通关那一刻树整个换屏（结算面板顶掉读数与动作条），走的也是这条 update。
    const redraw = (): void => { ui.update(buildHud(readHudView(eng.world), art)); };

    // ── 主菜单屏（S7 换屏·D-13·`capability-plan.md §4.6`「**用** `buildStarterHome`…不自建朴素屏」）──
    //  挂 **`overlayHost`**（`inset:0`·z20），**不是** `bottomHost`——后者只有 196px 高，`Screen{fill:true}`
    //  塞进去会变成一个 196px 高的「菜单」。全屏屏的落点是 overlayHost（先例五处见设计稿 §一-5）。
    //  ⚠ `overlayHost` 出厂是 `pointer-events:none`（mount-host.ts:121）——不放行则菜单键点不动；
    //    但放了行，它（z20）就**整幅盖住** canvas（z0）与底栏 HUD（z10）⇒ **收起菜单时必须立刻复位**，
    //    否则那层空 div 会替游戏吃掉之后所有的画布点击（**空 div 一样参与命中测试**，不画东西≠点不到）。
    //  ⇒ 这一开一合就是「菜单期不可操作、开局后可操作」的全部实现，世界侧一个字节没改（形态声明 #3）。
    let homeUi: MountHandle | null = null;
    if (opts.menu) {
      overlayHost.style.pointerEvents = 'auto';
      homeUi = mountUI(overlayHost, buildHome(), handlers, STARTER_THEME, input);
    }
    /** 收起主菜单屏 = 「开始」键的消费者（宿主局部 handler·见 hud.ts 的 `HUD_ACTION.start`）。**幂等**。 */
    closeHome = (): void => {
      if (!homeUi) return;
      homeUi();
      homeUi = null;
      overlayHost.style.pointerEvents = 'none';
    };

    void (async () => {
      try {
        const r = await fetch('/games/game109/art/index.json', { cache: 'no-store' });
        if (!r.ok) return;
        const idx = parseAssetIndex(await r.json());
        registerAssetIndex(skinAssets, idx);
        await skinAssets.loadAll();
        // 场景底（可换背景槽）：挂载那一刻 index 还没到手（fetch 异步）⇒ 到手后补算一次。
        // 用的是**宿主自己的同一个解析函数** `resolveSceneBg`（mountHost 内部调的就是它）——
        // 有生成图则叠在程序化底之上、无图/失败仍露程序化底（兜底永不丢·art-pipeline.md:35）。
        const url = filledSrc(idx, SCENE_SKIN);
        const bg = url ? resolveSceneBg(SCENE_BG, { skinKey: SCENE_SKIN, imageUrl: url }) : undefined;
        if (bg) scene.style.background = bg;
        // 动作条 6 枚的贴图皮（S7 ②b）：**同一个解析口**，只是消费者从场景底换成 DOM 按钮的 `Panel.skin`。
        // `if (u)` 而非直接赋值：解析不到就不写 key ⇒ 那枚按钮落素坯底色（同「美术是增量非依赖」口径）。
        for (const t of TOOLS) { const u = filledSrc(idx, t.skin); if (u) art[t.id] = u; }
        for (const a of ACTIONS) { const u = filledSrc(idx, a.skin); if (u) art[a.id] = u; }
        redraw(); // index 到手 ⇒ 立刻重交一次树让按钮换皮（不必等下一次世界变化）
      } catch { /* 无美术目录 / 图挂了 → 回退程序化观感·不炸游戏 */ }
    })();

    const renderer = new CanvasRenderer({ width: VIEW.w, height: VIEW.h, background: 'transparent', assets: skinAssets });
    eng.attachRenderer(renderer, scene);

    // 画布点击 → 逆投影为世界坐标（无相机=画布逻辑坐标；信箱缩放已由 mountHost 处理）→ 入队。
    // 命中靠 clickable 读单例 InputQueue 的指针坐标（地块/按钮的 Transform+Shape AABB）。
    const canvas = scene.querySelector('canvas') as HTMLCanvasElement;
    const onDown = (e: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const p = canvasPointerToScreen(e.clientX, e.clientY, rect, canvas.width / dpr, canvas.height / dpr);
      input.enqueue({ source: PLAYER, x: p.x, y: p.y, phase: 'down' });
    };
    canvas.addEventListener('pointerdown', onDown);

    // （DOM HUD 的建树与重画见上面 `const ui` / `const redraw`：二者声明在 fetch 那段**之前**——续体要往 `art` 里写并调 `redraw`）
    const offRedraw = eng.subscribe(redraw);
    redraw(); // 起手先画一遍（引擎循环要下一帧才通知，省得首屏空一拍）
    eng.start();

    engine = eng;
    teardown = () => {
      eng.stop();
      offRedraw();
      ui(); // mountUI 句柄：调用即 teardown（摘事件委托 / 清定时器 / 撤注入的 style）
      closeHome(); // 主菜单屏（若还挂着·如菜单期就被 dispose）：**摘挂载**（别只靠 teardownHost 移除 DOM——
                   // `mountUI` 另有事件委托与定时器要清；句柄本身幂等，已收起时是空操作）
      canvas.removeEventListener('pointerdown', onDown);
      renderer.destroy();
      teardownHost(); // 摘 ResizeObserver/resize 监听 + 移除 wrapper
    };
  };

  /**
   * 重开：拆掉本局、照原路径重挂（结算面板那颗键调的就是它）。
   * ⚠ `menu: false` = **不回首屏**：本关的「重开」语义是**再开一局**（局的生命周期），不是「退出到主菜单」。
   *   回首屏会让玩家在结算屏上点一次「重开」却回到菜单（多一次点击、且走查那条「重开后 6 枚键全回来」会红）。
   */
  const restart = (): void => { dispose(); start({ menu: false }); };

  // handler 表：**两颗都是宿主局部动作**（世界里没有消费者 ⇒ 进 ActionSink 就成死键）。
  //   `restart` = 局的生命周期（拆本局重挂）· `start` = 收起主菜单屏（菜单期才在场）。
  const handlers: HandlerMap = {
    [HUD_ACTION.restart]: () => restart(),
    [HUD_ACTION.start]: () => closeHome(),
  };

  start({ menu: true }); // 首局带主菜单屏（重开那趟不带·见 `restart`）

  return {
    get engine(): Engine {
      if (!engine) throw new Error('game109：本局已拆（dispose 之后不该再取 engine）');
      return engine;
    },
    handlers,
    restart,
    dispose,
  };
}

/** 卡带装载面（launcher 契约）：`mount(container) → cleanup`。 */
export function mount(container: HTMLElement): () => void {
  const round = mountRound(container);
  return () => round.dispose();
}
