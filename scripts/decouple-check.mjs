#!/usr/bin/env node
// scripts/decouple-check.mjs —— 引擎/内容边界守卫（REQ-SPLIT-引擎内容分离·Lead 图纸②·**2026-09-03 P0 治理围栏改造为 dependency-cruiser 包装**）
//
// 原为 regex 抠 import 语句的 specifier：只吃带引号的 specifier，模板字面量动态 import、`import.meta.glob`、
// 变量 specifier 全漏（架构评审 2026-09-02 D13 探针实证）。现改为薄包装：跑 `.dependency-cruiser.cjs`——
// 真实解析（tsconfig paths · package exports），规则与原 (a)/(b) 一字对齐（games-no-relative-escape · src-no-games），
// 另加架构评审 §1.2 实测干净的层向关系（engine-core-is-bottom · skills-no-presentation · net-no-presentation）
// 与「解析不到的 import 即红」（not-to-unresolvable）。原白名单/既有跨界闭集原样搬进配置文件的 pathNot。
//
// 保留本入口的理由：门禁/文档/习惯都引用它；门禁常驻步 `depcruise` 已覆盖同一面，本脚本供单独点名跑。
// 用法：node scripts/decouple-check.mjs（退出码=结果；违规逐条打印）
import { spawnSync } from 'node:child_process';

export const CRUISE_ARGS = ['depcruise', '--config', '.dependency-cruiser.cjs', 'src', 'games'];

export function runCruise() {
  const r = spawnSync('npx', CRUISE_ARGS, { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function main() {
  const { ok, out } = runCruise();
  if (!ok) {
    console.error('✗ decouple-check：模块边界违规（dependency-cruiser）');
    console.error(out.trim());
    process.exit(1);
  }
  console.log('✓ decouple-check：引擎/内容边界零违规（dependency-cruiser）');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
