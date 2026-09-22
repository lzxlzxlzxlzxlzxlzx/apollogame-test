#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/align-count.mjs —— 策划对齐单的**收敛判据**（自证循环的那个数字）
//
//  治的病：`docs/playbooks/self-check.md` 把自证循环定成「真渲染自玩 → 对齐单逐条打勾 → 修 → 再玩，
//  循环到 ❌ 清零」，但对齐单是**散文**，门只查「文件在不在 + 截图 ≥5 张」——**没有任何东西数得出
//  还剩几条**。于是「要不要再转一圈」只能由人肉判断，自证循环里的「自」就断在这里。
//
//  药：不新造格式（那会和存量对齐单打架），只把**已有的 markdown 表**当机读源——
//  找表头里叫「结论」的那一列，数它的 ✅/⚠/❌。样板 = docs/design/game108/self-check/S4-alignment.md。
//
//  列契约（唯一约定·新游戏适用）：
//    · 表头必须有一列叫「结论」；
//    · 该单元格的**首个非空白字符**必须是 ✅ / ⚠ / ❌ 之一；
//    · ⚠ 行必须写明**裁决去向**（报谁 / 单号）——没有去向的 ⚠ = 默降，self-check.md 明令禁止。
//
//  用法：
//    node scripts/align-count.mjs --game <slug> --stage S4     # 读 docs/design/<slug>/self-check/S4-alignment.md
//    node scripts/align-count.mjs <对齐单路径>
//    node scripts/align-count.mjs --game <slug> --stage S4 --json
//  退出码：0=已收敛（❌=0 且每条 ⚠ 有去向） · 1=未收敛 · 2=用法错/文件不存在
//
//  红线：本脚本**只数不改**——它不替你判「这条算不算对齐」，那是写单人的事。
//        它只回答「照你自己写的结论，还剩几条没完」。
// ═══════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ZEROCRAFT_ALIGN_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** ⚠ 行的「裁决去向」凭据：报给谁、或挂了哪张单。缺一即视为默降。 */
const VERDICT_MARKERS = [/报\s*(owner|Lead|主程|PUI|P3D)/, /裁/, /REQ-[A-Za-z0-9-]+/, /capgap/, /requests\.md/];

/** 对齐单路径（新游戏约定：docs/design/<slug>/self-check/<stage>-alignment.md）。 */
export const alignPath = (root, slug, stage) =>
  join(root, 'docs', 'design', slug, 'self-check', `${stage}-alignment.md`);

/** 拆一行 markdown 表格 → 单元格数组（去首尾竖线·不 trim 内容里的空格以外的东西）。 */
export function splitRow(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  return t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** 分隔行（|---|:--:|）不是数据行。 */
const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));

/** 单元格的结论符号：**首个非空白字符**必须是三者之一，否则不算一条对齐行。 */
export function verdictOf(cell) {
  const ch = (cell || '').trim().charAt(0);
  return ch === '✅' || ch === '⚠' || ch === '❌' ? ch : null;
}

/**
 * 扫全文所有 markdown 表：对每张表定位「结论」列，逐行取结论符号。
 * 多张表（屏与布局 / 交互反馈 / …）逐张累加——样板单就是分节多表的。
 */
export function parseAlignment(text) {
  const rows = [];
  let verdictCol = -1;
  for (const line of text.split('\n')) {
    const cells = splitRow(line);
    if (!cells) { verdictCol = -1; continue; }          // 出表 → 列定位失效
    if (isSeparator(cells)) continue;
    const headerAt = cells.findIndex((c) => c.includes('结论'));
    if (headerAt >= 0 && verdictCol === -1) { verdictCol = headerAt; continue; }
    if (verdictCol === -1 || verdictCol >= cells.length) continue;
    const v = verdictOf(cells[verdictCol]);
    if (!v) continue;                                    // 非对齐行（续行/说明行）静默跳过
    rows.push({ verdict: v, text: cells.join(' | ') });
  }
  return rows;
}

/** 收敛判定：❌ 归零，且每条 ⚠ 带裁决去向。 */
export function evaluate(rows) {
  const ok = rows.filter((r) => r.verdict === '✅').length;
  const warn = rows.filter((r) => r.verdict === '⚠');
  const bad = rows.filter((r) => r.verdict === '❌');
  const orphanWarn = warn.filter((r) => !VERDICT_MARKERS.some((re) => re.test(r.text)));
  return {
    total: rows.length, ok, warn: warn.length, bad: bad.length,
    orphanWarn: orphanWarn.length,
    converged: rows.length > 0 && bad.length === 0 && orphanWarn.length === 0,
    badRows: bad.map((r) => r.text), orphanRows: orphanWarn.map((r) => r.text),
  };
}

function main(argv) {
  const json = argv.includes('--json');
  const gi = argv.indexOf('--game'), si = argv.indexOf('--stage');
  let file;
  if (gi >= 0 && si >= 0) file = alignPath(ROOT, argv[gi + 1], argv[si + 1]);
  else file = argv.find((a) => !a.startsWith('--') && a.endsWith('.md'));
  if (!file) {
    console.error('用法：node scripts/align-count.mjs --game <slug> --stage S4 [--json]  或  <对齐单路径>');
    return 2;
  }
  if (!existsSync(file)) {
    console.error(`对齐单不在档：${file}\n  自证仪式见 docs/playbooks/self-check.md——先真渲染自玩、出单，再来数。`);
    return 2;
  }
  const r = evaluate(parseAlignment(readFileSync(file, 'utf8')));
  if (json) { console.log(JSON.stringify({ file, ...r }, null, 2)); return r.converged ? 0 : 1; }

  console.log(`对齐单 ${file}`);
  console.log(`  ✅ ${r.ok}   ⚠ ${r.warn}（其中 ${r.orphanWarn} 条没写裁决去向）   ❌ ${r.bad}   共 ${r.total} 条`);
  if (r.total === 0) { console.error('  ✗ 一条对齐行都没数到——表头是否有「结论」列？结论格首字符是否为 ✅/⚠/❌？'); return 1; }
  for (const t of r.badRows) console.log(`  ❌ ${t}`);
  for (const t of r.orphanRows) console.log(`  ⚠ 无裁决去向（= 默降·self-check.md 明令禁止）：${t}`);
  console.log(r.converged
    ? '  ✓ 已收敛：❌ 归零，每条 ⚠ 都有去向 → 可送复查门。'
    : '  ✗ 未收敛：回去再转一圈（修 ❌ / 给 ⚠ 补裁决去向 → /ask-owner 攒批问）。');
  return r.converged ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
