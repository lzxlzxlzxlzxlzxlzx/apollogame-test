#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/bench-manifest.mjs —— 单卡带体检薄 CLI（创作台 v1 · M4「🩺 体检」后端）
//
//  用法：cat game.json | npx vite-node scripts/bench-manifest.mjs
//        （stdin 读规范 manifest JSON → parseManifest → 跑引擎真 ZeroCraftBench 五轴体检 →
//         stdout 输出 { score, pass, threshold, axes, spatial, evolves } JSON）
//
//  为何是 CLI + 引擎真体检：与 manifest-check.mjs 同一形态——复用 src/bench/zerocraft-bench.ts 的
//  benchBlueprint（120 tick 跑真引擎，五轴 Structure/Load/Determinism/Numeric/Visual），绝不另写
//  一份"够用"的评分（那会漂移）。zerocraft.py 的 POST /api/library/<slug>/bench 起本 CLI 子进程透传结果。
//
//  Determinism 轴要"两次独立跑到同 tick hash 一致"——benchBlueprint 会多次调 build()。故 build()
//  每次从原始 JSON 文本重新 JSON.parse + parseManifest，产**全新**蓝图（不共享任何可变组件状态），
//  保证两跑真正独立。
//
//  TS 执行：经 vite-node 运行，import 的 .ts 由 vite transform 即时编译——零新依赖（vite 既有）。
// ═══════════════════════════════════════════════════════════════

import { parseManifest } from '../src/assembly/manifest.ts';
import { benchBlueprint, BENCH_PASS_THRESHOLD } from '../src/bench/zerocraft-bench.ts';
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { requireCartAssetIndex, assertCartMasksBound } from '../src/assets/cart-art.ts';

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.stderr.write('bench-manifest: 空输入（stdin 无 manifest JSON）\n');
    process.exit(1);
  }

  // 先探一次 JSON 合法性 + 可解析成蓝图（parse 阶段失败 → 明确报错，不进体检）。
  try {
    JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`bench-manifest: JSON 解析失败 —— ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }
  let opts = {};
  try {
    const arg = process.argv.indexOf('--art-index');
    const indexPath = arg >= 0 ? process.argv[arg + 1] : undefined;
    if (arg >= 0 && !indexPath) throw new Error('--art-index 需要文件路径');
    const index = requireCartAssetIndex(JSON.parse(raw), indexPath ? basename(dirname(dirname(indexPath))) : 'stdin', indexPath ? JSON.parse(readFileSync(indexPath, 'utf8')) : null);
    opts = index ? { assetIndex: index, assetKeys: new Set(index.assets.map((a) => a.id)) } : {};
    assertCartMasksBound(parseManifest(JSON.parse(raw), opts));
  } catch (e) {
    process.stderr.write(`bench-manifest: manifest 无法解析成蓝图 —— ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }

  // build() 每次从原始文本重解析 → 全新蓝图（determinism 两跑独立）。
  const build = () => { const blueprint = parseManifest(JSON.parse(raw), opts); assertCartMasksBound(blueprint); return blueprint; };
  const report = benchBlueprint('cartridge', build);

  process.stdout.write(
    JSON.stringify({
      score: report.total,
      pass: report.passed,
      threshold: BENCH_PASS_THRESHOLD,
      spatial: report.spatial,
      evolves: report.evolves,
      axes: report.axes.map((a) => ({ name: a.name, score: a.score, max: a.max, notes: a.notes })),
    }) + '\n',
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`bench-manifest: 意外失败 —— ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
});
