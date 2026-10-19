import { clickableHalfExtents, clickableMaskPlan, type ClickableTarget } from '@engine/protocol/clickable-hit-test.js';

/** Read-only world anchor for a keyboard mirror; never changes the authoritative hit target. */
export function focusLabelWorldPoint(target: ClickableTarget, placement: 'center' | 'above' = 'center'): { x: number; y: number } {
  if (placement !== 'above') return { x: target.t.x, y: target.t.y };
  if (target.click.hitMaskKey) {
    const plan = clickableMaskPlan(target);
    if (plan) {
      const a = target.t.y + plan.destination.y * target.t.scaleY;
      const b = target.t.y + (plan.destination.y + plan.destination.height) * target.t.scaleY;
      return { x: target.t.x, y: Math.min(a, b) };
    }
  }
  if (target.s) return { x: target.t.x, y: target.t.y - clickableHalfExtents(target.t, target.s).hh };
  return { x: target.t.x, y: target.t.y };
}
