import { describe, expect, it } from 'vitest';
import type { Color, Sprite, Transform, Visibility } from '@zerocraft/engine/engine/protocol/components.js';
import { CardRevealSession, ACTION, finalLayout, stageTicks } from './index.js';

const cards = Array.from({ length: 5 }, (_, i) => ({ id: `card-${i}`, faceImageUrl: `https://example.com/${i}.png` }));
function play(count: number, mode: 'standard' | 'reduced') {
  const session = new CardRevealSession(cards.slice(0, count), mode);
  const phases = new Set<string>();
  let elapsed = 0;
  while (elapsed < stageTicks(mode, count).total + 20 && session.view().status !== 'terminal') {
    session.tick(); elapsed++; phases.add(session.view().phase);
  }
  return { session, phases, elapsed };
}
describe('S4 real-engine presentation chain', () => {
  for (const mode of ['standard', 'reduced'] as const) for (const count of [1, 3, 5] as const) {
    it(`keeps every ${mode} N=${count} flown card fully beyond the right edge until its same-instance P5 recall`, () => {
      const session = new CardRevealSession(cards.slice(0, count), mode);
      const completed = new Map<number, Transform>();
      const entityIds = session.engine.world.getAllEntities().filter((id) => /^card-\d+$/.test(id)).sort();
      const cap = stageTicks(mode, count).total + 20;
      for (let tick = 0; tick < cap && completed.size < count; tick++) {
        session.tick();
        for (let i = 0; i < count; i++) {
          if (completed.has(i)) continue;
          const playback = session.engine.world.getComponent<{ done: boolean }>(`p4-fly-${i}`, 'PresentationPlayback');
          if (!playback?.done) continue;
          const id = `card-${i}`;
          const transform = session.engine.world.getComponent<Transform>(id, 'Transform')!;
          const sprite = session.engine.world.getComponent<Sprite>(id, 'Sprite')!;
          const width = sprite.width! * Math.abs(transform.scaleX);
          const height = sprite.height! * Math.abs(transform.scaleY);
          const halfAabbWidth = (Math.abs(Math.cos(transform.rotation)) * width + Math.abs(Math.sin(transform.rotation)) * height) / 2;
          expect(transform.x - halfAabbWidth).toBeGreaterThanOrEqual(1440);
          expect(session.engine.world.getComponent<Visibility>(id, 'Visibility')?.visible).toBe(true);
          expect(session.engine.world.getComponent<Color>(id, 'Color')?.alpha).toBe(1);
          completed.set(i, structuredClone(transform));
        }
      }
      expect(completed.size).toBe(count);
      for (let tick = 0; tick < 4; tick++) {
        const playback = session.engine.world.getComponent<{ status: string; cursor: number }>('p5-card-0', 'PresentationPlayback');
        if (playback?.status === 'playing') break;
        session.tick();
      }
      expect(session.view().phase).toBe('P5');
      for (let i = 0; i < count; i++) {
        expect(session.engine.world.getComponent<Transform>(`card-${i}`, 'Transform')).toEqual(completed.get(i));
      }
      expect(session.engine.world.getAllEntities().filter((id) => /^card-\d+$/.test(id)).sort()).toEqual(entityIds);
      for (let tick = 0; tick < cap && session.view().status !== 'terminal'; tick++) session.tick();
      expect(session.view().status).toBe('terminal');
      const layout = finalLayout(count);
      for (let i = 0; i < count; i++) {
        expect(session.engine.world.getComponent<Transform>(`card-${i}`, 'Transform')?.x).toBe(layout.x[i]);
      }
    });
  }
  for (const [count, mode] of [[1, 'standard'], [3, 'reduced'], [5, 'standard']] as const) {
    it(`plays ${count} ${mode} cards through P2–P5`, () => {
      const { session, phases, elapsed } = play(count, mode);
      expect(session.view()).toEqual({ status: 'terminal', phase: 'P5', completion: 'natural' });
      expect([...phases]).toEqual(expect.arrayContaining(['P2', 'P3', 'P4', 'P5']));
      expect(Math.abs(elapsed - stageTicks(mode, count).total)).toBeLessThanOrEqual(8);
      const layout = finalLayout(count);
      for (let i = 0; i < count; i++) {
        const transform = session.engine.world.getComponent<Transform>(`card-${i}`, 'Transform')!;
        expect([transform.x, transform.y, transform.rotation, transform.scaleX, transform.scaleY]).toEqual([layout.x[i], 410, 0, layout.width / 260, layout.height / 390]);
        expect(session.engine.world.getComponent<Visibility>(`card-${i}`, 'Visibility')?.visible).toBe(true);
      }
      for (const id of ['pack-3', 'tear-top', 'tear-body']) {
        expect(session.engine.world.getComponent<Visibility>(id, 'Visibility')?.visible).toBe(false);
      }
    });
  }
  it('skip during P2 reaches the same final card pose', () => {
    const natural = play(3, 'standard').session;
    const skip = new CardRevealSession(cards.slice(0, 3));
    for (let i = 0; i < 35; i++) skip.tick();
    skip.action(ACTION.skip); skip.tick();
    expect(skip.view()).toEqual({ status: 'terminal', phase: 'P5', completion: 'skipped' });
    for (const id of ['pack-3', 'tear-top', 'tear-body']) {
      expect(skip.engine.world.getComponent<Visibility>(id, 'Visibility')).toEqual(natural.engine.world.getComponent<Visibility>(id, 'Visibility'));
    }
    for (let i = 0; i < 3; i++) expect(skip.engine.world.getComponent<Transform>(`card-${i}`, 'Transform')).toEqual(natural.engine.world.getComponent<Transform>(`card-${i}`, 'Transform'));
  });
  for (const [phase, targetTick] of [['P3', 145], ['P4', 220]] as const) it(`skip during ${phase} preserves all final card poses`, () => {
    const natural = play(3, 'standard').session;
    const skip = new CardRevealSession(cards.slice(0, 3));
    for (let i = 0; i < targetTick; i++) skip.tick();
    expect(skip.view().phase).toBe(phase);
    skip.action(ACTION.skip); skip.action(ACTION.skip); skip.tick();
    expect(skip.view()).toEqual({ status: 'terminal', phase: 'P5', completion: 'skipped' });
    for (let i = 0; i < 3; i++) {
      const id = `card-${i}`;
      expect(skip.engine.world.getComponent<Transform>(id, 'Transform')).toEqual(natural.engine.world.getComponent<Transform>(id, 'Transform'));
      expect(skip.engine.world.getComponent<Visibility>(id, 'Visibility')).toEqual(natural.engine.world.getComponent<Visibility>(id, 'Visibility'));
    }
    const ids = skip.engine.world.getAllEntities();
    expect(ids.filter((id) => /^card-\d+$/.test(id)).sort()).toEqual(['card-0', 'card-1', 'card-2']);
  });
  it('pauses P4 without cursor or pose advancing and resumes from the same point', () => {
    const session = new CardRevealSession(cards.slice(0, 3));
    for (let i = 0; i < 225; i++) session.tick();
    expect(session.view().phase).toBe('P4');
    session.action(ACTION.pause); session.tick();
    expect(session.view().status).toBe('paused');
    const before = structuredClone(session.engine.world.getComponent<Transform>('card-0', 'Transform'));
    const cursor = session.engine.world.getComponent<{ type: 'PresentationPlayback'; cursor: number }>('p4-fly-0', 'PresentationPlayback')!.cursor;
    for (let i = 0; i < 80; i++) session.tick();
    expect(session.engine.world.getComponent<Transform>('card-0', 'Transform')).toEqual(before);
    expect(session.engine.world.getComponent<{ type: 'PresentationPlayback'; cursor: number }>('p4-fly-0', 'PresentationPlayback')?.cursor).toBe(cursor);
    session.action(ACTION.resume); session.tick();
    expect(session.view().status).toBe('playing');
    expect(session.engine.world.getComponent<{ type: 'PresentationPlayback'; cursor: number }>('p4-fly-0', 'PresentationPlayback')!.cursor).toBeGreaterThan(cursor);
  });
  for (const count of [2, 4]) it(`has exact ${count}-card terminal layout`, () => {
    const { session } = play(count, 'standard');
    const layout = finalLayout(count);
    for (let i = 0; i < count; i++) {
      const t = session.engine.world.getComponent<Transform>(`card-${i}`, 'Transform')!;
      expect([t.x, t.y, t.scaleX, t.scaleY]).toEqual([layout.x[i], 410, layout.width / 260, layout.height / 390]);
    }
  });
});
