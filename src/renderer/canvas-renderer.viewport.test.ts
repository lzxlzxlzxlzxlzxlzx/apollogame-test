// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { CanvasRenderer, lifeVisualConsumptionMode, planLifeVisualDraw, responsiveCameraScale } from './canvas-renderer.js';
import type { LifeVisualRule } from '@assets/index.js';

function sized(width: number, height: number): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(host);
  return host;
}

describe('CanvasRenderer responsive viewport', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  it('keeps the historical fixed logical CSS/backing size when responsive mode is omitted', () => {
    const host = sized(640, 720);
    const renderer = new CanvasRenderer({ width: 900, height: 620 });
    renderer.init(host);
    const canvas = host.querySelector('canvas')!;
    expect([canvas.style.width, canvas.style.height, canvas.width, canvas.height]).toEqual(['900px', '620px', 900, 620]);
    Object.defineProperty(host, 'clientWidth', { value: 1060, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 760, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect([canvas.style.width, canvas.style.height, canvas.width, canvas.height]).toEqual(['900px', '620px', 900, 620]);
    renderer.destroy();
  });

  it('updates logical CSS and DPR backing together, then unregisters resize on destroy', () => {
    const host = sized(640, 668);
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const renderer = new CanvasRenderer({ width: 900, height: 568, viewport: { mode: 'responsive' } });
    renderer.init(host);
    const canvas = host.querySelector('canvas')!;
    expect([canvas.style.width, canvas.style.height, canvas.width, canvas.height]).toEqual(['640px', '668px', 1280, 1336]);

    Object.defineProperty(host, 'clientWidth', { value: 1060, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 708, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect([canvas.style.width, canvas.style.height, canvas.width, canvas.height]).toEqual(['1060px', '708px', 1590, 1062]);

    renderer.destroy();
    Object.defineProperty(host, 'clientWidth', { value: 1440, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect([canvas.style.width, canvas.style.height, canvas.width, canvas.height]).toEqual(['1060px', '708px', 1590, 1062]);
  });

  it('uses a controlled aspect-preserving camera scale: cover fills, contain letterboxes', () => {
    expect(responsiveCameraScale(640, 668, 28 * 32, 19 * 32, 'cover')).toBeCloseTo(668 / 608, 8);
    expect(responsiveCameraScale(640, 668, 28 * 32, 19 * 32, 'contain')).toBeCloseTo(640 / 896, 8);
    expect(responsiveCameraScale(0, 668, 896, 608)).toBe(1);
  });

  it('applies closed Life slot size/anchor/fit/offset without arbitrary stretching', () => {
    const base = {
      slotId: 'tile', assetKey: 'tile', kind: 'tile', sourcePx: { width: 64, height: 32 },
      display: { unit: 'cell', width: 1, height: 1 }, anchor: { x: 0.5, y: 0.5 }, fit: 'cover', offset: { x: 0, y: 0 },
      fallbackRole: 'ground', sampling: 'nearest',
    } satisfies LifeVisualRule;
    expect(planLifeVisualDraw({ sx: 0, sy: 0, sw: 64, sh: 32 }, base, 80, 80, 32)).toEqual({
      source: { x: 16, y: 0, width: 32, height: 32 }, destination: { x: 64, y: 64, width: 32, height: 32 }, smoothing: false,
    });
    const contain: LifeVisualRule = { ...base, kind: 'player', fit: 'contain', display: { unit: 'pixel', width: 28.8, height: 43.2 }, anchor: { x: 0.5, y: 1 }, offset: { x: 2, y: -3 }, fallbackRole: 'player' };
    expect(planLifeVisualDraw({ sx: 0, sy: 0, sw: 32, sh: 48 }, contain, 100, 100, 32).destination).toEqual({ x: 87.6, y: 53.8, width: 28.8, height: 43.2 });

    const variants: LifeVisualRule[] = [
      contain,
      { ...contain, fit: 'cover', display: { unit: 'cell', width: 2, height: 3 }, anchor: { x: 0, y: 0 }, offset: { x: -0.25, y: 0.5 } },
    ];
    for (const rule of variants) {
      const plan = planLifeVisualDraw({ sx: 0, sy: 0, sw: 256, sh: 512 }, rule, 123, 234, 32);
      const unit = rule.display.unit === 'cell' ? 32 : 1;
      expect(plan.destination.x + plan.destination.width * rule.anchor.x).toBeCloseTo(123 + rule.offset.x * unit, 10);
      expect(plan.destination.y + plan.destination.height * rule.anchor.y).toBeCloseTo(234 + rule.offset.y * unit, 10);
    }
  });

  it('consumes high-resolution linear tile, actor and placement rules at the fixed 32px gameplay cell', () => {
    const tile = {
      slotId: 'tile', assetKey: 'tile', kind: 'tile', sourcePx: { width: 256, height: 256 },
      display: { unit: 'cell', width: 1, height: 1 }, anchor: { x: 0.5, y: 0.5 }, fit: 'cover', offset: { x: 0, y: 0 },
      fallbackRole: 'ground', sampling: 'linear',
    } satisfies LifeVisualRule;
    const player = {
      ...tile, slotId: 'player', assetKey: 'player', kind: 'player', sourcePx: { width: 384, height: 512 },
      display: { unit: 'cell', width: 1, height: 1.5 }, anchor: { x: 0.5, y: 1 }, fit: 'contain', fallbackRole: 'player',
    } satisfies LifeVisualRule;
    const npc = { ...player, slotId: 'npc', assetKey: 'npc', kind: 'npc', fallbackRole: 'npc' } satisfies LifeVisualRule;
    const building = {
      ...tile, slotId: 'building', assetKey: 'building', kind: 'building', sourcePx: { width: 512, height: 512 },
      display: { unit: 'cell', width: 2, height: 2 }, anchor: { x: 0.5, y: 1 }, fit: 'contain', fallbackRole: 'building',
    } satisfies LifeVisualRule;
    expect(planLifeVisualDraw({ sx: 0, sy: 0, sw: 256, sh: 256 }, tile, 80, 80, 32)).toEqual({
      source: { x: 0, y: 0, width: 256, height: 256 }, destination: { x: 64, y: 64, width: 32, height: 32 }, smoothing: true,
    });
    for (const actor of [player, npc]) {
      const destination = planLifeVisualDraw({ sx: 0, sy: 0, sw: 384, sh: 512 }, actor, 100, 100, 32).destination;
      expect(destination.x).toBe(84);
      expect(destination.width).toBe(32);
      expect(destination.height).toBeCloseTo(42.6666666667, 8);
      expect(destination.y + destination.height).toBeCloseTo(100, 8);
    }
    expect(planLifeVisualDraw({ sx: 0, sy: 0, sw: 512, sh: 512 }, building, 100, 100, 32).destination).toEqual({ x: 68, y: 36, width: 64, height: 64 });
  });

  it('never sends a loaded formal texture through the legacy pixel-scale branch when its rule is absent', () => {
    const catalog = new Map<string, LifeVisualRule>();
    expect(lifeVisualConsumptionMode(catalog, 'art:missing-rule', true)).toBe('semantic-fallback');
    expect(lifeVisualConsumptionMode(undefined, 'art:legacy', true)).toBe('legacy');
    expect(lifeVisualConsumptionMode(catalog, 'art:missing-texture', false)).toBe('semantic-fallback');
    catalog.set('art:formal', {
      slotId: 'formal', assetKey: 'art:formal', kind: 'tile', sourcePx: { width: 256, height: 256 },
      display: { unit: 'cell', width: 1, height: 1 }, anchor: { x: 0.5, y: 0.5 }, fit: 'cover', offset: { x: 0, y: 0 },
      fallbackRole: 'ground', sampling: 'linear',
    });
    expect(lifeVisualConsumptionMode(catalog, 'art:formal', true)).toBe('rule');
  });
});
