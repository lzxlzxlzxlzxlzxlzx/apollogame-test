// 游戏本地美术索引装载（render-only · 失败静默回退）——REQ-SHELL-公共壳三件 ②。
//
// 当时六家宿主逐字重复的那段「拉 /games/<slug>/art/index.json」在此收编（game-q.ts:117-125 一家已随
// REQ-RETRO 引擎大扫除 2026-08-03 删除，仅留出处）：
//   game-103.ts:189-197 · game102.ts:73-80 · game102/voxel-proto.ts:276
//   （以上=注册进 AssetManager 形态）· game-a/art-overrides.ts:39-57 · game-c/art-overrides.ts:77-95
//   （以上=skinKey→URL 覆盖表形态·两份近逐字）· game-c/art-overrides.ts:54-64（loadSkinIndex）。
// 两形态同源一条链，故一件两出口：
//   ① `loadGameArtInto(manager, slug)` —— 注册进 AssetManager 并 loadAll（渲染器按 **key** 取图）。
//   ② `loadGameArtOverrides(slug)`     —— 返回 { skinKey: url } 覆盖表（DOM/UI 侧按 **URL** 消费）。
//
// 共识铁律（各家原注释一致·此处成为唯一真相）：
//   · **失败静默回退**——无索引 / 非 200 / 解析失败 / headless 无 fetch，一律不抛，退回程序化观感。
//     美术是**增量不是依赖**：真图未到 = 观感零字节变化。
//   · 索引里的 path 已是站点绝对路径（`/games/<g>/art/...`）→ `registerAssetIndex` 的 baseUrl 传 ''。
//   · 覆盖表只收**真图替换**条目：id 以 `<slug>/` 开头（art-replace 写回的 skinKey 别名命名空间）
//     且带正向信号（top-level `source` 以 `gen:`/`vendored` 开头，或 tags 含 'skin'）——原生货架/
//     程序化占位不进，免得空槽盖掉手绘。
// render-only：不进 sim/hash，蓝图/确定性零影响。
import { AssetManager } from './asset-manager.js';
import { ImageAssetLoader } from './image-loader.js';
import { parseAssetIndex, registerAssetIndex } from './asset-index.js';

/** 本游戏美术索引的站点绝对 URL（单一真相·别在游戏层再拼一次）。 */
export function gameArtIndexUrl(slug: string): string {
  return `/games/${slug}/art/index.json`;
}

export interface GameArtLoadOptions {
  /** fetch 缓存策略（默认 'no-store'：工坊换图后刷新即见新图）。 */
  cache?: RequestCache;
  /** 只等待这些已登记资产加载；省略时保持原有的全量加载行为。 */
  onlyKeys?: readonly string[];
}

/**
 * 拉本游戏美术索引原文；无 fetch（headless）/ 非 200 / 网络或解析异常 → null（**绝不抛**）。
 * 内部件——两个出口共用这一条链。
 */
async function fetchArtIndex(slug: string, opts?: GameArtLoadOptions): Promise<unknown | null> {
  try {
    if (typeof fetch !== 'function') return null; // node/测试环境：无美术目录=回退程序化
    const r = await fetch(gameArtIndexUrl(slug), { cache: opts?.cache ?? 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * 形态①：把本游戏美术索引注册进 AssetManager 并 loadAll（渲染器/Material3D 按 **key** 解析真图）。
 * 返回是否真装上了（无索引/失败=false·调用方通常不必看——回退路径已由渲染器的占位模式兜住）。
 */
export async function loadGameArtInto(
  manager: AssetManager,
  slug: string,
  opts?: GameArtLoadOptions,
): Promise<boolean> {
  const raw = await fetchArtIndex(slug, opts);
  if (raw === null) return false;
  try {
    registerAssetIndex(manager, parseAssetIndex(raw)); // path 已是站点绝对路径 → baseUrl ''
    if (opts?.onlyKeys === undefined) await manager.loadAll();
    else await Promise.all([...new Set(opts.onlyKeys)].map((key) => manager.load(key)));
    return true;
  } catch {
    return false; // 索引 schema 不合法 / 图加载失败 → 回退程序化观感·不炸游戏
  }
}

/**
 * 形态②：拉索引 → **真图替换**覆盖表 `{ skinKey: url }`（消费点 `overrides[key] ?? 内置回退`）。
 * 失败/无索引/无真图 = 空对象（消费点全回退 = 观感零变化）。
 */
export async function loadGameArtOverrides(
  slug: string,
  opts?: GameArtLoadOptions,
): Promise<Record<string, string>> {
  const raw = await fetchArtIndex(slug, { cache: opts?.cache ?? 'no-cache' });
  return raw === null ? {} : pickArtOverrides(raw, slug);
}

/**
 * 纯函数：从任意索引原文挑出真图替换条目（判据见文件头·不合法输入一律得空表·绝不抛）。
 * 导出供契约测试与离线场景（已有索引对象在手时免去一次 fetch）。
 */
export function pickArtOverrides(raw: unknown, slug: string): Record<string, string> {
  const out: Record<string, string> = {};
  const assets = (raw as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) return out;
  const prefix = `${slug}/`;
  for (const a of assets as Array<Record<string, unknown>>) {
    if (!a || typeof a.id !== 'string' || typeof a.path !== 'string' || !a.path) continue;
    if (!a.id.startsWith(prefix)) continue; // 只收 skinKey 别名命名空间
    const source = typeof a.source === 'string' ? a.source : '';
    const isReal =
      source.startsWith('gen:') || source.startsWith('vendored') ||
      (Array.isArray(a.tags) && a.tags.includes('skin')); // 正向信号：art-replace 写回·非程序占位
    if (isReal) out[a.id] = a.path;
  }
  return out;
}

/** 便捷：建一个空的图片资产管理器（游戏 mount 期建·传给渲染器·随后 `loadGameArtInto` 异步填充）。 */
export function createArtAssets(): AssetManager {
  return new AssetManager(new ImageAssetLoader());
}
