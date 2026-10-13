#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/click-probe.mjs —— S3 骨架关「点击打穿」门（REQ-S3CLICK·owner 2026-08-07 判 A）
//
//  治的病：S3 现有三道证**全程一次都不点**——manifest 解析 / 引擎装载 + 空跑 2 拍 / 渲染探针
//  （只证画出来了）。于是「按钮画得好看但点了没反应」能一路绿着过 S3。game108 实测踩到两发，
//  两发都**不报错**：
//    ① 宿主自搓 rAF 圈直接 `world.tick()`，绕过 `Engine.step()` 里注入输入那一句
//       ⇒ UI 动作一直往队列里填、永远没人取；
//    ② `props.bind` 没跑 `resolveBindings` ⇒ 进度条永远画在 0，而文字读数是对的。
//  单测绿（测试自己往 InputQueue 塞动作，DOM 那一半从不参与）+ 渲染探针绿（它只画图）。
//  同病史：owner 2026-07-17「绿门不可玩」复盘的药方是给 S4 加验收剧本，**S3 这层的洞没补**。
//
//  界（owner 2026-08-07 立）：
//    · **S3 问「信号打得穿吗」**——点一下，世界动了没。本探针只管这个。
//    · **S4 问「规则对吗」**——打穿之后赢的是不是该赢的那个。那是验收剧本的活，本探针不碰。
//  所以断言刻意只有两条最小项，**不验玩法、不需要 AI、不需要结算闭环**。
//
//  用法：node scripts/click-probe.mjs --game <slug>
//  退出码：0=过（或豁免/无浏览器）· 1=未过 · 2=用法错 · 3=环境无浏览器（跳过·同 R1/R3 语义）
//  产物：public/games/<slug>/probe/S3-click-gate.json（判定 + 逐个控件的点击结果）
// ═══════════════════════════════════════════════════════════════

import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowserRuntime, startDevServer, stopDevServer, deepLinkQuery, cartProbeFixture } from './lib/render-harness.mjs';
import { detectForm } from './game-pipeline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 存量豁免名单（**owner 2026-08-07 明示不回溯**：「先把它落到当前的就可以了，
 * 新游戏的时候再去检验 S3 的情况」）。
 *
 * 照 `pipeline-registry-guard.mjs` 的 `LEGACY_NO_BOARD` 先例：名单**可见、带理由**，
 * 不是静默跳过——豁免的游戏照样跑探针、照样把结果落进 JSON 当参考，只是不判红。
 * **新游戏不在名单里 = 受检。** 想给某个存量游戏转正，把它从名单里删掉再修即可（只减不增）。
 */
export const LEGACY_WAIVED = {
  'game-d': 'owner 2026-08-07 不回溯', 'game-e': 'owner 2026-08-07 不回溯',
  'game-f': 'owner 2026-08-07 不回溯（且已冻结）', 'game-g': 'owner 2026-08-07 不回溯',
  'game-i': 'owner 2026-08-07 不回溯（展示台·非对局游戏）', 'game-z': 'owner 2026-08-07 不回溯（3D·P3D 域）',
  'game-a': 'owner 2026-08-07 不回溯', 'game-b': 'owner 2026-08-07 不回溯',
  'game-c': 'owner 2026-08-07 不回溯', 'game-103': 'owner 2026-08-07 不回溯',
  'game101': 'owner 2026-08-07 不回溯', 'game102': 'owner 2026-08-07 不回溯',
};

/**
 * 静态检查：屏上用了 `props.bind`，游戏却从没调过 `resolveBindings` ⇒ **bind 必然是哑弹**。
 *
 * 为什么单靠点击门抓不到：bind 哑弹时**点击这条线是通的**（数字照变——那来自宿主投影），
 * 只有「条/图形」那条读世界的线断了，点击门看不出区别（2026-08-07 实测撤修，门照绿）。
 * 而这是个**纯静态的必然错**：`mountUI` 没有数据源入口，不自己跑一遍 `resolveBindings(tree, ds)`
 * 就绝无可能生效。所以用静态检查堵，比让浏览器猜可靠。
 *
 * 纯函数（吃文件内容数组·不碰盘）——导出供单测直接灌。
 */
export function checkBindWiring(files) {
  // **先剥注释再判**：注释里提一句 `resolveBindings(...)` 不是调用。
  // （2026-08-07 实测：撤修时只删了 import 与调用、留着解释性注释，检查就被骗过去了。）
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = files.map((f) => ({ path: f.path, text: code(f.text) }));
  const usesBind = src.filter((f) => /\bbind:\s*[^,}\s]/.test(f.text)).map((f) => f.path);
  if (usesBind.length === 0) return { ok: true, detail: '未用 props.bind' };
  const resolves = src.some((f) => /resolveBindings\s*\(/.test(f.text));
  if (resolves) return { ok: true, detail: `${usesBind.length} 处 bind · 已调 resolveBindings` };
  return {
    ok: false,
    detail: `${usesBind.length} 处 props.bind（${usesBind[0]}…）但全游戏没有一处调 resolveBindings`
      + ' ⇒ bind 是哑弹：条/图形永远画在 0，而文字读数可能照常对（静默）。'
      + '修法：宿主交树前跑 `resolveBindings(tree, dataSource)`。',
  };
}

/**
 * 门读码（**纯函数**·不碰盘不 spawn——导出供单测直接灌各种结果，不必真起浏览器
 * 就能验「门怎么判」这条逻辑本身对不对；同 `interpretRenderProbe` 的先例）。
 */
export function interpretClickProbe({ slug, controls, changed, engineMatched, engineRequired = false, consoleErrors, waived, bindWiring, clickFailures = 0 }) {
  if (!waived && bindWiring && !bindWiring.ok) {
    return { exit: 1, summary: `✗ bind 接线：${bindWiring.detail}` };
  }
  if (waived) {
    return { exit: 0, summary: `⚠ 点击门豁免（${waived}）· 实测 ${controls} 个控件 / ${changed} 个点后 DOM 有变化`, waived: true };
  }
  if (controls === 0) {
    return { exit: 1, summary: '✗ 活体 DOM 里一个 [data-action] 控件都没有——UI 完全不可驱动（纯 canvas 玩法请申请豁免）' };
  }
  if (consoleErrors.length > 0) {
    return { exit: 1, summary: `✗ 点击过程有 ${consoleErrors.length} 条控制台 error：${consoleErrors.slice(0, 2).join(' | ')}` };
  }
  if (clickFailures > 0) {
    return { exit: 1, summary: `✗ ${clickFailures} 个控件未能真实点击（被遮挡、超时或对照页无法复位）；不能将失败点击当作“DOM 没变化”` };
  }
  if (engineRequired && engineMatched === 0) {
    return { exit: 1, summary: `✗ ${controls} 个控件已点，但没有匹配的 data-action 经 commandsForTick 进入 Engine.step；本地说明/菜单变化不能冒充世界输入` };
  }
  if (changed === 0) {
    return {
      exit: 1,
      summary: `✗ ${controls} 个控件全点了一遍，DOM 一处都没变——输入接线大概率整条断了`
        + '（查：宿主是不是自搓循环绕过了 Engine.step 的输入注入 / action 有没有接进 ActionSink）',
    };
  }
  const engineEvidence = engineRequired ? `${engineMatched} 个动作真经 Engine.step · ` : '';
  return { exit: 0, summary: `✓ 点击打穿（${controls} 个控件 · ${engineEvidence}${changed} 个点后 DOM 变化 · 零控制台 error）` };
}

/** 有 Engine 输入源的游戏必须证明真实离散动作进入 Engine.step，不能只靠本地 UI 变化。 */
export function requiresEngineInputEvidence(files) {
  return files.some((file) => {
    const code = file.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return /new\s+Engine\s*\(\s*\{[^}]{0,240}\binput\s*(?::|[,}])/.test(code);
  });
}

/** 仅隔离浏览器中使用：借同一个 Vite ESM Engine prototype 旁听输入，绝不伪造动作或写世界。 */
async function installDomEngineProbe(page) {
  await page.evaluate(async () => {
    const { Engine } = await import('/src/runtime/engine.ts');
    const port = { steps: 0, actions: [] };
    const originalStep = Engine.prototype.step;
    if (typeof originalStep !== 'function') throw new Error('Engine.step 不可观察，DOM 点击门 fail-closed');
    Engine.prototype.step = function () {
      port.steps += 1;
      const source = this.input;
      if (!source) return originalStep.call(this);
      const originalCommands = source.commandsForTick;
      source.commandsForTick = function (tick) {
        const commands = originalCommands.call(this, tick);
        for (const command of commands) for (const action of command.actions ?? []) {
          if (action.phase === 'action' && typeof action.key === 'string') {
            port.actions.push({ key: action.key, tick });
          }
        }
        if (port.actions.length > 256) port.actions.splice(0, port.actions.length - 256);
        return commands;
      };
      try { return originalStep.call(this); }
      finally { source.commandsForTick = originalCommands; }
    };
    window.__ZEROCRAFT_S3_DOM_ENGINE_PROBE__ = port;
  });
}

/** 纯数据选出可在当前 Canvas 内点到的 Shape+Clickable 中心；不把启动器按钮算游戏控件。 */
export function canvasClickTargets(manifest, width, height) {
  const entities = manifest?.entities ?? {};
  const camera = Object.values(entities).map((e) => e?.Camera).find(Boolean);
  const zoom = camera?.zoom ?? 1;
  const targets = [];
  for (const [id, comps] of Object.entries(entities).sort(([a], [b]) => a.localeCompare(b))) {
    const click = comps?.Clickable, transform = comps?.Transform, shape = comps?.Shape;
    if (!click || !transform || !shape || !(shape.width > 0) || !(shape.height > 0)) continue;
    if (click.hitMaskKey) continue; // 不拿包围盒中心冒充实形命中；mask 另需烘焙数据选点。
    const sx = camera ? (transform.x - camera.offsetX) * zoom + width / 2 : transform.x;
    const sy = camera ? (transform.y - camera.offsetY) * zoom + height / 2 : transform.y;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    targets.push({ id, action: click.action, x: sx, y: sy });
  }
  return targets;
}

export function interpretCanvasClickProbe({ candidates, hits, consoleErrors }) {
  if (consoleErrors.length) return { exit: 1, summary: `✗ Canvas 点击过程有 ${consoleErrors.length} 条控制台 error：${consoleErrors.slice(0, 2).join(' | ')}` };
  if (candidates === 0) return { exit: 1, summary: '✗ 卡带 Canvas 内无可验的 Shape+Clickable 热点（mask-only 不以包围盒假验）' };
  if (!hits.some((hit) => hit.signalMatched)) return { exit: 1, summary: `✗ 真点 ${candidates} 个 Canvas 热点后，DebugTrace 无对应 clickable/commit：指针→InputQueue→Signal 链未打通` };
  return { exit: 0, summary: `✓ Canvas 点击打穿（${candidates} 个候选 · ${hits.filter((hit) => hit.signalMatched).length} 个具名 Signal 真入世界 · 零控制台 error）` };
}

async function runCanvasCartProbe(slug, rt) {
  const fixture = cartProbeFixture(ROOT, slug);
  const { chromium } = await import('playwright');
  const dev = await startDevServer(ROOT);
  let browser;
  const hits = [], consoleErrors = [];
  let candidates = 0;
  try {
    browser = await chromium.launch({ headless: true, executablePath: rt.execPath, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push(`未捕获异常: ${e.message}`));
    await page.route('**/api/generate/providers', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/library', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
    await page.route(`**/api/library/${slug}/manifest`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
    await page.goto(`http://localhost:${dev.port}/?${deepLinkQuery('cart', slug)}&s3Probe=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__ZEROCRAFT_S3_CLICK_TRACE__?.read === 'function', undefined, { timeout: 8000 });
    const canvas = await page.evaluate(() => {
      const back = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('返回架上'));
      const el = back?.parentElement?.querySelector('canvas');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, logicalWidth: el.width / dpr, logicalHeight: el.height / dpr };
    });
    if (!canvas) throw new Error('卡带运行器 Canvas 未挂载');
    const targets = canvasClickTargets(fixture.manifest, canvas.logicalWidth, canvas.logicalHeight);
    candidates = targets.length;
    for (const target of targets.slice(0, 12)) {
      const x = canvas.left + target.x * canvas.width / canvas.logicalWidth;
      const y = canvas.top + target.y * canvas.height / canvas.logicalHeight;
      if (x < 0 || y < 0 || x >= 1280 || y >= 800) continue;
      const reachable = await page.evaluate(({ x, y }) => {
        const back = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('返回架上'));
        return document.elementFromPoint(x, y) === back?.parentElement?.querySelector('canvas');
      }, { x, y });
      if (!reachable) { hits.push({ id: target.id, action: target.action, signalMatched: false, reason: '被覆盖/不可命中' }); continue; }
      await page.mouse.click(x, y);
      const signalMatched = await page.waitForFunction(({ id, action }) => window.__ZEROCRAFT_S3_CLICK_TRACE__?.read().some(
        (event) => event.what === id && event.why === action,
      ), { id: target.id, action: target.action }, { timeout: 1200 }).then(() => true).catch(() => false);
      hits.push({ id: target.id, action: target.action, x: Math.round(x), y: Math.round(y), signalMatched });
      if (signalMatched) break; // S3 最小断言：至少一条真输入链打通；S4 再验完整玩法。
    }
  } catch (error) {
    consoleErrors.push(`探针异常: ${error.message}`);
  } finally {
    await browser?.close();
    stopDevServer(dev.proc);
  }
  const verdict = interpretCanvasClickProbe({ candidates, hits, consoleErrors });
  const out = join(ROOT, 'public', 'games', slug, 'probe');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'S3-click-gate.json'), JSON.stringify({ slug, form: 'cart', ...verdict, candidates, hits, consoleErrors }, null, 2) + '\n');
  console.log(`[click-probe] ${slug} ${verdict.summary}`);
  return verdict.exit;
}

/** 读该游戏目录下所有 .ts（不含测试）——供静态检查用。 */
function readGameSources(slug) {
  const dir = join(ROOT, 'games', slug);
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.ts') || name.includes('.test.')) continue;
      out.push({ path: `games/${slug}/${name}`, text: readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out;
}

function readEngineHostSources(slug) {
  const dir = join(ROOT, 'games', slug);
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name) || name.includes('.test.')) continue;
      out.push({ path: full, text: readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--game');
  const slug = gi >= 0 ? argv[gi + 1] : undefined;
  if (!slug) { console.error('用法: node scripts/click-probe.mjs --game <slug>'); process.exit(2); }

  const rt = detectBrowserRuntime();
  const form = detectForm(ROOT, slug);
  const bindWiring = form === 'cart' ? undefined : checkBindWiring(readGameSources(slug));
  const engineRequired = form !== 'cart' && requiresEngineInputEvidence(readEngineHostSources(slug));
  if (bindWiring && !bindWiring.ok && !LEGACY_WAIVED[slug]) {
    console.error(`[click-probe] ${slug} ✗ bind 接线：${bindWiring.detail}`);
    process.exit(1);
  }
  if (!rt.ok) { console.error(`[click-probe] ${slug}：本机无 Chromium，跳过（权威判定以有浏览器环境为准）`); process.exit(3); }

  if (form === 'cart') { process.exit(await runCanvasCartProbe(slug, rt)); }
  const { chromium } = await import('playwright');
  const dev = await startDevServer(ROOT);
  let browser;
  const consoleErrors = [];
  const hits = [];
  const discoveredControls = new Set();
  try {
    browser = await chromium.launch({ headless: true, executablePath: rt.execPath });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const control = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const p of [page, control]) {
      p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      p.on('pageerror', (e) => consoleErrors.push(`未捕获异常: ${e.message}`));
      await p.route('**/api/generate/providers', (r) => r.fulfill({ status: 200, body: '[]' }));
      await p.route('**/api/library', (r) => r.fulfill({ status: 200, body: '[]' }));
    }
    const url = `http://localhost:${dev.port}/?${deepLinkQuery(form, slug)}`;
    await Promise.all([page.goto(url, { waitUntil: 'networkidle' }), control.goto(url, { waitUntil: 'networkidle' })]);
    await installDomEngineProbe(page);
    await Promise.all([page.waitForTimeout(800), control.waitForTimeout(800)]);

    // ── 判据：「**不碰它会怎样** vs 碰了会怎样」的对照实验 ────────────────────
    // 两处坑都实测踩过，写在这里免得下一个人重踩：
    //  ① **别用整页快照**（`document.body.innerHTML`）——倒计时环/粒子每帧都在动，
    //     整页永远"在变"，于是「输入接线整条断了」的撤修**照样判绿**（第一版就这样）。
    //  ② **别用 `textContent`**——它含所有后代，叶子一变，`app`/根屏/中区**全部**跟着变，
    //     噪声顺着祖先链爬满全树（第二版就这样：相位标签一跳，五个祖先集体误报）。
    // 现在：只取自身直接文本、内联宽与禁用态。主/对照页在同一状态、同一时间窗
    // 并行观测；每次点后在对照页复演同一动作，再观察下一控件。这样点击后才出现的
    // 倒计时/粒子也仍有同时期反事实，而非依赖开场时采集的静态噪声表。
    const SNAP = `(() => { const m = {};
      for (const el of document.querySelectorAll('[id]')) {
        const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        m[el.id] = own + '§' + (el.style.width || '') + '§' + (el.disabled ? 'D' : '');
      } return m; })()`;
    const snap = (p) => p.evaluate(SNAP);
    const diff = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
    const listControls = () => page.evaluate(`Array.from(document.querySelectorAll('[data-action]'))
      .filter(el => !el.disabled && el.offsetParent !== null && el.id)
      .map(el => ({ id: el.id, r: el.getBoundingClientRect() }))
      .filter(({ id, r }) => r.width > 0 && r.height > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-action]')?.id === id)
      .map(({ id }) => id).reverse()`);

    const STEPS = 12, GAP = 250;
    const seen = new Set();
    for (let i = 0; i < STEPS; i++) {
      const ids = await listControls();
      for (const id of ids) discoveredControls.add(id);
      const next = ids.find((id) => !seen.has(id));
      if (!next) break;
      seen.add(next);

      const [before, baselineBefore] = await Promise.all([snap(page), snap(control)]);
      const selector = `[id=${JSON.stringify(next)}]`;
      const action = await page.locator(selector).getAttribute('data-action');
      const actionsBefore = await page.evaluate(() => window.__ZEROCRAFT_S3_DOM_ENGINE_PROBE__.actions.length);
      try {
        await page.click(selector, { timeout: 1200 });
      } catch (error) {
        hits.push({ id: next, clicked: false, changed: false, error: String(error.message).slice(0, 240) });
        continue;
      }
      await Promise.all([page.waitForTimeout(GAP), control.waitForTimeout(GAP)]);
      const [after, baselineAfter] = await Promise.all([snap(page), snap(control)]);
      const ambient = new Set(diff(baselineBefore, baselineAfter));
      const real = diff(before, after).filter((k) => !ambient.has(k));
      const engineInput = await page.evaluate(({ action, from }) => window.__ZEROCRAFT_S3_DOM_ENGINE_PROBE__.actions
        .slice(from).some((entry) => entry.key === action), { action, from: actionsBefore });
      const hit = { id: next, action, clicked: true, engineInput, changed: real.length > 0, changedIds: real.slice(0, 6) };
      hits.push(hit);
      try {
        await control.click(selector, { timeout: 1200 });
      } catch (error) {
        hit.controlSynced = false;
        hit.error = `对照页复位失败: ${String(error.message).slice(0, 180)}`;
        break;
      }
      await Promise.all([page.waitForTimeout(100), control.waitForTimeout(100)]);
    }
  } catch (error) {
    consoleErrors.push(`探针异常: ${error.message}`);
  } finally {
    await browser?.close();
    stopDevServer(dev.proc);
  }

  const controls = hits.length;
  const changed = hits.filter((h) => h.changed).length;
  const engineMatched = hits.filter((h) => h.engineInput && h.changed).length;
  const waived = LEGACY_WAIVED[slug];
  const clickFailures = hits.filter((h) => !h.clicked || h.controlSynced === false).length;
  const unattempted = [...discoveredControls].filter((id) => !hits.some((hit) => hit.id === id));
  const verdict = interpretClickProbe({ slug, controls, changed, engineMatched, engineRequired, consoleErrors, waived, bindWiring, clickFailures });

  const out = join(ROOT, 'public', 'games', slug, 'probe');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'S3-click-gate.json'),
    JSON.stringify({ slug, ...verdict, discoveredControls: discoveredControls.size, controls, unattempted, changed, engineMatched, engineRequired, clickFailures, hits, bindWiring, consoleErrors }, null, 2) + '\n');

  console.log(`[click-probe] ${slug} ${verdict.summary}`);
  process.exit(verdict.exit);
}

// 被 import 时（单测灌 interpretClickProbe）不跑主流程。
if (process.argv[1] && process.argv[1].endsWith('click-probe.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
