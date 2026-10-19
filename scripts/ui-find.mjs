#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/ui-find.mjs —— UI 控件检索器（REQ-UIINDEX·owner 2026-09「agent 找不到他想要的东西」）
//
//  治的病：闭集有 41 件控件、game-i 展台有 89 段活范例，但**没有索引**——
//    · `catalog.ts` 有 schema 却不指「去哪看活的」；
//    · 活范例段 id 只散在 5000 行 `gallery.ts` 里，只能靠 grep；
//    · 一件的演示常**跨 tab 散落**（Label 基础在 tab-display、艺术字/大字在 tab-new）——连人都凑不齐；
//    · 手册里那张「橱窗货架」表是手写散文，89 段只覆盖 ~10 段、且会漂。
//  ⇒ agent 要么找不到、要么自己搓一个朴素版（= 华丽起手铁律说的缺陷）。
//
//  怎么治：**不另造第二份真相**——检索直接读 `catalog.ts`（自描述目录本就是机读真相），
//  用它新增的 `demo[]`（活范例段指针）+ `tags[]`（中文俗名/场景词）做命中面。
//  段 id 的真实性由 `catalog-demo-guard`（vitest）对 `gallery.ts` 逐条校验 → 索引不会烂。
//
//  用法（**按你游戏「有什么」用大白话搜**，不必先知道控件叫什么）：
//    node scripts/ui-find.mjs 血条              # 关键词搜（tags/摘要/何时用/prop 全文）
//    node scripts/ui-find.mjs 货币 数字          # 多词=都要命中（AND）
//    node scripts/ui-find.mjs --type Label      # 精确摊开一件（全 prop + 活范例 + sample）
//    node scripts/ui-find.mjs --list            # 41 件总览（一行一件 + 俗名）
//    node scripts/ui-find.mjs --tab tab-new     # 某 tab/模块演了哪些件
//    node scripts/ui-find.mjs --check           # 守卫：demo 段 id 是否都真存在于 gallery.ts
//    加 --json → 机读输出（给工具/agent 串管道）
//
//  纯 node（Node22 `--experimental-strip-types` 直接 import 真 catalog.ts·无正则刮取·无漂移面）。
// ═══════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '..');

// catalog.ts 是 TS —— 需要类型擦除才能 import。未带 flag 时原样重入一次（让调用方只写 `node scripts/ui-find.mjs`）。
if (!process.execArgv.includes('--experimental-strip-types')) {
  const r = spawnSync(process.execPath,
    ['--experimental-strip-types', '--no-warnings', SELF, ...process.argv.slice(2)],
    { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const { UI_CATALOG } = await import('../src/ui/components/catalog.ts');
const GALLERY = resolve(ROOT, 'games/game-i/gallery.ts');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const words = argv.filter((a) => !a.startsWith('--') && a !== opt('type') && a !== opt('tab'));
const JSON_OUT = flag('json');

// ── 怎么打开某段（给 agent/人的可执行指路）──────────────────────
// 整屏模块/整页 → 各自的屏文件；普通段 → gallery.ts 里搜段 id。
const SCREEN_FILE = {
  'mod-mmo': 'mmo-hud.ts', 'mod-casual': 'casual-hud.ts', 'mod-dialogue': 'dialogue-demo.ts',
  'mod-presence': 'presence-demo.ts', 'mod-input': 'input-lab.ts', 'mod-video': 'video-lab.ts',
  'tab-shop': 'shop.ts', 'tab-pick': 'pickcards.ts',
};
const isWholePage = (d) => d.section === d.tab;
const openHint = (d) => {
  const mod = d.tab.startsWith('tab-') ? 'mod-ui' : d.tab;
  const sub = d.tab.startsWith('tab-') ? `·子 tab ${d.tab}` : '';
  return `?game=game-i → ${mod}${sub}${isWholePage(d) ? '（整页演示）' : ` → 段 ${d.section}`}`;
};
const srcHint = (d) => {
  const f = SCREEN_FILE[d.tab];
  if (isWholePage(d) && f) return `games/game-i/${f}`;
  if (f) return `games/game-i/${f}（或 gallery.ts 搜 '${d.section}'）`;
  return `games/game-i/gallery.ts 搜 '${d.section}'`;
};

// ── 命中评分：俗名 > 控件名 > 摘要/何时用 > prop ─────────────────
function score(spec, w) {
  const t = spec.type.toLowerCase(), q = w.toLowerCase();
  let s = 0;
  if (t === q) s += 100; else if (t.includes(q)) s += 40;
  for (const tag of spec.tags ?? []) { if (tag === w) s += 60; else if (tag.includes(w)) s += 30; }
  if ((spec.summary ?? '').includes(w)) s += 20;
  if ((spec.whenToUse ?? '').includes(w)) s += 12;
  for (const p of spec.props ?? []) {
    if (p.name.toLowerCase() === q) s += 18;
    else if (p.name.toLowerCase().includes(q)) s += 8;
    if ((p.describe ?? '').includes(w)) s += 5;
    if ((p.values ?? []).some((v) => String(v).toLowerCase() === q)) s += 14;
  }
  for (const d of spec.demo ?? []) { if ((d.note ?? '').includes(w) || d.section.includes(w)) s += 10; }
  return s;
}

// ── 输出：一件的全貌 ────────────────────────────────────────────
function printSpec(spec, full) {
  console.log(`\n\x1b[1m${spec.type}\x1b[0m — ${spec.summary}`);
  console.log(`  何时用：${spec.whenToUse}`);
  if (spec.tags?.length) console.log(`  俗名：${spec.tags.join(' / ')}`);
  console.log(`  children：${spec.children}`);
  const props = full ? spec.props : spec.props.slice(0, 8);
  if (props.length) {
    console.log(`  props（${spec.props.length}）：`);
    for (const p of props) {
      const req = p.required ? ' \x1b[31m必填\x1b[0m' : '';
      const vals = p.values ? ` = ${p.values.join('|')}` : '';
      const def = p.default !== undefined ? ` (缺省 ${p.default})` : '';
      console.log(`    · ${p.name}: ${p.type}${vals}${def}${req} — ${p.describe}`);
    }
    if (!full && spec.props.length > props.length) console.log(`    … 还有 ${spec.props.length - props.length} 个，看全部：--type ${spec.type}`);
  }
  if (spec.demo?.length) {
    console.log(`  \x1b[36m活范例（去展台看真的·照抄改数据）\x1b[0m：`);
    for (const d of spec.demo) {
      console.log(`    · ${d.note ?? d.section}`);
      console.log(`        开：${openHint(d)}`);
      console.log(`        抄：${srcHint(d)}`);
    }
  } else {
    console.log(`  \x1b[33m活范例：无（本件展台还没有演示段——想加报 PUI）\x1b[0m`);
  }
  if (full) console.log(`  sample：\n${JSON.stringify(spec.sample, null, 2).split('\n').map((l) => '    ' + l).join('\n')}`);
}

// ── --check：demo 段 id 必须真存在于 gallery/屏文件（防索引烂掉）──
function check() {
  const g = readFileSync(GALLERY, 'utf8');
  const known = new Set([...g.matchAll(/sectionTitle\('([^']+)'/g)].map((m) => m[1]));
  const bad = [], noTag = [], noDemo = [];
  for (const s of UI_CATALOG) {
    for (const d of s.demo ?? []) {
      // 段 id 由 sectionTitle 声明。两种**整页演示**没有段 id，放行：
      //   · mod-*（整屏模块·如 mod-mmo/mod-dialogue·屏在各自文件）
      //   · section === tab（该 tab 整页演这件·如 tab-shop/tab-pick 组合演示页）
      if (d.section === d.tab || d.tab.startsWith('mod-')) continue;
      if (!known.has(d.section)) bad.push(`${s.type} → ${d.tab}/${d.section}`);
    }
    if (!s.tags?.length) noTag.push(s.type);
    if (!s.demo?.length) noDemo.push(s.type);
  }
  console.log(`UI 索引守卫：${UI_CATALOG.length} 件 · gallery 段 ${known.size} 个`);
  if (noDemo.length) console.log(`  · 无活范例（非阻断·提示补展台）：${noDemo.join(', ')}`);
  if (noTag.length) console.log(`  \x1b[33m· 缺俗名 tags（检索命中面缺失）：${noTag.join(', ')}\x1b[0m`);
  if (bad.length) {
    console.log(`\x1b[31m✗ 死链 ${bad.length} 条（demo 指的段 gallery.ts 里不存在）：\x1b[0m`);
    bad.forEach((b) => console.log(`    ${b}`));
    return 1;
  }
  console.log(`\x1b[32m✓ demo 段 id 全部有效（零死链）\x1b[0m`);
  return 0;
}

// ── 主 ────────────────────────────────────────────────────────
if (flag('check')) process.exit(check());

if (flag('list')) {
  const rows = UI_CATALOG.map((s) => ({ type: s.type, summary: s.summary, tags: s.tags ?? [], demos: (s.demo ?? []).length }));
  if (JSON_OUT) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  console.log(`\n闭集控件 ${rows.length} 件（俗名可直接搜：node scripts/ui-find.mjs <词>）\n`);
  for (const r of rows) console.log(`  ${r.type.padEnd(13)} ${String(r.demos).padStart(2)} 段  ${r.summary}${r.tags.length ? `  〔${r.tags.join('/')}〕` : ''}`);
  process.exit(0);
}

const tab = opt('tab');
if (tab) {
  const hits = UI_CATALOG.map((s) => ({ s, ds: (s.demo ?? []).filter((d) => d.tab === tab) })).filter((x) => x.ds.length);
  if (JSON_OUT) { console.log(JSON.stringify(hits.map((h) => ({ type: h.s.type, demo: h.ds })), null, 2)); process.exit(0); }
  console.log(`\n${tab} 里演了 ${hits.length} 件：\n`);
  for (const h of hits) for (const d of h.ds) console.log(`  ${h.s.type.padEnd(13)} ${d.section.padEnd(18)} ${d.note ?? ''}`);
  process.exit(hits.length ? 0 : 1);
}

const type = opt('type');
if (type) {
  const spec = UI_CATALOG.find((s) => s.type.toLowerCase() === type.toLowerCase());
  if (!spec) { console.error(`没有控件 '${type}'。看全部：--list`); process.exit(1); }
  if (JSON_OUT) { console.log(JSON.stringify(spec, null, 2)); process.exit(0); }
  printSpec(spec, true);
  console.log(`\n手册：docs/playbooks/ui.md（接线/货架） · docs/design/ui-playbook.md（四准则 + 华丽起手）\n`);
  process.exit(0);
}

if (!words.length) {
  console.log(`用法：node scripts/ui-find.mjs <中文俗名|控件名|prop>   例：血条 / 货币 / 选关 / shape`);
  console.log(`     --type <件>  摊开一件 ｜ --list 全部 ｜ --tab <tab> 某页 ｜ --check 守卫 ｜ --json 机读`);
  process.exit(2);
}

// 多词 = AND（每词都得有分），总分 = 各词分之和
const ranked = UI_CATALOG
  .map((s) => ({ s, per: words.map((w) => score(s, w)) }))
  .filter((x) => x.per.every((v) => v > 0))
  .map((x) => ({ s: x.s, total: x.per.reduce((a, b) => a + b, 0) }))
  .sort((a, b) => b.total - a.total);

if (JSON_OUT) {
  console.log(JSON.stringify(ranked.map((r) => ({ type: r.s.type, score: r.total, summary: r.s.summary, tags: r.s.tags ?? [], demo: r.s.demo ?? [] })), null, 2));
  process.exit(ranked.length ? 0 : 1);
}

if (!ranked.length) {
  console.log(`\n没命中「${words.join(' ')}」。`);
  console.log(`  · 看全部 41 件：node scripts/ui-find.mjs --list`);
  console.log(`  · 换个俗名再试（如 血条 / 货币 / 选关 / 头像 / 弹窗 / 摇杆）`);
  console.log(`  · 确认闭集真没有 → 别手搓逃生，报 PUI 扩控件（docs/design/<game>/requests.md）\n`);
  process.exit(1);
}

console.log(`\n「${words.join(' ')}」命中 ${ranked.length} 件（按相关度）：`);
for (const r of ranked.slice(0, 5)) printSpec(r.s, false);
if (ranked.length > 5) console.log(`\n  … 另有 ${ranked.length - 5} 件较弱命中`);
console.log(`\n摊开某件全部 prop + sample：node scripts/ui-find.mjs --type <件名>`);
console.log(`手册：docs/playbooks/ui.md · 华丽起手三步见 docs/design/ui-playbook.md §0\n`);
