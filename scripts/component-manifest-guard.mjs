#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/component-manifest-guard.mjs —— 共同零件（组件）清单守卫（REQ-STAB 建议②）
//
//  引擎的「组件」= 所有游戏共用的积木零件（位置/颜色/速度/格子…），是大家的共同语言。
//  本守卫把当前全部零件名扫成一张清单，与冻结基线 `component-manifest-baseline.json` 对比：
//  有人加/改名/删一个零件而没同步更新基线 → 亮红（退出码 1）。要求「改零件必须同提交更新清单」，
//  于是每次共同语言的变动都在 diff 里一眼可见、逃不过 review——防零件被悄悄改动搞坏别的游戏。
//  （与红旗棘轮同思路：把容易忽略的变化变成必须显式登记。）
//
//  用法：
//    node scripts/component-manifest-guard.mjs           # 体检（判词 COMPONENT-MANIFEST: PASS|FAIL）
//    node scripts/component-manifest-guard.mjs --update   # 有意改零件后·把基线更新到当前（同提交）
//  纯 node/fs·文本扫 `readonly type: 'X'`（引擎组件声明的稳定形态·每个 extends Component 都有）。
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMP_DIR = join(ROOT, 'src', 'engine', 'protocol', 'components');
const BASELINE = join(ROOT, 'scripts', 'component-manifest-baseline.json');

/** 扫 protocol/components 下所有域文件，收全部 `readonly type: 'X'` 零件名（去重升序）。导出供单测。 */
export function scanComponents(dir = COMP_DIR) {
  const names = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/readonly type:\s*'([A-Za-z0-9]+)'/g)) names.add(m[1]);
  }
  return [...names].sort();
}

/** 当前 vs 基线：新增 / 消失（改名或删除）。导出供单测。 */
export function diffComponents(current, baseline) {
  const cur = new Set(current);
  const base = new Set(baseline);
  return {
    added: current.filter((n) => !base.has(n)),
    removed: baseline.filter((n) => !cur.has(n)),
  };
}

function readBaseline() {
  try { return JSON.parse(readFileSync(BASELINE, 'utf8')).components ?? []; }
  catch { return null; }
}

function writeBaseline(components) {
  const payload = {
    _doc: '引擎共同零件（组件）清单基线——所有游戏共用的积木。改/加/删任一零件必须同提交跑 ' +
      '`node scripts/component-manifest-guard.mjs --update` 更新本文件（让共同语言的变动在 diff 里可见）。',
    count: components.length,
    components,
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
}

function main(argv) {
  const current = scanComponents();
  if (argv.includes('--update')) {
    writeBaseline(current);
    process.stdout.write(`[component-manifest] 基线已更新：${current.length} 个共同零件\n`);
    return;
  }
  const baseline = readBaseline();
  if (baseline === null) {
    process.stderr.write('基线不存在——先跑 `--update` 生成一次。\nCOMPONENT-MANIFEST: FAIL\n');
    process.exit(1);
  }
  const { added, removed } = diffComponents(current, baseline);
  const ok = added.length === 0 && removed.length === 0;
  const out = [`[component-manifest] 当前 ${current.length} 个共同零件 · 基线 ${baseline.length}`];
  if (added.length) out.push(`  ✚ 新增：${added.join(', ')}`);
  if (removed.length) out.push(`  ✖ 消失（改名/删除·可能搞坏在用它的游戏）：${removed.join(', ')}`);
  if (ok) out.push('  ✓ 与基线一致');
  else out.push('  → 若这些改动是有意的：同提交跑 `node scripts/component-manifest-guard.mjs --update` 更新清单（改动即在 diff 里可见）。');
  out.push(`COMPONENT-MANIFEST: ${ok ? 'PASS' : 'FAIL'}`);
  process.stdout.write(out.join('\n') + '\n');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) main(process.argv.slice(2));
