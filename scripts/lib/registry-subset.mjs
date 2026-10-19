// ═══════════════════════════════════════════════════════════════
//  scripts/lib/registry-subset.mjs —— 懒能力注册表按子集裁剪（P2e · D10）
//
//  src/assembly/capability-registry.gen.ts 是行式契约（生成器写死·每能力恰一行 `{ id: '…', … }`）。
//  打包某张 manifest 时只留它点名的能力行，其余行删掉 → 模块里只剩子集的 `import()` 表达式，
//  rollup（单文件模式 inlineDynamicImports）只把这些模块打进包；没被点名的能力连引用都不存在。
//  纯字符串变换·零依赖·供 vite.config.cartridge.ts 插件与单测共用。
// ═══════════════════════════════════════════════════════════════

const ENTRY_RE = /^\s*\{ id: '([^']+)',/;

/** 注册表源码里全部能力 id（登记序）。 */
export function registryIds(src) {
  const ids = [];
  for (const line of src.split('\n')) {
    const m = ENTRY_RE.exec(line);
    if (m) ids.push(m[1]);
  }
  return ids;
}

/**
 * 只留 keep 里的能力行。keep 含未登记 id → 抛（打包期早失败·比运行期「此外壳没打这个能力」强）。
 * 返回 { src, kept }（kept = 实际保留的 id·登记序）。
 */
export function filterRegistrySource(src, keep) {
  const want = new Set(keep);
  const known = new Set(registryIds(src));
  const unknown = [...want].filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`注册表子集：未登记的 capability id ${unknown.join(', ')}（先登记进 ALL_CAPABILITIES 并重生成 gen 文件）`);
  const kept = [];
  const out = [];
  for (const line of src.split('\n')) {
    const m = ENTRY_RE.exec(line);
    if (m) {
      if (!want.has(m[1])) continue;
      kept.push(m[1]);
    }
    out.push(line);
  }
  return { src: out.join('\n'), kept };
}

/** 环境变量 VITE_CART_CAPABILITIES（逗号分隔）→ id 数组；未设 → null（= 不裁剪）。 */
export function subsetFromEnv(env = process.env) {
  const v = env.VITE_CART_CAPABILITIES;
  if (v === undefined) return null;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}
