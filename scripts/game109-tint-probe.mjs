#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/game109-tint-probe.mjs —— 地色 / 生长条的**像素证据**（R-10~R-13）
//
//  治的病（自证走查里抓到的一条自欺）：`game109-playthrough.mjs` 的 `pixProbe` 拿 60×60 裁剪图做
//  sha256，只能证「这块像素**变过**」——**变了不等于变对了**。全屏被刷成同一个色、条画反了、
//  条长不跟生长阶走……指纹全都会变，指纹也全都发现不了。本探针补的就是这另一半：
//  **把像素解出来，对着预期的色值逐位比**。
//
//  为什么必须落在这里而不是单测里：地色/条长的**最终消费者是 CanvasRenderer 的 `fillRect`**
//  （`r.color.tint` → `fillStyle` → `fillRect`），中间隔着「组件值 → collectRenderables →
//  chooseRenderMode → 2D 上下文」四道。jsdom 无 canvas，单测到组件值就断了；只有真浏览器能走完。
//
//  证什么（逐条对着 S4 对齐单的 ❌ 行）：
//    R-10/R-11  地块底色 = 生命周期 × 今日已浇 ⇒ 屏幕上那一格的像素值 = LIFE_TINTS[行]
//    R-12/R-13  生长条长随生长阶 ⇒ 同一条上的两个采样点，在 1/2 阶与 2/2 阶之间由「一作物一土色」
//               翻成「两处都是作物色」——**这是条宽真的在长的直接测量**，不是「有条」的存在性证明
//    判别力   同刻的**未动过**的参考格必须仍是荒·干（防「整屏一个色」把上面两条蒙过去）
//
//  ⛔ 本脚本**不证**什么（诚实边界，别拿它当人门）：
//    · 不证「好看/好认」——6 档土色的**人眼可辨度**是人的事（S6 换皮前的素坯期尤其如此）；
//    · 不证「玩家看得见这块画布」——那由 S3 点击门（点坐标命中地块）与 S4 走查（点下去世界真变）证；
//      本探针证的是「合成后的页面在这个屏幕位置上的像素确实是这个值」（截图 = 合成结果，非后备缓冲）。
//
//  用法：node scripts/game109-tint-probe.mjs [--dump]
//  退出码：0=全绿 · 1=有断言红 · 2=用法错 · 3=环境无浏览器（跳过·同 R1/R3 语义）
//  产物：public/games/game109/probe/S4-pixels.json（每条断言的期望/实测 RGB）+ 控制台逐条台账
//
//  ⚠ 本脚本**自带一份** LIFE_TINTS / 几何 / 售价的副本（同 playthrough 的护栏先例）：
//    数据一改这里就对不上而当场红，而不是拿旧色值去比新屏幕、把「探针过期」误读成「游戏坏了」。
//    改 data.ts 的 LIFE_TINTS/PLANT/FARM 时**必须同步改这里**。
// ═══════════════════════════════════════════════════════════════

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowserRuntime, startDevServer, stopDevServer, decodePNG } from './lib/render-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'games', 'game109', 'probe');
const PORT = 5731; // 5731：避开 owner 的活开发服 5173、渲染探针 5700、S4 走查 5729

// ── data.ts / theme.ts 的副本（改上游必同步改这里·见文件头护栏说明）──────────────
const CELL = 112, PAD = 24;
const tileX = (col) => PAD + col * CELL + CELL / 2;
const tileY = (row) => PAD + row * CELL + CELL / 2;
const LIFE_TINTS = [0x82905a, 0x6f7c4b, 0x9c7748, 0x825f38, 0x6b563a, 0x463524];
const ROW = { WILD_DRY: 0, TILLED_DRY: 2, SOWN_DRY: 4, SOWN_WET: 5 }; // 行 = 状态 × 2 + 湿
const CROP_TINT = { carrot: 0xd97a3a, wheat: 0xd8b44a, pumpkin: 0xc9622a };
const PLANT_W = 96, PLANT_DY = 38; // 生长条满宽 / 纵向偏移（theme.ts 的 PLANT）

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const rgbHex = (r, g, b) => (r << 16) | (g << 8) | b;

const log = [];
const checks = [];
const say = (l) => { log.push(l); console.log(l); };
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  say(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const rt = detectBrowserRuntime();
  if (!rt.ok) { console.error(`本机无浏览器（${rt.code}）：${rt.reason}`); process.exit(3); }
  const { chromium } = await import('playwright');
  const dev = await startDevServer(ROOT, { port: PORT });
  const browser = await chromium.launch({ executablePath: rt.execPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`未捕获异常: ${e.message}`));
  await page.route('**/api/generate/providers', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/library', (r) => r.fulfill({ status: 200, body: '[]' }));

  mkdirSync(OUT_DIR, { recursive: true });

  /** 逻辑坐标 → 页面 CSS 坐标（canvas 的 content box 与场景逻辑坐标 1:1）。 */
  const cssPoint = (wx, wy) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const cssW = parseFloat(getComputedStyle(c).width), cssH = parseFloat(getComputedStyle(c).height);
    return { x: r.left + (x * r.width) / cssW, y: r.top + (y * r.height) / cssH };
  }, [wx, wy]);

  /**
   * 采一个逻辑坐标上的**合成像素**：裁剪 3×3 → 解码 PNG → 取中心像素。
   * 为什么取中心而不是 1×1：clip 的 x/y 会被取整，3×3 让中心稳稳落回目标点，且离色块边缘 ≥1px
   * （色块中心距任何边缘都有 40+px，抗锯齿/缩放的混色够不着）。
   * `scale:'css'` ⇒ 图里 1 像素 = 1 CSS 像素 = 1 场景逻辑像素（渲染器把 canvas 的 CSS 尺寸钉成逻辑尺寸）。
   */
  const px = async (wx, wy) => {
    const p = await cssPoint(wx, wy);
    if (!p) throw new Error('找不到 canvas（游戏没挂上？）');
    const clip = { x: Math.round(p.x) - 1, y: Math.round(p.y) - 1, width: 3, height: 3 };
    const buf = await page.screenshot({ clip, scale: 'css' });
    const img = decodePNG(buf);
    if (img.width !== 3 || img.height !== 3) throw new Error(`裁剪尺寸不符：${img.width}×${img.height}（要求 3×3）`);
    const o = (1 * img.width + 1) * img.channels; // 中心像素
    return rgbHex(img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]);
  };

  const tilePx = (row, col) => px(tileX(col), tileY(row));
  /** 生长条上的采样点：`fx` = 相对地块中心的横向偏移（-48..+48 = 满宽范围）。 */
  const barPx = (row, col, fx) => px(tileX(col) + fx, tileY(row) + PLANT_DY);

  /** 读 HUD（只读 DOM·不碰世界）——等世界真变了再采样，不靠猜时间。 */
  const hud = () => page.evaluate(() => {
    const t = (id) => document.getElementById(id)?.textContent?.trim() ?? null;
    const num = (id) => { const m = (t(id) || '').match(/(\d+)/); return m ? Number(m[1]) : null; };
    return { energy: num('g109-hud-energy'), day: num('g109-hud-day'), gold: num('g109-hud-gold') };
  });
  async function until(pred, desc, maxMs = 6000) {
    const t0 = Date.now();
    let s = await hud();
    for (;;) {
      if (pred(s)) return { ok: true, s };
      if (Date.now() - t0 > maxMs) return { ok: false, s, desc };
      await page.waitForTimeout(60);
      s = await hud();
    }
  }
  const btn = (id) => `#g109-hud-btn-${id}`;
  const clickTile = async (row, col) => { const p = await cssPoint(tileX(col), tileY(row)); await page.mouse.click(p.x, p.y); };
  /** 做一件活（选工具 → 点格 → 等扣体力）。返回是否真干成了——**不成就当场红**，不许静静跳过。 */
  async function act(tool, row, col, label) {
    const before = await hud();
    await page.click(btn(tool)).catch(() => {});
    await page.waitForTimeout(80);
    await clickTile(row, col);
    const r = await until((s) => s.energy === before.energy - 1, `${label} 应扣 1 体力`, 4000);
    check(`${label}（${tool} r${row}c${col}）真干成了：体力 ${before.energy} → ${before.energy - 1}`, r.ok,
      r.ok ? `实测 体力 ${r.s.energy}` : `体力停在 ${r.s.energy}（起点 ${before.energy}）⇒ 该格的前置门没放行`);
    return r.ok;
  }
  async function sleepNight(label) {
    const before = await hud();
    await page.click(btn('sleep')).catch(() => {});
    const r = await until((s) => s.day === before.day + 1 && s.energy === 20, `${label} 应推一天`, 8000);
    check(`${label}：第 ${before.day} 天 → 第 ${(before.day ?? 0) + 1} 天、体力回满`, r.ok,
      r.ok ? `实测 第 ${r.s.day} 天 · 体力 ${r.s.energy}` : `实测 第 ${r.s.day} 天 · 体力 ${r.s.energy}`);
    return r.ok;
  }
  /** 采样一条：把实测色与期望色并排落账（这是证据本体，红绿都记）。 */
  const shots = [];
  async function expectPx(name, at, want, what) {
    const got = await at();
    shots.push({ name, what, want: hex(want), got: hex(got) });
    check(`${name}：${what} = ${hex(want)}`, got === want, `实测 ${hex(got)}（期望 ${hex(want)}）`);
    return got;
  }

  const tileName = (row, col) => `r${row}c${col}`;
  const REF = [5, 5];              // 参考格：全程不碰（南瓜列）——判别力自检用
  const CARROT = [0, 0];           // 地色序列（胡萝卜列）
  const WHEAT = [0, 2];            // 生长条序列（小麦列·days=2 ⇒ 1/2 与 2/2 两阶可测）

  try {
    say('══ game109 地色 / 生长条 像素探针（真浏览器·真截图·真解码）══\n');
    await page.goto(`http://localhost:${dev.port}/?game=game109`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const boot = await until((s) => s.energy !== null && s.day !== null, 'HUD 就位', 15000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700); // 让首帧画面沉淀（渲染循环 rAF）

    const geom = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? { css: [c.style.width, c.style.height], buf: [c.width, c.height], dpr: window.devicePixelRatio } : null;
    });
    check('画布就位且 CSS 尺寸 = 场景逻辑尺寸（本探针的坐标口径前提）',
      boot.ok && geom?.css[0] === '720px' && geom?.css[1] === '910px',
      `canvas CSS=${geom?.css.join('×')} 缓冲=${geom?.buf.join('×')} dpr=${geom?.dpr}`);

    // 首帧沉淀：等到参考格真画成了「荒·干」再开测（**不是遮羞布**——等不到就照常往下走，
    // 下面的断言会如实地红，只是红的读数会是「还没画」而非「画错了」，故这里不吞超时）。
    {
      const t0 = Date.now();
      let got = await tilePx(...[5, 5]);
      while (got !== LIFE_TINTS[ROW.WILD_DRY] && Date.now() - t0 < 5000) {
        await page.waitForTimeout(100); got = await tilePx(...[5, 5]);
      }
      say(`  · 首帧沉淀：参考格实测 ${hex(got)}（等 ${Date.now() - t0}ms）\n`);
    }

    // ── ① 地色：生命周期 × 今日已浇（R-10/R-11）──────────────────────────────
    say('\n── ① 地色六档随「生命周期 × 浇水」变（R-10/R-11·胡萝卜格 r0c0）──');
    await expectPx(`地色·开局（荒·干）`, () => tilePx(...CARROT), LIFE_TINTS[ROW.WILD_DRY], `${tileName(...CARROT)} 生地`);
    await expectPx(`地色·参考格（全程不动）`, () => tilePx(...REF), LIFE_TINTS[ROW.WILD_DRY], `${tileName(...REF)} 生地`);

    await act('till', ...CARROT, '翻土');
    await expectPx('地色·翻土后（翻·干）', () => tilePx(...CARROT), LIFE_TINTS[ROW.TILLED_DRY], `${tileName(...CARROT)} 生地`);

    await act('sow', ...CARROT, '播种');
    await expectPx('地色·播种后（播·干）', () => tilePx(...CARROT), LIFE_TINTS[ROW.SOWN_DRY], `${tileName(...CARROT)} 生地`);

    await act('water', ...CARROT, '浇水');
    await expectPx('地色·浇水后（播·湿）= 六档里最暗那档', () => tilePx(...CARROT), LIFE_TINTS[ROW.SOWN_WET], `${tileName(...CARROT)} 生地`);

    await expectPx('判别力·参考格没被连带改色', () => tilePx(...REF), LIFE_TINTS[ROW.WILD_DRY], `${tileName(...REF)} 生地`);
    {
      // 判别力：同一天里被浇过的格与没碰过的格**必须不同色**——防「整屏刷成一个色」把上面几条蒙过去。
      const [a, b] = [await tilePx(...CARROT), await tilePx(...REF)];
      check('判别力·同刻两格色不同（不是整屏一个色）', a !== b && b === LIFE_TINTS[ROW.WILD_DRY],
        `${tileName(...CARROT)}=${hex(a)} · ${tileName(...REF)}=${hex(b)}`);
    }

    // ── 同时开一垄小麦（生长条序列要用；r0c0 的收获留到第二天）──────────────
    say('\n── ② 开一垄小麦 r0c2（生长条序列的被测对象）──');
    await act('till', ...WHEAT, '翻土');
    await act('sow', ...WHEAT, '播种');
    await act('water', ...WHEAT, '浇水');

    // ── ③ 生长条：0 阶不可见（R-12/R-13）────────────────────────────────────
    say('\n── ③ 生长条 · 0 阶：条宽 0 ⇒ 条的位置上看到的是地块底色 ──');
    // 1/2 阶时条带占 [−48,0]、[0,48] 是土 ⇒ 两点由 PLANT_W 推得，正好跨过 1/2 阶的右端
    const barIn = -PLANT_W / 4, barOut = PLANT_W / 4;
    await expectPx('生长条·0 阶·左采样点在条内但在 0 阶无可画', () => barPx(...WHEAT, barIn), LIFE_TINTS[ROW.SOWN_WET], `${tileName(...WHEAT)} 条带左点`);
    await expectPx('生长条·0 阶·右采样点', () => barPx(...WHEAT, barOut), LIFE_TINTS[ROW.SOWN_WET], `${tileName(...WHEAT)} 条带右点`);

    // ── ④ 睡一觉：浇水旗清、生长阶 +1 ────────────────────────────────────────
    await sleepNight('睡觉（第 1 夜）');
    say('\n── ④ 第 2 天：地色回「播·干」（浇水旗被清）；胡萝卜熟、小麦 1/2 阶 ──');
    await expectPx('地色·睡醒后浇水旗被清（播·干）', () => tilePx(...CARROT), LIFE_TINTS[ROW.SOWN_DRY], `${tileName(...CARROT)} 生地`);
    await expectPx('生长条·1/2 阶·左采样点在条内 = 小麦色', () => barPx(...WHEAT, barIn), CROP_TINT.wheat, `${tileName(...WHEAT)} 条带左点`);
    await expectPx('生长条·1/2 阶·右采样点仍在条外 = 地块底色', () => barPx(...WHEAT, barOut), LIFE_TINTS[ROW.SOWN_DRY], `${tileName(...WHEAT)} 条带右点`);

    // ── ⑤ 收获：成熟的胡萝卜格回「翻·干」+ 生长阶清零 ───────────────────────
    // 顺带在满阶时采一次它的条色：与小麦条同刻、同为满阶 ⇒ 两个作物**各自的**条色（逐作物一色，
    // 不是全局常量；若条色抄了地色/常量，这条会红）。
    await expectPx('生长条·胡萝卜满阶（1/1）= 胡萝卜色（逐作物各一色）',
      () => barPx(...CARROT, 0), CROP_TINT.carrot, `${tileName(...CARROT)} 条带中心`);

    await act('reap', ...CARROT, '收获');
    await expectPx('地色·收获后（翻·干·可接着播种）', () => tilePx(...CARROT), LIFE_TINTS[ROW.TILLED_DRY], `${tileName(...CARROT)} 生地`);

    // ── ⑥ 再浇一晚 → 2/2 阶：条长到满宽 ⇒ 两个采样点**同时**变作物色 ─────────
    await act('water', ...WHEAT, '浇水');
    await sleepNight('睡觉（第 2 夜）');
    say('\n── ⑥ 第 3 天：小麦 2/2 阶 ⇒ 条从 1/2 长到满宽（右采样点由土色翻成作物色）──');
    await expectPx('生长条·2/2 阶·左采样点 = 小麦色', () => barPx(...WHEAT, barIn), CROP_TINT.wheat, `${tileName(...WHEAT)} 条带左点`);
    await expectPx('生长条·2/2 阶·右采样点 = 小麦色（**条真的长过来了**）', () => barPx(...WHEAT, barOut), CROP_TINT.wheat, `${tileName(...WHEAT)} 条带右点`);
    // 条带的**上界**：满阶时条带铺满整幅宽，但它是「一条」不是「整格刷成作物色」——
    // 地块中心（条带上方 38px）必须仍是地色。这条把「条」与「整格变色」分开。
    // ⚠ 别再往条的右侧找「条外」采样点：条满宽 96、地块 Shape 只有 102 ⇒ 右侧只剩 3px 可见
    //   （再往外 6px 就出格了，2026-09-18 首跑实测采到 #618041 = 格间空隙露出的场景渐变底）。
    await expectPx('生长条·满阶时条带上方（地块中心）仍是地色 = 条没糊满整格',
      () => tilePx(...WHEAT), LIFE_TINTS[ROW.SOWN_DRY], `${tileName(...WHEAT)} 条带上方的地色`);

    // ── ⑦ 判别力总账：本次实测到的色值必须 ≥4 种不同 ─────────────────────────
    say('\n── ⑦ 判别力自检 ──');
    const distinct = new Set(shots.map((s) => s.got));
    check(`本次采样取到 ≥4 种不同颜色（实测 ${distinct.size} 种）——「整屏一个色」过不了上面任何一条`,
      distinct.size >= 4, [...distinct].join(' ')); // got 已是 `#rrggbb` 字符串
    check('控制台无报错', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : '零 console.error / 零未捕获异常');
  } finally {
    const passed = checks.filter((c) => c.pass).length;
    const failed = checks.length - passed;
    say(`\n═══ ${passed}/${checks.length} 绿${failed ? ` · ${failed} 红` : ''} ═══`);
    writeFileSync(join(OUT_DIR, 'S4-pixels.json'), JSON.stringify({
      generatedAt: new Date().toISOString().slice(0, 10),
      port: PORT, lifeTints: LIFE_TINTS.map(hex), cropTint: CROP_TINT,
      checks, shots, log,
    }, null, 2));
    say(`台账：public/games/game109/probe/S4-pixels.json`);
    await browser.close();
    stopDevServer(dev);
    process.exit(failed ? 1 : 0);
  }
}

main().catch((e) => { console.error(`探针异常：${e?.stack ?? e}`); process.exit(1); });
