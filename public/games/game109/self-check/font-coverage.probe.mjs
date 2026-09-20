#!/usr/bin/env node
// author: PE
// ═══════════════════════════════════════════════════════════════
//  game109 · S5 证据件：**艺术字 `cnround` 对本作终局标题「通关！」是否真生效**
//
//  【为什么需要这份探针】（不是为好看·是为不撒谎）
//    S5 观感精修给 `hud.ts::resultPanel` 的标题 Label 挂了 `font:'cnround'`（站酷快乐体·卡通粗圆黑）。
//    但 `cnround.woff2` 是**子集化**字体（`scripts/cjk-art-font-vendor.py`），不是全字库——
//    子集外的字会**逐字静默回退**系统字（同屏混两种字形·不报错·不告警）。
//    本仓已有前例：game108 第 2 轮实测「91 个汉字里缺 3 个」（`docs/design/game108/self-check/S5-alignment.md`
//    迭代记录·已开 REQ-108-UI-05；那次的修法是让子集脚本把 `games/**` 也扫进去，脚本现含该路径）。
//    子集 woff2 的落盘时间 = 2026-09-04，而本作文案是之后写的 ⇒ 「应该覆盖」是推断，不是事实。
//    若它没覆盖，`font:'cnround'` 就是**空操作**，我那句「终局标题换了艺术字」即为**伪证**。
//
//  【判据：为什么不用像素反推】（**两版都栽过，留档防回退**）
//    第一版比 canvas 像素（A 臂 `'ZCOOL KuaiLe', monospace` vs B 臂裸 `monospace`），
//    阴性对照「龘」（实测不在被扫文件里）却报 diff=8115px —— 比被测的「通」还大。
//    第二版把 B 臂改成 `'__NO_SUCH_FONT__', monospace`（只差族名在不在），**同一个字仍是 8115px**。
//    结论：像素差不是"艺术字画了它"，而是**只要栈里出现一个真字体族，Chrome 给汉字挑的系统回退本身就会变**
//    （栈依赖回退）⇒ 像素差**无法区分"艺术字生效"与"回退换了另一款系统字"**。
//    **像素反推这条路作废**，改用浏览器自己的账本：CDP `CSS.getPlatformFontsForNode`
//    ——它直接答「这个节点实际由哪个字体族画出、画了几个字形」，不经过任何反推。
//
//  【自带对照·防「秤本身坏了」】（这一条是这份探针能被信的前提）
//    · 阳性对照 `！`(U+FF01)：全角标点整段**无条件**入子集（脚本 `char_set()` 直接塞 range(0xFF01,0xFF5E)）
//      ⇒ 它**必须**报 `ZCOOL KuaiLe`。若报系统字，说明字体没加载成功/注入有误 = **秤坏了**，不是字体缺字。
//    · 阴性对照 `Ω`(U+03A9)：子集口径只收 CJK/假名/ASCII/全角四段，**希腊字母永不入集**
//      ⇒ 它**必须**报系统字体。若它报 `ZCOOL KuaiLe`，说明这杆秤看不出回退（与阳性对照互补：
//      一个证明"用了能看见"，一个证明"没用也看得见"）。
//    两支对照都符合预期，中间那三个字（通关！）的结论才可信。
//
//  【@font-face 取自仓内真身·不另写一份】
//    从 `src/ui/components/art-fonts-cjk.ts` 正则抠出 cnround 那条 `@font-face` 原样注入——
//    保证本探针测的就是 `mountUI` 注入的那条（`server.ts:303` 无条件注入 `ART_FONT_CJK_CSS`），
//    而不是我手抄一份可能漂移的副本。抠不到 ⇒ exit 2（宁可报废也不静默换一份假的）。
//
//  用法：node public/games/game109/self-check/font-coverage.probe.mjs
//  退出码：0=三字全覆盖（艺术字真生效）· 1=有字回退（该字的艺术字是空操作）· 2=前置/对照/取数失败 · 3=环境无浏览器
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// 路径四级上溯：self-check → game109 → games → public → 仓根（**只读复用** scripts/lib 的起服/浏览器探测，不改它）
import { detectBrowserRuntime, startDevServer, stopDevServer } from '../../../../scripts/lib/render-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PORT = 5719; // 错开 render-harness 默认 5700，避免与别的探针抢端口

const TITLE = '通关！';   // 真标题（hud.ts::resultPanel）
const POS = '！';         // 阳性对照（见头注）
const NEG = 'Ω';          // 阴性对照（见头注）
const ART = "'ZCOOL KuaiLe'";
const ABSENT = "'__NO_SUCH_FONT__'"; // 只用来做"艺术字不在场"的臂

// ── 0. 复刻子集脚本的扫描口径（同四支 glob·同三个码位区段），只为打印一行信息：
//    「今天的被扫文件里有没有这几个字」——有 ⇒ 重跑 vendoring 就能把字收进子集；没有 ⇒ 连重跑都救不了。
function scannedCjkSet() {
  const set = new Set();
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (name !== 'node_modules' && name !== '.git') walk(p); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      let t;
      try { t = readFileSync(p, 'utf8'); } catch { continue; }
      for (const ch of t) {
        const o = ch.codePointAt(0);
        if ((o >= 0x4e00 && o <= 0x9fff) || (o >= 0x3400 && o <= 0x4dbf) || (o >= 0x3040 && o <= 0x30ff)) set.add(ch);
      }
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'games'));
  return set;
}

// ── 1. 从仓内真身抠 @font-face（抠不到就报废，不静默换副本）─────────────────────
const cjkTs = readFileSync(join(ROOT, 'src', 'ui', 'components', 'art-fonts-cjk.ts'), 'utf8');
const m = cjkTs.match(/@font-face\{font-family:'ZCOOL KuaiLe';[^}]*\}/);
if (!m) {
  console.error('✗ 未能从 src/ui/components/art-fonts-cjk.ts 抠出 cnround 的 @font-face —— 字体清单或生成器已变，本探针需同步（拒绝用副本冒充）。');
  process.exit(2);
}
const FACE = m[0];
if (!FACE.includes('/ui-fonts/cjk/cnround.woff2')) {
  console.error(`✗ 抠出的 @font-face 未指向 /ui-fonts/cjk/cnround.woff2：${FACE}`);
  process.exit(2);
}

// ── 2. 浏览器 ───────────────────────────────────────────────────────────────
const rt = detectBrowserRuntime(process.env);
if (!rt.ok) {
  console.error(`⚠ ${rt.reason}`);
  process.exit(3);
}

let server = null;
let browser = null;
const done = (code) => {
  try { if (browser) browser.close(); } catch { /* 收尾失败不掩盖退出码 */ }
  try { stopDevServer(server); } catch { /* 同上 */ }
  process.exit(code);
};

try {
  const { chromium } = await import('playwright');
  ({ proc: server } = await startDevServer(ROOT, { port: PORT }));
  browser = await chromium.launch({ executablePath: rt.execPath });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: FACE });

  // 每字一个 span·三种字体栈（A=艺术字在场 / B=艺术字换成不存在的族名，其余回退链逐项相同 / C=本作 Label 无 font 时的写法）
  const chars = [...new Set([...TITLE, POS, NEG])];
  const stacks = { A: `${ART}, monospace`, B: `${ABSENT}, monospace`, C: 'monospace' };
  const nodes = await page.evaluate(async ({ chars, stacks, fam }) => {
    const load = await document.fonts.load(`64px ${fam}`, chars.join('')).then((f) => f.length).catch(() => -1);
    await document.fonts.ready;
    const faces = [...document.fonts].map((f) => `${f.family}:${f.status}`);
    const root = document.createElement('div');
    const ids = [];
    for (const [arm, stack] of Object.entries(stacks)) {
      for (const ch of chars) {
        const s = document.createElement('span');
        s.id = `probe-${arm}-${ch.codePointAt(0).toString(16)}`;
        s.textContent = ch;
        s.style.cssText = `font-size:64px;font-family:${stack}`;
        root.appendChild(s);
        ids.push({ arm, ch, id: s.id });
      }
    }
    document.body.appendChild(root);
    // 强制一次布局 + 等两帧，确保这些 span 真被排版/绘制过（CDP 账本只记画过的字体）
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const layout = {};
    for (const { id } of ids) { const el = document.getElementById(id); layout[id] = el ? `${el.offsetWidth}×${el.offsetHeight}` : 'NO-EL'; }
    return { load, faces, ids, layout, bodyChildren: document.body.children.length };
  }, { chars, stacks, fam: ART });

  // ── 3. 问浏览器账本：每个 span 实际由哪个字体族画出 ─────────────────────────
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root: docRoot } = await cdp.send('DOM.getDocument', { depth: -1 });
  const used = {};
  const diag = { noNode: 0, noFonts: 0 };
  for (const n of nodes.ids) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: docRoot.nodeId, selector: `#${n.id}` });
    if (!nodeId) { diag.noNode += 1; used[`${n.arm}:${n.ch}`] = null; continue; }
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    if (!fonts.length) diag.noFonts += 1;
    used[`${n.arm}:${n.ch}`] = fonts.map((f) => ({ family: f.familyName, glyphs: f.glyphCount, custom: !!f.isCustomFont }));
  }
  if (diag.noNode || diag.noFonts) {
    console.error(`⚠ 诊断：DOM.querySelector 找不到的节点 ${diag.noNode} 个 · 找到但账本为空的 ${diag.noFonts} 个 · body 直系子元素 ${nodes.bodyChildren} 个`);
    console.error(`   布局实测：${Object.entries(nodes.layout).slice(0, 4).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  }

  const artOf = (arm, ch) => used[`${arm}:${ch}`] || [];
  const drewByArt = (arm, ch) => artOf(arm, ch).some((f) => f.custom && /ZCOOL/i.test(f.family) && f.glyphs > 0);

  // ── 4. 判读 ───────────────────────────────────────────────────────────────
  const scanned = scannedCjkSet();
  console.log(`\n=== 艺术字覆盖探针 · game109 终局标题「${TITLE}」· cnround(站酷快乐体) ===`);
  console.log(`@font-face：${FACE.slice(0, 72)}…`);
  console.log(`document.fonts.load 命中 FontFace 数：${nodes.load}（-1=load 抛错）· 台账：${nodes.faces.join(' / ') || '(空)'}`);
  console.log('\n浏览器账本（CDP CSS.getPlatformFontsForNode·A=艺术字在场 / B=艺术字换成不存在的族名 / C=裸 monospace）：');
  for (const ch of chars) {
    const row = ['A', 'B', 'C'].map((arm) => {
      const f = artOf(arm, ch);
      return `${arm}: ${f.length ? f.map((x) => `${x.family}×${x.glyphs}${x.custom ? '(web)' : ''}`).join(' + ') : '(无)'}`;
    }).join('   ');
    console.log(`  ${ch}   ${row}`);
  }

  const posOk = drewByArt('A', POS);
  const negOk = !drewByArt('A', NEG);
  const titleMissing = [...new Set(TITLE)].filter((ch) => !drewByArt('A', ch));

  console.log('');
  console.log(`信息（不参与判定）：标题逐字是否出现在今天的被扫文件里 —— ${[...new Set(TITLE)].map((ch) => `${ch}:${scanned.has(ch) ? '在' : '不在'}`).join(' · ')}`);
  console.log('');
  if (!posOk) {
    console.log(`✗ 阳性对照失败：「${POS}」本该由站酷快乐体画出，账本里却没有它 ⇒ 字体没加载/注入有误。`);
    console.log('  **这是秤坏了，不是字体缺字**——结论作废，先修探针。');
    done(2);
  }
  if (!negOk) {
    console.log(`✗ 阴性对照失败：「${NEG}」本不可能入子集（希腊字母不在子集口径内），账本却记成站酷快乐体画 ⇒ 这杆秤看不出回退。结论作废。`);
    done(2);
  }
  console.log(`✓ 阳性对照「${POS}」记为站酷快乐体画的、阴性对照「${NEG}」记为系统字体画的 ⇒ 秤两向都准，中间三字的结论可采信。`);
  if (titleMissing.length) {
    console.log(`✗ 标题里有字**静默回退**了：${titleMissing.join(' ')} ⇒ font:'cnround' 对这些字是空操作（该字由系统字画）`);
    console.log('  ⇒ 或者重跑 scripts/cjk-art-font-vendor.py 让子集收进这些字（**产物体在 public/ui-fonts/ + src/ui/**·超出 S5 边界栏**），');
    console.log('     或者撤掉 hud.ts 的 font:\'cnround\'（不许把"看着像换了字"当换了字写进对齐单）。');
    done(1);
  }
  console.log(`✓ 标题「${TITLE}」全部字形由站酷快乐体画出 ⇒ font:'cnround' 真生效（非空操作·非伪证）。`);
  done(0);
} catch (e) {
  console.error(`✗ 探针异常：${e?.message || e}`);
  done(2);
}
