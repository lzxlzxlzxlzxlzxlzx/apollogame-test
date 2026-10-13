import type { IWorld } from '@engine/core/types.js';
import type { Clickable, DropZone, Shape, Transform } from '@engine/protocol/components.js';
import { inCircle } from '@engine/math/vec2.js';

/** 投放与 render-only 预览共用的只读判定；旧 box 分支保持原 AABB 算式。 */
export function hitDropZonePoint(zone: DropZone, transform: Transform, shape: Shape, x: number, y: number): boolean {
  const hw = ((shape.width ?? 16) / 2) * Math.abs(transform.scaleX);
  const hh = ((shape.height ?? 16) / 2) * Math.abs(transform.scaleY);
  if (zone.hitShape === undefined || zone.hitShape === 'box') {
    return Math.abs(x - transform.x) <= hw && Math.abs(y - transform.y) <= hh;
  }
  const rx = ((shape.width ?? Number.NaN) / 2) * Math.abs(transform.scaleX);
  const ry = ((shape.height ?? Number.NaN) / 2) * Math.abs(transform.scaleY);
  if (zone.hitShape !== 'ellipse' || !Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0
    || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(transform.x) || !Number.isFinite(transform.y)) return false;
  const nx = (x - transform.x) / rx;
  const ny = (y - transform.y) / ry;
  return nx * nx + ny * ny <= 1;
}

/** 多投放区按实体 ID 全序首中；不写 World，预览调用也不会提交 Signal。 */
export function findDropZoneAt(world: IWorld, x: number, y: number, onInvalidEllipse?: (id: string) => void): string | null {
  const zones: string[] = [];
  for (const [id] of world.query('DropZone')) zones.push(id);
  zones.sort();
  for (const id of zones) {
    const zone = world.getComponent<DropZone>(id, 'DropZone');
    const transform = world.getComponent<Transform>(id, 'Transform');
    const shape = world.getComponent<Shape>(id, 'Shape');
    if (!zone || !transform || !shape) continue;
    if (zone.hitShape === 'ellipse') {
      const rx = ((shape.width ?? Number.NaN) / 2) * Math.abs(transform.scaleX);
      const ry = ((shape.height ?? Number.NaN) / 2) * Math.abs(transform.scaleY);
      if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) onInvalidEllipse?.(id);
    }
    if (hitDropZonePoint(zone, transform, shape, x, y)) return id;
  }
  return null;
}

/** 权威拖放与本地预览共用的抓取判定；按实体 ID 首中。 */
export function findDraggableAt(world: IWorld, x: number, y: number): string | null {
  const ids: string[] = [];
  for (const [id] of world.query('Draggable')) ids.push(id);
  ids.sort();
  for (const id of ids) {
    const t = world.getComponent<Transform>(id, 'Transform');
    const sh = world.getComponent<Shape>(id, 'Shape');
    if (!t || !sh) continue;
    if (sh.kind === 'circle') {
      const rr = sh.radius ?? 8;
      if (inCircle(x, y, t.x, t.y, rr)) return id;
    } else {
      const w = (sh.width ?? 16) / 2, h = (sh.height ?? 16) / 2;
      if (Math.abs(x - t.x) <= w && Math.abs(y - t.y) <= h) return id;
    }
  }
  return null;
}

/** 同一帧投放代点的只读前置门；预览只显示“有可能提交”，不自行发信号。 */
export function canDropZoneEmit(world: IWorld, zoneId: string, sourceId: string): boolean {
  return !!world.getComponent<Clickable>(sourceId, 'Clickable') && !world.hasComponent(zoneId, 'Signal');
}
