// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { Transform, PresentationPlayback, Color, Visibility, Sprite } from '@zerocraft/engine/engine/protocol/components.js';
import { CardRevealSession } from '../../../games/game-card-reveal/session.js';
import { finalLayout, stageTicks } from '../../../games/game-card-reveal/timing.js';
import { ACTION } from '../../../games/game-card-reveal/tracks.js';
import { CompletionGate } from '../src/completion.js';
import { parseCardRevealInput } from '../src/contract.js';

const cards = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, faceImageUrl: `https://example.com/${i}.png` }));
function run(n: number, mode: 'standard' | 'reduced' = 'standard') {
  const session = new CardRevealSession(cards.slice(0, n), mode);
  const phases: string[] = [];
  let ticks = 0;
  while (session.view().status !== 'terminal' && ticks < 650) { session.tick(); ticks++; if (phases.at(-1) !== session.view().phase) phases.push(session.view().phase); }
  return { session, ticks, phases };
}
function card(session: CardRevealSession, index: number): Transform { return session.engine.world.getComponent<Transform>(`card-${index}`, 'Transform')!; }
function click(session: CardRevealSession, action: string): void {
  session.action(action);
}
function finalPose(session: CardRevealSession, n: number): Array<[number, number, number, number, number]> {
  return Array.from({ length: n }, (_, i) => { const t = card(session, i); return [t.x, t.y, t.rotation, t.scaleX, t.scaleY]; });
}
function visualPose(session: CardRevealSession, n: number) {
  const ids = [...Array.from({ length: 8 }, (_, i) => `pack-${i}`), 'tear-top', 'tear-body', ...Array.from({ length: n }, (_, i) => `card-${i}`)];
  return ids.map((id) => ({ id, transform: session.engine.world.getComponent<Transform>(id, 'Transform'), color: session.engine.world.getComponent<Color>(id, 'Color'), visibility: session.engine.world.getComponent<Visibility>(id, 'Visibility'), sprite: session.engine.world.getComponent<Sprite>(id, 'Sprite') }));
}
describe('S4 owner walkthroughs through real engine and input actions', () => {
  it('A · N1 standard natural, one instance, 5200ms target and exact terminal', () => {
    const { session, ticks, phases } = run(1);
    expect(phases).toEqual(['P2', 'P3', 'P4', 'P5']);
    expect(session.view().completion).toBe('natural');
    expect(ticks).toBe(stageTicks('standard', 1).total);
    expect(finalPose(session, 1)[0]).toEqual([720, 410, 0, 300 / 260, 450 / 390]);
    expect(session.engine.world.getAllEntities().filter((id) => /^card-\d+$/.test(id))).toEqual(['card-0']);
  });
  it('B · N5 keeps five cards from P3, overlaps tear and rise, queues in order, ends in five slots', () => {
    const session = new CardRevealSession(cards);
    let ticks = 0;
    for (let i = 0; i < 155; i++) { session.tick(); ticks++; }
    expect(session.view().phase).toBe('P3');
    expect(session.engine.world.getAllEntities().filter((id) => /^card-\d+$/.test(id))).toEqual(['card-0', 'card-1', 'card-2', 'card-3', 'card-4']);
    expect(card(session, 0).y).toBeLessThan(410);
    expect(card(session, 0).y).toBeGreaterThan(360);
    expect(session.engine.world.getComponent<Transform>('tear-body', 'Transform')!.y).toBeGreaterThan(460);
    while (ticks < stageTicks('standard', 5).p2 + stageTicks('standard', 5).p3) { session.tick(); ticks++; }
    for (let i = 0; i < 5; i++) expect(card(session, i).y).toBe(360 - i * 6);
    while (ticks < stageTicks('standard', 5).p2 + stageTicks('standard', 5).p3 + 30) { session.tick(); ticks++; }
    expect(card(session, 0).x).toBeGreaterThan(720);
    expect(card(session, 1).x).toBeLessThan(725);
    const queueOrder: number[] = [];
    const already = new Set<number>();
    for (let i = 0; i < 570 && session.view().status !== 'terminal'; i++) {
      session.tick(); ticks++;
      for (let j = 0; j < 5; j++) {
        if (session.engine.world.getComponent<PresentationPlayback>(`p4-fly-${j}`, 'PresentationPlayback')?.done && !already.has(j)) {
          already.add(j); queueOrder.push(j); expect(card(session, j).x).toBe(1620 + j * 20);
        }
      }
    }
    expect(session.view().completion).toBe('natural');
    expect(ticks).toBe(stageTicks('standard', 5).total);
    expect(queueOrder).toEqual([0, 1, 2, 3, 4]);
    expect(finalPose(session, 5).map((pose) => pose[0])).toEqual([...finalLayout(5).x]);
    for (let i = 0; i < 5; i++) expect(session.engine.world.getComponent<PresentationPlayback>(`p4-fly-${i}`, 'PresentationPlayback')?.done).toBe(true);
  });
  it('C · N3 reduced retains all semantic phases and same final fields', () => {
    const reduced = run(3, 'reduced'); const standard = run(3);
    expect(reduced.phases).toEqual(['P2', 'P3', 'P4', 'P5']);
    expect(reduced.ticks).toBe(stageTicks('reduced', 3).total);
    expect(standard.ticks).toBe(stageTicks('standard', 3).total);
    expect(finalPose(reduced.session, 3)).toEqual(finalPose(standard.session, 3));
  });
  it('D · skip input from P2, P3 and P4 lands on natural P5 fields with one skipped completion', () => {
    const natural = run(3).session;
    for (const at of [35, 145, 220]) {
      const session = new CardRevealSession(cards.slice(0, 3));
      for (let i = 0; i < at; i++) session.tick();
      click(session, ACTION.skip); click(session, ACTION.skip); session.tick();
      expect(session.view().completion).toBe('skipped');
      expect(visualPose(session, 3)).toEqual(visualPose(natural, 3));
      for (let i = 0; i < 4; i++) session.tick();
      expect(session.view().completion).toBe('skipped');
    }
  });
  it('E · pause input freezes P4 cursor/pose until resume', () => {
    const session = new CardRevealSession(cards.slice(0, 3));
    for (let i = 0; i < 225; i++) session.tick();
    click(session, ACTION.pause); session.tick();
    const before = finalPose(session, 3);
    const cursor = session.engine.world.getComponent<PresentationPlayback>('p4-fly-0', 'PresentationPlayback')!.cursor;
    for (let i = 0; i < 40; i++) session.tick();
    expect(session.view().status).toBe('paused'); expect(finalPose(session, 3)).toEqual(before);
    expect(session.engine.world.getComponent<PresentationPlayback>('p4-fly-0', 'PresentationPlayback')!.cursor).toBe(cursor);
    click(session, ACTION.resume); session.tick();
    expect(session.view().status).toBe('playing');
  });
  it('F · rejected and thrown completion retain terminal/output for retry; accepted and preview never resend', async () => {
    const input = parseCardRevealInput({ presentationId: 'req-1', cards: cards.slice(0, 1) });
    const session = run(1).session;
    const terminal = finalPose(session, 1);
    const gate = new CompletionGate(input, false); gate.markP5Terminal(session.view().completion!);
    const send = vi.fn().mockResolvedValueOnce('rejected').mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce('accepted');
    expect(await gate.complete(send)).toBe(false); expect(await gate.complete(send)).toBe(false); expect(await gate.complete(send)).toBe(true);
    expect(await gate.complete(send)).toBe(false); expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]); expect(send.mock.calls[1][0]).toEqual(send.mock.calls[2][0]);
    expect(finalPose(session, 1)).toEqual(terminal);
    const preview = new CompletionGate(input, true); preview.markP5Terminal('natural');
    expect(await preview.complete(send)).toBe(false); expect(send).toHaveBeenCalledTimes(3);
  });
});
