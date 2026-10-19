// emoji-resolve —— 确定性 `emoji 字符 → 库里 Twemoji 美术图资产` 解析器 + 某游戏的覆盖/映射报告。
// PA 交付（配合 REQ-UI-emoji图渲·PUI 域）：给 PUI 的自动「文本 emoji→美术图」渲染当映射底座。
//   码点算法与 `import-emoji.mjs`（Twemoji 导入器）一致，故解析出的 path 与库内文件名严丝合缝。
// 用法：node scripts/emoji-resolve.mjs <char|game-*> [--md|--json]
//   node scripts/emoji-resolve.mjs '⚔'          → 单字符解析
//   node scripts/emoji-resolve.mjs game-g --md   → 该游戏 emoji 覆盖表（喂 PUI spec）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditEmoji } from './emoji-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 码点文件名（同 import-emoji.mjs cpName）：过滤 U+FE0F 变体选择符；多码点(ZWJ)以 - 连。
export const cpName = (e) => [...e].map((c) => c.codePointAt(0).toString(16)).filter((h) => h !== 'fe0f').join('-');

// 库里没有的 Unicode 符号 → 就近映射到「确有 Twemoji 图」的 emoji（建议·非精确·PUI/game 可逐个否决）。
export const SYMBOL_ALIAS = {
  '2605': '2b50', // ★ 实心星 → ⭐ 金星
  '2606': '2b50', // ☆ 空心星 → ⭐
  '2654': '1f451', // ♔ 白棋王 → 👑 皇冠
  '266a': '1f3b5', // ♪ 音符   → 🎵
  '2691': '1f6a9', // ⚑ 旗     → 🚩
  '267a': '267b', // ♺ 回收   → ♻
};

// 从共享库 assets/index.json 建「码点 → {id,path}」表（path=emoji/<cp>.png）。
function loadEmojiLib(root = ROOT) {
  const idx = JSON.parse(readFileSync(join(root, 'assets', 'index.json'), 'utf8'));
  const map = new Map();
  for (const a of idx.assets) {
    if (a.category !== 'emoji' || !a.path) continue;
    const cp = a.path.replace(/^emoji\//, '').replace(/\.png$/, '');
    map.set(cp, { id: a.id, path: a.path });
  }
  return map;
}

// 解析一个 emoji 字符 → 资产。match: exact(库直中) / alias(就近替) / none(库无·无 alias)。
export function resolveEmoji(char, { lib = loadEmojiLib() } = {}) {
  const cp = cpName(char);
  if (lib.has(cp)) return { char, cp, match: 'exact', ...lib.get(cp) };
  const al = SYMBOL_ALIAS[cp];
  if (al && lib.has(al)) return { char, cp, match: 'alias', aliasCp: al, ...lib.get(al) };
  return { char, cp, match: 'none' };
}

// 某游戏的覆盖：扫 UI emoji（emoji-audit）→ 逐种解析 → 汇总。
export function coverage(game, { root = ROOT } = {}) {
  const lib = loadEmojiLib(root);
  const r = auditEmoji(game, { root });
  const rows = r.emojis.map((e) => ({ ...resolveEmoji(e.emoji, { lib }), count: e.count, files: e.files.length }));
  const sum = (p) => rows.filter(p).reduce((a, x) => a + x.count, 0);
  return {
    game, distinct: rows.length, total: r.total,
    exactKinds: rows.filter((x) => x.match === 'exact').length, exactHits: sum((x) => x.match === 'exact'),
    aliasKinds: rows.filter((x) => x.match === 'alias').length, aliasHits: sum((x) => x.match === 'alias'),
    noneKinds: rows.filter((x) => x.match === 'none').length, noneHits: sum((x) => x.match === 'none'),
    rows: rows.sort((a, b) => b.count - a.count),
  };
}

function toMarkdown(c) {
  const L = [];
  L.push(`# ${c.game} · emoji → 美术图映射覆盖表`);
  L.push('');
  L.push(`> PA 交付（\`node scripts/emoji-resolve.mjs ${c.game} --md\`·可重跑）。喂给 PUI「文本 emoji→美术图」自动渲染当映射底座。`);
  L.push(`> **${c.distinct} 种 / ${c.total} 处**：直中库 **${c.exactKinds} 种·${c.exactHits} 处**；alias 就近替 **${c.aliasKinds} 种·${c.aliasHits} 处**；仍无 **${c.noneKinds} 种·${c.noneHits} 处**。`);
  L.push('> 映射确定性=码点（同 `import-emoji.mjs`）；exact 直接用，alias 为符号→就近 emoji 建议（PUI/game 可逐个否决）。');
  L.push('');
  L.push('| emoji | 码点 | 状态 | 映射到资产 | 次数 |');
  L.push('|---|---|---|---|---|');
  for (const x of c.rows) {
    const tag = x.match === 'exact' ? '✓ 直中' : x.match === 'alias' ? `≈ alias→${x.aliasCp}` : '✗ 库无';
    L.push(`| ${x.char} | \`${x.cp}\` | ${tag} | ${x.id ? `\`${x.id}\` (\`${x.path}\`)` : '—'} | ${x.count} |`);
  }
  L.push('');
  return L.join('\n');
}

function run(argv) {
  const arg = argv.find((a) => !a.startsWith('--'));
  if (!arg) { console.error("用法: node scripts/emoji-resolve.mjs <char|game-*> [--md|--json]"); process.exit(1); }
  if (/^game-[a-z0-9]+$/.test(arg)) {
    const c = coverage(arg);
    if (argv.includes('--json')) { console.log(JSON.stringify(c, null, 2)); return; }
    if (argv.includes('--md')) { console.log(toMarkdown(c)); return; }
    console.log(`${arg}: ${c.distinct} 种/${c.total} 处 · 直中 ${c.exactKinds}/${c.exactHits} · alias ${c.aliasKinds}/${c.aliasHits} · 无 ${c.noneKinds}/${c.noneHits}`);
    return;
  }
  console.log(JSON.stringify(resolveEmoji(arg), null, 2)); // 单字符
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
