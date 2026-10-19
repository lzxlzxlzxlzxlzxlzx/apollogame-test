// ═══════════════════════════════════════════════════════════════
//  Renderer —— 引擎无关的渲染数据提取 + 可替换后端
//  collectRenderables 是核心；后端（Ascii / Canvas / …）只负责画。
// ═══════════════════════════════════════════════════════════════
export { collectRenderables } from './renderable.js';
export type { Renderable } from './renderable.js';
export { AsciiRenderer } from './ascii-renderer.js';
export type { AsciiRendererOptions } from './ascii-renderer.js';
export { CanvasRenderer, lifeVisualConsumptionMode, planLifeVisualDraw } from './canvas-renderer.js';
export type { CanvasRendererOptions, LifeVisualConsumptionMode, LifeVisualDrawPlan } from './canvas-renderer.js';
export { WorldUi2DLayer, projectWorldUi2D, worldUi2DTree } from './world-ui2d.js';
export type { WorldUi2DLayerOptions, WorldUi2DPresentation, WorldUi2DProjection, WorldUi2DProjectionMode } from './world-ui2d.js';
export { collectLifeSceneRender, compileLifeWorldVisualCatalog, lifeCellToWorld, lifeWorldToCell, LIFE_PREVIEW_PALETTE } from './life-scene-render.js';
export type { LifePreviewRole, LifeSceneProjectionOptions, LifeSceneRenderProjection, LifeTileDrawDescriptor, LifePlayerDrawDescriptor, LifeWarpDrawDescriptor, LifeWorldVisualCatalog } from './life-scene-render.js';
// SVG 帧投影（无头「截图」：确定 / 可版本控制 / 浏览器可看 / 可文本 diff —— 视觉回归 + 看帧用）。
export { frameSvg } from './frame-svg.js';
export type { FrameSvgOptions } from './frame-svg.js';
// 3D 后端 ThreeRenderer（**通用**，消费同一份 Renderable）已升入本目录：`./three-renderer.js`。
// **刻意不在此 barrel 导出**——它静态 import three(~150KB)，会让 Canvas/Ascii 的消费者连带打包；
// 需要 3D 的入口直接 `import { ThreeRenderer } from '@renderer/three-renderer.js'`（进各自 3D code-split chunk）。
// 纯投影助手（无 three 依赖、node 可测）照常导出：
export { renderablePose, poseBounds, fitPerspective } from './three-projection.js';
export type { Pose3D, Bounds2D } from './three-projection.js';
