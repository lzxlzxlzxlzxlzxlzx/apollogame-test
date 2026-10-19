import type { AssetIndex, AssetIndexEntry, AssetType } from './asset-index.js';
import type { AssetManifest } from './asset-types.js';
import { artlibThumb, artlibTokens, artlibSemanticTags, assetStyle, type ArtLibIndex, type ArtStyle } from './artlib.js';

// ═══════════════════════════════════════════════════════════════
//  资源库统一模型（Library）—— 把三套并存的索引适配成一种记录，供一个浏览器看全部。
//
//  来源（source）：
//   · project  — assets/index.json（项目自有资产，TBF 流程的主体，导入器写入处）
//   · artlib   — assets/FreeArtLib/index.json（素材货架，脚本生成，只读）
//   · game     — 各游戏的 AssetManifest 声明清单（只读聚合；游戏层迁数据归 PE）
//
//  纯函数、无 I/O：索引由调用方 fetch/import 后传入。确定性安全（表现层，不碰 sim）。
// ═══════════════════════════════════════════════════════════════

export type LibrarySource = 'project' | 'artlib' | 'game';

export type LibraryStatus = 'filled' | 'tbf' | 'placeholder';

/** 统一资源记录：浏览器/搜索/详情只认它。 */
export interface LibraryRecord {
  /** 稳定 id（= 游戏数据里的 textureKey / clipId 等）。 */
  readonly id: string;
  readonly type: AssetType;
  /** 类型下的子分类（见 LIBRARY_TAXONOMY；texture 用槽位语义）。 */
  readonly category: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  /**
   * 语义标签子集（像素扫描：元素/威胁/风格/旗标，见 artlib-tags.ts）。
   * 浏览器把它们叠加显示在缩略图上；rankRecords 给它们更高匹配权重。
   * tags 已含全集（搜索面不变），这里只是"值得展示/加权"的精选子集。
   */
  readonly semanticTags?: readonly string[];
  readonly source: LibrarySource;
  /** 给人看的来源名："assets/"、"FreeArtLib"、"game-e" 等。 */
  readonly sourceLabel: string;
  readonly license?: string;
  /** 画风或严格 authoring profile id；artlib 货架统一 pixel，项目资产按导入器所标。 */
  readonly style?: string;
  readonly status: LibraryStatus;
  /** 可直接 <img src> 的预览（相对站点根的路径或 dataURL）；无则渲染占位块。 */
  readonly thumb?: string;
  readonly path?: string;
  readonly width?: number;
  readonly height?: number;
  readonly format?: string;
  readonly transparent?: boolean;
  /** Texture semantics used by strict authoring-time candidate selection. Missing legacy values mean sprite/srgb. */
  readonly usage?: string;
  readonly colorSpace?: string;
  readonly sampling?: string;
  readonly variants?: number;
}

// ── 分类法（目录树的数据源；类型常驻显示，空类型也建目录）──

export interface LibraryCategoryDef {
  readonly id: string;
  readonly label: string;
}
export interface LibraryTypeDef {
  readonly type: AssetType;
  readonly label: string;
  readonly icon: string;
  readonly categories: readonly LibraryCategoryDef[];
}

const MISC: LibraryCategoryDef = { id: 'misc', label: '未分类' };

export const LIBRARY_TAXONOMY: readonly LibraryTypeDef[] = [
  {
    type: 'texture',
    label: '贴图',
    icon: '🖼',
    categories: [
      { id: 'sprite.character', label: '角色精灵' },
      { id: 'sprite.paperdoll', label: '纸娃娃' },
      { id: 'tile', label: '瓦片/地形' },
      { id: 'icon.item', label: '物品图标' },
      { id: 'icon.ui', label: 'UI 图标' },
      { id: 'decal', label: '装饰贴花' },
      { id: 'card', label: '卡面' },
      { id: 'playing-card', label: '扑克牌' },
      { id: 'emoji', label: '彩色表情' },
      { id: 'illustration', label: '插画/场景' },
      { id: 'fx', label: '特效' },
      { id: 'background', label: '背景' },
      { id: 'portrait', label: '立绘' },
      { id: 'sheet', label: '精灵表/图集' },
      MISC,
    ],
  },
  {
    type: 'sound',
    label: '音频',
    icon: '🔊',
    categories: [
      { id: 'bgm', label: 'BGM' },
      { id: 'sfx', label: '音效' },
      { id: 'voice', label: '语音' },
      { id: 'ambience', label: '环境声' },
      MISC,
    ],
  },
  { type: 'animation', label: '动画', icon: '🎞', categories: [{ id: 'clip', label: '剪辑' }, MISC] },
  { type: 'video', label: '视频', icon: '🎬', categories: [MISC] },
  { type: 'material', label: '材质', icon: '🧱', categories: [MISC] },
  { type: 'mesh', label: '网格', icon: '🕸', categories: [MISC] },
  { type: 'font', label: '字体', icon: '🔤', categories: [MISC] },
];

/** 类型 → 定义。 */
export function taxonomyOf(type: string): LibraryTypeDef | undefined {
  return LIBRARY_TAXONOMY.find((t) => t.type === type);
}

/** 分类显示名（找不到回退 id）。 */
export function categoryLabel(type: string, category: string): string {
  const def = taxonomyOf(type)?.categories.find((c) => c.id === category);
  return def?.label ?? category;
}

// ── 适配器 1：assets/index.json（项目资产）──

function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}
function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** 项目条目缺 category 时按 id/类型猜一个粗分类（显式 category 字段永远优先）。 */
export function inferCategory(e: AssetIndexEntry): string {
  if (e.category) return e.category;
  if (e.type === 'texture') {
    if (e.id.startsWith('bg.') || e.id.includes('background')) return 'background';
    if (e.id.includes('portrait')) return 'portrait';
    if (e.spec?.frames || e.spec?.sheet) return 'sheet';
    return 'misc';
  }
  if (e.type === 'sound') {
    if (e.id.startsWith('bgm.')) return 'bgm';
    if (e.id.startsWith('sfx.')) return 'sfx';
    if (e.id.startsWith('voice.')) return 'voice';
    return 'misc';
  }
  return 'misc';
}

/** assets/index.json → 统一记录。`assetsBase` 为站点上资产根（dev 下 '/assets/'）。 */
export function projectRecords(index: AssetIndex, assetsBase = '/assets/', aliases?: AliasMap): LibraryRecord[] {
  return index.assets.map((e) => {
    const baseTags = e.tags ? [...e.tags] : [];
    const tags = aliases ? [...baseTags, ...expandAliases(baseTags, aliases)] : baseTags;
    return {
      id: e.id,
      type: e.type,
      category: inferCategory(e),
      name: e.id,
      description: e.description,
      tags,
      source: 'project' as const,
      sourceLabel: 'assets/',
      license: e.license,
      style: e.style,
      status: e.status,
      thumb: e.status === 'filled' && e.path && e.type === 'texture' ? assetsBase + e.path : undefined,
      path: e.path,
      width: numOrUndef(e.spec?.width),
      height: numOrUndef(e.spec?.height),
      format: strOrUndef(e.spec?.format),
      transparent: typeof e.spec?.transparent === 'boolean' ? e.spec.transparent : undefined,
      usage: strOrUndef(e.spec?.usage),
      colorSpace: strOrUndef(e.spec?.colorSpace),
      sampling: strOrUndef(e.spec?.sampling),
    };
  });
}

// ── 检索别名层（概念/同义词/中文）──
//
//  导入器只把图标文件名拆词当 tag（sword→[sword]），搜不到 剑/weapon/blade。
//  这里按 token 命中补检索词（数据来自 assets/curated/search-aliases.json，运行时并入 tags，
//  不入 index.json：省体积、改即生效——同 artlib-tags.ts 的运行时并标签思路）。
//  纯函数、确定性（去重、定序）→ queryLibrary/rankRecords 行为可预期、可测。
export type AliasMap = { readonly [token: string]: readonly string[] };

/** 给定一组已有 token，返回应补充的检索词（去重、字典序、不含原有）。 */
export function expandAliases(tags: readonly string[], aliases: AliasMap): string[] {
  const have = new Set(tags.map((t) => t.toLowerCase()));
  const extra = new Set<string>();
  for (const t of tags) {
    const al = aliases[t.toLowerCase()];
    if (!al) continue;
    for (const a of al) if (!have.has(a.toLowerCase())) extra.add(a);
  }
  return [...extra].sort();
}

// ── 适配器 2：FreeArtLib（素材货架，slot 即分类）──

export function artlibRecords(index: ArtLibIndex): LibraryRecord[] {
  return index.assets.map((a) => ({
    id: a.id,
    type: 'texture' as const,
    category: a.slot,
    name: a.subject,
    description: `${a.cat}${a.sub ? '/' + a.sub : ''} · ${index.source.split('—')[0].trim()}`,
    tags: artlibTokens(a),
    semanticTags: artlibSemanticTags(a),
    source: 'artlib' as const,
    sourceLabel: 'FreeArtLib',
    license: index.license.split('(')[0].trim(),
    style: assetStyle(a), // DCSS 货架全是像素风（缺省即 pixel）
    status: 'filled' as const,
    thumb: '/' + artlibThumb(index, a),
    path: artlibThumb(index, a),
    width: a.w ?? index.basePixel,
    height: a.h ?? index.basePixel,
    format: a.slot === 'card' ? 'webp' : 'png',
    transparent: a.transparent,
    usage: 'sprite',
    colorSpace: 'srgb',
    variants: a.variants,
  }));
}

// ── 适配器 3：游戏 AssetManifest（声明清单，只读聚合）──

/** 一份游戏清单 → 统一记录。内联 data: 图按 placeholder 算（占位皮），引用文件按 filled。 */
export function manifestRecords(gameId: string, manifest: AssetManifest): LibraryRecord[] {
  return manifest.map((d) => {
    const inline = d.src.startsWith('data:');
    const sheet = d.kind === 'sprite-sheet' || d.kind === 'prerendered-sequence';
    return {
      id: d.key,
      type: 'texture' as const,
      category: sheet ? 'sheet' : 'misc',
      name: d.key,
      description: inline ? `内联 ${d.kind} 占位` : d.src,
      tags: [gameId, d.kind],
      source: 'game' as const,
      sourceLabel: gameId,
      status: (inline ? 'placeholder' : 'filled') as LibraryStatus,
      thumb: inline ? d.src : d.src.startsWith('/') ? d.src : '/' + d.src,
      path: inline ? undefined : d.src,
      width: d.kind === 'texture' ? d.width : sheet ? d.frameWidth : undefined,
      height: d.kind === 'texture' ? d.height : sheet ? d.frameHeight : undefined,
      usage: 'sprite',
      colorSpace: 'srgb',
      variants: sheet ? d.count : undefined,
    };
  });
}

// ── 查询（分词全命中 + 维度过滤 + 排序）──

export interface LibraryQuery {
  readonly text?: string;
  readonly type?: string;
  readonly category?: string;
  readonly status?: LibraryStatus | '';
  /** 精确画风过滤（如 'cartoon.ink'）。 */
  readonly style?: ArtStyle | '';
  /** 顶层画风组过滤（'cartoon' 含全部 cartoon.*）。 */
  readonly styleGroup?: 'pixel' | 'cartoon' | '';
  /** 已选 tag 过滤（AND 叠加）。 */
  readonly tags?: readonly string[];
  readonly sources?: readonly LibrarySource[];
  /** relevance = 按 rankRecords 相关度（需 text；无 text 回退 name）。 */
  readonly sort?: 'name' | 'size' | 'variants' | 'relevance';
}

function haystack(r: LibraryRecord): string {
  return searchFields(r).hay;
}

// ── 检索字段预计算缓存（性能）──
//
//  搜索框每敲一键就重算查询；过去每条记录都现做 haystack(join+小写) + rankRecords 现建两个 Set，
//  2 万条记录 × 每键 = 大量临时分配（实测 ~13ms/键）。
//  这里按"记录对象身份"用 WeakMap 缓存其小写检索字段：记录是只读、仅在源数据重载时重建，
//  故缓存随对象长存、跨键复用；记录数组被替换后随对象一起被 GC。
//  **缓存的内容与原内联计算逐字节相同** → queryLibrary / rankRecords 输出不变
//  （rankRecords 与 resolve-art-refs 的 AI 选材确定性路径共用，绝不能漂）。
interface SearchFields {
  readonly hay: string;
  readonly nameLc: string;
  readonly idLc: string;
  readonly tagsLc: readonly string[];
  readonly tagSet: ReadonlySet<string>;
  readonly semSet: ReadonlySet<string>;
}
const searchCache = new WeakMap<LibraryRecord, SearchFields>();
function searchFields(r: LibraryRecord): SearchFields {
  const hit = searchCache.get(r);
  if (hit) return hit;
  const tagsLc = r.tags.map((t) => t.toLowerCase());
  const fields: SearchFields = {
    nameLc: r.name.toLowerCase(),
    idLc: r.id.toLowerCase(),
    tagsLc,
    tagSet: new Set(tagsLc),
    semSet: new Set((r.semanticTags ?? []).map((t) => t.toLowerCase())),
    hay: [r.id, r.name, r.description, r.category, r.sourceLabel, r.style ?? '', ...r.tags].join(' ').toLowerCase(),
  };
  searchCache.set(r, fields);
  return fields;
}

// ── 相关度排序（单点实现：浏览器搜索 与 AI 选材解析 共用同一个排序器 → 所见即所选）──

export interface RankedRecord {
  readonly record: LibraryRecord;
  readonly score: number;
}

/**
 * 对记录按查询词打分排序（确定性：同输入同输出，可审计）。
 * 规则：每个词都必须命中（AND），单词得分取最强命中：
 *   名称全等 100 ＞ 名称前缀 60 ＞ 语义 tag 全等 50 ＞ 任意 tag 全等 40
 *   ＞ 名称子串 30 ＞ id 子串 15 ＞ tag 子串 10
 * 总分 = 各词得分和；同分按 id 字典序（稳定）。
 */
export function rankRecords(records: readonly LibraryRecord[], text: string): RankedRecord[] {
  const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const out: RankedRecord[] = [];
  for (const r of records) {
    const { nameLc: name, idLc: id, tagsLc: tags, tagSet, semSet } = searchFields(r);
    let score = 0;
    let allHit = true;
    for (const t of terms) {
      let s = 0;
      if (name === t) s = 100;
      else if (name.startsWith(t)) s = 60;
      if (s < 50 && semSet.has(t)) s = 50;
      if (s < 40 && tagSet.has(t)) s = 40;
      if (s < 30 && name.includes(t)) s = 30;
      if (s < 15 && id.includes(t)) s = 15;
      if (s < 10 && tags.some((x) => x.includes(t))) s = 10;
      if (s === 0) {
        allHit = false;
        break;
      }
      score += s;
    }
    if (allHit) out.push({ record: r, score });
  }
  out.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  return out;
}

export function queryLibrary(records: readonly LibraryRecord[], q: LibraryQuery): LibraryRecord[] {
  const text = (q.text ?? '').trim();
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  const sort = q.sort ?? 'name';
  // 相关度排序时，文本命中交给 rankRecords（评分语义比 haystack 子串更准）；其余维度照常过滤。
  const useRank = sort === 'relevance' && terms.length > 0;
  const out = records.filter((r) => {
    if (q.sources && !q.sources.includes(r.source)) return false;
    if (q.type && r.type !== q.type) return false;
    if (q.category && r.category !== q.category) return false;
    if (q.status && r.status !== q.status) return false;
    if (q.style && r.style !== q.style) return false;
    if (q.styleGroup) {
      const g = r.style?.startsWith('cartoon') ? 'cartoon' : r.style === 'pixel' ? 'pixel' : undefined;
      if (g !== q.styleGroup) return false;
    }
    if (q.tags && q.tags.length > 0) {
      const hay = haystack(r);
      if (!q.tags.every((t) => hay.includes(t.toLowerCase()))) return false;
    }
    if (!useRank && terms.length > 0) {
      const hay = haystack(r);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  if (useRank) return rankRecords(out, text).map((x) => x.record);
  out.sort((a, b) => {
    if (sort === 'size') return (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) || a.id.localeCompare(b.id);
    if (sort === 'variants') return (b.variants ?? 1) - (a.variants ?? 1) || a.id.localeCompare(b.id);
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return out;
}

/** 目录树计数：type → 总数；`type/category` → 数。 */
export function libraryCounts(records: readonly LibraryRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of records) {
    m.set(r.type, (m.get(r.type) ?? 0) + 1);
    const k = `${r.type}/${r.category}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
