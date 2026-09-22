#!/usr/bin/env node
// 美术台本孤儿行审计（REQ-ART-可消费槽铁律·owner 2026-07-22·Lead 供引擎件）
// 用法：node scripts/ledger-audit.mjs [<game>|--all] [--json] [--strict]
//   缺省 scope = --all（扫所有带 art-ledger.json 的游戏）。
//
// owner 原则：美术台本（art-ledger.json）里**每一行都必须有真实消费槽**——生成/替换它，
//   游戏里能真的换上。没有消费槽的「孤儿行」= 换了也白换（坑 owner）。本审计把「生成了没处接」
//   变成机器可抓的告警，不再静默。
//
// ── 消费槽的两种合法形态（REQ 明定）───────────────────────────────────
//   ① 编译期游戏：`skinKey`（非空串）——游戏渲染代码按此 resolve 上画面（game-g 110/110=样板）。
//      资产就绪→ art/index.json 别名登记→自动换装；未填→程序化回退（skinKey 仍是消费契约）。
//   ② 数据卡带：manifest 里的 `art:` 引用——replace 步重钉此引用。
//   两者皆无 = 孤儿 = 违规（报 ORPHAN-LEDGER-ROW）。
//
// ── 为何只认这两个契约、不查「游戏代码是否真渲染」──────────────────────
//   实测：game-c 37 行全部经 servedPath 链到自己的 index.json，却仍是 REQ-C-112 认定的孤儿
//   （index 条目存在 ≠ 游戏把它画上屏）；且编译期游戏用模板动态拼 id（game-d `rune/${key}`），
//   静态 grep 无法可靠证明运行时消费。故本审计守的是**可机读的消费契约**（skinKey / manifest art:），
//   不臆测运行时可达性——一行没有 skinKey，就没有可机读的消费键，无论某处代码是否临时把它画出来，
//   那正是 owner 要消灭的「不可验证消费」反模式。game-g 证明契约可达（110/110）。
//
// 判词 token（末行）：`LEDGER-AUDIT: PASS`（scope 内零孤儿）/ `LEDGER-AUDIT: ORPHANS`（有孤儿）。
// 退出码：默认 0（**顾问态·不阻推送**——存量 game-a/c/d 孤儿多，阻断会误伤全员）；
//   `--strict` → 有孤儿即退 1（供某 PE 声明「我这游戏台本已清干净」的单游戏门禁）。

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 读 JSON，失败回 fallback。 */
function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return fallback; }
}

/** 深扫任意结构，收集所有形如 `art:<id>` 的字符串引用 → 归一化 id 集合。 */
export function collectManifestArtRefs(node, out = new Set()) {
  if (typeof node === 'string') {
    if (node.startsWith('art:')) out.add(node.slice(4).trim());
  } else if (Array.isArray(node)) {
    for (const v of node) collectManifestArtRefs(v, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectManifestArtRefs(v, out);
  }
  return out;
}

/** 归一化一行的「manifest art: 目标」候选：优先显式 artRef，其次剥 `art:` 前缀。 */
function rowArtRef(row) {
  const raw = row && typeof row.artRef === 'string' ? row.artRef.trim() : '';
  if (!raw) return '';
  return raw.startsWith('art:') ? raw.slice(4).trim() : raw;
}

/**
 * 单行分类：'skinKey'（编译期契约）| 'manifest-art'（卡带契约）| 'orphan'。
 * @param {object} row  台账行
 * @param {Set<string>} artRefs  该游戏 manifest 内出现的 art: id 集合（无 manifest=空集）
 */
export function classifyRow(row, artRefs = new Set()) {
  if (typeof row?.skinKey === 'string' && row.skinKey.trim()) return 'skinKey';
  const ref = rowArtRef(row);
  if (ref && artRefs.has(ref)) return 'manifest-art';
  return 'orphan';
}

/**
 * 审一款游戏的台账。root 下找 public/games/<game>/art/art-ledger.json（+ 同目录 manifest.json，
 * 或 library/<game>/manifest.json 作卡带契约来源）。返回 { game, total, consumable, orphans[] }。
 * 无台账 → 返回 { game, missing:true }。
 */
export function auditGame(root, game) {
  const ledgerPath = join(root, 'public', 'games', game, 'art', 'art-ledger.json');
  if (!existsSync(ledgerPath)) return { game, missing: true };
  const led = readJson(ledgerPath, null);
  const rows = led && Array.isArray(led.rows) ? led.rows : [];
  // manifest 契约来源：优先游戏本地 manifest.json，其次 library/<game>/manifest.json。
  let artRefs = new Set();
  for (const mp of [join(root, 'public', 'games', game, 'manifest.json'), join(root, 'library', game, 'manifest.json')]) {
    if (existsSync(mp)) { artRefs = collectManifestArtRefs(readJson(mp, {})); break; }
  }
  const orphans = [];
  let consumable = 0;
  for (const row of rows) {
    if (classifyRow(row, artRefs) === 'orphan') {
      orphans.push({ no: row.no ?? '(无编号)', kind: row.kind ?? '', desc: (row.desc ?? '').slice(0, 48) });
    } else {
      consumable += 1;
    }
  }
  return { game, total: rows.length, consumable, orphans, mode: led?.mode ?? '' };
}

/** 发现所有带 art-ledger.json 的游戏（扫 public/games/<游戏>/art/art-ledger.json）。 */
export function discoverGames(root) {
  const dir = join(root, 'public', 'games');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((g) => { try { return statSync(join(dir, g)).isDirectory(); } catch { return false; } })
    .filter((g) => existsSync(join(dir, g, 'art', 'art-ledger.json')))
    .sort();
}

/** 审一批游戏（缺省=discoverGames）。返回结果数组（跳过无台账的）。 */
export function auditAll(root = SCRIPT_ROOT, games = null) {
  const list = games && games.length ? games : discoverGames(root);
  return list.map((g) => auditGame(root, g)).filter((r) => !r.missing);
}

// ── CLI ──────────────────────────────────────────────────────────────
function run(argv) {
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');
  const positional = argv.filter((a) => !a.startsWith('--'));
  const scopeAll = positional.length === 0 || positional.includes('--all');
  const games = scopeAll ? null : positional;

  const results = auditAll(SCRIPT_ROOT, games);
  const totalOrphans = results.reduce((n, r) => n + r.orphans.length, 0);
  const dirtyGames = results.filter((r) => r.orphans.length > 0);
  const verdict = totalOrphans === 0 ? 'PASS' : 'ORPHANS';

  if (json) {
    console.log(JSON.stringify({ verdict, totalOrphans, games: results }, null, 2));
  } else {
    console.log('美术台本孤儿行审计（REQ-ART-可消费槽铁律）\n');
    for (const r of results) {
      const clean = r.orphans.length === 0;
      const head = `${clean ? '✅' : '⚠️ '} ${r.game.padEnd(16)} 行 ${String(r.total).padStart(3)} · 有槽 ${String(r.consumable).padStart(3)} · 孤儿 ${String(r.orphans.length).padStart(3)}${r.mode ? ' · ' + r.mode : ''}`;
      console.log(head);
      for (const o of r.orphans.slice(0, 8)) console.log(`      · ${o.no}${o.kind ? ' [' + o.kind + ']' : ''} ${o.desc}`);
      if (r.orphans.length > 8) console.log(`      …共 ${r.orphans.length} 行孤儿`);
    }
    console.log('');
    if (totalOrphans > 0) {
      console.log(`共 ${totalOrphans} 行孤儿·跨 ${dirtyGames.length} 款游戏：${dirtyGames.map((r) => `${r.game}(${r.orphans.length})`).join('  ')}`);
      console.log('清法（各 PE 逐行二选一）：(a) 接消费槽=编译期加 skinKey + 游戏渲染消费之（背景类用 mountHost sceneBgSkin）；(b) 删/退役=移出台本。');
    }
  }
  console.log(`\nLEDGER-AUDIT: ${verdict}`);
  process.exit(strict && totalOrphans > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
