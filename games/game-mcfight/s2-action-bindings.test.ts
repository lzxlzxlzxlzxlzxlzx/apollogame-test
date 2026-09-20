import { expect, it } from 'vitest';
import { actionBindings, anchorOffset, missingActionAssets } from './s2-action-bindings.js';
it('mirrors attachments about the same fixed root without changing vertical placement', () => {
  const grip = { x: 87, y: 42 }, root = { x: 64, y: 120 };
  for (const scale of [.8, 1, 1.2]) {
    const right = anchorOffset(grip, root, scale, 1), left = anchorOffset(grip, root, scale, -1);
    expect(left.x).toBe(-right.x); expect(left.y).toBe(right.y);
    expect(Math.abs(left.x / scale + grip.x - root.x)).toBeLessThan(1);
  }
  expect(() => anchorOffset(grip, root, 1.21, 1)).toThrow();
});
it('unproduced animation sets remain explicitly missing, never accepted as single-pose animations', () => {
  expect(actionBindings.map(b => b.unit)).toEqual(['vindicator', 'zombie', 'vex']);
  for (const b of actionBindings) {
    expect(missingActionAssets(b)).toContain('统一画布尺寸');
    expect(missingActionAssets(b).filter(s => s.startsWith('动作 '))).toHaveLength(Object.keys(b.clips).length);
  }
});
