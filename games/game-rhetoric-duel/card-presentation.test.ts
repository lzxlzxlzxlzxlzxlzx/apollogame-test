import { describe, expect, it } from 'vitest';
import {
  RHETORIC_CARD_FLIGHT_FRAMES,
  RHETORIC_CARD_LIFT_FRAMES,
  RHETORIC_CARD_VISUAL_SPEC,
  RHETORIC_DEAL_PHASE_FRAMES,
  RHETORIC_FRAME_MS,
  RHETORIC_PRESENTATION_TIMING_MS,
  RHETORIC_PHASE_DURATION_MS,
  RHETORIC_VIEWPORT_SPEC,
  computeCardFlightGeometry,
  computeDealTiming,
  computeHandLayout,
  decodeVisualCardAction,
  encodeVisualCardAction,
  projectHandVisuals,
  rhetoricDurationFor,
  rhetoricViewportScale,
} from './card-presentation.js';
import { RhetoricDuelSession } from './session.js';

describe('game-rhetoric-duel · W5.3 1440×900 presentation geometry', () => {
  it('唯一 1440×900 逻辑舞台在桌面验收视口保持 1:1', () => {
    expect(RHETORIC_VIEWPORT_SPEC).toMatchObject({ width: 1440, height: 900, acceptanceWidth: 1440, acceptanceHeight: 900 });
    expect(rhetoricViewportScale(1440, 900)).toBe(1);
    expect(rhetoricViewportScale(810, 506)).toBeCloseTo(0.562222, 5);
  });

  it('1/3/5/6 张抽牌都在阶段预算前一帧内完成，5 张保持 900+4×180=1620ms', () => {
    const phaseMs = RHETORIC_DEAL_PHASE_FRAMES * RHETORIC_FRAME_MS;
    for (const count of [1, 3, 5, 6]) {
      const timing = computeDealTiming(count, phaseMs);
      expect(timing.totalMs).toBeLessThanOrEqual(phaseMs - RHETORIC_FRAME_MS + 0.001);
      expect(timing.durationMs).toBe(900);
    }
    expect(computeDealTiming(5, phaseMs)).toEqual({ durationMs: 900, staggerMs: 180, totalMs: 1620 });
  });

  it('延迟按本次 drawOrdinal，已有牌不重播且重复牌使用稳定多重集身份', () => {
    const projection = projectHandVisuals(
      ['same', 'kept', 'same'],
      ['same', 'kept', 'same', 'drawn', 'same'],
    );
    expect(projection.filter((entry) => entry.status === 'kept').map((entry) => [entry.visualId, entry.previousIndex, entry.nextIndex])).toEqual([
      ['same--0', 0, 0],
      ['kept--0', 1, 1],
      ['same--1', 2, 2],
    ]);
    expect(projection.filter((entry) => entry.status === 'drawn').map((entry) => [entry.visualId, entry.drawOrdinal, entry.nextIndex])).toEqual([
      ['drawn--0', 0, 3],
      ['same--2', 1, 4],
    ]);
  });

  it('六张牌均位于手牌区、互不重叠且不低于最小宽度', () => {
    const layout = computeHandLayout(6);
    expect(layout.cardWidth).toBeGreaterThanOrEqual(RHETORIC_CARD_VISUAL_SPEC.minWidth);
    for (const slot of layout.slots) {
      expect(slot.x).toBeGreaterThanOrEqual(layout.x);
      expect(slot.x + slot.width).toBeLessThanOrEqual(layout.x + layout.width);
    }
    for (let index = 1; index < layout.slots.length; index += 1) {
      expect(layout.slots[index]!.x).toBeGreaterThanOrEqual(layout.slots[index - 1]!.x + layout.slots[index - 1]!.width);
    }
  });

  it('第 1/3/5 卡位拥有不同真实起点，结束点固定为中央交锋锚点', () => {
    const layout = computeHandLayout(5);
    const flights = [0, 2, 4].map((index) => computeCardFlightGeometry(layout, index));
    expect(new Set(flights.map((flight) => flight.start.x)).size).toBe(3);
    expect(flights.map((flight) => flight.start)).toEqual([0, 2, 4].map((index) => ({ x: layout.slots[index]!.cx, y: layout.slots[index]!.cy })));
    for (const flight of flights) expect(flight.end).toEqual(RHETORIC_CARD_VISUAL_SPEC.targetAnchor);
  });

  it('确认、飞行与开局入手均在 phase budget 前完成，视觉 action 可携带槽位且原始 cardId 仍兼容', () => {
    expect(RHETORIC_CARD_VISUAL_SPEC.liftDurationMs).toBe(100);
    expect(RHETORIC_PHASE_DURATION_MS['card-lift']).toBe(140);
    expect(RHETORIC_CARD_VISUAL_SPEC.flightDurationMs).toBe(300);
    expect(RHETORIC_CARD_VISUAL_SPEC.discardDurationMs).toBe(420);
    expect(RHETORIC_CARD_VISUAL_SPEC.handReflowDurationMs).toBe(260);
    expect(RHETORIC_CARD_VISUAL_SPEC.drawReflowDurationMs).toBe(360);
    expect(RHETORIC_PHASE_DURATION_MS['card-flight']).toBe(360);
    expect(RHETORIC_CARD_VISUAL_SPEC.impactHoldMs).toBe(1200);
    expect(RHETORIC_CARD_VISUAL_SPEC.responseDurationMs).toBe(240);
    expect(RHETORIC_PRESENTATION_TIMING_MS.lift).toBeLessThanOrEqual(RHETORIC_CARD_LIFT_FRAMES * RHETORIC_FRAME_MS);
    expect(RHETORIC_PRESENTATION_TIMING_MS.flight).toBeLessThanOrEqual(RHETORIC_CARD_FLIGHT_FRAMES * RHETORIC_FRAME_MS);
    expect(RHETORIC_PRESENTATION_TIMING_MS.dealFiveTotal).toBe(1620);
    expect(RHETORIC_PRESENTATION_TIMING_MS.dealFiveTotal).toBeLessThan(RHETORIC_PRESENTATION_TIMING_MS.dealPhase);
    expect(RHETORIC_CARD_VISUAL_SPEC.flightDurationMs)
      .toBeLessThanOrEqual(RHETORIC_CARD_FLIGHT_FRAMES * RHETORIC_FRAME_MS - RHETORIC_FRAME_MS + 0.001);
    expect(decodeVisualCardAction(encodeVisualCardAction('probe-question', 4))).toEqual({ cardId: 'probe-question', index: 4 });
    expect(decodeVisualCardAction('probe-question')).toEqual({ cardId: 'probe-question' });
  });

  it('可读文字与结果阶段至少停留 1.2 秒，纯动作阶段保持快速且 reduced-motion 不闪过文字', () => {
    for (const phase of ['reveal-intent', 'impact', 'round-end', 'enemy-impact', 'focus-refresh', 'victory-impact', 'portrait-resolve', 'failure-impact', 'portrait-dominates']) {
      expect(RHETORIC_PHASE_DURATION_MS[phase], phase).toBeGreaterThanOrEqual(1200);
      expect(rhetoricDurationFor(phase, true), `reduced:${phase}`).toBeGreaterThanOrEqual(1200);
    }
    expect(rhetoricDurationFor('card-flight', false)).toBe(360);
    expect(rhetoricDurationFor('card-flight', true)).toBe(120);
    expect(rhetoricDurationFor('impact', false)).toBe(1200);
    expect(rhetoricDurationFor('enemy-intent', false)).toBe(260);
    expect(rhetoricDurationFor('opponent-response', false)).toBe(240);
    expect(rhetoricDurationFor('enemy-intent', true)).toBe(120);
  });

  it('W5.1 前后固定输入逐拍 snapshot/hash 指纹不变', () => {
    const duel = new RhetoricDuelSession();
    const hashes = [duel.engine.hash()];
    expect(duel.snapshot().hand[0]).toBe('catch-the-thread');
    duel.play('catch-the-thread'); hashes.push(duel.engine.hash());
    duel.tick(); hashes.push(duel.engine.hash());
    duel.endTurn(); hashes.push(duel.engine.hash());
    for (let index = 0; index < 5; index += 1) { duel.tick(); hashes.push(duel.engine.hash()); }
    expect(hashes).toEqual(['97bdbcb2', '18589c30', 'fed79477', '5191091f', '1c5da1c8', '1d716701', 'd5c691c2', 'ffe0d1fb', 'b4ea45b4']);
    expect(duel.snapshot()).toMatchObject({ progress: 1, pressure: 1, focus: 3, turns: 1, phase: 'player-2', intentId: 'raise-the-bar' });
    expect(duel.snapshot().hand).toHaveLength(6);
    expect(duel.snapshot().deck).toHaveLength(8);
    expect(duel.snapshot().discard).toHaveLength(1);
  });
});
