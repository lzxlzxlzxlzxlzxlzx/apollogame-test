// Game 102 · Pixel Pour —— 卡带宿主层（工程师写的 mount/host·契约明许·零玩法逻辑）。
//
// 职责（全在 sim 外·render-only）：建 Engine + CanvasRenderer，把 play-field 画进沙盒画布；响应式缩放；cleanup。
// 玩法规则一律在 blueprint.ts 的数据 + 引擎能力里（Lead 裁①·零游戏层 system 代码）。
// S3 骨架关：先把「像素画棋盘 + 传送带位 + 待命槽 + 补给区」的实体阵画出来（Shape+Color 由 CanvasRenderer 投影）；
// 交互/HUD（LayoutNode 四屏 = PUI·REQ-G102-UI）与玩法链（event-when/launch = S4）后续接入。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { ThreeRenderer } from '@zerocraft/engine/renderer/three-renderer.js';
import { buildVoxelScene } from './voxel.js';
import { mountVoxelProto } from './voxel-proto.js';
import { AssetManager, ImageAssetLoader, registerAssetIndex, parseAssetIndex } from '@zerocraft/engine/assets/index.js';
import { QueuedInputSource, canvasPointerToScreen } from '@zerocraft/engine/net/host/index.js';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { buildBlueprint } from './blueprint.js';
import { LEVEL_1 } from './levels.js';
import { FIELD_W, FIELD_H } from './theme.js';

// 沙盒背景：design-ref 对局屏石板渐变（#5b6488→#4c5578·真皮/管道金属观感走 S6 美术台账）。
const FIELD_BG = 'linear-gradient(180deg,#5b6488,#4c5578)';

// ── 3D 体素立方核心（owner 2026-07-26 定案·「先把旋转立方效果做出来」）───────────────────────
// 中央被打目标 = 旋转的 Minecraft 提速块立方（voxel.ts·纯数据）。ThreeRenderer 盒庭模式渲染（同 game-z 宿主先例）。
// 玩法链（炮塔轨道/派炮/命中消体素）后续接：先把立方转起来给 owner 目击。
export function mountVoxel3D(container: HTMLElement, _host?: { exit: () => void }): () => void {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;inset:0;background:#06121f;overflow:hidden;';
  container.appendChild(wrapper);
  const w = wrapper.clientWidth || 720, h = wrapper.clientHeight || 1280;

  const input = new QueuedInputSource('g102-3d');
  const engine = new Engine({ input });
  engine.load(buildVoxelScene());
  const renderer = new ThreeRenderer({ width: w, height: h, background: 0x06121f, antialias: true, dprCap: 1.5, shadowMapSize: 1024 });
  engine.attachRenderer(renderer, wrapper); // ThreeRenderer 自挂 ResizeObserver·随容器尺寸自适应
  engine.start();

  return () => {
    engine.stop();
    renderer.destroy();
    wrapper.remove();
  };
}

// 启动入口（launcher 调 mount）：owner 2026-07-26 定案 → 现默认渲**3D 旋转体素立方**（先目击效果）。
// 玩法链（炮塔轨道/派炮/命中消体素）在 3D 空间接线中；旧 2D 棋盘玩法保留在 mount2D 供逐步移植。
export function mount(container: HTMLElement, host?: { exit: () => void }): () => void {
  // owner 2026-07-26：核心循环手感原型（转立方喂炮·完成制+空放浪费）——先验证好不好玩。
  return mountVoxelProto(container, host);
}

// 纯旋转体素立方展示（无玩法·观感调参用）。
export function mountCubeShowcase(container: HTMLElement, host?: { exit: () => void }): () => void {
  return mountVoxel3D(container, host);
}

// 旧 2D 像素画玩法宿主（保留·玩法链移植到 3D 时参照）。
export function mount2D(container: HTMLElement, _host?: { exit: () => void }): () => void {
  // 宿主骨架（render-only helper·非 sim）：wrapper > scene(定尺缩放盒·信箱化)。
  const { scene, teardown } = mountHost(container, {
    fieldW: FIELD_W,
    fieldH: FIELD_H,
    sceneBackground: FIELD_BG,
    wrapperBackground: '#06121f',
  });

  // sim + 渲染器 + 指针输入：引擎固定步长循环（rAF）每拍先注入本 tick 输入命令再 world.tick。
  const input = new QueuedInputSource('g102');
  const engine = new Engine({ input });
  engine.load(buildBlueprint(LEVEL_1));
  // 炮台贴图资产（打蛋器 recolor·美术就绪即盖过 box·无 index/失败=回退方体·美术是增量非依赖）。
  const assets = new AssetManager(new ImageAssetLoader());
  void (async () => {
    try {
      const r = await fetch('/games/game102/art/index.json', { cache: 'no-store' });
      if (!r.ok) return;
      registerAssetIndex(assets, parseAssetIndex(await r.json()));
      await assets.loadAll();
    } catch { /* 无美术目录 → 回退 box 观感·不炸游戏 */ }
  })();
  const renderer = new CanvasRenderer({ width: FIELD_W, height: FIELD_H, background: 'transparent', assets });
  engine.attachRenderer(renderer, scene);

  // 画布点击 → 逆投影为世界坐标（无相机=画布逻辑坐标·信箱缩放已由 mountHost 处理）→ 入队；
  // 补给炮 Clickable 命中 → fire_<color> 信号 → 置 firing 旗 → 炮向最近同色格喷弹消除（blueprint 开火链）。
  const canvas = scene.querySelector('canvas') as HTMLCanvasElement;
  const onDown = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const p = canvasPointerToScreen(e.clientX, e.clientY, rect, canvas.width / dpr, canvas.height / dpr);
    input.enqueue({ source: 'g102', x: p.x, y: p.y, phase: 'down' });
  };
  canvas.addEventListener('pointerdown', onDown);
  engine.start();

  // cleanup（launcher 卸载时调）：停循环 → 摘监听 → 摘渲染器 → 拆宿主骨架。
  return () => {
    engine.stop();
    canvas.removeEventListener('pointerdown', onDown);
    renderer.destroy();
    teardown();
  };
}
