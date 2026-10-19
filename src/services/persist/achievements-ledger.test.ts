// 成就账本契约测试：阈值门只解锁一次 · 跨实例持久化 · 坏档回空 · 未知 id 丢弃 · reset。
import { describe, it, expect } from 'vitest';
import { memoryKV } from './local-store.js';
import { createAchievementLedger, type AchievementDef } from './achievements-ledger.js';

const DEFS: readonly AchievementDef[] = [
  { id: 'combo10', stat: 'peakCombo', threshold: 10, title: '10 连杀' },
  { id: 'kills100', stat: 'kills', threshold: 100 },
  { id: 'level10', stat: 'level', threshold: 10 },
];

describe('createAchievementLedger', () => {
  it('阈值跨过即解锁，且只解锁一次；返回按表序；缺失/非数统计量不解锁', () => {
    const kv = memoryKV();
    const l = createAchievementLedger(DEFS, { kv });
    expect(l.record({ peakCombo: 9, kills: 50 })).toEqual([]);
    expect(l.unlocked().size).toBe(0);
    // 同一次跨两条 → 表序 combo10, kills100（即使 kills 先在 stats 里）
    expect(l.record({ kills: 120, peakCombo: 10 }).map((d) => d.id)).toEqual(['combo10', 'kills100']);
    expect(l.isUnlocked('combo10')).toBe(true);
    expect(l.isUnlocked('level10')).toBe(false);
    // 再喂更高值不重复解锁
    expect(l.record({ kills: 999, peakCombo: 40 })).toEqual([]);
    expect(l.record({ level: 10 }).map((d) => d.id)).toEqual(['level10']);
    expect([...l.unlocked()].sort()).toEqual(['combo10', 'kills100', 'level10']);
  });

  it('持久化：同一 KV 的第二个账本实例读到已解锁集；默认键 achievements-v1', () => {
    const kv = memoryKV();
    const a = createAchievementLedger(DEFS, { kv });
    a.record({ peakCombo: 15 });
    expect(kv.getItem('achievements-v1')).toBe('["combo10"]');
    const b = createAchievementLedger(DEFS, { kv });
    expect(b.isUnlocked('combo10')).toBe(true);
    expect(b.record({ peakCombo: 99 })).toEqual([]); // 已解锁不再报
    expect(b.record({ kills: 100 }).map((d) => d.id)).toEqual(['kills100']);
    expect(createAchievementLedger(DEFS, { kv }).unlocked().size).toBe(2);
  });

  it('自定义键：两张表各存各的', () => {
    const kv = memoryKV();
    const a = createAchievementLedger(DEFS, { kv, key: 'g1-ach' });
    a.record({ level: 10 });
    expect(kv.getItem('g1-ach')).toBe('["level10"]');
    expect(kv.getItem('achievements-v1')).toBeNull();
    expect(createAchievementLedger(DEFS, { kv }).unlocked().size).toBe(0);
  });

  it('坏档（非 JSON / 非数组）→ 空集，绝不抛', () => {
    const l1 = createAchievementLedger(DEFS, { kv: memoryKV({ 'achievements-v1': '{ 坏 json' }) });
    expect(l1.unlocked().size).toBe(0);
    const l2 = createAchievementLedger(DEFS, { kv: memoryKV({ 'achievements-v1': '{"combo10":true}' }) });
    expect(l2.unlocked().size).toBe(0);
    // 坏档后仍能正常记账
    expect(l1.record({ level: 10 }).map((d) => d.id)).toEqual(['level10']);
  });

  it('未知 id / 非串条目丢弃，已知 id 保留', () => {
    const kv = memoryKV({ 'achievements-v1': '["ghost","combo10",42,null,"kills100","combo10"]' });
    const l = createAchievementLedger(DEFS, { kv });
    expect([...l.unlocked()].sort()).toEqual(['combo10', 'kills100']);
    expect(l.isUnlocked('ghost')).toBe(false);
  });

  it('reset：清空并落盘；之后可重新解锁', () => {
    const kv = memoryKV();
    const l = createAchievementLedger(DEFS, { kv });
    l.record({ peakCombo: 10, kills: 100, level: 10 });
    expect(l.unlocked().size).toBe(3);
    l.reset();
    expect(l.unlocked().size).toBe(0);
    expect(kv.getItem('achievements-v1')).toBe('[]');
    expect(createAchievementLedger(DEFS, { kv }).unlocked().size).toBe(0);
    expect(l.record({ peakCombo: 10 }).map((d) => d.id)).toEqual(['combo10']);
  });

  it('unlocked() 返回快照：外部改它不影响账本', () => {
    const l = createAchievementLedger(DEFS, { kv: memoryKV() });
    const snap = l.unlocked() as Set<string>;
    snap.add('combo10');
    expect(l.isUnlocked('combo10')).toBe(false);
  });
});
