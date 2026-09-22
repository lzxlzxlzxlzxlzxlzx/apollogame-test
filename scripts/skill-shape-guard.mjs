#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  skill-shape-guard —— 能力「形状」棘轮（owner 2026-09-05 令：避免超大 skill·底层要沉淀）
//
//  病（实测·非估算）：102 件能力代码行**中位数 74**，而最大的三件是 654 / 647 / 581 ——
//  8.8×，前 5 件吃掉 27.5% 的能力代码。同时 `src/engine/logic`（自称"唯一的一份 compare /
//  寻址 / clamp"）**79 件能力里只有 1 件真接了它**，24 件在内联重造。
//  两件事其实是同一件：**算法赖在能力壳里不肯下沉**，壳就越长越胖，底层就越沉淀不出东西。
//
//  本门不追求"把能力合并掉"——能力 id 是数据词表的公共面（manifest / LLM catalog / 存档都引
//  用它），合并 = 破坏性变更。本门只管**形状**，一条激励：**算法进纯函数核，能力只留接线壳**。
//  这条路仓里已经跑通过三次（`t3-hand-pattern` 389 行 0 system · `t2-behavior-tree` 215 行
//  0 system · `orca.ts` 336 行非 capability），门只是把它从"个别人的好习惯"变成"全库的默认"。
//
//  三轴（都只看**能力壳**，纯函数核不受限——那正是我们要它去的地方）：
//    ① 壳代码行 > 250     壳里塞了算法（中位数 74 的 3.4×）
//    ② 组件字段总数 > 20  数据面超大：作者要填的表太长，最弱 LLM 填不动（宣言尺子）
//    ③ 内联重造底层        `@engine/logic` 已提供 compare/寻址/clamp/countByTag 却自己又写一遍
//
//  棘轮（同 slow-lane-guard / art-ledger-guard 口径）：
//    · 超标 且 不在基线 → 硬 FAIL（**新的超大 skill 长出来了**，当场拦）
//    · 超标 且 在基线   → WARN 放行（存量在案·响亮不静默）
//    · 达标 且 在基线   → 硬 FAIL「降基线仪式」（同提交删条目·棘轮只紧不松）
//  用法：node scripts/skill-shape-guard.mjs [--json]
// ═══════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_SHELL_LINES = 250;
export const MAX_FIELDS = 20;

/** 底层已提供、不该在能力里再写一遍的四种形状（探针 → `@engine/logic` 里的对应件）。 */
export const SEDIMENTED = [
  { probe: /getComponent<Resource>|queryEntities\('Resource'\)/, use: 'resolveResource' },
  { probe: /getComponent<Flag>|getComponent<State>/, use: 'resolveFlag / resolveState' },
  { probe: /Math\.max\([^)]*Math\.min|Math\.min\([^)]*Math\.max|function clamp/, use: 'applyWrite（内含唯一的一份 clamp）' },
  { probe: /flags\s*&\s*\w*[Mm]ask|&\s*tagMask/, use: 'countByTag' },
];

/** 扫 src/skills/** 的能力文件，量出形状。纯函数核（无 defineCapability）不计入。 */
export function scanSkills(root = ROOT) {
  const out = [];
  for (const tier of ['atoms', 'tier1', 'tier2', 'tier3']) {
    const dir = join(root, 'src/skills', tier);
    let names = [];
    try { names = readdirSync(dir); } catch { continue; }
    for (const f of names) {
      if (!f.endsWith('.ts') || f.includes('.test.') || f === 'index.ts') continue;
      const path = join(dir, f);
      const src = readFileSync(path, 'utf8');
      // ⚠ 认**真调用**不认字面：`flow-field-core.ts` 的文件头注释里写着"零 defineCapability"，
      // 用 includes 会把核自己算成壳（写这条测试时当场踩到）。
      if (!/defineCapability\s*\(/.test(src)) continue;   // 纯函数核不受形状约束
      const systems = (src.match(/\bid:\s*'[a-z0-9-]+',\s*\n\s*(?:\/\/[^\n]*\n\s*)*(?:runsAfter|runsBefore|reads)/g) || []).length;
      const code = src.split('\n').filter((l) => {
        const t = l.trim();
        return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      }).length;
      const fields = (src.match(/type:\s*'(?:number|string|boolean|EntityId|string\[\]|number\[\]|assetKey)'/g) || []).length;
      const hasSystem = /systems:\s*\[\s*\{/.test(src);
      const adopted = /@engine\/logic/.test(src);
      const inlined = adopted ? [] : SEDIMENTED.filter((s) => s.probe.test(src)).map((s) => s.use);
      out.push({ file: relative(root, path), code, fields, systems, hasSystem, adopted, inlined });
    }
  }
  return out.sort((a, b) => b.code - a.code);
}

/** 判定：返回 {file, why[]}。只有**带系统的能力壳**受行数约束（无系统的是词表条目，不是壳）。 */
export function violations(rows) {
  const out = [];
  for (const r of rows) {
    const why = [];
    if (r.hasSystem && r.code > MAX_SHELL_LINES) why.push(`壳 ${r.code} 行 > ${MAX_SHELL_LINES}（把算法搬进纯函数核）`);
    if (r.fields > MAX_FIELDS) why.push(`组件字段 ${r.fields} > ${MAX_FIELDS}（数据面超大·拆组件或降配置面）`);
    if (why.length) out.push({ file: r.file, why });
  }
  return out;
}

function main() {
  const rows = scanSkills();
  const base = JSON.parse(readFileSync(join(ROOT, 'scripts/skill-shape-baseline.json'), 'utf8'));
  const known = new Map((base.oversized || []).map((e) => [e.file, e]));
  const bad = violations(rows);
  const badFiles = new Set(bad.map((b) => b.file));

  console.log('══ 能力形状体检（壳行数 / 字段面 / 底层回收）══\n');
  console.log(`  能力壳 ${rows.length} 件 · 中位壳 ${rows[Math.floor(rows.length / 2)].code} 行 · 最大 ${rows[0].code} 行（${rows[0].file}）`);
  const inl = rows.filter((r) => r.inlined.length);
  console.log(`  已接 @engine/logic：${rows.filter((r) => r.adopted).length} 件 · **内联重造**：${inl.length} 件\n`);

  let fail = 0;
  const fresh = bad.filter((b) => !known.has(b.file));
  const stale = [...known.keys()].filter((f) => !badFiles.has(f));
  for (const b of bad) {
    const on = known.has(b.file);
    console.log(`  ${on ? '🟡 在案' : '🔴 新增'} ${b.file}`);
    for (const w of b.why) console.log(`       · ${w}`);
    if (!on) fail++;
  }
  if (stale.length) {
    console.log('\n  🔴 降基线仪式：以下条目已达标，必须同提交从 skill-shape-baseline.json 删掉（棘轮只紧不松）');
    for (const f of stale) console.log(`       · ${f}`);
    fail += stale.length;
  }
  // 回收面只报不拦（存量 24 件·硬拦会把无关改动全打红）；数量棘轮由点名测试守。
  if (inl.length) {
    console.log(`\n  🟡 底层回收清单（内联重造 \`@engine/logic\` 已提供的件·改到这些文件时顺手收编）：`);
    for (const r of inl.slice(0, 8)) console.log(`       · ${r.file} → 改用 ${r.inlined.join(' / ')}`);
    if (inl.length > 8) console.log(`       · …还有 ${inl.length - 8} 件`);
  }
  console.log(`\nSKILL-SHAPE: ${fail === 0 ? (bad.length ? 'WARN（存量在案·无新增）' : 'PASS') : 'FAIL'}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
