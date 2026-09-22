#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/bundle-python-mac.mjs —— D5：灌「可搬迁 standalone python」进 platform-dist/pybundle/
//  （docs/workflow/platform-packaging-spec.md D5·电脑内含物只用 mac CI 能跑通这条链路）。
//
//  做的事（真跑时，顺序执行）：
//   ① 从 python-build-standalone（astral-sh 维护）下载 macOS arm64 relocatable python
//      的 install_only 发行版（`cpython-<series>.<patch>+<tag>-aarch64-apple-darwin-install_only.tar.gz`）。
//   ② 校验 SHA256（若该 release 发了对应 `<文件名>.sha256` 校验文件——上游不保证一定有，
//      没有就跳过校验但打印醒目提示，不当场硬失败）。
//   ③ 解压，将其单一顶层目录（通常叫 `python/`）原地改名为 `platform-dist/pybundle/`。
//   ④ **直接用它自带的 `bin/pip3` 把 requirements.txt 装进它自己的 site-packages**（不再叠一层
//      `python -m venv`）——理由见下方"关于 venv 的偏离"。
//   ⑤ 裁掉标准库里明确用不上的大头（test/idle_test/turtledemo/tkinter/lib2to3 + __pycache__），
//      顺带把 scripts/assert-no-baked-key.mjs 要扫的文件数砍下来。
//   ⑥ 冒烟：`pybundle/bin/python3 -c "import PIL; print(PIL.__version__)"`。
//
//  ⚠ 关于 venv 的偏离（spec 原话「用它建 venv」，这里改成"直接装进发行版自身"）：
//    `python -m venv` 产生的 pyvenv.cfg 里 `home = ` 记录的是**构建机的绝对路径**（venv 只带
//    site-packages + 一个指回 base 解释器的符号链接/精简 launcher，标准库仍从 `home` 那条路径
//    加载）。这份 pybundle 后续要被 electron-builder 的 extraResources 整体搬进
//    `resourcesPath/pybundle/`——搬到客户机器上那条绝对路径根本不存在，venv 当场失效。
//    python-build-standalone 官方文档本身的推荐用法就是「直接对解出来的 install_only 发行版
//    跑 pip install，然后把整棵目录当一个原子单位搬走」——它的 relocatable 特性就是为这个场景
//    设计的，venv 这层反而是引入不可搬迁绝对路径的根源。若之后要复核这条判断，找 Lead 对齐。
//
//  用法：
//    node scripts/bundle-python-mac.mjs --dry-run   # 任意平台：只解析计划并打印，不联网不落盘
//    node scripts/bundle-python-mac.mjs             # 只在 macOS 上真跑（非 darwin 直接抛错）
//    node scripts/bundle-python-mac.mjs --no-prune   # 跳过标准库裁剪步骤（调试用）
//
//  可调环境变量（默认值是已用 WebSearch/WebFetch 核实过真实存在的 release，见交付说明）：
//    PYBUILD_PYTHON_SERIES   默认 '3.11'（本仓库本地开发 python 就是 3.11.x，取同系列）
//    PYBUILD_RELEASE_TAG     默认 '20250626'（astral-sh/python-build-standalone 的 release tag）
//    GITHUB_TOKEN            可选：调 api.github.com 时带上，避免匿名请求撞速率限制
//
//  在 Linux/本仓库开发机上你能验的只有 --dry-run（纯逻辑/参数解析，见交付说明「Linux 侧验了什么」）；
//  真下载/解压/pip install 只有 mac CI（.github/workflows/build-platform-mac.yml）跑得通、验得了。
// ═══════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, rmSync, readdirSync, renameSync, createWriteStream, statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'platform-dist');
// 下载缓存目录（**在 platform-dist 之外**：build-platform.mjs 每次会清空 platform-dist，
// 缓存放里面等于没有）。按资产名存，命中即跳过下载。想强制重下就删这个目录。
const CACHE_DIR = join(homedir(), '.cache', 'zerocraft', 'pybuild');

const PYBUNDLE_DIR = join(OUT, 'pybundle');
const REQUIREMENTS = join(ROOT, 'requirements.txt');

const DEFAULT_SERIES = '3.11';
const DEFAULT_RELEASE_TAG = '20250626';
const GH_REPO = 'astral-sh/python-build-standalone';

// 装完后要裁掉的标准库大头子目录（相对 `pybundle/lib/python<series>/`）——GUI(tkinter)/
// 测试套件(test/idle_test)/2to3(lib2to3) 后端服务进程一概用不到，裁了既省体积又省
// assert-no-baked-key 要扫的文件数。找不到就静默跳过（不同 python 版本目录构成略有差异）。
const STDLIB_PRUNE_DIRS = ['test', 'idle_test', 'turtledemo', 'tkinter', 'lib2to3'];

function log(msg) { process.stdout.write(`[bundle-python-mac] ${msg}\n`); }

/** 转义正则元字符（拼资产名正则用）。 */
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** 目标资产文件名的正则（python-build-standalone 命名约定，见文件头注释）。导出供单测用假数据验证。 */
export function assetRegex(series, tag) {
  return new RegExp(`^cpython-${escapeRe(series)}\\.\\d+\\+${escapeRe(tag)}-aarch64-apple-darwin-install_only\\.tar\\.gz$`);
}

/**
 * 从 release 的资产列表里挑恰好一个匹配的 tarball。零命中/多命中都当错误抛出（宁可显式炸,
 * 不要静默挑错文件）——导出供单测注入假资产数组验证匹配/报错逻辑，不依赖真网络。
 * @param {{name:string, browser_download_url:string}[]} assets
 */
export function pickAsset(assets, series, tag) {
  const re = assetRegex(series, tag);
  const hits = assets.filter((a) => re.test(a.name));
  if (hits.length === 0) {
    throw new Error(
      `未在 release ${tag} 的资产列表里找到匹配 ${re} 的 tarball（候选资产数=${assets.length}）。`
      + `去 https://github.com/${GH_REPO}/releases/tag/${tag} 核对实际文件名，`
      + '用 PYBUILD_PYTHON_SERIES / PYBUILD_RELEASE_TAG 环境变量覆盖后重试。',
    );
  }
  if (hits.length > 1) {
    throw new Error(`匹配到 ${hits.length} 个资产（预期恰好 1 个），命名规则可能变了：${hits.map((a) => a.name).join(', ')}`);
  }
  return hits[0];
}

/** 网络动作统一重试（owner 2026-08-06 真机事故：第 3 步 `fetch failed` 整个打包白跑）。
 *  `fetch failed` 是**网络层**失败（DNS/TLS/连接被代理拦/瞬时抖动），不是逻辑错——
 *  一次失败就让 20 分钟的打包全废太脆。指数退避重试 3 次；仍失败则抛带**可操作提示**的错。 */
async function withRetry(what, fn, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === tries) break;
      const waitMs = 2000 * (2 ** (i - 1)); // 2s → 4s
      log(`  ⚠ ${what} 第 ${i}/${tries} 次失败（${e.message}）→ ${waitMs / 1000}s 后重试…`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error(
    `${what} 连续 ${tries} 次失败：${lastErr?.message}\n`
    + '  这是**网络层**失败，不是脚本 bug。逐条排查：\n'
    + '  ① 测通不通： curl -sS -o /dev/null -w \'%{http_code}\\n\' '
    + `https://api.github.com/repos/${GH_REPO}/releases/tags/${DEFAULT_RELEASE_TAG}\n`
    + '  ② 若被墙/代理拦：挂上代理再跑，或用下面③离线路径\n'
    + '  ③ **离线/手工兜底**：自己用浏览器下好那个 .tar.gz，然后\n'
    + '     PYBUILD_TARBALL=/path/to/cpython-….tar.gz bash scripts/build-mac-dmg.sh\n'
    + '  ④ 若是 GitHub API 限流（60 次/小时/IP）：设 GITHUB_TOKEN=<你的 token> 再跑',
  );
}

/** GET JSON，带 UA（api.github.com 匿名请求没有 UA 会被 403）+ 可选 token。 */
async function fetchJson(url) {
  const headers = { 'User-Agent': 'zerocraft-platform-build', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json();
}

/** 流式下载到文件（大文件用，不整个读进内存）。 */
async function download(url, destPath) {
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new Error(`下载失败 GET ${url} → HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

async function sha256Of(filePath) {
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/** 验证 platform-dist/ 已由 scripts/build-platform.mjs 生成（本脚本只管 pybundle 这一段）。 */
function assertPlatformDistExists() {
  if (!existsSync(join(OUT, 'zerocraft.py'))) {
    throw new Error(
      `platform-dist/zerocraft.py 不存在——先跑一次 \`node scripts/build-platform.mjs\` 组装骨架，`
      + '本脚本只负责往里面灌 pybundle/，不负责组装其余部分。',
    );
  }
}

function rmrf(p) { if (existsSync(p)) rmSync(p, { recursive: true, force: true }); }

/** 裁剪标准库大头目录（找不到静默跳过；任何单条失败不阻断整体——裁剪是优化不是正确性前提）。 */
function pruneStdlib(pybundleDir) {
  const libDir = join(pybundleDir, 'lib');
  if (!existsSync(libDir)) { log('  （跳过裁剪：lib/ 目录不存在，目录结构和预期不符？）'); return; }
  const pyVersionDirs = readdirSync(libDir).filter((n) => /^python3\.\d+$/.test(n));
  let prunedBytes = 0;
  for (const verDir of pyVersionDirs) {
    for (const sub of STDLIB_PRUNE_DIRS) {
      const target = join(libDir, verDir, sub);
      if (!existsSync(target)) continue;
      try {
        const size = dirSizeBytes(target);
        rmrf(target);
        prunedBytes += size;
        log(`  裁剪 lib/${verDir}/${sub}/（约 ${(size / 1024 / 1024).toFixed(1)}MB）`);
      } catch (e) {
        log(`  ⚠ 裁剪 lib/${verDir}/${sub}/ 失败（不阻断）：${e.message}`);
      }
    }
  }
  log(`  裁剪合计约 ${(prunedBytes / 1024 / 1024).toFixed(1)}MB`);
}

function dirSizeBytes(p) {
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const name of readdirSync(p)) total += dirSizeBytes(join(p, name));
  return total;
}

/** 递归清 __pycache__（裁完标准库后还会剩一些，pip 装依赖时也会新生成）。 */
function pruneAllPycache(dir) {
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (name === '__pycache__') { rmrf(p); removed++; continue; }
    removed += pruneAllPycache(p);
  }
  return removed;
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const noPrune = argv.includes('--no-prune');
  const series = process.env.PYBUILD_PYTHON_SERIES || DEFAULT_SERIES;
  const tag = process.env.PYBUILD_RELEASE_TAG || DEFAULT_RELEASE_TAG;
  const pattern = assetRegex(series, tag);

  log('计划：');
  log(`  python 系列＝${series}　release tag＝${tag}`);
  log(`  期望资产名匹配＝${pattern}`);
  log(`  release 元数据＝https://api.github.com/repos/${GH_REPO}/releases/tags/${tag}`);
  log(`  落盘目标＝${PYBUNDLE_DIR}`);
  log(`  requirements＝${REQUIREMENTS}`);

  if (dryRun) {
    log('--dry-run：以上是计划，不联网/不下载/不解压/不 pip install（这几步只在 mac 上有意义，真验证留给 mac CI）。');
    log(`（若 platform-dist/ 已存在会顺带检查一下：${existsSync(join(OUT, 'zerocraft.py')) ? '✓ zerocraft.py 在' : '✗ 尚未跑过 build-platform.mjs（真跑前需要先跑）'}）`);
    return;
  }

  if (process.platform !== 'darwin') {
    throw new Error(
      `本脚本的下载/解压/pip install 步骤只在 macOS 上有效（当前平台：${process.platform}）。`
      + '非 mac 环境（含本仓库开发机/Linux CI）请只用 --dry-run 校验参数与逻辑，'
      + '真正的 pybundle 组装留给 .github/workflows/build-platform-mac.yml 的 macos-latest runner。',
    );
  }

  assertPlatformDistExists();
  rmrf(PYBUNDLE_DIR); // 可能残留 build-platform.mjs 写的 PLACEHOLDER.md 占位目录，先清

  // 逃生口①：手工指定本地 tarball（网络被墙/离线机器）——直接跳过 GitHub 全部网络动作。
  const manual = process.env.PYBUILD_TARBALL;
  if (manual && !existsSync(manual)) throw new Error(`PYBUILD_TARBALL 指向的文件不存在：${manual}`);

  let asset = null;
  let release = null;
  if (manual) {
    log(`① 跳过 release 查询——用 PYBUILD_TARBALL 指定的本地包：${manual}`);
  } else {
    log('① 查询 release 资产列表…');
    release = await withRetry('查询 release 元数据',
      () => fetchJson(`https://api.github.com/repos/${GH_REPO}/releases/tags/${tag}`));
    asset = pickAsset(release.assets || [], series, tag);
    log(`  命中资产：${asset.name}`);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'zerocraft-pybuild-'));
  try {
    let tarballPath;
    if (manual) {
      tarballPath = manual;
    } else {
      // 逃生口②：本地缓存。同一个 tag+资产名下载过就复用——**重打包不再重下 ~100MB**，
      // 也让「上一轮下到一半断网」不至于从零开始（owner 2026-08-06：一次抖动整轮白跑）。
      const cached = join(CACHE_DIR, asset.name);
      if (existsSync(cached) && statSync(cached).size > 1024 * 1024) {
        log(`② 命中本地缓存，跳过下载：${cached}`);
        tarballPath = cached;
      } else {
        mkdirSync(CACHE_DIR, { recursive: true });
        const partial = `${cached}.part`;
        log('② 下载…');
        await withRetry('下载 python tarball', () => download(asset.browser_download_url, partial));
        renameSync(partial, cached); // 只有完整下完才落成正式缓存名（防半截文件被当缓存复用）
        tarballPath = cached;
        log(`  已缓存到 ${cached}（下次重打包直接复用）`);
      }
    }

    // 手工指定 tarball（PYBUILD_TARBALL）时没有 release 元数据可查 → 跳过 SHA 校验：
    // 那是用户自己下的文件、来源由用户负责；此处若照旧读 release.assets 会 NPE 崩掉。
    const shaAsset = release && asset
      ? (release.assets || []).find((a) => a.name === `${asset.name}.sha256`)
      : null;
    if (shaAsset) {
      log('  校验 SHA256…');
      const shaRes = await fetch(shaAsset.browser_download_url, {
        headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
      });
      const shaText = await shaRes.text();
      const expected = shaText.trim().split(/\s+/)[0].toLowerCase();
      const actual = await sha256Of(tarballPath);
      if (expected !== actual) {
        throw new Error(`SHA256 不匹配！期望 ${expected}，实际 ${actual}——下载可能被污染/上游资产变了，不继续。`);
      }
      log('  ✓ SHA256 匹配');
    } else {
      log(asset
        ? `  ⚠ 未找到 ${asset.name}.sha256 校验文件，跳过完整性校验（上游不保证每个资产都发校验文件，不当场硬失败，但建议留意）。`
        : '  ⚠ 手工指定的 tarball（PYBUILD_TARBALL）无上游校验文件可比，跳过完整性校验——来源由你自己负责。');
    }

    log('③ 解压…');
    const extractDir = join(tmpDir, 'extract');
    mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['xzf', tarballPath, '-C', extractDir], { stdio: 'inherit' });
    const topEntries = readdirSync(extractDir);
    if (topEntries.length !== 1) {
      throw new Error(`解压后顶层应恰好 1 个目录（通常叫 python/），实际：${topEntries.join(', ')}`);
    }
    mkdirSync(dirname(PYBUNDLE_DIR), { recursive: true });
    renameSync(join(extractDir, topEntries[0]), PYBUNDLE_DIR);
    log(`  → ${PYBUNDLE_DIR}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  const pythonBin = join(PYBUNDLE_DIR, 'bin', 'python3');
  if (!existsSync(pythonBin)) throw new Error(`解压产物里没找到 ${pythonBin}——目录结构和预期（python-build-standalone install_only 布局）不符`);

  log('④ pip install -r requirements.txt（直接装进发行版自身，理由见文件头注释）…');
  execFileSync(pythonBin, ['-m', 'pip', 'install', '--no-cache-dir', '--no-input', '-r', REQUIREMENTS], { stdio: 'inherit' });

  if (!noPrune) {
    log('⑤ 裁剪标准库大头…');
    pruneStdlib(PYBUNDLE_DIR);
    pruneAllPycache(PYBUNDLE_DIR);
  } else {
    log('⑤ --no-prune：跳过标准库裁剪');
  }

  log('⑥ 冒烟：import PIL…');
  execFileSync(pythonBin, ['-c', 'import PIL; print("Pillow", PIL.__version__, "OK")'], { stdio: 'inherit' });

  log(`完成 → ${PYBUNDLE_DIR}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`[bundle-python-mac] 失败：${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
