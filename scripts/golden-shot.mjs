#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/golden-shot.mjs —— REQ-RENDERCHECK R3·标准照比对（S5/S8 门加严）
//
//  治的病：R1（render-probe）只证「画面非空白」——不够。UI 换个配色、按钮偷偷挪个位、粒子特效
//  被误删一半，非空白像素方差照样过。药方＝机器拍一张「标准照」当基准，此后每次机器重拍同条件
//  照片逐像素比对——像素漂移由机器客观发现（而非等人肉眼瞟一眼「好像没变吧」），漂移是否
//  「有意为之」则交回人裁（bless=人门语义，note 必填=裁决留痕）。
//
//  三命令：
//    capture --game <slug> [--state boot]   确定性拍照 → 存 golden/<state>.png + ledger 行(candidate)
//    compare --game <slug>                  对每个 blessed 基准重拍同条件照 → 逐像素 diff
//    bless   --game <slug> --state <name> --note "…" [--by 名]   candidate/漂移新照转正为基准
//
//  确定性手段（沿 R1 同款「真起服+真浏览器+真深链」机制，模块复用自 scripts/lib/render-harness.mjs）：
//    · 固定视口（1280×800，不开放 CLI 覆盖——「固定」是确定性的前提，不是可调参数）；
//    · 注入冻结 CSS `*,*::before,*::after{animation:none!important;transition:none!important}`
//      （selector 比字面 spec 多扩到伪元素——同一条规则的完整实现，很多 spinner/loading 用伪元素做动画）；
//    · 装载后等固定初始沉淀（3D 场景 2.6s / 非 3D 1.5s，沿 R1 标定值）+「稳帧」：连续拍照直到两张
//      哈希相同（判定画面已停止变化）或达最多尝试次数（未稳定则如实落 ledger flaky 标记，见下）。
//
//  ★ 诚实边界（写在这里，因为这是最容易被静默糊弄过去的一条）★
//  动效冻结 CSS 盖得住 CSS transition/animation，盖不住 canvas 内由 sim/RAF 驱动的像素内容
//  （粒子系统、程序化贴图、物理模拟画面）——那些不受 CSS 规则管辖。种子固定 + 拍数固定的前提下，
//  这类内容"应该"是确定性的（同输入同输出）；如果某游戏实测跑「稳帧」也拍不稳（见 captureStableScreenshot
//  的 stable/attempts 返回值），本脚本如实在 ledger 该行标 `flaky: true` 并在 capture 输出里报警，
//  转 Lead 裁决具体阈值/该状态要不要加遮罩——**不允许为了让某个游戏"看起来能过"而静默调松
//  CHANNEL_TOLERANCE/DIFF_RATIO_THRESHOLD 这两个全局阈值**（那是在所有游戏头上撒谎）。
//
//  产物（public/games/<slug>/golden/，一游戏一份）：
//    <state>.png             该 state 当前候选或已签核照片；已签核 state 不可再次 capture。
//    <state>-diff.png        仅 compare 判红时生成的可视化 diff（差异像素纯红高亮·其余原图调暗）
//    golden-ledger.json      台账：{version, slug, states:{<state>:{status,sha256,capturedAt,
//                             blessedAt,blessedBy,note,viewport,flaky,gameHash}}, history:[...]}
//
//  单文件双重身份设计（读代码前须知，否则容易看错语义）：
//    `golden/<state>.png` 在 candidate 阶段可重拍；一旦 bless 即成为不可覆盖的基准照。后续
//    有意变更必须使用新的 state 名创建候选，不能拿 capture 覆写旧基准。compare 只读基准
//    （从不写它）；bless 只是把候选照转为基准。人裁流程＝ compare 判红 → 人看 diff 图确认这是有意变更 →
//    重新 capture（写入新照片+转回 candidate）→ bless（转正）。
//
//  退出码：
//    capture: 0=拍到且写盘（即使 flaky 也是 0——candidate 状态本就允许后续人裁）
//             1=起服/装载失败  2=用法错（缺 --game/未知游戏/非法 --state）  3=环境无浏览器
//    compare: 0=全部 blessed 基准过（含"无 blessed 基准可比"这种平凡通过——见下方 NO_BASELINE）
//             1=至少一个 blessed 基准漂移判红  2=用法错  3=环境无浏览器
//             （无 blessed 基准时**不碰浏览器**——ledger 先读一遍 states 就知道要不要起服，
//             这也是 golden-shot.test.mjs 能不起真浏览器就测「无基准=过带警」的原因）
//    bless:   0=转正成功  1=业务拒绝（--note 空/找不到候选照）  2=用法错（不碰浏览器·无退出码 3）
//
//  S5/S8 门接线见 game-pipeline.mjs 的 `blessedStates` 引用 + `interpretGoldenCompare`（沿 R1 的
//  interpretRenderProbe 同款模式：门先做 fs 级「有没有 blessed 基准」判断，有才真起服跑 compare
//  子进程；退出码 3 不算红——判定权威以"有浏览器的环境"为准）。
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import {
  detectBrowserRuntime, decodePNG, deepLinkQuery, startDevServer, stopDevServer,
} from './lib/render-harness.mjs';
import {
  goldenDir, shotPath, diffShotPath, readLedger, writeLedger, blessedStates,
} from './lib/golden-ledger.mjs';
import { detectForm, gameHash } from './game-pipeline.mjs';

export { blessedStates };

const HERE = dirname(fileURLToPath(import.meta.url));
// 同 render-probe.mjs 同名同义：生产不设，真起服+真浏览器需要真正 npm install 过的仓库检出；
// 测试用它把 CLI 指向 mkdtempSync 沙盒根（无基准/参数校验/退出码 3 这几条不碰浏览器的路径可测）。
export const ROOT = process.env.ZEROCRAFT_PIPELINE_ROOT || process.env.APOLLO_PIPELINE_ROOT || join(HERE, '..');

// ── 常量（阈值全部带注释——改这两个数=改全库判定口径，不许拍脑袋）─────────────────
export const FIXED_VIEWPORT = { width: 1280, height: 800 }; // 固定视口=确定性前提，不开 CLI 覆盖
export const DEFAULT_STATE = 'boot';
// state 目前只是标签（沿用 R1 同一条 boot 深链装载，不额外导航）——多状态（menu/battle/…）依赖
// R2b 真界面驱动器接入后才能真正让不同 state 落在不同画面，这里先把台账/命令形状搭好等它接线。
export const MAX_SETTLE_ATTEMPTS = 5;
export const SETTLE_INTERVAL_MS = 220;

// 单像素通道差容差：真实截图在同一构建下重复拍摄，天然存在字体抗锯齿/半透明合成这类 sub-pixel
// 级编码噪声——8（0-255 尺度上约 3%）吸收得掉这类噪声，但仍能抓到肉眼可辨的颜色改动（比如
// #2b3542→#3a4a5c 这类色板调整，单通道差普遍 >20，远超阈值）。假信心自查见 golden-shot.test.mjs
// （容差临时调到 Infinity 应让"平移噪声判红"测试转红——已实跑验证，见 R3 提交说明）。
export const CHANNEL_TOLERANCE = 8;
// 超差像素占比容差：≤0.5%——留给渲染时序抖动（如单帧内一两条抗锯齿边缘微移半像素）的余量，
// 任何肉眼可见的布局/配色/内容改动的像素占比远超此值（一整块 UI 挪位/换色通常是 5%-50% 量级）。
// 施工令写死的数——不得为了消红静默调大，实测某游戏真过不了就如实标 flaky 报 Lead 裁。
export const DIFF_RATIO_THRESHOLD = 0.005;

// 台账 IO（读/写/blessedStates）与路径构造（goldenDir/shotPath/diffShotPath）下沉到
// scripts/lib/golden-ledger.mjs（断循环 import——见该文件头注）。

const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');
const STATE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

// ── 像素 diff 数学（纯函数·不碰盘不起浏览器·输入=decodePNG() 的解码结果）───────────
/**
 * 逐像素 diff：RGB 三通道取最大差值（忽略 alpha——截图不透明，且 alpha 差不代表可见内容变了），
 * 超过 tolerance 判该像素"超差"；超差像素占比超过 ratioThreshold 判整图漂移（pass=false）。
 */
export function diffPixels(imgA, imgB, { tolerance = CHANNEL_TOLERANCE, ratioThreshold = DIFF_RATIO_THRESHOLD } = {}) {
  const { width, height, channels: chA, pixels: a } = imgA;
  const { channels: chB, pixels: b } = imgB;
  const total = width * height;
  const diffMask = new Uint8Array(total);
  let diffCount = 0;
  let maxChannelDiff = 0;
  const cmpChannels = Math.min(chA, chB, 3);
  for (let i = 0; i < total; i++) {
    const oa = i * chA, ob = i * chB;
    let worst = 0;
    for (let c = 0; c < cmpChannels; c++) {
      const d = Math.abs(a[oa + c] - b[ob + c]);
      if (d > worst) worst = d;
    }
    if (worst > maxChannelDiff) maxChannelDiff = worst;
    if (worst > tolerance) { diffMask[i] = 1; diffCount++; }
  }
  const ratio = total === 0 ? 0 : diffCount / total;
  return { pass: ratio <= ratioThreshold, diffCount, total, ratio, maxChannelDiff, diffMask, width, height };
}

// ── diff 可视化 PNG 编码（RGB8·filter 0·同 contact-sheet.mjs 手法）────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** 差异像素=纯红高亮；未变像素=基准原图调暗（留上下文·让红色跳出来）。 */
function encodeDiffPNG(blessedImg, diffMask) {
  const { width, height, channels } = blessedImg;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (width * 3 + 1);
    raw[rowOff] = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = rowOff + 1 + x * 3;
      if (diffMask[i]) {
        raw[o] = 255; raw[o + 1] = 0; raw[o + 2] = 0;
      } else {
        const bo = i * channels;
        const lum = channels >= 3
          ? (blessedImg.pixels[bo] + blessedImg.pixels[bo + 1] + blessedImg.pixels[bo + 2]) / 3
          : blessedImg.pixels[bo];
        const dim = Math.round(lum * 0.35);
        raw[o] = dim; raw[o + 1] = dim; raw[o + 2] = dim;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 浏览器侧机制（真起服+真浏览器——capture/compare 共用）───────────────────────
const FREEZE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important}';

/** 冻结 CSS 尽早注入（document-start）：documentElement/head 在这一刻可能还不存在（HTML 尚未解析），
 *  故 attach() 允许静默 no-op，靠 DOMContentLoaded + MutationObserver 兜底补一次。 */
async function injectFreezeCSS(page) {
  await page.addInitScript((css) => {
    function attach() {
      if (document.getElementById('__golden_freeze__')) return;
      const host = document.head || document.documentElement;
      if (!host) return;
      const style = document.createElement('style');
      style.id = '__golden_freeze__';
      style.textContent = css;
      host.appendChild(style);
    }
    attach();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
    try { new MutationObserver(() => attach()).observe(document, { childList: true, subtree: true }); } catch { /* 极端环境无 MutationObserver 兜底也够 */ }
  }, FREEZE_CSS);
}

/** 同 R1：只拦启动器壳层两条引导态接口（与被测游戏内容无关），其余请求原样放行真网络。 */
async function installRouteGuards(page) {
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

/** 深链装载 + 固定初始沉淀等待（3D 场景 2.6s／非 3D 1.5s·沿 R1 标定值）。 */
async function loadAndSettle(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('canvas, [data-action]', { timeout: 8000 }).catch(() => {});
  const has3d = await page.$('canvas');
  await page.waitForTimeout(has3d ? 2600 : 1500);
}

/** 稳帧：连续拍照直到两张哈希相同（画面已停），或耗尽 attempts 次仍不稳（flaky——诚实边界见头注）。 */
async function captureStableScreenshot(page, { attempts = MAX_SETTLE_ATTEMPTS, intervalMs = SETTLE_INTERVAL_MS } = {}) {
  let last = null, lastHash = null;
  for (let i = 0; i < attempts; i++) {
    const shot = await page.screenshot();
    const hash = sha256Hex(shot);
    if (lastHash !== null && hash === lastHash) return { screenshot: shot, stable: true, attempts: i + 1 };
    last = shot; lastHash = hash;
    if (i < attempts - 1) await page.waitForTimeout(intervalMs);
  }
  return { screenshot: last, stable: false, attempts };
}

// ── capture ────────────────────────────────────────────────────────────────
async function runCapture(slug, { root = ROOT } = {}) {
  const form = detectForm(root, slug);
  if (!form) return { usageError: `未知游戏: ${slug}（library/public/games/games 三处均无）` };
  const rt = detectBrowserRuntime();
  if (!rt.ok) return { noBrowser: true, reason: rt.reason };

  let dev;
  try { dev = await startDevServer(root); }
  catch (e) { return { ok: false, reason: `vite dev 起服失败 · ${e.message}` }; }

  const { chromium } = await import('playwright');
  let browser; let shotResult = null; let navError = null;
  try {
    browser = await chromium.launch({ headless: true, executablePath: rt.execPath, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: FIXED_VIEWPORT });
    await injectFreezeCSS(page);
    await installRouteGuards(page);
    try {
      await loadAndSettle(page, `http://localhost:${dev.port}/?${deepLinkQuery(form, slug)}`);
      shotResult = await captureStableScreenshot(page);
    } catch (e) { navError = String(e.message || e).slice(0, 400); }
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    stopDevServer(dev.proc);
  }
  if (navError && !shotResult) return { ok: false, reason: `装载失败 · ${navError}` };
  return { ok: true, form, ...shotResult };
}

function upsertCaptureRow(root, slug, state, { sha256, stable, attempts }) {
  const ledger = readLedger(root, slug);
  const prev = ledger.states[state];
  const now = new Date().toISOString();
  const wasBlessed = prev?.status === 'blessed';
  ledger.states[state] = {
    ...prev,
    status: 'candidate',
    sha256,
    viewport: FIXED_VIEWPORT,
    capturedAt: now,
    gameHash: gameHash(root, slug),
    flaky: !stable,
    flakyNote: stable ? undefined : `画面在 ${attempts} 次尝试内未稳定（诚实边界：可能是 sim/canvas 驱动的非确定性内容——不许静默调松全局阈值，报 Lead 裁阈值/遮罩）`,
  };
  ledger.history.push({ action: 'capture', state, at: now, sha256, stable, attempts, wasBlessed });
  writeLedger(root, slug, ledger);
  return { row: ledger.states[state], wasBlessed };
}

// ── compare ────────────────────────────────────────────────────────────────
async function runCompare(slug, { root = ROOT, states: requestedStates } = {}) {
  const form = detectForm(root, slug);
  if (!form) return { usageError: `未知游戏: ${slug}（library/public/games/games 三处均无）` };
  const ledger = readLedger(root, slug);
  const states = requestedStates?.length
    ? requestedStates
    : blessedStates(root, slug);
  const unblessed = states.filter((s) => ledger.states[s]?.status !== 'blessed');
  if (unblessed.length) {
    return { ok: false, code: 'UNBLESSED_STATE', reason: `指定标准照未签核：${unblessed.join(', ')}`, states: [] };
  }
  if (!states.length) return { ok: true, noBaseline: true, slug, states: [] };

  const rt = detectBrowserRuntime();
  if (!rt.ok) return { noBrowser: true, reason: rt.reason };

  let dev;
  try { dev = await startDevServer(root); }
  catch (e) { return { ok: false, reason: `vite dev 起服失败 · ${e.message}` }; }

  const { chromium } = await import('playwright');
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ headless: true, executablePath: rt.execPath, args: ['--no-sandbox'] });
    for (const state of states) {
      const blessedFile = shotPath(root, slug, state);
      if (!existsSync(blessedFile)) {
        results.push({ state, ok: false, reason: 'blessed 基准文件缺失（golden/<state>.png 不在盘·ledger 与磁盘不一致）' });
        continue;
      }
      const row = ledger.states[state];
      const page = await browser.newPage({ viewport: row.viewport || FIXED_VIEWPORT });
      await injectFreezeCSS(page);
      await installRouteGuards(page);
      let shotResult = null; let navError = null;
      try {
        await loadAndSettle(page, `http://localhost:${dev.port}/?${deepLinkQuery(form, slug)}`);
        shotResult = await captureStableScreenshot(page);
      } catch (e) { navError = String(e.message || e).slice(0, 400); }
      await page.close().catch(() => {});
      if (navError && !shotResult) { results.push({ state, ok: false, reason: `装载失败 · ${navError}` }); continue; }

      const blessedImg = decodePNG(readFileSync(blessedFile));
      let candidateImg;
      try { candidateImg = decodePNG(shotResult.screenshot); }
      catch (e) { results.push({ state, ok: false, reason: `候选截图解码失败 · ${e.message}` }); continue; }
      if (candidateImg.width !== blessedImg.width || candidateImg.height !== blessedImg.height) {
        results.push({ state, ok: false, reason: `尺寸不符（基准 ${blessedImg.width}×${blessedImg.height} vs 候选 ${candidateImg.width}×${candidateImg.height}）`, dimMismatch: true });
        continue;
      }
      const diff = diffPixels(blessedImg, candidateImg);
      const entry = {
        state, ok: diff.pass, ratio: Math.round(diff.ratio * 100000) / 100000,
        diffCount: diff.diffCount, total: diff.total, maxChannelDiff: diff.maxChannelDiff, stable: shotResult.stable,
      };
      if (!diff.pass) {
        const diffPng = encodeDiffPNG(blessedImg, diff.diffMask);
        writeFileSync(diffShotPath(root, slug, state), diffPng);
        entry.diffImage = relative(root, diffShotPath(root, slug, state));
      }
      results.push(entry);
    }
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    stopDevServer(dev.proc);
  }

  const ok = results.every((r) => r.ok);
  const ledger2 = readLedger(root, slug);
  ledger2.history.push({ action: 'compare', at: new Date().toISOString(), ok, results: results.map((r) => ({ state: r.state, ok: r.ok, ratio: r.ratio })) });
  writeLedger(root, slug, ledger2);
  return { ok, slug, states: results };
}

// ── bless（纯 fs·不碰浏览器）────────────────────────────────────────────────
function runBless(slug, state, note, by, { root = ROOT } = {}) {
  const form = detectForm(root, slug);
  if (!form) return { ok: false, code: 'UNKNOWN_GAME', reason: `未知游戏: ${slug}（library/public/games/games 三处均无）` };
  if (!note || !note.trim()) return { ok: false, code: 'NOTE_REQUIRED', reason: 'bless 必须带 --note（人门语义·裁决留痕·不许空签）' };
  const target = shotPath(root, slug, state);
  if (!existsSync(target)) return { ok: false, code: 'NO_CANDIDATE', reason: `未找到候选照 golden/${state}.png（先跑 capture --game ${slug} --state ${state}）` };

  const sha256 = sha256Hex(readFileSync(target));
  const ledger = readLedger(root, slug);
  const now = new Date().toISOString();
  const prev = ledger.states[state] || {};
  const blessedBy = (by && by.trim()) || 'operator';
  ledger.states[state] = {
    ...prev,
    status: 'blessed',
    sha256,
    blessedAt: now,
    blessedBy,
    note: note.trim().slice(0, 500),
  };
  ledger.history.push({ action: 'bless', state, at: now, by: blessedBy, note: ledger.states[state].note, sha256 });
  writeLedger(root, slug, ledger);
  return { ok: true, slug, state, ...ledger.states[state] };
}

// ── CLI ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const usage = () => console.error('用法: node scripts/golden-shot.mjs <capture|compare|bless> --game <slug> [--state boot] [--note "…"] [--by 名]');

  if (!['capture', 'compare', 'bless'].includes(cmd)) { usage(); process.exit(2); }
  const slug = opt('--game');
  if (!slug) { usage(); process.exit(2); }
  if (!detectForm(ROOT, slug)) { console.error(`未知游戏: ${slug}（library/public/games/games 三处均无）`); process.exit(2); }

  if (cmd === 'capture') {
    const state = opt('--state') || DEFAULT_STATE;
    if (!STATE_NAME_RE.test(state)) { console.error(`非法 --state：${state}（只认字母/数字/下划线/连字符）`); process.exit(2); }
    const ledger = readLedger(ROOT, slug);
    if (ledger.states[state]?.status === 'blessed') {
      console.error(`拒绝覆盖已签核基准 '${state}'；请使用新的 --state 名创建 candidate。`);
      process.exit(1);
    }
    const rtPre = detectBrowserRuntime();
    if (!rtPre.ok) { console.log(JSON.stringify({ ok: false, code: 'NO_BROWSER', slug, reason: rtPre.reason })); process.exit(3); }

    const result = await runCapture(slug, { root: ROOT });
    if (result.usageError) { console.error(result.usageError); process.exit(2); }
    if (result.noBrowser) { console.log(JSON.stringify({ ok: false, code: 'NO_BROWSER', slug, reason: result.reason })); process.exit(3); }
    if (!result.ok) { console.error(`✗ capture 失败 · ${result.reason}`); process.exit(1); }

    mkdirSync(goldenDir(ROOT, slug), { recursive: true });
    writeFileSync(shotPath(ROOT, slug, state), result.screenshot);
    const sha256 = sha256Hex(result.screenshot);
    const { row, wasBlessed } = upsertCaptureRow(ROOT, slug, state, { sha256, stable: result.stable, attempts: result.attempts });
    if (!result.stable) console.error(`⚠ flaky：state '${state}' 在 ${result.attempts} 次尝试内未稳定——已如实记 ledger，不代表判定失败`);
    console.log(JSON.stringify({ ok: true, slug, state, sha256, stable: result.stable, attempts: result.attempts, flaky: row.flaky, wasBlessed, png: relative(ROOT, shotPath(ROOT, slug, state)) }));
    process.exit(0);
  }

  if (cmd === 'compare') {
    const state = opt('--state');
    if (state && !STATE_NAME_RE.test(state)) { console.error(`非法 --state：${state}（只认字母/数字/下划线/连字符）`); process.exit(2); }
    const blessed = state ? [state] : blessedStates(ROOT, slug);
    if (state && !blessedStates(ROOT, slug).includes(state)) {
      console.log(JSON.stringify({ ok: false, code: 'UNBLESSED_STATE', slug, reason: `指定标准照未签核：${state}`, states: [] }));
      process.exit(1);
    }
    if (!blessed.length) {
      console.log(JSON.stringify({ ok: true, slug, code: 'NO_BASELINE', reason: '无 blessed 标准照可比（golden-shot bless 先建基准）', states: [] }));
      process.exit(0);
    }
    const rtPre = detectBrowserRuntime();
    if (!rtPre.ok) { console.log(JSON.stringify({ ok: false, code: 'NO_BROWSER', slug, reason: rtPre.reason })); process.exit(3); }

    const result = await runCompare(slug, { root: ROOT, states: blessed });
    if (result.usageError) { console.error(result.usageError); process.exit(2); }
    if (result.noBrowser) { console.log(JSON.stringify({ ok: false, code: 'NO_BROWSER', slug, reason: result.reason })); process.exit(3); }
    if (result.ok === false && !result.states) { console.error(`✗ compare 失败 · ${result.reason}`); process.exit(1); }
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === 'bless') {
    const state = opt('--state');
    const note = opt('--note');
    const by = opt('--by');
    if (!state) { usage(); process.exit(2); }
    if (!STATE_NAME_RE.test(state)) { console.error(`非法 --state：${state}（只认字母/数字/下划线/连字符）`); process.exit(2); }
    const result = runBless(slug, state, note, by, { root: ROOT });
    if (!result.ok) { console.error(`✗ bless 拒绝 · ${result.reason}`); process.exit(1); }
    console.log(JSON.stringify(result));
    process.exit(0);
  }
}

export {
  runCapture, runCompare, runBless, captureStableScreenshot, encodeDiffPNG,
};
