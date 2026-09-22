import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════
//  capability 测试在位棘轮（2026-08-26 引擎测试收尾·owner「约束和补全所有用例」）。
//  规则：每个 capability 源文件必须有同伴测试——
//    · tier1/2/3：`x.ts`（非 index/非 .test）必须有同目录 `x.test.ts`；
//    · atoms：每个 `atoms/<name>/`（含 index.ts 的目录）必须在目录内含任一 `*.test.ts`，
//      或 atoms 顶层有 `<name>.test.ts`（两种既有布局都认）。
//  基线=**空**（盘点时仅 weighted-pick/merge-rule/slot-payout 三件缺测·已同批补齐）。
//  新增无测 capability → 本测点名报红；给某件补了测反而多余条目 → toEqual 同样红=逼更新（棘轮双向自觉）。
// ═══════════════════════════════════════════════════════════════

const SKILLS = join(dirname(fileURLToPath(import.meta.url)));

function tierMissing(tier: string): string[] {
  const dir = join(SKILLS, tier);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts')
    .filter((f) => !existsSync(join(dir, f.replace(/\.ts$/, '.test.ts'))))
    .map((f) => `${tier}/${f}`);
}

function atomsMissing(): string[] {
  const dir = join(SKILLS, 'atoms');
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'index.ts')))
    .filter((e) => {
      const inDir = readdirSync(join(dir, e.name)).some((f) => f.endsWith('.test.ts'));
      const sibling = existsSync(join(dir, `${e.name}.test.ts`));
      return !inDir && !sibling;
    })
    .map((e) => `atoms/${e.name}/`);
}

describe('capability 测试在位棘轮 — 每个 capability 源文件必须有同伴测试', () => {
  it('tier1/tier2/tier3 + atoms 全数在位（基线=空·新增无测件即点名红）', () => {
    const missing = [...tierMissing('tier1'), ...tierMissing('tier2'), ...tierMissing('tier3'), ...atomsMissing()];
    expect(missing, `无同伴测试的 capability：${missing.join(', ')}（补测试或经 Lead 裁基线——绝不静默）`).toEqual([]);
  });
});
