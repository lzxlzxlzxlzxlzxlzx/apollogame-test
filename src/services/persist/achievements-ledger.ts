// 成就账本（阈值门 + 解锁集持久化）——局外壳层服务·收编 game-103/achievements.ts 的通用形。
//
// 成就 = 「某具名统计量 ≥ 阈值」的数据表（最弱 LLM 也能产出）；本件只做判定 + 记账：
//   record(stats) → 本次新解锁（按表序·稳定）并立即落盘；unlocked()/isUnlocked() 查；reset() 清。
// 持久化走 `localStore` + `jsonCodec(normalize)`：存的是 id 数组，读回时只认表内 id（未知 id 丢弃·坏档回空）。
// 红线：不进 world/snapshot/hash·不用壁钟·不用随机（同 local-store 头注）。game-103 保留自己的一份（不改 games）。

import { localStore, jsonCodec, defaultKV, type KV, type LocalStore } from './local-store.js';

/** 一条成就：监视哪个统计量、到多少解锁。`title` 给表现层用（横幅文案），判定不读它。 */
export interface AchievementDef {
  id: string;
  stat: string;
  threshold: number;
  title?: string;
}

export interface AchievementLedger {
  /** 已解锁 id 集（快照·不随后续 record 变化）。 */
  unlocked(): ReadonlySet<string>;
  /** 喂一组统计量 → 返回本次新解锁的成就（defs 表序）；有新解锁即落盘。 */
  record(stats: Readonly<Record<string, number>>): AchievementDef[];
  isUnlocked(id: string): boolean;
  /** 清空解锁集并落盘。 */
  reset(): void;
}

/** 建一张只认 `known` 内 id 的形状校验器：非数组 → 坏档（null）；数组内未知/非串条目丢弃。 */
function makeNormalize(known: ReadonlySet<string>): (raw: unknown) => string[] | null {
  return (raw) => {
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const v of raw) if (typeof v === 'string' && known.has(v) && !out.includes(v)) out.push(v);
    return out;
  };
}

/**
 * 建成就账本。
 * @param defs 成就表（判定按此表序返回）
 * @param opts.key 存储键（默认 `'achievements-v1'`·各游戏请自带前缀免撞）
 * @param opts.kv  存储后端（默认 localStorage/降级内存·测试传 `memoryKV()`）
 */
export function createAchievementLedger(
  defs: readonly AchievementDef[],
  opts: { key?: string; kv?: KV } = {},
): AchievementLedger {
  const known = new Set(defs.map((d) => d.id));
  const store: LocalStore<string[]> = localStore<string[]>(
    opts.key ?? 'achievements-v1',
    () => [],
    jsonCodec(makeNormalize(known)),
    opts.kv ?? defaultKV(),
  );
  const set = new Set<string>(store.get());
  return {
    unlocked: () => new Set(set),
    record(stats) {
      const fresh: AchievementDef[] = [];
      for (const d of defs) {
        if (set.has(d.id)) continue;
        const v = stats[d.stat];
        if (typeof v === 'number' && v >= d.threshold) { set.add(d.id); fresh.push(d); }
      }
      if (fresh.length > 0) store.set([...set]);
      return fresh;
    },
    isUnlocked: (id) => set.has(id),
    reset() {
      set.clear();
      store.set([]);
    },
  };
}
