import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Clickable, DebugTrace, Draggable, DropZone, InputQueue, Shape, Signal, Transform } from '@engine/protocol/components.js';
import { parseManifest } from '../../assembly/manifest.js';
import { dragPlaceCapability } from './drag-place.js';
import { canDropZoneEmit, findDropZoneAt, hitDropZonePoint } from './drop-zone-hit.js';

const transform = (x: number, y: number, scaleX = 1, scaleY = 1): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX, scaleY });
const shape = (width: number, height: number): Shape => ({ type: 'Shape', kind: 'box', width, height });
const zone = (hitShape?: DropZone['hitShape']): DropZone => ({ type: 'DropZone', ...(hitShape ? { hitShape } : {}) });

describe('DropZone 可选椭圆命中', () => {
  it('缺省 box 保持既有 AABB 四角；ellipse 中心、双轴端点命中而四角拒收', () => {
    const t = transform(760, 423), s = shape(246, 106);
    for (const p of [[760, 423], [883, 423], [637, 423], [760, 476], [760, 370]] as const) {
      expect(hitDropZonePoint(zone('ellipse'), t, s, p[0], p[1])).toBe(true);
    }
    for (const p of [[883, 476], [637, 370]] as const) {
      expect(hitDropZonePoint(zone(), t, s, p[0], p[1])).toBe(true);
      expect(hitDropZonePoint(zone('ellipse'), t, s, p[0], p[1])).toBe(false);
    }
  });

  it('负 scale 用绝对缩放轴；零、负、非有限半轴 fail-closed；多区按 id 首中', () => {
    const t = transform(0, 0, -2, -0.5), s = shape(20, 20);
    expect(hitDropZonePoint(zone('ellipse'), t, s, 20, 0)).toBe(true);
    expect(hitDropZonePoint(zone('ellipse'), t, s, 0, 5)).toBe(true);
    for (const bad of [shape(0, 20), shape(-20, 20), shape(Number.NaN, 20), { type: 'Shape', kind: 'box', height: 20 } as Shape]) {
      expect(hitDropZonePoint(zone('ellipse'), t, bad, 0, 0)).toBe(false);
    }
    const world = new World({ strict: true });
    for (const id of ['zone-b', 'zone-a']) {
      world.createEntity(id); world.addComponent(id, zone('ellipse'));
      world.addComponent(id, transform(0, 0)); world.addComponent(id, shape(20, 20));
    }
    expect(findDropZoneAt(world, 0, 0)).toBe('zone-a');
  });

  it('装载期拒绝未知几何值', () => {
    expect(() => parseManifest({ capabilities: ['t2-drag-place'], entities: { z: { DropZone: { type: 'DropZone', hitShape: 'triangle' } } } })).toThrow();
  });

  it('权威投放和只读预览共用判定：锅角/锅外不提交且原位，锅口代点；材料单击不提交', () => {
    const world = new World({ strict: true });
    world.createEntity('input');
    world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    world.createEntity('material');
    world.addComponent<Draggable>('material', { type: 'Draggable', onlyFlag: 'never-enabled' });
    world.addComponent<Clickable>('material', { type: 'Clickable', action: 'brew.add.silver', onlyFlag: 'never-enabled' });
    world.addComponent<Transform>('material', transform(10, 10));
    world.addComponent<Shape>('material', shape(20, 20));
    world.createEntity('cauldron');
    world.addComponent<DropZone>('cauldron', zone('ellipse'));
    world.addComponent<Transform>('cauldron', transform(100, 100));
    world.addComponent<Shape>('cauldron', shape(40, 20));
    world.createEntity('trace');
    world.addComponent<DebugTrace>('trace', { type: 'DebugTrace', events: [], max: 100 });
    const queue = world.getComponent<InputQueue>('input', 'InputQueue')!;
    const drag = (tx: number, ty: number) => { queue.actions = [{ source: 'p', key: 'drag', phase: 'drag', x: 10, y: 10, values: [tx, ty] }]; };
    const run = () => { for (const system of dragPlaceCapability.systems) system.execute(world); };
    queue.actions = [{ source: 'p', phase: 'up', x: 10, y: 10 }]; run();
    expect(world.query('Signal')).toHaveLength(0);
    drag(120, 110); run();
    expect(findDropZoneAt(world, 120, 110)).toBeNull();
    expect(world.query('Signal')).toHaveLength(0);
    expect(world.getComponent<Transform>('material', 'Transform')).toMatchObject({ x: 10, y: 10 });
    drag(400, 400); run();
    expect(world.query('Signal')).toHaveLength(0);
    expect(world.getComponent<Transform>('material', 'Transform')).toMatchObject({ x: 10, y: 10 });
    drag(120, 100); run();
    expect(findDropZoneAt(world, 120, 100)).toBe('cauldron');
    expect(world.getComponent<Signal>('cauldron', 'Signal')).toMatchObject({ name: 'brew.add.silver', source: 'material' });
    expect(canDropZoneEmit(world, 'cauldron', 'material')).toBe(false); // 本帧区载体已有 Signal，不可重复种
    expect(world.getComponent<Transform>('material', 'Transform')).toMatchObject({ x: 10, y: 10 });
  });

  it('无效椭圆半轴拒收并留可选 trace，不退回旧矩形', () => {
    const world = new World({ strict: true });
    world.createEntity('input'); world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [{ source: 'p', key: 'drag', phase: 'drag', x: 0, y: 0, values: [100, 100] }] });
    world.createEntity('material'); world.addComponent<Draggable>('material', { type: 'Draggable', onlyFlag: 'never-enabled' });
    world.addComponent<Clickable>('material', { type: 'Clickable', action: 'brew.add.silver', onlyFlag: 'never-enabled' });
    world.addComponent<Transform>('material', transform(0, 0)); world.addComponent<Shape>('material', shape(20, 20));
    world.createEntity('cauldron'); world.addComponent<DropZone>('cauldron', zone('ellipse'));
    world.addComponent<Transform>('cauldron', transform(100, 100)); world.addComponent<Shape>('cauldron', shape(0, 20));
    world.createEntity('trace'); world.addComponent<DebugTrace>('trace', { type: 'DebugTrace', events: [], max: 100 });
    for (const system of dragPlaceCapability.systems) system.execute(world);
    expect(world.query('Signal')).toHaveLength(0);
    expect(world.getComponent<Transform>('material', 'Transform')).toMatchObject({ x: 0, y: 0 });
    expect(world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.some((event) => event.kind === 'reject' && event.what.includes('非法椭圆半轴'))).toBe(true);
  });
});
