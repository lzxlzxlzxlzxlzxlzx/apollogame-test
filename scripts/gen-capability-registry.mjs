#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/gen-capability-registry.mjs —— 生成懒能力注册表 src/assembly/capability-registry.gen.ts
//  （P2e · engine-architecture-review-2026-09-02 §5 P2e · D10）
//
//  用法：npx vite-node scripts/gen-capability-registry.mjs [--check]
//        --check：只比对不落盘，生成物与仓内文件不一致 → 退出码 1（门禁/CI 用）
//
//  做什么：扫 src/skills/**/*.ts（排除 *.test.ts 与四个 tier 桶文件），真 import 每个模块，
//  鸭子判定出 defineCapability 导出（同 registry-guard.test 的判定），得到 id → { 模块路径, 导出名,
//  provides 组件表 }；按静态注册表 ALL_CAPABILITIES 的**登记序**排好（迁移期顺序冻结=零行为变化），
//  写成一行一条的 `{ id, provides, load: () => import('…').then((m) => m.xxx) }`。
//
//  为什么要生成而不是手写：手写的是静态注册表（那张表继续存在·同步路径与工具用它）；
//  懒注册表要的是「每条一个 import() 表达式」——rollup 只有看见字面 import() 才能按子集摇树
//  （vite.config.cartridge.ts 的子集插件按行过滤本文件·行式契约见文件头）。
//
//  TS 执行：经 vite-node 跑（同 manifest-check.mjs），裸 node 跑不了。
// ═══════════════════════════════════════════════════════════════

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { ALL_CAPABILITIES } from '../src/assembly/capability-registry.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(ROOT, 'src', 'skills');
const OUT = join(ROOT, 'src', 'assembly', 'capability-registry.gen.ts');
// 桶文件只做再导出——同一能力会在桶与本体两处出现；排除桶，让每条 import() 指向本体模块（子集摇树才有意义）。
const BARRELS = new Set(['atoms/index.ts', 'tier1/index.ts', 'tier2/index.ts', 'tier3/index.ts', 'tier4/index.ts']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function isCapability(v) {
  return typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.version === 'string'
    && typeof v.describe === 'object' && v.describe !== null && typeof v.components === 'object' && v.components !== null
    && Array.isArray(v.systems);
}

/** src/skills 下相对路径 → 仓内别名 import 说明符（atoms 走 @atom-skills·其余 @skills·.ts→.js）。 */
export function specifierFor(relSkillsPath) {
  const posix = relSkillsPath.split(sep).join('/').replace(/\.ts$/, '.js');
  return posix.startsWith('atoms/') ? `@atom-skills/${posix.slice('atoms/'.length)}` : `@skills/${posix}`;
}

export async function discover() {
  const found = new Map(); // id → { rel, exportName, provides }
  for (const file of walk(SKILLS)) {
    const rel = relative(SKILLS, file);
    if (BARRELS.has(rel.split(sep).join('/'))) continue;
    const mod = await import(pathToFileURL(file).href);
    for (const [exportName, val] of Object.entries(mod)) {
      if (!isCapability(val)) continue;
      const prev = found.get(val.id);
      // 同一 id 出现在多处（本体 + 非桶再导出）：取路径更深者=本体（atoms/<n>/index.ts 深于 atoms/index.ts）。
      if (prev && prev.rel.split(sep).length >= rel.split(sep).length) continue;
      found.set(val.id, { rel, exportName, provides: Object.keys(val.components?.provides ?? {}) });
    }
  }
  return found;
}

export function render(found) {
  const lines = [];
  const missing = [];
  for (const cap of ALL_CAPABILITIES) {
    const e = found.get(cap.id);
    if (!e) { missing.push(cap.id); continue; }
    lines.push(`  { id: '${cap.id}', provides: [${e.provides.map((p) => `'${p}'`).join(', ')}], load: () => import('${specifierFor(e.rel)}').then((m) => m.${e.exportName}) },`);
  }
  if (missing.length) throw new Error(`ALL_CAPABILITIES 里有 id 在 src/skills 扫不到本体模块：${missing.join(', ')}`);
  const extra = [...found.keys()].filter((id) => !ALL_CAPABILITIES.some((c) => c.id === id));
  if (extra.length) throw new Error(`src/skills 有 defineCapability 未登记进 ALL_CAPABILITIES：${extra.join(', ')}（先登记再生成）`);
  return [
    '// 生成文件 · 勿手改 —— npx vite-node scripts/gen-capability-registry.mjs（P2e 懒能力注册表）',
    '// 行式契约：每个能力恰占一行 `  { id: \'…\', provides: […], load: () => import(\'…\').then((m) => m.xxx) },`',
    '// ——vite.config.cartridge.ts 的子集插件按行过滤本文件、只留 manifest 用到的能力，rollup 据此摇树。',
    '// 顺序 = 静态注册表 ALL_CAPABILITIES 登记序（迁移期冻结·capability-registry.gen.test 对拍）。',
    "import type { CapabilityLoader } from './capability-index.js';",
    '',
    'export const CAPABILITY_LOADERS: readonly CapabilityLoader[] = [',
    ...lines,
    '];',
    '',
  ].join('\n');
}

async function main(argv) {
  const check = argv.includes('--check');
  const src = render(await discover());
  const cur = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return null; } })();
  if (check) {
    if (cur === src) { process.stdout.write(`[gen-capability-registry] 同步（${ALL_CAPABILITIES.length} 条）\n`); return; }
    process.stderr.write('[gen-capability-registry] capability-registry.gen.ts 过期：请跑 npx vite-node scripts/gen-capability-registry.mjs 重生成并提交\n');
    process.exit(1);
  }
  if (cur === src) { process.stdout.write(`[gen-capability-registry] 无变化（${ALL_CAPABILITIES.length} 条）\n`); return; }
  writeFileSync(OUT, src, 'utf8');
  process.stdout.write(`[gen-capability-registry] 写入 ${relative(ROOT, OUT)}（${ALL_CAPABILITIES.length} 条）\n`);
}

// vite-node 把脚本路径从 argv 里剥掉、import.meta.url 也对不上——同 manifest-check.mjs：本文件只作 CLI，直接跑 main。
main(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`[gen-capability-registry] 失败：${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
