import { expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { Shape, Transform, Tag, Flag, InputQueue, DebugTrace } from '@engine/protocol/components.js';
import { dragPlaceCapability } from './drag-place.js';
import { capabilities } from '../../../games/game-mcfight/world.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';

function fixture() {
  const w = new World();
  dragPlaceCapability.systems.forEach(s => w.addSystem(s));
  const add = (id: string, data: Record<string, object>) => {
    w.createEntity(id);
    Object.entries(data).forEach(([type, value]) => w.addComponent(id, { type, ...value } as Component));
  };
  const tf = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
  add('gate', { Flag: { id: 'deploy', active: true } });
  add('input', { InputQueue: { actions: [] } });
  add('trace', { DebugTrace: { events: [], tick: 0 } });
  add('unit', { Transform: tf(-14, 13), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: 1 },
    Draggable: { onlyFlag: 'deploy', freePlacement: {
      bounds: { minX: -18, maxX: -2, minY: -10, maxY: 10 }, teamMask: 1, deployedMask: 4,
      bench: { minX: -18, maxX: -2, minY: 12, maxY: 15, x: -14, y: 13 },
    } }, Clickable: { action: 'sell' } });
  add('ally', { Transform: tf(-10, 0), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: 5 } });
  const pos = () => ({ ...w.getComponent<Transform>('unit', 'Transform')! });
  const flags = () => w.getComponent<Tag>('unit', 'Tag')!.flags;
  const drag = (x: number, y: number) => {
    const p = pos();
    w.getComponent<InputQueue>('input', 'InputQueue')!.actions = [{ key: 'drag', phase: 'drag', source: 'player', x: p.x, y: p.y, values: [x, y] }];
    w.tick();
    w.getComponent<InputQueue>('input', 'InputQueue')!.actions = [];
  };
  return { w, add, tf, pos, flags, drag };
}

it.each([[8, 0], [-2.1, 0], [-10, 0], [-10, 10.01], [-19, 0]])('rejects illegal circle at %s,%s atomically', (x, y) => {
  const f = fixture(), before = f.pos();
  const ally = { ...f.w.getComponent<Transform>('ally', 'Transform')! };
  f.drag(x, y);
  expect(f.pos()).toEqual(before); expect(f.flags()).toBe(1);
  expect(f.w.getComponent<Transform>('ally', 'Transform')).toEqual(ally);
  expect(f.w.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.at(-1)?.kind).toBe('reject');
});
it('accepts boundary and ally tangency, then rejects overlap without losing previous deployment', () => {
  const f = fixture(); f.drag(-17, -9);
  expect(f.pos()).toMatchObject({ x: -17, y: -9 }); expect(f.flags()).toBe(5);
  f.drag(-12, 0); expect(f.pos()).toMatchObject({ x: -12, y: 0 });
  f.drag(-11.99, 0); expect(f.pos()).toMatchObject({ x: -12, y: 0 }); expect(f.flags()).toBe(5);
});
it('withdraws to stable bench anchor, preserves team and supports redeployment', () => {
  const f = fixture(); f.drag(-14, 0); f.drag(-5, 13);
  expect(f.pos()).toMatchObject({ x: -14, y: 13 }); expect(f.flags()).toBe(1);
  f.drag(-6, 0); expect(f.flags()).toBe(5);
});
it('closed phase rejects placement, withdrawal and drop-zone sale; opening restores drop-zone', () => {
  const f = fixture(); f.drag(-14, 0);
  f.add('sell-zone', { Transform: f.tf(16, 13), Shape: { kind: 'box', width: 2, height: 2 }, DropZone: {} });
  f.w.getComponent<Flag>('gate', 'Flag')!.active = false;
  for (const [x, y] of [[-6, 0], [-5, 13], [16, 13]]) f.drag(x!, y!);
  expect(f.pos()).toMatchObject({ x: -14, y: 0 }); expect(f.flags()).toBe(5);
  expect(f.w.hasComponent('sell-zone', 'Signal')).toBe(false);
  f.w.getComponent<Flag>('gate', 'Flag')!.active = true;
  f.drag(16, 13); expect(f.w.hasComponent('sell-zone', 'Signal')).toBe(true);
});
it('rejects nonfinite coordinates and unsupported geometry; mirror keeps full scaled circle', () => {
  const f = fixture(), before = f.pos(); f.drag(NaN, 0); expect(f.pos()).toEqual(before);
  const p = f.w.getComponent<Transform>('unit', 'Transform')!; p.scaleX = -2; p.scaleY = 2;
  f.drag(-17, 0); expect(f.pos()).toMatchObject({ x: -14, y: 13 });
  f.drag(-16, -8); expect(f.pos()).toMatchObject({ x: -16, y: -8 });
});
it('new world does not inherit deployment or input', () => {
  const a = fixture(); a.drag(-14, 0);
  for (const id of a.w.getAllEntities()) a.w.destroyEntity(id);
  const b = fixture(); b.w.tick(); expect(b.flags()).toBe(1); expect(b.pos()).toMatchObject({ x: -14, y: 13 });
});
it('invalid occupied geometry fails closed instead of allowing overlap', () => {
  // Independent review found negative neighbor radius could cancel the moving radius.
  for (const invalid of ['negative-radius', 'nonfinite-position', 'zero-scale'] as const) {
    const f = fixture(), before = f.pos();
    const p = f.w.getComponent<Transform>('ally', 'Transform')!;
    if (invalid === 'negative-radius') f.w.getComponent<Shape>('ally', 'Shape')!.radius = -1;
    if (invalid === 'nonfinite-position') p.x = NaN;
    if (invalid === 'zero-scale') { p.scaleX = 0; p.scaleY = 0; }
    f.drag(-10, 0); expect(f.pos()).toEqual(before); expect(f.flags()).toBe(1);
    expect(f.w.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.at(-1)?.why).toBe('invalid-occupied-circle');
  }
});
it('audit the real S3 combat and new drag-place together, not just the isolated drag systems', () => {
  const graph = analyzeSystemGraph([...capabilities, dragPlaceCapability]);
  console.log('S4_DRAG_COMBAT_AUDIT', JSON.stringify(graph));
  expect(graph.sccs).toEqual([]); expect(graph.duplicateIds).toEqual([]);
});
