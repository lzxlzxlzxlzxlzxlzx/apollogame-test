// emoji-audit —— 扫一个游戏的运行时 UI 源，把「当图标用的 emoji 字形」逐处列出（file:line + 上下文）。
// 用途（PA 审计·REQ game-g 美术盘点 ③「遗漏」）：emoji 写在 LayoutNode 文本里=不是 Sprite/Image 美术槽，
//   T2 台账 derive 抓不到 → 管线换不了。本清单给 game-g/PE 照单把 emoji-in-text 转成带 skinKey 的 Image 槽。
// 确定性·零网络·零依赖。用法：node scripts/emoji-audit.mjs <game> [--json] [--md]
//   例: node scripts/emoji-audit.mjs game-g --md > docs/design/game-g/emoji-icon-inventory.md

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 当图标用的 emoji：象形符号 + 花色 ♠♥♦♣ + 棋子 ♔-♟ + 麻将 🀄 等；不含箭头(→←↔)/勾叉(✓✅✗)——那些是文本装饰非美术。
const ICON = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2694}-\u{2699}\u{1F004}\u{2654}-\u{265F}\u{2660}-\u{2667}]/gu;
// 排除运行时无关目录（设计稿/截图/测试/字体/帧存档）。
const SKIP_DIR = /^(design|doc|__frames__|assets|node_modules)$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIR.test(name)) walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export function auditEmoji(game, { root = ROOT } = {}) {
  const base = join(root, 'games', game);
  const files = walk(base);
  const hits = []; // {file, line, emoji, snippet}
  for (const f of files) {
    const rel = f.slice(join(root, 'games', game).length + 1);
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((text, i) => {
      const t = text.trim();
      // 只要玩家看得见的 UI 文本：跳过纯注释行（emoji 出现在 //、* 注释里=代码说明/花色逻辑记号·非待换美术）。
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      const m = text.match(ICON);
      if (!m) return;
      const snippet = t.slice(0, 100);
      for (const e of m) hits.push({ file: rel, line: i + 1, emoji: e, snippet });
    });
  }
  // 聚合：按 emoji（种类×次数×代表位置）+ 按文件。
  const byEmoji = new Map();
  const byFile = new Map();
  for (const h of hits) {
    if (!byEmoji.has(h.emoji)) byEmoji.set(h.emoji, { emoji: h.emoji, count: 0, files: new Set(), samples: [] });
    const e = byEmoji.get(h.emoji); e.count++; e.files.add(h.file);
    if (e.samples.length < 3 && !e.samples.some((s) => s.snippet === h.snippet)) e.samples.push({ where: `${h.file}:${h.line}`, snippet: h.snippet });
    byFile.set(h.file, (byFile.get(h.file) || 0) + 1);
  }
  const emojis = [...byEmoji.values()].map((e) => ({ ...e, files: [...e.files] })).sort((a, b) => b.count - a.count);
  const filesRanked = [...byFile.entries()].map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count);
  return { game, total: hits.length, distinct: emojis.length, fileCount: filesRanked.length, emojis, files: filesRanked, hits };
}

function toMarkdown(r) {
  const L = [];
  L.push(`# ${r.game} · emoji 图标清单（当图标用的 emoji 字形 → 待转 Image 槽）`);
  L.push('');
  L.push(`> PA 审计产出（\`node scripts/emoji-audit.mjs ${r.game} --md\`·可重跑）。**${r.total} 处 emoji 图标 · ${r.distinct} 种 · ${r.fileCount} 个运行时 UI 文件。**`);
  L.push('> 这些 emoji 写在 LayoutNode **文本**里=不是 Sprite/Image 美术槽 → T2 台账 derive 抓不到、管线换不了。');
  L.push('> **给 game-g/PE**：照本单把要美术化的 emoji 从「文本字形」改成「带 skinKey 的 `Image` 控件槽」，台账重跑即可纳入生成管线。');
  L.push('');
  L.push('## 一、按 emoji（种类 · 次数 · 代表 · 位置）');
  L.push('');
  L.push('| emoji | 次数 | 出现文件数 | 代表（看样例上下文） | 样例位置 |');
  L.push('|---|---|---|---|---|');
  for (const e of r.emojis) {
    const sample = e.samples[0] ? `\`${e.samples[0].snippet.replace(/\|/g, '\\|').slice(0, 60)}\`` : '';
    L.push(`| ${e.emoji} | ${e.count} | ${e.files.length} | ${sample} | ${e.samples[0]?.where ?? ''} |`);
  }
  L.push('');
  L.push('## 二、按文件（哪屏 emoji 最多 → 优先转槽）');
  L.push('');
  L.push('| 文件 | emoji 图标数 |');
  L.push('|---|---|');
  for (const f of r.files) L.push(`| \`${f.file}\` | ${f.count} |`);
  L.push('');
  L.push('## 三、逐处明细（file:line · emoji · 上下文）');
  L.push('');
  let cur = '';
  for (const h of r.hits) {
    if (h.file !== cur) { cur = h.file; L.push(`\n### \`${cur}\``); L.push(''); }
    L.push(`- \`:${h.line}\` ${h.emoji} — \`${h.snippet.replace(/`/g, 'ˋ').slice(0, 90)}\``);
  }
  L.push('');
  return L.join('\n');
}

function run(argv) {
  const game = argv.find((a) => /^game-[a-z0-9]+$/.test(a));
  if (!game) { console.error('用法: node scripts/emoji-audit.mjs <game> [--json] [--md]'); process.exit(1); }
  const r = auditEmoji(game);
  if (argv.includes('--json')) { console.log(JSON.stringify({ ...r, hits: undefined }, null, 2)); return; }
  if (argv.includes('--md')) { console.log(toMarkdown(r)); return; }
  console.log(`emoji-audit ${game}: ${r.total} 处 emoji 图标 · ${r.distinct} 种 · ${r.fileCount} 个 UI 文件`);
  console.log('Top emoji: ' + r.emojis.slice(0, 15).map((e) => `${e.emoji}×${e.count}`).join(' '));
  console.log('Top 文件: ' + r.files.slice(0, 8).map((f) => `${f.file}(${f.count})`).join(' · '));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
