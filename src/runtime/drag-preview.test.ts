import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Clickable, Draggable, DropZone, Shape, Sprite, Transform, Signal } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/determinism.js';
import { DragPreviewLayer } from './drag-preview.js';

const transform = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
function fixture(): World {
  const world = new World({ strict: true });
  world.createEntity('material');
  world.addComponent<Draggable>('material', { type: 'Draggable', onlyFlag: 'never-enabled' });
  world.addComponent<Clickable>('material', { type: 'Clickable', action: 'brew.add.silver', onlyFlag: 'never-enabled' });
  world.addComponent<Transform>('material', transform(10, 20));
  world.addComponent<Shape>('material', { type: 'Shape', kind: 'box', width: 20, height: 20 });
  world.addComponent<Sprite>('material', { type: 'Sprite', textureKey: 'ingredients/silver', anchorX: 0.5, anchorY: 0.5, zOrder: 1 });
  world.createEntity('pot');
  world.addComponent<DropZone>('pot', { type: 'DropZone', hitShape: 'ellipse' });
  world.addComponent<Transform>('pot', transform(100, 100));
  world.addComponent<Shape>('pot', { type: 'Shape', kind: 'box', width: 40, height: 20 });
  return world;
}
const action = (phase: string, x?: number, y?: number, pointerId = 7) => ({ source: 'player', phase, x, y, pointerId });

describe('DragPreviewLayer（render-only）', () => {
  it('默认关闭；启用后 140ms 抬起且移动跟手，World 与 hash 逐字节不变', () => {
    const world = fixture(), before = JSON.stringify(world.snapshot()), hash = hashSnapshot(world.snapshot());
    const disabled = new DragPreviewLayer({ entityIds: [] });
    disabled.sample(action('down', 10, 20), world, 0);
    expect(disabled.frame(world, 140)).toBeNull();
    const layer = new DragPreviewLayer({ entityIds: ['material'] });
    layer.sample(action('down', 10, 20), world, 0);
    expect(layer.frame(world, 0)).toMatchObject({ x: 10, y: 20, sprite: { textureKey: 'ingredients/silver' } });
    expect(layer.frame(world, 140)!.y).toBeCloseTo(8, 6);
    layer.sample(action('move', 60, 70), world, 150);
    expect(layer.frame(world, 150)).toMatchObject({ x: 60, y: 58 });
    expect(JSON.stringify(world.snapshot())).toBe(before);
    expect(hashSnapshot(world.snapshot())).toBe(hash);
  });

  it('锅外 drag 固定 280ms ease-out 回起点；锅口 drag 消隐，短距 up 不假报合法投放', () => {
    const world = fixture();
    const rebound = new DragPreviewLayer({ entityIds: ['material'] });
    rebound.sample(action('down', 10, 20), world, 0);
    rebound.sample(action('move', 80, 80), world, 160);
    rebound.sample({ ...action('drag', 10, 20), key: 'drag', values: [80, 80] }, world, 170);
    const mid = rebound.frame(world, 310)!;
    expect(mid.x).toBeGreaterThan(10); expect(mid.x).toBeLessThan(80);
    expect(rebound.frame(world, 450)).toBeNull();

    const accepted = new DragPreviewLayer({ entityIds: ['material'] });
    accepted.sample(action('down', 10, 20), world, 0);
    accepted.sample({ ...action('drag', 10, 20), key: 'drag', values: [120, 100] }, world, 200);
    expect(accepted.frame(world, 200)).toMatchObject({ x: 120, y: 100 });
    expect(accepted.frame(world, 320)).toBeNull();

    const short = new DragPreviewLayer({ entityIds: ['material'] });
    short.sample(action('down', 10, 20), world, 0);
    short.sample(action('up', 120, 100), world, 200);
    expect(short.frame(world, 260)!.x).toBeLessThan(120);
  });

  it('第二指针不能接管；cancel、blur、实体移除、dispose 全部清预览', () => {
    const world = fixture(); const layer = new DragPreviewLayer({ entityIds: ['material'] });
    layer.sample(action('down', 10, 20), world, 0);
    layer.sample(action('down', 10, 20, 8), world, 10);
    layer.sample(action('move', 50, 50, 8), world, 20);
    expect(layer.frame(world, 20)).toMatchObject({ x: 10 });
    layer.sample(action('cancel', undefined, undefined, 7), world, 30);
    expect(layer.frame(world, 30)).toBeNull();
    layer.sample(action('down', 10, 20), world, 40);
    layer.sample({ source: 'player', phase: 'blur' }, world, 45);
    expect(layer.frame(world, 45)).toBeNull();
    layer.sample(action('down', 10, 20), world, 50);
    world.removeComponent('material', 'Sprite');
    expect(layer.frame(world, 60)).toBeNull();
    layer.dispose(); expect(layer.frame(world, 70)).toBeNull();
    layer.sample(action('down', 10, 20), world, 80);
    expect(layer.frame(world, 80)).toBeNull();
  });

  it('reduced-motion 仍跟手/反馈，但取消抬起及长距离回弹', () => {
    const world = fixture(); const layer = new DragPreviewLayer({ entityIds: ['material'], reducedMotion: true });
    layer.sample(action('down', 10, 20), world, 0);
    expect(layer.frame(world, 140)).toMatchObject({ x: 10, y: 20 });
    layer.sample(action('move', 80, 80), world, 150);
    expect(layer.frame(world, 150)).toMatchObject({ x: 80, y: 80 });
    layer.sample({ ...action('drag', 10, 20), key: 'drag', values: [80, 80] }, world, 160);
    expect(layer.frame(world, 160)).toMatchObject({ x: 10, y: 20 });
    expect(layer.frame(world, 280)).toBeNull();
  });

  it('锅口命中但材料无 Clickable 或区已有 Signal 时不假装投放成功', () => {
    for (const occupied of [false, true]) {
      const world = fixture();
      if (occupied) world.addComponent<Signal>('pot', { type: 'Signal', name: 'other', source: 'other' });
      else world.removeComponent('material', 'Clickable');
      const layer = new DragPreviewLayer({ entityIds: ['material'] });
      layer.sample(action('down', 10, 20), world, 0);
      layer.sample({ ...action('drag', 10, 20), key: 'drag', values: [120, 100] }, world, 200);
      expect(layer.frame(world, 320)).not.toBeNull(); // return=280ms；fade=120ms 此时已消失
      expect(layer.frame(world, 480)).toBeNull();
    }
  });
});
