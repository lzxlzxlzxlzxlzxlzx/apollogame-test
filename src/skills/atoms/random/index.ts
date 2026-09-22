import { defineCapability } from '@engine/core/define-capability.js';
import type { RandomSeed } from '@engine/protocol/components.js';

export type { RandomSeed };

// 确定性 PRNG (mulberry32)。推进 state.seed/sequence，返回 [0, 1)。
// 同一初始 seed 必产生同一序列 —— 确定性重放的基石。
export function nextRandom(state: RandomSeed): number {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  state.sequence = (state.sequence ?? 0) + 1; // 蓝图只给 {seed} 时 sequence 缺省——undefined+1=NaN 会废掉重放校验计数
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: RandomSeed, minInclusive: number, maxExclusive: number): number {
  return minInclusive + Math.floor(nextRandom(state) * (maxExclusive - minInclusive));
}

// 概率门（REQ-E-023②）：掷 PRNG，nextRandom < num/den 为中。无 state 或 den<=0 → 不中（fail-closed）。
// 用引擎种子 PRNG（lockstep/录放安全），绝不 Math.random。num>=den → nextRandom∈[0,1) 必 < → 必中（1/1=always）。
export function chancePass(state: RandomSeed | undefined, num: number, den: number): boolean {
  if (!state || den <= 0) return false;
  return nextRandom(state) < num / den;
}

// mulberry32 确定性 PRNG 工厂：seed → 每次返回 [0,1) 的取数器（与 nextRandom 同算法·但脱离 RandomSeed 运行态，
// 供纯数据层的确定性洗牌/抽样用）。各游戏原本各自手搓此函数（game-e/deck·game-g/{build,level,sim}）→ 收敛于此单一真相。
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 派生子种子（B-7 · engine-base-tier-review-2026-09-06 §3.2）：同一世界种子 + 一个标签 → 一条独立且可复现的随机流种子
// （AI 性格流 / sim 外的 meta 流 / 每波刷怪流）。此前 game211 整个 meta-random.ts 只为包一层、game-a 按性格
// 手派 mulberry32(种子)、spawn-director 自带 seedState。算法：FNV-1a(label) ⊕ seed 再过一轮 mulberry 搅拌 → int32。
// 用法：`const ai: RandomSeed = { type: 'RandomSeed', seed: deriveSeed(world.seed, 'ai:p2'), sequence: 0 }`，之后照常 nextRandom。
export function deriveSeed(seed: number, label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let a = ((h ^ (seed | 0)) + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  a = (t ^ (t >>> 14)) | 0;
  return a;
}

// 抽签袋（shuffle bag·B 补齐）：不放回抽取，抽空自动用同一 PRNG 重洗——「每种结果在一轮里恰出现一次」的
// 伪随机（掉落保底/题库轮转/敌人出场序）。状态可序列化（bag + cursor + seed）；同 seed 同序列。
export interface ShuffleBag<T> { items: T[]; cursor: number; readonly seed: RandomSeed }
export function createShuffleBag<T>(items: readonly T[], seed: RandomSeed): ShuffleBag<T> {
  return { items: [...items], cursor: items.length, seed };
}
export function drawFromBag<T>(bag: ShuffleBag<T>): T | undefined {
  const n = bag.items.length;
  if (n === 0) return undefined;
  if (bag.cursor >= n) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(bag.seed) * (i + 1));
      const t = bag.items[i]; bag.items[i] = bag.items[j]; bag.items[j] = t;
    }
    bag.cursor = 0;
  }
  return bag.items[bag.cursor++];
}

// 正态近似（B 补齐）：12 个均匀和减 6 → 均值 0、方差 1（Irwin–Hall·无 log/cos·确定性）。伤害浮动/散布用。
export function gaussianApprox(state: RandomSeed, mean = 0, stddev = 1): number {
  let s = 0;
  for (let i = 0; i < 12; i++) s += nextRandom(state);
  return mean + (s - 6) * stddev;
}

// 确定性 Fisher-Yates 洗牌（不改原数组·同 seed 同结果）。卡牌/抽牌/随机排列的单一真相。
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const randomCapability = defineCapability({
  id: 'w1-random',
  version: '1.0.0',

  describe: {
    name: 'random',
    summary: '可控随机数。确定性重放的基石。',
    semantic: ['world-service', 'determinism'],
    whenToUse:
      '需要可复现随机时：掉落、散射、AI 抖动、过程生成。RandomSeed 挂在 world 实体，系统通过 nextRandom(seed) 取值并推进序列。相同 seed → 相同序列。',
    examples: ['掉落判定：nextRandom(seed) < dropRate', '弹幕散射：randomInt 选角度', '重放：存初始 seed 即可复现整局'],
  },

  components: {
    provides: {
      RandomSeed: {
        category: 'config',
        describe: '确定性随机数发生器状态。seed 为当前内部状态，sequence 记录取数次数。',
        fields: {
          seed: { type: 'number', describe: 'PRNG 内部状态（取数后推进）' },
          sequence: { type: 'number', describe: '已取数次数（调试/重放校验）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    seed: { type: 'number', default: 1, describe: '初始种子', question: '随机种子？（相同种子复现同一局）', ui: { control: 'input' } },
  },

  systems: [],
});
