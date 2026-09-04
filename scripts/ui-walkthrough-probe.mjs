#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/ui-walkthrough-probe.mjs —— REQ-RENDERCHECK R2b·真界面走查驱动器（S4 门追加证）
//
//  治的病：S4 门（acceptance-run.mjs）证的是「引擎逻辑按 GD 剧本走没走对」——薄适配契约直接
//  喂 world，从不碰 DOM。渲染器另一半没人查：**真玩家能不能靠真点按钮把这条剧本走出来**（按钮在不在
//  · 点得到点不到 · 点了会不会炸）。药方＝渲染器当客观判定器同一条思路（R1/R3）再往前一步：
//  真起 vite 开发服 + 真 Chromium 装该游戏 → 逐条剧本 signal 步骤，找活体 DOM 里匹配的
//  `[data-action]`（R2a 已给全控件贴 data-ui-id/data-action/data-arg）→ 真点击 → 等一帧。
//
//  ★ 侦察结论（先读这段，再读代码——不然容易觉得下面的实现「偷工减料」）★
//  1) 剧本格式（scripts/acceptance-schema.mjs）：{name,game,seed,steps:[{signal,args?,by?}|{tick:N}|{expect:[...]}]}。
//     `signal` 是**薄适配契约（games/<g>/acceptance-adapter.ts）的词表**——例：game-a 剧本用的
//     play/pass/play-round/next-round/auto/ai-step/play-run，这些是喂给 GuandanSession 的仿真操作名，
//     **跟真挂载 UI 的 data-action 词表（menu.start/select.seat/hand.toggle/play.confirm…）完全不同源**。
//     这不是本探针的 bug——两套词表本就服务不同目的（adapter=喂纯仿真验证規则；UI=人手点的交互面）。
//     故「剧本 signal 字面量能在真 UI 里点出来」天然只是**部分**重合，本探针如实测量这个重合度
//     （=UI 可驱动率），不强行「翻译」两套词表（那会是猜测式伪造，比诚实的低比率更危险）。
//  2) `args` 若是多字段对象或含数组值（如 play 的 args.cards=[...]，多选合成操作）——`mountUI`
//     的 dispatch() 只认单个 string 参（data-arg），这类 signal 结构性不是「一次点击」能表达的
//     （需要多次选中+一次确认的复合操作），同样标记「非原子点击」而非报错。
//  3) `tick` 步骤＝装配/时间推进类（引擎侧 world.tick()，无对应「请再等一会」按钮）；`expect` 步骤
//     ＝断言（读 Resource/Flag/StringVar 等仿真机读态）——**不是「动作」**，UI 可驱动率的分母只数
//     signal 步骤（同「驱动」二字的字面语义：能不能被"驱动"，断言不被驱动、只被核验）。
//  4) player 页面原无「可读世界状态的调试口」——已在 launcher 域（Lead 自持）补一个**只读**的
//     `window.__zcProbe`（src/launcher/game-runner.tsx，仅 `import.meta.env.DEV`）：暴露「此刻挂载
//     的游戏活体 DOM 里有哪些 [data-action] 控件」。**据实说明这不是仿真世界态**（Resource/Flag/
//     StringVar）——那层状态深锁在各游戏私有闭包（如 game-a 的 GuandanSession），要读它得碰游戏层
//     内部代码，逾越 launcher 域边界（且下沉一个「探针专用仿真读口」本身就是一次不小的引擎面扩张，
///    未经 owner/Lead 另议不擅自做）。故本探针的 `expect` 步骤目前**不做世界态核验**（如实标「未核」
//     计数，不伪装成通过）——这是本轮诚实边界，见回报「据实偏差」。
//
//  用法：
//    node scripts/ui-walkthrough-probe.mjs --game <slug>
//  退出码：
//    0 = 探针跑通（页面装载成功·全部可驱动的点击均未触发控制台 error/未捕获异常——不代表「剧本
//        全绿」，UI 可驱动率可能很低，那是诚实发现、不是失败·见 uiDrivableRate）
//    1 = 真出问题（装载失败 / 驱动点击后出控制台 error 或未捕获异常 / 该游戏零验收剧本）
//    2 = 用法错（缺 --game / 未知 slug）
//    3 = 环境无浏览器（探针跳过·不算失败·同 R1/R3 语义）
//
//  产物（覆盖式）：public/games/<slug>/probe/S4-uiwalk.json（逐剧本/逐步结果 + uiDrivableRate）
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectBrowserRuntime, deepLinkQuery, startDevServer, stopDevServer,
} from './lib/render-harness.mjs';
import { detectForm, gameHash } from './game-pipeline.mjs';
import { parseAndValidate } from './acceptance-schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.ZEROCRAFT_PIPELINE_ROOT || process.env.APOLLO_PIPELINE_ROOT || join(HERE, '..');

// 剧本文件发现（同 acceptance-run.mjs 的 listScenarioFiles 逻辑·此处本地重实现而非 import 那份模块——
// acceptance-run.mjs 顶层有一段「非 vitest 环境即视为 CLI 直跑」的 side-effect（读 process.argv 直接
// process.exit）——本探针是普通 `node` 直跑（非 vitest/非该文件的 CLI 握手协议），import 它会被
// 那段顶层副作用抢走 argv 解析权、提前退出，故不碰它，本地重复这 6 行读目录逻辑更安全。）
const acceptanceDir = (root, slug) => join(root, 'docs', 'design', slug, 'acceptance');
function listScenarioFiles(root, slug) {
  const dir = acceptanceDir(root, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.scenario.jsonc')).sort()
    .map((f) => ({ name: f, path: join(dir, f) }));
}

// ── 纯函数（不碰 DOM/浏览器·可直接单测）──────────────────────────────────────

/** 剧本步骤三态分类：signal(尝试点击) / tick(装配·非「动作」) / expect(断言·另计非「动作」)。 */
export function classifyStep(step) {
  if ('tick' in step) return { kind: 'tick' };
  if ('waitUntil' in step) return { kind: 'tick' };
  if ('expect' in step) return { kind: 'expect', count: step.expect.length };
  return { kind: 'signal', signal: step.signal, args: step.args, by: step.by };
}

/** signal 步骤的 args 能否化成 dispatch() 认的单个 string 参（data-arg）。
 *  无 args / 空对象 → 无需 arg。单键且值为原始类型 → 该值当 arg。其余（多键/数组/嵌套对象）→
 *  结构性不是一次点击能表达（多选合成操作），ok:false（非驱动器 bug——词表/交互形态本就不是 1:1）。 */
export function signalArgForClick(args) {
  if (args === undefined || args === null) return { ok: true, arg: undefined };
  const keys = Object.keys(args);
  if (keys.length === 0) return { ok: true, arg: undefined };
  if (keys.length === 1) {
    const v = args[keys[0]];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      return { ok: true, arg: String(v) };
    }
  }
  return { ok: false, reason: `args 非单值可表达（${JSON.stringify(args)}）·非原子点击可发出` };
}

/** 在活体动作清单（__zcProbe.actions() 快照）里找与 signal(+arg) 匹配、未禁用的控件。
 *  纯函数——喂假清单即可测，不必真开浏览器。 */
export function findMatchingAction(liveActions, signal, arg) {
  return (liveActions || []).filter((a) =>
    a.action === signal && !a.disabled && (arg === undefined || a.arg === arg));
}

// game-105 keeps its acceptance vocabulary intentionally close to the visible controls, but
// the draft signal is an input event rather than a click. Keep this binding explicit so the
// walkthrough can prove the exact player-facing path instead of treating every signal as a
// button and reporting a misleading vocabulary mismatch.
export const GAME105_UI_BINDINGS = Object.freeze({
  'tower.interaction.complete': { action: 'tower.interaction.complete', kind: 'click' },
  'tower.response.draft': { action: 'tower.response.draft', kind: 'input', valueKey: 'value' },
  'tower.interaction.swap': { action: 'tower.interaction.swap', kind: 'click' },
  'tower.interaction.submit': { action: 'tower.interaction.submit', kind: 'click' },
  'tower.interaction.skip': { action: 'tower.interaction.skip', kind: 'click' },
  'tower.wrap.continue': { action: 'tower.wrap.continue', kind: 'click' },
});

/** Resolve a scenario signal to the control the player actually uses on the mounted page. */
export function resolveUiBinding(game, signal) {
  if (game === 'game-105' && GAME105_UI_BINDINGS[signal]) return GAME105_UI_BINDINGS[signal];
  return { action: signal, kind: 'click' };
}

/** 汇总一轮走查的逐步结果 → UI 可驱动率。只数 signal 步骤入分母（tick/expect 不是「动作」，
 *  同「驱动」二字字面语义）。零 signal 步骤时约定 rate=1（无东西可驱动≠驱动失败）。 */
export function summarizeWalk(stepResults) {
  const signals = stepResults.filter((r) => r.kind === 'signal');
  const driven = signals.filter((r) => r.driven);
  return {
    totalSteps: stepResults.length,
    signalSteps: signals.length,
    drivenSteps: driven.length,
    tickSteps: stepResults.filter((r) => r.kind === 'tick').length,
    expectSteps: stepResults.filter((r) => r.kind === 'expect').length,
    uiDrivableRate: signals.length ? driven.length / signals.length : 1,
  };
}

/** 多剧本汇总（纯函数·喂 summarizeWalk 的产物数组）。 */
export function aggregateSummaries(summaries) {
  const acc = summaries.reduce((a, s) => ({
    signalSteps: a.signalSteps + s.signalSteps,
    drivenSteps: a.drivenSteps + s.drivenSteps,
    tickSteps: a.tickSteps + s.tickSteps,
    expectSteps: a.expectSteps + s.expectSteps,
  }), { signalSteps: 0, drivenSteps: 0, tickSteps: 0, expectSteps: 0 });
  return { ...acc, uiDrivableRate: acc.signalSteps ? acc.drivenSteps / acc.signalSteps : 1 };
}

// ── 单剧本走查（真浏览器·page 已装载好目标游戏）──────────────────────────────
async function walkScenario(page, scenario) {
  const stepResults = [];
  for (let si = 0; si < scenario.steps.length; si++) {
    const step = scenario.steps[si];
    const cls = classifyStep(step);
    if (cls.kind === 'tick') {
      stepResults.push({ step: si, kind: 'tick', driven: false, note: '装配/时间推进类·UI 无对应控件' });
      continue;
    }
    if (cls.kind === 'expect') {
      stepResults.push({ step: si, kind: 'expect', driven: false, note: '断言步骤·探针只读 UI 动作清单(非仿真世界态)·未核' });
      continue;
    }
    // Canvas games may expose their player interaction as a physical pointer gesture rather than
    // a one-click DOM action. Drive the visible canvas with Playwright mouse input, never by
    // calling game/session internals. Coordinates are the documented fixed-seed specimen.
    if (scenario.game === 'game-105' && (cls.signal === 'tower.camera.orbit' || cls.signal === 'tower.drag')) {
      const canvas = await page.$('canvas');
      if (!canvas) { stepResults.push({ step: si, kind: 'signal', signal: cls.signal, driven: false, note: '活体 canvas 不存在' }); continue; }
      const args = cls.args || {};
      const point = cls.signal === 'tower.camera.orbit' ? [800, 400, 940, 440, 'right']
        : args.blockId === 'g105-block-08-01' ? [650, 400, 1000, 400, 'left']
          : args.blockId === 'g105-block-00-01' ? [630, 540, 760, 540, 'left']
            : [650, 220, 650, 550, 'left'];
      await page.mouse.move(point[0], point[1]);
      await page.mouse.down({ button: point[4] });
      await page.mouse.move(point[2], point[3], { steps: 16 });
      await page.mouse.up({ button: point[4] });
      await page.waitForTimeout(cls.signal === 'tower.drag' ? 3500 : 180);
      stepResults.push({ step: si, kind: 'signal', signal: cls.signal, driven: true, note: '真 canvas 鼠标手势' });
      continue;
    }
    const binding = resolveUiBinding(scenario.game, cls.signal);
    if (binding.kind === 'input') {
      const value = String(cls.args?.[binding.valueKey] ?? '');
      try {
        const input = page.locator(`[data-action="${binding.action}"]`).first();
        if (!await input.count()) {
          stepResults.push({ step: si, kind: 'signal', signal: cls.signal, mappedAction: binding.action, driven: false, note: '已映射到真实输入框，但当前页面未进入该卡牌状态' });
          continue;
        }
        await input.fill(value, { timeout: 3000 });
        await page.waitForTimeout(120);
        stepResults.push({ step: si, kind: 'signal', signal: cls.signal, mappedAction: binding.action, driven: true, note: '真输入框填写' });
      } catch (e) {
        stepResults.push({ step: si, kind: 'signal', signal: cls.signal, mappedAction: binding.action, driven: false, error: String(e?.message ?? e).slice(0, 200) });
      }
      continue;
    }
    const argRes = signalArgForClick(cls.args);
    if (!argRes.ok) {
      stepResults.push({ step: si, kind: 'signal', signal: cls.signal, driven: false, note: argRes.reason });
      continue;
    }
    const liveActions = await page.evaluate(() => (window.__zcProbe ? window.__zcProbe.actions() : null));
    if (!liveActions) {
      stepResults.push({ step: si, kind: 'signal', signal: cls.signal, driven: false, note: '调试口未就绪（__zcProbe 缺失）' });
      continue;
    }
    const matches = findMatchingAction(liveActions, binding.action, argRes.arg);
    if (matches.length === 0) {
      stepResults.push({
        step: si, kind: 'signal', signal: cls.signal, mappedAction: binding.action, arg: argRes.arg, driven: false,
        note: '已映射到真实控件，但当前页面无可用控件（可能尚未到达该状态，或该一次性动作已合法禁用）',
      });
      continue;
    }
    const m = matches[0];
    try {
      const handle = await page.evaluateHandle(({ action, arg, uiId }) => {
        const all = Array.from(document.querySelectorAll('[data-action]'));
        return all.find((el) => {
          if (uiId !== undefined && el.dataset.uiId !== uiId) return false;
          if (el.dataset.action !== action) return false;
          if (arg !== undefined && el.dataset.arg !== arg) return false;
          return !el.disabled;
        }) || null;
      }, { action: binding.action, arg: argRes.arg, uiId: m.uiId });
      const el = handle.asElement();
      if (!el) {
        stepResults.push({ step: si, kind: 'signal', signal: cls.signal, mappedAction: binding.action, arg: argRes.arg, driven: false, note: '匹配控件在真点击前已从 DOM 消失（态已变）' });
        await handle.dispose();
        continue;
      }
      await el.click({ timeout: 3000 });
      await handle.dispose();
      await page.waitForTimeout(120); // 等一帧渲染落定
      stepResults.push({ step: si, kind: 'signal', signal: cls.signal, mappedAction: binding.action, arg: argRes.arg, driven: true });
    } catch (e) {
      stepResults.push({ step: si, kind: 'signal', signal: cls.signal, mappedAction: binding.action, arg: argRes.arg, driven: false, error: String(e?.message ?? e).slice(0, 200) });
    }
  }
  return stepResults;
}

// ── 探针主流程（真起服+真浏览器+真装载）──────────────────────────────────────
async function runWalkthrough(slug, { root = ROOT } = {}) {
  const form = detectForm(root, slug);
  if (!form) return { usageError: `未知游戏: ${slug}（library/public/games/games 三处均无）` };

  const files = listScenarioFiles(root, slug);
  if (!files.length) return { noScenarios: true, form };

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
  const scenarios = [];
  let navError = null;

  try {
    browser = await chromium.launch({ headless: true, executablePath: rt.execPath, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // 同 R1：只挡启动器壳层两条引导态接口，游戏自身资源/API 照走真网络。
    await page.route('**/api/generate/providers', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/library', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));

    const url = `http://localhost:${dev.port}/?${deepLinkQuery(form, slug)}`;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      // __zcProbe 由 launcher 域 dev-only 挂载（见 src/launcher/game-runner.tsx）——只对走 GameRunner
      // 加载器的 compiled/builtin 形态生效；等它就绪，等不到也不算装载失败（如实继续，逐步会标「未就绪」）。
      await page.waitForFunction(() => !!window.__zcProbe, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(3000);

      for (const f of files) {
        // Each GD scenario is a fresh game. Reusing a page carries camera/physics state from the
        // prior script into the next one and makes later canvas coordinates non-reproducible.
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(3000);
        const text = readFileSync(f.path, 'utf8');
        const pv = parseAndValidate(text);
        if (!pv.ok) { scenarios.push({ name: f.name, file: f.name, ok: false, schemaErrors: pv.errors }); continue; }
        const stepResults = await walkScenario(page, pv.value);
        scenarios.push({ name: pv.value.name, file: f.name, steps: stepResults, summary: summarizeWalk(stepResults) });
      }
    } catch (e) {
      navError = String(e.message || e).slice(0, 400);
    }
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    stopDevServer(dev.proc);
  }

  if (navError) return { ok: false, reason: `装载/走查失败 · ${navError}`, form };

  const total = aggregateSummaries(scenarios.filter((s) => s.summary).map((s) => s.summary));
  const consoleOk = { pass: consoleErrors.length === 0, count: consoleErrors.length, messages: consoleErrors.slice(0, 5) };
  const noUncaught = { pass: pageErrors.length === 0, count: pageErrors.length, messages: pageErrors.slice(0, 5) };
  // 判红只认「真出错」（控制台 error / 未捕获异常）——UI 可驱动率低是诚实发现、不拿阈值拦
  // （同 spec-trace-guard.mjs「human 型占比」先例：报告不设阈值门）。
  const pass = consoleOk.pass && noUncaught.pass;

  return {
    ok: pass, form, port: dev.port, browser: { execPath: rt.execPath, via: rt.via },
    scenarios, uiDrivableRate: total.uiDrivableRate, totalSummary: total,
    assertions: { consoleErrors: consoleOk, noUncaught },
  };
}

// ── 落盘（覆盖式）────────────────────────────────────────────────────────
function writeArtifacts(root, slug, result) {
  const dir = join(root, 'public', 'games', slug, 'probe');
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, 'S4-uiwalk.json');
  const record = {
    slug, at: new Date().toISOString(), gameHash: gameHash(root, slug),
    ok: result.ok, form: result.form,
    uiDrivableRate: result.uiDrivableRate, totalSummary: result.totalSummary,
    scenarios: result.scenarios,
    assertions: result.assertions,
    browser: result.browser,
  };
  writeFileSync(jsonPath, JSON.stringify(record, null, 2) + '\n');
  return { jsonPath, record };
}

// ── CLI ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--game');
  const slug = gi >= 0 ? argv[gi + 1] : null;
  if (!slug) {
    console.error('用法: node scripts/ui-walkthrough-probe.mjs --game <slug>');
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

  if (!listScenarioFiles(ROOT, slug).length) {
    console.log(`无验收剧本：docs/design/${slug}/acceptance/*.scenario.jsonc（无剧本可走查）`);
    process.exit(1);
  }

  const result = await runWalkthrough(slug, { root: ROOT });
  if (result.usageError) { console.error(result.usageError); process.exit(2); }
  if (result.noBrowser) { console.log(JSON.stringify({ ok: false, code: 'NO_BROWSER', slug, reason: result.reason })); process.exit(3); }
  if (result.noScenarios) { console.log(`无验收剧本：docs/design/${slug}/acceptance/*.scenario.jsonc`); process.exit(1); }
  if (result.ok === false && !result.scenarios) {
    console.error(`✗ 探针失败（未到走查阶段）· ${result.reason}`);
    process.exit(1);
  }

  const { jsonPath, record } = writeArtifacts(ROOT, slug, result);
  console.log(JSON.stringify({ ...record, jsonPath }));
  console.log(`UI 可驱动率：${record.totalSummary.drivenSteps}/${record.totalSummary.signalSteps}（${(record.uiDrivableRate * 100).toFixed(1)}%）`);
  process.exit(result.ok ? 0 : 1);
}

export { runWalkthrough, walkScenario, writeArtifacts };
