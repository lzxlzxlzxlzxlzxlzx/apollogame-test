#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/assert-no-baked-key.mjs —— 零 key 打包断言（安全红线·platform-packaging-spec 决策②）。
//
//  用法：node scripts/assert-no-baked-key.mjs <dir>
//  退出码：0=PASS（干净）；1=命中疑似 key（打印命中清单）；2=用法错误。
//
//  扫描规则（两层）：
//   ① 危险文件名直接命中——.env / .apollo-config.json / .apollo-styles.json 是 BYO-key 机制
//      本地明文落盘的位置（main_entry/config.py _load_config·均已 .gitignore），组装脚本正常
//      不会碰它们；一旦被误 cp 进产物目录 = 最坏情形，文件名命中即失败，不必等内容匹配。
//   ② 文本文件内容里的 key 字面量特征：`ark-`（火山方舟）/ `sk-`（OpenAI·Anthropic·DeepSeek
//      等主流 key 前缀）后接 ≥20 个 base64url 字符。阈值 20 是刻意选的——游戏内数据里合法出现
//      的 "sk-" 前缀 id（如 game-i 皮肤画廊 'sk-wood-rib'/'sk-scroll-pill'，"sk-"="skin-"缩写）
//      长度都在个位数～十来个字符，真实 API key 主体普遍 30~100+ 字符，20 的门槛在两者间留足
//      余量，不误伤合法数据（跑过一遍全仓验证，见交付说明）。
//   二进制/字体/图片/视频/编译缓存不扫（噪声大且规范上不该含文本 key）。
//
//   D5（platform-packaging-spec.md）起 pybundle/ 灌进真 standalone python + Pillow 原生库——
//   解释器可执行文件、`.so`/`.dylib`/`.a` 静态库这些大多没有常规扩展名或不在上面的跳过表里，
//   若照单读 utf8 全文本：①几十兆的二进制当字符串解码 + 全文 regex，CPU/内存都白烧；②二进制
//   熵里小概率巧合拼出形似 "sk-"/"ark-" 前缀的噪声，让红线断言变成偶发性抽风、不可复现。
//   两层防护：常见原生库扩展名直接跳过（快路径，不用开文件）；再加一层通用二进制嗅探
//   （读文件头 8KB，命中 NUL 字节即判定二进制→跳过）兜底那些没有扩展名的可执行文件
//   （如 pybundle/bin/python3.11 本体）——嗅探对象只是「文件头是否含 NUL」，不产生假阴性：
//   合法文本文件（含 CPython 标准库源码/pip 的 shebang 脚本）不含 NUL，不受影响。
// ═══════════════════════════════════════════════════════════════

import {
  readdirSync, statSync, readFileSync, openSync, readSync, closeSync,
} from 'node:fs';
import { join, extname, basename } from 'node:path';

const DANGEROUS_NAMES = new Set(['.env', '.apollo-config.json', '.apollo-styles.json']);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.glb', '.gltf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm',
  '.pyc', '.zip', '.tar', '.gz', '.dmg',
  '.so', '.dylib', '.a', '.whl', // standalone python + pip 装的原生库/wheel（D5 起真实出现）
]);

const BINARY_SNIFF_BYTES = 8000; // 借鉴 git/grep -I 的「头部含 NUL→当二进制」经验阈值

/** 只读文件头部若干字节判定是否二进制，不读整份文件（大二进制文件跑这条应是常数时间）。
 * 打不开/读失败 → 保守当二进制处理（跳过总比误读半截垃圾内容去跑 regex 安全）。 */
function isProbablyBinary(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
  } catch {
    return true;
  }
  try {
    const buf = Buffer.alloc(BINARY_SNIFF_BYTES);
    const n = readSync(fd, buf, 0, BINARY_SNIFF_BYTES, 0);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
    return false;
  } catch {
    return true;
  } finally {
    closeSync(fd);
  }
}
const KEY_PATTERNS = [
  [/\bark-[A-Za-z0-9_-]{20,}/g, 'ark- 前缀 key（火山方舟）'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, 'sk- 前缀 key（OpenAI/Anthropic/DeepSeek 等常见格式）'],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { yield* walk(p); continue; }
    yield p;
  }
}

function mask(s) {
  return s.length <= 10 ? s : `${s.slice(0, 6)}…${s.slice(-2)}（长度 ${s.length}）`;
}

export function scanDir(dir) {
  const hits = [];
  let fileCount = 0;
  let scanned = 0;
  for (const p of walk(dir)) {
    fileCount++;
    if (DANGEROUS_NAMES.has(basename(p))) {
      hits.push(`${p} — 危险文件名（BYO-key 本地配置，绝不该进组装目录）`);
      continue;
    }
    if (SKIP_EXT.has(extname(p).toLowerCase())) continue;
    if (isProbablyBinary(p)) continue;
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { continue; }
    scanned++;
    for (const [re, label] of KEY_PATTERNS) {
      const m = text.match(re);
      if (m) hits.push(`${p} — ${label}×${m.length}（如 ${mask(m[0])}）`);
    }
  }
  return { hits, fileCount, scanned };
}

function main(argv) {
  const dir = argv[0];
  if (!dir) {
    console.error('用法：node scripts/assert-no-baked-key.mjs <dir>');
    process.exit(2);
  }
  try { statSync(dir); } catch { console.error(`[assert-no-baked-key] 目录不存在：${dir}`); process.exit(2); }
  const { hits, fileCount, scanned } = scanDir(dir);
  if (hits.length) {
    console.error(`[assert-no-baked-key] FAIL —— 组装目录疑似烤入 key（${hits.length} 处）：`);
    for (const h of hits) console.error(`  - ${h}`);
    process.exit(1);
  }
  console.log(`[assert-no-baked-key] PASS —— ${dir}（共 ${fileCount} 文件·文本扫 ${scanned} 个）零 key 字面量、零危险配置文件`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) main(process.argv.slice(2));
