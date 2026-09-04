// ═══════════════════════════════════════════════════════════════
//  scripts/acceptance-run.mjs —— 验收剧本通用 runner（REQ-ACCEPT·图纸②）
//
//  驱动真引擎逐 step 对账 GD 写的验收剧本。**只经薄适配契约碰游戏，绝不 import 游戏内部模块**；
//  断言只读世界机读态（Resource/Flag/StringVar/组件字段），不读 DOM。失败报告=步号+期望 vs 实际
//  +当步机读态快照（天然 bug 单格式）。同 seed 同轨（确定性）——引擎种子 PRNG 保证。
//
//  薄适配契约（games/<g>/acceptance-adapter.ts·PE 落·纯接线零规则·图纸③）：
//    createWorld(seed, config?) → world     引擎 World（须可 .tick() / .getAllEntities() / .getComponent(id,type)）
//    applySignal(world, signal, args?, by?) 把一条剧本信号翻成引擎输入（action-map/组件写）
//    readWorld(world) → worldLike           读视图（标准游戏＝直接返回 world；纯接线）
//  ——把「读 Resource/Flag/StringVar/组件」的**机读态提取**集中在本 runner（不下放各 PadPE 手写，
//  防提取代码写错反而掩盖断言失败·正是本 harness 要治的「自写自测」病）。
//
//  用法（须走 vite-node·因 import .ts adapter）：
//    npx vite-node scripts/acceptance-run.mjs            全部有 acceptance/ 的游戏
//    npx vite-node scripts/acceptance-run.mjs --game g   只跑该游戏
//  退出码：有 FAIL → 1。
// ═══════════════════════════════════════════════════════════════

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAndValidate, formatErrors } from './acceptance-schema.mjs';

const ROOT = process.env.ZEROCRAFT_ACCEPTANCE_ROOT || process.env.APOLLO_ACCEPTANCE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');

// ── 机读态提取（引擎协议·非游戏内部）───────────────────────────────
/** 扫世界标量容器 → {res:{id:current}, flag:{id:active}, sv:{id:value}}。id 撞名后写覆盖（引擎 R11 语义下 id 唯一）。 */
export function snapshotScalars(worldLike) {
  const res = {}, flag = {}, sv = {};
  for (const id of worldLike.getAllEntities()) {
    const r = worldLike.getComponent(id, 'Resource'); if (r && typeof r.id === 'string') res[r.id] = r.current;
    const f = worldLike.getComponent(id, 'Flag'); if (f && typeof f.id === 'string') flag[f.id] = f.active;
    const s = worldLike.getComponent(id, 'StringVar'); if (s && typeof s.id === 'string') sv[s.id] = s.value;
  }
  return { res, flag, sv };
}

const MISSING = Symbol('missing'); // 目标不存在（与「存在但值为 undefined」区分）

/** 求一条断言的实际值（不比较·只取值）。 */
function actualOf(worldLike, scalars, a) {
  if ('res' in a) return a.res in scalars.res ? scalars.res[a.res] : MISSING;
  if ('flag' in a) return a.flag in scalars.flag ? scalars.flag[a.flag] : MISSING;
  if ('sv' in a) return a.sv in scalars.sv ? scalars.sv[a.sv] : MISSING;
  if ('comp' in a) {
    const c = worldLike.getComponent(a.comp.entity, a.comp.component);
    if (!c || !(a.comp.field in c)) return MISSING;
    return c[a.comp.field];
  }
  return MISSING;
}

/** 断言判定 → {ok, kind, target, op, expected, actual, detail}。actual=MISSING → 目标不存在即 FAIL。 */
export function evaluateAssertion(worldLike, scalars, a) {
  const actual = actualOf(worldLike, scalars, a);
  let kind, target, op, expected;
  if ('res' in a) {
    kind = 'res'; target = a.res;
    op = 'eq' in a ? 'eq' : 'gte' in a ? 'gte' : 'lte';
    expected = a[op];
  } else if ('flag' in a) { kind = 'flag'; target = a.flag; op = 'eq'; expected = a.eq; }
  else if ('sv' in a) { kind = 'sv'; target = a.sv; op = 'eq'; expected = a.eq; }
  else { kind = 'comp'; target = `${a.comp.entity}.${a.comp.component}.${a.comp.field}`; op = 'eq'; expected = a.eq; }

  if (actual === MISSING) {
    return { ok: false, kind, target, op, expected, actual: undefined, detail: `${kind} "${target}" 不存在于世界机读态` };
  }
  let ok;
  if (op === 'eq') ok = actual === expected || (typeof actual === 'object' && JSON.stringify(actual) === JSON.stringify(expected));
  else if (op === 'gte') ok = actual >= expected;
  else ok = actual <= expected; // lte
  return { ok, kind, target, op, expected, actual, detail: ok ? '' : `${kind} "${target}" ${op} ${fmt(expected)} 未过（实际 ${fmt(actual)}）` };
}

const fmt = (v) => JSON.stringify(v);

// ── 单剧本执行 ─────────────────────────────────────────────────
/** 逐 step 驱动。返回 {ok, failures:[…], trace:[…], error?}。
 *  trace=每个 expect step 的标量快照 + 每个 waitUntil step 的等待拍数（供确定性同轨比对）。
 *  failures 带步号/期望/实际/快照（bug 单格式）；waitUntil 超 cap 的另带已等拍数。 */
export function runScenario(adapter, scenario) {
  const failures = [];
  const trace = [];
  let world;
  try {
    world = adapter.createWorld(scenario.seed, scenario.config);
  } catch (e) {
    return { ok: false, failures: [], trace: [], error: `createWorld 抛错: ${e?.message ?? e}` };
  }
  for (let si = 0; si < scenario.steps.length; si++) {
    const step = scenario.steps[si];
    try {
      if ('signal' in step) {
        adapter.applySignal(world, step.signal, step.args, step.by);
      } else if ('tick' in step) {
        if (typeof world.tick !== 'function') throw new Error('world 无 tick()（createWorld 须返回可 tick 的引擎 World）');
        for (let t = 0; t < step.tick; t++) world.tick();
      } else if ('waitUntil' in step) {
        // 条件等待（REQ-WAITUNTIL·owner 判 A）：先查后拍——条件已成立=等 0 拍不动世界；
        // 否则逐拍推进重查，全部断言过即停；到 cap 仍不成立=FAIL（bug 单带已等拍数）。
        if (typeof world.tick !== 'function') throw new Error('world 无 tick()（createWorld 须返回可 tick 的引擎 World）');
        const check = () => {
          const worldLike = adapter.readWorld(world);
          const scalars = snapshotScalars(worldLike);
          return { scalars, results: step.waitUntil.map((a) => evaluateAssertion(worldLike, scalars, a)) };
        };
        let waited = 0;
        let c = check();
        while (c.results.some((r) => !r.ok) && waited < step.cap) {
          world.tick();
          waited++;
          c = check();
        }
        const satisfied = c.results.every((r) => r.ok);
        trace.push({ step: si, waitedTicks: waited, satisfied }); // 等待拍数入轨（同 seed 同轨连它一起比）
        if (!satisfied) {
          c.results.forEach((r, ai) => {
            if (!r.ok) failures.push({ step: si, assertion: ai, ...r, waitedTicks: waited, snapshot: c.scalars });
          });
        }
      } else if ('expect' in step) {
        const worldLike = adapter.readWorld(world);
        const scalars = snapshotScalars(worldLike);
        trace.push({ step: si, snapshot: scalars });
        step.expect.forEach((a, ai) => {
          const r = evaluateAssertion(worldLike, scalars, a);
          if (!r.ok) failures.push({ step: si, assertion: ai, ...r, snapshot: scalars });
        });
      }
    } catch (e) {
      return { ok: false, failures, trace, error: `step #${si} 执行抛错: ${e?.message ?? e}` };
    }
  }
  return { ok: failures.length === 0, failures, trace };
}

/** 失败报告（天然 bug 单：步号 + 期望 vs 实际 + 当步机读态快照）。 */
export function formatScenarioResult(label, file, res = {}) {
  const lines = [];
  if (res.error) {
    lines.push(`FAIL ${label}  [${file}]`);
    lines.push(`  ✗ 运行错误：${res.error}`);
    return lines.join('\n');
  }
  if (res.ok) return `PASS ${label}  [${file}]  (${res.trace?.length ?? 0} 检查点)`;
  lines.push(`FAIL ${label}  [${file}]`);
  for (const f of res.failures ?? []) {
    lines.push(`  ✗ step #${f.step} · 断言[${f.assertion}]（${f.kind} ${f.target}）`);
    if (f.waitedTicks !== undefined) lines.push(`      等待：waitUntil 已等 ${f.waitedTicks} 拍（封顶）仍未成立`);
    lines.push(`      期望：${f.op} ${fmt(f.expected)}`);
    lines.push(`      实际：${f.actual === undefined ? '（不存在）' : fmt(f.actual)}`);
    lines.push(`      当步机读态：${JSON.stringify(f.snapshot)}`);
  }
  return lines.join('\n');
}

// ── 发现 / 装载 ────────────────────────────────────────────────
const acceptanceDir = (root, slug) => join(root, 'docs', 'design', slug, 'acceptance');
const adapterPath = (root, slug) => join(root, 'games', slug, 'acceptance-adapter.ts');

/** 有 acceptance/*.scenario.jsonc 的游戏 slug 列表。 */
export function discoverGamesWithAcceptance(root) {
  const base = join(root, 'docs', 'design');
  if (!existsSync(base)) return [];
  const out = [];
  for (const slug of readdirSync(base).sort()) {
    const dir = acceptanceDir(root, slug);
    if (existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.scenario.jsonc'))) out.push(slug);
  }
  return out;
}

/** 列一个游戏的剧本文件（绝对路径 + 相对名）。 */
export function listScenarioFiles(root, slug) {
  const dir = acceptanceDir(root, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.scenario.jsonc')).sort()
    .map((f) => ({ name: f, path: join(dir, f) }));
}

/** 动态装载 adapter（named 或 default·须齐 createWorld/applySignal/readWorld）→ 规整对象 or 抛错。 */
export async function loadAdapter(root, slug) {
  const p = adapterPath(root, slug);
  if (!existsSync(p)) throw new Error(`缺 adapter: games/${slug}/acceptance-adapter.ts（PE 未落薄适配契约）`);
  const mod = await import(pathToFileURL(p).href);
  const a = mod.default && typeof mod.default === 'object' ? { ...mod.default, ...mod } : mod;
  for (const fn of ['createWorld', 'applySignal', 'readWorld']) {
    if (typeof a[fn] !== 'function') throw new Error(`adapter 缺 ${fn}()（契约须齐 createWorld/applySignal/readWorld）`);
  }
  return a;
}

/** 跑一个游戏全部剧本 → {slug, ok, error?, scenarios:[{name,file,ok,res}]}。 */
export async function runGame(root, slug) {
  const files = listScenarioFiles(root, slug);
  if (!files.length) return { slug, ok: true, scenarios: [], note: '无剧本' };
  let adapter;
  try {
    adapter = await loadAdapter(root, slug);
  } catch (e) {
    return { slug, ok: false, error: e?.message ?? String(e), scenarios: files.map((f) => ({ name: f.name, file: f.path, ok: false })) };
  }
  const scenarios = [];
  let allOk = true;
  for (const f of files) {
    const pv = parseAndValidate(readFileSync(f.path, 'utf8'));
    if (!pv.ok) {
      allOk = false;
      scenarios.push({ name: f.name, file: f.path, ok: false, schemaErrors: pv.errors });
      continue;
    }
    if (pv.value.game !== slug) {
      allOk = false;
      scenarios.push({ name: f.name, file: f.path, ok: false, res: { error: `剧本 game 字段=${JSON.stringify(pv.value.game)} 与目录 slug=${slug} 不符` } });
      continue;
    }
    const res = runScenario(adapter, pv.value);
    if (!res.ok) allOk = false;
    scenarios.push({ name: pv.value.name, file: f.path, ok: res.ok, res });
  }
  return { slug, ok: allOk, scenarios };
}

// ── CLI ────────────────────────────────────────────────────────
// 走 vite-node 时 argv 会剥掉脚本名（argv=[node, vite-node, …scriptArgs]）→ 标准 argv[1] 判 main 失效。
// 本脚本唯一的 import 方是 vitest（acceptance.test.mjs）；gate 是**另起进程 spawn** 而非 import。
// 故：非 vitest 环境（VITEST 未置）即视为 CLI 直跑 → 跑 main。（game-pipeline.mjs 不 import 本模块·自带计数。）
// Lead 验收加固：VITEST 变量会**穿透嵌套 spawn**（vitest 里跑 gate CLI → 传染进本子进程 → 误判被
// import → 静默退 0 = conformance 假绿）。gate spawn 时显式传 ZEROCRAFT_ACCEPTANCE_CLI=1（旧名
// APOLLO_ACCEPTANCE_CLI 过渡期仍读）握手，见之无条件跑 main——假绿路径封死；vitest 真 import
// 本模块时无此变量，照旧惰性。
const forceCli = process.env.ZEROCRAFT_ACCEPTANCE_CLI === '1' || process.env.APOLLO_ACCEPTANCE_CLI === '1';
const underVitest = !forceCli && (!!process.env.VITEST || !!process.env.VITEST_WORKER_ID);
if (!underVitest) {
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--game');
  const only = gi >= 0 ? argv[gi + 1] : undefined;

  if (only) {
    // --game g：指名单跑。零剧本=红（你明确要验的游戏没有可验的剧本）。
    if (!listScenarioFiles(ROOT, only).length) {
      console.log(`无剧本：docs/design/${only}/acceptance/*.scenario.jsonc（该游戏尚无验收剧本·S4 门要 ≥3）`);
      process.exit(1);
    }
  } else if (!discoverGamesWithAcceptance(ROOT).length) {
    console.log('无任何游戏含 acceptance/ 剧本目录（各 PE/GD 随 S4 落·此时中性通过）');
    process.exit(0);
  }

  const slugs = only ? [only] : discoverGamesWithAcceptance(ROOT);
  let failed = 0;
  for (const slug of slugs) {
    const g = await runGame(ROOT, slug);
    console.log(`── ${slug} ──`);
    if (g.error) { console.log(`  ✗ ${g.error}`); failed++; continue; }
    if (!g.scenarios.length) { console.log('  （无剧本）'); continue; }
    for (const s of g.scenarios) {
      if (s.schemaErrors) {
        console.log(`FAIL ${s.name}  [坏剧本·schema]`);
        console.log(formatErrors(s.schemaErrors));
      } else {
        console.log(formatScenarioResult(s.name, s.file, s.res));
      }
    }
    if (!g.ok) failed++;
  }
  console.log(`\nACCEPTANCE: ${failed ? 'FAIL' : 'PASS'} · ${slugs.length} 游戏 · ${failed} 家有红`);
  process.exit(failed ? 1 : 0);
}
