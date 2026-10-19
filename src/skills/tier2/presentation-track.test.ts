import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import { hashSnapshot, NON_DETERMINISTIC } from '@net/determinism.js';
import type { Color, DebugTrace, PresentationPlayback, PresentationTrack, Signal, Sprite, Transform, Visibility } from '@engine/protocol/components.js';
import { eventWhenCapability } from './event-when.js';
import { checkPresentationTrack, presentationTrackCapability } from './presentation-track.js';

function scene(): World {
  const world = new World();
  for (const system of presentationTrackCapability.systems) world.addSystem(system);
  world.createEntity('command');
  world.createEntity('target');
  world.addComponent<Transform>('target', { type: 'Transform', x: 0, y: 3, rotation: 0, scaleX: 1, scaleY: 1 });
  world.addComponent<Color>('target', { type: 'Color', tint: 0xffffff, alpha: 1 });
  world.addComponent<Visibility>('target', { type: 'Visibility', visible: true, active: true });
  world.addComponent<Sprite>('target', { type: 'Sprite', textureKey: 'sample', anchorX: 0.5, anchorY: 0.5, zOrder: 0 });
  return world;
}

function track(world: World, owner = 'track', overrides: Partial<PresentationTrack> = {}): PresentationTrack {
  world.createEntity(owner);
  const value: PresentationTrack = {
    type: 'PresentationTrack', id: owner, targetEntity: 'target', playOnSignal: 'play',
    pauseOnSignal: 'pause', resumeOnSignal: 'resume', resetOnSignal: 'reset', skipOnSignal: 'skip', doneSignal: 'done',
    channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: 0 }, { at: 2, value: 10, easing: 'linear' }] }],
    finalPose: [{ target: 'Transform.x', value: 10 }], ...overrides,
  };
  world.addComponent(owner, value);
  return value;
}

function send(world: World, name: string): void {
  world.addComponent<Signal>('command', { type: 'Signal', name, source: 'test' });
  world.tick();
  world.removeComponent('command', 'Signal');
}

function pose(world: World) {
  return { transform: { ...world.getComponent<Transform>('target', 'Transform')! },
    color: { ...world.getComponent<Color>('target', 'Color')! },
    visibility: { ...world.getComponent<Visibility>('target', 'Visibility')! },
    sprite: { ...world.getComponent<Sprite>('target', 'Sprite')! } };
}

function doneSignals(world: World): Signal[] {
  return world.query('Signal').map(([id]) => world.getComponent<Signal>(id, 'Signal')!).filter((s) => s.name === 'done');
}

describe('t2-presentation-track', () => {
  it('registers closed presentation fields and records a deterministic playback component', () => {
    expect(presentationTrackCapability.id).toBe('t2-presentation-track');
    expect(presentationTrackCapability.components.provides.PresentationTrack).toBeDefined();
    expect(presentationTrackCapability.components.writes).not.toContain('Resource');
    expect(presentationTrackCapability.components.writes).not.toContain('Flag');
    expect(NON_DETERMINISTIC.has('PresentationTrack')).toBe(false);
    expect(NON_DETERMINISTIC.has('PresentationPlayback')).toBe(false);
    const world = scene(); track(world);
    send(world, 'play');
    expect(world.getComponent<PresentationPlayback>('track', 'PresentationPlayback')).toMatchObject({ cursor: 1, status: 'playing', done: false });
  });

  it('declares every read/write honestly under strict SystemView', () => {
    const world = new World({ strict: true });
    for (const system of presentationTrackCapability.systems) world.addSystem(system);
    world.createEntity('command'); world.createEntity('target'); world.createEntity('track');
    world.addComponent<Transform>('target', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    world.addComponent<PresentationTrack>('track', { type: 'PresentationTrack', id: 'strict', targetEntity: 'target', playOnSignal: 'play', doneSignal: 'done',
      channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 10 }] }],
      finalPose: [{ target: 'Transform.x', value: 10 }] });
    send(world, 'play'); world.tick(); world.tick(); world.tick();
    expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(10);
  });

  it('delivers done after the real event-when signal cleanup, so a downstream Commit consumer sees it once', () => {
    const world = new World();
    for (const system of eventWhenCapability.systems) world.addSystem(system);
    for (const system of presentationTrackCapability.systems) world.addSystem(system);
    let trigger = true;
    let seen = 0;
    world.addSystem({ id: 'play-source', phase: SystemPhase.Simulate, runsAfter: ['event-when'],
      reads: [], writes: ['Signal'], consumes: [], execute(w) {
        if (!trigger) return;
        trigger = false;
        w.addComponent<Signal>('command', { type: 'Signal', name: 'play', source: 'test' });
      } });
    world.addSystem({ id: 'done-consumer', phase: SystemPhase.Commit, runsBefore: ['presentation-track'],
      reads: ['Signal'], writes: [], consumes: [], execute(w) {
        for (const [id] of w.query('Signal')) if (w.getComponent<Signal>(id, 'Signal')!.name === 'done') seen++;
      } });
    world.createEntity('command'); world.createEntity('target'); world.createEntity('track');
    world.addComponent<Transform>('target', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    world.addComponent<PresentationTrack>('track', { type: 'PresentationTrack', id: 'track', targetEntity: 'target', playOnSignal: 'play', doneSignal: 'done',
      channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 10 }] }],
      finalPose: [{ target: 'Transform.x', value: 10 }] });
    world.tick(); world.tick(); // Commit at t=1 lands final pose
    expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(10);
    expect(seen).toBe(0);
    world.tick(); // Resolve relays done after event-when cleared the previous frame's signals
    expect(seen).toBe(1);
    world.tick(); expect(seen).toBe(1);
  });

  it('samples t=0, midpoint and exact terminal pose; emits done only once', () => {
    const world = scene(); track(world);
    send(world, 'play'); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(0);
    world.tick(); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(5);
    world.tick(); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(10);
    expect(doneSignals(world)).toHaveLength(0); // 终态先落定，下一拍 Resolve 才发通知
    world.tick(); expect(doneSignals(world)).toHaveLength(1);
    world.tick(); expect(doneSignals(world)).toHaveLength(0);
  });

  it.each([['linear', 5], ['easeIn', 2.5], ['easeOut', 7.5], ['easeInOut', 5]] as const)('%s easing at midpoint', (easing, expected) => {
    const world = scene();
    track(world, 'track', { channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: 0 }, { at: 2, value: 10, easing }] }] });
    send(world, 'play'); world.tick();
    expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(expected);
  });

  it('runs x+y+scale+alpha in parallel and switches discrete fields only at keyframes', () => {
    const world = scene();
    track(world, 'track', {
      channels: [
        { target: 'Transform.x', keyframes: [{ at: 0, value: 0 }, { at: 2, value: 10 }] },
        { target: 'Transform.y', keyframes: [{ at: 0, value: 3 }, { at: 2, value: 7 }] },
        { target: 'Transform.scaleX', keyframes: [{ at: 0, value: 1 }, { at: 2, value: 2 }] },
        { target: 'Color.alpha', keyframes: [{ at: 0, value: 1 }, { at: 2, value: 0.5 }] },
        { target: 'Visibility.visible', keyframes: [{ at: 0, value: true }, { at: 2, value: false }] },
        { target: 'Sprite.zOrder', keyframes: [{ at: 0, value: 0 }, { at: 2, value: 9 }] },
      ],
      finalPose: [
        { target: 'Transform.x', value: 10 }, { target: 'Transform.y', value: 7 },
        { target: 'Transform.scaleX', value: 2 }, { target: 'Color.alpha', value: 0.5 },
        { target: 'Visibility.visible', value: false }, { target: 'Sprite.zOrder', value: 9 },
      ],
    });
    send(world, 'play'); world.tick();
    expect(world.getComponent<Transform>('target', 'Transform')).toMatchObject({ x: 5, y: 5, scaleX: 1.5 });
    expect(world.getComponent<Color>('target', 'Color')!.alpha).toBe(0.75);
    expect(world.getComponent<Visibility>('target', 'Visibility')!.visible).toBe(true);
    expect(world.getComponent<Sprite>('target', 'Sprite')!.zOrder).toBe(0);
    world.tick();
    expect(world.getComponent<Visibility>('target', 'Visibility')!.visible).toBe(false);
    expect(world.getComponent<Sprite>('target', 'Sprite')!.zOrder).toBe(9);
  });

  it('pauses without advancing, resumes at the same integer cursor, and reset/replay restores author pose', () => {
    const world = scene(); track(world);
    send(world, 'play'); send(world, 'pause');
    const before = world.getComponent<PresentationPlayback>('track', 'PresentationPlayback')!.cursor;
    world.tick(); world.tick();
    expect(world.getComponent<PresentationPlayback>('track', 'PresentationPlayback')!.cursor).toBe(before);
    send(world, 'resume'); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(5);
    world.tick(); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(10);
    send(world, 'reset'); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(0);
    send(world, 'play'); world.tick(); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(5);
  });

  it('natural and skip terminal fields are deeply equal and both produce exactly one done Signal', () => {
    const natural = scene(); track(natural);
    send(natural, 'play'); natural.tick(); natural.tick();
    const naturalPose = pose(natural);
    expect(doneSignals(natural)).toHaveLength(0);
    natural.tick(); expect(doneSignals(natural)).toHaveLength(1);
    const skipped = scene(); track(skipped);
    send(skipped, 'play'); send(skipped, 'skip');
    expect(pose(skipped)).toEqual(naturalPose);
    expect(doneSignals(skipped)).toHaveLength(0);
    skipped.tick(); expect(doneSignals(skipped)).toHaveLength(1);
    send(skipped, 'skip'); expect(doneSignals(skipped)).toHaveLength(0);
  });

  it('skip before play still lands finalPose, and reset returns to the captured author state', () => {
    const world = scene(); track(world);
    send(world, 'skip');
    expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(10);
    send(world, 'reset');
    expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(0);
    expect(world.getComponent<PresentationPlayback>('track', 'PresentationPlayback')).toMatchObject({ cursor: 0, status: 'idle', done: false });
  });

  it('rapid play restarts from author pose and conflict rejects later owner in sorted id order', () => {
    const world = scene(); track(world, 'a'); track(world, 'z');
    world.createEntity('trace'); world.addComponent<DebugTrace>('trace', { type: 'DebugTrace', events: [], tick: 0 });
    send(world, 'play'); world.tick();
    expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(5);
    send(world, 'play'); expect(world.getComponent<Transform>('target', 'Transform')!.x).toBe(0);
    expect(world.getComponent<PresentationPlayback>('z', 'PresentationPlayback')!.status).toBe('idle');
    expect(world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.some((e) => e.kind === 'reject' && e.what.includes('field-conflict'))).toBe(true);
  });

  it('rejects missing entities/components and malformed target/keyframes/values without partial writes', () => {
    const cases: Array<[string, Partial<PresentationTrack>]> = [
      ['missing-entity', { targetEntity: 'ghost' }],
      ['missing-component', { channels: [{ target: 'Color.alpha', keyframes: [{ at: 0, value: 1 }] }], finalPose: [{ target: 'Color.alpha', value: 1 }], targetEntity: 'bare' }],
      ['target', { channels: [{ target: 'Transform.bad' as never, keyframes: [{ at: 0, value: 1 }] }] }],
      ['at', { channels: [{ target: 'Transform.x', keyframes: [{ at: -1, value: 0 }] }] }],
      ['at', { channels: [{ target: 'Transform.x', keyframes: [{ at: 2, value: 0 }, { at: 2, value: 1 }] }] }],
      ['value', { channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: Number.POSITIVE_INFINITY }] }] }],
      ['discrete-easing', { channels: [{ target: 'Visibility.visible', keyframes: [{ at: 0, value: true, easing: 'easeIn' }] }], finalPose: [{ target: 'Visibility.visible', value: true }] }],
    ];
    for (const [reason, overrides] of cases) {
      const world = scene(); world.createEntity('bare'); track(world, 'track', overrides);
      world.createEntity('trace'); world.addComponent<DebugTrace>('trace', { type: 'DebugTrace', events: [], tick: 0 });
      const initial = pose(world);
      expect(checkPresentationTrack(world, world.getComponent<PresentationTrack>('track', 'PresentationTrack')!)).toContain(reason);
      send(world, 'play');
      expect(pose(world)).toEqual(initial);
      expect(world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.some((e) => e.kind === 'reject')).toBe(true);
    }
  });

  it('two target entities run in stable id order; identical input yields identical observable state/hash and restores cursor', () => {
    const build = () => {
      const world = scene(); track(world, 'z');
      world.createEntity('second'); world.addComponent<Transform>('second', { type: 'Transform', x: 20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      track(world, 'a', { targetEntity: 'second', channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: 20 }, { at: 2, value: 30 }] }], finalPose: [{ target: 'Transform.x', value: 30 }] });
      return world;
    };
    const a = build(); const b = build();
    send(a, 'play'); send(b, 'play'); a.tick(); b.tick();
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
    const restored = build(); restored.restore(a.snapshot());
    a.tick(); restored.tick();
    expect(restored.snapshot()).toEqual(a.snapshot());
    expect(a.getComponent<Transform>('second', 'Transform')!.x).toBe(30);
  });

  it('composes stages in series through doneSignal while independent owners remain parallel', () => {
    const world = scene();
    track(world, 'first', { doneSignal: 'stage-two', channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 10 }] }], finalPose: [{ target: 'Transform.x', value: 10 }] });
    world.createEntity('second-target');
    world.addComponent<Transform>('second-target', { type: 'Transform', x: 20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    track(world, 'second', { targetEntity: 'second-target', playOnSignal: 'stage-two', doneSignal: 'stage-three',
      channels: [{ target: 'Transform.x', keyframes: [{ at: 0, value: 20 }, { at: 1, value: 30 }] }],
      finalPose: [{ target: 'Transform.x', value: 30 }] });
    send(world, 'play'); world.tick(); // first at terminal, second idle
    expect(world.getComponent<PresentationPlayback>('second', 'PresentationPlayback')!.status).toBe('idle');
    world.tick(); // Resolve emits stage-two, Commit consumes it
    expect(world.getComponent<PresentationPlayback>('second', 'PresentationPlayback')!.status).toBe('playing');
    expect(world.getComponent<Transform>('second-target', 'Transform')!.x).toBe(20);
    world.tick();
    expect(world.getComponent<Transform>('second-target', 'Transform')!.x).toBe(30);
  });
});
