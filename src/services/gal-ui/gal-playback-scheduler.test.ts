import { describe, expect, it } from 'vitest';
import { GalPlaybackScheduler, type GalPlaybackClock, type GalPlaybackFrame } from './gal-playback-scheduler.js';

class FakeClock implements GalPlaybackClock {
  time = 0;
  tasks: { due: number; fire: () => void; cancelled: boolean }[] = [];
  now = () => this.time;
  schedule = (delayMs: number, fire: () => void) => {
    const task = { due: this.time + delayMs, fire, cancelled: false };
    this.tasks.push(task); return () => { task.cancelled = true; };
  };
  tick(ms: number): void {
    this.time += ms;
    for (const task of this.tasks.filter(item => item.due <= this.time && !item.cancelled)) {
      task.cancelled = true; task.fire();
    }
  }
}
const frame = (): GalPlaybackFrame => ({ packageId: 'book', refKey: 'a:1', kind: 'line',
  visible: true, fullyPresented: true, read: true, readSkipEnabled: true,
  skipMode: 'read-only', autoDelayMs: 500 });

describe('GAL-ENG-06A host-only playback scheduler', () => {
  it('uses one injected-clock task and advances once after the profile delay', async () => {
    const clock = new FakeClock(); let current = frame(), calls = 0;
    const scheduler = new GalPlaybackScheduler(clock, () => current, async () => {
      calls++; current = { ...current, kind: 'choice' }; return true;
    }, () => undefined);
    scheduler.setMode('auto'); scheduler.reconcile();
    expect(clock.tasks.filter(item => !item.cancelled)).toHaveLength(1);
    clock.tick(499); expect(calls).toBe(0);
    clock.tick(1); await Promise.resolve();
    expect(calls).toBe(1); expect(scheduler.mode).toBe('off');
  });

  it('stops read-only skip at unread text and never crosses choice/check/ending', () => {
    const clock = new FakeClock(); let current = { ...frame(), read: false };
    const stopped: string[] = [];
    const scheduler = new GalPlaybackScheduler(clock, () => current, async () => true, reason => stopped.push(reason));
    scheduler.setMode('skip'); expect(stopped).toEqual(['unread']); expect(clock.tasks).toHaveLength(0);
    for (const kind of ['choice', 'check', 'ending'] as const) {
      current = { ...current, read: true, kind };
      scheduler.setMode('skip'); expect(scheduler.mode).toBe('off');
    }
    expect(stopped.slice(1)).toEqual(['boundary', 'boundary', 'boundary']);
  });

  it('treats read and unread skip switches independently, including a late preference change', () => {
    const clock = new FakeClock(); let current = { ...frame(), readSkipEnabled: false };
    const stopped: string[] = []; let calls = 0;
    const scheduler = new GalPlaybackScheduler(clock, () => current, async () => { calls++; return true; },
      reason => stopped.push(reason));
    scheduler.setMode('skip');
    expect(stopped).toEqual(['disabled']); expect(clock.tasks).toHaveLength(0);
    current = { ...current, read: false, skipMode: 'all' };
    scheduler.setMode('skip'); expect(clock.tasks.filter(task => !task.cancelled)).toHaveLength(1);
    current = { ...current, read: true };
    clock.tick(16);
    expect(calls).toBe(0); expect(stopped.at(-1)).toBe('stale');
    current = { ...current, readSkipEnabled: true, skipMode: 'read-only' };
    scheduler.setMode('skip'); clock.tick(16);
    expect(calls).toBe(1);
  });

  it('rejects a cancelled late callback by epoch and a changed StoryRef by identity', () => {
    const clock = new FakeClock(); let current = frame(), calls = 0;
    const scheduler = new GalPlaybackScheduler(clock, () => current, async () => { calls++; return true; }, () => undefined);
    scheduler.setMode('auto'); const stale = clock.tasks[0]!;
    scheduler.cancel(); stale.fire(); expect(calls).toBe(0);
    scheduler.setMode('auto'); const changed = clock.tasks[1]!;
    current = { ...current, refKey: 'a:2' }; changed.fire();
    expect(calls).toBe(0); expect(scheduler.mode).toBe('off');
  });

  it('rejects an ABA callback after the same ref is rescheduled', () => {
    const clock = new FakeClock(); let current = frame(), calls = 0;
    const scheduler = new GalPlaybackScheduler(clock, () => current, async () => { calls++; return true; }, () => undefined);
    scheduler.setMode('auto'); const old = clock.tasks[0]!;
    current = { ...current, fullyPresented: false }; scheduler.reconcile();
    current = { ...current, fullyPresented: true }; scheduler.reconcile();
    expect(clock.tasks[1]).toBeDefined();
    old.fire(); expect(calls).toBe(0);
    clock.tick(500); expect(calls).toBe(1);
  });

  it('never uses an old task after package identity changes', () => {
    const clock = new FakeClock(); let current = frame(), calls = 0;
    const scheduler = new GalPlaybackScheduler(clock, () => current, async () => { calls++; return true; }, () => undefined);
    scheduler.setMode('auto'); const old = clock.tasks[0]!;
    current = { ...current, packageId: 'other-book' };
    old.fire();
    expect(calls).toBe(0);
    expect(scheduler.mode).toBe('off');
  });

  it('requires presentation for auto, allows explicit all-skip and fails closed on bad clock', () => {
    const clock = new FakeClock(); let current = { ...frame(), fullyPresented: false, read: false };
    const stopped: string[] = [];
    const scheduler = new GalPlaybackScheduler(clock, () => current, async () => true, reason => stopped.push(reason));
    scheduler.setMode('auto'); expect(clock.tasks).toHaveLength(0);
    current = { ...current, fullyPresented: true }; scheduler.reconcile(); expect(clock.tasks).toHaveLength(1);
    scheduler.setMode('skip'); expect(stopped).toEqual(['unread']);
    current = { ...current, skipMode: 'all' }; scheduler.setMode('skip');
    expect(clock.tasks.filter(task => !task.cancelled)).toHaveLength(1);
    clock.time = Number.NaN; scheduler.setMode('auto'); expect(stopped.at(-1)).toBe('clock');
  });

  it('fails closed if an injected scheduler fires synchronously or throws', () => {
    let calls = 0;
    const stopped: string[] = [];
    const synchronous: GalPlaybackClock = { now: () => 0,
      schedule: (_delay, fire) => { fire(); return () => undefined; } };
    const scheduler = new GalPlaybackScheduler(synchronous, frame, async () => { calls++; return true; },
      reason => stopped.push(reason));
    scheduler.setMode('auto');
    expect(calls).toBe(0);
    expect(scheduler.mode).toBe('off');
    expect(stopped).toEqual(['clock']);
    const throwing: GalPlaybackClock = { now: () => 0, schedule: () => { throw new Error('offline'); } };
    const second = new GalPlaybackScheduler(throwing, frame, async () => { calls++; return true; },
      reason => stopped.push(reason));
    expect(() => second.setMode('skip')).not.toThrow();
    expect(second.mode).toBe('off');
    expect(stopped).toEqual(['clock', 'clock']);
  });
});
