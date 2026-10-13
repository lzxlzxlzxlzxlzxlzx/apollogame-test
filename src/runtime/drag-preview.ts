import type { IWorld } from '@engine/core/types.js';
import type { Color, Draggable, Frame, RawInputData, Shape, Sprite, Transform } from '@engine/protocol/components.js';
import { canDropZoneEmit, findDraggableAt, findDropZoneAt } from '@skills/tier2/drop-zone-hit.js';

export interface DragPreviewOptions {
  /** 显式开启的材料实体 ID；空表/未传本层即不工作。 */
  readonly entityIds: readonly string[];
  readonly reducedMotion?: boolean;
  readonly liftPx?: number;
}

export interface DragPreviewFrame {
  readonly entityId: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
  readonly tint: number;
  readonly sprite: Sprite;
  readonly frameIndex?: number;
  readonly fallbackWidth: number;
  readonly fallbackHeight: number;
}

interface ActivePreview {
  entityId: string;
  source: string;
  pointerId?: number;
  sprite: Sprite;
  frameIndex?: number;
  tint: number;
  sourceAlpha: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  fallbackWidth: number;
  fallbackHeight: number;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  startedMs: number;
  settledMs?: number;
  settledX?: number;
  settledY?: number;
  mode: 'held' | 'return' | 'fade';
}

const LIFT_MS = 140;
const RETURN_MS = 280;
const FADE_MS = 120;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const progress = (elapsed: number, duration: number): number => Math.max(0, Math.min(1, elapsed / duration));

/** 纯本地表现：持有拖动影像，不向 World 写组件/Signal，也不进入快照和 hash。 */
export class DragPreviewLayer {
  private active: ActivePreview | null = null;
  private disposed = false;
  private readonly enabled: ReadonlySet<string>;
  private readonly reducedMotion: boolean;

  constructor(private readonly options: DragPreviewOptions) {
    this.enabled = new Set(options.entityIds);
    this.reducedMotion = options.reducedMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  sample(input: RawInputData, world: IWorld, nowMs: number): void {
    if (this.disposed || this.enabled.size === 0) return;
    const phase = input.phase;
    if (phase === 'blur') { this.clear(); return; }
    if (phase === 'down') {
      if (this.active?.mode === 'held' || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return;
      const id = findDraggableAt(world, input.x!, input.y!);
      if (!id || !this.enabled.has(id) || !world.getComponent<Draggable>(id, 'Draggable')) return;
      const t = world.getComponent<Transform>(id, 'Transform');
      const sprite = world.getComponent<Sprite>(id, 'Sprite');
      if (!t || !sprite || !sprite.textureKey) return;
      const frame = world.getComponent<Frame>(id, 'Frame');
      const color = world.getComponent<Color>(id, 'Color');
      const shape = world.getComponent<Shape>(id, 'Shape');
      this.active = {
        entityId: id, source: input.source, pointerId: input.pointerId, sprite,
        frameIndex: frame?.index, tint: color?.tint ?? 0xe2e8f0, sourceAlpha: color?.alpha ?? 1,
        rotation: t.rotation, scaleX: t.scaleX, scaleY: t.scaleY,
        fallbackWidth: shape?.width ?? 16, fallbackHeight: shape?.height ?? 16,
        originX: t.x, originY: t.y, offsetX: t.x - input.x!, offsetY: t.y - input.y!,
        x: t.x, y: t.y, startedMs: nowMs, mode: 'held',
      };
      return;
    }
    const active = this.active;
    if (!active || active.mode !== 'held' || input.source !== active.source
      || (active.pointerId !== undefined && active.pointerId !== input.pointerId)) return;
    if (phase === 'cancel') { this.clear(); return; }
    if (phase !== 'move' && phase !== 'up' && phase !== 'drag') return;
    const x = phase === 'drag' ? input.values?.[0] : input.x;
    const y = phase === 'drag' ? input.values?.[1] : input.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) { this.clear(); return; }
    active.x = x! + active.offsetX;
    active.y = y! + active.offsetY;
    if (phase === 'move') return;
    active.settledMs = nowMs;
    active.settledX = active.x;
    active.settledY = active.y;
    const zone = phase === 'drag' ? findDropZoneAt(world, x!, y!) : null;
    active.mode = zone && canDropZoneEmit(world, zone, active.entityId) ? 'fade' : 'return';
  }

  frame(world: IWorld, nowMs: number): DragPreviewFrame | null {
    if (this.disposed) return null;
    const active = this.active;
    if (!active) return null;
    if (!world.getComponent<Draggable>(active.entityId, 'Draggable') || !world.getComponent<Sprite>(active.entityId, 'Sprite')) {
      this.clear(); return null;
    }
    let x = active.x, y = active.y, alpha = active.sourceAlpha;
    if (active.mode === 'held') {
      if (!this.reducedMotion) y -= (this.options.liftPx ?? 12) * easeOut(progress(nowMs - active.startedMs, LIFT_MS));
    } else {
      const elapsed = Math.max(0, nowMs - active.settledMs!);
      const duration = active.mode === 'fade' || this.reducedMotion ? FADE_MS : RETURN_MS;
      const t = progress(elapsed, duration);
      if (t >= 1) { this.clear(); return null; }
      if (active.mode === 'return') {
        const eased = this.reducedMotion ? 1 : easeOut(t);
        x = active.settledX! + (active.originX - active.settledX!) * eased;
        y = active.settledY! + (active.originY - active.settledY!) * eased;
      }
      alpha *= 1 - t;
    }
    return {
      entityId: active.entityId, x, y, rotation: active.rotation, scaleX: active.scaleX, scaleY: active.scaleY,
      alpha, tint: active.tint, sprite: active.sprite, frameIndex: active.frameIndex,
      fallbackWidth: active.fallbackWidth, fallbackHeight: active.fallbackHeight,
    };
  }

  clear(): void { this.active = null; }
  dispose(): void { this.clear(); this.disposed = true; }
}
