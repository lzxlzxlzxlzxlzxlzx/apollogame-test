// Game I · 控件测试场（UI Gallery）—— 把引擎数据驱动 UI 的全控件铺成可玩画廊。
//
// 它没有玩法——它的「玩法」就是玩 UI：填数据即出像素、动一下就有信号、换令牌即变脸。
// 卡带 launcher 槽契约：mount(container) → cleanup。
//
// 职责：在 container 里摆「画廊 + 事件日志」两栏 → 用引擎 mountUI 解释画廊数据。
// 换皮 = 换一份 UITheme 令牌包后重挂同一棵 LayoutNode（数据一字不改）。
//
// 注意：画廊本体（gallery.ts）是 100% 数据；事件日志面板与换皮重挂属于宿主运行时，
// 不是游戏数据——这正是契约里「工程师写 mountUI/host 层」该待的地方。

import { mountUI, showToast, resolveBindings, resolveDialogue } from '@zerocraft/engine/ui/components/index.js';
import type { UITheme, UIDataSource, LayoutNode, ActionSink } from '@zerocraft/engine/ui/components/index.js';
import { createDialogueWorld, type DialogueWorld } from './dialogue-world.js';
import { buildGallery, modalOverlay, drawerOverlay, INITIAL_CONTROLS, MODULE_NO, type ControlsState } from './gallery.js';
import { buildHandlers } from './handlers.js';
import { THEMES } from './themes.js';
import { applyShop, INITIAL_SHOP, type ShopState } from './shop.js';
import { applyPick, INITIAL_PICK, type PickState } from './pickcards.js';
import { makeSoundPlayer, CHORDS } from './sounds.js';
import { applyRawInput, INITIAL_INPUT, resolveSignal, type InputLabState, type RawInputData } from './input-lab.js';
import { INITIAL_AISHE, composeAishePrompt, aisheOptsForMode, type AisheState } from './video-lab.js';
import { NullAishePort } from '@zerocraft/engine/services/aigp/index.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { ThreeRenderer } from '@zerocraft/engine/renderer/three-renderer.js';
import type { RendererBackend } from '@zerocraft/engine/engine/core/types.js';
import type { WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { animBlueprint } from './anim-lab.js';
import { aiBlueprint } from './ai-lab.js';
import { threeBlueprint } from './three-lab.js';
import { physicsBlueprint } from './physics-lab.js';
import { combatBlueprint } from './combat-lab.js';
import { spawnBlueprint } from './spawn-lab.js';
import { fxBlueprint } from './fx-lab.js';
import { fsmBlueprint } from './fsm-lab.js';
import { light3dBlueprint, post3dBlueprint, nav3dBlueprint, collide3dBlueprint, particle3dBlueprint, text3dBlueprint, ao3dBlueprint, vfx3dBlueprint, material3dBlueprint, fog3dBlueprint, pointlight3dBlueprint, surface3dBlueprint, model3dBlueprint, primitives3dBlueprint, worldui3dBlueprint, toon3dBlueprint, billboard3dBlueprint, path3dBlueprint, spring3dBlueprint } from './three3d.js';
import { AssetManager, ModelAssetLoader } from '@zerocraft/engine/assets/index.js';
import { GAME_I_ASSETS } from './assets3d.js';

// 渲染/仿真模块 → 蓝图 + 渲染后端（canvas/three）。进模块时宿主在 #sim-stage 上 init 引擎实时绘制。
// blueprint 收 tune=现场调参档（REQ-DEMO-调参台）；不吃调参的蓝图签名兼容（TS 允许少参函数赋值）→ 忽略 tune。
const SIM_MODULES: Record<string, { blueprint: (tune: Record<string, string>, no: number) => WorldBlueprint; backend: 'canvas' | 'three'; debug?: 'nav' | 'collider'; assets?: boolean }> = {
  'mod-anim': { blueprint: animBlueprint, backend: 'canvas' },
  'mod-ai': { blueprint: aiBlueprint, backend: 'canvas' },
  'mod-3d': { blueprint: threeBlueprint, backend: 'three' },
  // 3D 能力展台（消费 P3D 3D 渲染线·three 后端）
  'mod-3d-light': { blueprint: light3dBlueprint, backend: 'three' },
  'mod-3d-post': { blueprint: post3dBlueprint, backend: 'three' },
  'mod-3d-nav': { blueprint: nav3dBlueprint, backend: 'three', debug: 'nav' },        // 开导航图/路径线框
  'mod-3d-collide': { blueprint: collide3dBlueprint, backend: 'three', debug: 'collider' }, // 开碰撞体线框
  'mod-3d-particle': { blueprint: particle3dBlueprint, backend: 'three' },
  'mod-3d-primitives': { blueprint: primitives3dBlueprint, backend: 'three' }, // 圆润图元 Mesh3D.shape（cyl/cone/capsule/torus）
  'mod-3d-text': { blueprint: text3dBlueprint, backend: 'three' },        // 头顶 3D 文字 WorldUI3D（纯飘字）
  'mod-3d-worldui': { blueprint: worldui3dBlueprint, backend: 'three' },  // 世界空间富 UI 面板 WorldUI3D.node（LayoutNode）
  'mod-3d-ao': { blueprint: ao3dBlueprint, backend: 'three' },            // 环境光遮蔽 Post3D.ao
  'mod-3d-vfx': { blueprint: vfx3dBlueprint, backend: 'three' },          // 数据驱动 3D 粒子 Vfx3D
  'mod-3d-material': { blueprint: material3dBlueprint, backend: 'three' }, // PBR 材质预设 Material3D
  'mod-3d-fog': { blueprint: fog3dBlueprint, backend: 'three' },           // 距离雾 Fog3D
  'mod-3d-pointlight': { blueprint: pointlight3dBlueprint, backend: 'three' }, // 点光源/聚光灯 Light3D point·spot
  'mod-3d-surface': { blueprint: surface3dBlueprint, backend: 'three' },       // 程序化表面细节 Material3D.surface
  'mod-3d-toon': { blueprint: toon3dBlueprint, backend: 'three' },             // 卡通描边 Material3D.shading:toon+outline
  'mod-3d-billboard': { blueprint: billboard3dBlueprint, backend: 'three' },   // 世界广告牌 Billboard3D + 贴花 Decal3D
  'mod-3d-path': { blueprint: path3dBlueprint, backend: 'three' },             // 路径跟随 Path3D
  'mod-3d-spring': { blueprint: spring3dBlueprint, backend: 'three' },         // 弹簧动画 Anim3D spring
  'mod-3d-model': { blueprint: model3dBlueprint, backend: 'three', assets: true }, // glTF 模型导入 Model3D（需 AssetManager）
  'mod-physics': { blueprint: physicsBlueprint, backend: 'canvas' },
  'mod-combat': { blueprint: combatBlueprint, backend: 'canvas' },
  'mod-spawn': { blueprint: spawnBlueprint, backend: 'canvas' },
  'mod-fx': { blueprint: fxBlueprint, backend: 'canvas' },
  'mod-fsm': { blueprint: fsmBlueprint, backend: 'canvas' },
};

export function mount(container: HTMLElement): () => void {
  // ── 两栏骨架：左画廊（弹性）+ 右事件日志（固定宽）──────────────
  const root = document.createElement('div');
  // -webkit-font-smoothing:antialiased：关掉 subpixel(LCD) 文字抗锯齿。
  // M1/Mac Chrome 下 subpixel 文字在合成滚动层上会被 GPU 栅格成黑（点击才恢复·滚动不行）；
  // 灰度抗锯齿不依赖不透明背景、不触发该缺陷。这是此 M1 黑字 bug 的对症修法。
  root.style.cssText =
    'position:absolute;inset:0;display:flex;overflow:hidden;background:#06080d;' +
    '-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale';

  let galleryHost = document.createElement('div');
  // 不透明背景：合成滚动层背景透明时，部分 GPU 会算错文字栅格（字变黑）→ 给它实底色。
  const galleryHostCss = 'flex:1;min-width:0;overflow-y:auto;background:#06080d';
  galleryHost.style.cssText = galleryHostCss;

  // 右栏事件日志：宿主只提供「固定宽·可滚」的挂载容器；内容 100% 走 ZeroCraft Kit（mountUI + LayoutNode·见 buildLogPanel）。
  const logPane = document.createElement('aside');
  logPane.style.cssText = 'width:320px;flex-shrink:0;overflow-y:auto;background:#06080d';
  root.append(galleryHost, logPane);
  // 模态/抽屉的独立浮层宿主（满屏 fixed·开关它不碰画廊 → 不跳不黑）。
  const overlayHost = document.createElement('div');
  root.appendChild(overlayHost);
  container.appendChild(root);

  // ── 事件日志状态 ─────────────────────────────────────────────
  interface LogLine { action: string; arg?: string; t: string }
  const lines: LogLine[] = [];

  const now = (): string =>
    new Date().toLocaleTimeString('zh-CN', { hour12: false });

  // 事件日志面板（纯数据·ZeroCraft Kit）：Panel + 每行一个 Label（spans 多段着色：时间·dim / 信号名·jade / 参数·text）。
  // Label 内置 esc 防注入；换皮随 theme 令牌走。最新在上、封顶 200 行。
  const buildLogPanel = (): LayoutNode => ({
    type: 'Panel', id: 'log-panel', props: { title: '事件日志 · EVENT LOG', scroll: true },
    layout: { direction: 'column', gap: 4, padding: 14 },
    children: lines.length === 0
      ? [{ type: 'Label', id: 'log-empty', props: { text: '动一下任意控件，信号会出现在这里。', color: 'dim', size: 'sm' } }]
      : lines.slice(-200).reverse().map((ln, i): LayoutNode => ({
          type: 'Label', id: `log-${i}`, props: {
            mono: true, size: 'sm',
            spans: [
              { text: `${ln.t} `, color: 'dim' as const },
              { text: ln.action, color: 'jade' as const },
              ...(ln.arg !== undefined ? [{ text: ` ${ln.arg}`, color: 'text' as const }] : []),
            ],
          },
        })),
  });
  let logUi: ReturnType<typeof mountUI> | null = null; // 在挂载段 mountUI 赋值
  function renderLog(): void { logUi?.update(buildLogPanel(), theme()); }

  // ── 宿主状态（MVU：UI = 状态的纯函数；改状态 → ui.update 局部更新·不整树重挂）──
  let currentTheme = 'onyx';
  let shop: ShopState = INITIAL_SHOP;  // 组合演示·商店
  let pick: PickState = INITIAL_PICK;  // 组合演示·选牌
  let controls: ControlsState = INITIAL_CONTROLS; // 自定义画选中态的控件值（speed/view/rating/qty/city/flag/sound/muted）
  let activeTab = 'tab-layout'; // 当前选中的 tab（切页时记住）→ 换皮重挂后重选它（复位停留页 + 逼重绘修黑字）
  let currentModule: string | null = null; // 展台导航：null=落地积木墙；否则进该模块子菜单
  let input: InputLabState = INITIAL_INPUT; // 输入底座样例状态（宿主 DOM 监听喂 RawInput → reducer）
  let aishe: AisheState = INITIAL_AISHE;     // 爱诗视频样例状态（宿主调 AishePort → 句柄）
  let dlg: DialogueWorld | null = null;      // VN 剧情展台的真 dialogueCapability 世界（进 mod-dialogue 时建·离场销）
  const aishePort = new NullAishePort();     // 占位后端（不发网络·即时 ready 占位句柄）
  // 渲染舞台（第二种宿主）：sim 模块激活时把引擎渲染器挂到 #sim-stage；退出/换皮重挂时拆掉重建。
  let stage: { engine: Engine; renderer: RendererBackend; module: string; container: HTMLElement; sig: string } | null = null;

  // 声音测试播放器（Web Audio·宿主胶水）。音量/声像/静音/混响全在 controls state。
  const player = makeSoundPlayer();

  // 演示用「世界」状态 + 注入式数据源（resolveBindings 活 HUD 用·解耦 ECS）。
  const world = { hp: { current: 70, max: 100 }, gold: { current: 1280 } };
  const dataSource: UIDataSource = {
    resource: (id) => (id === 'aff' ? (dlg ? { current: dlg.affinity() } : undefined) // VN 好感取真世界值（bind:'aff' 活 pill）
      : (world as Record<string, { current: number; max?: number }>)[id]),
    flag: (id) => (id === 'demoFlag' ? controls.flag : false), // visibleWhen 条件显隐演示
  };

  // 文本 emoji 自动图渲（REQ-UI-emoji图渲·活范例）：给每套主题挂 emoji 配置——展示台里文本写的 emoji
  // 字形（Label/Button/Tag…）渲染时自动内联成库里 Twemoji 美术图（已 vendor 进本地 served 目录）。
  // 逐 Label 可 raw:true 逃生（见「🆕 新控件/特性」tab emoji 段的字形对照）。
  const EMOJI_CFG = { base: '/games/game-i/art/emoji' } as const;
  const theme = (): UITheme => ({ ...(THEMES[currentTheme] ?? THEMES['onyx']!), emoji: EMOJI_CFG });

  // 模态/抽屉作独立浮层挂在 overlayHost（与画廊解耦·开关不触发画廊重渲 → 不跳不黑）。
  let overlayNode: LayoutNode | null = null;
  let overlayTeardown: (() => void) | null = null;
  function showOverlay(node: LayoutNode | null): void {
    overlayNode = node;
    if (overlayTeardown) { overlayTeardown(); overlayTeardown = null; }
    if (node) overlayTeardown = mountUI(overlayHost, node, handlers, theme(), galleryActionSink);
  }

  const handlers = buildHandlers({
    log: (action, arg) => { lines.push({ action, arg, t: now() }); renderLog(); },
    setTheme: (value) => { currentTheme = value; rerender(true); },
    setModal: (open) => { showOverlay(open ? modalOverlay : null); },
    setDrawer: (open) => { showOverlay(open ? drawerOverlay : null); },
    afterTabSwitch: (tabId) => { if (tabId) activeTab = tabId; nudgeRepaint(); }, // 记住当前 tab + 强制重栅格
    enterModule: (id) => {
      currentModule = id ?? null; activeTab = 'tab-layout';
      dlg = id === 'mod-dialogue' ? createDialogueWorld() : null; // 进 VN 展台建真世界·进别的模块弃旧世界
      rerender(); nudgeRepaint();
    },
    exitModule: () => { currentModule = null; dlg = null; rerender(); nudgeRepaint(); }, // 退回展台·弃 VN 世界
    dialogueAdvance: () => { dlg?.advance(); rerender(); }, // 台词框点击 → 真世界推进 + 重投影
    dialogueChoose: (arg) => { if (arg !== undefined) dlg?.choose(Number(arg)); rerender(); }, // 选项点击 → 真世界选择 + 重投影
    aisheGen: () => { // 爱诗：外观 look + 模式 → 组装提示词/选项 → 调 AishePort → 句柄 → 局部更新（旁路·不碰 sim）
      if (aishe.generating) return;
      aishe = { ...aishe, generating: true }; rerender();
      void aishePort.generate(composeAishePrompt(aishe.look, aishe.mode), aisheOptsForMode(aishe.mode, aishe.seed)).then((handle) => {
        aishe = { ...aishe, handle, generating: false }; rerender();
      });
    },
    aisheMode: (arg) => { if (arg) { aishe = { ...aishe, mode: arg, handle: null }; rerender(); } }, // 切输出模式（8 种·换模式清旧句柄）

    playSound: (id) => { if (id) player.play(id, { volume: controls.vol / 100, pan: controls.pan / 100 }); },
    playChord: (id) => { player.playChord(CHORDS[id ?? 'major'] ?? CHORDS['major']!, { volume: (controls.vol / 100) * 0.6, pan: controls.pan / 100 }); },
    playPan: (where) => { const pan = where === 'left' ? -1 : where === 'right' ? 1 : 0; player.play('success', { volume: controls.vol / 100, pan }); },
    startBgm: (id) => { if (id) player.startBgm(id); },
    stopBgm: () => { player.stopBgm(); },
    setControl: (kind, arg) => {
      if (kind === 'flag') controls = { ...controls, flag: arg === 'true' };
      else if (kind === 'sound') controls = { ...controls, sound: arg === 'true' };
      else if (kind === 'speed') controls = { ...controls, speed: arg ?? controls.speed };
      else if (kind === 'view') controls = { ...controls, view: arg ?? controls.view };
      else if (kind === 'qty') controls = { ...controls, qty: Math.max(0, Number(arg) || 0) };
      else if (kind === 'rating') controls = { ...controls, rating: Number(arg) || controls.rating };
      else if (kind === 'city') controls = { ...controls, city: arg ?? controls.city };
      else if (kind === 'muted') { controls = { ...controls, muted: arg === 'true' }; player.setMuted(controls.muted); }
      else if (kind === 'reverb') { controls = { ...controls, reverb: arg === 'true' }; player.setReverb(controls.reverb); }
      else if (kind === 'vol') controls = { ...controls, vol: Math.max(0, Math.min(100, Number(arg) || 0)) };
      else if (kind === 'pan') controls = { ...controls, pan: Math.max(-100, Math.min(100, Number(arg) || 0)) };
      rerender();
    },
    toast: (tone) => {
      const text = { ok: '操作成功 ✓', warn: '请注意 ⚠', danger: '出错了 ✕' }[tone ?? 'ok'] ?? '提示';
      showToast(root, text, { tone: tone as 'ok' | 'warn' | 'danger' | undefined, theme: theme() });
    },
    tune3d: (arg) => {
      // 现场调参台：arg=`key:档`（如 'l.sun:high'）→ 写 controls.tune → rerender（内含 syncStage）→ 3D 舞台 sig 变 → 重建蓝图。
      const [key, val] = (arg ?? '').split(':');
      if (!key || val === undefined) return;
      controls = { ...controls, tune: { ...controls.tune, [key]: val } };
      rerender();
    },
    hurt: (n) => { world.hp.current = Math.max(0, world.hp.current - n); rerender(); },
    heal: (n) => { world.hp.current = Math.min(world.hp.max, world.hp.current + n); world.gold.current += n; rerender(); },
    shopDispatch: (kind, arg) => {
      const { state, toast } = applyShop(shop, kind, arg); // 纯 reducer 出新状态 + toast 意图
      shop = state;
      if (toast) showToast(root, toast.text, { tone: toast.tone, theme: theme() });
      rerender();
    },
    pickDispatch: (kind, arg) => {
      const { state, toast } = applyPick(pick, kind, arg);
      pick = state;
      if (toast) showToast(root, toast.text, { tone: toast.tone, theme: theme() });
      rerender();
    },
  });

  // 展示台把闭集 ActionSink 动作适配回既有 HandlerMap；WheelEvent 的捕获、归一化与
  // Modal/滚动优先级均留在 mountUI，game-i 不写自由 DOM 监听。
  const galleryActionSink: ActionSink = {
    enqueueAction(name, value) { handlers[name]?.(value?.arg); },
  };

  // 渲染前用数据源把 bind 节点解析成字面值（活 HUD·resolveBindings 返回新树·纯函数）。
  // activeTab 恒为首页常量：Tab 切换由 mountUI 内建就地处理（不重渲），数据里 active 不变 →
  // reconcile 永不替换整个 Tabs（含各页/表格）→ 切页态/滚动/输入态全保留、不回弹、不黑。
  // 非换皮重渲：active 恒为 'tab-layout' 常量 → reconcile 永不替换整个 Tabs（切页态/滚动/输入态全保留）。
  // 换皮重挂：传入当前 activeTab → 直接在停留页上挂出（不闪回首页），再 reselectTab 逼重绘。
  // VN 展台活时先跑 resolveDialogue 把三控件 bind 从真世界当前节点投影（speaker/text/options+可选性），
  // 再 resolveBindings 填其余 bind（如好感 pill）。两者都是纯树变换（返回新树·不改原树）。
  const buildTree = (active = 'tab-layout'): LayoutNode => {
    const base = buildGallery(currentTheme, currentModule, false, false, shop, pick, active, controls, input, aishe);
    return resolveBindings(dlg ? resolveDialogue(base, dlg.source) : base, dataSource);
  };

  // 输入底座宿主胶水（「运行时职责」）：在捕获板 #input-pad 上挂 DOM 监听 → 造 RawInputData →
  // 喂纯 reducer → 局部更新读数。幂等绑定（dataset 标记）：reconcile 保留同一 pad 元素 → 监听不重复；
  // 换皮重挂出新 pad（无标记）→ 自动重绑。键盘需焦点（pad 设 tabindex），绑定键 preventDefault 防页面滚动。
  function feedInput(raw: RawInputData): void { input = applyRawInput(input, raw); rerender(); }
  function bindInputPad(): void {
    if (typeof document === 'undefined') return;
    const pad = galleryHost.querySelector<HTMLElement>('#input-pad');
    if (!pad || pad.dataset['inputBound']) return;
    pad.dataset['inputBound'] = '1';
    pad.tabIndex = 0;
    pad.style.cursor = 'crosshair';
    pad.style.outline = 'none';
    pad.addEventListener('keydown', (e) => {
      if (resolveSignal({ source: 'keyboard', key: e.key, phase: 'down' })) e.preventDefault();
      feedInput({ source: 'keyboard', key: e.key, phase: 'down' });
    });
    pad.addEventListener('keyup', (e) => feedInput({ source: 'keyboard', key: e.key, phase: 'up' }));
    const ptr = (e: PointerEvent, phase: string): void => {
      const r = pad.getBoundingClientRect();
      feedInput({ source: 'pointer', x: e.clientX - r.left, y: e.clientY - r.top, phase });
    };
    pad.addEventListener('pointerdown', (e) => { pad.focus(); ptr(e, 'down'); });
    pad.addEventListener('pointerup', (e) => ptr(e, 'up'));
  }

  // 渲染舞台生命周期：让 #sim-stage 上挂着的引擎渲染器与「当前模块/当前 galleryHost」对齐。
  // 进 sim 模块且舞台空 → 建 Engine+蓝图+渲染器、start；模块切走/容器换新（换皮重挂）/容器没了 → stop+destroy。
  // 幂等：每次 render 后调一次。换皮重建 galleryHost 出新 #sim-stage 元素 → 容器变 → 自动拆旧建新。
  function teardownStage(): void {
    if (!stage) return;
    stage.engine.stop();
    stage.renderer.destroy();
    stage = null;
  }
  function syncStage(): void {
    if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
    const want = currentModule ? SIM_MODULES[currentModule] : undefined;
    const container = want ? galleryHost.querySelector<HTMLElement>('#sim-stage') : null;
    const wantSig = JSON.stringify(controls.tune); // 现场调参档变 → 舞台重建（蓝图按新数据重烘）
    if (stage && (!want || stage.module !== currentModule || stage.container !== container || !container || stage.sig !== wantSig)) {
      teardownStage();
    }
    if (want && container && !stage) {
      const engine = new Engine({ tickRate: 60 });
      engine.load(want.blueprint(controls.tune, MODULE_NO.get(currentModule!) ?? 0)); // 传主编号→蓝图给子物挂 <no>-<i> 标签
      let renderer: RendererBackend;
      if (want.backend === 'three') {
        // glTF 模型模块需接 AssetManager：取 .glb 字节供 ThreeRenderer 解析（未就绪本帧不画·就绪后自动现）。
        let assets: AssetManager | undefined;
        if (want.assets) {
          assets = new AssetManager(new ModelAssetLoader());
          assets.registerManifest(GAME_I_ASSETS);
          void assets.loadAll();
        }
        const tr = new ThreeRenderer({ width: 640, height: 400, background: 0x0a0f1e, assets });
        if (want.debug === 'nav') tr.setDebugNav(true);            // 导航图/路径线框（消费 ThreeRenderer 公开调试 API）
        if (want.debug === 'collider') tr.setDebugColliders(true); // 碰撞体线框
        renderer = tr;
      } else {
        renderer = new CanvasRenderer({ width: 640, height: 400, background: '#0a0f1e' });
      }
      engine.attachRenderer(renderer, container);
      engine.start();
      stage = { engine, renderer, module: currentModule!, container, sig: wantSig };
    }
  }

  // 整体挂载后延后一帧强制重绘：消除部分 GPU 在合成滚动层首帧把文字栅格成「陈旧黑字」的故障
  // （等效用户「点一下」，但时机对——必须晚于首帧黑色绘制，所以用双 rAF；同步切 display 在首帧前跑无效）。
  function nudgeRepaint(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // visibility 切换强制重绘但不重置滚动位（兜底·主修是 font-smoothing）。
      galleryHost.style.visibility = 'hidden';
      void galleryHost.offsetHeight; // 强制重排
      galleryHost.style.visibility = '';
    }));
  }

  // 换皮重挂后「重选原 tab」：等效用户保存 index → selectIndex。
  // 程序化点一下当前 tab 的按钮 → 跑 mountUI 内建 switchTab（切 display + 重设 nav 色）→
  // 既复位停留页，又逼这块合成层重绘一次，消除 M1「新建合成层把字栅成黑」的首帧故障。
  // 晚于首帧（双 rAF）才有效——必须发生在那帧黑色绘制之后，正如真实用户「点一下才好」。
  function reselectTab(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const btn = galleryHost.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }));
  }

  // 挂载一次；之后改状态都走 ui.update 局部更新（只补丁变化的子树·不整树重挂·Tab/滚动/输入态不丢·无黑屏）。
  let ui = mountUI(galleryHost, buildTree(), handlers, theme(), galleryActionSink);
  logUi = mountUI(logPane, buildLogPanel(), {}, theme()); // 事件日志面板：纯 LayoutNode 走 ZeroCraft Kit
  bindInputPad(); // 初次挂载后绑捕获板监听
  syncStage();    // 初次挂载：若直接进 sim 模块则挂渲染器
  nudgeRepaint(); // 初次挂载

  function rerender(themeChanged = false): void {
    if (themeChanged) {
      // 换皮整盘换色：重建 galleryHost（全新元素 = 全新合成层），规避大改后旧滚动层「陈旧黑字」。
      ui();
      const fresh = document.createElement('div');
      fresh.style.cssText = galleryHostCss;
      galleryHost.replaceWith(fresh);
      galleryHost = fresh;
      ui = mountUI(galleryHost, buildTree(activeTab), handlers, theme(), galleryActionSink); // 挂在原停留页
      if (overlayNode) showOverlay(overlayNode); // 浮层也换新皮
      reselectTab(); // 换皮后重选原 tab：程序化「点一下」逼重绘（修 M1 黑字）
    } else {
      ui.update(buildTree()); // 局部更新（diff/patch）
    }
    bindInputPad(); // 换皮重挂出新 pad → 重绑；非换皮 pad 不变 → 幂等 no-op
    syncStage();    // 进/出 sim 模块或换皮换容器 → 对齐渲染舞台
    renderLog();
  }

  // ── 卡带 cleanup ─────────────────────────────────────────────
  return () => {
    if (overlayTeardown) overlayTeardown();
    teardownStage(); // 停引擎循环 + 销毁渲染器
    player.close();
    ui();
    logUi?.();
    root.remove();
  };
}
