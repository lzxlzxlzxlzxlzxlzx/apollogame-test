import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/determinism.js';
import { NarrativeTransitionPolicy, type NarrativeTransitionSource } from './narrative-transition-policy.js';

const scene = (nodeId: string, transition?: NarrativeTransitionSource['transition'], packageId = 'pkg'): NarrativeTransitionSource =>
  ({ packageId, chapterId: 'ch', nodeId, ...(transition ? { transition } : {}) });

function tracedWorld(): World {
  const world = new World();
  world.createEntity('story');
  world.addComponent('story', { type: 'Flag', id: 'seen', active: true });
  world.createEntity('trace');
  world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 4, max: 8 });
  return world;
}

describe('narrative transition preference projection', () => {
  it('advances a committed fade and leaves the world hash unchanged', () => {
    const world = tracedWorld();
    const before = hashSnapshot(world.snapshot());
    const policy = new NarrativeTransitionPolicy();
    const projected = policy.project(scene('a', 'fade'), { enabled: true, reducedMotion: false }, world);
    expect(projected.accepted).toBe(true);
    if (!projected.accepted) return;
    expect(projected.frame).toMatchObject({ declared: 'fade', effective: 'fade', phase: 'fade-out', settled: false });
    expect(policy.advance(projected.token, world).accepted && policy.frame?.phase).toBe('fade-in');
    expect(policy.advance(projected.token, world).accepted && policy.frame).toMatchObject({ phase: 'settled', settled: true, to: { nodeId: 'a' } });
    expect(hashSnapshot(world.snapshot())).toBe(before);
    expect(world.getComponent<any>('trace', 'DebugTrace')?.events.map((event: { kind: string; what: string }) => [event.kind, event.what])).toEqual([
      ['transition', 'fade-out→fade-in'], ['transition', 'fade-in→settled'],
    ]);
  });

  it('collapses disabled and reduced-motion to the same cut result without replaying', () => {
    const policy = new NarrativeTransitionPolicy();
    const world = tracedWorld();
    for (const preferences of [
      { enabled: false, reducedMotion: false },
      { enabled: false, reducedMotion: true },
      { enabled: true, reducedMotion: true },
    ]) {
      policy.stop();
      const projected = policy.project(scene('a', 'wipe'), preferences, world);
      expect(projected.accepted).toBe(true);
      if (!projected.accepted) return;
      expect(projected.frame).toMatchObject({ declared: 'wipe', effective: 'cut', phase: 'settled', settled: true });
      expect(policy.advance(projected.token).accepted && policy.frame?.phase).toBe('settled');
    }
    expect(world.getComponent<any>('trace', 'DebugTrace')?.events.map((event: { kind: string; why?: string }) => [event.kind, event.why])).toEqual([
      ['decision', 'wipe'], ['decision', 'wipe'], ['decision', 'wipe'],
    ]);
  });

  it('drops the previous projection on replay, rollback, load and an invalid replacement', () => {
    const policy = new NarrativeTransitionPolicy();
    const first = policy.project(scene('a', 'fade'), { enabled: true, reducedMotion: false });
    if (!first.accepted) throw new Error('fixture must project');
    const replay = policy.project(scene('a', 'fade'), { enabled: true, reducedMotion: false });
    expect(policy.advance(first.token)).toEqual({ accepted: false, reason: 'stale-token' });
    expect(replay.accepted && policy.frame?.phase).toBe('fade-out');

    policy.stop();
    expect(policy.frame).toBeNull();
    expect(policy.advance(first.token)).toEqual({ accepted: false, reason: 'inactive' });
    const rolled = policy.project(scene('b', 'dissolve'), { enabled: true, reducedMotion: false });
    expect(rolled.accepted && policy.frame?.to.nodeId).toBe('b');
    expect(policy.skip(first.token)).toEqual({ accepted: false, reason: 'stale-token' });

    policy.stop();
    const loaded = policy.project(scene('a', 'fade'), { enabled: true, reducedMotion: false });
    expect(loaded.accepted && policy.frame?.from).toBeNull();
    const failed = policy.project({ packageId: '', chapterId: 'ch', nodeId: 'a', transition: 'fade' }, { enabled: true, reducedMotion: false });
    expect(failed).toEqual({ accepted: false, reason: 'invalid-source' });
    expect(policy.frame).toBeNull();
    expect(policy.advance(loaded.accepted ? loaded.token : first.token)).toEqual({ accepted: false, reason: 'inactive' });
  });

  it('rejects another host token and refuses work after dispose', () => {
    const left = new NarrativeTransitionPolicy();
    const right = new NarrativeTransitionPolicy();
    const projected = left.project(scene('a', 'fade', 'left'), { enabled: true, reducedMotion: false });
    if (!projected.accepted) throw new Error('fixture must project');
    expect(right.advance(projected.token)).toEqual({ accepted: false, reason: 'inactive' });
    const other = right.project(scene('z', 'wipe', 'right'), { enabled: true, reducedMotion: false });
    if (!other.accepted) throw new Error('fixture must project');
    expect(right.advance(projected.token)).toEqual({ accepted: false, reason: 'stale-token' });
    expect(left.frame?.to).toEqual({ packageId: 'left', chapterId: 'ch', nodeId: 'a' });
    left.dispose();
    expect(left.frame).toBeNull();
    expect(left.project(scene('a'), { enabled: true, reducedMotion: false })).toEqual({ accepted: false, reason: 'disposed' });
    expect(left.skip(projected.token)).toEqual({ accepted: false, reason: 'disposed' });
  });

  it('settles a preference change without restarting the old scene', () => {
    const policy = new NarrativeTransitionPolicy();
    const projected = policy.project(scene('a', 'fade'), { enabled: true, reducedMotion: false });
    if (!projected.accepted) throw new Error('fixture must project');
    const changed = policy.setPreferences(projected.token, { enabled: true, reducedMotion: true });
    expect(policy.advance(projected.token)).toEqual({ accepted: false, reason: 'stale-token' });
    expect(changed.accepted && changed.frame).toMatchObject({ declared: 'fade', effective: 'cut', phase: 'settled', settled: true, to: { nodeId: 'a' } });
    expect(policy.setPreferences(projected.token, { enabled: false, reducedMotion: false })).toEqual({ accepted: false, reason: 'stale-token' });
  });

  it('records a reject without mutating story state', () => {
    const world = tracedWorld();
    const before = hashSnapshot(world.snapshot());
    const policy = new NarrativeTransitionPolicy();
    expect(policy.project(scene('a', 'fade'), { enabled: 'yes' } as any, world)).toEqual({ accepted: false, reason: 'invalid-preferences' });
    expect(policy.frame).toBeNull();
    expect(world.getComponent<any>('story', 'Flag')).toEqual({ type: 'Flag', id: 'seen', active: true });
    expect(world.getComponent<any>('trace', 'DebugTrace')?.events).toMatchObject([
      { tick: 4, system: 'narrative-transition', kind: 'reject', why: 'invalid-preferences' },
    ]);
    expect(hashSnapshot(world.snapshot())).toBe(before);
  });
});
