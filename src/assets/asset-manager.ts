import type {
  AssetDescriptor,
  AnimationDescriptor,
  AssetHandle,
  AssetLoader,
  AssetManifest,
  FrameRef,
  LoadedAsset,
  ResolvedFrame,
} from './asset-types.js';

// AssetManager —— 表现层资产注册/加载/缓存/解析。
//
// 职责边界(重要)：只按 string key 工作，绝不接触 world / snapshot / hash。
// sim 产出 textureKey(字符串)，这里把 key 解析成「已加载资产 + 子矩形」交给渲染后端。
// 因此整个资产层可随意异步加载/缓存而不影响确定性与 lockstep。
//
// 解析统一抽象：无论 texture / atlas / sprite-sheet / prerendered-sequence，
// 最终都归约为「一张源图 + 一个源矩形(sx,sy,sw,sh)」。这层统一正是 3D→2D 离线
// 序列能当「又一种 kind」无缝接入的原因。

/** 无 I/O 的假加载器：headless / Node / 测试用。句柄是占位对象，尺寸取描述符声明或默认值。 */
export class StubAssetLoader implements AssetLoader {
  async load(descriptor: AssetDescriptor): Promise<{ handle: AssetHandle; width: number; height: number }> {
    const { width, height } = intrinsicSize(descriptor);
    return { handle: { stub: true, key: descriptor.key, kind: descriptor.kind }, width, height };
  }
}

/** 描述符的内在像素尺寸(不依赖真实图像) —— 供 stub 与整图帧解析。 */
function intrinsicSize(descriptor: AssetDescriptor): { width: number; height: number } {
  switch (descriptor.kind) {
    case 'texture':
      return { width: descriptor.width ?? 0, height: descriptor.height ?? 0 };
    case 'atlas': {
      // 取所有命名帧的包围尺寸作为整图近似(仅供 fallback；atlas 一般按帧名取)。
      let w = 0;
      let h = 0;
      for (const r of Object.values(descriptor.frames)) {
        w = Math.max(w, r.x + r.w);
        h = Math.max(h, r.y + r.h);
      }
      return { width: w, height: h };
    }
    case 'sprite-sheet':
    case 'prerendered-sequence': {
      const cols = Math.max(1, descriptor.columns);
      const rows = Math.ceil(descriptor.count / cols);
      return { width: cols * descriptor.frameWidth, height: rows * descriptor.frameHeight };
    }
    case 'model':
      return { width: 0, height: 0 }; // 模型无 2D 像素尺寸（句柄=字节，渲染线自解析包围盒）
  }
}

export class AssetManager {
  private readonly descriptors = new Map<string, AssetDescriptor>();
  private readonly loaded = new Map<string, LoadedAsset>();
  private readonly inflight = new Map<string, Promise<LoadedAsset>>();
  // 命名动画剪辑（R9 增益 B）：逻辑分组、无物理图，故与描述符分开存；resolve 委托底层 atlas。
  private readonly animations = new Map<string, AnimationDescriptor>();

  constructor(private readonly loader: AssetLoader) {}

  /** 注册单个描述符(覆盖同 key)。注册不触发加载。 */
  register(descriptor: AssetDescriptor): void {
    closeImageHandle(this.loaded.get(descriptor.key)?.handle);
    this.loaded.delete(descriptor.key);
    this.inflight.delete(descriptor.key);
    this.descriptors.set(descriptor.key, descriptor);
  }

  /** Remove one session-owned asset without disturbing unrelated registrations. */
  unregister(key: string): void {
    closeImageHandle(this.loaded.get(key)?.handle);
    this.descriptors.delete(key);
    this.loaded.delete(key);
    this.inflight.delete(key);
  }

  /** 注册一份清单(数据驱动，可来自 JSON)。 */
  registerManifest(manifest: AssetManifest): void {
    for (const d of manifest) this.register(d);
  }

  /** 注册命名动画剪辑（按 key；frames 引用底层 atlas 的命名帧）。无需加载（无自有图）。 */
  registerAnimation(anim: AnimationDescriptor): void {
    this.animations.set(anim.key, anim);
  }

  /** 是否已注册（描述符或动画剪辑）。 */
  has(key: string): boolean {
    return this.descriptors.has(key) || this.animations.has(key);
  }

  /** 是否已加载完成。 */
  isLoaded(key: string): boolean {
    return this.loaded.has(key);
  }

  /** 加载单个 key(幂等 + 去重并发)。未注册则抛错。 */
  async load(key: string): Promise<LoadedAsset> {
    const cached = this.loaded.get(key);
    if (cached) return cached;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const descriptor = this.descriptors.get(key);
    if (!descriptor) throw new Error(`AssetManager: 未注册的资产 key "${key}"`);

    const promise = this.loader
      .load(descriptor)
      .then(({ handle, width, height }) => {
        const asset: LoadedAsset = { descriptor, handle, width, height };
        if (this.descriptors.get(key) === descriptor && this.inflight.get(key) === promise) {
          this.loaded.set(key, asset);
          this.inflight.delete(key);
        } else closeImageHandle(handle);
        return asset;
      })
      .catch((err) => {
        // 失败也要清 inflight，否则 rejected promise 永久占位，该 key 整局再也加载不了（Gemini code review）。
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
        throw err;
      });
    this.inflight.set(key, promise);
    return promise;
  }

  /** 加载所有已注册资产。 */
  async loadAll(): Promise<void> {
    await Promise.all([...this.descriptors.keys()].map((k) => this.load(k)));
  }

  /** 取已加载资产(未加载返回 undefined)。 */
  get(key: string): LoadedAsset | undefined {
    return this.loaded.get(key);
  }

  /**
   * 把 (key, frame) 解析成可绘制帧：源图 + 子矩形。
   * - texture：忽略 frame，整图为帧
   * - atlas：frame = 帧名(string)
   * - sprite-sheet / prerendered-sequence：frame = 索引(number，默认 0)，按 columns 折行
   * 未加载或越界返回 undefined(渲染层据此退化为占位)。
   */
  resolve(key: string, frame?: FrameRef): ResolvedFrame | undefined {
    // 命名动画剪辑（R9 增益 B）：index → 有序帧名 → 委托底层 atlas 取矩形（返回 atlas 的已加载资产）。
    const anim = this.animations.get(key);
    if (anim) {
      const idx = typeof frame === 'number' ? frame : 0;
      const name = anim.frames[idx];
      return name === undefined ? undefined : this.resolve(anim.atlas, name);
    }
    const asset = this.loaded.get(key);
    if (!asset) return undefined;
    const d = asset.descriptor;

    switch (d.kind) {
      case 'texture':
        return { asset, sx: 0, sy: 0, sw: asset.width, sh: asset.height };

      case 'atlas': {
        if (typeof frame !== 'string') return undefined;
        const r = d.frames[frame];
        if (!r) return undefined;
        return { asset, sx: r.x, sy: r.y, sw: r.w, sh: r.h };
      }

      case 'sprite-sheet':
      case 'prerendered-sequence': {
        const index = typeof frame === 'number' ? frame : 0;
        if (index < 0 || index >= d.count) return undefined;
        const cols = Math.max(1, d.columns);
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          asset,
          sx: col * d.frameWidth,
          sy: row * d.frameHeight,
          sw: d.frameWidth,
          sh: d.frameHeight,
        };
      }

      case 'model':
        return undefined; // 模型不解析成 2D 帧（渲染线直接消费字节句柄）
    }
  }

  /** 清空缓存与注册(不影响进行中的加载承诺解析，但其结果不再被缓存复用)。 */
  clear(): void {
    this.descriptors.clear();
    for (const asset of this.loaded.values()) closeImageHandle(asset.handle);
    this.loaded.clear();
    this.inflight.clear();
    this.animations.clear();
  }
}

function closeImageHandle(handle: unknown): void {
  if (!handle || typeof handle !== 'object' || !('image' in handle)) return;
  const image = handle.image;
  if (image && typeof image === 'object' && 'close' in image && typeof image.close === 'function') image.close();
}
