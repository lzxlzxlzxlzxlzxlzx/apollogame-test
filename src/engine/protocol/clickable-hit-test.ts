import type { IWorld } from '../core/types.js';
import type { Clickable, Flag, Shape, Sprite, Transform } from './components.js';
import type { HitMaskSpec } from './hit-mask.js';
import { parseHitMaskSpec } from './hit-mask.js';
import { HOST_MASK_PREFIX, resolveHostHitMask } from './host-hit-mask-catalog.js';
import { planSpriteDraw, type SpriteDrawPlan } from './sprite-layout.js';

/** The authoritative, pure geometry used by both t2-clickable and local pointer feedback. */
export interface ClickableTarget {
  readonly eid: string;
  readonly t: Transform;
  readonly s?: Shape;
  readonly sprite?: Sprite;
  readonly z: number;
  readonly click: Clickable;
  readonly mask: HitMaskSpec | null;
}

export type ClickableHitResult = 'hit' | 'outside' | 'transparent' | 'invalid-mask';

export function resolveClickableMask(world: IWorld, click: Clickable): HitMaskSpec | null {
  if (!click.hitMaskKey) return null;
  const root = (world as IWorld & { root?: object }).root ?? world;
  const value = click.hitMaskKey.startsWith(HOST_MASK_PREFIX)
    ? resolveHostHitMask(root, click.hitMaskKey) : click.hitMask;
  return parseHitMaskSpec(value);
}

/** Called once per sim tick or once per render-local pointer sample; onlyFlag is read-only. */
export function collectClickableTargets(world: IWorld): ClickableTarget[] {
  const flags = new Map<string, boolean>();
  for (const [fid] of world.query('Flag')) {
    const f = world.getComponent<Flag>(fid, 'Flag');
    if (f) flags.set(f.id, f.active);
  }
  const targets: ClickableTarget[] = [];
  for (const [eid] of world.query('Clickable', 'Transform')) {
    const click = world.getComponent<Clickable>(eid, 'Clickable')!;
    if (click.onlyFlag && !flags.get(click.onlyFlag)) continue;
    const t = world.getComponent<Transform>(eid, 'Transform')!;
    const s = world.getComponent<Shape>(eid, 'Shape');
    if (!s && !click.hitMaskKey) continue;
    const sprite = world.getComponent<Sprite>(eid, 'Sprite');
    targets.push({ eid, t, s, sprite, z: sprite?.zOrder ?? 0, click, mask: resolveClickableMask(world, click) });
  }
  return targets;
}

/** `any` is for hover disclosure only; gameplay passes the queued input phase unchanged. */
export function pickClickableTarget(
  targets: readonly ClickableTarget[], x: number, y: number, phase: string | 'any',
  onReject?: (eid: string, reason: Exclude<ClickableHitResult, 'hit' | 'outside'>) => void,
): ClickableTarget | undefined {
  let best: ClickableTarget | undefined;
  for (const target of targets) {
    if (phase !== 'any' && phase !== (target.click.phase ?? 'down')) continue;
    const result = hitClickableTarget(x, y, target);
    if (result !== 'hit' && result !== 'outside') onReject?.(target.eid, result);
    if (result === 'hit' && (!best || target.z > best.z || (target.z === best.z && target.eid < best.eid))) best = target;
  }
  return best;
}

export function hitClickableTarget(x: number, y: number, target: ClickableTarget): ClickableHitResult {
  if (target.click.hitMaskKey) return maskedHit(x, y, target);
  if (!target.s) return 'outside';
  const { hw, hh } = clickableHalfExtents(target.t, target.s);
  return Math.abs(x - target.t.x) <= hw && Math.abs(y - target.t.y) <= hh ? 'hit' : 'outside';
}

/** Shared fail-closed Sprite mapping, also used by the render-only silhouette. */
export function clickableMaskPlan(target: ClickableTarget): SpriteDrawPlan | null {
  const { t, sprite, mask } = target;
  if (!target.click.hitMaskKey || !mask || !sprite || sprite.textureKey !== mask.sourceTextureKey
    || !Number.isFinite(t.x) || !Number.isFinite(t.y)
    || t.rotation !== 0 || !Number.isFinite(t.scaleX) || !Number.isFinite(t.scaleY)
    || t.scaleX === 0 || t.scaleY === 0
    || (sprite.width !== undefined || sprite.height !== undefined || sprite.fit !== undefined)
      && (!(sprite.width! > 0) || !(sprite.height! > 0) || !['cover', 'contain'].includes(sprite.fit ?? '')))
    return null;
  return planSpriteDraw(sprite, { sx: 0, sy: 0, sw: mask.width, sh: mask.height });
}

/** World-aligned extents are intentionally the same circle/polygon AABB approximation as legacy Clickable. */
export function clickableHalfExtents(t: Transform, s: Shape): { hw: number; hh: number } {
  let hw = 0;
  let hh = 0;
  if (s.kind === 'box') {
    hw = (s.width ?? 0) / 2;
    hh = (s.height ?? 0) / 2;
  } else if (s.kind === 'circle') {
    hw = s.radius ?? 0;
    hh = hw;
  } else if (s.kind === 'polygon' && s.vertices) {
    for (let i = 0; i + 1 < s.vertices.length; i += 2) {
      hw = Math.max(hw, Math.abs(s.vertices[i]));
      hh = Math.max(hh, Math.abs(s.vertices[i + 1]));
    }
  }
  return { hw: hw * Math.abs(t.scaleX), hh: hh * Math.abs(t.scaleY) };
}

/** World point -> the same Sprite draw plan and binary pixel as t2-clickable. */
function maskedHit(x: number, y: number, target: ClickableTarget): ClickableHitResult {
  const plan = clickableMaskPlan(target);
  if (!plan || !Number.isFinite(x) || !Number.isFinite(y)) return 'invalid-mask';
  const { t, mask } = target;
  const dx = x - t.x;
  const dy = y - t.y;
  const lx = dx / t.scaleX;
  const ly = dy / t.scaleY;
  const d = plan.destination;
  if (lx < d.x || ly < d.y || lx >= d.x + d.width || ly >= d.y + d.height) return 'outside';
  const mx = Math.floor(plan.source.x + (lx - d.x) * plan.source.width / d.width);
  const my = Math.floor(plan.source.y + (ly - d.y) * plan.source.height / d.height);
  if (mx < 0 || my < 0 || mx >= mask!.width || my >= mask!.height) return 'outside';
  return mask!.rows[my][mx] === '1' ? 'hit' : 'transparent';
}
