// asset-reconcile —— 资产三方对账：引用(intra-data key refs) ↔ 登记(index.json) ↔ 磁盘(files)。
// REQ-PA-工坊工位四件 ③（M1 数据面前置）。确定性、零网络、零外部依赖（node 内建）。
//
// 三类 finding（行 schema：位置 | 期望 | 实际）：
//   · dangling-file（FAIL）：index 条目登记了文件(path)，但磁盘上没有 → 引用断到磁盘。
//   · orphan-file  （WARN）：磁盘上有文件，但没有任何 index 条目登记它 → 孤儿磁盘文件（cruft）。
//   · dangling-key （FAIL）：材质/贴图 spec 的贴图键(map/normalMap…)或 provenance.vendoredFrom
//                           指向一个不在册的资产 id → 登记内部引用悬空。
//
// 判词 token：RECONCILE: PASS | WARNINGS | FAIL（照 docs-ref-guard 模式）。退出码：有 FAIL=1，否则 0。
// 用法：node scripts/asset-reconcile.mjs [<game> | --all | --shared] [--json]
//   默认 --all = 所有游戏本地库 + 共享货架。--json 出结构化（M1 报表直接吃）。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 材质等数据型资产的贴图键 + vendoredFrom：都引用「另一条资产 id」，是 spec 内部引用。
const KEY_FIELDS = ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap', 'emissiveMap', 'ormMap'];
// 游戏目录名闭集：`game-<slug>`（game-a/game-103…）或无连字符 `game<digits>`（game101/game102…）。
// REQ-ARTPIPE2 A1④：原正则死认连字符（`/^game-[a-z0-9]+$/`），漏了 game101/game102（侦察在案的盲区）。
const GAME_NAME_RE = /^game-?[a-z0-9]+$/;

function readIndex(file) {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; }
  catch (e) { return { _err: String(e) }; }
}

// 递归列 baseDir 下所有文件（相对路径·/ 分隔）；skip = 相对目录/文件前缀白名单。
function listFiles(baseDir, skip = []) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const rel = relative(baseDir, p).split('\\').join('/');
      if (skip.some((s) => rel === s || rel.startsWith(s + '/'))) continue;
      if (statSync(p).isDirectory()) walk(p);
      else out.push(rel);
    }
  };
  walk(baseDir);
  return out;
}

// 对账一个 scope（一个 index ↔ 一个磁盘目录）。
//   publicDir  = 站点根（`/…` 绝对 served 路径解析基准）；baseDir = 相对路径解析基准（共享货架=assets/）。
//   diskDir/servedPrefix/skipDirs 供「磁盘孤儿文件」扫描（仅扫该 scope 标准目录·best-effort）。
//   sharedIds = 跨 scope 可引用的共享 id 集（贴图键/vendoredFrom 可指共享货架）。
function reconcileScope({ label, indexFile, diskDir, servedPrefix, skipDirs, sharedIds, publicDir, baseDir }) {
  const idx = readIndex(indexFile);
  if (idx === null) return { label, skipped: true, reason: '无 index', findings: [] };
  if (idx._err) return { label, skipped: true, reason: idx._err, findings: [] };
  const findings = [];
  const localIds = new Set(idx.assets.map((a) => a.id));
  const known = (id) => localIds.has(id) || (sharedIds && sharedIds.has(id));
  const registered = new Set(); // 被登记、且落在本 scope diskDir 下的磁盘相对路径

  for (const a of idx.assets) {
    // ① 文件登记 ↔ 磁盘（只查已填 filled；tbf/placeholder 合法无文件，不算断链）
    if (a.type !== 'material' && a.status === 'filled') {
      if (!a.path) {
        findings.push({ type: 'dangling-file', severity: 'fail', 位置: `${label}:${a.id}`, 期望: 'path 字段（filled 非材质应有文件）', 实际: '缺 path' });
      } else {
        // 站点绝对 /… → 相对站点根 public/；相对 → 相对 baseDir（共享 assets/）。
        const abs = a.path.startsWith('/') ? join(publicDir, a.path) : join(baseDir, a.path);
        if (!existsSync(abs)) findings.push({ type: 'dangling-file', severity: 'fail', 位置: `${label}:${a.id}`, 期望: a.path, 实际: '磁盘无此文件' });
        // 孤儿扫描登记：仅当文件落在本 scope diskDir 下才计入（否则文件在别处·不归本 scope 孤儿空间）。
        if (servedPrefix && a.path.startsWith(servedPrefix)) registered.add(a.path.slice(servedPrefix.length));
        else if (!servedPrefix) registered.add(a.path.replace(/^\//, ''));
      }
    }
    // ② spec 内部键引用 ↔ 登记
    const spec = a.spec || {};
    for (const f of KEY_FIELDS) {
      const k = spec[f];
      if (typeof k === 'string' && k && !known(k)) findings.push({ type: 'dangling-key', severity: 'fail', 位置: `${label}:${a.id}.${f}`, 期望: `已登记资产 id「${k}」`, 实际: '登记里无此 key' });
    }
    const vf = a.provenance && a.provenance.vendoredFrom;
    // vendoredFrom 指向共享货架源 id（本地 scope 里通常不在册·只在共享）——仅当既不在本地也不在共享才算悬空。
    if (typeof vf === 'string' && vf && sharedIds && !sharedIds.has(vf) && !localIds.has(vf)) {
      findings.push({ type: 'dangling-key', severity: 'warn', 位置: `${label}:${a.id}.provenance.vendoredFrom`, 期望: `共享货架源 id「${vf}」`, 实际: '共享货架无此源(可能已下架)' });
    }
  }

  // ③ 磁盘 ↔ 登记：孤儿文件（跳过 index/台账/待审清单/文档等非资产文件）
  const NON_ASSET = (f) => {
    const base = f.split('/').pop();
    if (base.startsWith('.')) return true; // .gitkeep 等占位/隐藏文件
    return base === 'index.json' || base.endsWith('.md') || base.endsWith('-art-ledger.json') || base === 'art-ledger.json' || base === 'style-ledger.json' || base === 'pending.json';
  };
  for (const rel of listFiles(diskDir, skipDirs)) {
    if (NON_ASSET(rel)) continue;
    if (!registered.has(rel)) findings.push({ type: 'orphan-file', severity: 'warn', 位置: `${label}:${rel}`, 期望: '被某 index 条目登记', 实际: '孤儿磁盘文件（无登记）' });
  }
  return { label, skipped: false, count: idx.assets.length, findings };
}

// 收集所有 scope。sharedIds 供各游戏 scope 校验贴图键/vendoredFrom 时查共享货架。
export function reconcile({ root = ROOT, scope = 'all' } = {}) {
  const publicDir = join(root, 'public');
  const assetsDir = join(root, 'assets');
  const sharedIndex = readIndex(join(assetsDir, 'index.json'));
  const sharedIds = new Set((sharedIndex && !sharedIndex._err ? sharedIndex.assets : []).map((a) => a.id));
  const scopes = [];

  const wantShared = scope === 'all' || scope === 'shared';
  const wantGames = scope === 'all' || scope === 'games' || (scope !== 'shared' && GAME_NAME_RE.test(scope));

  if (wantShared) {
    scopes.push({
      label: 'shared', indexFile: join(assetsDir, 'index.json'), diskDir: assetsDir,
      servedPrefix: null, skipDirs: ['FreeArtLib', 'curated'], sharedIds, publicDir, baseDir: assetsDir,
    });
  }
  if (wantGames) {
    const gamesDir = join(root, 'public', 'games');
    const games = existsSync(gamesDir) ? readdirSync(gamesDir).filter((g) => GAME_NAME_RE.test(g)) : [];
    for (const g of games) {
      if (GAME_NAME_RE.test(scope) && scope !== g) continue;
      const artDir = join(gamesDir, g, 'art');
      if (!existsSync(join(artDir, 'index.json'))) continue;
      scopes.push({
        label: g, indexFile: join(artDir, 'index.json'), diskDir: artDir,
        servedPrefix: `/games/${g}/art/`, skipDirs: ['ai/pending'], sharedIds, publicDir, baseDir: artDir,
      });
    }
  }

  const results = scopes.map(reconcileScope);
  const findings = results.flatMap((r) => r.findings);
  const fails = findings.filter((f) => f.severity === 'fail').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const verdict = fails > 0 ? 'FAIL' : warns > 0 ? 'WARNINGS' : 'PASS';
  return { results, findings, fails, warns, verdict };
}

function run(argv) {
  const asJson = argv.includes('--json');
  const scopeArg = argv.includes('--shared') ? 'shared'
    : argv.includes('--games') ? 'games'
    : (argv.find((a) => GAME_NAME_RE.test(a)) || 'all');
  const r = reconcile({ scope: scopeArg });
  if (asJson) { console.log(JSON.stringify(r, null, 2)); process.exit(r.fails > 0 ? 1 : 0); }

  const scanned = r.results.filter((s) => !s.skipped).map((s) => s.label);
  console.log(`asset-reconcile: 对账 ${scanned.length} 个 scope（${scanned.join(', ') || '(无)'}）`);
  for (const s of r.results.filter((x) => x.skipped)) console.log(`  跳过 ${s.label}：${s.reason}`);
  for (const f of r.findings) {
    const tag = f.severity === 'fail' ? '✗' : '·';
    console.log(`  ${tag} [${f.type}] ${f.位置}\n      期望 ${f.期望} | 实际 ${f.实际}`);
  }
  console.log(`\nRECONCILE: ${r.verdict}` + (r.findings.length ? `（${r.fails} 断链 / ${r.warns} 警告）` : '（三方一致）'));
  process.exit(r.fails > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
