import { describe, expect, it } from 'vitest';
import {
  QTE_ASSIST_START,
  QTE_ATTEMPT_ACTION,
  QTE_OPENING_TICKS,
  QTE_START_ACTION,
  QTE_WINDOW_START,
} from '../src/qte-blueprint.js';
import { ChestQteSession } from '../src/qte-session.js';

function start(session: ChestQteSession): void {
  session.enqueue(QTE_START_ACTION);
  session.tick();
  expect(session.snapshot().phase).toBe('playing');
}

function hit(session: ChestQteSession): void {
  const now = session.snapshot().elapsed;
  if (now < QTE_WINDOW_START) session.tick(QTE_WINDOW_START - now);
  session.enqueue(QTE_ATTEMPT_ACTION);
  session.tick();
}

describe('loot chest fixed three-lock QTE', () => {
  it('starts only through the declared start action', () => {
    const session = new ChestQteSession();
    expect(session.snapshot()).toMatchObject({ phase: 'ready', locks: 0, misses: 0, attempts: 0 });
    session.enqueue(QTE_ATTEMPT_ACTION);
    session.tick();
    expect(session.snapshot().phase).toBe('ready');
    start(session);
  });

  it('counts a hit inside the timing window and resets the cycle', () => {
    const session = new ChestQteSession();
    start(session);
    hit(session);
    expect(session.snapshot()).toMatchObject({ phase: 'playing', locks: 1, misses: 0, attempts: 1, feedback: 'hit' });
    expect(session.snapshot().elapsed).toBe(0);
  });

  it('counts a miss outside the window without clearing solved locks', () => {
    const session = new ChestQteSession();
    start(session);
    hit(session);
    session.tick(10);
    session.enqueue(QTE_ATTEMPT_ACTION);
    session.tick();
    expect(session.snapshot()).toMatchObject({ locks: 1, misses: 1, attempts: 2, feedback: 'miss' });
  });

  it('widens the hit window after three consecutive misses', () => {
    const session = new ChestQteSession();
    start(session);
    for (let index = 0; index < 3; index += 1) {
      session.tick(10);
      session.enqueue(QTE_ATTEMPT_ACTION);
      session.tick();
    }
    expect(session.snapshot().misses).toBe(3);
    session.tick(QTE_ASSIST_START - session.snapshot().elapsed);
    session.enqueue(QTE_ATTEMPT_ACTION);
    session.tick();
    expect(session.snapshot()).toMatchObject({ locks: 1, misses: 0, attempts: 4, feedback: 'hit' });
  });

  it('reveals only after three hits and the deterministic opening beat', () => {
    const session = new ChestQteSession();
    start(session);
    hit(session);
    hit(session);
    hit(session);
    expect(session.snapshot().locks).toBe(3);
    session.tick();
    expect(session.snapshot().phase).toBe('opening');
    session.tick(QTE_OPENING_TICKS);
    expect(session.snapshot().phase).toBe('revealed');
  });
});
