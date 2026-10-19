import { describe, expect, it } from 'vitest';
import { World } from '../core/world.js';
import type { Clickable, Flag, InputQueue, Shape, Signal, Sprite, Transform } from './components.js';
import { collectClickableTargets, pickClickableTarget, clickableMaskPlan } from './clickable-hit-test.js';
import { clickableCapability } from '../../skills/tier2/clickable.js';
import { bindHostHitMaskCatalog } from './host-hit-mask-catalog.js';

function fixture(): World {
  const world = new World();
  for (const system of clickableCapability.systems) world.addSystem(system);
  world.createEntity('enabled');
  world.addComponent('enabled', { type: 'Flag', id: 'inspect-enabled', active: true } as Flag);
  world.createEntity('bottom');
  world.addComponent('bottom', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  world.addComponent('bottom', { type: 'Shape', kind: 'box', width: 30, height: 30 } as Shape);
  world.addComponent('bottom', { type: 'Clickable', action: 'bottom' } as Clickable);
  world.createEntity('top');
  world.addComponent('top', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 2, scaleY: 1 } as Transform);
  world.addComponent('top', { type: 'Shape', kind: 'box', width: 8, height: 8 } as Shape);
  world.addComponent('top', { type: 'Sprite', textureKey: 'target.png', anchorX: 0.5, anchorY: 0.5, zOrder: 9, width: 8, height: 8, fit: 'contain' } as Sprite);
  world.addComponent('top', { type: 'Clickable', action: 'top', onlyFlag: 'inspect-enabled', hitMaskKey: 'target.mask', hitMask: {
    version: 1, width: 4, height: 2, threshold: 127, sourceTextureKey: 'target.png', rows: ['1001', '0110'],
  } } as Clickable);
  world.createEntity('input');
  return world;
}

function simPick(world: World, x: number, y: number): string | undefined {
  world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'mouse', x, y, phase: 'down' }] } as InputQueue);
  world.tick();
  for (const [eid] of world.query('Signal')) if (eid === 'top' || eid === 'bottom') return eid;
  return undefined;
}

describe('shared 2D Clickable hit projection', () => {
  it('render-only picker and sim choose identical opaque/transparent/contain/z targets', () => {
    for (const [x, y, expected] of [[3, 19, 'top'], [3, 16.5, 'bottom'], [10, 20, 'top']] as const) {
      const world = fixture();
      const picked = pickClickableTarget(collectClickableTargets(world.readView()), x, y, 'down');
      expect(picked?.eid).toBe(expected);
      expect(simPick(world, x, y)).toBe(expected);
    }
  });

  it('honors onlyFlag and malformed mask fail-closed on both paths', () => {
    const world = fixture();
    world.addComponent('enabled', { type: 'Flag', id: 'inspect-enabled', active: false } as Flag);
    expect(pickClickableTarget(collectClickableTargets(world.readView()), 3, 19, 'down')?.eid).toBe('bottom');
    expect(simPick(world, 3, 19)).toBe('bottom');
    world.addComponent('enabled', { type: 'Flag', id: 'inspect-enabled', active: true } as Flag);
    world.addComponent('top', { type: 'Clickable', action: 'top', hitMaskKey: 'target.mask' } as Clickable);
    const targets = collectClickableTargets(world.readView());
    expect(targets.find((target) => target.eid === 'top')?.mask).toBeNull();
    expect(clickableMaskPlan(targets.find((target) => target.eid === 'top')!)).toBeNull();
    expect(pickClickableTarget(targets, 3, 19, 'down')?.eid).toBe('bottom');
    expect(simPick(world, 3, 19)).toBe('bottom');
  });

  it('shares cover cropping and host-mask catalog fail-closed semantics', () => {
    const world = fixture();
    world.addComponent('top', { type: 'Sprite', textureKey: 'target.png', anchorX: 0.5, anchorY: 0.5,
      zOrder: 9, width: 8, height: 2, fit: 'cover' } as Sprite);
    const topClick = world.getComponent<Clickable>('top', 'Clickable')!;
    const mask = topClick.hitMask!;
    world.addComponent('top', { type: 'Clickable', action: 'top', onlyFlag: 'inspect-enabled', hitMaskKey: 'host-mask:probe' } as Clickable);
    expect(pickClickableTarget(collectClickableTargets(world.readView()), 10, 20, 'down')?.eid).toBe('bottom');
    const unbind = bindHostHitMaskCatalog(world, { get: (key) => key === 'host-mask:probe' ? mask : undefined });
    try {
      const targets = collectClickableTargets(world.readView());
      const plan = clickableMaskPlan(targets.find((target) => target.eid === 'top')!);
      expect(plan?.source.height).toBe(1);
      expect(pickClickableTarget(targets, 10, 20, 'down')?.eid).toBe('top');
      expect(simPick(world, 10, 20)).toBe('top');
      expect(pickClickableTarget(targets, 3, 20, 'down')?.eid).toBe('bottom');
    } finally { unbind(); }
    expect(pickClickableTarget(collectClickableTargets(world.readView()), 10, 20, 'down')?.eid).toBe('bottom');
  });
});
