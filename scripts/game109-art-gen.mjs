#!/usr/bin/env node
// scripts/game109-art-gen.mjs —— game109《种田》（暂名）美术**生成**（程序化矢量·S6 美术关）
//
// 产出：`public/games/game109/art/*.svg`（15 张）+ `art/index.json`（按 skinKey **别名登记**·不钉 manifest）。
// 依据：`docs/playbooks/art-pipeline.md`「编译期游戏线」+「占位最低标准=成形矢量图」（程序化 SVG 允许且鼓励）。
//
// ── 三条纪律（本脚本自己守）────────────────────────────────────────────────
//  ① **零 `Math.random`**：噪点/斑点走固定种子的 LCG（`rnd()`）。重跑产物**逐字节相同** ⇒
//     `--check` 才有意义（否则「重跑一致」是碰运气）。
//  ② **纯 Node**（不 import TS 游戏模块）：本脚本能被 `node` 直接跑，也能被 vite-node 引（需求脚本用它的 SLOTS 表）。
//  ③ **槽位表 = 唯一真相**：尺寸/透明/描述都写在 `SLOTS`；需求脚本与它**对拍**（三方集合相等，见 -requirements.mjs）。
//
// ── 素材来源（CC BY 3.0·去底换色）────────────────────────────────────────────
//  字形取自 `assets/gameicons/**`（Delapouite / Lorc·CC BY 3.0·**需署名**）。
//  源文件形态统一：`<path d="M0 0h512v512H0z"/>`（黑底方块）+ `<path fill="#fff" d="…"/>`（白字形）。
//  入库两步：**去底**（那是 gameicons 的方框底·留着重出来就是一块黑砖）+ **换色**（白 → 本作色板）。
//  ⚠ 署名显示机制**未立项**（S3 报告的署名缺口·data.ts:98 同款）⇒ 许可与出处如实记进 index.json
//    的 `license`/`source`/`provenance.derivesFrom`，**但屏幕上没有署名行**。这条缺口不因本关消失。
//
// 用法：node scripts/game109-art-gen.mjs [--check]
//   --check：只重算并逐字节比对盘上文件（不写盘）；不一致 → 退出码 1（确定性/手改检测）。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = join(ROOT, 'public', 'games', 'game109', 'art');
const ICON_DIR = join(ROOT, 'assets', 'gameicons');

// ── 定尺（与 games/game109/theme.ts 的几何对齐·改一处要同步另一处）────────────────
//  地块 = FARM.cell-10 = 102（贴图固有尺寸 = 屏幕尺寸·渲染器不给贴图缩放）
//  生长条 = PLANT.w × PLANT.h = 96 × 10（4 帧横排 sheet）
//  按钮 = FARM.btnW × FARM.btnH = 96 × 88
//  场景 = VIEW = 720 × 910
const CELL = 102;
const BAR_W = 96;
const BAR_H = 10;
const BTN_W = 96;
const BTN_H = 88;
const SCENE_W = 720;
const SCENE_H = 910;

// ── 色板（与 theme.ts 的 LIFE_TINTS / BTN_TINT / SCENE_BG 同族：素坯色是同一套，
//    上图后只是「同一块颜色长出了纹理」而不是换一套配色）──────────────────────────
const P = {
  grass: '#82905a', grassHi: '#9aa86d', grassLo: '#5c6a3e',
  tilled: '#9c7748', tilledHi: '#b28d5a', tilledLo: '#7a5c37',
  sown: '#6b563a', sownHi: '#836a48', sownLo: '#4f3f2b',
  wet: '#463524', wetHi: '#5b4630', wetLo: '#2e2116',
  furrow: '#000000', // 全部靠 opacity 叠
  toolPanel: '#8a6a45', actionPanel: '#4a6b8a',
  glyph: '#f6f1e4',
  wood: '#6f5636',
};

// ── 确定性伪随机（LCG·固定种子）─────────────────────────────────────────────
/** 返回 [0,1) 的确定性序列（**故意不是 Math.random**：重跑必须逐字节一致）。 */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const r2 = (n) => Math.round(n * 100) / 100;

/** 一撮斑点（土壤颗粒感·确定性）。 */
function speckles(seed, n, w, h, color, rMin, rMax, op) {
  const g = rnd(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = r2(4 + g() * (w - 8));
    const y = r2(4 + g() * (h - 8));
    const r = r2(rMin + g() * (rMax - rMin));
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${op}"/>`;
  }
  return out;
}

// ── gameicons 取字形（去底 + 换色）──────────────────────────────────────────
/** 从 gameicons 源文件里取出**去掉方框底**的字形，并把白色换成 `color`。 */
function glyph(rel, color = P.glyph) {
  const txt = readFileSync(join(ICON_DIR, rel.endsWith('.svg') ? rel : rel + '.svg'), 'utf8');
  const inner = txt.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return inner
    .replace(/<path[^>]*d="M0 0h512v512H0z"[^>]*\/>/g, '') // 黑底方块（gameicons 统一底色）→ 去底
    .replace(/fill="#fff"/g, `fill="${color}"`); // 白字形 → 本作色板
}

// ═══ 绘图 ═══════════════════════════════════════════════════════════════════
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

/** 场景底（可换背景槽）：草地 + 暗角 + 底沿木条（动作条的衬底）。 */
function drawScene() {
  let b = '';
  b += `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.grassHi}"/><stop offset="0.45" stop-color="${P.grass}"/>
    <stop offset="1" stop-color="${P.grassLo}"/></linearGradient>
    <radialGradient id="vig" cx="50%" cy="34%" r="72%">
    <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.10"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.28"/></radialGradient></defs>`;
  b += `<rect width="${SCENE_W}" height="${SCENE_H}" fill="url(#sky)"/>`;
  // 草丛纹理（确定性）：短弧线成簇
  const g = rnd(109);
  for (let i = 0; i < 150; i++) {
    const x = r2(6 + g() * (SCENE_W - 12));
    const y = r2(6 + g() * (SCENE_H - 12));
    const hgt = r2(4 + g() * 7);
    b += `<path d="M${x} ${y} q1.6 ${-hgt / 2} 3.2 0" stroke="${P.grassLo}" stroke-width="1.4" fill="none" opacity="0.5"/>`;
  }
  b += `<rect width="${SCENE_W}" height="${SCENE_H}" fill="url(#vig)"/>`;
  // 场地围栏：地块区（24..696）四周一圈深土色，给 36 格一个「田」的边界
  b += `<rect x="14" y="14" width="${SCENE_W - 28}" height="${696 - 14}" rx="14" fill="none" stroke="${P.tilledLo}" stroke-width="6" opacity="0.55"/>`;
  // 底沿木条（动作条 + HUD 条区·696 之下）：三个按钮排在上面，衬一条木板免得浮空
  b += `<rect x="0" y="706" width="${SCENE_W}" height="${SCENE_H - 706}" fill="${P.wood}" opacity="0.85"/>`;
  b += `<rect x="0" y="706" width="${SCENE_W}" height="3" fill="#000000" opacity="0.25"/>`;
  for (let x = 0; x < SCENE_W; x += 120) {
    b += `<rect x="${x}" y="709" width="2" height="${SCENE_H - 709}" fill="#000000" opacity="0.18"/>`;
  }
  return svg(SCENE_W, SCENE_H, b);
}

/** 土壤一格（102×102·四档）。d = 该档的色组与纹理。 */
function drawSoil(kind) {
  const v =
    kind === 'wild' ? { base: P.grass, hi: P.grassHi, lo: P.grassLo, furrow: 0, seed: 0, op: 0.5 }
    : kind === 'tilled' ? { base: P.tilled, hi: P.tilledHi, lo: P.tilledLo, furrow: 5, seed: 0, op: 0.45 }
    : kind === 'sown' ? { base: P.sown, hi: P.sownHi, lo: P.sownLo, furrow: 5, seed: 1, op: 0.4 }
    : { base: P.wet, hi: P.wetHi, lo: P.wetLo, furrow: 5, seed: 1, op: 0.55, sheen: true };
  let b = '';
  b += `<rect x="1" y="1" width="${CELL - 2}" height="${CELL - 2}" rx="12" fill="${v.base}"/>`;
  b += `<rect x="1" y="1" width="${CELL - 2}" height="${CELL - 2}" rx="12" fill="none" stroke="${v.lo}" stroke-width="2" opacity="0.7"/>`;
  b += `<rect x="6" y="5" width="${CELL - 12}" height="7" rx="4" fill="${v.hi}" opacity="0.35"/>`;
  b += speckles(kind === 'wild' ? 1091 : kind === 'tilled' ? 1092 : kind === 'sown' ? 1093 : 1094,
    kind === 'wild' ? 26 : 34, CELL, CELL, v.lo, 0.8, 2.4, v.op);
  if (v.furrow) {
    for (let i = 0; i < v.furrow; i++) {
      const y = 22 + i * 15;
      b += `<rect x="10" y="${y}" width="${CELL - 20}" height="6" rx="3" fill="${P.furrow}" opacity="0.16"/>`;
      b += `<rect x="10" y="${y}" width="${CELL - 20}" height="2" rx="1" fill="${v.hi}" opacity="0.18"/>`;
      if (v.seed) {
        for (let k = 0; k < 5; k++) {
          b += `<circle cx="${18 + k * 17}" cy="${y + 8}" r="1.7" fill="${v.hi}" opacity="0.7"/>`;
        }
      }
    }
  }
  if (v.sheen) {
    b += `<path d="M18 84 q30 -12 66 -4" stroke="#bfd2e8" stroke-width="3" fill="none" opacity="0.16" stroke-linecap="round"/>`;
  }
  return svg(CELL, CELL, b);
}

/** 苗体（自下而上的茎叶·程序化·各阶逐级长大）。 */
function seedling(cx, baseY, size, leaf, stemColor) {
  const stemH = size * 1.15;
  let b = `<rect x="${r2(cx - 1.6)}" y="${r2(baseY - stemH)}" width="3.2" height="${r2(stemH)}" rx="1.6" fill="${stemColor}"/>`;
  const ly = baseY - stemH * 0.72;
  const s = size * 0.55;
  b += `<path d="M${r2(cx)} ${r2(ly)} q${r2(-s)} ${r2(-s * 0.75)} ${r2(-s * 1.25)} ${r2(s * 0.15)} q${r2(s * 0.8)} ${r2(s * 0.6)} ${r2(s * 1.25)} ${r2(-s * 0.15)}z" fill="${leaf}"/>`;
  b += `<path d="M${r2(cx)} ${r2(ly + s * 0.35)} q${r2(s)} ${r2(-s * 0.7)} ${r2(s * 1.25)} ${r2(s * 0.2)} q${r2(-s * 0.8)} ${r2(s * 0.6)} ${r2(-s * 1.25)} ${r2(-s * 0.2)}z" fill="${leaf}" opacity="0.92"/>`;
  return b;
}

/**
 * 作物 sheet（每格 102×102·**单行横排**·count = days + 2）：
 *   帧 0..days-1 = 各生长阶（程序化苗体）·帧 days = 成熟（**gameicons 字形**·去底换色）·帧 days+1 = **空帧**。
 * ⚠ 空帧是**承重件**：wild/tilled 格子上子实体定位到它 ⇒ 屏幕上不出现苗（见 blueprint.cropEntity 的注）。
 */
function drawCrop(kind, days, iconRel, tone) {
  const count = days + 2;
  const cells = [];
  for (let k = 0; k < days; k++) {
    const grow = (k + 1) / days; // 0..1
    let c = seedling(51, 94, 12 + grow * 20, grow > 0.5 ? tone.leaf2 : tone.leaf, '#5f7a34');
    if (kind === 'pumpkin') {
      // 南瓜多一步：第 2 阶起藤上挂个小瓜（第一阶只是芽）
      if (k >= 1) {
        const rr = 6 + k * 4;
        c += `<ellipse cx="${r2(51 + 14)}" cy="${r2(94 - rr)}" rx="${rr}" ry="${r2(rr * 0.82)}" fill="${tone.fruit}" opacity="${k === days - 1 ? 1 : 0.85}"/>`;
        c += `<path d="M${r2(51 + 14)} ${r2(94 - rr * 2)} q${rr} ${r2(-rr * 0.5)} ${r2(rr * 1.6)} 0" stroke="#5f7a34" stroke-width="2" fill="none"/>`;
      }
    }
    if (kind === 'wheat' && k === days - 1) {
      // 小麦末阶（未熟透）：加一串麦芒
      c += `<path d="M51 40 q-9 10 0 22 q9 -12 0 -22z" fill="${tone.leaf2}" opacity="0.9"/>`;
    }
    cells.push(c);
  }
  // 成熟帧：字形（512 视框 → 78px）压在格底
  const side = 78;
  const scale = side / 512;
  cells.push(`<g transform="translate(${r2(51 - side / 2)}, ${94 - side}) scale(${r2(scale)})">${glyph(iconRel, tone.glyph)}</g>`);
  cells.push(''); // 空帧
  let b = '';
  cells.forEach((c, i) => {
    b += `<g transform="translate(${i * CELL}, 0)">${c}</g>`;
  });
  return svg(CELL * count, CELL, b);
}

/** 生长条（4 帧 × 96×10）：帧 = 填充比例 0 / 33 / 66 / 100%。 */
function drawBar() {
  const frames = [0, 1, 2, 3];
  let b = '';
  frames.forEach((k, i) => {
    const x = i * BAR_W;
    const inner = BAR_W - 4;
    const fill = Math.round((k / 3) * inner);
    const col = k === 3 ? '#f2c21e' : k === 2 ? '#a8c14a' : '#7fa03c';
    b += `<g transform="translate(${x}, 0)">`;
    b += `<rect x="1" y="1" width="${BAR_W - 2}" height="${BAR_H - 2}" rx="4" fill="#2b2118" opacity="0.9"/>`;
    b += `<rect x="1" y="1" width="${BAR_W - 2}" height="${BAR_H - 2}" rx="4" fill="none" stroke="#161009" stroke-width="1"/>`;
    if (fill > 0) b += `<rect x="2" y="2" width="${fill}" height="${BAR_H - 4}" rx="3" fill="${col}"/>`;
    b += `<rect x="2" y="2" width="${BAR_W - 4}" height="2" rx="1" fill="#ffffff" opacity="0.14"/>`;
    b += '</g>';
  });
  return svg(BAR_W * 4, BAR_H, b);
}

/** 按钮（96×88）：圆角面板 + 顶部高光 + gameicons 字形（52px 居中）。 */
function drawButton(panel, iconRel) {
  const H = 44;
  let b = '';
  b += `<defs><linearGradient id="pn" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${panel}" stop-opacity="1"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.35"/></linearGradient></defs>`;
  b += `<rect x="1" y="1" width="${BTN_W - 2}" height="${BTN_H - 2}" rx="14" fill="${panel}"/>`;
  b += `<rect x="1" y="1" width="${BTN_W - 2}" height="${BTN_H - 2}" rx="14" fill="url(#pn)"/>`;
  b += `<rect x="1.5" y="1.5" width="${BTN_W - 3}" height="${BTN_H - 3}" rx="13.5" fill="none" stroke="#000000" stroke-width="2" opacity="0.35"/>`;
  b += `<rect x="7" y="5" width="${BTN_W - 14}" height="9" rx="4" fill="#ffffff" opacity="0.18"/>`;
  const scale = 52 / 512;
  b += `<g transform="translate(${r2(H - 26)}, ${r2(H - 26 - 4)}) scale(${r2(scale)})">${glyph(iconRel)}</g>`;
  return svg(BTN_W, BTN_H, b);
}

// ── 槽位表（**唯一真相**）────────────────────────────────────────────────────
export const SLOT_DEFS = [
  {
    skinKey: '109/scene/farm', file: 'scene-farm.svg', kind: 'bg', w: SCENE_W, h: SCENE_H, transparent: false,
    query: '农场场景底', desc: '农场全景底（草地 + 田埂围栏 + 下沿木条）',
    draw: drawScene, license: 'CC0', source: 'apollo-procedural',
  },
  {
    skinKey: '109/soil/wild', file: 'soil-wild.svg', kind: 'sprite', w: CELL, h: CELL, transparent: false,
    query: '荒地土壤', desc: '未开垦的草地土块（行 0 荒·干）',
    draw: () => drawSoil('wild'), license: 'CC0', source: 'apollo-procedural',
  },
  {
    skinKey: '109/soil/tilled', file: 'soil-tilled.svg', kind: 'sprite', w: CELL, h: CELL, transparent: false,
    query: '翻过的土壤', desc: '翻开的垄沟土块（行 2 翻·干·亦作行 1/3 不可达档的共图）',
    draw: () => drawSoil('tilled'), license: 'CC0', source: 'apollo-procedural',
  },
  {
    skinKey: '109/soil/sown', file: 'soil-sown.svg', kind: 'sprite', w: CELL, h: CELL, transparent: false,
    query: '播种后的土壤', desc: '播过种的深色垄沟（行 4 播·干）',
    draw: () => drawSoil('sown'), license: 'CC0', source: 'apollo-procedural',
  },
  {
    skinKey: '109/soil/sown-wet', file: 'soil-sown-wet.svg', kind: 'sprite', w: CELL, h: CELL, transparent: false,
    query: '浇过水的土壤', desc: '浇透的近黑湿土带反光（行 5 播·湿·今晚会长的那格）',
    draw: () => drawSoil('wet'), license: 'CC0', source: 'apollo-procedural',
  },
  {
    skinKey: '109/crop/carrot', file: 'crop-carrot.svg', kind: 'sprite', w: CELL, h: CELL, transparent: true,
    sheet: { frameWidth: CELL, frameHeight: CELL, columns: 3, count: 3 },
    query: '胡萝卜生长阶', desc: '胡萝卜 3 帧横排：幼苗 / 成熟 / 空帧',
    draw: () => drawCrop('carrot', 1, 'delapouite/carrot', { leaf: '#7fa03c', leaf2: '#9ab84f', fruit: '#d97a3a', glyph: '#e8853f' }),
    license: 'CC BY 3.0', source: 'apollo-procedural + gameicons/delapouite/carrot',
    derivesFrom: 'assets/gameicons/delapouite/carrot.svg',
  },
  {
    skinKey: '109/crop/wheat', file: 'crop-wheat.svg', kind: 'sprite', w: CELL, h: CELL, transparent: true,
    sheet: { frameWidth: CELL, frameHeight: CELL, columns: 4, count: 4 },
    query: '小麦生长阶', desc: '小麦 4 帧横排：幼苗 / 抽穗 / 成熟 / 空帧',
    draw: () => drawCrop('wheat', 2, 'lorc/wheat', { leaf: '#7fa03c', leaf2: '#b7a24a', fruit: '#d8b44a', glyph: '#e0c05a' }),
    license: 'CC BY 3.0', source: 'apollo-procedural + gameicons/lorc/wheat',
    derivesFrom: 'assets/gameicons/lorc/wheat.svg',
  },
  {
    skinKey: '109/crop/pumpkin', file: 'crop-pumpkin.svg', kind: 'sprite', w: CELL, h: CELL, transparent: true,
    sheet: { frameWidth: CELL, frameHeight: CELL, columns: 5, count: 5 },
    query: '南瓜生长阶', desc: '南瓜 5 帧横排：幼芽 / 藤叶 / 结瓜 / 成熟 / 空帧',
    draw: () => drawCrop('pumpkin', 3, 'delapouite/pumpkin', { leaf: '#7fa03c', leaf2: '#8fae44', fruit: '#c9622a', glyph: '#d0692c' }),
    license: 'CC BY 3.0', source: 'apollo-procedural + gameicons/delapouite/pumpkin',
    derivesFrom: 'assets/gameicons/delapouite/pumpkin.svg',
  },
  {
    skinKey: '109/plant/bar', file: 'plant-bar.svg', kind: 'sprite', w: BAR_W, h: BAR_H, transparent: true,
    sheet: { frameWidth: BAR_W, frameHeight: BAR_H, columns: 4, count: 4 },
    query: '生长条', desc: '生长条 4 帧横排：0% / 33% / 66% / 100% 填充',
    draw: drawBar, license: 'CC0', source: 'apollo-procedural',
  },
];
// 6 枚按钮（4 工具 + 睡觉 + 卖货）：面板色分两系（工具暖褐 / 动作冷蓝·与 BTN_TINT 同色系）
const BUTTONS = [
  { skinKey: '109/tool/plow', icon: 'delapouite/plow', query: '锄地工具图标', desc: '工具按钮：锄头', panel: P.toolPanel },
  { skinKey: '109/tool/plant-seed', icon: 'delapouite/plant-seed', query: '播种工具图标', desc: '工具按钮：种子袋', panel: P.toolPanel },
  { skinKey: '109/tool/watering-can', icon: 'delapouite/watering-can', query: '浇水工具图标', desc: '工具按钮：洒水壶', panel: P.toolPanel },
  { skinKey: '109/tool/scythe', icon: 'lorc/scythe', query: '收获工具图标', desc: '工具按钮：镰刀', panel: P.toolPanel },
  { skinKey: '109/hud/night-sleep', icon: 'delapouite/night-sleep', query: '睡觉动作图标', desc: '动作按钮：月亮睡觉', panel: P.actionPanel },
  { skinKey: '109/hud/coins', icon: 'delapouite/coins', query: '卖货动作图标', desc: '动作按钮：金币', panel: P.actionPanel },
];
for (const b of BUTTONS) {
  SLOT_DEFS.push({
    skinKey: b.skinKey, file: `${b.skinKey.split('/').slice(1).join('-')}.svg`, kind: 'sprite',
    w: BTN_W, h: BTN_H, transparent: true, query: b.query, desc: b.desc,
    draw: () => drawButton(b.panel, b.icon),
    license: 'CC BY 3.0', source: `apollo-procedural + gameicons/${b.icon}`,
    derivesFrom: `assets/gameicons/${b.icon}.svg`,
  });
}

/** 一条索引条目（别名词典形态·与 game-103 同构）。 */
function entryOf(s) {
  return {
    id: s.skinKey,
    type: 'texture',
    status: 'filled',
    path: `/games/game109/art/${s.file}`,
    description: s.desc,
    spec: {
      format: 'svg',
      usage: 'sprite',
      ...(s.sheet ? { sheet: s.sheet } : {}),
      width: s.w,
      height: s.h,
    },
    category: s.kind === 'bg' ? 'scene.background' : 'sprite.farm',
    tags: ['game109', s.kind, ...s.skinKey.split('/').slice(1)],
    license: s.license,
    source: s.source,
    provenance: {
      generator: 'apollo-procedural',
      script: 'scripts/game109-art-gen.mjs',
      style: 'chunky cartoon farm (flat shapes + 1px-ish stroke + soft speckle)',
      ...(s.derivesFrom ? { derivesFrom: s.derivesFrom, author: 'Delapouite / Lorc (game-icons.net)', attribution: 'CC BY 3.0 — 需署名（显示机制未立项）' } : {}),
      mock: false,
    },
  };
}

function main() {
  const check = process.argv.includes('--check');
  const problems = [];
  const index = { version: 1, game: 'game109', assets: [] };
  for (const s of SLOT_DEFS) {
    const text = s.draw();
    const file = join(ART_DIR, s.file);
    if (check) {
      const onDisk = existsSync(file) ? readFileSync(file, 'utf8') : null;
      if (onDisk !== text) problems.push(`${s.file}：${onDisk === null ? '缺文件' : '内容与重算不一致'}`);
    } else {
      mkdirSync(ART_DIR, { recursive: true });
      writeFileSync(file, text);
    }
    index.assets.push(entryOf(s));
  }
  const idxText = JSON.stringify(index, null, 1) + '\n';
  if (check) {
    const onDisk = existsSync(join(ART_DIR, 'index.json')) ? readFileSync(join(ART_DIR, 'index.json'), 'utf8') : null;
    if (onDisk !== idxText) problems.push('index.json：内容与重算不一致');
    if (problems.length) {
      console.error('ART-GEN-CHECK: FAIL\n' + problems.map((p) => '  · ' + p).join('\n'));
      process.exit(1);
    }
    console.log(`ART-GEN-CHECK: PASS（${SLOT_DEFS.length} 张 SVG + index.json 逐字节一致）`);
    return;
  }
  writeFileSync(join(ART_DIR, 'index.json'), idxText);
  console.log(`ART-GEN: OK（${SLOT_DEFS.length} 张 SVG → public/games/game109/art/ + index.json）`);
  for (const s of SLOT_DEFS) console.log(`  ${s.skinKey.padEnd(24)} ${s.file.padEnd(20)} ${s.w}×${s.h}${s.sheet ? ` ×${s.sheet.count}帧` : ''}`);
}

// 直接跑才执行（被需求脚本 import 时只取 SLOT_DEFS）。
// ⚠ 判据用 `pathToFileURL`：Windows 下 `import.meta.url` 是 `file:///C:/…`（三斜杠），
//    手搓 `file://${argv[1]}` 会**静默不匹配**（脚本一声不响什么都没干·退出码 0）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
