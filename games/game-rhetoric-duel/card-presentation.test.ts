import { describe, expect, it } from 'vitest';
import {
  RHETORIC_CARD_FLIGHT_FRAMES,
  RHETORIC_CARD_VISUAL_SPEC,
  RHETORIC_DEAL_PHASE_FRAMES,
  RHETORIC_FRAME_MS,
  computeCardFlightGeometry,
  computeDealTiming,
  computeHandLayout,
  decodeVisualCardAction,
  encodeVisualCardAction,
  projectHandVisuals,
} from './card-presentation.js';
import { RhetoricDuelSession } from './session.js';

describe('game-rhetoric-duel · W5.1 card presentation geometry', () => {
  it('1/3/5/6 张抽牌都在阶段预算前一帧内完成，5 张保持 450+4×60=690ms', () => {
    const phaseMs = RHETORIC_DEAL_PHASE_FRAMES * RHETORIC_FRAME_MS;
    for (const count of [1, 3, 5, 6]) {
      const timing = computeDealTiming(count, phaseMs);
      expect(timing.totalMs).toBeLessThanOrEqual(phaseMs - RHETORIC_FRAME_MS + 0.001);
      expect(timing.durationMs).toBe(450);
    }
    expect(computeDealTiming(5, phaseMs)).toEqual({ durationMs: 450, staggerMs: 60, totalMs: 690 });
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

  it('单段飞行在 phase budget 前完成，视觉 action 可携带槽位且原始 cardId 仍兼容', () => {
    expect(RHETORIC_CARD_VISUAL_SPEC.flightDurationMs)
      .toBeLessThanOrEqual(RHETORIC_CARD_FLIGHT_FRAMES * RHETORIC_FRAME_MS - RHETORIC_FRAME_MS + 0.001);
    expect(decodeVisualCardAction(encodeVisualCardAction('probe-question', 4))).toEqual({ cardId: 'probe-question', index: 4 });
    expect(decodeVisualCardAction('probe-question')).toEqual({ cardId: 'probe-question' });
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
