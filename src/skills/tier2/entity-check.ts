import type { IWorld } from '@engine/core/types.js';
import type { EntityCheck, FrameStartTransform, Resource, Tag, Status, GameFlow, Shape,Transform } from '@engine/protocol/components.js';

/** Circle eligibility radius uses the very same Shape and uniform scale as collision. */
export function effectiveCheckRange(world:IWorld,target:string,range:NonNullable<EntityCheck['range']>):number {
  if(!range.includeTargetRadius)return range.max;
  const shape=world.getComponent<Shape>(target,'Shape'),t=world.getComponent<Transform>(target,'Transform');
  if(shape?.kind!=='circle'||!t||!Number.isFinite(shape.radius)||shape.radius!<0||!Number.isFinite(t.scaleX)||Math.abs(t.scaleX)!==Math.abs(t.scaleY))return NaN;
  return range.max+shape.radius!*Math.abs(t.scaleX);
}

// No cached spatial index: spatial decisions read frame-start positions; life/status are current.
// Does not inspect DestroyRequest: late effect consumers must check pending destruction separately.
export function checkEntity(world: IWorld, entityId: string | undefined, check: EntityCheck): boolean {
  if (!entityId || !world.getAllEntities().includes(entityId)) return false;
  if (check.aliveResource !== undefined) {
    const r = world.getComponent<Resource>(entityId, 'Resource');
    if (!r || r.id !== check.aliveResource || !Number.isFinite(r.current) || r.current <= 0) return false;
  }
  if (check.resource) {
    const query = check.resource;
    const r = world.getComponent<Resource>(entityId, 'Resource');
    const min = query.min ?? -Infinity, max = query.max ?? Infinity;
    if(query.field!==undefined&&query.field!=='current'&&query.field!=='max')return false;
    const value=query.field==='max'?r?.max:r?.current;
    if (!r || r.id !== query.id || value===undefined || !Number.isFinite(value)
      || (query.min !== undefined && !Number.isFinite(min))
      || (query.max !== undefined && !Number.isFinite(max)) || min > max
      || value < min || value > max) return false;
  }
  if (check.tagMask !== undefined) {
    const tag = world.getComponent<Tag>(entityId, 'Tag');
    if (!Number.isInteger(check.tagMask) || !tag || (tag.flags & check.tagMask) !== check.tagMask) return false;
  }
  if (check.rejectStatusMask !== undefined) {
    if (!Number.isInteger(check.rejectStatusMask)) return false;
    const status = world.getComponent<Status>(entityId, 'Status');
    if (((status?.flags ?? 0) & check.rejectStatusMask) !== 0) return false;
  }
  if (check.range) {
    const t = world.getComponent<FrameStartTransform>(entityId, 'FrameStartTransform');
    const from = world.getComponent<FrameStartTransform>(check.range.originEntity, 'FrameStartTransform');
    const max = effectiveCheckRange(world,entityId,check.range);
    const min = check.range.min ?? 0;
    if (!t || !from || !Number.isFinite(max) || !Number.isFinite(min) || min < 0 || max < min) return false;
    const d2 = (t.x - from.x) ** 2 + (t.y - from.y) ** 2;
    if (!Number.isFinite(d2) || d2 < min * min || d2 > max * max) return false;
  }
  if (check.neighborhood) {
    const n = check.neighborhood;
    const center = world.getComponent<FrameStartTransform>(entityId, 'FrameStartTransform');
    const min = n.count.min ?? 0;
    const max = n.count.max ?? Infinity;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)
      || !Number.isFinite(n.radius) || n.radius < 0
      || !Number.isInteger(min) || min < 0
      || (n.count.max !== undefined && !Number.isInteger(max)) || max < min
      || (n.tagMask !== undefined && !Number.isInteger(n.tagMask))) return false;
    let count = 0;
    for (const other of world.getAllEntities()) {
      if (other === entityId) continue;
      const position = world.getComponent<FrameStartTransform>(other, 'FrameStartTransform');
      if (!position) continue;
      const d2 = (position.x - center.x) ** 2 + (position.y - center.y) ** 2;
      if (!Number.isFinite(d2) || d2 > n.radius * n.radius) continue;
      if (n.tagMask !== undefined) {
        const tag = world.getComponent<Tag>(other, 'Tag');
        if (!tag || (tag.flags & n.tagMask) !== n.tagMask) continue;
      }
      if (n.aliveResource !== undefined) {
        const hp = world.getComponent<Resource>(other, 'Resource');
        if (!hp || hp.id !== n.aliveResource || !Number.isFinite(hp.current) || hp.current <= 0) continue;
      }
      count++;
      if (count > max) return false;
    }
    if (count < min) return false;
  }
  return true;
}

export function checkEntityExpression(world: IWorld, expr: { entityId?: string; targetFlow?: string; check: EntityCheck }): boolean {
  // Exactly one address, fail closed for invalid/both/missing addresses.
  if (!!expr.entityId === !!expr.targetFlow) return false;
  const id = expr.targetFlow
    ? world.getComponent<GameFlow>(expr.targetFlow, 'GameFlow')?.targetSnapshot?.targetId
    : expr.entityId;
  return checkEntity(world, id, expr.check);
}
