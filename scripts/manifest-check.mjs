#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/manifest-check.mjs —— manifest 校验闸门（供创作台落盘前调用）
//
//  用法：cat game.json | npx vite-node scripts/manifest-check.mjs
//        （stdin 读规范 manifest JSON → 跑引擎真 parseManifest → 退出码 = 通过与否）
//
//  为何是 CLI + 引擎真校验：库地基的「先校验后落盘」必须用与运行期**同一套** parseManifest
//  （validate-manifest + validate-references），绝不另写一份"够用"的校验——那会漂移。
//  引擎 parseManifest 遇真错(组件字段基元类型不符/结构非法)会 throw；这里 catch → exit 1 +
//  把错误清单打到 stderr（纯文本，便于回喂 LLM 修）。仅告警（拼错字段名/断链）不阻断，exit 0。
//
//  TS 执行：本文件经 `vite-node` 运行，import 的 .ts 由 vite transform 管线即时编译——
//  零新依赖（vite 是既有 devDep）。故本 .mjs 不能用裸 node 跑，只走 vite-node。
// ═══════════════════════════════════════════════════════════════

import { parseManifestDetailed } from '../src/assembly/manifest.ts';
import { Engine } from '../src/runtime/engine.ts';

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
    });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.stderr.write('manifest-check: 空输入（stdin 无 manifest JSON）\n');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`manifest-check: JSON 解析失败 —— ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }

  let result;
  try {
    result = parseManifestDetailed(parsed);
  } catch (e) {
    // 引擎判定的真错（结构/基元类型不符）→ 拒绝落盘。
    process.stderr.write(`${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }

  // 真装载检查（owner 07-11「能存必须能跑」·实证：AI 改稿过 parse 却在运行器装载时炸）：
  // parse 只验结构；引擎 load + 空跑 2 tick 才暴露装配期/首帧的运行错（系统 setup 抛错、
  // 组件数据在系统里立刻炸等）。Engine.load/world.tick 无 DOM 依赖（渲染器另挂），node 侧可跑。
  // 装载失败=拒绝落盘（错误文本回喂 LLM 修）。
  try {
    const eng = new Engine({ tickRate: 60 });
    eng.load(result.blueprint);
    eng.world.tick();
    eng.world.tick();
  } catch (e) {
    process.stderr.write(`装载失败（parse 通过但引擎装不起来）: ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }

  // 通过：告警不阻断，但打到 stderr 供人/LLM 参考（stdout 保持干净，只回一行机读 OK）。
  for (const w of result.warnings) {
    process.stderr.write(`warning: ${w}\n`);
  }
  process.stdout.write(
    JSON.stringify({
      ok: true,
      inferredCapabilities: result.inferredCapabilities,
      // 真解析出的能力 id（显式或推断·登记序无关=manifest 序）——package-web 据此裁剪懒注册表打子集外壳（P2e）。
      capabilities: result.blueprint.capabilities.map((c) => c.id),
      warnings: result.warnings,
    }) + '\n',
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`manifest-check: 意外失败 —— ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
});
