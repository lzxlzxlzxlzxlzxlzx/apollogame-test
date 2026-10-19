#!/usr/bin/env node
// UI 审计工具 · ZeroCraft 数据驱动 UI 自检（配 docs/design/ui-playbook.md）
//
// 干什么：把一棵 LayoutNode 树 mount 到真浏览器，量真实包围盒 + computed 颜色，
//   程序化检查两件 validate.ts 挡不住的事：① 组件重叠（overlap）② 文字对比度（contrast）。
//   绿了 exit 0；有问题打印清单 + exit 1（可进 CI / pre-push 卡口）。
//
// 怎么用：
//   node tools/ui-audit.mjs <entry.ts> [--mount root] [--w 1060] [--h 760] [--min-contrast 4.5]
//   entry.ts 须把树 mount 到 document.getElementById('<mount>')（缺省 id 'root'）。
//   现成示例入口：tools/audits/*.audit.ts（如 mmo-hud.audit.ts）。
//   一行跑示例：  node tools/ui-audit.mjs tools/audits/mmo-hud.audit.ts
//
// 判定规则（与 ui-playbook.md §1/§2 同源）：
//   · 重叠：只比**带 id 的绝对定位元素**两两相交（装饰层 vignette/pattern/sheen 是无 id 的 inset 覆盖层→天然排除；
//     祖孙嵌套排除）。相交面积 > 容差 = 不合格。意图叠层请在 entry 里用 data-allow-overlap 标（见下）。
//   · 对比：每个含直接文字的元素，取 computed color vs 逐层向上第一个不透明背景，算 WCAG 比；< 阈值 = 不合格。
//
// 依赖：vite（项目内）+ playwright + chromium（本环境 /opt 预装）。无侵入项目依赖。

import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 参数 ───────────────────────────────────────────────
const argv = process.argv.slice(2);
const entry = argv.find((a) => !a.startsWith('--'));
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
if (!entry) {
  console.error('用法: node tools/ui-audit.mjs <entry.ts> [--mount root] [--w 1060] [--h 760] [--min-contrast 4.5]');
  process.exit(2);
}
const MOUNT = opt('mount', 'root');
const W = Number(opt('w', 1060));
const H = Number(opt('h', 760));
const MIN_CONTRAST = Number(opt('min-contrast', 4.5)); // AA 正文目标：低于此=警告（次级文字常落这）
const HARD_FLOOR = Number(opt('hard-floor', 3.0));     // 硬地板：低于此=真读不清(深底深字/字≈底)=失败阻断
const OVERLAP_TOL = Number(opt('overlap-tol', 4)); // px² 容差
// 可选真实浏览器 9-slice 合同量测：`--skin-measure panel:115:58,button:115:36`。
// 量的是 computed style 与 border-box，避免只靠 HTML 字符串断言。
const SKIN_MEASURES = opt('skin-measure', '').split(',').filter(Boolean).map((spec) => {
  const [id, source, width] = spec.split(':');
  if (!id || !Number.isFinite(Number(source)) || !Number.isFinite(Number(width))) throw new Error(`非法 --skin-measure：${spec}（格式 id:source:width）`);
  return { id, source: Number(source), width: Number(width) };
});

// ── 1) vite 把 entry 打成 IIFE ──────────────────────────
const tmp = join(ROOT, '.ui-audit-gci-7683030b-tmp');
const bundleName = 'audit-bundle.js';

// playwright 解析（项目内优先，回落本环境 /opt 预装）
async function loadChromium() {
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { const m = await import(c); if (m.chromium) return m.chromium; } catch { /* next */ }
  }
  throw new Error('找不到 playwright（项目未装且 /opt 回落失败）');
}

// try/finally：无论 build/launch/evaluate 哪步抛错，都关浏览器 + 清临时目录（防进程/磁盘泄漏）。
let browser, report;
try {
  mkdirSync(tmp, { recursive: true });
  await build({
    configFile: join(ROOT, 'vite.config.ts'),
    logLevel: 'error',
    build: { write: true, outDir: tmp, emptyOutDir: false,
      lib: { entry: resolve(ROOT, entry), formats: ['iife'], name: 'UIAudit', fileName: () => bundleName } },
  });
  writeFileSync(join(tmp, 'audit.html'),
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#06080d"><div id="${MOUNT}" style="width:${W - 20}px"></div><script src="./${bundleName}"></script></body>`);
  const chromium = await loadChromium();
  // CI images supply /opt/pw-browsers; Windows contributors may instead have
  // Playwright's bundled browser or Edge.  Pick an existing executable rather
  // than hard-failing a read-only audit before it can inspect the UI.
  const candidates = [
    process.env.UI_AUDIT_CHROMIUM,
    chromium.executablePath?.(),
    '/opt/pw-browsers/chromium',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`file://${join(tmp, 'audit.html')}`);
  await page.waitForTimeout(600);

  // 浏览器内量包围盒 + 颜色，跑两项审计
  report = await page.evaluate(({ MOUNT, OVERLAP_TOL, MIN_CONTRAST, HARD_FLOOR, SKIN_MEASURES }) => {
  const host = document.getElementById(MOUNT);
  const base = host.getBoundingClientRect();
  const rel = (r) => ({ x: Math.round(r.x - base.x), y: Math.round(r.y - base.y), w: Math.round(r.width), h: Math.round(r.height) });

  // — 重叠：带 id 的绝对/固定定位元素（排除装饰无 id 层；排除标了 data-allow-overlap 的意图叠层）—
  const positioned = [...host.querySelectorAll('[id]')].filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.position === 'absolute' || cs.position === 'fixed') && el.getAttribute('data-allow-overlap') === null;
  });
  const isRelated = (a, b) => a.contains(b) || b.contains(a);
  const interArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                              Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const overlaps = [];
  for (let i = 0; i < positioned.length; i++)
    for (let j = i + 1; j < positioned.length; j++) {
      if (isRelated(positioned[i], positioned[j])) continue;
      const ra = rel(positioned[i].getBoundingClientRect()), rb = rel(positioned[j].getBoundingClientRect());
      const a = interArea(ra, rb);
      if (a > OVERLAP_TOL) overlaps.push({ a: positioned[i].id, b: positioned[j].id, area: Math.round(a) });
    }

  // — 对比：含直接文字的元素 vs 逐层向上第一个不透明背景 —
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = (rgb) => { const a = rgb.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const ratio = (f, b) => { const L1 = lum(f), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  // 渐变底取首个色标当实底（REQ-108-UI-01 / REQ-C-110 / A-022·跨 game-a/c/i/108 假阳）：
  // 渐变元素没有 backgroundColor（transparent）→ 旧逻辑跳过、一路穿透到近黑页底 → 金渐变键近黑字被误判 1.1x。
  // 真实底是渐变本身·文字压的是它——故读 backgroundImage 的 linear/radial-gradient 首个色标(computed 归一成 rgb())当实底。
  const gradientBg = (cs) => {
    const bi = cs.backgroundImage;
    if (!bi || !/gradient\(/.test(bi)) return null;
    const m = bi.match(/rgba?\(([\d.,\s]+)\)/); // 首个色标（渐变起色·文字多压在这一端）
    if (!m) return null;
    const c = m[1].split(',').map(Number);
    return (c[3] === undefined || c[3] >= 0.5) ? c.slice(0, 3) : null; // 太透的渐变仍穿透
  };
  const solidBgUp = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n); const bg = parse(cs.backgroundColor);
      if (bg && (bg[3] === undefined || bg[3] >= 0.95)) return bg.slice(0, 3);
      const grad = gradientBg(cs); if (grad) return grad; // 渐变底 → 取首色标当实底（不再跳过穿透）
      n = n.parentElement;
    }
    return [6, 8, 13]; // 兜底页面深底
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  // emoji/符号：自带彩色字形，不吃 CSS color → 对比检查对它无意义。去掉 emoji + 变体选择符后无「真字符」的元素跳过。
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{2000}-\u{206F}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2660}-\u{2667}]/gu;
  const isGlyphOnly = (s) => !s.replace(EMOJI, '').replace(/[\s·:：>/|]/g, '').trim();
  const low = [];
  for (const el of host.querySelectorAll('*')) {
    const txt = ownText(el);
    if (!txt) continue;
    if (isGlyphOnly(txt)) continue; // 纯 emoji/符号 → 跳过（不吃 text-color·量它是噪音）
    if (el.closest('[data-audit-skip-contrast]')) continue; // 定色语义原语（扑克牌红黑花色·牌面本色）→ 免对比检查（A-007b）
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
    // 祖先 display:none 不改子元素 computed display（display 不继承）→ 隐藏 tab 页/收起抽屉里的文字会被误计。
    // 未渲染子树 client rects 为空/零尺寸 → 跳过（只审真正画在屏上的字·REQ-UIFX 复查修·此前 219 「硬失败」多为隐藏页幻影）。
    const rects = el.getClientRects();
    if (!rects.length || (rects[0].width === 0 && rects[0].height === 0)) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const r = ratio(fg.slice(0, 3), solidBgUp(el));
    const big = parseFloat(cs.fontSize) >= 18 && Number(cs.fontWeight) >= 600;
    const need = big ? 3 : MIN_CONTRAST;
    if (r < need) {
      const hard = r < (big ? 2.4 : HARD_FLOOR); // 大字硬地板放宽到 2.4
      low.push({ id: el.id || `<${el.tagName.toLowerCase()}>`, text: el.textContent.trim().slice(0, 18), ratio: Math.round(r * 100) / 100, need, hard });
    }
  }
  // — border-image 前提守卫（REQ-FACEART③·工具债提前清）：设了 border-image-source 却缺 border-style/width →
  //   真浏览器一像素不画（happy-dom 字符串断言测不出·faceArtSlice 就栽在此盲区）。缺前提=阻断。
  const borderImageBroken = [];
  for (const el of host.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const src = cs.borderImageSource;
    if (!src || src === 'none') continue;
    const noStyle = /^(none\s*)+$/.test((cs.borderStyle || '').trim());
    const noWidth = ((cs.borderWidth || '').match(/[\d.]+/g) || [0]).map(Number).every((w) => w === 0);
    if (noStyle || noWidth) borderImageBroken.push({ id: el.id || `<${el.tagName.toLowerCase()}>`, why: noStyle ? 'border-style:none' : 'border-width:0' });
  }
  // — 华丽度（华丽起手第三步「逛橱窗挑成熟件」没产物·就给它造一个产物）：数 DOM 里的华丽件命中，逐类列。
  //   零命中 = 通体朴素默认屏（SHELL 灰皮·没挑任何成熟件）= 华丽起手铁律要拦的形态。非阻断（警告·打回是 PUI 复查的裁量）。
  const flair = { skin: 0, shape: 0, fx: 0, glass: 0, juice: 0, particles: 0 };
  for (const el of host.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (el.matches('[data-apollo-skin]') || (cs.borderImageSource && cs.borderImageSource !== 'none')) flair.skin++;       // 贴图皮/house buttonSkins/faceArt 9-slice
    if (cs.clipPath && cs.clipPath !== 'none') flair.shape++;                                                             // 异形 shape/chamfer
    if (el.matches('[data-fx],[data-sheen]')) flair.fx++;                                                                 // 流光/发光/holo/pulse…
    if (cs.backdropFilter && cs.backdropFilter !== 'none') flair.glass++;                                                 // 磨砂玻璃
    if (el.matches('[data-typewriter],[data-tween-to],[data-flyto-to],[data-tilt3d],[data-press3d]')) flair.juice++;     // 打字机/滚动/飞向/3D 手感
    if (el.matches('[data-particle],[data-particle-follow]') || /particle/i.test(el.id)) flair.particles++;              // 庆祝/环境粒子
  }
  const flairTotal = Object.values(flair).reduce((a, b) => a + b, 0);
  const houseTheme = !!host.querySelector('[data-apollo-skin]') || flair.skin > 0; // house 主题的强信号（buttonSkins/纸纹面留 border-image）
  // — 可选 9-slice 实测：source slice、显示 border-image-width、四边 border-width、border-box 与内容安全区 —
  const skinMeasures = SKIN_MEASURES.map((spec) => {
    const el = host.querySelector(`#${CSS.escape(spec.id)}`);
    if (!el) return { ...spec, ok: false, why: 'missing element' };
    const cs = getComputedStyle(el); const box = el.getBoundingClientRect();
    const source = Number.parseFloat(cs.borderImageSlice);
    const imageWidth = Number.parseFloat(cs.borderImageWidth);
    const borders = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(Number.parseFloat);
    const content = { w: Math.max(0, box.width - borders[1] - borders[3]), h: Math.max(0, box.height - borders[0] - borders[2]) };
    const ok = cs.borderImageSource !== 'none' && source === spec.source && imageWidth === spec.width && borders.every((value) => value === spec.width) && content.w > 0 && content.h > 0;
    return { ...spec, ok, source, imageWidth, borders, box: rel(box), content, why: ok ? undefined : 'computed border-image/source/width or content box mismatch' };
  });
  return { positionedCount: positioned.length, overlaps, low, borderImageBroken, flair, flairTotal, houseTheme, skinMeasures };
  }, { MOUNT, OVERLAP_TOL, MIN_CONTRAST, HARD_FLOOR, SKIN_MEASURES });
} finally {
  if (browser) await browser.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
}

// ── 4) 打印 + 退出码 ────────────────────────────────────
const hardLow = report.low.filter((l) => l.hard);
const warnLow = report.low.filter((l) => !l.hard);
console.log(`\n=== UI 审计 · ${entry} (${W}×${H}) ===`);
console.log(`绝对定位元素(带 id)：${report.positionedCount}`);
console.log(`\n[重叠] ${report.overlaps.length} 处（容差 ${OVERLAP_TOL}px²）— 阻断`);
for (const o of report.overlaps) console.log(`  ✕ ${o.a}  ⨉  ${o.b}   area=${o.area}px²`);
console.log(`\n[对比·硬失败 <${HARD_FLOOR}] ${hardLow.length} 处（真读不清·深底深字/字≈底）— 阻断`);
for (const l of hardLow) console.log(`  ✕ ${l.id.padEnd(16)} "${l.text}"  ratio=${l.ratio}`);
console.log(`\n[对比·警告 ${HARD_FLOOR}–${MIN_CONTRAST}] ${warnLow.length} 处（多为 dim 次级文字·复核非阻断）`);
for (const l of warnLow) console.log(`  ! ${l.id.padEnd(16)} "${l.text}"  ratio=${l.ratio} (AA 需≥${l.need})`);

const biBroken = report.borderImageBroken ?? [];
console.log(`\n[border-image 前提] ${biBroken.length} 处（设了皮却缺 border-style/width·真浏览器不画）— 阻断`);
for (const b of biBroken) console.log(`  ✕ ${b.id.padEnd(16)} ${b.why}`);

const skinMeasures = report.skinMeasures ?? [];
if (skinMeasures.length) {
  console.log(`\n[9-slice 实测] ${skinMeasures.length} 个目标（computed slice / 显示边宽 / 四边 border / border-box / 内容安全区）— 阻断`);
  for (const m of skinMeasures) {
    const actual = `slice=${m.source ?? '-'} imageWidth=${m.imageWidth ?? '-'} border=${m.borders?.join('/') ?? '-'} box=${m.box ? `${m.box.w}×${m.box.h}` : '-'} content=${m.content ? `${m.content.w}×${m.content.h}` : '-'}`;
    console.log(`  ${m.ok ? '✓' : '✕'} ${m.id}  expect ${m.source}:${m.width}  ${actual}${m.why ? ` (${m.why})` : ''}`);
  }
}

// [华丽度] 华丽起手第三步的产物（逛橱窗挑成熟件·把「逛没逛」从心理活动变成可 review 的数字）— 非阻断·警告。
const fl = report.flair ?? {};
const flStr = Object.entries(fl).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(' ') || '无';
console.log(`\n[华丽度] ${report.flairTotal ?? 0} 处华丽件命中（${flStr}）· house 主题：${report.houseTheme ? '是' : '否'} — 非阻断·产物给「华丽起手第三步」`);
if ((report.flairTotal ?? 0) === 0) {
  console.log(`  ⚠ 零华丽件命中 = 疑似通体朴素默认屏（SHELL 灰皮·没挑任何成熟件）。华丽起手第三步「逛 game-i 挑成熟件」可能没做——`);
  console.log(`    对着橱窗货架逐类核（卡牌/选关/庆祝/主CTA/数值/异形/环进度/立体·docs/design/ui-playbook.md §0），要么挑件、要么写明「本作无此类」。PUI 复查重点看这条。`);
} else if ((report.flairTotal ?? 0) < 3 && !report.houseTheme) {
  console.log(`  ⚠ 华丽件命中偏少且未见 house 主题皮——复核是否只搭了朴素骨架（华丽起手第三步核逐类货架）。`);
}

const fail = report.overlaps.length + hardLow.length + biBroken.length + skinMeasures.filter((m) => !m.ok).length;
console.log(`\n${fail === 0
  ? `✅ 通过（阻断项 0）：无重叠、无硬性读不清文字、border-image 前提齐。${warnLow.length ? ` 另有 ${warnLow.length} 处次级文字低于 AA·建议复核是否正文。` : ''}`
  : `❌ 不合格：${report.overlaps.length} 重叠 + ${hardLow.length} 硬性低对比 + ${biBroken.length} border-image 缺前提 + ${skinMeasures.filter((m) => !m.ok).length} 9-slice 实测失败。按 ui-playbook.md §1/§2 修。`}`);
process.exit(fail === 0 ? 0 : 1);


