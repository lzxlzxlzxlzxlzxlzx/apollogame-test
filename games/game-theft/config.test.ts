import { describe, expect, it } from 'vitest';
import { DEFAULT_THEFT_CONFIG, THEFT_SLOT_COUNT, resolveTheftDifficulty, validateTheftConfig } from './config.js';

describe('game-theft 配置', () => {
  it('默认预览档合法，物品不再携带独立 DC', () => {
    expect(validateTheftConfig(DEFAULT_THEFT_CONFIG)).toEqual([]);
    expect(DEFAULT_THEFT_CONFIG.difficulty.id).toBe('standard');
    expect(DEFAULT_THEFT_CONFIG.items.every((item) => !('dc' in item))).toBe(true);
  });

  it('将 SDK 的 0–100 总难度稳定映射为黑位与暴露速率，并在边界钳制', () => {
    expect(resolveTheftDifficulty(0)).toMatchObject({ id: 'forgiving', blackSlotCount: 10, exposureRateBpPerSecond: 180 });
    expect(resolveTheftDifficulty(20)).toMatchObject({ id: 'easy', blackSlotCount: 8, exposureRateBpPerSecond: 240 });
    expect(resolveTheftDifficulty(50)).toMatchObject({ id: 'standard', blackSlotCount: 6, exposureRateBpPerSecond: 320 });
    expect(resolveTheftDifficulty(100)).toMatchObject({ id: 'expert', blackSlotCount: 2, exposureRateBpPerSecond: 500 });
    expect(resolveTheftDifficulty(-8)).toEqual(resolveTheftDifficulty(0));
    expect(resolveTheftDifficulty(130)).toEqual(resolveTheftDifficulty(100));
    expect(() => resolveTheftDifficulty(12.5)).toThrow('安全整数');
  });

  it('黑位数量与物品容量由同一个难度档案约束', () => {
    const over = {
      ...DEFAULT_THEFT_CONFIG,
      difficulty: { ...DEFAULT_THEFT_CONFIG.difficulty, blackSlotCount: THEFT_SLOT_COUNT - 1 },
    };
    expect(validateTheftConfig(over)).toContain('items 必须包含 1..1 个条目');
  });

  it('物品图是调用方可选输入，空字符串会被拒绝', () => {
    expect(validateTheftConfig({ ...DEFAULT_THEFT_CONFIG, items: [{ ...DEFAULT_THEFT_CONFIG.items[0]!, imageUrl: 'https://cdn.example/item.png' }] })).toEqual([]);
    expect(validateTheftConfig({ ...DEFAULT_THEFT_CONFIG, items: [{ ...DEFAULT_THEFT_CONFIG.items[0]!, imageUrl: ' ' }] })).toContain('items[0].imageUrl 不能为空字符串');
  });
});
