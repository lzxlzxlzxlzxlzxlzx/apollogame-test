#!/usr/bin/env node
// scripts/capgap.mjs —— capgap 快速通道 CLI（8/4 大评审 Q1 消费路径批·断链修复·2026-08-10）
//
// 断链现状（评审 §Q1 实证）：「词表/能力缺口走 capgap 快速通道」此前唯一入口是创作台 agent 的
// ```capgap 围栏（main_entry/protocols.py → .zerocraft/cap-gaps.jsonl·gitignored），编译期游戏
// session **无 CLI 可用**——「查不到→提缺口」的最短逃生门实际不通，只剩 requests.md 重通道
// （10 硬槽·心理成本高）→ 变相鼓励静默自造。本 CLI 补上入口并统一路径口径：
//
//   node scripts/capgap.mjs add --title "缺口一句话" --need "为什么现有能力表达不了（附实查过程）" \
//        [--proposal "建议的下沉形态"] [--acceptance "验收判据"] [--slug <game|engine>] [--role <角色>]
//   node scripts/capgap.mjs list [-n 20]
//
// 台账与服务端同一份（统一路径=评审 Q1 改造②）：写永远落 .zerocraft/cap-gaps.jsonl（新目录·同
// main_entry/sysutil.ZEROCRAFT_DIR 口径）；读带旧 .apollo/cap-gaps.jsonl fallback（dir_or_legacy 同
// 语义：新文件写过第一行即转读新文件）。记录形状与 protocols.py:_capgap_record 逐字段一致
// （id/slug/role/at/status + title/need/proposal/acceptance·各字段 ≤1200 字符截断）。
// 台账 gitignored=本地 Lead 裁决面；下沉仍走 Lead 裁决——通道只把「发现缺口→立单」从口口相传变成
// 机器直达，不是自动批准。提完建议在对应 requests.md 留一行指针加速裁决。
// 墙钟说明：id/at 用 Date.now/ISO 时间戳（与服务端同形）——scripts/ 非 sim 面，不受确定性红线约束。
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = ['title', 'need', 'proposal', 'acceptance'];

/** 写路径：永远新目录（同 sysutil.ZEROCRAFT_DIR 口径·新数据不再进旧 .apollo/）。 */
export function capgapWritePath(root = DEFAULT_ROOT) {
  return join(root, '.zerocraft', 'cap-gaps.jsonl');
}
/** 读路径：dir_or_legacy 同语义——新文件存在读新的，否则 fallback 旧 .apollo/ 存量。 */
export function capgapReadPath(root = DEFAULT_ROOT) {
  const nu = capgapWritePath(root);
  if (existsSync(nu)) return nu;
  const legacy = join(root, '.apollo', 'cap-gaps.jsonl');
  return existsSync(legacy) ? legacy : nu;
}

/** 纯构造（可单测）：CLI 选项 → 台账记录（形状=protocols.py:_capgap_record）。title/need 缺失即抛。 */
export function makeEntry(opts, now = Date.now()) {
  const gap = {};
  for (const k of FIELDS) gap[k] = String(opts[k] ?? '').trim().slice(0, 1200);
  if (!gap.title || !gap.need) {
    throw new Error('capgap add 必须给 --title 与 --need（缺口是什么·为什么现有能力表达不了——按缺口裁决协议附「查了什么」的实查原文）');
  }
  const slug = String(opts.slug ?? 'engine').trim() || 'engine';
  const role = String(opts.role ?? 'session').trim() || 'session';
  return { id: `gap-${Math.floor(now / 1000)}-${slug}`, slug, role, at: new Date(now).toISOString(), status: 'open', ...gap };
}

/** 纯解析（可单测）：argv 尾段 → {_: 位置参数, 键值}。只认 --key value / -n value。 */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-n') { out.n = argv[++i]; continue; }
    if (a.startsWith('--')) { out[a.slice(2)] = argv[++i] ?? ''; continue; }
    out._.push(a);
  }
  return out;
}

export function addGap(opts, root = DEFAULT_ROOT) {
  const entry = makeEntry(opts);
  const p = capgapWritePath(root);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(entry) + '\n');
  return { entry, path: p };
}

export function listGaps(root = DEFAULT_ROOT, n = 20) {
  const p = capgapReadPath(root);
  if (!existsSync(p)) return { path: p, gaps: [] };
  const gaps = [];
  for (const ln of readFileSync(p, 'utf8').split('\n')) {
    const t = ln.trim();
    if (!t) continue;
    try { gaps.push(JSON.parse(t)); } catch { /* 坏行跳过（追加型台账·防半行） */ }
  }
  return { path: p, gaps: gaps.slice(-Math.max(1, Math.min(n, 200))).reverse() }; // 新的在前（同 /api/capgaps）
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const root = args.root || DEFAULT_ROOT; // --root 仅供测试/工具复用·日常省略=仓库根
  if (cmd === 'add') {
    let res;
    try { res = addGap(args, root); }
    catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
    console.log(`✓ capgap 已入台账 ${res.path}`);
    console.log(`  ${res.entry.id} · [${res.entry.slug}/${res.entry.role}] ${res.entry.title}`);
    console.log('  下一步：下沉仍走 Lead 裁决（缺口裁决协议 A/B）——建议在对应 requests.md 留一行指针加速。');
    return;
  }
  if (cmd === 'list') {
    const { path, gaps } = listGaps(root, Number(args.n ?? 20) || 20);
    console.log(`[capgap] 台账 ${path} · ${gaps.length} 条（新→旧）`);
    for (const g of gaps) console.log(`  ${g.at ?? '?'} · ${g.status ?? '?'} · [${g.slug ?? '?'}] ${g.title ?? '(无题)'}`);
    if (!gaps.length) console.log('  （空——没有登记中的缺口）');
    return;
  }
  console.error('用法：node scripts/capgap.mjs add --title "…" --need "…" [--proposal "…"] [--acceptance "…"] [--slug <game|engine>] [--role <角色>] | list [-n 20]');
  process.exit(cmd ? 1 : 0);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
