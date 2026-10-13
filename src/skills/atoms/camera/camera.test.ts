import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { cameraCapability } from './index.js';
import type { Camera } from '@engine/protocol/components.js';
import { validateComponentData } from '@assembly/validate-manifest.js';

describe('camera atom', () => {
  it('is a pure-data render atom with no systems', () => {
    expect(cameraCapability.systems).toHaveLength(0);
  });

  it('provides Camera categorized as render', () => {
    expect(cameraCapability.components.provides.Camera.category).toBe('render');
  });

  it('stores and reads back projection params', () => {
    const w = new World();
    w.createEntity('cam');
    const c: Camera = { type: 'Camera', zoom: 2, offsetX: 5, offsetY: -5, rotation: 0, viewportW: 1280, viewportH: 720 };
    w.addComponent('cam', c);
    const got = w.getComponent<Camera>('cam', 'Camera')!;
    expect(got.zoom).toBe(2);
    expect(got.viewportW).toBe(1280);
  });

  it('defaults to zoom 1 and 800x600 viewport', () => {
    expect(cameraCapability.config.zoom.default).toBe(1);
    expect(cameraCapability.config.viewportW.default).toBe(800);
    expect(cameraCapability.config.viewportH.default).toBe(600);
  });

  it('validates the closed finite [0, 0.5) dead-zone contract recursively', () => {
    const base = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, viewportW: 100, viewportH: 100 };
    const valid = validateComponentData([cameraCapability], { cam: { Camera: { ...base, followDeadZone: { left: 0, right: 0.49, top: 0.25, bottom: 0.25 } } } });
    expect(valid).toEqual({ errors: [], warnings: [] });
    const invalid = validateComponentData([cameraCapability], { cam: { Camera: { ...base, followDeadZone: { left: -0.1, right: 0.5, top: Number.POSITIVE_INFINITY, bottom: 0.2, typo: 1 } } } });
    expect(invalid.errors.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('followDeadZone.left'), expect.stringContaining('followDeadZone.right'), expect.stringContaining('followDeadZone.top'),
    ]));
    expect(invalid.warnings.map((issue) => issue.message)).toContainEqual(expect.stringContaining('followDeadZone.typo'));
  });
});
