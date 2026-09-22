#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  测试代码体检（REQ-QA-测试审计强化三件 · 主程 spec 2026-07-04 · **2026-09-03 P0 治理围栏改造为 ESLint 包装**）
//
//  准则出处不变：docs/playbooks/testing.md 红线「测试代码三禁」——
//    ① 真时间等待（墙钟 setTimeout(延时≠0)/setInterval/sleep/Date.now/performance.now）
//    ② 外部 IO 直连（真 fetch/http/https/net/WebSocket/createServer）
//    ③ 裸 Math.random（无种子随机）
//  原 regex 行扫描只盖 src/**/*.test.ts（games 的 166 个测试无人管）且被计算属性/解构绕过；现改为薄包装：
//  对 src/** 与 games/** 的 *.test.ts(x) 跑 `eslint.config.mjs` 的 TEST 面规则（zerocraft/no-unseeded-random ·
//  no-wall-clock · no-timers · no-external-io + no-restricted-imports 网络模块）。
//  原「自动豁免」（vi.useFakeTimers / stub fetch）与白名单改为源码行内/文件级 `eslint-disable … -- 理由`（就地可见）；
//  `setTimeout(fn, 0)` 零延时让步（React act 冲刷惯用法）规则内放行，不算等墙钟。
//
//  用法：node scripts/test-hygiene-check.mjs
//  收口：末行判词 `HYGIENE: PASS|FAIL`；退出码 硬违规=1、其余=0。
// ═══════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';

export const TEST_GLOBS = ['src/**/*.test.ts', 'src/**/*.test.tsx', 'games/**/*.test.ts', 'games/**/*.test.tsx'];

export function runScan(globs = TEST_GLOBS) {
  const r = spawnSync('npx', ['eslint', ...globs, '--max-warnings', '0', '--no-error-on-unmatched-pattern'], { encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, out };
}

function main() {
  console.log(`测试三禁围栏（ESLint zerocraft/* · ${TEST_GLOBS.join(' ')}）`);
  const { ok, out } = runScan();
  if (out.trim()) console.log(out.trim());
  console.log(ok ? 'HYGIENE: PASS' : 'HYGIENE: FAIL');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
