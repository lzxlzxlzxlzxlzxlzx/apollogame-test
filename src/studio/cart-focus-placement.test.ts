import { describe, expect, it } from 'vitest';
import type { ClickableTarget } from '@engine/protocol/clickable-hit-test.js';
import { focusLabelWorldPoint } from './cart-focus-placement.js';
import { pointerToneForTarget } from './cart-pointer-feedback.js';

const shapeTarget: ClickableTarget = {
  eid: 'clock', t: { type: 'Transform', x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
  s: { type: 'Shape', kind: 'box', width: 80, height: 40 },
  z: 0, click: { type: 'Clickable', action: 'inspect' }, mask: null,
};

describe('render-only focus label placement and semantic tone', () => {
  it('keeps legacy center anchor and uses authoritative shape top for above', () => {
    expect(focusLabelWorldPoint(shapeTarget)).toEqual({ x: 100, y: 200 });
    expect(focusLabelWorldPoint(shapeTarget, 'above')).toEqual({ x: 100, y: 180 });
    expect(shapeTarget.t.y).toBe(200);
  });

  it('uses Sprite/mask draw destination with negative scale without changing hit geometry', () => {
    const masked: ClickableTarget = {
      ...shapeTarget,
      t: { ...shapeTarget.t, scaleY: -1 }, s: undefined,
      sprite: { type: 'Sprite', textureKey: 'clock', width: 80, height: 40, fit: 'contain', anchorX: 0.5, anchorY: 0.5, zOrder: 0 },
      click: { type: 'Clickable', action: 'inspect', hitMaskKey: 'mask' },
      mask: { version: 1, width: 8, height: 4, threshold: 150, sourceTextureKey: 'clock', rows: ['11111111', '11111111', '11111111', '11111111'] },
    };
    expect(focusLabelWorldPoint(masked, 'above').y).toBeLessThan(200);
    expect(focusLabelWorldPoint(masked).y).toBe(200);
    expect(masked.t.scaleY).toBe(-1);
  });

  it('per-object tone overrides global fallback without changing unconfigured targets', () => {
    const basic = { entity: 'clock', label: '钟', action: 'inspect' } as const;
    expect(pointerToneForTarget(basic, 'cyan')).toBe('cyan');
    expect(pointerToneForTarget({ ...basic, tone: 'gold' }, 'cyan')).toBe('gold');
  });
});
