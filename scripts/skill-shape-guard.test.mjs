import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scanSkills, violations, MAX_SHELL_LINES, MAX_FIELDS, SEDIMENTED } from './skill-shape-guard.mjs';

const baseline = JSON.parse(readFileSync(new URL('./skill-shape-baseline.json', import.meta.url), 'utf8'));

describe('skill-shape-guard —— 能力形状棘轮（owner 2026-09-05 令「避免超大 skill」）', () => {
  it('阈值有实测依据：中位壳远小于门槛（门槛不是拍脑袋定的）', () => {
    const rows = scanSkills();
    const med = rows.map((r) => r.code).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
    expect(rows.length).toBeGreaterThan(60);
    // 门槛 250 ≈ 中位数的 2.5 倍以上：既容得下正常壳，又拦得住"算法赖在壳里"
    expect(MAX_SHELL_LINES / med).toBeGreaterThan(2);
    expect(med).toBeLessThan(MAX_SHELL_LINES);
  });

  it('**纯函数核不受行数约束**——那正是我们要算法去的地方', () => {
    const rows = scanSkills();
    // 核（无 defineCapability）压根不进扫描表；进表的都是壳
    expect(rows.every((r) => r.file.endsWith('.ts'))).toBe(true);
    expect(rows.find((r) => r.file.endsWith('flow-field-core.ts'))).toBeUndefined();
    expect(rows.find((r) => r.file.endsWith('orca.ts'))).toBeUndefined();
  });

  it('**棘轮：现状无新增超标**（存量全部在案·新长出来的当场红）', () => {
    const known = new Set(baseline.oversized.map((e) => e.file));
    const fresh = violations(scanSkills()).filter((v) => !known.has(v.file));
    expect(fresh.map((v) => v.file)).toEqual([]);
  });

  it('**棘轮只紧不松：达标了必须同提交降基线**（基线里不许留已达标的条目）', () => {
    const bad = new Set(violations(scanSkills()).map((v) => v.file));
    const stale = baseline.oversized.map((e) => e.file).filter((f) => !bad.has(f));
    expect(stale, `这些已达标，请从 skill-shape-baseline.json 删掉：${stale.join(', ')}`).toEqual([]);
  });

  it('基线条目四字段齐全，且 remedy 写清「怎么还」（不写清楚的债等于赖账）', () => {
    for (const e of baseline.oversized) {
      expect(e.file, JSON.stringify(e)).toMatch(/^src\/skills\//);
      for (const k of ['date', 'shape', 'reason', 'remedy']) expect(e[k], `${e.file} 缺 ${k}`).toBeTruthy();
      expect(e.remedy.length, `${e.file} 的 remedy 太短，看不出怎么还`).toBeGreaterThan(20);
    }
  });

  it('flow-field 已按本门示范拆核并退出名单（拆核这条路真的走得通）', () => {
    const rows = scanSkills();
    const ff = rows.find((r) => r.file.endsWith('/flow-field.ts'));
    expect(ff, 'flow-field.ts 不在能力表里？').toBeDefined();
    expect(ff.code).toBeLessThan(MAX_SHELL_LINES);        // 581 → 224
    expect(baseline.oversized.some((e) => e.file.endsWith('/flow-field.ts'))).toBe(false);
    // 核确实落地了，且不含世界访问（纯函数核的定义）
    const core = readFileSync(new URL('../src/skills/tier2/flow-field-core.ts', import.meta.url), 'utf8');
    const body = core.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');   // 剥注释：文件头写着"零 defineCapability"
    expect(body).not.toMatch(/defineCapability\s*\(|IWorld|world\./);
    expect(core.split('\n').length).toBeGreaterThan(300);  // 算法真搬过去了，不是搬了个空壳
  });

  it('底层回收：`@engine/logic` 的采用率被量出来（沉淀了没人用 = 白沉淀）', () => {
    const rows = scanSkills();
    const inlined = rows.filter((r) => r.inlined.length);
    expect(SEDIMENTED.length).toBe(4);
    // 立门当天 24 件内联重造——这个数只许降不许升（升 = 又有人绕过底层重造轮子）
    expect(inlined.length).toBeLessThanOrEqual(24);
  });

  it('字段面门槛对得上组件契约的闭集类型（探针不会漏数字段）', () => {
    expect(MAX_FIELDS).toBe(20);
    const rows = scanSkills();
    expect(rows.some((r) => r.fields > 0)).toBe(true);   // 探针真数到了字段
  });
});
