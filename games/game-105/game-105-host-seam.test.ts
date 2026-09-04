import { describe, expect, it } from 'vitest';
import { isHostAdapterEnabled } from './game-105.js';

describe('Standalone Release M1 Host seam', () => {
  it('keeps retained dialogue and completion callbacks disabled unless M2 explicitly opts in', () => {
    expect(isHostAdapterEnabled({})).toBe(false);
    expect(isHostAdapterEnabled({ resolveAIReply: async () => ({ text: '不应调用' }), onComplete: () => {} })).toBe(false);
    expect(isHostAdapterEnabled({ enableHostAdapter: true })).toBe(true);
  });
});
