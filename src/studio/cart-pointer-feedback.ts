import type { IWorld } from '@engine/core/types.js';
import { collectClickableTargets, pickClickableTarget, type ClickableTarget } from '@engine/protocol/clickable-hit-test.js';
import { getCameraView, screenToWorld } from '@engine/protocol/camera-view.js';
import { canvasPointerToScreen } from '@net/host/queued-input.js';
import type { PointerFeedbackFrame } from '@renderer/pointer-feedback2d.js';
import type { CartPresentation } from '../assembly/cart-presentation.js';

export const pointerToneForTarget = (target: NonNullable<CartPresentation['focusTargets']>[number] | undefined,
  fallback: NonNullable<CartPresentation['pointerFeedback']>['tone']): 'cyan' | 'gold' | 'jade' => target?.tone ?? fallback;

/** Browser-local pointer state. Never enqueues move, mutates World, or changes gameplay hit semantics. */
export class CartPointerFeedback {
  private canvas: HTMLCanvasElement | null = null;
  private worldNow: (() => IWorld) | null = null;
  private client: { x: number; y: number } | null = null;
  private pressed: { target: ClickableTarget; until: number } | null = null;
  private oldCursor = '';
  private readonly targets: Map<string, NonNullable<CartPresentation['focusTargets']>[number]>;
  current: { entity: string; mode: 'hover' | 'pressed' } | null = null;

  constructor(
    private readonly presentation: CartPresentation,
    private readonly width: number,
    private readonly height: number,
    private readonly flag: (world: IWorld, name: string) => boolean,
  ) {
    this.targets = new Map((presentation.focusTargets ?? []).map((target) => [target.entity, target]));
  }

  attach(canvas: HTMLCanvasElement, worldNow: () => IWorld): void {
    this.canvas = canvas;
    this.worldNow = worldNow;
    this.oldCursor = canvas.style.cursor;
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointercancel', this.onLeave);
    window.addEventListener('blur', this.onLeave);
  }

  frame(world: IWorld, nowMs: number): PointerFeedbackFrame | null {
    if (!this.canvas) return null;
    if (this.pressed && nowMs < this.pressed.until) {
      this.current = { entity: this.pressed.target.eid, mode: 'pressed' };
      this.canvas.style.cursor = 'pointer';
      return { target: this.pressed.target, mode: 'pressed', tone: pointerToneForTarget(this.targets.get(this.pressed.target.eid), this.presentation.pointerFeedback!.tone), visual: this.presentation.pointerFeedback!.visual };
    }
    this.pressed = null;
    const point = this.worldPoint(world);
    const picked = point ? pickClickableTarget(collectClickableTargets(world), point.x, point.y, 'any') : undefined;
    const target = picked ? this.targets.get(picked.eid) : undefined;
    if (!picked || !target || target.when && !this.flag(world, target.when)) {
      this.current = null;
      this.canvas.style.cursor = this.oldCursor;
      return null;
    }
    this.current = { entity: picked.eid, mode: 'hover' };
    this.canvas.style.cursor = 'pointer';
    return { target: picked, mode: 'hover', tone: pointerToneForTarget(target, this.presentation.pointerFeedback!.tone), visual: this.presentation.pointerFeedback!.visual };
  }

  dispose(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.removeEventListener('pointermove', this.onMove);
    canvas.removeEventListener('pointerdown', this.onDown);
    canvas.removeEventListener('pointerup', this.onUp);
    canvas.removeEventListener('pointerleave', this.onLeave);
    canvas.removeEventListener('pointercancel', this.onLeave);
    window.removeEventListener('blur', this.onLeave);
    canvas.style.cursor = this.oldCursor;
    this.canvas = null; this.worldNow = null; this.client = null; this.pressed = null; this.current = null;
  }

  private readonly onMove = (event: PointerEvent): void => { this.client = { x: event.clientX, y: event.clientY }; };
  private readonly onLeave = (): void => { this.client = null; this.current = null; };
  private readonly onDown = (event: PointerEvent): void => { this.press(event, 'down'); };
  private readonly onUp = (event: PointerEvent): void => { if (!this.pressed) this.press(event, 'up'); };

  private press(event: PointerEvent, phase: 'down' | 'up'): void {
    if (!this.worldNow) return;
    this.client = { x: event.clientX, y: event.clientY };
    const world = this.worldNow();
    const point = this.worldPoint(world);
    const picked = point ? pickClickableTarget(collectClickableTargets(world), point.x, point.y, phase) : undefined;
    const target = picked ? this.targets.get(picked.eid) : undefined;
    if (!picked || !target || target.when && !this.flag(world, target.when)) return;
    this.pressed = { target: picked, until: performance.now() + this.presentation.pointerFeedback!.pressedMs };
  }

  private worldPoint(world: IWorld): { x: number; y: number } | null {
    if (!this.canvas || !this.client) return null;
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const dpr = window.devicePixelRatio || 1;
    const screen = canvasPointerToScreen(this.client.x, this.client.y, rect, canvas.width / dpr, canvas.height / dpr);
    if (screen.x < 0 || screen.y < 0 || screen.x >= this.width || screen.y >= this.height) return null;
    return screenToWorld(screen.x, screen.y, getCameraView(world), this.width, this.height);
  }
}
