// scripts/styleset-ledger.mjs —— 风格库（house-style shared art library）台账底座（REQ-STYLESET·M0·图纸
// docs/design/styleset-artlib-plan-2026-07-16.md §六）。
//
// 一句话：静态枚举 §六 首批清单 → 走 art-replace 的 mergeLedger 保号 → 写库级台账 style-ledger.json（mode:'library'）；
// mock 填充=确定性程序化占位（texture=palette-snap 噪声 PNG·mesh=cube.glb 占位）落 gen/mock/ 分域防覆盖真图，
// 产物登记进共享 assets/index.json（provenance 硬字段 generator:'mock'+styleset:'apollo-toon'）。真 key 批量生成=M1。
//
// 边界：**不改 art-replace.mjs 本体**（只 import mergeLedger/paletteSnapRgb 复用）；**不引入新 Asset 类型/不改 spec schema**；
//       风格锚单一真相在风格包 STYLE_PACKS['apollo-toon'].stylePrompt——本脚本读它组合进每行 query（见 composeQuery 注释）。
//
// 用法：
//   node scripts/styleset-ledger.mjs derive         → 静态枚举 → mergeLedger 保号 → 写台账（不生成图）
//   node scripts/styleset-ledger.mjs mock [--at ISO]→ 读台账 → 逐行 mock 填充 + 登记共享 index + 回写台账
//   node scripts/styleset-ledger.mjs build          → derive + mock（默认命令）
// 纯函数（buildFreshLedger/deriveLedger/mockFill）导出供单测直跑（可传 root=临时目录）。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeLedger, paletteSnapRgb } from './art-replace.mjs'; // 只 import 复用·绝不修改该文件
import { encodePng } from './ai-gen.mjs';
import { STYLE_PACKS } from './style-packs.mjs';

const SCRIPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STYLE_ID = 'apollo-toon';
const CUBE_GLB = join(SCRIPT_ROOT, 'assets', 'meshes', 'cube.glb'); // mock glb 占位源（照 ai-gen mock cube 做法）

// ── 路径（root 参数化·测试可传临时目录）──
const stylesetDir = (root) => join(root, 'assets', 'styleset', STYLE_ID);
export const ledgerPath = (root) => join(stylesetDir(root), 'style-ledger.json');
const sharedIndexPath = (root) => join(root, 'assets', 'index.json');
const mockRel = (region, no, ext) => `${region}/gen/mock/${no}.${ext}`; // 相对 stylesetDir
const indexPath = (region, no, ext) => `styleset/${STYLE_ID}/${region}/gen/mock/${no}.${ext}`; // 相对 assets/（共享 index 用相对路径）
const indexId = (region, no) => `styleset/${STYLE_ID}/${region}/gen/mock/${no}`;

const pad = (n) => String(n).padStart(2, '0');
const readJson = (f, fb) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fb);
const writeJson = (f, o) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
const byIdCmp = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const leaf = (slug) => slug.split('.').pop();

// ── 风格锚（单一真相=风格包）──
function anchorText() {
  const p = STYLE_PACKS[STYLE_ID];
  if (!p || typeof p.stylePrompt !== 'string' || !p.stylePrompt.trim())
    throw new Error(`styleset-ledger: 风格包缺 ${STYLE_ID}.stylePrompt（单一真相未就位）`);
  return p.stylePrompt.trim();
}
function palette() { return STYLE_PACKS[STYLE_ID]?.palette ?? []; }

// ═══ §六 首批清单（M0·静态枚举·ui≈40 / fx≈12 / 3d≈20 = 72 行）═══
// 每项：slug（稳定身份·sim 永久引它）·region·kind（texture|mesh）·subject（行主体英文描述）·spec·desc（中文台账说明）。
// texture usage/colorSpace 严格闭集：全为 sprite/albedo 色彩贴图 → colorSpace='srgb'（M0 无法线/粗糙图·不误标 linear）。
const T = (w, h, transparent, usage = 'sprite', extra = {}) => ({ w, h, transparent, usage, colorSpace: 'srgb', ...extra });
const MESH = { scale: 1, genCollision: 'hull' };

const ICONS = ['play', 'pause', 'settings', 'close', 'back', 'coin', 'gem', 'heart', 'star', 'lock',
  'check', 'cross', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'bag', 'shop', 'trophy',
  'info', 'sound-on', 'sound-off', 'plus', 'minus']; // §六 功能图标 24 枚

export const CATALOG = [
  // ── ui/（40 行）──
  { slug: 'ui.button.primary', region: 'ui', kind: 'texture', subject: 'chunky glossy primary game button skin, 9-slice, thick bottom lip, rounded candy shape', spec: T(96, 96, true), desc: 'UI 主按钮皮 9-slice（96×96·圆胖厚底唇糖果钮）' },
  { slug: 'ui.button.secondary', region: 'ui', kind: 'texture', subject: 'chunky glossy secondary game button skin, 9-slice, thick bottom lip, jade tone', spec: T(96, 96, true), desc: 'UI 次按钮皮 9-slice（96×96·竹青调）' },
  { slug: 'ui.button.danger', region: 'ui', kind: 'texture', subject: 'chunky glossy danger game button skin, 9-slice, thick bottom lip, vermilion tone', spec: T(96, 96, true), desc: 'UI 危险按钮皮 9-slice（96×96·朱砂调）' },
  { slug: 'ui.button.ghost', region: 'ui', kind: 'texture', subject: 'subtle outlined ghost game button skin, 9-slice, ink-brush border, rice-paper fill', spec: T(96, 96, true), desc: 'UI 幽灵按钮皮 9-slice（96×96·笔触边宣纸底）' },
  { slug: 'ui.panel.frame', region: 'ui', kind: 'texture', subject: 'rounded panel frame, 9-slice, rice-paper fill with ink-brush border', spec: T(128, 128, true), desc: 'UI 面板框 9-slice（128×128·宣纸底墨边）' },
  { slug: 'ui.panel.inset', region: 'ui', kind: 'texture', subject: 'sunken inset panel frame, 9-slice, soft inner shadow, rice-paper', spec: T(128, 128, true), desc: 'UI 凹陷内嵌框 9-slice（128×128）' },
  { slug: 'ui.panel.tooltip', region: 'ui', kind: 'texture', subject: 'small rounded tooltip bubble frame, 9-slice, ink-brush edge', spec: T(96, 96, true), desc: 'UI 提示气泡框 9-slice（96×96）' },
  ...ICONS.map((ic) => ({ slug: `ui.icon.${ic}`, region: 'ui', kind: 'texture', subject: `${ic.replace(/-/g, ' ')} game ui icon, bold clean silhouette, flat two-tone`, spec: T(128, 128, true), desc: `UI 功能图标 ${ic}（128×128 透明）` })),
  { slug: 'ui.progress.track', region: 'ui', kind: 'texture', subject: 'progress bar track skin, rounded capsule, rice-paper groove', spec: T(256, 64, true), desc: 'UI 进度条槽皮（256×64）' },
  { slug: 'ui.progress.fill', region: 'ui', kind: 'texture', subject: 'progress bar fill skin, glossy jade gradient, rounded capsule', spec: T(256, 64, true), desc: 'UI 进度条填充皮（256×64）' },
  { slug: 'ui.slider.track', region: 'ui', kind: 'texture', subject: 'slider rail skin, thin rounded track, ink accent', spec: T(256, 64, true), desc: 'UI 滑轨皮（256×64）' },
  { slug: 'ui.slider.knob', region: 'ui', kind: 'texture', subject: 'slider knob, chunky glossy round button with thick bottom lip', spec: T(64, 64, true), desc: 'UI 滑块钮（64×64·厚底唇）' },
  { slug: 'ui.bg.lobby', region: 'ui', kind: 'texture', subject: 'game lobby background, warm rice-paper scene with soft ink-wash mountains', spec: T(1024, 1024, false), desc: 'UI 大厅背景板（1024×1024·宣纸水墨）' },
  { slug: 'ui.bg.menu', region: 'ui', kind: 'texture', subject: 'game menu background, calm jade and vermilion ink-wash panel', spec: T(1024, 1024, false), desc: 'UI 菜单背景板（1024×1024）' },
  { slug: 'ui.bg.dim', region: 'ui', kind: 'texture', subject: 'dim modal backdrop, soft dark ink vignette', spec: T(1024, 1024, false), desc: 'UI 弹窗遮罩背景板（1024×1024）' },
  { slug: 'ui.title.banner', region: 'ui', kind: 'texture', subject: 'title decorative banner base, ink-brush scroll ribbon', spec: T(512, 128, true), desc: 'UI 标题装饰底·横幅（512×128）' },
  { slug: 'ui.title.ribbon', region: 'ui', kind: 'texture', subject: 'title decorative ribbon base, vermilion silk with gold trim', spec: T(512, 128, true), desc: 'UI 标题装饰底·绶带（512×128）' },

  // ── fx/（12 行）·帧图集 512×512 4×4·粒子对齐 Particles kind 闭集 confetti/coins/stars/sparkle ──
  { slug: 'fx.sheet.hit-burst', region: 'fx', kind: 'texture', subject: 'hit impact burst spritesheet, 4x4 frames, ink splash energy', spec: T(512, 512, true), desc: 'FX 打击爆闪帧图集（512×512·4×4）' },
  { slug: 'fx.sheet.explosion', region: 'fx', kind: 'texture', subject: 'explosion spritesheet, 4x4 frames, warm fire with ink smoke', spec: T(512, 512, true), desc: 'FX 爆炸帧图集（512×512·4×4）' },
  { slug: 'fx.sheet.smoke-puff', region: 'fx', kind: 'texture', subject: 'smoke puff spritesheet, 4x4 frames, soft ink-wash clouds', spec: T(512, 512, true), desc: 'FX 烟尘帧图集（512×512·4×4）' },
  { slug: 'fx.sheet.flash', region: 'fx', kind: 'texture', subject: 'flash burst spritesheet, 4x4 frames, radiant light rays', spec: T(512, 512, true), desc: 'FX 闪光帧图集（512×512·4×4）' },
  { slug: 'fx.sheet.shockwave', region: 'fx', kind: 'texture', subject: 'shockwave ring spritesheet, 4x4 frames, expanding ink ripple', spec: T(512, 512, true), desc: 'FX 冲击波帧图集（512×512·4×4）' },
  { slug: 'fx.particle.confetti', region: 'fx', kind: 'texture', subject: 'confetti paper flake particle, bright saturated colors', spec: T(128, 128, true), desc: 'FX 粒子·纸屑 confetti（128×128·对齐 Particles 闭集）' },
  { slug: 'fx.particle.coins', region: 'fx', kind: 'texture', subject: 'gold coin particle, glossy round, ink outline', spec: T(128, 128, true), desc: 'FX 粒子·金币 coins（128×128·对齐 Particles 闭集）' },
  { slug: 'fx.particle.stars', region: 'fx', kind: 'texture', subject: 'star sparkle particle, radiant four-point star', spec: T(128, 128, true), desc: 'FX 粒子·星光 stars（128×128·对齐 Particles 闭集）' },
  { slug: 'fx.particle.sparkle', region: 'fx', kind: 'texture', subject: 'soft sparkle glint particle, warm glow dot', spec: T(128, 128, true), desc: 'FX 粒子·微光 sparkle（128×128·对齐 Particles 闭集）' },
  { slug: 'fx.glow.ring', region: 'fx', kind: 'texture', subject: 'ring glow halo, soft radial jade light', spec: T(256, 256, true), desc: 'FX 环形光效（256×256）' },
  { slug: 'fx.glow.impact', region: 'fx', kind: 'texture', subject: 'impact glow flash, radial warm burst', spec: T(256, 256, true), desc: 'FX 命中光晕（256×256）' },
  { slug: 'fx.trail.streak', region: 'fx', kind: 'texture', subject: 'motion trail streak, soft fading ink stroke', spec: T(64, 256, true), desc: 'FX 拖尾条（64×256）' },

  // ── 3d/（20 行）·低模 props 12（mesh·圆润夸张比例）+ trim/skybox/decal/ground 贴图 ──
  ...['crate', 'barrel', 'tree', 'rock', 'coin', 'gem', 'chest', 'fence', 'lamp', 'bush', 'sign', 'platform-tile'].map((p) => ({
    slug: `3d.prop.${p}`, region: '3d', kind: 'mesh', subject: `low-poly ${p.replace(/-/g, ' ')} prop, rounded exaggerated cartoon topology, game-ready`, spec: { ...MESH }, desc: `3D 低模 prop·${p}（圆润夸张拓扑·可换贴图）`,
  })),
  { slug: '3d.trim.a', region: '3d', kind: 'texture', subject: 'trim sheet texture A, tileable ink-wash panel details', spec: T(512, 512, false, 'albedo', { wrap: 'repeat' }), desc: '3D trim 贴图 A（512×512·可平铺 albedo）' },
  { slug: '3d.trim.b', region: '3d', kind: 'texture', subject: 'trim sheet texture B, tileable jade and vermilion strips', spec: T(512, 512, false, 'albedo', { wrap: 'repeat' }), desc: '3D trim 贴图 B（512×512·可平铺 albedo）' },
  { slug: '3d.skybox.day', region: '3d', kind: 'texture', subject: 'equirectangular daytime sky, soft ink-wash clouds over warm gradient', spec: T(1024, 512, false, 'albedo', { wrap: 'repeat' }), desc: '3D 天空盒·日（1024×512 equirect）' },
  { slug: '3d.decal.crack', region: '3d', kind: 'texture', subject: 'ground crack decal, ink-brush fracture, transparent', spec: T(256, 256, true), desc: '3D 地面贴花·裂纹（256×256·对齐 Decal3D 闭集）' },
  { slug: '3d.decal.leaves', region: '3d', kind: 'texture', subject: 'scattered leaves decal, soft green ink dabs, transparent', spec: T(256, 256, true), desc: '3D 地面贴花·落叶（256×256·对齐 Decal3D 闭集）' },
  { slug: '3d.decal.splash', region: '3d', kind: 'texture', subject: 'ink splash decal, vermilion splatter, transparent', spec: T(256, 256, true), desc: '3D 地面贴花·墨溅（256×256·对齐 Decal3D 闭集）' },
  { slug: '3d.ground.grass', region: '3d', kind: 'texture', subject: 'tileable grass ground texture, stylized jade ink-wash', spec: T(512, 512, false, 'albedo', { wrap: 'repeat' }), desc: '3D 地面·草地（512×512·可平铺 albedo）' },
  { slug: '3d.ground.stone', region: '3d', kind: 'texture', subject: 'tileable stone ground texture, ink-outlined cobbles', spec: T(512, 512, false, 'albedo', { wrap: 'repeat' }), desc: '3D 地面·石地（512×512·可平铺 albedo）' },
];

// query = 行主体描述 + §六 风格锚 v2 全文（+ 透明底尾巴）。
// **锚全文取自 STYLE_PACKS['apollo-toon'].stylePrompt（单一真相）**——此处组合内联进 query 仅为让台账行自洽可读；
// 改锚只改风格包，重跑 derive 即刷新所有行 query（mergeLedger 对未人工改过的行取 fresh.query）。不在 CATALOG 里手抄第二份锚。
function composeQuery(item) {
  const tail = item.spec.transparent ? ', transparent background' : '';
  return `${item.subject}, ${anchorText()}${tail}`;
}

/** 静态枚举 CATALOG → fresh 台账（mode:'library'·行结构与游戏台账同形）。编号顺序分配·首跑即定。 */
export function buildFreshLedger(catalog = CATALOG) {
  const rows = catalog.map((item, i) => ({
    no: 'art-' + pad(i + 1),
    kind: item.kind,
    region: item.region,
    slot: { entity: item.slug, component: 'Styleset', field: 'asset' }, // 稳定身份（mergeLedger 保号键=slotKey）
    query: composeQuery(item),
    prompt: null, // 人工精调整体替代位（M0 留空·M1 可回填）
    spec: item.spec,
    desc: item.desc,
    status: 'needs-art',
    gen: null,
    provenance: null,
  }));
  return { version: 1, styleId: STYLE_ID, mode: 'library', count: rows.length, rows };
}

export function readLedger(root) { return readJson(ledgerPath(root), null); }

/** derive：读旧台账 → 静态枚举 → mergeLedger 保号（改清单重跑不丢 no/status/gen/prompt）→ 写台账。 */
export function deriveLedger(root = SCRIPT_ROOT, catalog = CATALOG) {
  const prev = readLedger(root);
  const fresh = buildFreshLedger(catalog);
  const merged = mergeLedger(prev, fresh, null); // 无 manifest（库台账不绑蓝图·slot 是合成稳定身份）
  writeJson(ledgerPath(root), merged);
  return merged;
}

// ── mock 填充（确定性·prompt 播种噪声 → palette-snap 到 apollo-toon 调色板 → encodePng）──
function seededRgb(seedStr, w, h) {
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { seed ^= seedStr.charCodeAt(i); seed = (seed * 16777619) >>> 0; }
  const H = (x, y) => { let hh = ((x * 374761393) ^ (y * 668265263) ^ seed) >>> 0; hh = ((hh ^ (hh >>> 13)) * 1274126177) >>> 0; return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296; };
  const block = Math.max(1, Math.floor(w / 16));
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = H(Math.floor(x / block), Math.floor(y / block)) * 0.7 + H(x, y) * 0.3, o = (y * w + x) * 3;
    rgb[o] = 40 + v * 180; rgb[o + 1] = 40 + H(y, x) * 180; rgb[o + 2] = 60 + v * 150;
  }
  const pal = palette();
  if (pal.length) paletteSnapRgb(rgb, pal); // 同库共用一板 → mock 也天然成套（在调色板内）
  return rgb;
}

function mockTexture(seedStr, w, h) { return encodePng(w, h, seededRgb(seedStr, w, h)); }
function mockMesh() { return existsSync(CUBE_GLB) ? readFileSync(CUBE_GLB) : Buffer.alloc(0); }

/** 一行 → 共享 index 条目（provenance 硬字段齐：generator:'mock'+styleset+model/prompt/date/license）。 */
function entryFor(row, servedPath, at) {
  const isMesh = row.kind === 'mesh';
  const common = {
    id: indexId(row.region, row.no),
    status: 'filled',
    path: servedPath,
    category: `styleset.${row.region}`,
    tags: ['styleset', STYLE_ID, row.region, leaf(row.slot.entity), 'mock', row.kind],
    license: 'CC0-1.0',
    source: `styleset:${STYLE_ID}`,
    style: STYLE_ID,
    provenance: { generator: 'mock', styleset: STYLE_ID, prompt: row.query, model: 'styleset-mock', mock: true, generatedAt: at, license: 'CC0-1.0' },
  };
  if (isMesh) {
    return { ...common, type: 'mesh', description: `${row.desc} · styleset ${STYLE_ID}（mock glb 占位·待真模型）`, spec: { scale: row.spec.scale ?? 1, genCollision: row.spec.genCollision ?? 'hull' } };
  }
  const s = row.spec;
  return {
    ...common, type: 'texture', description: `${row.desc} · styleset ${STYLE_ID}（mock 占位·待真图）`,
    spec: { usage: s.usage, colorSpace: s.colorSpace, ...(s.wrap ? { wrap: s.wrap } : {}), width: s.w, height: s.h, transparent: !!s.transparent },
  };
}

/** mock 填充：逐行产占位落 gen/mock/ → 登记共享 index（upsert）→ 回写台账（status→generated·gen.mock=true·同 art-replace 口径）。 */
export function mockFill(root = SCRIPT_ROOT, { at = new Date().toISOString() } = {}) {
  const ledger = readLedger(root);
  if (!ledger) throw new Error('styleset-ledger: 无台账·先 derive');
  const idxFile = sharedIndexPath(root);
  const index = readJson(idxFile, { version: 1, assets: [] });
  if (!Array.isArray(index.assets)) index.assets = [];
  const byId = new Map(index.assets.map((a) => [a.id, a]));
  const summary = { total: 0, texture: 0, mesh: 0 };
  for (const row of ledger.rows) {
    if (row.status === 'retired') continue;
    const ext = row.kind === 'mesh' ? 'glb' : 'png';
    const rel = mockRel(row.region, row.no, ext);
    const outAbs = join(stylesetDir(root), rel);
    const buffer = row.kind === 'mesh' ? mockMesh() : mockTexture(row.query, row.spec.w, row.spec.h);
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, buffer); // 确定性字节（query 播种）→ 重写同字节·幂等无 churn
    const servedPath = indexPath(row.region, row.no, ext); // 相对 assets/（共享 index 契约）
    const id = indexId(row.region, row.no);
    // 时间戳复用（幂等·防 churn）：已 mock 过的行沿用原 date，只有首次/被重置的行才盖新 stamp。
    const stamp = (row.provenance && typeof row.provenance.date === 'string' && row.provenance.date) || at;
    byId.set(id, entryFor(row, servedPath, stamp));
    row.status = 'generated'; // mock 占位·待真图（照 art-replace mock 口径：status=generated + gen.mock=true·不写回消费端）
    row.gen = { provider: 'mock', model: 'styleset-mock', prompt: row.query, servedPath, localId: id, mock: true };
    row.provenance = { model: 'styleset-mock', prompt: row.query, date: stamp, license: 'CC0-1.0', generator: 'mock', styleset: STYLE_ID };
    summary.total++; summary[row.kind === 'mesh' ? 'mesh' : 'texture']++;
  }
  index.assets = [...byId.values()].sort(byIdCmp);
  writeJson(idxFile, index);
  writeJson(ledgerPath(root), ledger);
  return { ok: true, ledger, summary };
}

// ═══ CLI ═══
async function run(argv) {
  const cmd = argv[0] || 'build';
  const ai = argv.indexOf('--at'); const at = ai >= 0 ? argv[ai + 1] : undefined;
  if (cmd === 'derive') {
    const l = deriveLedger(SCRIPT_ROOT);
    console.log(JSON.stringify({ ok: true, cmd, rows: l.rows.length, byRegion: countByRegion(l) }));
    return;
  }
  if (cmd === 'mock') {
    const r = mockFill(SCRIPT_ROOT, at ? { at } : {});
    console.log(JSON.stringify({ ok: true, cmd, summary: r.summary }));
    return;
  }
  if (cmd === 'build') {
    deriveLedger(SCRIPT_ROOT);
    const r = mockFill(SCRIPT_ROOT, at ? { at } : {});
    console.log(JSON.stringify({ ok: true, cmd, rows: r.ledger.rows.length, byRegion: countByRegion(r.ledger), summary: r.summary }));
    return;
  }
  console.error('用法: styleset-ledger.mjs <derive|mock|build> [--at ISO]');
  process.exit(1);
}
function countByRegion(l) { const c = {}; for (const r of l.rows) c[r.region] = (c[r.region] || 0) + 1; return c; }

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
