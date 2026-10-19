import type { WorldBlueprint } from './demo.assembly.js';
import { buildCapabilityIndex, loadCapabilities, type CapabilityIndex, type CapabilityLoader } from './capability-index.js';
import { CAPABILITY_LOADERS } from './capability-registry.gen.js';
import { prepareManifest, finishManifest, type ParseOptions, type ParseResult } from './manifest-core.js';

// ═══════════════════════════════════════════════════════════════
//  Manifest 加载器（异步门面）—— 懒注册表路径（P2e · D10）。
//  只 import 元数据 + `() => import()` 表，manifest 用到哪些能力就装哪些；打包时
//  vite.config.cartridge.ts 把注册表换成 manifest 子集 → rollup 只打进这些能力的代码
//  （10 能力的弹球卡带：外壳 JS 从 ~317 KB 降到 <120 KB·grep matrix-duel 零命中）。
//  校验逻辑与同步门面 manifest.ts 共用 manifest-core → 在线能跑 = 打包能跑。
// ═══════════════════════════════════════════════════════════════

const indexCache = new WeakMap<readonly CapabilityLoader[], CapabilityIndex>();
function indexOf(loaders: readonly CapabilityLoader[]): CapabilityIndex {
  let idx = indexCache.get(loaders);
  if (!idx) { idx = buildCapabilityIndex(loaders); indexCache.set(loaders, idx); }
  return idx;
}

/** 校验 + 按需装载能力 → 可运行 WorldBlueprint（带推断/告警信息）。loaders 可注入（测试/子集）。 */
export async function parseManifestDetailedAsync(raw: unknown, opts: ParseOptions = {}, loaders: readonly CapabilityLoader[] = CAPABILITY_LOADERS): Promise<ParseResult> {
  const prep = prepareManifest(raw, indexOf(loaders));
  const caps = await loadCapabilities(prep.capIds, loaders);
  return finishManifest(prep, caps, opts);
}

/** 便捷版：只取可运行蓝图。 */
export async function parseManifestAsync(raw: unknown, opts?: ParseOptions, loaders?: readonly CapabilityLoader[]): Promise<WorldBlueprint> {
  return (await parseManifestDetailedAsync(raw, opts, loaders)).blueprint;
}
