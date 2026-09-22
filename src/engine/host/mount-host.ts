// 引擎公用宿主骨架（render-only · 纯 DOM · 零 sim 依赖）——REQ-AUDIT-守门 C 件下沉。
//
// 抽出各卡带宿主层重复的「wrapper > scene(定尺缩放盒) > [topHost/bottomHost/overlayHost]」五容器
// 骨架 + 等比缩放逻辑（历史出处：原 game-q/game-t mount 逐字复制的那段·两游戏已随 REQ-RETRO 引擎大扫除
// 2026-08-03 删除，仅留出处说明）。本 helper 只搭台：不引 Engine/World，
// 不碰 sim/hash，不接渲染器/输入/HUD——那些一律留在调用方（宿主契约明许的 sim 外胶水）。
//
// 布局：wrapper 铺满容器并 flex 居中 → scene 定尺盒（fieldW×fieldH·等比 scale 缩进容器·信箱化）；
// 渲染器画布由调用方 attach 进 scene 打底（z0），三个 HUD host 叠上（top/bottom z10·overlay z20）。
// 指针映射经 scene 的 getBoundingClientRect 自动跟随缩放，调用方无需感知 scale。

export interface MountHostOptions {
  /** 定尺场景宽（逻辑像素·等比缩放基准）。 */
  fieldW: number;
  /** 定尺场景高（逻辑像素·等比缩放基准）。 */
  fieldH: number;
  /** 顶栏 host 高（px·默认 0）。 */
  topBarH?: number;
  /** 底栏 host 高（px·默认 0）。 */
  bottomBarH?: number;
  /** 场景底纹（CSS background 值·省略=不设背景）。sceneBgSkin 有生成图时，此值自动降为**回退底层**（兜底永不丢）。 */
  sceneBackground?: string;
  /** wrapper 信箱区底色（CSS background 值·省略=不设背景）。 */
  wrapperBackground?: string;
  /**
   * 场景背景皮肤槽（REQ-ART-可消费槽铁律 ②·render-only·不碰 sim/hash）：让程序化背景成为**可替换的可消费槽**。
   * - `imageUrl` 有值（调用方经 `filledSrc(gameIndex, skinKey)` 从本游戏 art 索引解析）→ 生成图叠在
   *   `sceneBackground` 之上（cover/contain/stretch）；图有透明/失败仍露出下面的程序化背景。
   * - `imageUrl` 无值（未生成/未填充）→ 纯回退 `sceneBackground`（**兜底永不丢**·不拿空槽盖掉手绘背景）。
   * 本槽只消费索引现态——生成图入索引前须过 M2.5 人审（防 AI 图自动盖掉手绘·质量倒退）。
   * `skinKey` 打到 scene 的 `data-scene-bg-skin` 属性，供孤儿审计/巡检识别「此场景有可换背景槽」。
   */
  sceneBgSkin?: {
    /** 消费键（art-ledger 派生此行·孤儿审计据此认作有槽·游戏 art 索引按此登记生成图）。 */
    skinKey: string;
    /** 已解析的生成图 URL（null/缺省=未填 → 回退 sceneBackground）。 */
    imageUrl?: string | null;
    /** 贴合方式（默认 cover）。 */
    fit?: 'cover' | 'contain' | 'stretch';
  };
}

const FIT_POS: Record<NonNullable<NonNullable<MountHostOptions['sceneBgSkin']>['fit']>, string> = {
  cover: 'center/cover',
  contain: 'center/contain',
  stretch: 'left top/100% 100%',
};

/** CSS url() 值卫生：转义会破坏双引号 url("…") 上下文的字符（背景 URL 来自可信作者索引·仍做防御）。 */
function cssUrl(u: string): string {
  return u.replace(/["\\]/g, (c) => encodeURIComponent(c));
}

/**
 * 计算 scene 的有效 background 值：皮肤槽有生成图 → 图叠在程序化背景之上（兜底永不丢）；
 * 无生成图 → 纯程序化背景。导出供契约测试。
 */
export function resolveSceneBg(
  fallback: string | undefined,
  skin: MountHostOptions['sceneBgSkin'],
): string | undefined {
  const url = skin?.imageUrl;
  if (url) {
    const img = `url("${cssUrl(url)}") ${FIT_POS[skin?.fit ?? 'cover']} no-repeat`;
    return fallback ? `${img}, ${fallback}` : img; // fallback 作底层：图透明/缺失时露出程序化背景
  }
  return fallback;
}

export interface HostSkeleton {
  /** 铺满容器、flex 居中信箱区的最外层。 */
  wrapper: HTMLDivElement;
  /** 定尺缩放盒——渲染器画布 attach 于此打底（z0）。 */
  scene: HTMLDivElement;
  /** 顶栏 HUD host（z10）。 */
  topHost: HTMLDivElement;
  /** 底栏 HUD host（z10）。 */
  bottomHost: HTMLDivElement;
  /** 全屏浮层 host（z20·默认 pointer-events:none·调用方按需开）。 */
  overlayHost: HTMLDivElement;
  /** 按当前容器尺寸重算 scene 等比缩放（ResizeObserver/resize 已自动触发·此为手动补触发口）。 */
  fit: () => void;
  /** 卸载：停 ResizeObserver + 摘 resize 监听 + 移除 wrapper（调用方另清自己的 sim/HUD 挂载）。 */
  teardown: () => void;
}

export interface ExternalAppFrameOptions {
  /** Root-relative local app URL or an explicitly hosted HTTPS app URL. */
  src: string;
  title: string;
  allow?: string;
  sandbox?: string;
}

function safeExternalAppSrc(src: string): boolean {
  return src.startsWith('/') || src.startsWith('https://');
}

/**
 * Generic render-only adapter for previewing an independently built web app.
 * Game modules provide declarative frame data; DOM ownership stays in the engine host layer.
 */
export function mountExternalAppFrame(container: HTMLElement, opts: ExternalAppFrameOptions): () => void {
  if (!safeExternalAppSrc(opts.src)) throw new Error('external app src must be root-relative or HTTPS');
  if (!opts.title.trim()) throw new Error('external app title is required');
  const frame = document.createElement('iframe');
  frame.title = opts.title;
  frame.src = opts.src;
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent';
  frame.allow = opts.allow ?? 'fullscreen';
  if (opts.sandbox) frame.setAttribute('sandbox', opts.sandbox);
  container.replaceChildren(frame);
  return () => {
    if (frame.parentElement === container) container.replaceChildren();
    else frame.remove();
  };
}

/**
 * 建卡带宿主 DOM 骨架并挂进 container，返回容器句柄 + 缩放/卸载钩子。
 * render-only：不含任何 sim 逻辑，跳过/复用不影响回放/hash/lockstep。
 */
export function mountHost(container: HTMLElement, opts: MountHostOptions): HostSkeleton {
  const { fieldW, fieldH, topBarH = 0, bottomBarH = 0, sceneBackground, wrapperBackground, sceneBgSkin } = opts;

  const wrapper = document.createElement('div');
  // overflow:clip（非 hidden，REQ-FOCUSSCROLL）：hidden 挡不住程序化 focus/scrollIntoView 对 scrollLeft/Top
  // 的位移（浏览器仍会把 hidden 容器当可滚动目标去滚，只是滚完看不见回弹前的中间态）——某些宿主内的
  // 可聚焦控件被点击/聚焦时会触发 scrollIntoView 把 wrapper 整体滚偏，肉眼可见的定尺场景错位。clip 是
  // 严格更强的裁切：禁一切滚动（含程序化），从根上不给浏览器可滚的余地。两者视觉裁切效果一致，clip 无
  // 额外兼容性代价（现代浏览器基线支持）。（game101 因此在游戏层自建了 resetScroll 兜底监听——
  // 本修复落地后那层 workaround 冗余，可由 PE 另行清理，本 ticket 不碰游戏层代码。）
  wrapper.style.cssText =
    'position:absolute;inset:0;overflow:clip;display:flex;align-items:center;justify-content:center;' +
    '-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale' +
    (wrapperBackground ? `;background:${wrapperBackground}` : '');

  // scene = 定尺缩放盒；画布(z0·渲染器 init 时挂入) 打底 + 三个 HUD host(z10/20) 叠上。
  // 场景背景走皮肤槽解析：有生成图→图叠程序化底（兜底永不丢）；无图→纯程序化 sceneBackground。
  const sceneBg = resolveSceneBg(sceneBackground, sceneBgSkin);
  const scene = document.createElement('div');
  scene.style.cssText =
    `position:relative;width:${fieldW}px;height:${fieldH}px;flex:0 0 auto;transform-origin:center center` +
    (sceneBg ? `;background:${sceneBg}` : '');
  // 标记「此场景有可换背景槽」（供孤儿审计/巡检识别·skinKey 即消费键）。
  if (sceneBgSkin?.skinKey) scene.dataset.sceneBgSkin = sceneBgSkin.skinKey;

  const topHost = document.createElement('div');
  topHost.style.cssText = `position:absolute;left:0;right:0;top:0;height:${topBarH}px;z-index:10`;
  const bottomHost = document.createElement('div');
  bottomHost.style.cssText = `position:absolute;left:0;right:0;bottom:0;height:${bottomBarH}px;z-index:10`;
  const overlayHost = document.createElement('div');
  overlayHost.style.cssText = 'position:absolute;inset:0;z-index:20;pointer-events:none';

  scene.append(topHost, bottomHost, overlayHost);
  wrapper.appendChild(scene);
  container.appendChild(wrapper);

  // ── 响应式缩放（定尺场景盒等比缩进容器·指针映射经 getBoundingClientRect 自动跟随）──
  const fit = (): void => {
    const cw = container.clientWidth || fieldW;
    const ch = container.clientHeight || fieldH;
    const k = Math.min(cw / fieldW, ch / fieldH);
    scene.style.transform = `scale(${k})`;
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(container);
  if (typeof window !== 'undefined') window.addEventListener('resize', fit);
  fit();

  const teardown = (): void => {
    ro?.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('resize', fit);
    wrapper.remove();
  };

  return { wrapper, scene, topHost, bottomHost, overlayHost, fit, teardown };
}
