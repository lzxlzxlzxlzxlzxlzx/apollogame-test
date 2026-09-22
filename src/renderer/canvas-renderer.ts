import type { IWorld, RendererBackend } from '@engine/core/types.js';
import type { Tilemap, Sprite } from '@engine/protocol/components.js';
import type { AssetManager } from '@assets/index.js';
import { isImageHandle } from '@assets/index.js';
import { collectRenderables, getCameraView, chooseRenderMode, resolveRotation2D, spriteAnchorOffset } from './renderable.js';
import { wrapLines } from './text-layout.js';
import { deviceBase, entityMatrix } from './canvas-transform.js';
import { Vfx2DLayer } from './vfx2d.js';

export interface CanvasRendererOptions {
  width?: number;
  height?: number;
  background?: string;
  /** 可选资产管理器：提供则 sprite 按 textureKey 画真实贴图，否则退化为占位方块。 */
  assets?: AssetManager;
}

// 浏览器渲染后端：把 collectRenderables 的结果画到 Canvas2D。
// 有 AssetManager 且贴图已加载时，sprite 画真实图像；否则退化为占位方块；shape 直接画几何。
// 升级路径：换成 PhaserBackend / AI 视频后端，collectRenderables 不变。
export class CanvasRenderer implements RendererBackend {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly assets?: AssetManager;
  private dpr = 1; // 高分屏适配（用户实测「字好糊」）：缓冲=逻辑尺寸×devicePixelRatio，CSS 钉逻辑尺寸
  private logicalW = 640;
  private logicalH = 400;
  // 文本布局缓存（渲染器侧，不进 sim）：measureText/wrapLines 极贵，只在 content/font/maxWidth
  // 变化时重算，否则复用上次的行数组，避免每帧对每个文本实体重跑布局（Gemini 代码级 #3）。
  private readonly textCache = new Map<string, { sig: string; lines: string[] }>();
  // 2D 粒子层（l7-vfx2d·纯表现）：渲染器私有粒子池，帧间隔按墙钟（渲染面·非 sim），封顶 0.1s 防切页回来一跳。
  private readonly vfx = new Vfx2DLayer();
  private lastFrameMs = 0;

  constructor(private readonly opts: CanvasRendererOptions = {}) {
    this.assets = opts.assets;
  }

  init(container: HTMLElement): void {
    const canvas = document.createElement('canvas');
    this.logicalW = this.opts.width ?? 640;
    this.logicalH = this.opts.height ?? 400;
    // DPR 适配：内部缓冲按物理像素分配、绘制端用 setTransform 缩回逻辑坐标——Retina 上文字/几何
    // 以原生分辨率光栅化（修「字好糊」）。headless/jsdom dpr=1 → 行为与旧版逐位一致。
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(this.logicalW * this.dpr);
    canvas.height = Math.round(this.logicalH * this.dpr);
    canvas.style.width = `${this.logicalW}px`;
    canvas.style.height = `${this.logicalH}px`;
    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  sync(world: IWorld): void {
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
    const base = deviceBase(this.dpr, getCameraView(world), this.logicalW, this.logicalH);

    // 瓦片地图（背景层，实体之下）：在 world→device 基变换下按世界坐标画。
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
    const { sx, sy, sw, sh } = resolved;
    const { dx, dy } = spriteAnchorOffset(sprite, sw, sh); // 纯函数·单测在 renderable.test
    ctx.drawImage(resolved.asset.handle.image, sx, sy, sw, sh, dx, dy, sw, sh);
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

  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}
