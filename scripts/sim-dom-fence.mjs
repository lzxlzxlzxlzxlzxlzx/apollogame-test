#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  sim-dom-fence —— 「sim 面不许碰 DOM」机器围栏（P3a · REQ-P3TAIL M1 · owner 2026-09-12）
//
//  架构评审 §5 P3a 的验收原文：**「sim 在 Node/Worker 里 import 不带 DOM lib 也过 tsc」**。
//  在这道门之前那只是文档里的一句话——主 tsconfig 带 `lib: dom`，sim 面偷偷用了
//  `window` / `document` / `HTMLElement` 也照样编译过，**谁都不知道**（D13「强制力是文本形状的」）。
//
//  本门 = 拿 `tsconfig.sim.json`（lib 只给 ES2022 + 一份「三种宿主都有」的中性全局）再编译一遍
//  `src/engine/** · src/skills/** · src/net/*`（**不含** `src/net/host/**` 与 `src/engine/host/**`
//  ——那两处按定义就是宿主胶水）。谁碰 DOM 谁编译不过。
//
//  立门当天的实况（这道门自己跑出来的，不是估的）：
//    · 起点 50 条真 DOM 依赖 → 修完 **0 条**
//    · `src/engine/**` 从 1 条（`RendererBackend.init(container: HTMLElement)`）到 0：
//      改成泛型 `RendererBackend<S = RenderSurface>`，浏览器后端照旧 `<HTMLElement>`
//    · `protocol/components/render.ts` 走桶文件 `@ui/components/index.js` 取 `LayoutNode`，
//      把重度依赖 DOM 的 `server.ts` 一起拖进类型图 → 改成直接取 `types.js`
//    · `src/net/` 的键盘/指针/手柄/轮替/双标签页 demo 共 48 条 → 整体搬进 `src/net/host/`，
//      桶文件拆成两只（sim 面 `@net/index.js` · 宿主面 `@net/host/index.js`）
//
//  用法：node scripts/sim-dom-fence.mjs（退出码 0=绿）
// ═══════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** 立门当天已归零 —— 棘轮只紧不松：这个数只许是 0，多一条就是有人把 DOM 带回了 sim 面。 */
export const ALLOWED = 0;

export function runFence(root = ROOT) {
  const r = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.sim.json'],
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const errors = out.split('\n').filter((l) => /error TS/.test(l));
  return { errors, out };
}

function main() {
  // 围栏的 include/exclude 就是「哪半是 sim」的定义——被人悄悄放宽了，门就成了摆设。
  const cfg = JSON.parse(readFileSync(join(ROOT, 'tsconfig.sim.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const lib = cfg.compilerOptions?.lib || [];
  if (lib.some((l) => /dom/i.test(l))) {
    console.log('  ✗ tsconfig.sim.json 的 lib 里出现了 dom —— 围栏被拆了，这道门失去全部意义');
    console.log('\nSIM-DOM-FENCE: FAIL');
    process.exit(1);
  }
  const { errors } = runFence();
  const byFile = new Map();
  for (const e of errors) {
    const f = e.split('(')[0];
    byFile.set(f, (byFile.get(f) || 0) + 1);
  }
  console.log(`══ sim 面 DOM 围栏（lib=${lib.join(',')}·不含 dom）══\n`);
  console.log(`  扫描面：${(cfg.include || []).join(' · ')}`);
  console.log(`  宿主豁免：${(cfg.exclude || []).filter((x) => x.includes('host')).join(' · ')}\n`);
  if (errors.length === 0) {
    console.log('  ✓ sim 面零 DOM 依赖（不带 dom lib 编译通过）');
  } else {
    for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`  ✗ ${f} — ${n} 条`);
    console.log(`\n  这些文件把 DOM 带回了 sim 面。两条出路：`);
    console.log(`    ① 真的是宿主胶水 → 搬进 src/net/host/ 或 src/engine/host/（并从 sim 桶文件里摘掉再导出）`);
    console.log(`    ② 不是 → 把 DOM 类型换成平台中性的（先例：RendererBackend<S = RenderSurface>）`);
  }
  const ok = errors.length <= ALLOWED;
  console.log(`\nSIM-DOM-FENCE: ${ok ? 'PASS' : 'FAIL'}（${errors.length} 条 / 上限 ${ALLOWED}）`);
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
