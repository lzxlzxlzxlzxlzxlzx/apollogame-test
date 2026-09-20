#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/game109-playthrough.mjs —— S4 玩法关「真人能不能打完一局」试玩走查
//
//  为什么还要这一道（验收剧本不是已经 8/8 绿了吗）：同 game108 的理由——验收剧本驱动的是**引擎**
//  （adapter 直接喂 world），DOM 那一半从不参与；S3 点击门证的是「点得动」，刻意不碰玩法。
//  中间这段没人管：**真人在浏览器里，靠真按钮 + 真点地块，能不能从开局打到通关**。
//
//  做法：真起 vite → 真 Chromium → **全程只走玩家路径**（DOM 的 6 枚动作键 + canvas 地块 pointerdown），
//  不碰世界、不注入、不调任何调试口 → 关键节点截图 + 把 DOM 读回来断言。
//
//  ── ⛔ 终局出口必点（docs/playbooks/self-check.md:24-42·owner 2026-08-07 报 bug 后立的硬要求）──
//  立此条源于 game108「owner 点『再来一局』没反应而全部机器门全绿」：走查原先**到分出胜负就收工**，
//  覆盖面正好在 bug 开始的地方结束。故本脚本：
//    ① 必须真打到 `won`（走不到就**照实报走不到**，绝不许把非通关态截图当终局交上来）；
//    ② 终局屏上**每一枚键都真点**（game109 的结算屏只有一枚：重开），点完**断言世界真的变了**
//       （新局：金币 0 / 第 1 天 / 体力 20 / 地块回 wild / 6 枚动作键回来 / 结算面板消失），
//       **不是「屏刷新了」就算过**——「地块回 wild」用「旧局已翻土的格子重开后能重新锄地且逐格扣 1」
//       来证（这是本走查能拿到的最硬证据，见报告里的诚实说明：地块状态在 DOM 上不可读）；
//    ③ 单出口的屏 = 最高优先级的被测对象；
//    ④ 屏上每个世界动作都要在断言里点名（本作 8 个：4 工具 + 睡觉 + 卖货走 ActionSink；
//       地块点击走 Clickable→work；重开走宿主 handler）。答不上来的就是死键——末尾有对账表。
//
//  用法：node scripts/game109-playthrough.mjs
//  退出码：0 = 打完通关 + 重开验过 · 1 = 断言未过 · 3 = 本机无浏览器（跳过·同 R1 语义）
//  产物：docs/design/game109/self-check/shots/S4-play-*.png（截图序列）+ S4-play.{log,json}
// ═══════════════════════════════════════════════════════════════

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'design', 'game109', 'self-check', 'shots');

// ── 几何（照 theme.ts 的 tileX/tileY 与 FARM 的数据：定尺场景 720×910）──────────────
// 脚本自带一份 = 一份「脚本过期」的护栏：画布尺寸对不上时下面第一条断言当场红，
// 而不是拿着错坐标点到空气上、把「没反应」误读成「游戏坏了」。
const CELL = 112, PAD = 24, FIELD_W = 720, FIELD_H = 910;
const tileX = (col) => PAD + col * CELL + CELL / 2;
const tileY = (row) => PAD + row * CELL + CELL / 2;

// ── 数值（照 data.ts：改数据必须同步改这里，否则账对不上会红）────────────────────
const PRICE = { carrot: 12, wheat: 30, pumpkin: 75 };
const COL_RANGE = { carrot: [0, 1], wheat: [2, 3], pumpkin: [4, 5] };
const btnId = (id) => `g109-hud-btn-${id}`;

const log = [];
const say = (l) => { log.push(l); console.log(l); };
const checks = [];
/** named = 本条断言**点名**了哪几个屏上世界动作（末尾对账用·见文件头 ④）。 */
const check = (name, pass, detail, named = []) => {
  checks.push({ name, pass, detail, named });
  say(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 屏上世界的入口（8 个·对账表要求每个都被至少一条断言点名）。 */
const ACTION_SURFACE = [
  'pick-till', 'pick-sow', 'pick-water', 'pick-reap', // 工具 4：DOM 键 → ActionSink → keybind → Effect
  'sleep', 'sell',                                     // 动作 2：同上
  'work-canvas',                                       // 地块：canvas pointerdown → Clickable → work 信号
  'restart',                                           // 重开：DOM 键 → 宿主局生命周期 handler（不是信号）
];

/** 读屏（只读 DOM·不碰世界）。 */
const READ = `(() => {
  const txt = (id) => document.getElementById(id)?.textContent?.trim() ?? null;
  const pair = (id) => { const m = (txt(id) || '').match(/(\\d+)\\s*\\/\\s*(\\d+)/); return m ? [Number(m[1]), Number(m[2])] : null; };
  const btn = (id) => { const el = document.getElementById('g109-hud-btn-' + id);
    return el ? { label: el.textContent ?? '', action: el.getAttribute('data-action') } : null; };
  const one = (id) => { const el = document.getElementById(id);
    return el ? { id: el.id, action: el.getAttribute('data-action'), label: el.textContent ?? '' } : null; };
  const ids = ['till', 'sow', 'water', 'reap', 'sleep', 'sell'];
  const buttons = {}; for (const k of ids) buttons[k] = btn(k);
  const tool = txt('g109-hud-tool') || '';
  const selected = ids.filter((k) => (buttons[k]?.label ?? '').startsWith('▶ '));
  return {
    energy: pair('g109-hud-energy'), gold: pair('g109-hud-gold'),
    dayRaw: txt('g109-hud-day'), day: (txt('g109-hud-day') || '').match(/(\\d+)/) ? Number((txt('g109-hud-day') || '').match(/(\\d+)/)[1]) : null,
    toolRaw: tool, toolName: (tool.match(/当前工具：(.+)$/) || [])[1] ?? null,
    selected, buttons,
    readouts: !!document.getElementById('g109-hud-readouts'),
    actions: !!document.getElementById('g109-hud-actions'),
    // 主菜单屏（S7 换屏·D-13：buildStarterHome 的产物·id 由 house builder 定死）。
    // 装载后的**首屏**是它；「开始」键点掉之后必须消失（下面那条断言钉的就是这个前后态）。
    // ⚠ 本探针是**模板字面量**：注释里别写反引号（会当场截断字符串 ⇒ 整个文件 SyntaxError）。
    home: !!document.getElementById('starter-home'),
    homeStart: (() => { const el = document.getElementById('starter-act-0');
      return el ? { action: el.getAttribute('data-action'), label: el.textContent ?? '' } : null; })(),
    result: !!document.getElementById('g109-hud-result'),
    resultTitle: txt('g109-hud-result-title'),
    resultStats: txt('g109-hud-result-stats'),
    // 换屏后读数整条收起，金币/天数只剩结算面板的战绩里那一份（跨线卖货那一拍的判据要靠它）。
    resultGold: (() => { const m = (txt('g109-hud-result-stats') || '').match(/最终金币 (\\d+) \\/ \\d+/); return m ? Number(m[1]) : null; })(),
    restart: one('g109-hud-restart'),
    canvasCount: document.querySelectorAll('canvas').length,
    hudCount: document.querySelectorAll('#g109-hud').length,
    cw: (() => { const c = document.querySelector('canvas'); return c ? [parseFloat(getComputedStyle(c).width), parseFloat(getComputedStyle(c).height)] : null; })(),
  };
})()`;

async function main() {
  const rt = detectBrowserRuntime();
  if (!rt.ok) { console.error(`本机无浏览器（${rt.code}）：${rt.reason}`); process.exit(3); }
  const { chromium } = await import('playwright');
  // 5700 是本仓渲染探针的默认口。**别用 5173**：那上面有 owner 看着的活开发服，撞车会互相 HMR。
  const dev = await startDevServer(ROOT, { port: 5729 });
  const browser = await chromium.launch({ executablePath: rt.execPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`未捕获异常: ${e.message}`));
  await page.route('**/api/generate/providers', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/library', (r) => r.fulfill({ status: 200, body: '[]' }));

  mkdirSync(OUT, { recursive: true });
  const shot = (t) => page.screenshot({ path: join(OUT, `S4-play-${t}.png`) });
  const state = () => page.evaluate(READ);
  /** 等一个屏上条件成立（**不靠猜时间**，靠真读屏）。 */
  async function until(pred, desc, maxMs = 5000) {
    const t0 = Date.now();
    let s = await state();
    for (;;) {
      if (pred(s)) return { ok: true, s };
      if (Date.now() - t0 > maxMs) return { ok: false, s, desc };
      await page.waitForTimeout(60);
      s = await state();
    }
  }
  /** 世界坐标 → 屏幕坐标（canvas 的 content box 与场景逻辑坐标 1:1·与 dpr/缩放无关）。 */
  const worldPoint = (wx, wy) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const cssW = parseFloat(getComputedStyle(c).width), cssH = parseFloat(getComputedStyle(c).height);
    return { x: r.left + (x * r.width) / cssW, y: r.top + (y * r.height) / cssH };
  }, [wx, wy]);
  /** 地块中心 → 屏幕坐标（照 theme.ts 的 tileX/tileY）。 */
  const canvasPoint = (row, col) => worldPoint(tileX(col), tileY(row));
  /** 点一格地（真 mouse 事件）——`expectDelta=-1` 要求扣 1 体力；`expectReject` 要求状态不动。 */
  async function clickTile(row, col, { expectReject = false, why = '' } = {}) {
    const before = await state();
    const p = await canvasPoint(row, col);
    if (!p) throw new Error('找不到 canvas');
    await page.mouse.click(p.x, p.y);
    if (expectReject) {
      await page.waitForTimeout(450);                    // 干等几拍，确认「状态不动」
      const after = await state();
      const same = after.energy[0] === before.energy[0];
      check(`${why}：动作被拒且**不扣体力**`, same, `体力 ${before.energy[0]} → ${after.energy[0]}（要求不变）`, ['work-canvas']);
      return same;
    }
    const r = await until((s) => s.energy?.[0] === before.energy[0] - 1, `点 r${row}c${col} 应扣 1 体力`, 4000);
    // 失败时把「点到底打在哪」摊开：命中元素 / canvas 外接矩形 / 滚动量——一次就能分清
    // 「坐标算错了」与「动作被前置门拒了、点击本来就没反应」这两种完全不同的病因。
    const diag = r.ok ? null : await page.evaluate(([x, y]) => {
      const c = document.querySelector('canvas');
      const rc = c?.getBoundingClientRect();
      const el = document.elementFromPoint(x, y);
      return { at: el ? `${el.tagName}#${el.id}` : 'null',
        rect: rc ? [rc.left, rc.top, rc.width, rc.height].map((n) => Math.round(n)).join(',') : 'null',
        scroll: `${Math.round(window.scrollX)},${Math.round(window.scrollY)}` };
    }, [p.x, p.y]);
    check(`点 r${row}c${col} 干活成功（扣 1 体力 → ${before.energy[0] - 1}）`, r.ok,
      r.ok ? `体力 ${before.energy[0]} → ${r.s.energy[0]}`
           : `体力停在 ${r.s.energy[0]} · 点(${Math.round(p.x)},${Math.round(p.y)})命中 ${diag.at} · canvas=${diag.rect} · scroll=${diag.scroll}（坐标错？还是动作被前置门拒了？）`,
      ['work-canvas']);
    return r.ok;
  }
  /** 选工具（走 DOM 键 = ActionSink 路径）。 */
  const TOOL_NAME = { till: '锄地', sow: '播种', water: '浇水', reap: '收获' };
  async function pickTool(id) {
    await page.click(`#${btnId(id)}`).catch(() => {});
    const r = await until((s) => s.toolName === TOOL_NAME[id] && s.selected.includes(id), `选 ${id}`, 3000);
    check(`选工具「${TOOL_NAME[id]}」：读数为「当前工具：${TOOL_NAME[id]}」且该键带选中标记 ▶`,
      r.ok, r.ok ? `实测 ${r.s.toolRaw} · 选中键=${r.s.selected.join(',')}` : `实测 ${r.s.toolRaw} · 选中键=${r.s.selected.join(',')}`, [`pick-${id}`]);
  }
  async function sleep() {
    const before = await state();
    await page.click(`#${btnId('sleep')}`).catch(() => {});
    const r = await until((s) => s.day === before.day + 1 && s.energy?.[0] === 20, '睡觉应推一天且回满体力', 6000);
    check(`点「睡觉」：第 ${before.day} 天 → 第 ${r.s.day} 天，体力回满 ${r.s.energy[0]}/20`, r.ok,
      r.ok ? '日期+1、体力回满' : `实测 第 ${r.s.day} 天 · 体力 ${r.s.energy[0]}`, ['sleep']);
  }
  async function sell(expectGain) {
    const before = await state();
    await page.click(`#${btnId('sell')}`).catch(() => {});
    const want = before.gold[0] + expectGain;
    // ⚠ 跨线那一次卖货会**当场换屏**：读数整条收起（`g109-hud-gold` 不再存在）⇒ 金币改从
    //   结算面板的战绩里读（`最终金币 N / 1000`）。不这样兜，判据会在 `null[0]` 上崩
    //   ——2026-09-18 末次跑就崩在这一次卖货上（前两次跑侥幸抢在换屏前的一拍读到，是**竞态**）。
    const r = await until((s) => (s.gold?.[0] ?? s.resultGold) === want, `卖货应 +${expectGain} 金`, 5000);
    const got = r.s.gold?.[0] ?? r.s.resultGold;
    check(`点「卖货」：金币 ${before.gold[0]} → +${expectGain}（卖价换算 ${PRICE.carrot}/${PRICE.wheat}/${PRICE.pumpkin}）`, r.ok,
      r.ok ? `实测金币 ${got}${r.s.result ? '（已换屏·取自结算面板战绩）' : ''}` : `实测金币 ${got}（要求 ${want}）`, ['sell']);
    return got;
  }
  /** 一批同工具的活（先换工具，再逐格点·逐格核账）。 */
  async function batch(tool, tiles, label) {
    await pickTool(tool);
    let n = 0;
    for (const [row, col] of tiles) if (await clickTile(row, col, { why: `${tool} r${row}c${col}` })) n++;
    say(`  · ${label ?? tool}：${n}/${tiles.length} 格成功`);
    return n;
  }
  /**
   * **观察项（非断言·不进 checks）**：同一格在「翻土前 / 翻土后 / 播种浇水后 / 成熟后」的画布
   * 像素指纹。为什么记它：地块状态**在 DOM 上读不到**（HUD 只有 4 个标量读数），而「长得怎么样」
   * 恰恰是玩家最关心的反馈面。指纹若全过程一个样 = 屏幕对生长零反馈（S4 对齐单要记的一条）。
   * 拿 60×60 的裁剪图做 sha256：不解读像素，只看「变没变」。
   *
   * ⚠ 本段的**已知边界**（2026-09-18 立·别再误会它）：指纹只证「这块像素变了」，**不证「变对了」**。
   *   色值是否真的等于预期的地色/条色，由 `scripts/game109-tint-probe.mjs` 逐位比色判（那才是 R-10~R-13 的证据）。
   */
  /**
   * 判别力自检的对照组：**同刻的荒地** r0c1（1 列全程不碰·见 d1/d2/w3/d4/c5 的格子清单）。
   *
   * ⚠ 为什么对照组从「另一列的荒地」改成「逐刻的差分」（2026-09-18 改）：旧判据建立在**棋盘隔格色**
   * （`crop.tintAlt`）之上——靠「两列颜色天生不同」来证「裁剪点确实落在网格里」。δ 全轴那个改动把
   * 棋盘色**撤了**（理由见 data.ts 的 LIFE_TINTS 注），于是两列的**同状态**格子必然同指纹，自检会稳定
   * 打出一条**误导诊断**（「可能是裁剪点没落在网格里」）——明明是我自己刚把那条判据的地基拆了。
   * 更要紧的是：**第一次采样在任何活干之前**，那一刻场上全体皆荒地，任何「另一格」都必然同指纹，
   * 换格子救不了。故改成逐刻差分，判据回到它本该测的东西：
   *   被测格**还没干活** ⇒ 应与同刻荒地**同**指纹（证明「它本来长这样」）；
   *   被测格**干过活**   ⇒ 必须与同刻荒地**不同**（证明「变的是它，不是我采样的噪声」）。
   */
  const pixLog = [];
  const sampleTile = async (row, col) => {
    const p = await canvasPoint(row, col);
    const buf = await page.screenshot({ clip: { x: Math.round(p.x - 30), y: Math.round(p.y - 30), width: 60, height: 60 } });
    return createHash('sha256').update(buf).digest('hex').slice(0, 10);
  };
  const pixProbe = async (label) => {
    const h = await sampleTile(0, 4);    // 被测格：南瓜 4 列 r0c4（本走查一路在它身上干活）
    const ref = await sampleTile(0, 1);  // 对照组：同刻的荒地（1 列·全程不碰）
    pixLog.push({ label, h, ref });
    say(`  · [像素观察·非断言] ${label}：r0c4 的 60×60 指纹 ${h}（同刻荒地 r0c1=${ref}）`);
    return h;
  };
  const tileRange = (crop, rowFrom, rowTo) => {
    const out = [];
    for (const col of COL_RANGE[crop]) for (let row = rowFrom; row <= rowTo; row++) out.push([row, col]);
    return out;
  };
  /** 开新格 = 翻土 → 播种 → 浇水（**播下当天必须浇**，否则那夜不长·brief 的睡觉结算）。 */
  async function plant(crop, tiles, label) {
    for (const [tool, name] of [['till', '翻土'], ['sow', '播种'], ['water', '浇水']]) await batch(tool, tiles, `${label} ${name}`);
  }

  try {
    // ⚠ 用 domcontentloaded 而不是 networkidle：vite 的 HMR 长连接 + 应用自身的轮询会让
    //   networkidle 的 500ms 静默窗时有时无（2026-09-18 实测：同一条 URL 首跑过、二跑 30s 超时）。
    //   **真正的就绪信号是「HUD 与画布挂上了」**——那句由下面的 until 判，别拿网络的安静冒充它就绪。
    await page.goto(`http://localhost:${dev.port}/?game=game109`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    say('══ game109 S4 试玩走查（真浏览器·真按钮 + 真点地块）══\n');
    // ── 首屏 = 主菜单屏（S7 换屏·D-13）────────────────────────────────────────
    //  装载后**不再直接是对局**：`buildStarterHome` 的屏挂在 overlayHost（inset:0·z20）上，整幅不透明底
    //  盖住 canvas(z0) 与底栏 HUD(z10)，且那层已放行点击。⇒ **不等它、不点掉它，下面每一条 `page.click`
    //  都会红**：Playwright 的 actionability 检查包含「事件真落到该元素」，被 z20 挡住就一路超时。
    //  这是新屏的**结构后果**（设计稿 §二-③），不是顺手加的等待。
    const home = await until((s) => s.home === true, '主菜单屏就位', 12000);
    check('深链 `?game=game109` 装载：**首屏是主菜单屏**（`#starter-home`·不是直接进对局）', home.ok,
      `home=${home.s.home} · canvas×${home.s.canvasCount}`);
    // 那枚键是**唯一**入口：`buildStarterHome` 的动作是数据，多挂一枚就得有消费者（没消费者的键=死键）。
    check('主菜单屏那唯一一枚动作键：`#starter-act-0` = 「开始」·action=start',
      home.s.homeStart?.action === 'start' && (home.s.homeStart?.label ?? '').includes('开始'),
      home.s.homeStart ? `${home.s.homeStart.action}「${home.s.homeStart.label}」` : '缺');
    await page.click('#starter-act-0');
    const boot = await until((s) => s.energy !== null && s.cw !== null && s.home === false,
      '收起主菜单屏 → 对局屏就位', 12000);
    check('点「开始」→ 主菜单屏收起、对局屏（HUD 与画布）就位、`canvas×1`·`HUD×1`',
      boot.ok && boot.s.canvasCount === 1 && boot.s.hudCount === 1 && boot.s.energy !== null,
      `home=${boot.s.home} · canvas×${boot.s.canvasCount} · HUD×${boot.s.hudCount}`);
    // 定尺锚点：画布逻辑尺寸对不上 = 下面的坐标全错 → 第一句就红，别让错坐标伪装成「游戏坏了」。
    check('画布是定尺 720×910（坐标换算的锚点）', boot.s.cw?.[0] === FIELD_W && boot.s.cw?.[1] === FIELD_H,
      `实测 ${boot.s.cw?.join('×')}（期望 ${FIELD_W}×${FIELD_H}）`);
    const s0 = boot.s;
    check('开局读数：体力 20/20 · 金币 0 / 1000 · 第 1 天 · 工具=锄地',
      s0.energy[0] === 20 && s0.energy[1] === 20 && s0.gold[0] === 0 && s0.gold[1] === 1000 && s0.day === 1 && s0.toolName === '锄地',
      `${s0.energy.join('/')} · ${s0.gold.join('/')} · 第${s0.day}天 · ${s0.toolName}`);
    check('开局 6 枚动作键都在（4 工具 + 睡觉 + 卖货）',
      ['till', 'sow', 'water', 'reap', 'sleep', 'sell'].every((k) => !!s0.buttons[k]),
      Object.entries(s0.buttons).map(([k, v]) => `${k}:${v?.action ?? '缺'}`).join(' '));
    check('开局无结算面板（flow=playing）', !s0.result, `result=${s0.result}`);
    await shot('1-start');

    // ══ 第 1 天：开 6 格南瓜（4 列）══════════════════════════════════════
    say('\n── 第 1 天：翻土/播种/浇水 6 格南瓜 ──');
    const d1 = tileRange('pumpkin', 0, 5).filter(([, c]) => c === 4);
    await pixProbe('翻土前（荒地）');
    await batch('till', d1, '翻土（6 格）');
    await shot('2-tilled');
    await pixProbe('翻土后');
    await batch('sow', d1, '播种（6 格）');
    await shot('3-sown');
    await batch('water', d1, '浇水（6 格）');
    await shot('3b-watered');
    await pixProbe('播种浇水后');
    const s1 = await state();
    check('第 1 天收工账：20 − 18 = 2 体力（每动作恰 1）', s1.energy[0] === 2, `实测 ${s1.energy[0]}`);

    // ── 失败路径：选「播种」点一格荒地 → 状态不动、体力不扣 ──────────────────
    say('\n── 失败路径：选播种点荒地 ──');
    await pickTool('sow');
    await clickTile(5, 0, { expectReject: true, why: '荒地播种' });
    await shot('4-rejected');
    const s2 = await state();
    check('失败路径后读数不变（体力仍是 2 · 天数/金币不动）',
      s2.energy[0] === 2 && s2.day === 1 && s2.gold[0] === 0, `体力 ${s2.energy[0]} · 第 ${s2.day} 天 · 金币 ${s2.gold[0]}`);
    // 顺带验命中盒：点画布上的**场内空白**（网格外的 pad 区）也不产生动作。
    const blank = await canvasPoint(0, 0);
    await page.mouse.click(blank.x - 60, blank.y - 60);              // r0c0 中心往左上 60px = pad 区
    await page.waitForTimeout(400);
    const s3 = await state();
    check('点画布空白处（非地块）不产生动作也不扣体力', s3.energy[0] === 2, `体力 ${s3.energy[0]}`);

    say('\n── 第 1 天收工 → 睡觉 ──');
    await sleep();

    // ══ 第 2 天：浇 4 列 + 开 4 格南瓜（5 列）═══════════════════════════
    say('\n── 第 2 天 ──');
    await batch('water', d1, '浇水（4 列已长的 6 格）');
    const d2 = tileRange('pumpkin', 0, 3).filter(([, c]) => c === 5);
    await plant('pumpkin', d2, '5 列开 4 格');
    const s4 = await state();
    check('第 2 天收工账：20 − 18 = 2 体力', s4.energy[0] === 2, `实测 ${s4.energy[0]}`);
    await sleep();

    // ══ 第 3 天：浇水 + 开 3 格小麦（2 列）══════════════════════════════
    say('\n── 第 3 天 ──');
    await batch('water', d1, '浇水 4 列');
    await batch('water', d2, '浇水 5 列');
    const w3 = [[0, 2], [1, 2], [2, 2]];
    await plant('wheat', w3, '2 列开 3 格小麦');
    const s5 = await state();
    check('第 3 天收工账：20 − 19 = 1 体力', s5.energy[0] === 1, `实测 ${s5.energy[0]}`);
    await sleep();

    // ══ 第 4 天：收 4 列（南瓜 3 天熟）+ 卖 + 浇水 + 开 2 格 ═════════════
    say('\n── 第 4 天：第一茬收获 + 卖货 ──');
    await pixProbe('第 4 天（该格已长 3 夜=成熟）');
    await batch('reap', d1, '收获 4 列南瓜');
    const g4 = await sell(6 * PRICE.pumpkin);
    check('第 4 天：卖货后仍在局中（450 < 1000 ⇒ 无结算面板）', g4 === 450 && !(await state()).result,
      `金币 ${g4} · 面板=${(await state()).result}`);
    await shot('5-first-harvest');
    await batch('water', d2, '浇水 5 列');
    await batch('water', w3, '浇水小麦');
    const d4 = [[4, 5], [5, 5]];
    await plant('pumpkin', d4, '5 列再开 2 格');
    const s6 = await state();
    check('第 4 天收工账：20 − 19 = 1 体力', s6.energy[0] === 1, `实测 ${s6.energy[0]}`);
    await sleep();

    // ══ 第 5 天：收 5 列 + 收小麦 + 卖 + 开 3 格胡萝卜 ═══════════════════
    say('\n── 第 5 天 ──');
    await batch('reap', d2, '收获 5 列南瓜');
    await batch('reap', w3, '收获小麦');
    const g5 = await sell(4 * PRICE.pumpkin + 3 * PRICE.wheat);
    check('第 5 天：卖货后仍在局中（840 < 1000 ⇒ 无结算面板）', g5 === 840 && !(await state()).result,
      `金币 ${g5} · 面板=${(await state()).result}`);
    await batch('water', d4, '浇水 5 列新 2 格');
    const c5 = [[0, 0], [1, 0], [2, 0]];
    await plant('carrot', c5, '0 列开 3 格胡萝卜');
    const s7 = await state();
    check('第 5 天收工账：20 − 18 = 2 体力', s7.energy[0] === 2, `实测 ${s7.energy[0]}`);
    await sleep();

    // ══ 第 6 天：收胡萝卜 + 卖（仍不到线）+ 浇最后 2 格南瓜 ═══════════════
    say('\n── 第 6 天：收胡萝卜（仍未到线）──');
    // ⚠ 这一行是**必修**的：第 5 列那 2 格南瓜是第 4 天种的，三夜各要浇一次水才成熟
    //   （「播下当天必须浇」的推论：**成熟前的每一夜都得浇**）。漏了第 6 天这一浇，
    //   它们第 7 天只有 2 阶 ⇒ 收获被拒 ⇒ 到不了线 ⇒ 终局屏根本不会出现。
    //   2026-09-18 首跑就栽在这（17 条红，全是「点击没反应」的形状——其实是动作被前置门拒了）。
    await batch('water', d4, '浇最后 2 格南瓜（第 3 夜）');
    await batch('reap', c5, '收获胡萝卜');
    const g6 = await sell(3 * PRICE.carrot);
    check('第 6 天：876 < 1000 ⇒ **仍在局中**（阈值下方·无结算面板）', g6 === 876 && !(await state()).result,
      `金币 ${g6} · 面板=${(await state()).result}`, ['sell']);
    await sleep();

    // ══ 第 7 天：终局前夜——顺手把「旧局的地是 tilled」钉成证据 ═══════════
    say('\n── 第 7 天：先钉旧局地块状态（重开断言的对照半）──');
    await pickTool('till');
    await clickTile(0, 4, { expectReject: true, why: '旧局 r0c4 已翻过土（第 4 天收完还原成 tilled）' });
    const d7 = [[4, 5], [5, 5]];
    await batch('reap', d7, '收获最后 2 格南瓜');
    const g7 = await sell(2 * PRICE.pumpkin);
    const won = await until((s) => s.result === true, '通关结算屏', 6000);
    check('**打到终局**：金币 1026 ≥ 1000 → 结算屏出现（flow=won）', won.ok && g7 === 1026,
      `金币 ${g7} · 面板=${won.s.result}`, ['sell']);

    // ── 终局屏：单出口的屏 = 最高优先级被测对象（self-check.md:24-42）──────────
    say('\n── 终局屏 ──');
    await page.waitForTimeout(600);                        // pop 入场 400ms，拍早了像没画出来
    const t = await state();
    check('结算面板三件套：标题「通关！」+ 战绩（用时·最终金币）+ 重开键',
      t.result && t.resultTitle === '通关！' && /^用时 \d+ 天 · 最终金币 \d+ \/ 1000$/.test(t.resultStats ?? '') && !!t.restart,
      `title=${t.resultTitle} · stats=${t.resultStats}`);
    check('结算屏**对局键整条收起**（无死路操作·屏上只有这一个出口）',
      !t.readouts && !t.actions && !t.buttons.till && !t.buttons.sleep,
      `readouts=${t.readouts} actions=${t.actions} till键=${!!t.buttons.till}`);
    check('重开键：真 DOM button 且 data-action=restart（消费者 = 宿主局生命周期 handler）',
      t.restart?.action === 'restart', `data-action=${t.restart?.action} label=${t.restart?.label}`, ['restart']);
    await shot('6-terminal');
    // [观察·非断言] canvas 那排按钮实体在终局屏上还活着吗？DOM 动作条由 `buildHud` 换屏收起，
    //   而 canvas 层是**世界实体**（4 工具 + 睡觉 + 卖货各一枚 Clickable）——它不跟着换屏。
    //   世界坐标取 theme.ts 的 `BTN_X0 + 4*BTN_DX`（=睡觉那枚）与 `BTN_Y`。
    //   结果记进日志供 S4 对齐单判断：「结算屏只有一个出口」这句话在 DOM 侧为真、在 canvas 侧未必。
    {
      // 终局屏上 DOM 读数已收起 ⇒ 唯一的可读世界窗口是结算面板的战绩文字（`用时 N 天 · 最终金币 N`）。
      // 它由 `ui.update` 每次世界提交后重画，故「战绩文字变了」= 世界真被推动了（不是屏刷新）。
      const t0o = await state();
      const bp = await worldPoint(80 + 4 * 112, 758);
      await page.mouse.click(bp.x, bp.y);
      await page.waitForTimeout(500);
      const t1o = await state();
      say(`  · [观察·非断言] 终局屏上点 canvas 的「睡觉」实体（世界坐标 528,758）：战绩「${t0o.resultStats}」→「${t1o.resultStats}」 · 面板仍在=${t1o.result}`);
      say(`      （读数此刻已收起 ⇒ 只有战绩文字可读；文字变了 = canvas 那排按钮在终局屏上**仍然活着**，`);
      say(`        文字没变则本观察**不足以判死**——也可能是「面板没重画」，故仅记事实、不进断言。）`);
    }

    // ── ⛔ 真点重开 → 断言**世界真的变了**（不是「屏刷新了」）───────────────────
    say('\n── 点「重开」──');
    await page.click('#g109-hud-restart').catch(() => {});
    const fresh = await until((s) => !s.result && s.gold?.[0] === 0 && s.day === 1, '重开回初态', 6000);
    const f = fresh.s;
    check('重开后：结算面板消失 + 读数回来了', fresh.ok && !f.result && f.readouts && f.actions,
      `面板=${f.result} 读数=${f.readouts} 动作条=${f.actions}`, ['restart']);
    check('重开后：金币 0 / 1000 · 第 1 天 · 体力 20/20 · 工具回到锄地',
      f.gold[0] === 0 && f.gold[1] === 1000 && f.day === 1 && f.energy[0] === 20 && f.toolName === '锄地',
      `${f.gold.join('/')} · 第${f.day}天 · ${f.energy.join('/')} · ${f.toolName}`, ['restart']);
    check('重开后：6 枚动作键全回来（4 工具 + 睡觉 + 卖货）',
      ['till', 'sow', 'water', 'reap', 'sleep', 'sell'].every((k) => !!f.buttons[k]),
      Object.keys(f.buttons).filter((k) => f.buttons[k]).join(','), ['restart']);
    check('重开后：canvas 与 HUD 各只有一份（没起两台引擎/两个挂载）',
      f.canvasCount === 1 && f.hudCount === 1, `canvas×${f.canvasCount} · HUD×${f.hudCount}`, ['restart']);
    // 「地块回 wild」的硬证据：旧局这 6 格是 tilled（第 4 天收完还原·上面刚验过锄地被拒），
    // 新局它们必须能重新锄且**逐格扣 1 体力** —— 屏幕刷新做不到这件事，只有世界真换了才行。
    const backToWild = await batch('till', d1, '新局重新锄 4 列（旧局这 6 格是 tilled）');
    const fr = await state();
    check('重开后：旧局已翻土的 6 格全部**可重新锄地**且逐格扣 1（体力 20 → 14）⇒ 世界真回初态',
      backToWild === 6 && fr.energy[0] === 14, `成功 ${backToWild}/6 · 体力 ${fr.energy[0]}`, ['restart', 'pick-till', 'work-canvas']);
    await shot('7-restarted');
    // ⚔ 对抗性输入：连点重开键 5 下（此刻它已不在屏上）——不许起第二个世界。
    await page.evaluate(() => { const el = document.getElementById('g109-hud-restart'); for (let i = 0; i < 5; i++) el?.click(); });
    await page.waitForTimeout(600);
    const sp = await state();
    check('连点 5 下重开键：屏与世界都稳（单 canvas/单 HUD·体力仍 14）【对抗性输入】',
      sp.canvasCount === 1 && sp.hudCount === 1 && sp.energy[0] === 14, `canvas×${sp.canvasCount} · 体力 ${sp.energy[0]}`, ['restart']);
    check('全程控制台零 error / 零未捕获异常', errors.length === 0, errors.join(' | ') || '干净');

    // ── 对账表：屏上每个世界动作都必须被点名过 ──────────────────────────────
    say('\n══ 屏上世界动作 × 点名断言（self-check.md:36-38）══');
    const namedBy = (a) => checks.filter((c) => c.named.includes(a)).map((c) => c.name);
    let missing = 0;
    for (const a of ACTION_SURFACE) {
      const who = namedBy(a);
      if (!who.length) missing++;
      say(`  ${who.length ? '✓' : '✗'} ${a} ← ${who.length ? `${who.length} 条点名（如「${who[0]}」）` : '**没有任何断言点名它 = 死键**'}`);
    }
    check(`屏上 ${ACTION_SURFACE.length} 个世界动作逐个被断言点名（无死键）`, missing === 0, missing ? `${missing} 个没人点名` : '全部点名');

    // 像素观察的汇总（非断言·供 S4 对齐单引用：屏幕对「翻土/播种/浇水/生长」到底有没有反馈）。
    const distinct = new Set(pixLog.map((p) => p.h)).size;
    say(`  · [像素观察·非断言] ${pixLog.length} 次采样中不同指纹 ${distinct} 个（同一格 r0c4）`);
    say(`    ${pixLog.map((p) => `${p.label}=${p.h}`).join('\n    ')}`);
    // 判别力自检（逐刻差分·见 pixProbe 的注）：干活前应与同刻荒地同指纹、干活后必须不同。
    // 两半**都要看**——只挑「干活后不同」的一半，等于把「裁剪点根本没落在网格里」这种错漏掉。
    const sameBefore = pixLog[0].h === pixLog[0].ref;
    const diffAfter = pixLog.slice(1).every((p) => p.h !== p.ref);
    say(`  · [像素观察·非断言] 判别力自检：干活前 r0c4=${pixLog[0].h} vs 同刻荒地 r0c1=${pixLog[0].ref} → ${sameBefore ? '同指纹 ✓（该格本来就这样）' : '⚠ 还没干活就与荒地不同——裁剪点可能没落在网格里'}`);
    say(`    干活后 ${pixLog.length - 1} 次 vs 同刻荒地：${diffAfter ? '每次都不同 ✓（变的是它，不是噪声）' : '⚠ 有与荒地同指纹的采样——那次的「变了」不成立'}`);
  } finally {
    await browser.close();
    stopDevServer(dev.proc);
  }

  const bad = checks.filter((c) => !c.pass);
  const ok = bad.length === 0;
  say(`\n══ 结论：${ok ? `✅ 全部 ${checks.length} 条通过——真人靠真按钮 + 真点地块打完一局并重开` : `❌ ${bad.length}/${checks.length} 条未过`} ══`);
  writeFileSync(join(OUT, 'S4-play.log'), log.join('\n') + '\n');
  writeFileSync(join(OUT, 'S4-play.json'), JSON.stringify({ ok, checks, consoleErrors: errors }, null, 2) + '\n');
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
