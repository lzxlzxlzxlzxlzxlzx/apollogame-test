import { describe, expect, it } from 'vitest';
import { PointerFeedback2DLayer, pointerFeedbackToneColor } from './pointer-feedback2d.js';
import type { ClickableTarget } from '@engine/protocol/clickable-hit-test.js';

const target = { eid: 'clock', t: { type: 'Transform', x: 50, y: 60, rotation: 0, scaleX: 1, scaleY: 1 },
  s: { type: 'Shape', kind: 'box', width: 20, height: 20 }, click: { type: 'Clickable', action: 'inspect' }, mask: null, z: 0 } as ClickableTarget;

function drawn(mode: 'hover' | 'pressed', visual?: { colors?: { cyan?: string }; hoverAlpha?: number; pressedAlpha?: number; hoverGlowBlur?: number; pressedGlowBlur?: number; pressedBrightness?: number }) {
  const ctx = { globalAlpha: 0, shadowBlur: 0, shadowColor: '', lineWidth: 0, strokeStyle: '', fillStyle: '',
    setTransform: () => {}, fillRect: () => {}, strokeRect: () => {} } as unknown as CanvasRenderingContext2D;
  const sampled: Record<string, unknown> = {};
  (ctx as unknown as { fillRect: () => void }).fillRect = () => {
    sampled.fill = ctx.fillStyle; sampled.shadow = ctx.shadowColor; sampled.blur = ctx.shadowBlur;
  };
  new PointerFeedback2DLayer().draw(ctx, { s: 1, e: 0, f: 0 }, { target, mode, tone: 'cyan', visual });
  return sampled;
}

describe('pointer feedback bounded visual tuning', () => {
  it('preserves default palette/alpha/blur', () => {
    expect(pointerFeedbackToneColor('cyan')).toBe('rgb(96,226,241)');
    expect(drawn('hover')).toEqual({ fill: 'rgba(96,226,241,0.12)', shadow: 'rgb(96,226,241)', blur: 10 });
  });

  it('applies an opt-in tone color, alpha, glow and pressed brightness without changing hit geometry', () => {
    const visual = { colors: { cyan: '#4080a0' }, hoverAlpha: 0.24, pressedAlpha: 0.6,
      hoverGlowBlur: 9, pressedGlowBlur: 14, pressedBrightness: 1.45 };
    expect(pointerFeedbackToneColor('cyan', visual)).toBe('rgb(64,128,160)');
    expect(drawn('hover', visual)).toEqual({ fill: 'rgba(64,128,160,0.24)', shadow: 'rgb(64,128,160)', blur: 9 });
    expect(drawn('pressed', visual)).toEqual({ fill: 'rgba(93,186,232,0.6)', shadow: 'rgb(93,186,232)', blur: 14 });
  });
});
