import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { shapeCapability } from './index.js';
import type { Shape } from '@engine/protocol/components.js';

describe('shape atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(shapeCapability.systems).toHaveLength(0);
  });

  it('provides Shape with a kind field', () => {
    expect(shapeCapability.components.provides.Shape.fields.kind.type).toBe('string');
  });

  it('stores a box shape', () => {
    const w = new World();
    w.createEntity('e');
    const s: Shape = { type: 'Shape', kind: 'box', width: 32, height: 48 };
    w.addComponent('e', s);
    const got = w.getComponent<Shape>('e', 'Shape')!;
    expect(got.kind).toBe('box');
    expect(got.width).toBe(32);
    expect(got.height).toBe(48);
  });

  it('stores a circle shape', () => {
    const w = new World();
    w.createEntity('e');
    const s: Shape = { type: 'Shape', kind: 'circle', radius: 4 };
    w.addComponent('e', s);
    const got = w.getComponent<Shape>('e', 'Shape')!;
    expect(got.kind).toBe('circle');
    expect(got.radius).toBe(4);
  });

  it('config preserves box default and exposes all supported collision shapes', () => {
    expect(shapeCapability.config.kind.default).toBe('box');
    expect(shapeCapability.config.kind.ui.options).toEqual(['box', 'circle', 'polygon', 'capsule']);
  });
});
