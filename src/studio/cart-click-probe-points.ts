import type { CameraView } from '../engine/protocol/camera-view.js';
import { clickableMaskPlan, hitClickableTarget, pickClickableTarget, type ClickableTarget } from '../engine/protocol/clickable-hit-test.js';

export interface CartMaskProbePoint { readonly x: number; readonly y: number }
export interface CartMaskProbeTarget {
  readonly id: string;
  readonly action: string;
  readonly solid: CartMaskProbePoint;
  readonly transparent?: CartMaskProbePoint;
  readonly hasTransparent: boolean;
}

/** Dev probe only: invert the authoritative Sprite draw plan, then verify with the real hit predicate. */
export function cartMaskProbeTargets(
  targets: readonly ClickableTarget[], camera: CameraView | null, width: number, height: number,
): CartMaskProbeTarget[] {
  const project = (x: number, y: number): CartMaskProbePoint => camera
    ? { x: (x - camera.centerX) * camera.zoom + width / 2, y: (y - camera.centerY) * camera.zoom + height / 2 }
    : { x, y };
  const inside = ({ x, y }: CartMaskProbePoint): boolean => Number.isFinite(x) && Number.isFinite(y)
    && x >= 1 && y >= 1 && x < width - 1 && y < height - 1;
  const out: CartMaskProbeTarget[] = [];
  for (const target of [...targets].filter((item) => !!item.click.hitMaskKey).sort((a, b) => a.eid.localeCompare(b.eid))) {
    const mask = target.mask;
    const plan = clickableMaskPlan(target);
    if (!mask || !plan) continue;
    let solid: CartMaskProbePoint | undefined;
    let transparent: CartMaskProbePoint | undefined;
    let hasTransparent = false;
    const source = plan.source, dest = plan.destination;
    const margin = Math.min(mask.width, mask.height) >= 8 ? 2 : 0;
    const tryPixel = (mx: number, my: number): void => {
      const bit = mask.rows[my]?.[mx];
      if (bit !== '0' && bit !== '1') return;
      const px = mx + 0.5, py = my + 0.5;
      if (px < source.x || py < source.y || px >= source.x + source.width || py >= source.y + source.height) return;
      if (margin && [
        mask.rows[my - margin]?.[mx], mask.rows[my + margin]?.[mx],
        mask.rows[my]?.[mx - margin], mask.rows[my]?.[mx + margin],
      ].some((neighbor) => neighbor !== bit)) return;
      const localX = dest.x + (px - source.x) * dest.width / source.width;
      const localY = dest.y + (py - source.y) * dest.height / source.height;
      const worldX = target.t.x + localX * target.t.scaleX;
      const worldY = target.t.y + localY * target.t.scaleY;
      const screen = project(worldX, worldY);
      if (!inside(screen)) return;
      const result = hitClickableTarget(worldX, worldY, target);
      if (bit === '1' && !solid && result === 'hit'
        && pickClickableTarget(targets, worldX, worldY, 'any')?.eid === target.eid) solid = screen;
      if (bit === '0' && result === 'transparent') {
        hasTransparent = true;
        if (!transparent && !pickClickableTarget(targets, worldX, worldY, 'any')) transparent = screen;
      }
    };
    const stride = Math.max(1, Math.floor(Math.min(mask.width, mask.height) / 48));
    for (const step of [stride, 1]) {
      for (let my = Math.floor(step / 2); my < mask.height && (!solid || !transparent); my += step) {
        for (let mx = Math.floor(step / 2); mx < mask.width && (!solid || !transparent); mx += step) tryPixel(mx, my);
      }
      if (solid && (!hasTransparent || transparent)) break;
    }
    if (solid) out.push({ id: target.eid, action: target.click.action, solid, transparent, hasTransparent });
  }
  return out;
}
