import type { WorldBlueprint } from './demo.assembly.js';
import { CAPABILITY_INDEX, resolveCapabilities } from './capability-registry.js';
import { prepareManifest, finishManifest, type ParseOptions, type ParseResult } from './manifest-core.js';

// ═══════════════════════════════════════════════════════════════
//  Manifest 加载器（同步门面）—— 静态注册表路径：创作台 / 落盘门 / 脚本 / 测试用。
//  校验逻辑全部在 manifest-core.ts；这里只把 id 列表换成能力对象（同步·全部能力已 import）。
//  卡带外壳走 manifest-async.ts（懒注册表·按子集摇树），两条路共用同一份 core → 零口径漂移。
// ═══════════════════════════════════════════════════════════════

export * from './manifest-core.js';

/** 校验 + 加载规范 manifest → 可运行 WorldBlueprint（带推断/告警信息）。 */
export function parseManifestDetailed(raw: unknown, opts: ParseOptions = {}): ParseResult {
  const prep = prepareManifest(raw, CAPABILITY_INDEX);
  return finishManifest(prep, resolveCapabilities(prep.capIds), opts);
}

/** 便捷版：只取可运行蓝图。 */
export function parseManifest(raw: unknown, opts?: ParseOptions): WorldBlueprint {
  return parseManifestDetailed(raw, opts).blueprint;
}
