import type { IWorld, RendererBackend } from '@engine/core/types.js';
import type { Camera, Tilemap, Sprite } from '@engine/protocol/components.js';
import type { AssetManager, LifeVisualCatalog, LifeVisualRule } from '@assets/index.js';
import { isImageHandle } from '@assets/index.js';
import { collectRenderables, getCameraView, chooseRenderMode, resolveRotation2D, planSpriteDraw } from './renderable.js';
import { wrapLines } from './text-layout.js';
import { deviceBase, entityMatrix } from './canvas-transform.js';
import { Vfx2DLayer } from './vfx2d.js';
import { clampLifeCameraView, collectLifeSceneRender, LIFE_PREVIEW_PALETTE, projectLifeCameraView, type LifeSceneProjectionOptions, type LifeSceneRenderProjection, type LifeWorldVisualCatalog } from './life-scene-render.js';
import type { CameraView } from '@engine/protocol/camera-view.js';
import { WorldUi2DLayer, type WorldUi2DLayerOptions, type WorldUi2DProjectionMode } from './world-ui2d.js';

const LIFE_FARM_PREVIEW_PALETTE = Object.freeze({ tilled: '#5a3721', watered: '#247f91', seeded: '#75c96b', growing: '#32a852', mature: '#f2ad34' });

/** 渲染器只认识表现描述，不依赖预览控制器/输入或玩法能力。 */
export interface CanvasDragPreview {
  frame(world: IWorld, nowMs: number): {
    x: number; y: number; rotation: number; scaleX: number; scaleY: number;
    alpha: number; tint: number; sprite: Sprite; frameIndex?: number;
    fallbackWidth: number; fallbackHeight: number;
  } | null;
  dispose(): void;
}

export interface CanvasRendererOptions {
  width?: number;
  height?: number;
  background?: string;
  /** 可选资产管理器：提供则 sprite 按 textureKey 画真实贴图，否则退化为占位方块。 */
  assets?: AssetManager;
  /** Renderer-local transform for the generic Life development preview. It never enters World state. */
  lifePreviewOptions?: LifeSceneProjectionOptions;
  /** Sanitized render-only visual rules compiled from an authoring AssetSlotManifest. */
  lifeVisualCatalog?: LifeVisualCatalog;
  /** Authoring-only warp/surface semantics; excluded from World and save/hash state. */
  lifeWorldVisualCatalog?: LifeWorldVisualCatalog;
  /** Optional explicit DOM overlay host for WorldUI2D LayoutNodes. Omit for the legacy canvas-only path. */
  worldUi2D?: WorldUi2DLayerOptions & { readonly host: HTMLElement };
  /**
   * Explicit opt-in responsive viewport. Omitted = historical fixed logical canvas.
   * `cover` preserves aspect ratio and fills the local viewport; it never writes Camera back to World.
   */
  viewport?: { readonly mode: 'responsive'; readonly cameraFit?: 'cover' | 'contain' };
  /** Opt-in local pointer ghost. Its state lives outside World/snapshot/hash. */
  dragPreview?: CanvasDragPreview;
}

export function responsiveCameraScale(
  width: number, height: number, referenceWidth: number, referenceHeight: number, fit: 'cover' | 'contain' = 'cover',
): number {
  if (!(width > 0) || !(height > 0) || !(referenceWidth > 0) || !(referenceHeight > 0)) return 1;
  const x = width / referenceWidth; const y = height / referenceHeight;
  return fit === 'contain' ? Math.min(x, y) : Math.max(x, y);
}

export interface LifeVisualDrawPlan {
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly destination: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly smoothing: boolean;
}

/** Pure render-only fit/anchor projection; no authoring metadata or World state is read. */
export function planLifeVisualDraw(
  source: { readonly sx: number; readonly sy: number; readonly sw: number; readonly sh: number },
  rule: LifeVisualRule,
  x: number, y: number, cellSize: number,
): LifeVisualDrawPlan {
  const unit = rule.display.unit === 'cell' ? cellSize : 1;
  const targetW = rule.display.width * unit; const targetH = rule.display.height * unit;
  const ox = rule.offset.x * unit; const oy = rule.offset.y * unit;
  if (rule.fit === 'cover') {
    const sourceAspect = source.sw / source.sh; const targetAspect = targetW / targetH;
    const width = sourceAspect > targetAspect ? source.sh * targetAspect : source.sw;
    const height = sourceAspect > targetAspect ? source.sh : source.sw / targetAspect;
    return {
      source: { x: source.sx + (source.sw - width) / 2, y: source.sy + (source.sh - height) / 2, width, height },
      destination: { x: x + ox - targetW * rule.anchor.x, y: y + oy - targetH * rule.anchor.y, width: targetW, height: targetH },
      smoothing: rule.sampling === 'linear',
    };
  }
  const scale = Math.min(targetW / source.sw, targetH / source.sh);
  const width = source.sw * scale; const height = source.sh * scale;
  return {
    source: { x: source.sx, y: source.sy, width: source.sw, height: source.sh },
    destination: { x: x + ox - width * rule.anchor.x, y: y + oy - height * rule.anchor.y, width, height },
    smoothing: rule.sampling === 'linear',
  };
}

// 浏览器渲染后端：把 collectRenderables 的结果画到 Canvas2D。
// 有 AssetManager 且贴图已加载时，sprite 画真实图像；否则退化为占位方块；shape 直接画几何。
// 升级路径：换成 PhaserBackend / AI 视频后端，collectRenderables 不变。
export class CanvasRenderer implements RendererBackend {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly assets?: AssetManager;
  private readonly lifeVisualCatalog?: LifeVisualCatalog;
  private dpr = 1; // 高分屏适配（用户实测「字好糊」）：缓冲=逻辑尺寸×devicePixelRatio，CSS 钉逻辑尺寸
  private logicalW = 640;
  private logicalH = 400;
  // 文本布局缓存（渲染器侧，不进 sim）：measureText/wrapLines 极贵，只在 content/font/maxWidth
  // 变化时重算，否则复用上次的行数组，避免每帧对每个文本实体重跑布局（Gemini 代码级 #3）。
  private readonly textCache = new Map<string, { sig: string; lines: string[] }>();
  // 2D 粒子层（l7-vfx2d·纯表现）：渲染器私有粒子池，帧间隔按墙钟（渲染面·非 sim），封顶 0.1s 防切页回来一跳。
  private readonly vfx = new Vfx2DLayer();
  private readonly worldUi2D: WorldUi2DLayer;
  private lastFrameMs = 0;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastWorld: IWorld | null = null;
  private readonly onWindowResize = (): void => { this.resizeResponsiveViewport(true); };

  constructor(private readonly opts: CanvasRendererOptions = {}) {
    this.assets = opts.assets;
    this.lifeVisualCatalog = opts.lifeVisualCatalog;
    this.worldUi2D = new WorldUi2DLayer(opts.worldUi2D);
  }

  init(container: HTMLElement): void {
    const canvas = document.createElement('canvas');
    this.container = container;
    this.logicalW = this.opts.width ?? 640;
    this.logicalH = this.opts.height ?? 400;
    // DPR 适配：内部缓冲按物理像素分配、绘制端用 setTransform 缩回逻辑坐标——Retina 上文字/几何
    // 以原生分辨率光栅化（修「字好糊」）。headless/jsdom dpr=1 → 行为与旧版逐位一致。
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.style.display = 'block';
    canvas.width = Math.round(this.logicalW * this.dpr);
    canvas.height = Math.round(this.logicalH * this.dpr);
    canvas.style.width = `${this.logicalW}px`;
    canvas.style.height = `${this.logicalH}px`;
    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (this.opts.worldUi2D) this.worldUi2D.init(this.opts.worldUi2D.host);
    if (this.opts.viewport?.mode === 'responsive') {
      this.resizeResponsiveViewport(false);
      this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resizeResponsiveViewport(true));
      this.resizeObserver?.observe(container);
      if (typeof window !== 'undefined') window.addEventListener('resize', this.onWindowResize);
    }
  }

  sync(world: IWorld): void {
    this.lastWorld = world;
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); // 帧首回到「逻辑坐标系×DPR」基变换
    ctx.imageSmoothingEnabled = false; // 像素图最近邻放大（DCSS 32×32 像素画风，平滑=糊）
    ctx.clearRect(0, 0, this.logicalW, this.logicalH); // 帧首清屏（透明背景=露出底层 CSS 背景图）
    const bg = this.opts.background ?? '#16213e';
    if (bg !== 'transparent') {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.logicalW, this.logicalH);
    }

    // 世界→设备基变换（DPR × 相机·卷轴·REQ-3D-RENDER-EFFICIENCY）：相机把世界向相机反方向平移并缩放使
    // 相机中心落视口中心；无相机=1:1。折成一个仿射 base，下面每实体一次 setTransform 直接合成本层——
    // **免每实体 save/translate/rotate/scale/restore**（百级同屏实体去掉百次状态栈压弹 + 冗余变换调用）。
    const cameraScale = this.renderLocalCameraScale(world);
    const authoredCamera = getCameraView(world);
    const lifeProjection = collectLifeSceneRender(world, this.opts.lifePreviewOptions, this.opts.lifeWorldVisualCatalog);
    const scaledCamera = authoredCamera && cameraScale !== 1 ? { ...authoredCamera, zoom: authoredCamera.zoom * cameraScale } : authoredCamera;
    const camera = scaledCamera && lifeProjection && this.opts.lifePreviewOptions && this.opts.viewport?.mode === 'responsive'
      ? clampLifeCameraView(scaledCamera, this.logicalW, this.logicalH, lifeProjection.sceneWidth, lifeProjection.sceneHeight, lifeProjection.player.center, this.opts.lifePreviewOptions)
      : scaledCamera;
    const base = deviceBase(this.dpr, camera, this.logicalW, this.logicalH);

    // 瓦片地图（背景层，实体之下）：在 world→device 基变换下按世界坐标画。
    ctx.setTransform(base.s, 0, 0, base.s, base.e, base.f);
    this.drawLifeScenePreview(ctx, lifeProjection, camera);
    ctx.setTransform(base.s, 0, 0, base.s, base.e, base.f);
    this.drawTilemap(ctx, world);

    const seenText = new Set<string>(); // 本帧被渲染为文本的实体 → 帧末据此清理 textCache（防无界泄漏）
    let curAlpha = -1; let curFill = ''; // 冗余状态消除：无 save/restore 复位后，globalAlpha/fillStyle 仅变化时才写
    for (const r of collectRenderables(world)) {
      // 三层变换（DPR×相机×实体）合成一个仿射 → 一次 setTransform（rot=0 跳 trig·热路径）·免 save/restore。
      // 朝向：FaceDir 在场则覆盖（render-only atan2·REQ-FACE-ROTATE），否则=Transform.rotation（零回归）。
      ctx.setTransform(...entityMatrix(base, r.x, r.y, resolveRotation2D(r), r.scaleX, r.scaleY));
      const alpha = r.color?.alpha ?? 1;
      if (alpha !== curAlpha) { ctx.globalAlpha = alpha; curAlpha = alpha; }
      const fill = r.color ? `#${(r.color.tint & 0xffffff).toString(16).padStart(6, '0')}` : '#e2e8f0';
      if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }

      // 绘制模式：优先 Sprite（贴图就绪盖过 Shape，给可碰撞实体穿皮，REQ-005），否则退化几何/占位。
      const spriteReady = r.sprite ? this.spriteReady(r.sprite.textureKey, r.frame?.index) : false;
      const mode = chooseRenderMode(r, spriteReady);

      if (mode === 'text' && r.text) {
        const tx = r.text;
        ctx.font = `${tx.fontSize}px ${tx.fontFamily}`;
        ctx.textAlign = (tx.anchor as CanvasTextAlign) || 'center';
        // 多行：按 \n 硬换行 + 可选 maxWidth 自动换行。布局缓存：仅 content/font/maxWidth 变化才重算。
        const sig = `${tx.fontSize}|${tx.fontFamily}|${tx.maxWidth ?? 0}|${tx.content}`;
        let cached = this.textCache.get(r.entityId);
        if (!cached || cached.sig !== sig) {
          cached = { sig, lines: wrapLines(tx.content, tx.maxWidth ?? 0, (s) => ctx.measureText(s).width) };
          this.textCache.set(r.entityId, cached);
        }
        seenText.add(r.entityId);
        const lineHeight = tx.fontSize + (tx.lineSpacing ?? 0);
        for (let li = 0; li < cached.lines.length; li++) {
          ctx.fillText(cached.lines[li], 0, li * lineHeight);
        }
      } else if (mode === 'sprite' && r.sprite) {
        this.drawSprite(ctx, r.sprite.textureKey, r.frame?.index, r.sprite); // spriteReady 已确认会成功
      } else if (mode === 'shape' && r.shape?.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, r.shape.radius ?? 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (mode === 'shape' && r.shape?.kind === 'box') {
        const w = r.shape.width ?? 8;
        const h = r.shape.height ?? 8;
        ctx.fillRect(-w / 2, -h / 2, w, h);
      } else if (mode === 'shape' && r.shape?.kind === 'polygon') {
        const v = r.shape.vertices ?? [];
        if (v.length >= 6) {
          ctx.beginPath();
          ctx.moveTo(v[0], v[1]);
          for (let i = 2; i + 1 < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
          ctx.closePath();
          ctx.fill();
        }
      } else if (mode === 'placeholder') {
        ctx.fillRect(-8, -8, 16, 16); // 有 Sprite 但资产未就绪 → 占位方块
      }
    }

    // G4 render-only 影像：与权威材料实体分离，仅重用 Sprite/Frame/Color 的绘制路径。
    const preview = this.opts.dragPreview?.frame(world, typeof performance !== 'undefined' ? performance.now() : 0);
    if (preview) {
      ctx.setTransform(...entityMatrix(base, preview.x, preview.y, preview.rotation, preview.scaleX, preview.scaleY));
      ctx.globalAlpha = preview.alpha;
      ctx.fillStyle = `#${(preview.tint & 0xffffff).toString(16).padStart(6, '0')}`;
      if (!this.drawSprite(ctx, preview.sprite.textureKey, preview.frameIndex, preview.sprite)) {
        // 资源尚未就绪/加载失败：仅画原 Shape 尺寸的中性占位，不请求 URL 或修改玩法。
        ctx.fillRect(-preview.fallbackWidth / 2, -preview.fallbackHeight / 2, preview.fallbackWidth, preview.fallbackHeight);
      }
      ctx.globalAlpha = 1;
    }

    // 2D 粒子层：实体之上、HUD 之下；世界坐标（相机随动）。无 Vfx2D 且无活粒子 = 一次空查询即返回。
    const nowMs = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = this.lastFrameMs > 0 && nowMs > this.lastFrameMs ? Math.min(0.1, (nowMs - this.lastFrameMs) / 1000) : 1 / 60;
    this.lastFrameMs = nowMs;
    if (this.vfx.step(world, dt)) {
      ctx.setTransform(base.s, 0, 0, base.s, base.e, base.f);
      this.vfx.draw(ctx, world);
    }

    // textCache 反向清理：剔除本帧未渲染为文本（已销毁/转其它模式）的实体缓存，杜绝无界增长（Gemini code review）。
    if (this.textCache.size > seenText.size) {
      for (const k of this.textCache.keys()) if (!seenText.has(k)) this.textCache.delete(k);
    }
    const worldUiMode: WorldUi2DProjectionMode = this.opts.lifePreviewOptions
      ? { kind: 'life-cell', options: this.opts.lifePreviewOptions }
      : { kind: 'world' };
    this.worldUi2D.sync(world, camera, this.logicalW, this.logicalH, worldUiMode);
    // 变换不复位：帧首 setTransform(dpr) 会重置（无 save/restore 需配对）。
  }

  // 贴图是否就绪（资产已加载且是图像句柄）。用于绘制模式选择：就绪才让 Sprite 盖过 Shape（REQ-005）。
  // frameIndex：序列帧/命名动画的当前帧（来自 Frame.index）；整图/atlas 命名帧场景可忽略。
  private spriteReady(textureKey: string, frameIndex?: number): boolean {
    const resolved = this.assets?.resolve(textureKey, frameIndex);
    return !!resolved && isImageHandle(resolved.asset.handle);
  }

  // 解析 (textureKey, frameIndex) → 已加载帧，按 **Sprite.anchorX/anchorY** 定位绘制源矩形。
  // 成功返回 true，否则 false(退化占位)。(ctx 已被 sync 平移到实体的 Transform 位置。)
  //
  // anchor 语义（能力卡 `a-sprite` 明写「0~1 锚点·渲染层读取此组件绘制」）：锚点是贴图上与实体
  // 位置重合的那个点——0.5/0.5=中心（缺省）、0/0=左上、0.5/1=底部中心（脚底站位·最常用的非缺省值）。
  // 旧实现把偏移**写死** `-sw/2, -sh/2`（永远居中），anchorX/Y 根本没传进来 → **契约承诺了却
  // 静默失效**：作者按文档写 anchorY:1 想让角色"脚踩地面"，画面纹丝不动且零报错
  // （engine-review-2026-08-04 §5「2D 渲染」P1）。
  // 缺省 0.5 时 `-sw*0.5` 与旧式 `-sw/2` **逐位等价** → 现有游戏零回归。
  private drawSprite(
    ctx: CanvasRenderingContext2D, textureKey: string, frameIndex?: number, sprite?: Sprite,
  ): boolean {
    const resolved = this.assets?.resolve(textureKey, frameIndex);
    if (!resolved || !isImageHandle(resolved.asset.handle)) return false;
    const plan = planSpriteDraw(sprite, resolved);
    ctx.drawImage(resolved.asset.handle.image, plan.source.x, plan.source.y, plan.source.width, plan.source.height, plan.destination.x, plan.destination.y, plan.destination.width, plan.destination.height);
    return true;
  }

  // 画瓦片地图（单例 Tilemap）：每层据 tileId 从 tileset 图（按格宽推算每行格数）取源矩形，画到瓦片世界位置。
  // tileset 未就绪 → 跳过该层（缺资产退化：先无瓦片，加载后自动显示）。瓦片纯表现、只读 world、不写回。
  // （当前画全图；相机可见区裁剪是 follow-up——demo 房间数百格无压力。）
  private drawTilemap(ctx: CanvasRenderingContext2D, world: IWorld): void {
    if (!this.assets) return;
    let tm: Tilemap | undefined;
    for (const [e] of world.query('Tilemap')) {
      tm = world.getComponent<Tilemap>(e, 'Tilemap');
      break;
    }
    if (!tm) return;
    const ts = tm.tileSize;
    for (const layer of tm.layers) {
      const resolved = this.assets.resolve(layer.tileset);
      if (!resolved || !isImageHandle(resolved.asset.handle)) continue;
      const img = resolved.asset.handle.image as HTMLImageElement | ImageBitmap; // 仅加载图片/bitmap，二者皆有 width
      const tilesPerRow = Math.max(1, Math.floor(img.width / ts));
      for (let r = 0; r < tm.rows; r++) {
        for (let c = 0; c < tm.cols; c++) {
          const id = layer.data[r * tm.cols + c] ?? 0;
          if (id <= 0) continue;
          const col = (id - 1) % tilesPerRow;
          const row = Math.floor((id - 1) / tilesPerRow);
          ctx.drawImage(img, col * ts, row * ts, ts, ts, tm.originX + c * ts, tm.originY + r * ts, ts, ts);
        }
      }
    }
  }

  /** LifeGamePackage fallback preview: renderer-local only, beneath Tilemap and ordinary Renderables. */
  private drawLifeScenePreview(ctx: CanvasRenderingContext2D, projection: LifeSceneRenderProjection | null, camera: CameraView | null): void {
    if (!projection) return;
    if (camera) {
      const projected = projectLifeCameraView(camera, this.logicalW, this.logicalH, this.opts.lifePreviewOptions);
      ctx.setTransform(this.dpr * projected.scale, 0, 0, this.dpr * projected.scale, this.dpr * projected.translateX, this.dpr * projected.translateY);
    }
    for (const tile of projection.tiles) {
      if (tile.skinKey && this.drawLifeTexture(ctx, tile.skinKey, tile.center.x, tile.center.y, tile.size, tile.size / 32, 0.5)) continue;
      ctx.fillStyle = LIFE_PREVIEW_PALETTE[tile.role];
      ctx.fillRect(tile.center.x - tile.size / 2, tile.center.y - tile.size / 2, tile.size, tile.size);
    }
    // Development-preview legibility: preserve the tile grid and active-scene
    // boundary without creating simulation entities or asking authored art to do it.
    // This makes a uniform farm (all soil) visibly navigable instead of a flat slab.
    ctx.strokeStyle = 'rgba(20, 29, 20, 0.28)';
    ctx.lineWidth = 1;
    for (const tile of projection.tiles) ctx.strokeRect(tile.center.x - tile.size / 2, tile.center.y - tile.size / 2, tile.size, tile.size);
    const maxX = Math.max(...projection.tiles.map((tile) => tile.center.x + tile.size / 2));
    const maxY = Math.max(...projection.tiles.map((tile) => tile.center.y + tile.size / 2));
    ctx.strokeStyle = 'rgba(255, 244, 181, 0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(projection.originX + 1, projection.originY + 1, maxX - projection.originX - 2, maxY - projection.originY - 2);
    // Shared navigation affordance: every authored warp stays visible even when
    // the player highlight occupies the same cell. The inner cyan gate and the
    // outer yellow active-cell outline intentionally remain distinct.
    for (const warp of projection.warps) {
      if (!warp.fallbackMarker) continue;
      const inset = Math.max(4, Math.floor(warp.size * 0.2));
      const inner = warp.size - inset * 2;
      ctx.fillStyle = 'rgba(78, 220, 255, 0.20)';
      ctx.fillRect(warp.center.x - warp.size / 2 + inset, warp.center.y - warp.size / 2 + inset, inner, inner);
      ctx.strokeStyle = 'rgba(112, 234, 255, 0.98)';
      ctx.lineWidth = Math.max(2, Math.floor(warp.size * 0.07));
      ctx.strokeRect(warp.center.x - warp.size / 2 + inset, warp.center.y - warp.size / 2 + inset, inner, inner);
      const bar = Math.max(2, Math.floor(warp.size * 0.08));
      ctx.fillStyle = 'rgba(223, 250, 255, 0.95)';
      ctx.fillRect(warp.center.x - bar / 2, warp.center.y - inner * 0.28, bar, inner * 0.56);
    }
    const highlight = projection.playerHighlight;
    const highlightInset = Math.max(1, Math.floor(highlight.size * 0.08));
    ctx.fillStyle = 'rgba(255, 228, 106, 0.22)';
    ctx.fillRect(highlight.center.x - highlight.size / 2 + highlightInset, highlight.center.y - highlight.size / 2 + highlightInset, highlight.size - highlightInset * 2, highlight.size - highlightInset * 2);
    ctx.strokeStyle = 'rgba(255, 235, 137, 0.95)';
    ctx.lineWidth = Math.max(2, Math.floor(highlight.size * 0.06));
    ctx.strokeRect(highlight.center.x - highlight.size / 2 + highlightInset, highlight.center.y - highlight.size / 2 + highlightInset, highlight.size - highlightInset * 2, highlight.size - highlightInset * 2);
    // Sparse farm overlays are a read-only development projection. They are not
    // ECS render entities and do not alter snapshots, hashes, or crop rules.
    for (const overlay of projection.farmOverlays) {
      const inset = Math.max(3, Math.floor(overlay.size * 0.09));
      if (!overlay.soilSkinKey || !this.drawLifeTexture(ctx, overlay.soilSkinKey, overlay.center.x, overlay.center.y, overlay.size, 1, 0.5)) {
        ctx.fillStyle = LIFE_FARM_PREVIEW_PALETTE[overlay.soil];
        ctx.fillRect(overlay.center.x - overlay.size / 2 + inset, overlay.center.y - overlay.size / 2 + inset, overlay.size - inset * 2, overlay.size - inset * 2);
      }
      if (overlay.cropStage) {
        if (overlay.cropSkinKey && this.drawLifeTexture(ctx, overlay.cropSkinKey, overlay.center.x, overlay.center.y, overlay.size, 0.5, 1)) continue;
        const sprout = overlay.cropStage === 'mature' ? Math.floor(overlay.size * 0.46) : overlay.cropStage === 'growing' ? Math.floor(overlay.size * 0.32) : Math.floor(overlay.size * 0.18);
        ctx.fillStyle = LIFE_FARM_PREVIEW_PALETTE[overlay.cropStage];
        ctx.fillRect(overlay.center.x - Math.floor(sprout / 2), overlay.center.y - Math.floor(sprout / 2), sprout, sprout);
      }
    }
    for (const placement of projection.placements) {
      if (!this.drawLifeTexture(ctx, placement.skinKey, placement.center.x, placement.center.y, placement.size, 0.9, placement.anchor === 'bottom-center' ? 1 : 0.5)) {
        ctx.fillStyle = '#c98b54'; ctx.fillRect(placement.center.x - placement.size * 0.3, placement.center.y - placement.size * 0.6, placement.size * 0.6, placement.size * 0.6);
      }
    }
    if (projection.player.skinKey && this.drawLifeTexture(ctx, projection.player.skinKey, projection.player.center.x, projection.player.center.y, projection.cellSize, 0.9, projection.player.anchor === 'bottom-center' ? 1 : 0.5)) return;
    ctx.fillStyle = '#fff4b5';
    ctx.beginPath();
    ctx.arc(projection.player.center.x, projection.player.center.y, projection.player.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Renderer-only Life descriptor consumer: AssetManager key first, semantic preview fallback otherwise. */
  private drawLifeTexture(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, cellSize: number, legacyScale: number, legacyAnchorY: number): boolean {
    const rule = this.lifeVisualCatalog?.get(key);
    const resolved = this.assets?.resolve(key, rule?.frameIndex);
    if (!resolved || !isImageHandle(resolved.asset.handle)) return false;
    const { sx, sy, sw, sh } = resolved;
    if (!rule) {
      const w = sw * legacyScale; const h = sh * legacyScale;
      ctx.drawImage(resolved.asset.handle.image, sx, sy, sw, sh, x - w / 2, y - h * legacyAnchorY, w, h);
      return true;
    }
    this.drawLifeVisualRule(ctx, resolved.asset.handle.image, { sx, sy, sw, sh }, rule, x, y, cellSize);
    return true;
  }

  private drawLifeVisualRule(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    source: { readonly sx: number; readonly sy: number; readonly sw: number; readonly sh: number },
    rule: LifeVisualRule,
    x: number, y: number, cellSize: number,
  ): void {
    const plan = planLifeVisualDraw(source, rule, x, y, cellSize);
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = plan.smoothing;
    ctx.drawImage(image, plan.source.x, plan.source.y, plan.source.width, plan.source.height, plan.destination.x, plan.destination.y, plan.destination.width, plan.destination.height);
    ctx.imageSmoothingEnabled = smoothing;
  }

  private renderLocalCameraScale(world: IWorld): number {
    if (this.opts.viewport?.mode !== 'responsive') return 1;
    const cameraEntity = world.singleton('Camera');
    const camera = cameraEntity === undefined ? undefined : world.getComponent<Camera>(cameraEntity, 'Camera');
    if (!camera) return 1;
    const cellSize = this.opts.lifePreviewOptions?.cellSize ?? 32;
    const referenceW = this.opts.lifePreviewOptions ? camera.viewportW * cellSize : camera.viewportW;
    const referenceH = this.opts.lifePreviewOptions ? camera.viewportH * cellSize : camera.viewportH;
    return responsiveCameraScale(this.logicalW, this.logicalH, referenceW, referenceH, this.opts.viewport.cameraFit ?? 'cover');
  }

  private resizeResponsiveViewport(redraw: boolean): void {
    const canvas = this.canvas; const container = this.container;
    if (!canvas || !container || this.opts.viewport?.mode !== 'responsive') return;
    const width = Math.max(1, Math.round(container.clientWidth || this.opts.width || 640));
    const height = Math.max(1, Math.round(container.clientHeight || this.opts.height || 400));
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const changed = width !== this.logicalW || height !== this.logicalH || dpr !== this.dpr;
    if (!changed) return;
    this.logicalW = width; this.logicalH = height; this.dpr = dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (redraw && this.lastWorld) this.sync(this.lastWorld);
  }

  destroy(): void {
    this.opts.dragPreview?.dispose();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onWindowResize);
    this.worldUi2D.dispose();
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.lastWorld = null;
  }
}
