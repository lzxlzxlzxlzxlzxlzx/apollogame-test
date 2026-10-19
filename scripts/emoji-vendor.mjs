// emoji-vendor —— 按游戏「只 vendor 它用到的那批 emoji 美术图」进本地库（干净·不破 hermetic）。
// REQ-UI-emoji图渲 资产可达方案(b)（PA 域）：扫游戏 UI 用到的 emoji（emoji-audit）→ 解析成库里 Twemoji
//   资产（emoji-resolve·exact/alias·按解析后码点去重）→ copy 进 public/games/<game>/art/emoji/ + 登记
//   本地 index（id=`emoji/<cp>`·码点键·渲染器按码点直查）。→ PUI 渲染器解析 emoji→本地 served 路径。
// 默认 dry-run（只出计划）；--apply 才写盘。用法：node scripts/emoji-vendor.mjs <game> [--apply] [--json]
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditEmoji } from './emoji-audit.mjs';
import { resolveEmoji } from './emoji-resolve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 计划（纯函数·不写盘）：该游戏要 vendor 哪些唯一 emoji 美术图 + 哪些解析不到。
export function planEmojiVendor(game, { root = ROOT } = {}) {
  const r = auditEmoji(game, { root });
  const byPath = new Map(); // 解析后 path 去重（★☆ 可能都→⭐）
  const missing = [];
  for (const e of r.emojis) {
    const res = resolveEmoji(e.emoji, {});
    if (res.match === 'none') { missing.push({ emoji: e.emoji, cp: res.cp, count: e.count }); continue; }
    const cp = res.path.replace(/^emoji\//, '').replace(/\.png$/, '');
    if (!byPath.has(res.path)) byPath.set(res.path, { cp, srcPath: res.path, sharedId: res.id, sources: [], count: 0 });
    const a = byPath.get(res.path); a.sources.push(`${e.emoji}(${res.match})`); a.count += e.count;
  }
  const assets = [...byPath.values()].map((a) => ({
    ...a, id: `emoji/${a.cp}`, destRel: `emoji/${a.cp}.png`, servedPath: `/games/${game}/art/emoji/${a.cp}.png`,
  })).sort((x, y) => y.count - x.count);
  return { game, distinct: r.emojis.length, occurrences: r.total, uniqueArt: assets.length, assets, missing };
}

// 落地：copy 文件 + upsert 本地 index（按 id 幂等）。
export function vendorEmoji(game, { root = ROOT } = {}) {
  const plan = planEmojiVendor(game, { root });
  const artDir = join(root, 'public', 'games', game, 'art');
  const emojiDir = join(artDir, 'emoji');
  mkdirSync(emojiDir, { recursive: true });
  let copied = 0;
  for (const a of plan.assets) {
    const src = join(root, 'assets', a.srcPath);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(emojiDir, basename(a.destRel)));
    copied++;
  }
  const idxFile = join(artDir, 'index.json');
  const idx = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : { version: 1, assets: [] };
  const byId = new Map(idx.assets.map((x) => [x.id, x]));
  for (const a of plan.assets) {
    byId.set(a.id, {
      id: a.id, type: 'texture', description: `emoji ${a.sources[0] ?? ''} (Twemoji·vendored)`, status: 'filled',
      path: a.servedPath, category: 'emoji', license: 'CC BY 4.0', source: 'twemoji',
      spec: { format: 'png', usage: 'sprite' }, provenance: { vendoredFrom: a.sharedId },
    });
  }
  idx.assets = [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  writeFileSync(idxFile, JSON.stringify(idx, null, 2) + '\n');
  return { ...plan, copied, indexFile: idxFile, localCount: idx.assets.length };
}

function run(argv) {
  const game = argv.find((a) => /^game-[a-z0-9]+$/.test(a));
  if (!game) { console.error('用法: node scripts/emoji-vendor.mjs <game> [--apply] [--json]'); process.exit(1); }
  const apply = argv.includes('--apply');
  const res = apply ? vendorEmoji(game) : planEmojiVendor(game);
  if (argv.includes('--json')) { console.log(JSON.stringify(res, null, 2)); return; }
  console.log(`emoji-vendor ${game}${apply ? ' (已写盘)' : ' (dry-run·加 --apply 才写)'}：`);
  console.log(`  UI emoji ${res.distinct} 种 / ${res.occurrences} 处 → 去重 ${res.uniqueArt} 张美术图待 vendor`);
  if (res.missing.length) console.log(`  解析不到(无 exact/alias): ${res.missing.map((m) => m.emoji).join(' ')}`);
  if (apply) console.log(`  ✓ copy ${res.copied} 张 → public/games/${game}/art/emoji/ · 本地 index ${res.localCount} 条`);
  else console.log(`  样例: ${res.assets.slice(0, 6).map((a) => `${a.id}←${a.sources[0]}`).join(' · ')}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
