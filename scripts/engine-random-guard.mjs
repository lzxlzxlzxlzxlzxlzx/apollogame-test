#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  引擎面禁裸 Math.random 静态守卫（REQ-GUARDGATE ① · 2026-08-16）
//
//  病（深审 A1 探针2 实证·docs/design/engine-deep-review-2026-08.md）：
//  往 matrix-duel 结算插 Math.random()——game-skill-audit 只扫 games/、
//  门禁无引擎层随机扫描步，被咬全靠碰巧存在的精确数值断言。本守卫补上。
//
//  准则：引擎 sim 面只许种子 PRNG（atoms/random · RandomSeed）——
//  裸 Math.random 破 lockstep / 录放 / 快照 hash（CLAUDE.md 确定性红线）。
//
//  扫描面：src/{engine,skills,assembly,net,services} 的非测试源文件
//  （*.test.* 的三禁归 scripts/test-hygiene-check.mjs 管，此处不重叠）。
//
//  用法：node scripts/engine-random-guard.mjs
//  收口（照 test-hygiene-check 风格）：末行判词 `ENGINE-RANDOM: PASS|WARNINGS|FAIL`；
//  退出码 硬违规=1、其余=0。
//    FAIL     = 有「未白名单」的裸 Math.random（新引入的违规）。
//    WARNINGS = 只剩白名单放行的有意例外——surfaced 供周期复审。
//    PASS     = 零命中。
// ═══════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 扫描面（引擎面五目录·与 REQ-GUARDGATE spec 一字不差）────────────
export const SCAN_ROOTS = ['src/engine', 'src/skills', 'src/assembly', 'src/net', 'src/services'];

// ── 白名单（有意的合法例外·注明理由·命中→WARNINGS 不阻断）───────────
// 每条 = { file: 路径子串, reason: 为何放行 }。加条目须附实查理由（禁凭印象）。
export const WHITELIST = [
  {
    file: 'src/skills/atoms/random/',
    reason: '种子 PRNG 的法定实现点（REQ-GUARDGATE spec 点名）。现实现为纯 mulberry32 步进、' +
      '零 Math.random 命中——本条为实现文件保留的法定席位，防未来实现细节被误咬。',
  },
  {
    file: 'src/net/mp-client.ts',
    reason: 'lockstep demo 的浏览器 IO 壳造每标签页唯一 peerId（实查 2026-08-16）：诉求是「同代码' +
      '同起点的各标签页互相不同」，与种子 PRNG 的「同种子必同序列」正好相反——用种子 PRNG 必撞号。' +
      'id 只作信道身份，经消息流对齐进各端（人人看到同一输入流），不进 sim 内生随机、不破 lockstep 确定性。',
  },
];

// ── 规则 ────────────────────────────────────────────────────────
const PATTERN = /\bMath\.random\s*\(/;

/** 非测试源文件才扫（*.test.* 归 test-hygiene-check；.d.ts 无执行体也扫不亏，一并收）。 */
export function isScannable(file) {
  return /\.(ts|tsx|js|mjs)$/.test(file) && !/\.test\./.test(file);
}

/** 该行的匹配是否落在 `//` 行注释里（排除「绝不 Math.random」这类解释文字误报）。 */
function inLineComment(line, matchIdx) {
  const c = line.indexOf('//');
  return c !== -1 && c < matchIdx;
}

/** 纯文本扫描（可单测）：源文本 → 命中 [{ line, code }]。 */
export function scanText(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PATTERN);
    if (!m) continue;
    if (inLineComment(lines[i], m.index ?? 0)) continue;
    hits.push({ line: i + 1, code: lines[i].trim().slice(0, 120) });
  }
  return hits;
}

export function isWhitelisted(file) {
  const norm = file.replace(/\\/g, '/');
  return WHITELIST.find((w) => norm.includes(w.file));
}

/** 递归收集一个根下的可扫源文件（根不存在 → 空列表，不炸）。 */
export function collectSources(root, out = []) {
  let entries;
  try { entries = readdirSync(root); } catch { return out; }
  for (const name of entries) {
    const p = join(root, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      collectSources(p, out);
    } else if (isScannable(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 全量扫描（可单测·roots 可注入）：→ { files, hard, waived }。 */
export function runScan(roots = SCAN_ROOTS) {
  const files = roots.flatMap((r) => collectSources(r)).sort();
  const hard = [];
  const waived = [];
  for (const file of files) {
    for (const hit of scanText(readFileSync(file, 'utf8'))) {
      const w = isWhitelisted(file);
      if (w) waived.push({ file, ...hit, reason: w.reason });
      else hard.push({ file, ...hit });
    }
  }
  return { files, hard, waived };
}

function main() {
  const { files, hard, waived } = runScan();
  console.log('\n══ 引擎面禁裸 Math.random（sim 只许种子 PRNG·REQ-GUARDGATE ①）══\n');
  console.log(`扫描 ${files.length} 个非测试源文件（${SCAN_ROOTS.join(', ')}）`);

  if (hard.length) {
    console.log(`\n🔴 硬违规 ${hard.length} 处（未白名单 → 改用 atoms/random 种子 PRNG，或实查后白名单附理由）：`);
    for (const h of hard) console.log(`  ${h.file}:${h.line}  ${h.code}`);
  } else {
    console.log('\n🔴 硬违规: 无');
  }

  if (waived.length) {
    console.log(`\n🟡 白名单放行 ${waived.length} 处（有意例外·供周期复审）：`);
    for (const w of waived) console.log(`  ${w.file}:${w.line}\n      理由: ${w.reason}`);
  }

  const verdict = hard.length ? 'FAIL' : waived.length ? 'WARNINGS' : 'PASS';
  console.log(`\nENGINE-RANDOM: ${verdict}`);
  process.exit(hard.length ? 1 : 0);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
