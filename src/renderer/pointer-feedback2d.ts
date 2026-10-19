import type { DeviceBase } from './canvas-transform.js';
import { entityMatrix } from './canvas-transform.js';
import type { ClickableTarget } from '@engine/protocol/clickable-hit-test.js';
import { clickableHalfExtents, clickableMaskPlan } from '@engine/protocol/clickable-hit-test.js';
import type { HitMaskSpec } from '@engine/protocol/hit-mask.js';

/** Local visual state only. It is never a World component, signal, or snapshot field. */
export interface PointerFeedbackFrame {
  readonly target: ClickableTarget;
  readonly mode: 'hover' | 'pressed';
  readonly tone: 'cyan' | 'gold' | 'jade';
  readonly visual?: PointerFeedbackVisual;
}

/** Bounded presentation-only styling; parser rejects arbitrary colors or CSS. */
export interface PointerFeedbackVisual {
  readonly colors?: Partial<Record<PointerFeedbackFrame['tone'], string>>;
  readonly hoverAlpha?: number;
  readonly pressedAlpha?: number;
  readonly hoverGlowBlur?: number;
  readonly pressedGlowBlur?: number;
  readonly pressedBrightness?: number;
}

const PALETTE = {
  cyan: [96, 226, 241],
  gold: [245, 207, 117],
  jade: [144, 223, 173],
} as const;
function toneRgb(tone: PointerFeedbackFrame['tone'], visual?: PointerFeedbackVisual, pressed = false): [number, number, number] {
  const custom = visual?.colors?.[tone];
  const base = custom && /^#[\da-fA-F]{6}$/.test(custom)
    ? [1, 3, 5].map((at) => parseInt(custom.slice(at, at + 2), 16))
    : [...PALETTE[tone]];
  const brightness = pressed ? Math.max(1, Math.min(2, visual?.pressedBrightness ?? 1)) : 1;
  return base.map((part) => Math.min(255, Math.round(part * brightness))) as [number, number, number];
}
export const pointerFeedbackToneColor = (tone: PointerFeedbackFrame['tone'], visual?: PointerFeedbackVisual): string => {
  const [r, g, b] = toneRgb(tone, visual);
  return `rgb(${r},${g},${b})`;
};

/** Canvas backend owns silhouette pixels; game data only chooses a closed semantic tone. */
export class PointerFeedback2DLayer {
  private cachedMask: HitMaskSpec | null = null;
  private cachedTone = '';
  private cachedMode = '';
  private cachedVisual = '';
  private cachedArt: HTMLCanvasElement | null = null;

  draw(ctx: CanvasRenderingContext2D, base: DeviceBase, frame: PointerFeedbackFrame): void {
    const { target, mode, tone, visual } = frame;
    const pressed = mode === 'pressed';
    const [r, g, b] = toneRgb(tone, visual, pressed);
    const rgb = `rgb(${r},${g},${b})`;
    ctx.globalAlpha = 1;
    ctx.shadowColor = rgb;
    ctx.shadowBlur = Math.max(0, Math.min(32, pressed ? visual?.pressedGlowBlur ?? 15 : visual?.hoverGlowBlur ?? 10));
    if (target.click.hitMaskKey) {
      const plan = clickableMaskPlan(target);
      if (!plan || !target.mask) { this.resetContext(ctx); return; }
      const art = this.maskArt(target.mask, tone, mode, visual);
      const squeeze = pressed ? 0.95 : 1;
      ctx.setTransform(...entityMatrix(base, target.t.x, target.t.y, 0, target.t.scaleX * squeeze, target.t.scaleY * squeeze));
      ctx.drawImage(art,
        plan.source.x, plan.source.y, plan.source.width, plan.source.height,
        plan.destination.x, plan.destination.y, plan.destination.width, plan.destination.height);
    } else if (target.s) {
      const { hw, hh } = clickableHalfExtents(target.t, target.s);
      const squeeze = pressed ? 0.95 : 1;
      ctx.setTransform(base.s, 0, 0, base.s, base.e, base.f);
      ctx.lineWidth = Math.max(1 / Math.abs(base.s), 2 / Math.abs(base.s));
      ctx.strokeStyle = rgb;
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0, Math.min(1, pressed ? visual?.pressedAlpha ?? 0.28 : visual?.hoverAlpha ?? 0.12))})`;
      ctx.fillRect(target.t.x - hw * squeeze, target.t.y - hh * squeeze, hw * 2 * squeeze, hh * 2 * squeeze);
      ctx.strokeRect(target.t.x - hw * squeeze, target.t.y - hh * squeeze, hw * 2 * squeeze, hh * 2 * squeeze);
    }
    this.resetContext(ctx);
  }

  dispose(): void { this.cachedArt = null; this.cachedMask = null; }

  private resetContext(ctx: CanvasRenderingContext2D): void {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
  }

  private maskArt(mask: HitMaskSpec, tone: PointerFeedbackFrame['tone'], mode: PointerFeedbackFrame['mode'], visual?: PointerFeedbackVisual): HTMLCanvasElement {
    const visualKey = JSON.stringify(visual ?? null);
    if (this.cachedMask === mask && this.cachedTone === tone && this.cachedMode === mode && this.cachedVisual === visualKey && this.cachedArt) return this.cachedArt;
    const canvas = document.createElement('canvas');
    canvas.width = mask.width; canvas.height = mask.height;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(mask.width, mask.height);
    const [r, g, b] = toneRgb(tone, visual, mode === 'pressed');
    const fillAlpha = Math.round(Math.max(0, Math.min(1, mode === 'pressed' ? visual?.pressedAlpha ?? 150 / 255 : visual?.hoverAlpha ?? 70 / 255)) * 255);
    for (let y = 0; y < mask.height; y++) {
      const row = mask.rows[y];
      for (let x = 0; x < mask.width; x++) {
        if (row[x] !== '1') continue;
        const edge = x === 0 || x === mask.width - 1 || y === 0 || y === mask.height - 1
          || row[x - 1] !== '1' || row[x + 1] !== '1'
          || mask.rows[y - 1][x] !== '1' || mask.rows[y + 1][x] !== '1';
        const i = (y * mask.width + x) * 4;
        image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b;
        image.data[i + 3] = edge ? 255 : fillAlpha;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.cachedMask = mask; this.cachedTone = tone; this.cachedMode = mode; this.cachedVisual = visualKey; this.cachedArt = canvas;
    return canvas;
  }
}
