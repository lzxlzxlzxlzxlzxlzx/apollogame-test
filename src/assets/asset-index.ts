import type { AssetManager } from './asset-manager.js';
import type { TextureDescriptor, AtlasDescriptor, SpriteSheetDescriptor, Rect } from './asset-types.js';
import { generatorSpecOf, resolveGeneratedSrc } from './texture-generators.js';
import { parseHitMaskSpec } from '@engine/protocol/hit-mask.js';
export { parseHitMaskSpec } from '@engine/protocol/hit-mask.js';
export type { HitMaskSpec } from '@engine/protocol/hit-mask.js';

// 原始资产存储索引（`assets/index.json`）的读取/校验/桥接。
//
// 分层：这是**最底层 raw 存储**的索引（按类型的叶子资产，无逻辑）。
// 游戏逻辑只引用稳定 `id`；本模块把 `filled` 的条目桥接进 AssetManager 供运行时绘制，
// `tbf`（待填充）条目不注册 → 运行时解析不到 → 渲染层退化为占位。
// 确定性安全：全在表现层，不碰 world / snapshot / hash。
//
// v2（资源库重构）：条目增加可选 category/tags/source/license/provenance —— 全部向后兼容，
// 由资源库浏览器消费、导入器写入（溯源 = 导入方式/原始文件名/归一化 profile）。

export type AssetType = 'texture' | 'mesh' | 'material' | 'sound' | 'animation' | 'video' | 'font' | 'hit-mask';
export const ASSET_TYPES: readonly AssetType[] = [
  'texture',
  'mesh',
  'material',
  'sound',
  'animation',
  'video',
  'font',
  'hit-mask',
];

/** TBF 生命周期（raw 存储层的最小子集；语义槽位层可细分为 placeholder/approved）。 */
export type AssetStatus = 'tbf' | 'filled';

export interface AssetIndexEntry {
  readonly id: string;
  readonly type: AssetType;
  readonly description: string;
  readonly status: AssetStatus;
  /** 相对 `assets/` 的文件路径；status='filled' 时必填，'tbf' 时缺省。 */
  readonly path?: string;
  readonly spec?: Readonly<Record<string, unknown>>;
  /** 类型下的子分类（资源库分类法，如 texture 的 'icon.item'/'background'）。 */
  readonly category?: string;
  /** 检索标签。 */
  readonly tags?: readonly string[];
  /** 来源标识（如 'import'、'FreeArtLib'、'手动'）。 */
  readonly source?: string;
  /** 许可（如 'CC0'）。 */
  readonly license?: string;
  /** 画风（ArtStyle：'pixel'|'cartoon.ink'|...；导入器按来源标，缺省视为 pixel）。 */
  readonly style?: string;
  /** 导入溯源：{ method, originalFile, importedAt, ... }（自由结构，仅作留痕）。 */
  readonly provenance?: Readonly<Record<string, unknown>>;
}

export interface AssetIndex {
  readonly version: number;
  readonly assets: readonly AssetIndexEntry[];
}

function fail(msg: string): never {
  throw new Error(`asset-index: ${msg}`);
}

/** 校验并归一化原始 JSON → AssetIndex。结构非法即抛错（构建期早失败）。 */
export function parseAssetIndex(raw: unknown): AssetIndex {
  if (typeof raw !== 'object' || raw === null) fail('根必须是对象');
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== 'number') fail('version 必须是数字');
  if (!Array.isArray(obj.assets)) fail('assets 必须是数组');

  const seen = new Set<string>();
  const assets: AssetIndexEntry[] = obj.assets.map((a, i) => {
    if (typeof a !== 'object' || a === null) fail(`assets[${i}] 必须是对象`);
    const e = a as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id.length === 0) fail(`assets[${i}].id 必须是非空字符串`);
    if (seen.has(e.id)) fail(`重复的资产 id "${e.id}"`);
    seen.add(e.id);
    if (typeof e.type !== 'string' || !ASSET_TYPES.includes(e.type as AssetType))
      fail(`assets[${i}] "${e.id}".type 非法：${String(e.type)}`);
    if (typeof e.description !== 'string') fail(`assets[${i}] "${e.id}".description 必须是字符串`);
    if (e.status !== 'tbf' && e.status !== 'filled')
      fail(`assets[${i}] "${e.id}".status 必须是 tbf|filled`);
    // material 是**数据型资产**（无文件·数据全在 spec·REQ-Resource ④）→ 免 path；
    // texture 带 spec.generator（程序矢量·REQ-VECTOR-ART 步3）同为数据型 → 免 path；其余 filled 必带 path。
    const hasGenerator = e.type === 'texture'
      && !!e.spec && typeof e.spec === 'object' && !Array.isArray(e.spec)
      && (e.spec as Record<string, unknown>).generator !== undefined;
    if (e.status === 'filled' && e.type !== 'material' && e.type !== 'hit-mask' && !hasGenerator
      && (typeof e.path !== 'string' || e.path.length === 0))
      fail(`assets[${i}] "${e.id}" 已 filled 但缺 path`);
    if (e.spec !== undefined && (typeof e.spec !== 'object' || e.spec === null))
      fail(`assets[${i}] "${e.id}".spec 必须是对象`);
    validateSpec(e.type as AssetType, e.spec as Record<string, unknown> | undefined, i, e.id);
    if (e.type === 'hit-mask' && e.status === 'filled') {
      if (e.path !== undefined) fail(`assets[${i}] "${e.id}" hit-mask 是纯数据资产，不得有 path`);
      if (!parseHitMaskSpec(e.spec)) fail(`assets[${i}] "${e.id}" hit-mask spec 非法（需要 version=1、逻辑尺寸、阈值、sourceTextureKey 与二值 rows）`);
    }
    for (const f of ['category', 'source', 'license', 'style'] as const)
      if (e[f] !== undefined && typeof e[f] !== 'string') fail(`assets[${i}] "${e.id}".${f} 必须是字符串`);
    if (e.tags !== undefined && (!Array.isArray(e.tags) || e.tags.some((t) => typeof t !== 'string')))
      fail(`assets[${i}] "${e.id}".tags 必须是字符串数组`);
    if (e.provenance !== undefined && (typeof e.provenance !== 'object' || e.provenance === null))
      fail(`assets[${i}] "${e.id}".provenance 必须是对象`);
    return {
      id: e.id,
      type: e.type as AssetType,
      description: e.description,
      status: e.status,
      path: typeof e.path === 'string' ? e.path : undefined,
      spec: e.spec as Record<string, unknown> | undefined,
      category: e.category as string | undefined,
      tags: e.tags as string[] | undefined,
      source: e.source as string | undefined,
      license: e.license as string | undefined,
      style: e.style as string | undefined,
      provenance: e.provenance as Record<string, unknown> | undefined,
    };
  });

  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const e of assets) {
    if (e.type !== 'hit-mask' || e.status !== 'filled') continue;
    const mask = parseHitMaskSpec(e.spec)!;
    const texture = byId.get(mask.sourceTextureKey);
    if (!texture || texture.type !== 'texture' || texture.status !== 'filled'
      || texture.spec?.width !== mask.width || texture.spec?.height !== mask.height)
      fail(`hit-mask "${e.id}" 的 sourceTextureKey 缺失、未填充或逻辑尺寸不符`);
  }

  return { version: obj.version, assets };
}

/** 待填充清单（status='tbf'）—— 填充工具/预览器的工作面入口。 */
export function pendingAssets(index: AssetIndex): AssetIndexEntry[] {
  return index.assets.filter((a) => a.status === 'tbf');
}

/** 已填充清单。 */
export function filledAssets(index: AssetIndex): AssetIndexEntry[] {
  return index.assets.filter((a) => a.status === 'filled');
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

/** spec.sheet 的形状（导入器·精灵表切割写入）：等分网格参数。 */
export interface SheetSpec {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly count: number;
}

// ── spec 闭集 schema（REQ-Resource ③·按 type 判别·注册期校验）─────────────────────────
// 数据驱动尺子：贴图/网格的语义元数据是**闭集枚举**（弱 LLM 只能在枚举里选，不能开自由代码口子）。
// 兼容红线：只校验下列**已定义语义字段**的值；旧 freeform 键（format/transparent/frames/sheet/width/height…）
// 一律容忍不校验 → 现有 ~3 万条 texture 条目照跑。缺 usage/colorSpace 的旧条目视作 sprite/srgb（现行为不变）。

export const TEXTURE_USAGES = ['albedo', 'normal', 'roughness', 'metalness', 'ao', 'orm', 'emissive', 'sprite'] as const;
export type TextureUsage = (typeof TEXTURE_USAGES)[number];
export const COLOR_SPACES = ['srgb', 'linear'] as const;
export type ColorSpace = (typeof COLOR_SPACES)[number];
export const TEXTURE_WRAPS = ['clamp', 'repeat'] as const;
export type TextureWrap = (typeof TEXTURE_WRAPS)[number];
export const MESH_COLLISIONS = ['none', 'box', 'hull'] as const;
export type MeshCollision = (typeof MESH_COLLISIONS)[number];

/** texture 语义 spec：usage/colorSpace 是真实贴图关键元数据；wrap/tiling 供材质平铺（后期渲染消费）。 */
export interface TextureSpec {
  usage?: TextureUsage; // 缺省 'sprite'
  colorSpace?: ColorSpace; // 缺省按 usage 推（deriveColorSpace）
  wrap?: TextureWrap; // 缺省：sprite=clamp·材质贴图=repeat（渲染线消费·当前 PBR 恒 repeat）
  tiling?: number; // UV 重复次数（材质平铺·渲染线后期消费）
}
/** mesh 语义 spec：scale/genCollision（genCollision 接 Collider3D·后期）。 */
export interface MeshSpec {
  scale?: number;
  genCollision?: MeshCollision;
}
/** material 语义 spec（材质成索引资产·Phase 4·当前仅校验形状）：预设 + 覆盖参数 + 引 texture key。 */
export interface MaterialSpec {
  preset?: string;
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  map?: string;
  normalMap?: string;
  roughnessMap?: string;
  aoMap?: string;
  metalnessMap?: string; // REQ-3D ④·金属度贴图 key（线性）
  emissiveMap?: string; // 自发光贴图 key（sRGB）
  ormMap?: string; // ORM 打包图 key（R=AO/G=Rough/B=Metal·线性）
}

/** usage → 缺省色彩空间（防「法线/粗糙图误设 sRGB 渲染偏色」经典坑）：颜色类=sRGB·数据类=linear。 */
export function deriveColorSpace(usage: TextureUsage | undefined): ColorSpace {
  switch (usage) {
    case 'normal':
    case 'roughness':
    case 'metalness':
    case 'ao':
    case 'orm':
      return 'linear';
    default: // albedo / emissive / sprite / undefined
      return 'srgb';
  }
}

/** 读 texture 的语义 spec（colorSpace 缺省按 usage 推·供 registerAssetIndex 派生 TextureDescriptor.colorSpace）。 */
export function textureSpecOf(spec: Readonly<Record<string, unknown>> | undefined): {
  usage: TextureUsage | undefined;
  colorSpace: ColorSpace;
  wrap: TextureWrap | undefined;
  tiling: number | undefined;
} {
  const usage = spec?.usage as TextureUsage | undefined;
  const colorSpace = (spec?.colorSpace as ColorSpace | undefined) ?? deriveColorSpace(usage);
  return { usage, colorSpace, wrap: spec?.wrap as TextureWrap | undefined, tiling: numOrUndef(spec?.tiling) };
}

function inSet(set: readonly string[], v: unknown): boolean {
  return typeof v === 'string' && set.includes(v);
}

/** 按 type 校验语义 spec 字段（闭集枚举 → 构建期早失败）。未定义语义字段的键容忍不校验（向后兼容）。 */
function validateSpec(type: AssetType, spec: Record<string, unknown> | undefined, i: number, id: string): void {
  if (!spec) return;
  const badEnum = (f: string, allowed: readonly string[]): never =>
    fail(`assets[${i}] "${id}".spec.${f} 非法：${String(spec[f])}（合法：${allowed.join('|')}）`);
  const mustNum = (f: string): void => {
    if (spec[f] !== undefined && typeof spec[f] !== 'number') fail(`assets[${i}] "${id}".spec.${f} 必须是数字`);
  };
  const mustStr = (f: string): void => {
    if (spec[f] !== undefined && typeof spec[f] !== 'string') fail(`assets[${i}] "${id}".spec.${f} 必须是字符串`);
  };
  if (type === 'texture') {
    if (spec.usage !== undefined && !inSet(TEXTURE_USAGES, spec.usage)) badEnum('usage', TEXTURE_USAGES);
    if (spec.colorSpace !== undefined && !inSet(COLOR_SPACES, spec.colorSpace)) badEnum('colorSpace', COLOR_SPACES);
    if (spec.wrap !== undefined && !inSet(TEXTURE_WRAPS, spec.wrap)) badEnum('wrap', TEXTURE_WRAPS);
    mustNum('tiling');
    // 程序矢量生成器（REQ-VECTOR-ART 步3）：{name, params?}·params 值限 number|string|boolean（纯数据）。
    // 只验形状——name 是否已登记在 registerAssetIndex 期查（生成器由 game 模块 import 期登记·晚于 parse）。
    if (spec.generator !== undefined) {
      const g = spec.generator as Record<string, unknown>;
      if (typeof g !== 'object' || g === null || Array.isArray(g))
        fail(`assets[${i}] "${id}".spec.generator 必须是 {name, params?} 对象`);
      if (typeof g.name !== 'string' || !g.name)
        fail(`assets[${i}] "${id}".spec.generator.name 必须是非空字符串`);
      if (g.params !== undefined) {
        if (typeof g.params !== 'object' || g.params === null || Array.isArray(g.params))
          fail(`assets[${i}] "${id}".spec.generator.params 必须是对象`);
        for (const [pk, pv] of Object.entries(g.params as Record<string, unknown>))
          if (!['number', 'string', 'boolean'].includes(typeof pv))
            fail(`assets[${i}] "${id}".spec.generator.params.${pk} 必须是 number|string|boolean（纯数据）`);
      }
    }
  } else if (type === 'mesh') {
    mustNum('scale');
    if (spec.genCollision !== undefined && !inSet(MESH_COLLISIONS, spec.genCollision)) badEnum('genCollision', MESH_COLLISIONS);
  } else if (type === 'material') {
    for (const f of ['preset', 'map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap', 'emissiveMap', 'ormMap']) mustStr(f);
    for (const f of ['color', 'roughness', 'metalness', 'emissive']) mustNum(f);
  }
}

function sheetSpecOf(spec: Readonly<Record<string, unknown>> | undefined): SheetSpec | undefined {
  const s = spec?.sheet as Partial<SheetSpec> | undefined;
  if (!s || typeof s !== 'object') return undefined;
  if (
    typeof s.frameWidth !== 'number' ||
    typeof s.frameHeight !== 'number' ||
    typeof s.columns !== 'number' ||
    typeof s.count !== 'number'
  )
    return undefined;
  return s as SheetSpec;
}

/**
 * 把已 `filled` 的条目桥接进 AssetManager（运行时即可按 id 消费）。
 * - `texture` → texture/atlas/sprite-sheet 描述符（形态：spec.frames→atlas·spec.sheet→sprite-sheet·否则整图；
 *   整图 texture 带 `colorSpace`——由 spec.usage/colorSpace 派生·渲染 PBR 消费端据此设色彩空间）。
 * - `mesh`（REQ-Resource ②·新）→ ModelDescriptor（渲染线取字节自解析 glTF）。收编各游戏手写 model manifest 进统一索引。
 * - 其它类型（material/sound/…）当前仅在索引中登记，运行时消费端后续增量接入。
 * `baseUrl` 一般为资产根（如 `/assets/`），拼到条目 path 前；path 已是站点绝对路径时用空 baseUrl。
 */
export function registerAssetIndex(manager: AssetManager, index: AssetIndex, baseUrl = ''): void {
  // 防御性拼接：baseUrl 非空且不以 '/' 结尾时补一个，避免 "assets/tex" + "hero.png" = "assets/texhero.png"（Gemini code review）。
  const sep = baseUrl && !baseUrl.endsWith('/') ? '/' : '';
  for (const e of index.assets) {
    // 程序矢量条目（REQ-VECTOR-ART 步3）：filled + spec.generator（免 path）→ 注册期解析成 data-URI。
    // generator 与 path 并存时 generator 胜（热替换=只改索引：加 generator 即切矢量·删之即回 raster）。
    const gen = e.type === 'texture' && e.status === 'filled' ? generatorSpecOf(e.spec) : null;
    if (e.status !== 'filled' || (!e.path && !gen)) continue;
    const src = gen ? resolveGeneratedSrc(gen) : baseUrl + sep + e.path;
    if (e.type === 'texture') {
      const frames = e.spec?.frames as Record<string, Rect> | undefined;
      const sheet = sheetSpecOf(e.spec);
      let descriptor: TextureDescriptor | AtlasDescriptor | SpriteSheetDescriptor;
      if (frames && typeof frames === 'object') {
        descriptor = { kind: 'atlas', key: e.id, src, frames };
      } else if (sheet) {
        descriptor = { kind: 'sprite-sheet', key: e.id, src, ...sheet };
      } else {
        const { colorSpace } = textureSpecOf(e.spec);
        descriptor = { kind: 'texture', key: e.id, src, width: numOrUndef(e.spec?.width), height: numOrUndef(e.spec?.height), colorSpace };
      }
      manager.register(descriptor);
    } else if (e.type === 'mesh') {
      manager.register({ kind: 'model', key: e.id, src });
    }
    // material（数据型·无文件）不进 AssetManager 加载路径 → 走 buildMaterialCatalog；sound/… 后续增量。
  }
}

/**
 * 取某 `filled` 条目的可服务 src（skinKey/id → URL）——供背景皮肤槽等「按 id 要一张图 URL」的消费
 * （REQ-ART-可消费槽铁律 ②·mountHost sceneBgSkin.imageUrl 的解析口）。
 * 解析规则与 registerAssetIndex 一致：texture 的 generator 胜 path（矢量条目→data-URI）；否则 baseUrl+path。
 * 未找到 / 非 filled / 既无 path 又无 generator → `null`（消费方据此回退程序化背景·兜底永不丢）。
 */
export function filledSrc(index: AssetIndex, id: string, baseUrl = ''): string | null {
  const e = index.assets.find((a) => a.id === id);
  if (!e || e.status !== 'filled') return null;
  const gen = e.type === 'texture' ? generatorSpecOf(e.spec) : null;
  if (gen) return resolveGeneratedSrc(gen);
  if (!e.path) return null;
  const sep = baseUrl && !baseUrl.endsWith('/') ? '/' : '';
  return baseUrl + sep + e.path;
}

/**
 * 材质资源目录（REQ-Resource ④）：从索引提取 `type:'material'` 数据型资产 → `id → MaterialSpec`。
 * 材质 = **引 texture key 的数据资产**（预设降级为「内置材质资源」）；渲染器据 `Material3D.materialRef` 查此表
 * 合成有效材质（见 renderer/three/material.applyMaterialRef）。无文件·不走 AssetManager 加载。
 */
export function buildMaterialCatalog(index: AssetIndex): Map<string, MaterialSpec> {
  const cat = new Map<string, MaterialSpec>();
  for (const e of index.assets) {
    if (e.type !== 'material' || e.status !== 'filled') continue;
    const s = e.spec ?? {};
    cat.set(e.id, {
      preset: typeof s.preset === 'string' ? s.preset : undefined,
      color: numOrUndef(s.color),
      roughness: numOrUndef(s.roughness),
      metalness: numOrUndef(s.metalness),
      emissive: numOrUndef(s.emissive),
      map: typeof s.map === 'string' ? s.map : undefined,
      normalMap: typeof s.normalMap === 'string' ? s.normalMap : undefined,
      roughnessMap: typeof s.roughnessMap === 'string' ? s.roughnessMap : undefined,
      aoMap: typeof s.aoMap === 'string' ? s.aoMap : undefined,
      metalnessMap: typeof s.metalnessMap === 'string' ? s.metalnessMap : undefined,
      emissiveMap: typeof s.emissiveMap === 'string' ? s.emissiveMap : undefined,
      ormMap: typeof s.ormMap === 'string' ? s.ormMap : undefined,
    });
  }
  return cat;
}
