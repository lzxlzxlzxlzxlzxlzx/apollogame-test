#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/context-budget-guard.mjs —— 上下文预算守卫（REQ-CTX·owner 2026-07-15 批①②）
//
//  owner 担忧：信息量越来越大，新 session 的上下文读不完 → 偏离。实测（2026-07-15）：
//  T0 必读集健康（~2 万字符），真炸弹=requests.md 曾胖到 23 万字符（done 回执不归档）。
//  本守卫把「读得完」变成机器保证的预算：
//    · 需求池 requests.md ≤ 封顶（超=红·逼「done 全文进 archive·池只留活跃」的归档纪律）
//    · T0 必读集（CLAUDE.md/宪法/llm-onboarding）各自封顶（想变厚=显式改基线·diff 可见）
//    · 每本线手册行数上限（原为君子约定·从此机器卡·**上限值以 baseline 的 playbookMaxLines 为准，
//      别在文案里手抄数字**）+ ≤字符封顶（行数不捕捉密度·REQ-RETRO 2026-08-03 补）。
//      owner 2026-08-07 放宽 80 → 100：「手册还是更全一点比较好，但太多会乱，100 行之内可以」。
//    · 3D 独立需求池 requests-3d.md ≤ 字符封顶（此前完全在监控盲区·REQ-RETRO 2026-08-03 补）
//  判词 token：`CONTEXT-BUDGET: PASS|FAIL`（照 docs-ref-guard 模式·退出码进门禁）。
//  基线=scripts/context-budget-baseline.json；抬预算唯一合法姿势=同提交改基线（review 一眼可见）。
// ═══════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'context-budget-baseline.json');

/** 纯检查核（导出供单测）：给定实测值与预算 → 问题列表（空=过）。 */
export function checkBudget(actual, budget) {
  const issues = [];
  if (budget.requestsPoolMaxEntries && actual.requestsEntries > budget.requestsPoolMaxEntries) {
    issues.push(`requests.md ${actual.requestsEntries} 条 > ${budget.requestsPoolMaxEntries} 硬槽（owner 2026-07-15 拍板）——10 条做不完不许加新的：先清掉（done 删除条目查 git 历史/游戏票迁 docs/design/<game>/requests.md）腾槽再加`);
  }
  if (actual.requestsChars > budget.requestsPoolMaxChars) {
    issues.push(`requests.md ${actual.requestsChars} 字符 > 封顶 ${budget.requestsPoolMaxChars}——done 条目删除（查 git 历史·池只留活跃）`);
  }
  for (const [file, max] of Object.entries(budget.t0MaxChars)) {
    const got = actual.t0Chars[file];
    if (got === undefined) issues.push(`T0 必读缺文件: ${file}（改名/删除须同步基线）`);
    else if (got > max) issues.push(`${file} ${got} 字符 > 封顶 ${max}——T0 必读集变厚须显式改基线（scripts/context-budget-baseline.json）`);
  }
  for (const [file, chars] of Object.entries(actual.gameRequestsChars ?? {})) {
    if (budget.gameRequestsMaxChars && chars > budget.gameRequestsMaxChars) {
      issues.push(`${file} ${chars} 字符 > 封顶 ${budget.gameRequestsMaxChars}——游戏需求单同主池纪律：done 工作票删除（查 git 历史）`);
    }
  }
  for (const [file, lines] of Object.entries(actual.playbookLines)) {
    if (lines > budget.playbookMaxLines) {
      issues.push(`${file} ${lines} 行 > ${budget.playbookMaxLines} 行——手册铁律（弱模型也读得完）·瘦身或拆册`);
    }
  }
  if (budget.playbookMaxChars) {
    for (const [file, chars] of Object.entries(actual.playbookChars ?? {})) {
      if (chars > budget.playbookMaxChars) {
        issues.push(`${file} ${chars} 字符 > 封顶 ${budget.playbookMaxChars}——行数达标但字符密度超顶（图/表/长句撑厚）·瘦身或拆册`);
      }
    }
  }
  if (budget.requests3dMaxChars && actual.requests3dChars !== undefined && actual.requests3dChars > budget.requests3dMaxChars) {
    issues.push(`requests-3d.md ${actual.requests3dChars} 字符 > 封顶 ${budget.requests3dMaxChars}——3D 独立池同主池归档纪律：done 条目全文迁归档`);
  }
  return issues;
}

function measure() {
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const t0Chars = {};
  const budget = JSON.parse(readFileSync(BASELINE, 'utf8'));
  for (const f of Object.keys(budget.t0MaxChars)) {
    try { t0Chars[f] = read(f).length; } catch { /* 缺文件 → checkBudget 点名 */ }
  }
  const playbookLines = {};
  const playbookChars = {};
  for (const f of readdirSync(join(ROOT, 'docs', 'playbooks'))) {
    if (!f.endsWith('.md')) continue;
    const text = read(`docs/playbooks/${f}`);
    playbookLines[`docs/playbooks/${f}`] = text.split('\n').length;
    playbookChars[`docs/playbooks/${f}`] = text.length;
  }
  let requests3dChars;
  try { requests3dChars = read('docs/workflow/requests-3d.md').length; } catch { /* 池文件缺失（不可能·防御） */ }
  const gameRequestsChars = {};
  try {
    for (const d of readdirSync(join(ROOT, 'docs', 'design'))) {
      try { gameRequestsChars[`docs/design/${d}/requests.md`] = read(`docs/design/${d}/requests.md`).length; } catch { /* 该游戏无需求单 */ }
    }
  } catch { /* docs/design 缺失（不可能·防御） */ }
  const pool = read('docs/workflow/requests.md');
  // 槽位计数：### 条目·排除模板行（### [YYYY-MM-DD]）与导航指针段（### 📦）。
  const requestsEntries = pool.split('\n').filter((l) => l.startsWith('### ') && !l.startsWith('### [') && !l.startsWith('### 📦')).length;
  return { budget, actual: { requestsChars: pool.length, requestsEntries, t0Chars, playbookLines, playbookChars, gameRequestsChars, requests3dChars } };
}

function main() {
  const { budget, actual } = measure();
  const issues = checkBudget(actual, budget);
  const out = [
    `[context-budget] requests.md ${actual.requestsEntries}/${budget.requestsPoolMaxEntries ?? '∞'} 槽 · ${actual.requestsChars}/${budget.requestsPoolMaxChars} 字符 · T0 ${Object.keys(budget.t0MaxChars).length} 文件 · 手册 ${Object.keys(actual.playbookLines).length} 本（≤${budget.playbookMaxLines} 行·≤${budget.playbookMaxChars ?? '∞'} 字符） · requests-3d ${actual.requests3dChars ?? '?'}/${budget.requests3dMaxChars ?? '∞'} 字符`,
  ];
  for (const i of issues) out.push(`  ✗ ${i}`);
  if (!issues.length) out.push('  ✓ 全部在预算内（新 session 读得完）');
  out.push(`CONTEXT-BUDGET: ${issues.length ? 'FAIL' : 'PASS'}`);
  process.stdout.write(out.join('\n') + '\n');
  process.exit(issues.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) main();
