import { it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { dragPlaceCapability } from '@skills/tier2/drag-place.js';
import type { Component } from '@engine/core/types.js';
import type { Transform, InputQueue } from '@engine/protocol/components.js';

function probe(destination: { x: number; y: number }) {
  const world = new World();
  dragPlaceCapability.systems.forEach(system => world.addSystem(system));
  const add = (id: string, components: Record<string, object>) => {
    world.createEntity(id);
    Object.entries(components).forEach(([type, data]) => world.addComponent(id, { type, ...data } as Component));
  };
  const transform = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
  add('phase', { Flag: { id: 'deploy', active: true } });
  add('moving', { Transform: transform(-14, 0), Shape: { kind: 'circle', radius: .7 }, Tag: { flags: 1 }, Draggable: { onlyFlag: 'deploy' } });
  add('stationary', { Transform: transform(-10, 0), Shape: { kind: 'circle', radius: .6 }, Tag: { flags: 1 } });
  add('input', { InputQueue: { actions: [{ source: 'player', key: 'drag', phase: 'drag', x: -14, y: 0, values: [destination.x, destination.y] }] } });
  world.tick();
  const actual = world.getComponent<Transform>('moving', 'Transform')!;
  const other = world.getComponent<Transform>('stationary', 'Transform')!;
  world.getComponent<InputQueue>('input', 'InputQueue')!.actions = [];
  return { actual: { x: actual.x, y: actual.y }, other: { x: other.x, y: other.y } };
}

// These characterize a missing contract, NOT successful S4 deployment acceptance.
it.each([
  ['enemy area', { x: 8, y: 0 }],
  ['circle exceeds player edge', { x: -2.1, y: 0 }],
  ['overlap occupied circle', { x: -10, y: 0 }],
] as const)('S4 gap evidence: free drag currently accepts %s', (_name, destination) => {
  const observed = probe(destination);
  expect(observed.actual).toEqual(destination);
  expect(observed.actual).not.toEqual({ x: -14, y: 0 });
  expect(observed.other).toEqual({ x: -10, y: 0 });
  console.log('S4_PLACEMENT_GAP', JSON.stringify({ destination, observed, required: { x: -14, y: 0 } }));
});
