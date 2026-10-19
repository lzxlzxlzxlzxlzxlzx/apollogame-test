#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/build-platform.mjs —— 组装「整套平台离线打包」的跨平台产物骨架
//  （docs/workflow/platform-packaging-spec.md D2-D4·核心编排层）。
//
//  产出 platform-dist/：
//    dist/                  vite build 产物（studio launcher·9 游戏白名单过滤·同源伺服前端）
//    zerocraft.py               后端入口（薄壳，原样拷贝）
//    main_entry/              后端全部实现（"全部工坊工具不裁"·原样拷贝）
//    requirements.txt          后端唯一三方依赖清单（Pillow）
//    public/games/<9 slug>/     白名单游戏运行时资产（游戏代码自己 fetch('/games/<slug>/...')）
//    assets/FreeArtLib/**       白名单游戏用到的共享美术子集（当前仅 game-e；vite copyUsedAssets
//                               插件构建期已算好，这里原样搬、剔掉 game-f 专属子目录——game-f 不在白名单）
//    pybundle/PLACEHOLDER.md    真 standalone python + venv 由 mac CI（D5）灌进来，这里只占位
//
//  不做（明确留给 D5·mac CI）：下载/裁剪 standalone python、跑 electron-builder、签名/公证。
//
//  用法：node scripts/build-platform.mjs [--skip-build]
//    --skip-build：跳过 vite build，直接用已存在的 dist/（调试组装步骤本身时用，加速迭代）。
// ═══════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';
import { scanDir } from './assert-no-baked-key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'platform-dist');

// 9 游戏白名单（platform-packaging-spec.md §游戏白名单·唯一真相——vite.config.ts 的
// VITE_GAMES_ALLOWLIST 与下面 public/games 精选拷贝共用同一份，别让两处各抄一份漂移）。
export const GAMES_ALLOWLIST = [
  'game101', 'game102', 'game-103', 'game-c', 'game-e', 'game-b', 'game-g', 'game-i', 'game-z',
];
// 明确排除（仅用于自检断言 + 日志——真正生效的过滤是上面那份白名单本身）。
// game-q/x/t 已随 REQ-RETRO 引擎大扫除（owner 2026-08-03）删除，从本表移除；game-d/game-f 同批一度
// 删除后 owner 2026-08-03 改判还原（game-f 且继续上架），但两者本就不在上面 9 游戏打包白名单里
// （历来如此，非本次变化），故仍需保留在排除表——launcher/game-runner.tsx 的动态 import 表恢复
// 提它们，Rollup 会再产出对应 chunk，需要本表继续剔除。
export const GAMES_EXCLUDED = ['game-f', 'game-d', 'game-a'];

function log(msg) { process.stdout.write(`[build-platform] ${msg}\n`); }

function rmrf(p) { if (existsSync(p)) rmSync(p, { recursive: true, force: true }); }

/** vite build：studio launcher 静态站，带 9 游戏白名单过滤 + 平台专属输出布局（避开 /assets/ 撞车）。 */
function buildFrontend() {
  log('vite build（VITE_PLATFORM_BUILD=1 + 9 游戏白名单）…');
  const env = {
    ...process.env,
    VITE_PLATFORM_BUILD: '1',
    VITE_GAMES_ALLOWLIST: GAMES_ALLOWLIST.join(','),
  };
  execFileSync('npx', ['vite', 'build', '--outDir', join(OUT, 'dist'), '--emptyOutDir'], {
    cwd: ROOT, env, stdio: 'inherit',
  });
}

/** 白名单之外的游戏仍会被 Rollup 静态发现（src/launcher/game-runner.tsx 的 loaders 表按全部 15
 * 个 id 字面量 import()，与运行时 GAMES 过滤是两回事——见交付说明「已知缺口」）而被打进独立
 * chunk：`<slug>-<hash>.js`。物理删除排除名单对应的 chunk 文件，做到「不占体积·不露 WIP」两条
 * 硬指标，而不只是「UI 不显示」这层软过滤。按已知 slug 精确前缀匹配（slug 本身含连字符、hash
 * 后缀也可能含连字符，不能用通用分隔逻辑），零跨游戏误删风险。 */
function pruneExcludedGameChunks() {
  const appDir = join(OUT, 'dist', 'app');
  if (!existsSync(appDir)) { log('⚠ dist/app 不存在，跳过 chunk 清理（vite.config.ts 的 assetsDir 平台开关没生效？）'); return; }
  let removed = [];
  for (const name of readdirSync(appDir)) {
    if (!name.endsWith('.js')) continue;
    const hit = GAMES_EXCLUDED.find((slug) => name.startsWith(`${slug}-`));
    if (hit) { unlinkSync(join(appDir, name)); removed.push(name); }
  }
  log(`已剔除排除游戏的独立 chunk：${removed.length ? removed.join(', ') : '(无——本次构建未产生)'}`);
}

/** 后端源码：zerocraft.py + main_entry/ 全量（"全部工坊工具不裁"）+ requirements.txt +
 * workshop/（原版展示工作台静态壳·server.py `_serve_workshop` 直接从 ROOT/workshop 端文件，
 * 不带上 /workshop/ 就 404——"工坊可开"这条硬指标靠它，296K 很小，不裁）。 */
function copyBackend() {
  log('拷贝后端源码（zerocraft.py + main_entry/ + workshop/ + requirements.txt）…');
  cpSync(join(ROOT, 'zerocraft.py'), join(OUT, 'zerocraft.py'));
  cpSync(join(ROOT, 'main_entry'), join(OUT, 'main_entry'), {
    recursive: true,
    filter: (src) => !src.includes('__pycache__') && !src.endsWith('.pyc'),
  });
  cpSync(join(ROOT, 'workshop'), join(OUT, 'workshop'), { recursive: true });
  cpSync(join(ROOT, 'requirements.txt'), join(OUT, 'requirements.txt'));
  copyGamesListInputs();
}

/** `/api/games`（工坊落地页的「引擎游戏」货架数据源）的两个磁盘依赖——不带上，打包态货架**全空**：
 *   ① `games/<slug>/` 目录存在性：`handle_games_list` 枚举 `ROOT/games` 下匹配 game-* 的**目录**
 *      当权威列表（只判 `is_dir()` + 名字正则，不读内容）。游戏真正跑靠 dist/ 里的 JS chunk 与
 *      public/games/ 运行时资产，这里的 TS 源码客户端用不着，故只建**空目录占位**、不搬 22M 源码。
 *      顺带天然只露白名单那 9 个（与 launcher 的 VITE_GAMES_ALLOWLIST 过滤一致，不漏内部 WIP）。
 *   ② `src/launcher.tsx`：内置游戏元信息（title/subtitle/description/icon/color…）由
 *      `_builtin_games_meta()` 正则解析它得来（单一真相在 launcher）。缺了不会崩，但每张卡片
 *      退化成只剩一个 id 编号。44K，直接带。
 * 背景：落地页从 React 游戏架（GAMES 烤进 JS 包）改成工坊 `/workshop/` 后，这条洞才第一次可见——
 * 工坊货架是真去打这个接口的（workshop/index.dc.html `fetch('/api/games')`）。 */
function copyGamesListInputs() {
  log('补 /api/games 的磁盘依赖（games/<slug> 占位目录 + src/launcher.tsx 元信息源）…');
  const placed = [];
  for (const slug of GAMES_ALLOWLIST) {
    if (!existsSync(join(ROOT, 'games', slug))) continue; // 仓库里没有的 slug 不凭空造
    mkdirSync(join(OUT, 'games', slug), { recursive: true });
    writeFileSync(join(OUT, 'games', slug, '.keep'),
      `# 占位：/api/games 靠枚举 games/<slug> 目录列出内置游戏（main_entry/games_list.py）。\n`
      + `# 只带空目录不带源码即可（源码 22MB 客户用不上）；但**必须有本文件**——\n`
      + `# 空目录会被打包拷贝丢掉，导致货架为空。删它 = 该游戏从创作台货架消失。\n`);
    // 必须往占位目录里放一个**真文件**——**空目录会被 electron-builder 的 extraResources
    // 拷贝丢掉**（大多数打包器/glob 拷贝都不保留空目录），于是打包态 `ROOT/games` 为空 →
    // `/api/games` 返回 [] → 创作台货架「引擎内置」显示 0（owner 2026-08-06 真机实测事故）。
    // 这个坑极隐蔽：直接跑 platform-dist/ 一切正常（目录还在），只有穿过 electron-builder
    // 才暴露——故本文件的自检不足以证明它，必须打包后验（见 verifyPackagedGamesDirs）。
    placed.push(slug);
  }
  mkdirSync(join(OUT, 'src'), { recursive: true });
  cpSync(join(ROOT, 'src', 'launcher.tsx'), join(OUT, 'src', 'launcher.tsx'));
  log(`  games/ 占位 ${placed.length} 个：${placed.join(', ')}；launcher.tsx 已带`);
}

/** 9 白名单游戏运行时资产：public/games/<slug>（游戏代码自己 fetch('/games/<slug>/...')·
 * 缺失的 slug 静默跳过——不是所有游戏都有这个目录，如 game-e 纯走 FreeArtLib）。 */
function copyWhitelistedGameAssets() {
  log('拷贝 9 白名单游戏运行时资产 public/games/<slug>…');
  let copied = [];
  for (const slug of GAMES_ALLOWLIST) {
    const src = join(ROOT, 'public', 'games', slug);
    if (!existsSync(src)) continue;
    cpSync(src, join(OUT, 'public', 'games', slug), { recursive: true });
    copied.push(slug);
  }
  log(`已拷贝：${copied.join(', ')}（缺失目录的 slug 静默跳过——不是每个游戏都有）`);
  // 通用（非游戏专属）public 子目录：models/ui-fonts 供 3D 渲染线/CJK 字重发光组件用，
  // 体量小（几百 KB~几 MB）、非白名单裁剪对象，原样带上。
  for (const dir of ['models', 'ui-fonts']) {
    const src = join(ROOT, 'public', dir);
    if (existsSync(src)) cpSync(src, join(OUT, 'public', dir), { recursive: true });
  }
}

/** 白名单游戏用到的共享美术子集：vite `copyUsedAssets` 插件在 build 期已经算好落在
 * dist/assets/FreeArtLib/**（server.py `_serve_assets` 路由认的是 ROOT/assets/**，不是
 * ROOT/dist/assets——两个"assets"字面重名但不是一个目录，故这里要**搬**到 platform-dist
 * 顶层的 assets/，而不是留在 dist/ 里）。该插件当前对 game-e + game-f 都会拷（无游戏粒度
 * 参数），game-f 不在白名单——精确剔除 monster/effect 两个 game-f 专属子目录（来源见
 * vite.assets.ts usedAssetRels：这两个键只有 game-f 分支写；game-f 已随 owner 2026-08-03
 * 改判还原，此剔除逻辑同步回填）。 */
function relocateSharedArt() {
  const from = join(OUT, 'dist', 'assets', 'FreeArtLib');
  if (!existsSync(from)) { log('（无共享美术子集需要搬运——白名单游戏都不依赖 FreeArtLib）'); return; }
  log('搬运共享美术子集 dist/assets/FreeArtLib → assets/FreeArtLib（剔除 game-f 专属子目录）…');
  const to = join(OUT, 'assets', 'FreeArtLib');
  cpSync(from, to, { recursive: true });
  for (const excluded of ['monster', 'effect']) rmrf(join(to, excluded)); // game-f 专属·不在白名单
  // 特意不删原位置 dist/assets/：_serve_static 的 do_GET 分派顺序里 `/assets/` 前缀早被
  // _serve_assets（读 ROOT/assets）拦下，dist/assets/** 天生不可达、留着也不会被误伺服——
  // 只是几百 KB 死重复，换来 --skip-build 调试路径可重复跑（不删源就不会「删了却没地方再搬一次」）。
}

function writePybundlePlaceholder() {
  const dir = join(OUT, 'pybundle');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'PLACEHOLDER.md'),
    '# pybundle 占位\n\n'
    + '真正的可搬迁 standalone python + 预建 venv（装好 requirements.txt 全部依赖）由 D5 mac CI 步骤\n'
    + '灌进这个目录（结构约定：`pybundle/bin/python3` 可执行）。electron/platform-main.cjs 的\n'
    + 'resolvePythonBin() 在打包产物里找的就是这条路径；找不到时（本目录仍是占位/dev 环境）回退\n'
    + '系统 `python3`。\n\n'
    + `生成时间：${new Date().toISOString()}\n`);
}

/** 组装完成后的自检：①白名单断言（只剩 9 个游戏 chunk，不含排除名单）②零 key 断言。
 * 任一失败都 throw——组装脚本自己把关，不指望调用方记得手动跑断言脚本。 */
function verify() {
  log('自检①：9 游戏白名单——扫 dist/app/*.js chunk 文件名…');
  const appDir = join(OUT, 'dist', 'app');
  const chunkNames = existsSync(appDir) ? readdirSync(appDir).filter((n) => n.endsWith('.js')) : [];
  for (const slug of GAMES_EXCLUDED) {
    const hit = chunkNames.find((n) => n.startsWith(`${slug}-`));
    if (hit) throw new Error(`白名单断言失败：排除游戏 ${slug} 的 chunk 仍在产物里（${hit}）`);
  }
  const foundAllowlisted = GAMES_ALLOWLIST.filter((slug) => chunkNames.some((n) => n.startsWith(`${slug}-`)));
  log(`  排除名单 ${GAMES_EXCLUDED.length} 个均不在产物里 ✓；白名单里能在 dist/app 找到独立 chunk 的有 ${foundAllowlisted.length}/9（game-e 等纯静态卡带可能被打进主 bundle，不一定有独立 chunk，不算异常）`);

  log('自检①b：games/ 占位目录必须**非空**（空目录会被 electron-builder 丢掉→货架为空）…');
  {
    const bad = GAMES_ALLOWLIST
      .filter((slug) => existsSync(join(OUT, 'games', slug)))
      .filter((slug) => readdirSync(join(OUT, 'games', slug)).length === 0);
    if (bad.length) {
      throw new Error(
        `[build-platform] games/ 占位目录为空：${bad.join(', ')}——空目录会被打包拷贝丢掉，`
        + '装出来的 app 里 /api/games 会返回 []、创作台货架「引擎内置」显示 0'
        + '（owner 2026-08-06 真机事故）。每个占位目录必须含 .keep。',
      );
    }
    log(`  9 占位目录均非空 ✓（各含 .keep·防打包丢目录）`);
  }
  log('自检②：零 key（scanDir 复用 assert-no-baked-key 逻辑）…');
  const { hits, fileCount, scanned } = scanDir(OUT);
  if (hits.length) {
    throw new Error(`零 key 断言失败（${hits.length} 处）：\n` + hits.map((h) => `  - ${h}`).join('\n'));
  }
  log(`  PASS —— ${OUT}（${fileCount} 文件·文本扫 ${scanned} 个）零 key 字面量、零危险配置文件`);
}

function printTree() {
  log(`组装完成 → ${OUT}`);
  for (const name of readdirSync(OUT).sort()) {
    const p = join(OUT, name);
    const st = statSync(p);
    log(`  ${name}${st.isDirectory() ? '/' : ''}`);
  }
}

async function main(argv) {
  const skipBuild = argv.includes('--skip-build');
  if (skipBuild) {
    // 调试模式：保留已有 dist/（跳过最耗时的 vite build），只重跑组装的其余步骤——
    // 不能整个 rmrf(OUT) 再重建，否则连要保留的 dist/ 都被端掉，参数就白设了。
    if (!existsSync(join(OUT, 'dist'))) throw new Error('--skip-build 但 platform-dist/dist 不存在——先跑一次不带此参的完整构建');
    for (const name of readdirSync(OUT)) if (name !== 'dist') rmrf(join(OUT, name));
  } else {
    rmrf(OUT);
    mkdirSync(OUT, { recursive: true });
    buildFrontend();
  }
  pruneExcludedGameChunks();
  copyBackend();
  copyWhitelistedGameAssets();
  relocateSharedArt();
  writePybundlePlaceholder();
  verify();
  printTree();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`[build-platform] 失败：${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
