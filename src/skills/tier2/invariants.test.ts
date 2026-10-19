import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@atom-skills/random/index.js';
import type { RandomSeed } from '@engine/protocol/components.js';
import { invAdd, invRemove, invSplit, invMerge, invMove, invSort, invCount, invStackCap, type Inventory } from './inventory.js';
import { rollWithMods, rollDist, expectedValue, EXPLODE_CAP, type RollMods } from './dice.js';
import { planStarts, type Candidate, type RateLimitState } from './rate-limit.js';

// 不变量测试（种子随机操作序列·无 fast-check 依赖）：例子测试钉「某输入→某输出」，这里钉「任意输入都不能破的性质」。
// 三块纯函数库各一组；随机序列固定种子 → 失败可复现（报错带 seed + 步号）。

const SEEDS = [1, 7, 42, 1337, 99991];

function inv(slots: number, maxStack: number): Inventory { return { type: 'Inventory', id: 'bag', slots, maxStack, items: [] }; }
function checkInv(i: Inventory, where: string): void {
  const cap = invStackCap(i);
  expect(i.items.length, `${where}: 堆数超格`).toBeLessThanOrEqual(i.slots);
  for (const s of i.items) {
    expect(s.count, `${where}: 空堆残留`).toBeGreaterThan(0);
    expect(s.count, `${where}: 堆超上限`).toBeLessThanOrEqual(cap);
  }
}

describe('inventory 不变量', () => {
  it('任意加/减/拆/合/移/排序序列：堆数≤slots·每堆 (0,maxStack]·总量守恒（加入-移出=在袋）', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const a = inv(1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 9));
      const b = inv(1 + Math.floor(rng() * 6), a.maxStack);
      const ledger = new Map<string, number>(); // kind → 应在 a+b 中的总量
      const kinds = ['ore', 'wood', 'gem'];
      for (let step = 0; step < 200; step++) {
        const k = kinds[Math.floor(rng() * kinds.length)];
        const n = 1 + Math.floor(rng() * 12);
        const op = Math.floor(rng() * 6);
        const where = `seed ${seed} step ${step} op ${op}`;
        if (op === 0) ledger.set(k, (ledger.get(k) ?? 0) + invAdd(a, k, n));
        else if (op === 1) ledger.set(k, (ledger.get(k) ?? 0) - invRemove(a, k, n));
        else if (op === 2) invSplit(a, Math.floor(rng() * (a.items.length + 1)), n);
        else if (op === 3) invMerge(a, Math.floor(rng() * (a.items.length + 1)), Math.floor(rng() * (a.items.length + 1)));
        else if (op === 4) invMove(a, b, k, n); // 袋间搬运不改总量
        else invSort(a);
        checkInv(a, where); checkInv(b, where);
        for (const kind of kinds) expect(invCount(a, kind) + invCount(b, kind), `${where}: ${kind} 总量不守恒`).toBe(ledger.get(kind) ?? 0);
      }
    }
  });
});

describe('dice 不变量', () => {
  const cases: Array<[number, RollMods]> = [
    [6, { bonus: 0, floor: 0, twice: 0 }],
    [6, { bonus: 2, floor: 1, twice: 1 }],
    [20, { bonus: -1, floor: 0, twice: 0, advantage: 1, rerollBelow: 5 }],
    [8, { bonus: 0, floor: 0, twice: 0, disadvantage: 2 }],
    [6, { bonus: 0, floor: 0, twice: 0, explodeOn: 6 }],
    [4, { bonus: 3, floor: 2, twice: 0, explodeOn: 4, rerollBelow: 3 }],
  ];
  it('rollDist 概率和 = 1；实掷落在分布支撑集内；实掷均值逼近 expectedValue', () => {
    for (const [sides, mods] of cases) {
      const dist = rollDist(sides, mods);
      let sum = 0; for (const p of dist.values()) sum += p;
      expect(sum).toBeCloseTo(1, 9);
      const hi = sides * (EXPLODE_CAP + 1) + mods.bonus;
      const seed: RandomSeed = { type: 'RandomSeed', seed: 4242, sequence: 0 };
      const N = 4000; let acc = 0;
      for (let i = 0; i < N; i++) {
        const v = rollWithMods(sides, seed, mods);
        expect(dist.has(v), `${JSON.stringify(mods)} 掷出分布外的值 ${v}`).toBe(true);
        expect(v).toBeLessThanOrEqual(hi);
        acc += v;
      }
      const ev = expectedValue(dist);
      expect(Math.abs(acc / N - ev), `${JSON.stringify(mods)} 均值 ${acc / N} vs 期望 ${ev}`).toBeLessThan(0.15 * Math.max(1, ev));
    }
  });
});

describe('rate-limit 不变量', () => {
  it('任意候选集：本拍开始数 ≤ min(maxPerTick, 并发余量)；资源零冲突；活动 key 不重开；错峰窗口内零开始', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const cfg = { maxConcurrent: 1 + Math.floor(rng() * 4), gapTicks: Math.floor(rng() * 3), maxPerTick: 1 + Math.floor(rng() * 3) };
      const active = new Map<string, string[]>();
      let lastStart = -Infinity;
      for (let tick = 0; tick < 60; tick++) {
        // 随机结束一些活动
        for (const k of [...active.keys()]) if (rng() < 0.3) active.delete(k);
        const cands: Candidate[] = [];
        const n = Math.floor(rng() * 6);
        const keys = new Set<string>();
        for (let i = 0; i < n; i++) {
          const key = `k${Math.floor(rng() * 8)}`;
          if (keys.has(key)) continue; // 同 key 重复出现由 planStarts 取排序后首个——此处只验资源规则，键去重
          keys.add(key);
          cands.push({ key, priority: Math.floor(rng() * 3), uses: [`r${Math.floor(rng() * 4)}`, `r${Math.floor(rng() * 4)}`] });
        }
        const state: RateLimitState = { active, lastStartTick: lastStart, tick };
        const out = planStarts(state, cands, cfg);
        const where = `seed ${seed} tick ${tick}`;
        if (tick - lastStart < cfg.gapTicks) expect(out, `${where}: 错峰窗口内开始了`).toEqual([]);
        expect(out.length, `${where}: 超 maxPerTick`).toBeLessThanOrEqual(cfg.maxPerTick);
        expect(out.length + active.size, `${where}: 超并发`).toBeLessThanOrEqual(cfg.maxConcurrent);
        const used = new Set<string>(); for (const v of active.values()) for (const r of v) used.add(r);
        for (const k of out) {
          expect(active.has(k), `${where}: 活动中的 ${k} 被重开`).toBe(false);
          const c = cands.find((x) => x.key === k)!;
          for (const r of c.uses) { expect(used.has(r), `${where}: 资源 ${r} 冲突`).toBe(false); }
          for (const r of c.uses) used.add(r);
          active.set(k, [...c.uses]);
        }
        if (out.length > 0) lastStart = tick;
      }
    }
  });
});
