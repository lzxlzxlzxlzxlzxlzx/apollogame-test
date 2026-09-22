#!/usr/bin/env node
// 游戏能力接入审计（owner 2026-07-02 立项：防绕引擎手写自由代码）
// 用法：node scripts/game-skill-audit.mjs [game-g game-i ...]（缺省=全部游戏）
// 体检输出每个游戏的引擎能力接入面 + 分层旗标，末行判词 token + 退出码可接门禁。
//
// 分层（REQ-QA-测试审计强化三件 · 主程 spec 2026-07-04；8/4 大评审 Q1 补三 regex · 2026-08-10）：
//   🔴 红 = 已破不变量（游戏层红线，CLAUDE.md「游戏能力总览铁律」）：
//        裸 Math.random（须用引擎种子 PRNG）· innerHTML · document.createElement（手写 DOM，须走 LayoutNode）
//        · React 屏逃逸（.tsx 文件 / from 'react'——JSX 编译期才变 createElement，源码层抓文件与 import·
//          评审实证 game-e.tsx 1163 行反面教材靠零 DOM 关键字过关）
//        · DOM 逃生（insertAdjacentHTML / document.write——与 innerHTML 同级的手写 DOM 旁路）。
//   🟡 黄 = 缺失防线（未破线但少了护栏）：零能力接入（绕开 capabilities 体系）· 零测试。
//   ⚠ 建议 = 非红线的迁移提示：bg 裸色串→色库；墙钟（Date.now/performance.now·sim 面非确定性来源·
//        评审 E3·先建议档不阻断——存量命中面广，升红另裁）：只提示、不进判词、不改退出码。
//   判词（REQ-AUDIT-守门·owner 2026-07-16）：任一**未被 Lead 批注基线覆盖**的红 → FAIL（退出码 1）；
//        红旗全被 Lead 批注基线覆盖（approvedBy:"LEAD"+date+reason·计数未超）→ 仍显示但不红判；
//        无未覆盖红 · 有黄 → WARNINGS（退出码 0）；全清 → PASS（退出码 0）。
//
// 「自写解释器 / 虚胖数据」（数据表 + 游戏层自写解释器）也属红类，但**无法可靠 regex 检测**
//   （合法的小枚举 switch 与真·绕引擎解释器难以机械区分，见 game-e/jokers.ts 的经济结算 switch）——
//   它是 capability-plan 评审的人审项（CORE RULE §2），本工具不臆造，故不列入自动红旗以免误报。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GAMES_DIR = 'games';
const wanted = process.argv.slice(2);

// 历史遗留：个别游戏入口在 src/ 根目录而非 games/<g>/，不补上会审出「假干净」
const EXTRA_FILES = { 'game-e': ['src/game-e.tsx'] };

/** 递归收集 .ts/.tsx 文件（跳过 doc/refcode 等非代码目录） */
function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (['doc', 'docs', 'refcode', 'assets'].includes(name)) continue;
      collect(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 单游戏审计 */
function audit(game) {
  const dir = join(GAMES_DIR, game);
  const files = collect(dir);
  for (const extra of EXTRA_FILES[game] ?? []) {
    try { statSync(extra); files.push(extra); } catch { /* 入口已迁走则忽略 */ }
  }
  const src = files.filter((f) => !/\.test\.ts$/.test(f));
  const tests = files.filter((f) => /\.test\.ts$/.test(f));


  let loc = 0;
  const capImports = new Set(); // 引擎能力/原子导入源
  const flags = { mathRandom: [], innerHTML: [], createElement: [], nakedFill: [], reactScreen: [], domEscape: [], wallClock: [], engineTwin: [], zeroCap: false };
  let usesWorldOrManifest = 0;

  for (const f of src) {
    const text = readFileSync(f, 'utf8');
    const lines = text.split('\n');
    loc += lines.length;

    // 🔴 React 屏逃逸①：.tsx 文件本身即违规（按文件计一次·文件内 react import 不再重复计）。
    const isTsx = /\.tsx$/.test(f);
    if (isTsx) flags.reactScreen.push(`${f} (.tsx)`);

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // 能力接入面：skills / atoms 的 import（含旧别名 @atom-skills·@skills、新包名子路径
      // @zerocraft/engine/atom-skills/·@zerocraft/engine/skills/、与相对路径 /skills/）
      const im = ln.match(/from\s+['"]([^'"]*(?:@atom-skills|@skills|\/atom-skills\/|\/skills\/)[^'"]*)['"]/);
      if (im) capImports.add(im[1].replace(/^.*\/skills\//, 'skills/'));
      if (/\b(parseManifest|WorldBlueprint|createWorld|new World\b|mountManifestGame)/.test(ln)) usesWorldOrManifest++;
      // 红旗（游戏层禁区）
      if (/\bMath\.random\s*\(/.test(ln)) flags.mathRandom.push(`${f}:${i + 1}`);
      if (/\binnerHTML\b/.test(ln)) flags.innerHTML.push(`${f}:${i + 1}`);
      if (/document\.createElement/.test(ln)) flags.createElement.push(`${f}:${i + 1}`);
      // 🔴 React 屏逃逸②：.ts 文件里 import react（.tsx 已按文件计过，不重复）
      if (!isTsx && /\bfrom\s+['"]react[^'"]*['"]/.test(ln)) flags.reactScreen.push(`${f}:${i + 1}`);
      // 🔴 DOM 逃生：innerHTML 同级的手写 DOM 旁路
      if (/\binsertAdjacentHTML\b|\bdocument\.write/.test(ln)) flags.domEscape.push(`${f}:${i + 1}`);
      // 🔴 引擎同形手写（engine-base-tier-review-2026-09-06 §3.3·C 治理）：引擎已下沉的件在游戏里再写一份——
      //   localStorage 直读写（应走 services/persist/local-store）· class GameLog/EventLog（应走 tier1/event-log）·
      //   recordScore（应走 services/persist/leaderboard.insertRanked）· Math.imul（私藏 PRNG 副本，应走 atoms/random）。
      if (/\blocalStorage\.|\bclass\s+(?:GameLog|EventLog)\b|\brecordScore\b|\bMath\.imul\(/.test(ln)) flags.engineTwin.push(`${f}:${i + 1}`);
      // ⚠ 墙钟（非确定性·先建议档不阻断·评审 E3）
      if (/\bDate\.now\b|\bperformance\.now\b/.test(ln)) flags.wallClock.push(`${f}:${i + 1}`);
      // ⚠ 色库化建议（非红线·phase-1）：bg 裸 hex/gradient/url 串 → 应迁 SurfaceToken/FillPreset/{custom}（owner 2026-07-04）
      if (/\bbg:\s*['"](#[0-9a-fA-F]|linear-gradient|radial-gradient|url\()/.test(ln)) flags.nakedFill.push(`${f}:${i + 1}`);
    }
  }
  // 纯数据游戏（parseManifest/World 接入=经 manifest 消费能力体系·数据宪法正道）不算零接入。
  flags.zeroCap = capImports.size === 0 && usesWorldOrManifest === 0;

  return { game, files: src.length, loc, tests: tests.length, capImports, usesWorldOrManifest, flags };
}

const games = readdirSync(GAMES_DIR).filter((g) => {
  try {
    return statSync(join(GAMES_DIR, g)).isDirectory() && (wanted.length === 0 || wanted.includes(g));
  } catch {
    return false;
  }
});

const rows = games.map(audit);

// ── 分层：每行按红/黄/建议归类 ──
/** 红旗（已破不变量·进判词）文字列表 */
function redBits(r) {
  const bits = [];
  if (r.flags.mathRandom.length) bits.push(`裸Math.random×${r.flags.mathRandom.length}`);
  if (r.flags.innerHTML.length) bits.push(`innerHTML×${r.flags.innerHTML.length}`);
  if (r.flags.createElement.length) bits.push(`createElement×${r.flags.createElement.length}`);
  if (r.flags.reactScreen.length) bits.push(`React屏×${r.flags.reactScreen.length}`);
  if (r.flags.domEscape.length) bits.push(`DOM逃生×${r.flags.domEscape.length}`);
  if (r.flags.engineTwin.length) bits.push(`引擎同形手写×${r.flags.engineTwin.length}`);
  return bits;
}
/** 黄旗（缺失防线·进判词）文字列表 */
function yellowBits(r) {
  const bits = [];
  if (r.flags.zeroCap) bits.push('零能力接入');
  if (r.tests === 0) bits.push('零测试');
  try { statSync(join(GAMES_DIR, '..', 'public', 'games', r.game, 'art', 'art-ledger.json')); }
  catch { bits.push('无美术台账(art-pipeline.md 编译期三行接入)'); }
  return bits;
}
/** ⚠ 建议（非红线·不进判词）文字列表 */
function adviceBits(r) {
  const bits = [];
  if (r.flags.nakedFill.length) bits.push(`裸bg色×${r.flags.nakedFill.length}`);
  if (r.flags.wallClock.length) bits.push(`墙钟×${r.flags.wallClock.length}`);
  return bits;
}
// ── 红旗棘轮基线（机读·随本工具同目录·ZEROCRAFT_AUDIT_BASELINE 可覆盖供对抗测试用固定基线·
//    旧名 APOLLO_AUDIT_BASELINE 过渡期仍读）──
const BASELINE_PATH = process.env.ZEROCRAFT_AUDIT_BASELINE || process.env.APOLLO_AUDIT_BASELINE || join('scripts', 'audit-baseline.json');
/** 基线红旗指标 → audit flags 键 → 展示名（Q1 批 2026-08-10 增 reactScreen/domEscape 两指标·同棘轮语义：
 *  存量灌基线豁免可见·新增拦截）。 */
const RATCHET_METRICS = [
  ['nakedRandom', 'mathRandom', '裸Math.random'],
  ['innerHTML', 'innerHTML', 'innerHTML'],
  ['createElement', 'createElement', 'document.createElement'],
  ['reactScreen', 'reactScreen', 'React屏(.tsx/from-react)'],
  ['domEscape', 'domEscape', 'DOM逃生(insertAdjacentHTML/document.write)'],
  ['engineTwin', 'engineTwin', '引擎同形手写(localStorage/GameLog/recordScore/Math.imul)'],
];
/** 读基线 games 表（失败=null·棘轮段判 FAIL）。 */
const baseline = (() => {
  try { return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).games ?? {}; }
  catch { return null; }
})();
/** 基线条目是否带 Lead 批注（approvedBy:"LEAD" + date + reason 三者齐全·违规者不得自写豁免）。 */
function isAnnotated(b) {
  return !!b && b.approvedBy === 'LEAD' && !!b.date && !!b.reason;
}
/**
 * 某游戏当前红旗是否「被 Lead 批注基线覆盖」（REQ-AUDIT-守门）：
 * 有基线条目 + 三字段批注齐全 + 每项当前计数 ≤ 基线计数（无超额）→ 覆盖（显示但不红判）。
 * 基线缺失（新游戏）/ 未批注（自写豁免）/ 任一超额（新增红旗）→ 未覆盖（判 FAIL）。
 */
function isRedCovered(r) {
  if (!baseline) return false;
  const b = baseline[r.game];
  if (!isAnnotated(b)) return false;
  for (const [baseKey, flagKey] of RATCHET_METRICS) {
    if (r.flags[flagKey].length > (b[baseKey] ?? 0)) return false;
  }
  return true;
}
// 判词只看「未被批注基线覆盖的红旗」——被 Lead 批注覆盖的红旗仍显示、不进 FAIL。
const anyUncoveredRed = rows.some((r) => redBits(r).length && !isRedCovered(r));
const anyYellow = rows.some((r) => yellowBits(r).length);

// ── 汇总表 ──
const pad = (s, n) => String(s).padEnd(n);
console.log('\n══ 游戏能力接入审计 ══\n');
console.log(
  pad('game', 10) + pad('代码行', 8) + pad('测试文件', 9) + pad('能力导入源', 11) + pad('World/manifest', 15) + '旗标'
);
for (const r of rows) {
  const red = redBits(r);
  const yellow = yellowBits(r);
  const advice = adviceBits(r);
  const covered = red.length > 0 && isRedCovered(r);
  const cells = [];
  if (red.length) cells.push((covered ? '🔵 ' : '🔴 ') + red.join('·') + (covered ? '（批注覆盖）' : ''));
  if (yellow.length) cells.push('🟡 ' + yellow.join('·'));
  if (advice.length) cells.push('⚠ ' + advice.join('·'));
  console.log(
    pad(r.game, 10) +
      pad(r.loc, 8) +
      pad(r.tests, 9) +
      pad(r.capImports.size, 11) +
      pad(r.usesWorldOrManifest, 15) +
      (cells.length ? cells.join('  ') : '—')
  );
}

// ── 明细（有任一旗标的游戏） ──
for (const r of rows) {
  const { mathRandom, innerHTML, createElement, nakedFill, reactScreen, domEscape, wallClock, engineTwin } = r.flags;
  const redDetails = [
    ['🔴 裸 Math.random（应用引擎种子 PRNG）', mathRandom],
    ['🔴 innerHTML（应走 LayoutNode/mountUI）', innerHTML],
    ['🔴 document.createElement（手写 DOM，应走 LayoutNode）', createElement],
    ['🔴 React 屏逃逸（.tsx / from react·应走 LayoutNode 纯数据）', reactScreen],
    ['🔴 DOM 逃生（insertAdjacentHTML/document.write·innerHTML 同级）', domEscape],
    ['🔴 引擎同形手写（localStorage 直读写→persist/local-store · GameLog→tier1/event-log · recordScore→persist/leaderboard · Math.imul→atoms/random）', engineTwin],
  ].filter(([, v]) => v.length);
  const adviceDetails = [
    ['⚠ bg 裸色串（建议迁 SurfaceToken/FillPreset/{custom}·非红线）', nakedFill],
    ['⚠ 墙钟 Date.now/performance.now（sim 面应走 tick/引擎时钟·先建议档不阻断）', wallClock],
  ].filter(([, v]) => v.length);
  if (!redDetails.length && !adviceDetails.length && !yellowBits(r).length) continue;
  console.log(`\n── ${r.game} 明细 ──`);
  for (const [label, hits] of redDetails) {
    console.log(`  · ${label}:`);
    for (const h of hits.slice(0, 8)) console.log(`      ${h}`);
    if (hits.length > 8) console.log(`      …共 ${hits.length} 处`);
  }
  if (r.flags.zeroCap) console.log('  · 🟡 零引擎能力接入（capabilities 体系被完全绕过）');
  if (r.tests === 0) console.log('  · 🟡 零测试（该游戏无 *.test.ts 防线）');
  for (const [label, hits] of adviceDetails) {
    console.log(`  · ${label}:`);
    for (const h of hits.slice(0, 8)) console.log(`      ${h}`);
    if (hits.length > 8) console.log(`      …共 ${hits.length} 处`);
  }
  if (r.capImports.size) console.log('  · 能力导入源: ' + [...r.capImports].slice(0, 10).join(', '));
}

// ── 分层收口 ──
console.log('\n── 分层汇总 ──');
const uncoveredRedGames = rows.filter((r) => redBits(r).length && !isRedCovered(r));
const coveredRedGames = rows.filter((r) => redBits(r).length && isRedCovered(r));
const yellowGames = rows.filter((r) => !redBits(r).length && yellowBits(r).length);
if (uncoveredRedGames.length) {
  console.log('  🔴 未覆盖红旗（判 FAIL·无 Lead 批注/超基线/新游戏）: ' + uncoveredRedGames.map((r) => `${r.game}(${redBits(r).join(',')})`).join('  '));
} else {
  console.log('  🔴 未覆盖红旗: 无');
}
if (coveredRedGames.length) {
  console.log('  🔵 批注覆盖红旗（Lead 批注·仍显示不红判·C 件下沉后归零撤批注）: ' + coveredRedGames.map((r) => `${r.game}(${redBits(r).join(',')})`).join('  '));
}
if (yellowGames.length) {
  console.log('  🟡 缺失防线: ' + yellowGames.map((r) => `${r.game}(${yellowBits(r).join(',')})`).join('  '));
} else {
  console.log('  🟡 缺失防线: 无');
}
const adviceGames = rows.filter((r) => adviceBits(r).length);
if (adviceGames.length) {
  console.log('  ⚠ 建议(非判词): ' + adviceGames.map((r) => `${r.game}(${adviceBits(r).join(',')})`).join('  '));
}

// ── 判词 token + 退出码（⚠ 建议不参与） ──
const verdict = anyUncoveredRed ? 'FAIL' : anyYellow ? 'WARNINGS' : 'PASS';
console.log(`\nAUDIT: ${verdict}`);

// ── 红旗棘轮：与机读基线对比（REQ-QA-红旗棘轮·owner 2026-07-04；REQ-AUDIT-守门 防自基线·owner 2026-07-16）──
// 三红旗计数（裸Math.random / innerHTML / document.createElement）只许降不许升，且豁免须 Lead 亲批。
// FAIL 三条（退出码 1·点名游戏/指标）：
//   ① 超基线（cur > base·新增红旗）；
//   ② 自写豁免（基线条目红旗计数>0 但缺 approvedBy:"LEAD"+date+reason·违规者不得自写豁免）；
//   ③ 新游戏红旗（无基线条目 + 带红旗·不再是「请加入基线」的邀请，而是即刻 FAIL·豁免走 requests.md 找 Lead）。
// 低于基线 → 提示「同提交把基线降下来」（还债仪式·不红）；等于且已批注 → 覆盖（显示但不红判）。
// 事故记档：旧提示语「无基线条目（新游戏？请加入 audit-baseline.json）」曾亲口教施工 session 自写基线
//   （PE-T 6142237d 把自己 createElement:5 写进基线·棘轮空转），本次收敛。
// baseline/BASELINE_PATH/RATCHET_METRICS/isAnnotated 均在文件上部定义（判词段共用）。
// 最终退出码 = (anyUncoveredRed || ratchetFail) ? 1 : 0。

const ratchetFail = runRatchet(rows);

process.exit(anyUncoveredRed || ratchetFail ? 1 : 0);

/**
 * 对比机读基线，打印棘轮段，返回是否 FAIL（超基线 / 自写豁免 / 新游戏红旗 任一）。
 * 只比对本次实际审计到的游戏（rows）——支持子集调用（S5 逐游戏门用）。
 */
function runRatchet(rows) {
  console.log(`\n── 红旗棘轮（对比基线 ${BASELINE_PATH}·只降不升·豁免须 Lead 批注）──`);
  if (!baseline) {
    console.error(`  基线文件读取失败（${BASELINE_PATH}）`);
    console.error(`\nRATCHET: FAIL`);
    return true;
  }
  const overages = [];     // ① cur > base（新增红旗·致命）
  const drops = [];        // 低于基线（该降基线还债·不红）
  const unannotated = [];  // ② 基线红旗>0 但缺 Lead 批注（自写豁免·致命）
  const newGameRed = [];   // ③ 无基线条目 + 带红旗（新游戏红旗·致命）
  const covered = [];      // 批注覆盖（不红判·仅提示）
  for (const r of rows) {
    const b = baseline[r.game];
    const hasRed = redBits(r).length > 0;
    if (!b) {
      if (hasRed) newGameRed.push({ game: r.game, bits: redBits(r) });
      continue;
    }
    const baseTotal = RATCHET_METRICS.reduce((s, [k]) => s + (b[k] ?? 0), 0);
    if (baseTotal > 0 && !isAnnotated(b)) {
      const miss = [];
      if (b.approvedBy !== 'LEAD') miss.push('approvedBy:"LEAD"');
      if (!b.date) miss.push('date');
      if (!b.reason) miss.push('reason');
      unannotated.push({ game: r.game, miss });
    }
    let over = false;
    for (const [baseKey, flagKey, label] of RATCHET_METRICS) {
      const cur = r.flags[flagKey].length;
      const base = b[baseKey] ?? 0;
      if (cur > base) { overages.push({ game: r.game, label, base, cur }); over = true; }
      else if (cur < base) drops.push({ game: r.game, label, base, cur });
    }
    if (hasRed && isAnnotated(b) && !over) covered.push({ game: r.game, bits: redBits(r) });
  }
  if (covered.length) {
    console.log('  🔵 批注覆盖（Lead 已批·不红判·C 件下沉后应归零并撤 approvedBy）:');
    for (const c of covered) console.log(`      ${c.game}: ${c.bits.join('·')}`);
  }
  if (drops.length) {
    console.log('  ⬇ 低于基线（记得同提交把基线降下来·还债仪式）:');
    for (const d of drops) console.log(`      ${d.game} ${d.label}: ${d.base} → ${d.cur}（-${d.base - d.cur}）`);
  }
  const fail = overages.length > 0 || unannotated.length > 0 || newGameRed.length > 0;
  if (newGameRed.length) {
    console.error('  🔺 新游戏红旗（无基线条目·门禁红）:');
    for (const n of newGameRed) console.error(`      ${n.game}: ${n.bits.join('·')}`);
    console.error('  新游戏带红旗即 FAIL——豁免不自写基线，走 docs/workflow/requests.md 找 Lead 裁决。');
  }
  if (unannotated.length) {
    console.error('  🔺 自写豁免（基线红旗>0 缺 Lead 批注·门禁红）:');
    for (const u of unannotated) console.error(`      ${u.game}: 缺 ${u.miss.join('、')}`);
    console.error('  违规者不得自写豁免——基线红旗条目须 Lead 亲批 approvedBy:"LEAD"+date+reason。');
  }
  if (overages.length) {
    console.error('  🔺 超基线（新增红旗·门禁红）:');
    for (const o of overages) {
      console.error(`      ${o.game} ${o.label}: 基线 ${o.base} → 现 ${o.cur}（+${o.cur - o.base}）`);
    }
    console.error('  抬基线唯一合法姿势：走 requests.md 找 Lead 裁决，给条目挂 approvedBy:"LEAD"+date+reason。');
  }
  if (fail) {
    console.error('\nRATCHET: FAIL');
    return true;
  }
  console.log('\nRATCHET: PASS');
  return false;
}
