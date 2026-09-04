#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/render-probe.mjs —— REQ-RENDERCHECK R1·渲染冒烟探针（S3 门机器证）
//
//  治的病：S3 现有门（parseManifest+真引擎 load+空跑 2tick）只证「逻辑跑得动」——
//  manifest 能解析、引擎能空转两 tick，跟「浏览器里这游戏画面到底画没画出来」毫无关系。
//  药方＝把渲染器自己当客观判定器：真起本仓 vite 开发服务 → 真 Chromium 装载该游戏（走跟玩家
//  一样的 `?game=<slug>` 深链）→ 机器读三件事（非空白像素 / 控制台零 error / 无未捕获异常或
//  错误浮层）→ 自动截图落盘=门证，人不用再上场肉眼看一遍「有没有画面」。
//
//  用法：
//    node scripts/render-probe.mjs --game <slug>
//  退出码：
//    0 = 三断言全过（画面非空白 · 控制台零 error · 无未捕获异常/错误浮层）
//    1 = 断言未过（渲染判红：空白/花屏太单调、控制台有 error、未捕获异常或 Vite 错误浮层）
//    2 = 用法错（缺 --game / 未知 slug）
//    3 = 环境无浏览器（本机找不到可执行的 Chromium）——探针跳过，不算失败，
//        权威判定以"有浏览器的环境"为准（本容器有）。
//
//  产物（覆盖式·一游戏一份）：
//    public/games/<slug>/probe/S3-render.png   真实截图
//    public/games/<slug>/probe/S3-render.json  判定 JSON（时间/gameHash/三断言/方差值）
//
//  机制笔记：
//   · 服务面选 `vite dev`（非 build+preview）——冷启动 <1s、天然反映当前源码，不必每次先 npm run build；
//     构建产物的完整性已由 S8（tsc+vitest+build 三绿）另行把关，S3 不必重复背。
//   · 真游戏走同一条 `#app` 深链（`?game=<slug>` / cart 形态 `?game=lib:<slug>`）——跟玩家点开
//     启动器看到的是同一份挂载代码，不是另起一条测试专用路径。
//   · 本地路由拦截（P1b/沉浸模式代理同款手法）：启动器壳层 mount 时无条件探 :4000 创作服务
//     两个引导态接口（/api/generate/providers、/api/library）——这与被测游戏内容无关，本机没
//     起 python 后端时会打两条 ERR_CONNECTION_REFUSED 控制台错误，误伤"控制台零 error"断言。
//     只精确拦这两条、原样放行其余请求（游戏自己的资源/API 一律走真网络——卡带游戏若真依赖
//     :4000 数据且后端没起，探针照实判红，不是我们要盖住的地方）。
//   · Chromium 走本仓真实固定路径（同 shoot-game.mjs / studio-design-draft-e2e.mjs 先例）：
//     本地 `playwright` 包解析到的 revision 与容器预置的浏览器版本不一定对得上（实测踩过——
//     package.json 声明 1.61.1 时 chromium.executablePath() 指向 1228，但 /opt/pw-browsers 只预置
//     了 1194），显式给 executablePath 绕开这层版本耦合。
//   · 浏览器探测/PNG 解码/深链构造/vite 起停服务已抽到 `scripts/lib/render-harness.mjs`（REQ-RENDERCHECK
//     R3 施工时抽取·供 golden-shot.mjs 复用同一套机制），本文件从那里 import——对外导出签名不变。
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_CHROMIUM, detectBrowserRuntime, decodePNG, deepLinkQuery, startDevServer, stopDevServer,
} from './lib/render-harness.mjs';

export { DEFAULT_CHROMIUM, detectBrowserRuntime, decodePNG, deepLinkQuery };

const HERE = dirname(fileURLToPath(import.meta.url));
// ZEROCRAFT_PIPELINE_ROOT（旧名 APOLLO_PIPELINE_ROOT）与 game-pipeline.mjs 同名同义——生产不设，
// 探针天然要连「真运行中的 app」（vite 起服 + 浏览器装载 + 真游戏注册表），跟别的门那种
// 「随便指个空临时目录」式沙盒测试前提不兼容：指向的必须是一个真正 `npm install` 过的仓库检出。
export const ROOT = process.env.ZEROCRAFT_PIPELINE_ROOT || process.env.APOLLO_PIPELINE_ROOT || join(HERE, '..');

// ── 游戏识别（复用 game-pipeline 的形态判定·同一份真相）──────────────────────
import { detectForm, gameHash } from './game-pipeline.mjs';

// ── 像素方差（纯函数·零依赖·不起浏览器·R1 专属判定——PNG 解码/浏览器探测已下沉共用模块）───
/** 像素方差（灰度亮度 (R+G+B)/3 的总体方差）。纯色截图必得 0；真内容截图远高于阈值。 */
export function pixelVariance(pngBuf) {
  const { width, height, channels, pixels } = decodePNG(pngBuf);
  const n = width * height;
  if (n === 0) return { variance: 0, mean: 0, width, height };
  let sum = 0;
  const lum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const base = i * channels;
    const l = (channels === 1 || channels === 2) ? pixels[base] : (pixels[base] + pixels[base + 1] + pixels[base + 2]) / 3;
    lum[i] = l;
    sum += l;
  }
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) { const d = lum[i] - mean; sq += d * d; }
  return { variance: sq / n, mean, width, height };
}

// 方差阈值：低于此值＝画面几乎同一种颜色（纯黑/纯白/单色）→ 判「空白」。
// 真实游戏截图实测方差都在几百到上千量级（game-i≈537 · game-103≈342），纯色恒为 0，
// 15 留了充分安全边际——既不会把「有一点点抗锯齿噪声的纯色图」误判成非空白，也远低于任何
// 有实际内容的画面。假信心自查见 render-probe.test.mjs（阈值置 0 应让纯色判红测试转红）。
export const DEFAULT_VARIANCE_THRESHOLD = 15;

/** 判「空白」＝方差严格小于阈值。阈值=0 时恒为 false（"一切都算非空白"——假信心自查用）。 */
export function isBlank(variance, threshold = DEFAULT_VARIANCE_THRESHOLD) {
  return variance < threshold;
}

// ── 探针主流程（真起服+真浏览器+真装载·深链构造/vite 起停服已下沉共用模块）───────
async function runProbe(slug, { root = ROOT, viewport = { width: 1280, height: 800 } } = {}) {
  const form = detectForm(root, slug);
  if (!form) return { usageError: `未知游戏: ${slug}（library/public/games/games 三处均无）` };

  const rt = detectBrowserRuntime();
  if (!rt.ok) return { noBrowser: true, reason: rt.reason };

  let dev;
  try {
    dev = await startDevServer(root);
  } catch (e) {
    return { ok: false, reason: `vite dev 起服失败 · ${e.message}` };
  }

  const { chromium } = await import('playwright');
  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  let overlay = false;
  let shot = null;
  let navError = null;

  try {
    browser = await chromium.launch({ headless: true, executablePath: rt.execPath, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport });
    // 本地路由拦截（P1b/沉浸模式代理同款手法）：只挡启动器壳层的两条引导态接口，
    // 其余请求原样放行（游戏自己的真实资源/API 一律走真网络）。
    await page.route('**/api/generate/providers', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/library', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));

    const url = `http://localhost:${dev.port}/?${deepLinkQuery(form, slug)}`;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForSelector('canvas, [data-action]', { timeout: 8000 }).catch(() => {});
      const has3d = await page.$('canvas');
      await page.waitForTimeout(has3d ? 2600 : 1500);
      overlay = await page.evaluate(() => !!document.querySelector('vite-error-overlay')).catch(() => false);
      shot = await page.screenshot();
    } catch (e) {
      navError = String(e.message || e).slice(0, 400);
    }
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    stopDevServer(dev.proc);
  }

  if (navError && !shot) return { ok: false, reason: `装载失败 · ${navError}` };

  const { variance, mean } = pixelVariance(shot);
  const nonBlank = { pass: !isBlank(variance), variance: Math.round(variance * 100) / 100, mean: Math.round(mean * 100) / 100, threshold: DEFAULT_VARIANCE_THRESHOLD };
  const consoleOk = { pass: consoleErrors.length === 0, count: consoleErrors.length, messages: consoleErrors.slice(0, 5) };
  const noUncaught = { pass: pageErrors.length === 0 && !overlay, pageErrors: pageErrors.length, overlay, messages: pageErrors.slice(0, 5) };
  const pass = nonBlank.pass && consoleOk.pass && noUncaught.pass;

  return {
    ok: pass, form, port: dev.port, browser: { execPath: rt.execPath, via: rt.via },
    assertions: { nonBlank, consoleErrors: consoleOk, noUncaught },
    screenshot: shot,
  };
}

// ── 落盘（覆盖式）────────────────────────────────────────────────────────
function writeArtifacts(root, slug, result) {
  const dir = join(root, 'public', 'games', slug, 'probe');
  mkdirSync(dir, { recursive: true });
  const pngPath = join(dir, 'S3-render.png');
  const jsonPath = join(dir, 'S3-render.json');
  if (result.screenshot) writeFileSync(pngPath, result.screenshot);
  const record = {
    slug, at: new Date().toISOString(), gameHash: gameHash(root, slug),
    ok: result.ok, form: result.form,
    assertions: result.assertions,
    screenshot: result.screenshot ? `public/games/${slug}/probe/S3-render.png` : null,
    browser: result.browser,
  };
  writeFileSync(jsonPath, JSON.stringify(record, null, 2) + '\n');
  return { pngPath, jsonPath, record };
}

// ── CLI ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--game');
  const slug = gi >= 0 ? argv[gi + 1] : null;
  if (!slug) {
    console.error('用法: node scripts/render-probe.mjs --game <slug>');
    process.exit(2);
  }
  if (!detectForm(ROOT, slug)) {
    console.error(`未知游戏: ${slug}（library/public/games/games 三处均无）`);
    process.exit(2);
  }

  const rtPre = detectBrowserRuntime();
  if (!rtPre.ok) {
    console.log(JSON.stringify({ ok: false, code: 'NO_BROWSER', slug, reason: rtPre.reason }));
    process.exit(3);
  }

  const result = await runProbe(slug, { root: ROOT });
  if (result.usageError) { console.error(result.usageError); process.exit(2); }
  if (result.noBrowser) { console.log(JSON.stringify({ ok: false, code: 'NO_BROWSER', slug, reason: result.reason })); process.exit(3); }
  if (result.ok === false && !result.assertions) {
    // 起服/装载层面的失败（非三断言判定）——同样落红，但没有像素/截图可写。
    console.error(`✗ 探针失败（未到断言阶段）· ${result.reason}`);
    process.exit(1);
  }

  const { jsonPath, pngPath, record } = writeArtifacts(ROOT, slug, result);
  console.log(JSON.stringify({ ...record, pngPath, jsonPath }));
  process.exit(result.ok ? 0 : 1);
}

export { runProbe, writeArtifacts };
