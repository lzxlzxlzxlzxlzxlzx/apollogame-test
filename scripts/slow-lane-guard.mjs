#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  slow-lane-guard —— 慢车道点名补跑守卫（S18PANEL 交回件①·Lead 2026-08-18 裁 B 案）
//
//  病：快车道 vite.config DEEP_GLOBS 排除了 6 个测试目标——改了它们的被测物也没人跑，
//  「写了测试没人跑」三次咬人（game-103 adapter 红藏多日 / dokiworld 测试无门 / deepTests 初版被打回）。
//  初版 deepTests 被复查打回的原因不是方向而是「把存量红接成推送硬闸」——
//  本版 = art-ledger-guard 同款**警告态基线棘轮**：
//    · 目标红 且 不在基线 → 硬 FAIL（新红·退出码 1）
//    · 目标红 且 在基线   → WARN 放行（点名 reason/ticket·响亮不静默）
//    · 目标绿 且 在基线   → 硬 FAIL「降基线仪式」（同提交删基线条目·棘轮只紧不松）
//  基线 = scripts/slow-lane-baseline.json·条目须 approvedBy:"LEAD"+date+reason+ticket 四字段。
//  触发 = scoped-gate 面机制（改哪个目标的被测物跑哪个目标·不给无关改动加时长）；
//  全库兜底 = 主程每日巡检跑 `node scripts/slow-lane-guard.mjs`（无参=全部目标）。
// ═══════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 目标表 = vite.config.ts DEEP_GLOBS 的逐一镜像（改那边必须同步这里·测试有对账锚）。
 *  subjects = 被测物（scoped-gate 面触发依据：改动命中 subjects 或测试文件本身 → 跑该目标）。 */
export const SLOW_TARGETS = [
  { id: 'game-f', test: 'games/game-f/', subjects: ['games/game-f/'] },
  { id: 'flow-walk', test: 'games/game-g/flow-walk.test.ts', subjects: ['games/game-g/'] },
  { id: 'flow-walk-211', test: 'games/game211/flow-walk.test.ts', subjects: ['games/game211/'] },
  { id: 'pathfind-scale', test: 'games/game211/pathfind-scale.bench.test.ts', subjects: ['games/game211/', 'src/skills/tier2/pathfind.ts', 'src/skills/tier2/flow-field.ts', 'src/skills/tier2/flow-field-core.ts'] },
  { id: 'slg-scale', test: 'games/game211/slg-scale.bench.test.ts', subjects: ['games/game211/', 'src/skills/tier2/flow-field.ts', 'src/skills/tier2/flow-field-core.ts'] },
  { id: 'manifest-check', test: 'scripts/manifest-check.test.mjs', subjects: ['scripts/manifest-check.mjs', 'library/'] },
  { id: 'acceptance', test: 'scripts/acceptance.test.mjs', subjects: ['scripts/acceptance-run.mjs', 'scripts/acceptance-schema.mjs'] },
  { id: 'game-pipeline', test: 'scripts/game-pipeline.test.mjs', subjects: ['scripts/game-pipeline.mjs', 'scripts/pipeline-orchestrator.mjs'] },
  { id: 'audit-ratchet', test: 'scripts/audit-ratchet.test.mjs', subjects: ['scripts/game-skill-audit.mjs', 'scripts/audit-baseline.json'] },
];

/** 纯判定（供测试·不起进程）：results=[{id, pass}]，baseline=[{target,reason,ticket,approvedBy,date}]。 */
export function classify(results, baseline) {
  const base = new Map(baseline.map((b) => [b.target, b]));
  const badBase = baseline.filter((b) => !(b.approvedBy === 'LEAD' && b.date && b.reason && b.ticket));
  const newRed = results.filter((r) => !r.pass && !base.has(r.id));
  const knownRed = results.filter((r) => !r.pass && base.has(r.id));
  const staleGreen = results.filter((r) => r.pass && base.has(r.id));
  return {
    verdict: badBase.length || newRed.length || staleGreen.length ? 'FAIL' : knownRed.length ? 'WARN' : 'PASS',
    badBase, newRed, knownRed, staleGreen,
  };
}

function runTarget(t) {
  const r = spawnSync('npx', ['vitest', 'run', t.test], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ZEROCRAFT_DEEP: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { id: t.id, pass: r.status === 0, tail: (r.stdout || '').split('\n').filter((l) => /Tests|failed/.test(l)).slice(-2).join(' · ') };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = want.length ? SLOW_TARGETS.filter((t) => want.includes(t.id)) : SLOW_TARGETS;
  const unknown = want.filter((w) => !SLOW_TARGETS.some((t) => t.id === w));
  if (unknown.length) {
    console.error(`SLOW-LANE: FAIL —— 未知目标 ${unknown.join(', ')}（合法：${SLOW_TARGETS.map((t) => t.id).join(', ')}）`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(join(ROOT, 'scripts/slow-lane-baseline.json'), 'utf8')).knownRed;
  console.log(`── slow-lane-guard ── 目标：${targets.map((t) => t.id).join(', ')}`);
  const results = targets.map((t) => {
    const r = runTarget(t);
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.id}  ${r.tail}`);
    return r;
  });
  const c = classify(results, baseline);
  for (const b of c.badBase) console.error(`  ✗ 基线条目 "${b.target}" 缺 approvedBy:"LEAD"/date/reason/ticket ——豁免须 Lead 亲批·不得自写`);
  for (const r of c.newRed) console.error(`  ✗ 新红：${r.id} 不在基线——修红，或走 requests.md 请 Lead 亲批入基线`);
  for (const r of c.knownRed) console.warn(`  ⚠ 在案红：${r.id} —— ${baseline.find((b) => b.target === r.id)?.reason}（${baseline.find((b) => b.target === r.id)?.ticket}）`);
  for (const r of c.staleGreen) console.error(`  ✗ 降基线仪式：${r.id} 已转绿——同提交从 slow-lane-baseline.json 删掉该条（棘轮只紧不松）`);
  console.log(`SLOW-LANE: ${c.verdict}`);
  process.exit(c.verdict === 'FAIL' ? 1 : 0);
}
