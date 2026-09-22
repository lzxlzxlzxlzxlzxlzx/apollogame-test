import { describe, it, expect } from 'vitest';
import { vfx2dCapability } from './index.js';
import { NON_DETERMINISTIC } from '@net/determinism.js';
import { allAtomCapabilities } from '../index.js';

// l7-vfx2d：render-only 原子形状——无 system、Vfx2D 在 NON_DETERMINISTIC、已入核心原子表；解释器测试在 renderer/vfx2d.test.ts。
describe('l7-vfx2d', () => {
  it('纯表现原子：零 system·零读写申报·Vfx2D 不进快照 hash·登记在核心原子表', () => {
    expect(vfx2dCapability.id).toBe('l7-vfx2d');
    expect(vfx2dCapability.systems).toHaveLength(0);
    expect(vfx2dCapability.components.reads).toEqual([]);
    expect(vfx2dCapability.components.writes).toEqual([]);
    expect(Object.keys(vfx2dCapability.components.provides)).toEqual(['Vfx2D']);
    expect(vfx2dCapability.components.provides.Vfx2D.category).toBe('render');
    expect(NON_DETERMINISTIC.has('Vfx2D')).toBe(true);
    expect(allAtomCapabilities.some((c) => c.id === 'l7-vfx2d')).toBe(true);
  });
});
