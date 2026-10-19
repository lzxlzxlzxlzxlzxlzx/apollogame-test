import { describe, it, expect } from 'vitest';
import { bakeHitMaskFromRgba } from './hit-mask.js';

describe('authoring hit-mask bake', () => {
  it('仅按 alpha 阈值烘焙二值行，不泄漏 RGB 字节', () => {
    const rgba = new Uint8Array([
      255, 0, 0, 0, 0, 255, 0, 127,
      0, 0, 255, 128, 30, 40, 50, 255,
    ]);
    expect(bakeHitMaskFromRgba(2, 2, rgba, 'clue.png', 128)).toEqual({
      version: 1, width: 2, height: 2, threshold: 128, sourceTextureKey: 'clue.png', rows: ['00', '11'],
    });
  });
  it('尺寸/字节数/阈值错误拒绝', () => {
    expect(() => bakeHitMaskFromRgba(2, 2, new Uint8Array(4), 'clue.png', 128)).toThrow();
    expect(() => bakeHitMaskFromRgba(1, 1, new Uint8Array(4), 'clue.png', 0)).toThrow();
  });
});
