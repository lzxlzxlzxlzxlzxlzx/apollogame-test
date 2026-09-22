#!/usr/bin/env node
// scripts/dump-capability-catalog.mjs —— 把引擎能力目录打到 stdout。
// = 前端生成请求里送给 zerocraft.py 的那份 catalog 的服务端 parity。
//
// ⚠ **两阶段检索**（独立审查 2026-09-12 打回）：全量目录实测 **95,829 字符 / 111 件**，
// 整份塞进生成请求会吃光弱模型的上下文，而绝大多数请求只用得上其中十来件。
// 首版虽然在文档里写了 `--names`，**脚本压根没处理 argv**——加不加参数输出一模一样（实测逐字节同）。
// 现在真做成两阶段：
//   ① `--names`  只出「id · 一句话摘要」的索引（让模型先挑）
//   ② `--only a,b,c` 只出点名那几件的完整 schema/示例（挑完再要细节）
// 不带参数仍是全量（零回归：既有调用方 studio-lowmodel-smoke.py 等一个字不用改）。
//
// 用法：
//   npx vite-node scripts/dump-capability-catalog.mjs                 # 全量（默认·同旧行为）
//   npx vite-node scripts/dump-capability-catalog.mjs --names         # 只要索引
//   npx vite-node scripts/dump-capability-catalog.mjs --only t2-steering,t3-aggro
//   npx vite-node scripts/dump-capability-catalog.mjs --stats         # 只报体量（排障用）
import { buildCapabilityCatalog, buildCapabilityIndex } from '../src/assembly/capability-catalog.ts';
import { ALL_CAPABILITIES } from '../src/assembly/capability-registry.ts';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  if (i < 0) return null;
  const inline = argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : null;
  return inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null);
};

/** ① 索引面：id + 一句话摘要。**实现在 `capability-catalog.ts`**（第二轮打回：同一判据只许有一份，
 *  否则命令行省了上下文、产品路径照旧全量——那次就是这么漏的）。此处保留同名导出给既有调用方。 */
export const namesCatalog = buildCapabilityIndex;

const onlyRaw = valueOf('--only');
let caps = ALL_CAPABILITIES;
if (onlyRaw) {
  const want = new Set(onlyRaw.split(',').map((s) => s.trim()).filter(Boolean));
  caps = ALL_CAPABILITIES.filter((c) => want.has(c.id));
  const missing = [...want].filter((id) => !ALL_CAPABILITIES.some((c) => c.id === id));
  // 点名了不存在的能力 = 调用方（多半是模型）编了一个 id —— **必须喊，不许静默少给一件**。
  if (missing.length) process.stderr.write(`[catalog] ⚠ 这些 id 不存在（编造？）：${missing.join(', ')}\n`);
}

const out = has('--names') ? namesCatalog(caps) : buildCapabilityCatalog(caps);
if (has('--stats')) {
  const full = buildCapabilityCatalog(ALL_CAPABILITIES);
  const names = namesCatalog(ALL_CAPABILITIES);
  process.stdout.write(
    `能力件数 ${ALL_CAPABILITIES.length}\n全量目录 ${full.length} 字符\n索引面   ${names.length} 字符`
    + `（省 ${(100 - (names.length / full.length) * 100).toFixed(1)}%）\n本次输出 ${out.length} 字符\n`);
} else {
  process.stdout.write(out);
}
