// scripts/game109-art-requirements.mjs —— game109《种田》美术**需求推导**（台账）
// 产出：`public/games/game109/art/art-ledger.json`（台本·平台逐行复核的那份）+ 人读 md。
//
// 用法：npx vite-node scripts/game109-art-requirements.mjs
//
// ── 为什么不走平台的 `/api/art/derive` ──────────────────────────────────────
//  `main_entry/art_replace.py:21` 的 derive **只扫 `library/<slug>/manifest.json`**——game109 是
//  **编译期游戏**（games/ 下的 TS 蓝图，无 manifest）⇒ 平台那条路对本作天然不适用。手册给了正路：
//  `art-pipeline.md:29`「编译期游戏线照 `scripts/game-g-art-requirements.mjs` 样板写 requirements 推导脚本」
//  （本脚本照 `scripts/game-103-art-derive.mjs` 的形态写，改了一处见下）。
//
// ── 与 game-103 样板**刻意不同**的一处：不按视觉签名归并，改按 skinKey 建行 ────────────
//  `art-replace.mjs:233-237` 的 `visualSig` = `kind|shape.kind|tint|emissive` —— **不含 textureKey**。
//  本作 36 格地块的 Shape/Color 初值逐格相同（地色由 SpriteBinding 逐拍投影，不在初值里）⇒ 36 格会被
//  并成**一行**、且代表槽取到第一格（胡萝卜）⇒ 小麦/南瓜两族的槽**静默丢失**（换了白换）。
//  ⇒ 本脚本自建行：按**被消费的 skinKey** 建行（台账一行=一种素材），仍用 `mergeLedger` 保号。
//
// ── 三条机读断言（红=不落盘·退出码 1）───────────────────────────────────────
//  ① **三方集合相等**：蓝图实际消费的 skinKey ≡ `theme.ALL_SKIN_KEYS` ≡ 生成脚本 `SLOT_DEFS`
//     （少一条=漏登记·多一条=孤儿行——「可消费槽铁律」怕的正是后者）。
//  ② **帧号不越界**：每个 `SpriteBinding.frames` 里的下标都必须 < 对应 sheet 的 `count`
//     （off-by-one 在运行期**不抛不报**：越界帧 = 解析不到矩形 → 静默回退 Shape）。
//  ③ **无空 skinKey**：`Sprite/SpriteBinding.skins` 里不许出现空串（空串会被解析成「没图」，
//     是个能吞掉真槽的静默洞）。
import { buildBlueprint } from '../games/game109/index.ts';
import { ALL_SKIN_KEYS, SCENE_SKIN } from '../games/game109/theme.ts';
import { SLOT_DEFS } from './game109-art-gen.mjs';
import { mergeLedger } from './art-replace.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = join(ROOT, 'public', 'games', 'game109', 'art');
const LEDGER_FILE = join(ART_DIR, 'art-ledger.json');
const MD_FILE = join(ROOT, 'docs', 'design', 'game109', 'art-requirements.md');

// ── 扫蓝图：谁在消费哪些 skinKey ────────────────────────────────────────────
/** 收集 (entity, component, field, skinKey) 四元组——`skins[i]` 记成 `skins[i]` 便于人读。 */
function collectConsumers(bp) {
  const out = [];
  for (const [eid, comps] of Object.entries(bp.entities)) {
    const sp = comps.Sprite;
    if (sp && typeof sp.textureKey === 'string') {
      out.push({ entity: eid, component: 'Sprite', field: 'textureKey', key: sp.textureKey });
    }
    const sb = comps.SpriteBinding;
    if (sb && Array.isArray(sb.skins)) {
      sb.skins.forEach((k, i) => {
        if (typeof k === 'string') out.push({ entity: eid, component: 'SpriteBinding', field: `skins[${i}]`, key: k });
      });
    }
  }
  return out;
}

const problems = [];
const bp = buildBlueprint();
const consumers = collectConsumers(bp);

// ── 宿主层消费的槽（蓝图里看不见·住在 `mountHost` 那一行上）────────────────────
//  场景底不是世界实体（它是 scene 的 CSS 背景·`art-pipeline.md:35`「程序化背景 = 可换背景槽」），
//  扫描器扫 `bp.entities` 看不见它 ⇒ 在这里显式登记，并**回读 game109.ts 断言那行接线真的在**。
//  为什么非要回读：只登记不接线 = 台账有行、屏幕上换了没反应——正是 owner 2027-07-27
//  「换了没反应」那条铁律的形状（art-pipeline.md:51 的反面教材 game-101 立绘读死路径）。
const HOST_SLOTS = [
  {
    skinKey: SCENE_SKIN, entity: 'scene-background', component: 'MountHost', field: 'sceneBgSkin.imageUrl',
    source: 'games/game109/game109.ts',
    guard: /filledSrc\(\s*idx\s*,\s*SCENE_SKIN\s*\)/,
  },
];
for (const h of HOST_SLOTS) {
  const src = readFileSync(join(ROOT, h.source), 'utf8');
  if (!h.guard.test(src)) problems.push(`${h.source}：宿主槽 ${h.skinKey} 未接线（找不到 ${h.guard}）`);
  consumers.push({ entity: h.entity, component: h.component, field: h.field, key: h.skinKey });
}

// 断言③：无空 skinKey
const empties = consumers.filter((c) => c.key === '');
if (empties.length) problems.push(`空 skinKey ${empties.length} 处（首处：${empties[0].entity}.${empties[0].field}）`);

// 断言②：帧号不越界
const sheetOf = new Map(SLOT_DEFS.filter((s) => s.sheet).map((s) => [s.skinKey, s.sheet]));
for (const [eid, comps] of Object.entries(bp.entities)) {
  const sb = comps.SpriteBinding;
  if (!sb || !Array.isArray(sb.frames)) continue;
  const key = comps.Sprite?.textureKey;
  const sh = key ? sheetOf.get(key) : undefined;
  if (!sh) {
    problems.push(`${eid}：有 SpriteBinding.frames 但 Sprite.textureKey=${String(key)} 不是 sheet 槽`);
    continue;
  }
  const bad = [...new Set(sb.frames.filter((f) => !Number.isInteger(f) || f < 0 || f >= sh.count))];
  if (bad.length) problems.push(`${eid}：frames 越界 ${bad.join('/')}（${key} 只有 ${sh.count} 帧）`);
}

// ── 按 skinKey 建行 ────────────────────────────────────────────────────────
const specOf = new Map(SLOT_DEFS.map((s) => [s.skinKey, s]));
const byKey = new Map();
for (const c of consumers) {
  if (!byKey.has(c.key)) byKey.set(c.key, []);
  byKey.get(c.key).push(c);
}
// 行序 = 生成脚本的槽位表顺序（人读时与图一一对得上），再补上「在蓝图里但表里没有」的（下面会红）
const keys = [...SLOT_DEFS.map((s) => s.skinKey).filter((k) => byKey.has(k)), ...[...byKey.keys()].filter((k) => !specOf.has(k))];

// 断言①：三方集合相等
const consumed = new Set(byKey.keys());
const fromTheme = new Set(ALL_SKIN_KEYS);
const fromGen = new Set(SLOT_DEFS.map((s) => s.skinKey));
const diff = (a, b) => [...a].filter((k) => !b.has(k));
for (const [name, a, b] of [['蓝图有·槽位表无（孤儿：换了白换）', consumed, fromGen],
  ['槽位表有·蓝图无（漏消费）', fromGen, consumed],
  ['theme.ALL_SKIN_KEYS 有·蓝图无（表过期）', fromTheme, consumed],
  ['蓝图有·theme.ALL_SKIN_KEYS 无（表漏更新）', consumed, fromTheme]]) {
  const d = diff(a, b);
  if (d.length) problems.push(`${name}：${d.join(' · ')}`);
}

const rows = keys.map((key, i) => {
  const s = specOf.get(key);
  const cs = byKey.get(key) || [];
  const first = cs[0] || { entity: '(未消费)', component: 'Sprite', field: 'textureKey' };
  const n = new Set(cs.map((c) => c.entity)).size;
  const spec = s
    ? { w: s.w, h: s.h, displayW: s.w, displayH: s.h, transparent: !!s.transparent, ...(s.sheet ? { sheet: s.sheet } : {}) }
    : { w: 0, h: 0, displayW: 0, displayH: 0, transparent: true };
  const role = s?.kind === 'bg' ? '场景底（mountHost 背景皮肤槽）' : n > 1 ? `${n} 处槽位共用` : '单处槽位';
  const frames = spec.sheet ? `·${spec.sheet.count} 帧（${spec.sheet.frameWidth}×${spec.sheet.frameHeight}／帧）` : '';
  return {
    skinKey: key,
    // 首轮编号 = 行序（art-01…）；**之后由 `mergeLedger` 按 skinKey 身份保号**（改槽位/重排不挪号）。
    // ⚠ 不能让 mergeLedger 代生成编号：prev 为 null 时它**原样返回 fresh**（不补号），
    //    那样所有行会共用同一个占位号（本脚本首跑实测过：15 行全是 art-00）。
    no: 'art-' + String(i + 1).padStart(2, '0'),
    kind: s?.kind === 'bg' ? 'bg' : 'sprite',
    desc: s ? s.desc : '（未登记）',
    slot: { entity: first.entity, component: first.component, field: first.field },
    slots: cs.map((c) => ({ entity: c.entity, component: c.component, field: c.field })),
    query: s ? s.query : key,
    prompt: s ? `${s.desc}, flat vector game asset, transparent background, chunky cartoon farm style, 2d top-down` : '',
    placeholder: {
      current: s?.kind === 'bg' ? '程序化 CSS 渐变底（SCENE_BG）' : '素坯 Shape + Color.tint（无图回退）',
      source: 'procedural',
      count: cs.length,
      instances: cs.slice(0, 8).map((c) => `${c.entity}.${c.component}.${c.field}`),
    },
    spec,
    context: `美术需求：「${s ? s.query : key}」（${role}·${spec.w}×${spec.h}${frames}·需${spec.transparent ? '透明底' : '满幅'}）·当前占位=${s?.kind === 'bg' ? '程序化渐变' : '素坯色块'}`,
    status: 'needs-art',
    gen: null,
    provenance: null,
  };
});

let ledger = mergeLedger(existsSync(LEDGER_FILE) ? JSON.parse(readFileSync(LEDGER_FILE, 'utf8')) : null,
  { version: 1, game: 'game109', mode: 'requirements', count: rows.length, instances: consumers.length, rows });

// ── 状态对齐真相：以**实际服务**的 index.json 回填（filled / servedPath / provenance）──
//  平台缩略图读 `gen.servedPath` ⇒ 指真图，人审时看到的就是玩家看到的那张。
const INDEX_FILE = join(ART_DIR, 'index.json');
const idx = existsSync(INDEX_FILE) ? JSON.parse(readFileSync(INDEX_FILE, 'utf8')) : null;
const filled = new Map((idx?.assets || []).filter((a) => a.status === 'filled' && a.id && a.path).map((a) => [a.id, a]));
for (const r of ledger.rows) {
  const e = r.skinKey ? filled.get(r.skinKey) : null;
  if (!e) continue;
  r.status = 'filled';
  r.provenance = { path: e.path, license: e.license, source: e.source, ...(e.provenance || {}) };
  r.gen = { ...(r.gen || {}), servedPath: e.path, generator: e.provenance?.generator || 'apollo-procedural', mock: false };
  if (e.provenance?.derivesFrom) r.provenance.derivesFrom = e.provenance.derivesFrom;
}

if (problems.length) {
  console.error('ART-REQ: FAIL\n' + problems.map((p) => '  ✗ ' + p).join('\n'));
  process.exit(1);
}
mkdirSync(ART_DIR, { recursive: true });
writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2) + '\n');

// ── 人读视图（脚本生成·勿手改）──────────────────────────────────────────────
const esc = (s) => String(s).replace(/\|/g, '\\|');
const L = [];
L.push(`# game109《种田》（暂名）资产需求表（${ledger.rows.length} 项·脚本自动生成·**勿手改**）\n`);
L.push('> 来源：`scripts/game109-art-requirements.mjs` 扫 `buildBlueprint()` 的**被消费 skinKey**（Sprite.textureKey + SpriteBinding.skins）。');
L.push('> 三条机读断言（三方集合相等 / 帧号不越界 / 无空 skinKey）全过才落盘；本表与 `public/games/game109/art/art-ledger.json` 同源。\n');
L.push('| 编号 | skinKey | 规格 | 消费点 | 当前占位 | 说明 |');
L.push('|---|---|---|---|---|---|');
for (const r of ledger.rows) {
  const sp = `${r.spec.w}×${r.spec.h}${r.spec.sheet ? `·${r.spec.sheet.count}帧` : ''}${r.spec.transparent ? '·透明底' : '·满幅'}`;
  const where = new Set((r.slots || []).map((s) => s.entity)).size;
  L.push(`| ${r.no} | \`${r.skinKey}\` | ${sp} | ${where} 处 | ${esc(r.placeholder?.current)} | ${esc(r.desc)} |`);
}
L.push(`\n共 ${ledger.rows.length} 项 · 状态：${[...new Set(ledger.rows.map((r) => r.status))].join('/')}` +
  ` · 台账 JSON（工具读此路径）：public/games/game109/art/art-ledger.json`);
const md = L.join('\n') + '\n';
mkdirSync(dirname(MD_FILE), { recursive: true });
writeFileSync(MD_FILE, md);
console.log(md);
console.log(`ART-REQ: OK（${ledger.rows.length} 行 → ${LEDGER_FILE}）`);
