import { describe, expect, it } from 'vitest';
import { screenToWorld } from '../engine/protocol/camera-view.js';
import { hitClickableTarget, type ClickableTarget } from '../engine/protocol/clickable-hit-test.js';
import { cartMaskProbeTargets } from './cart-click-probe-points.js';

const rows = Array.from({ length: 8 }, () => '0000000011111111');
function target(fit: 'cover' | 'contain', scaleX = 1): ClickableTarget {
  return {
    eid: 'masked', t: { type: 'Transform', x: 100, y: 100, rotation: 0, scaleX, scaleY: 1 },
    sprite: { type: 'Sprite', textureKey: 'tex', width: 80, height: 80, fit, anchorX: 0.5, anchorY: 0.5, zOrder: 1 },
    z: 1, click: { type: 'Clickable', action: 'inspect', hitMaskKey: 'mask' },
    mask: { version: 1, width: 16, height: 8, threshold: 150, sourceTextureKey: 'tex', rows },
  } as ClickableTarget;
}

describe('cartMaskProbeTargets · same-source alpha point selection', () => {
  for (const fit of ['cover', 'contain'] as const) for (const scaleX of [1, -1]) {
    it(`${fit} / scaleX=${scaleX}: solid and transparent points survive two viewport projections`, () => {
      const item = target(fit, scaleX);
      const camera = { centerX: 100, centerY: 100, zoom: 1.5 };
      for (const [width, height] of [[400, 300], [960, 600]]) {
        const [sample] = cartMaskProbeTargets([item], camera, width, height);
        expect(sample?.solid).toBeDefined();
        expect(sample?.transparent).toBeDefined();
        const solid = screenToWorld(sample.solid.x, sample.solid.y, camera, width, height);
        const transparent = screenToWorld(sample.transparent!.x, sample.transparent!.y, camera, width, height);
        expect(hitClickableTarget(solid.x, solid.y, item)).toBe('hit');
        expect(hitClickableTarget(transparent.x, transparent.y, item)).toBe('transparent');
      }
    });
  }

  it('rejects a wrong-source mask rather than sampling a rectangular fallback', () => {
    const item = target('contain');
    const wrong = { ...item, mask: { ...item.mask!, sourceTextureKey: 'other' } } as ClickableTarget;
    expect(cartMaskProbeTargets([wrong], null, 400, 300)).toEqual([]);
  });
});
