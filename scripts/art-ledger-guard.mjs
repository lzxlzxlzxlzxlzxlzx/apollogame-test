#!/usr/bin/env node
// scripts/art-ledger-guard.mjs —— 美术台账强制守卫（REQ-ARTPIPE2 A1 · Lead 施工 2026-08-05）
//
// 逐游戏三判：
//   · 黑户（black household）——美术目录有文件，台账任何行都没提到它（连历史/占位路径都没提）。
//   · 死账（dead ledger row）——行的「当前真相」路径（`gen.servedPath`）指向的文件磁盘上不存在。
//   · 缺来源（missing provenance）——行已产出真文件（`gen.servedPath` 非空）、来源非程序化
//     （procedural），却没有 `provenance` 字段。
//
// ── servedPath 为真相（不假设标准目录树）───────────────────────────────
// 大多数游戏台账落在 `public/games/<game>/art/**`，但 game-d 历史遗留把真文件放在
// `public/art/game-d/**`（完全另一棵树）。本守卫不认「游戏=固定目录」，而是从台账行自己
// 携带的 servedPath 反推「这个游戏的美术真的散在哪些目录」，标准目录之外只要行 servedPath
// 指过去，那棵树也纳入黑户扫描——game-d 83 行零误判即靠这条。
//
// 黑户判定看「这份文件有没有被**任意**一行、**任意**一个 servedPath 字段提到过」（gen/ref/
// orig.gen/placeholder 等——凡叫 servedPath 的字段深扫全收），不局限于「当前真相」那一个字段；
// 死账判定则严格只看 `gen.servedPath`（当前真相），历史/占位路径失效不算死账。
// 备份目录 `orig/`（人工替换前的原图备份）不参与黑户扫描——它是台账自己的历史记录，不是散件。
//
// ── 判据②：索引记账同信任级（REQ-ARTGUARD · Lead 裁 2026-08-16）─────────
// 只认台账 servedPath 会把「记账在 art/index.json、不在需求台账」的合法 vendored 资产
// （game-a 55 张 CC0 扑克等 60 件）永久判成黑户——判词长期钉死 WARN、真信号被噪声淹没。
// 故文件不算黑户当满足其一：
//   ① 被台账任意行任意 servedPath 提到（原规则不变）；
//   ② 在该游戏 `art/index.json` 有 `path` 命中的条目**且有来源登记**——
//      `provenance` 对象存在 或 `license`+`source` 双齐。
// 认索引记账与台账同信任级（伪造索引条目与伪造台账行同罪·须留 license/source 痕迹）；
// 只挂 path 不留来源登记的索引条目**不免罪**——仍是黑户。
//
// ── 棘轮基线 ─────────────────────────────────────────────────────────
// `scripts/art-ledger-baseline.json` 记录「已知黑户」（存量挂账，允许暂不清）。新出现、不在
// 基线内的黑户 = 棘轮违规（真正拦推送的唯一条件）；死账/缺来源/基线内黑户 = 警告（进 JSON 供
// A2 浏览器徽标，不拦）。
//
// 退出码：0 = 全净（零任何发现）；1 = 棘轮违规（新增黑户）——硬拦；2 = 有发现但无棘轮违规——警告。
// 判词 token：`ART-LEDGER-GUARD: PASS|WARN|FAIL`。
//
// 用法：node scripts/art-ledger-guard.mjs [<game> ...] [--json]
//   缺省 scope = 所有带 `public/games/<game>/art/` 目录的游戏。

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { artRoot } from './art-paths.mjs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── 基础工具 ─────────────────────────────────────────────────────────

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

/** 读一款游戏的 art-ledger.json（缺失/解析失败 → 空台账 + missing 标记，不抛错）。 */
export function readLedger(root, game) {
  const p = join(artRoot(root, game), 'art-ledger.json');
  if (!existsSync(p)) return { rows: [], pending: [], missing: true };
  const parsed = readJson(p, null);
  if (!parsed) return { rows: [], pending: [], missing: true, error: 'parse-error' };
  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    missing: false,
  };
}

const allRows = (ledger) => [...(ledger.rows || []), ...(ledger.pending || [])];

/** servedPath → 站点根下的绝对磁盘路径（servedPath 总以 `/` 开头，站点根=public/）。 */
export function resolveServedPath(root, servedPath) {
  return join(root, 'public', servedPath.replace(/^\/+/, ''));
}

/** 深扫一行台账，收集**所有**叫 `servedPath` 的字段值（不管嵌在 gen/ref/orig.gen/placeholder 哪层）。 */
export function collectRowServedPaths(row, out = new Set()) {
  if (row && typeof row === 'object') {
    for (const [k, v] of Object.entries(row)) {
      if (k === 'servedPath' && typeof v === 'string' && v) out.add(v);
      else if (v && typeof v === 'object') collectRowServedPaths(v, out);
    }
  }
  return out;
}

function isProceduralSource(row) {
  const src = String(row?.gen?.source ?? row?.gen?.provider ?? '').toLowerCase();
  return src.includes('procedural');
}

// ── 死账 / 缺来源（只看 `gen.servedPath` = 当前真相）───────────────────

/** 死账行：`gen.servedPath` 非空但磁盘无此文件。 */
export function deadAccountRows(root, ledger) {
  const out = [];
  for (const row of allRows(ledger)) {
    const sp = row?.gen?.servedPath;
    if (typeof sp !== 'string' || !sp) continue;
    if (!existsSync(resolveServedPath(root, sp))) out.push({ no: row.no ?? '(无编号)', servedPath: sp });
  }
  return out;
}

/** 缺来源行：已产出真文件（`gen.servedPath` 非空）、来源非 procedural、无 `provenance`。 */
export function missingProvenanceRows(ledger) {
  const out = [];
  for (const row of allRows(ledger)) {
    const sp = row?.gen?.servedPath;
    if (typeof sp !== 'string' || !sp) continue;
    if (isProceduralSource(row)) continue;
    if (row.provenance) continue;
    out.push({ no: row.no ?? '(无编号)', servedPath: sp });
  }
  return out;
}

// ── 判据②：art/index.json 索引记账（带来源登记才免罪）────────────────────

/** 读一款游戏的 art/index.json 资产索引（缺失/解析失败 → 空资产表，不抛错）。 */
export function readArtIndex(root, game) {
  const parsed = readJson(join(artRoot(root, game), 'index.json'), null);
  return { assets: Array.isArray(parsed?.assets) ? parsed.assets : [] };
}

/** 索引条目「有来源登记」：`provenance` 对象存在 或 `license`+`source` 双齐（非空字符串）。 */
export function indexEntryHasProvenance(entry) {
  if (entry?.provenance && typeof entry.provenance === 'object') return true;
  return typeof entry?.license === 'string' && entry.license.trim() !== ''
    && typeof entry?.source === 'string' && entry.source.trim() !== '';
}

/** 判据② covered 集：索引中 `path` 非空**且有来源登记**的条目的 path（无登记条目不入集）。 */
export function indexCoveredPaths(index) {
  const out = new Set();
  for (const e of index?.assets || []) {
    if (typeof e?.path === 'string' && e.path && indexEntryHasProvenance(e)) out.add(e.path);
  }
  return out;
}

// ── 黑户（扫磁盘文件 ↔ 台账任意 servedPath / 带来源的索引 path 提及过）────

const NON_ASSET_NAME = (base) =>
  base.startsWith('.') ||
  base === 'index.json' || base === 'art-ledger.json' || base === 'style-ledger.json' || base === 'pending.json' ||
  base.endsWith('-art-ledger.json') || base.endsWith('.md');

// 备份/暂存目录（相对扫描根的路径前缀）——台账自己的历史记录，不算散件。
const SKIP_DIR_PREFIXES = ['orig', 'ai/pending'];

/** 递归列 absDir 下的资产文件 → 站点 servedPath 字符串数组（`${servedPrefix}/a/b.png`）。 */
export function listArtFiles(absDir, servedPrefix) {
  const out = [];
  const walk = (dir, segs) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      let isDir;
      try { isDir = statSync(p).isDirectory(); } catch { continue; }
      const relSegs = [...segs, name];
      const rel = relSegs.join('/');
      if (isDir) {
        if (SKIP_DIR_PREFIXES.some((s) => rel === s || rel.startsWith(s + '/'))) continue;
        walk(p, relSegs);
      } else {
        if (NON_ASSET_NAME(name)) continue;
        out.push(`${servedPrefix}/${rel}`);
      }
    }
  };
  walk(absDir, []);
  return out;
}

/**
 * 一款游戏要扫哪些磁盘目录：标准目录 `public/games/<game>/art` 恒扫；台账行 servedPath 里
 * 出现的、落在标准目录之外的 `/<段>/<game>(/...)` 前缀，各自额外加一棵（game-d 非标路径靠此发现）。
 */
export function discoverArtRoots(root, game, ledger) {
  const standardPrefix = `/games/${game}/art`;
  const roots = new Map([[artRoot(root, game), standardPrefix]]); // 卡带 → library/<slug>/art（REQ-CARTART）
  const gameRe = new RegExp(`^(/[^/]+/${game.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(/|$)`);
  for (const row of allRows(ledger)) {
    for (const sp of collectRowServedPaths(row)) {
      if (sp === standardPrefix || sp.startsWith(standardPrefix + '/')) continue;
      const m = sp.match(gameRe);
      if (!m) continue;
      const prefix = m[1];
      const abs = join(root, 'public', ...prefix.split('/').filter(Boolean));
      if (!roots.has(abs)) roots.set(abs, prefix);
    }
  }
  return [...roots.entries()].map(([dir, servedPrefix]) => ({ dir, servedPrefix }));
}

/** 黑户文件列表（servedPath 风格字符串·排序）：磁盘有、台账任何行任何 servedPath 都没提过、
 * art/index.json 里也没有带来源登记的 path 条目（判据②·REQ-ARTGUARD）。 */
export function blackHouseholdFiles(root, game, ledger, index = readArtIndex(root, game)) {
  const covered = new Set();
  for (const row of allRows(ledger)) for (const sp of collectRowServedPaths(row)) covered.add(sp);
  for (const sp of indexCoveredPaths(index)) covered.add(sp); // 判据②：索引记账（带来源）同免
  const found = [];
  for (const { dir, servedPrefix } of discoverArtRoots(root, game, ledger)) {
    for (const sp of listArtFiles(dir, servedPrefix)) {
      if (!covered.has(sp)) found.push(sp);
    }
  }
  return found.sort();
}

// ── 发现游戏 + 单游戏/批量审计 ───────────────────────────────────────

/** 有 `art/` 目录的游戏：内置 `public/games/<game>/art/` + 卡带 `library/<slug>/art/`
 * （REQ-CARTART：卡带美术归位到 library 后，不并进来会让全部卡带台账变成"不存在"而漏审）。
 * 不要求已有台账——零台账游戏正是本守卫要抓的。 */
export function discoverGames(root) {
  const found = new Set();
  for (const [dir, sub] of [[join(root, 'public', 'games'), 'art'], [join(root, 'library'), 'art']]) {
    if (!existsSync(dir)) continue;
    for (const g of readdirSync(dir)) {
      try { if (statSync(join(dir, g, sub)).isDirectory()) found.add(g); } catch { /* 非目录/无权限 → 跳过 */ }
    }
  }
  return [...found].sort();
}

export function auditGame(root, game) {
  const ledger = readLedger(root, game);
  return {
    game,
    ledgerMissing: !!ledger.missing,
    blackHouseholds: blackHouseholdFiles(root, game, ledger),
    deadAccounts: deadAccountRows(root, ledger),
    missingProvenance: missingProvenanceRows(ledger),
  };
}

export function auditAll(root = ROOT, games = null) {
  const list = games && games.length ? games : discoverGames(root);
  return list.map((g) => auditGame(root, g));
}

// ── 棘轮基线 ─────────────────────────────────────────────────────────

export function loadBaseline(root = ROOT) {
  const p = join(root, 'scripts', 'art-ledger-baseline.json');
  const parsed = readJson(p, null);
  return parsed && typeof parsed === 'object' ? parsed : { blackHouseholds: {} };
}

/** 新黑户（不在基线内）→ 违规。基线内黑户/已被台账消化的旧黑户都不算违规（后者棘轮只紧不松靠人工维护基线）。 */
export function ratchetCheck(baseline, results) {
  const violations = {};
  for (const r of results) {
    const known = new Set(baseline.blackHouseholds?.[r.game] || []);
    const news = r.blackHouseholds.filter((f) => !known.has(f));
    if (news.length) violations[r.game] = news;
  }
  return { ok: Object.keys(violations).length === 0, violations };
}

// ── CLI ──────────────────────────────────────────────────────────────

function run(argv) {
  const asJson = argv.includes('--json');
  // --root <dir>：审计根注入（hermetic 测试用临时仓·退出码矩阵 CLI 腿 2026-08-24）。
  // 缺省（不带 --root）= ROOT（脚本位置推导的真仓根），行为与加参前逐字节一致——测试钉住这条。
  const ri = argv.indexOf('--root');
  const root = ri >= 0 ? resolve(argv[ri + 1]) : ROOT;
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1));
  const games = positional.length ? positional : null;

  const results = auditAll(root, games);
  const baseline = loadBaseline(root);
  const ratchet = ratchetCheck(baseline, results);

  const totalBH = results.reduce((n, r) => n + r.blackHouseholds.length, 0);
  const totalDA = results.reduce((n, r) => n + r.deadAccounts.length, 0);
  const totalMP = results.reduce((n, r) => n + r.missingProvenance.length, 0);
  const hasFindings = totalBH + totalDA + totalMP > 0;

  const verdict = !ratchet.ok ? 'FAIL' : hasFindings ? 'WARN' : 'PASS';
  const exitCode = !ratchet.ok ? 1 : hasFindings ? 2 : 0;

  if (asJson) {
    console.log(JSON.stringify({
      verdict, exitCode, ratchetOk: ratchet.ok, ratchetViolations: ratchet.violations,
      totals: { blackHouseholds: totalBH, deadAccounts: totalDA, missingProvenance: totalMP },
      games: results,
    }, null, 2));
    process.exit(exitCode); // 纯 JSON（A2 浏览器徽标喂料）——不追加判词行，末尾就是合法 JSON。
  } else {
    console.log('美术台账强制守卫（REQ-ARTPIPE2 A1）\n');
    console.log(`${'game'.padEnd(14)}黑户   死账   缺来源`);
    for (const r of results) {
      const tag = r.ledgerMissing ? ' (无台账)' : '';
      console.log(`${r.game.padEnd(14)}${String(r.blackHouseholds.length).padEnd(7)}${String(r.deadAccounts.length).padEnd(7)}${String(r.missingProvenance.length)}${tag}`);
    }
    if (!ratchet.ok) {
      console.log('\n❌ 棘轮违规（新增黑户·不在基线内）：');
      for (const [g, files] of Object.entries(ratchet.violations)) {
        console.log(`  ${g}（${files.length} 个）：`);
        for (const f of files.slice(0, 10)) console.log(`    · ${f}`);
        if (files.length > 10) console.log(`    …共 ${files.length} 个`);
      }
    }
    if (totalDA > 0) {
      console.log('\n死账（行 gen.servedPath 指路径磁盘无文件）：');
      for (const r of results) for (const d of r.deadAccounts) console.log(`  · ${r.game} ${d.no}: ${d.servedPath}`);
    }
    if (totalMP > 0) {
      console.log('\n缺来源（已产出行无 provenance）：');
      for (const r of results) for (const m of r.missingProvenance) console.log(`  · ${r.game} ${m.no}: ${m.servedPath}`);
    }
  }
  console.log(`\nART-LEDGER-GUARD: ${verdict}`);
  process.exit(exitCode);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) run(process.argv.slice(2));
