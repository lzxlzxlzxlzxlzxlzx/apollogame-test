#!/usr/bin/env node
// scripts/decouple-check.mjs —— 引擎/内容边界守卫（REQ-SPLIT-引擎内容分离·Lead 图纸②·本单真正的交付物·防回潮）
//
// 只按 import/require **语句**判（运行时 URL 字符串 `/games/<g>/…`、public/ 路径一律不算——那些不是
// import，不查）。小而钝：任何相对路径逃逸都算违规，不做「这条其实是资产/测试工具」之类的例外裁量——
// 有例外需要就该走白名单（下方常量），不在脚本里临时开洞。
//
//   (a) games/**/*.ts(x) 的每条 import：相对路径解析后落在**自己游戏目录之外**（含逃到别的游戏/
//       逃到 src/ 内部）= 违规。游戏碰引擎只许走别名（@engine/@skills/@atom-skills/@ui/@renderer/
//       @services/@assets/@net/@runtime/@assembly）——别名导入不算，同游戏内部随便。
//   (b) src/**/*.ts(x) 的每条 import：字面 `@games/*` 或相对路径解析进 games/**（含 games 本身）=
//       违规。**白名单**（装配层合法装游戏——Lead 图纸①指名）：`src/launcher/**`、`src/cartridge*`。
//
// 用法：node scripts/decouple-check.mjs（退出码=结果；违规逐条打印 `[a]`/`[b]` 前缀）
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 白名单——只这两处装配层允许 import 具体游戏模块（Lead 图纸①指名·写死在此·不接受运行时扩展）。
const SRC_WHITELIST = [/^src\/launcher(\/|$)/, /^src\/cartridge/];

// 迁移期发现的**既有**（非本次引入）跨界——本单未经 Lead 授权不敢扩大目录级白名单，先按「精确文件」
// 闭集放行、逐条留痕，实质仍是违规待裁。
//
// REQ-RETRO 引擎大扫除批①（2026-08-03）瘦身：原 10 条里 9 条借的是 game-f / 或把"随手可得的
// 真实蓝图"当测试夹具（validate-manifest/validate-references/bench/preview.integration/game-e.tsx
// 独立入口）——全部换成不挂 games/** 的引擎侧夹具（`src/test-fixtures/engine-fixture.ts`）或挪回
// `games/game-e/` 自己目录，白名单条目随之清零；只留 Studio 资产浏览三处真借用 game-e 真实数据
// （小丑牌美术目录/真实蓝图，非"借夹具"，是产品功能——留债，非本次消解范围）。
// 分类回执（REQ-RETRO2 施工 2026-08-03）：以下 3 条 = 产品功能耦合（Studio 需展示真实 game-e 资产）·
// 长期条目·非待偿测试债，不纳入债务清零目标。
const SRC_GRANDFATHERED = new Set([
  'src/studio/AssetLibrary.tsx',
  'src/studio/StudioInspector.tsx',
  'src/studio/assets-model.ts',
]);
const A_GRANDFATHERED = new Set([
  // 分类回执（REQ-RETRO2 施工 2026-08-03）：锚点守卫·须读真实导出插件·性质不同不偿还。
  'games/game-c/dokiworld-export.test.ts::../../tools/export-targets/dokiworld.mjs',
  // game-f 还原（owner 2026-08-03 改判）后回填：game-f 大厅从 docs/ 里 raw-import 教程 HTML 文本，
  // 既有耦合与本次引擎侧夹具消解无关（未经 Lead 点名·game-f 冻结政策封锁·不摘除）。
  // 分类回执（REQ-RETRO2 施工 2026-08-03）：冻结封锁·随 game-f 冻结政策，不纳入债务清零目标。
  'games/game-f/lobby.tsx::../../docs/game-design/game-f-tutorial.html?raw',
]);

const SPEC_RE =
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

export function specifiers(code) {
  const out = [];
  let m;
  SPEC_RE.lastIndex = 0;
  while ((m = SPEC_RE.exec(code))) out.push(m[1] || m[2] || m[3] || m[4]);
  return out;
}

const posix = (p) => p.split('\\').join('/');

/** 纯函数（可单测）：给定仓库根 → 违规字符串数组。 */
export function findViolations(root) {
  const violations = [];

  // (a) games/**
  const gamesRoot = join(root, 'games');
  if (existsSync(gamesRoot)) {
    for (const abs of collectFiles(gamesRoot)) {
      const rel = posix(relative(root, abs));
      const ownGame = rel.split('/')[1];
      const code = readFileSync(abs, 'utf8');
      for (const spec of specifiers(code)) {
        if (!spec.startsWith('.')) continue; // 别名/裸包不算(a)项
        if (A_GRANDFATHERED.has(`${rel}::${spec}`)) continue;
        const targetRel = posix(relative(root, resolve(dirname(abs), spec)));
        if (targetRel !== `games/${ownGame}` && !targetRel.startsWith(`games/${ownGame}/`)) {
          violations.push(`[a] ${rel}: 相对导入逃出自己游戏目录 → '${spec}'（解析到 ${targetRel}）`);
        }
      }
    }
  }

  // (b) src/**
  const srcRoot = join(root, 'src');
  if (existsSync(srcRoot)) {
    for (const abs of collectFiles(srcRoot)) {
      const rel = posix(relative(root, abs));
      if (SRC_WHITELIST.some((re) => re.test(rel)) || SRC_GRANDFATHERED.has(rel)) continue;
      const code = readFileSync(abs, 'utf8');
      for (const spec of specifiers(code)) {
        if (spec.startsWith('@games/')) {
          violations.push(`[b] ${rel}: import 游戏别名 → '${spec}'（不在白名单 src/launcher/**、src/cartridge*）`);
          continue;
        }
        if (spec.startsWith('.')) {
          const targetRel = posix(relative(root, resolve(dirname(abs), spec)));
          if (targetRel === 'games' || targetRel.startsWith('games/')) {
            violations.push(`[b] ${rel}: 相对导入解析进 games/ → '${spec}'（解析到 ${targetRel}·不在白名单）`);
          }
        }
      }
    }
  }

  return violations;
}

function main() {
  const violations = findViolations(ROOT);
  if (violations.length) {
    console.error(`✗ decouple-check：${violations.length} 处违规`);
    for (const v of violations) console.error('  ' + v);
    process.exit(1);
  }
  console.log('✓ decouple-check：引擎/内容边界零违规');
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
