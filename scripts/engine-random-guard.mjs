#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  引擎面确定性围栏（REQ-GUARDGATE ① · 2026-08-16 立·**2026-09-03 P0 治理围栏改造为 ESLint 包装**）
//
//  原为单条 regex `\bMath\.random\s*\(` 行扫描——被 `Math['random']()`、`const {random} = Math`、
//  `globalThis.Math`、同行 `"http://x"` 假注释全部绕过（架构评审 2026-09-02 D12 探针实证），且只管 Math.random、
//  不管超越函数/墙钟。现改为薄包装：对引擎面五目录跑 `eslint.config.mjs` 的 SIM/NET/SVC 面规则
//  （tools/eslint/zerocraft-rules.mjs：no-unseeded-random · no-transcendental · no-wall-clock · no-timers），
//  AST 级判定，写法变体逐一覆盖。原白名单改为源码行内 `eslint-disable-next-line zerocraft/<rule> -- 理由`（就地可见）。
//
//  保留本入口的理由：门禁/文档/习惯都引用它；门禁常驻步 `eslint` 已覆盖同一面，本脚本供**单独点名跑**。
//  用法：node scripts/engine-random-guard.mjs
//  收口：末行判词 `ENGINE-RANDOM: PASS|FAIL`；退出码 硬违规=1、其余=0。
// ═══════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';

export const SCAN_ROOTS = ['src/engine', 'src/skills', 'src/assembly', 'src/net', 'src/services'];

export function runScan(roots = SCAN_ROOTS) {
  const r = spawnSync('npx', ['eslint', ...roots, '--max-warnings', '0'], { encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, out };
}

function main() {
  console.log(`引擎面确定性围栏（ESLint zerocraft/* · ${SCAN_ROOTS.join(', ')}）`);
  const { ok, out } = runScan();
  if (out.trim()) console.log(out.trim());
  console.log(ok ? 'ENGINE-RANDOM: PASS' : 'ENGINE-RANDOM: FAIL');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
