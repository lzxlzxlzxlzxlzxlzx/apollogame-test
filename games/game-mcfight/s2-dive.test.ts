import { describe, expect, it } from 'vitest';
import type { Component } from '@engine/core/types.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
import { world, twoFlyers, cancellableDive, committedMelee, add, xf, FLYER, GROUND, GROUND_WINDOW, FLIGHT, HARD_CONTROL } from './s2-dive.fixture.js';

describe('MC Fight S2 B · actual dive contact chain', () => {
  it('boundary window → aggro → movement → overlap → trigger → hitbox damages only while grounded', () => {
    const w = world(), trace: any[] = [];
    for (let tick = 1; tick <= 6; tick++) { w.tick(); const s = w.getComponent<any>('flyer', 'Status')!.flags; trace.push({ tick, x: w.getComponent<any>('flyer', 'Transform')!.x, hp: w.getComponent<any>('flyer', 'Resource')!.current, ground: !!(s & GROUND_WINDOW), flight: !!(s & FLIGHT), target: w.getComponent<any>('flyer', 'Relation')?.targetId ?? null }); }
    expect(trace[0].flight).toBe(true);
    expect(trace[2].ground).toBe(true); // intent committed at the next observable boundary
    expect(trace.some(r => r.x > 0)).toBe(true);
    expect(trace.filter(r => r.hp < 30).map(r => r.hp)).toEqual([25, 25, 25]); // one actual contact, not a per-tick melee substitute
    expect(trace[5].flight).toBe(true);
    console.log('S2_DIVE_CONTACT_TRACE', JSON.stringify(trace));
  });

  it('two offset flyers open independent windows and each settles one real contact', () => {
    const w = twoFlyers(), trace: any[] = [];
    for (let tick = 1; tick <= 8; tick++) {
      w.tick();
      trace.push({ tick, alpha: w.getComponent<any>('alpha', 'Status')!.flags, bravo: w.getComponent<any>('bravo', 'Status')!.flags,
        alphaX: w.getComponent<any>('alpha', 'Transform')!.x, bravoX: w.getComponent<any>('bravo', 'Transform')!.x,
        alphaHp: w.getComponent<any>('alpha', 'Resource')!.current, bravoHp: w.getComponent<any>('bravo', 'Resource')!.current });
    }
    console.log('S2_DIVE_TWO_FLYER_TRACE', JSON.stringify(trace));
    expect(trace.some(r => (r.alpha & GROUND_WINDOW) !== 0 && (r.bravo & FLIGHT) !== 0)).toBe(true);
    expect(trace.some(r => (r.bravo & GROUND_WINDOW) !== 0 && (r.alpha & FLIGHT) !== 0)).toBe(true);
    expect(trace.at(-1).alphaHp).toBe(25);
    expect(trace.at(-1).bravoHp).toBe(25);
  });

  it('hard control closes an already-open window at its defined next boundary and prevents later contacts', () => {
    const w = cancellableDive();
    for (let i = 0; i < 3; i++) w.tick(); // Dive intent has committed; flyer is at x=2.
    expect(w.getComponent<any>('flyer', 'Status')!.flags & GROUND_WINDOW).toBeTruthy();
    w.getComponent<any>('flyer', 'Status')!.flags |= HARD_CONTROL;
    w.tick(); // Flow observes control and queues the cancellation boundary.
    const hpAfterControl = w.getComponent<any>('flyer', 'Resource')!.current;
    w.tick(); // boundary commit applies it before overlap/hitbox.
    const status = w.getComponent<any>('flyer', 'Status')!.flags;
    expect(status & GROUND_WINDOW).toBe(0);
    expect(status & FLIGHT).toBeTruthy();
    expect(w.getComponent<any>('flyer', 'Resource')!.current).toBe(hpAfterControl);
    expect(w.getComponent<any>('flyer', 'FlowWindowIntent')).toBeUndefined();
  });

  it('a melee Windup commits identity: ascent and retreat do not block its one real hit', () => {
    const w = committedMelee();
    w.tick();
    expect(w.getComponent<any>('melee', 'GameFlow')!.targetSnapshot.targetId).toBe('flyer');
    expect(w.getComponent<any>('melee', 'Resource')!.current).toBe(1);
    // External world facts occur after Windup began.  No test writes Relation,
    // Flow phase, trigger or damage: the next systems must honour the snapshot.
    w.getComponent<any>('flyer', 'Status')!.flags = FLIGHT;
    w.getComponent<any>('flyer', 'Transform')!.x = 30;
    for (let i = 0; i < 4; i++) w.tick();
    expect(w.getComponent<any>('flyer', 'Resource')!.current).toBe(23);
  });

  it('a captured target that dies during melee Windup produces no late hitbox', () => {
    const w = committedMelee();
    w.tick();
    w.getComponent<any>('flyer', 'Resource')!.current = 0;
    for (let i = 0; i < 4; i++) w.tick();
    expect(w.getAllEntities()).not.toContain('flyer');
    expect(w.query('PrefabOrigin')).toHaveLength(0);
  });

  it('a melee source destroyed during Windup cannot release its stale attack', () => {
    const w = committedMelee();
    w.tick();
    w.addComponent('melee', { type: 'DestroyRequest', entityId: 'melee' } as Component);
    for (let i = 0; i < 4; i++) w.tick();
    expect(w.getAllEntities()).not.toContain('melee');
    expect(w.getComponent<any>('flyer', 'Resource')!.current).toBe(30);
    expect(w.query('PrefabOrigin')).toHaveLength(0);
  });

  it('one area attack hits every eligible overlapping target once before its zone is consumed', () => {
    const w = committedMelee();
    w.tick();
    // The committed target retreats while a second flyer occupies the eventual
    // impact point.  The one spawned zone must fan out to both Trigger records.
    w.getComponent<any>('flyer', 'Transform')!.x = 30;
    add(w, 'second-flyer', { Transform: xf(30), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: FLIGHT }, Resource: { id: 'hp', current: 30, min: 0, max: 30 } });
    for (let i = 0; i < 4; i++) w.tick();
    expect(w.getComponent<any>('flyer', 'Resource')!.current).toBe(23);
    expect(w.getComponent<any>('second-flyer', 'Resource')!.current).toBe(23);
    expect(w.query('PrefabOrigin')).toHaveLength(0); // consumeOnHit zone is gone after both Trigger records settle
  });

  it('a target that rises before Windup is replaced by an eligible target; only that new start consumes CD', () => {
    const w = committedMelee();
    add(w, 'alternate-flyer', { Transform: xf(6), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: GROUND_WINDOW }, Resource: { id: 'hp', current: 30, min: 0, max: 30 } });
    // The old pursuit is a prior-frame decision.  Its ascent is external input
    // before this frame's aggro/Flow boundary, so Flow must never capture it.
    w.addComponent('melee', { type: 'Relation', kind: 'target', targetId: 'flyer' } as Component);
    w.getComponent<any>('flyer', 'Status')!.flags = FLIGHT;
    w.tick();
    expect(w.getComponent<any>('melee', 'Relation')!.targetId).toBe('alternate-flyer');
    expect(w.getComponent<any>('melee', 'GameFlow')!.targetSnapshot.targetId).toBe('alternate-flyer');
    expect(w.getComponent<any>('melee', 'Resource')!.current).toBe(1);
  });

  it('a production Flow closes the old target window before a delayed melee start, so aggro captures only the alternate', () => {
    const w = committedMelee();
    add(w, 'alternate-flyer', { Transform: xf(6), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: GROUND_WINDOW }, Resource: { id: 'hp', current: 30, min: 0, max: 30 } });
    // No test writes Status or Relation: Rise onEnter queues its own window close.
    w.addComponent('flyer', { type: 'GameFlow', id: 'rise', current: 'Rise', entered: false, states: [{ id: 'Rise', onEnter: [
      { kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: 'flyer', value: false },
      { kind: 'set-status', targetId: String(FLIGHT), targetEntity: 'flyer', value: true },
    ] }] } as Component);
    w.getComponent<any>('melee', 'GameFlow')!.states[0].transitions[0].after = 1;
    w.tick(); w.tick();
    expect(w.getComponent<any>('flyer', 'Status')!.flags & FLIGHT).toBeTruthy();
    expect(w.getComponent<any>('melee', 'GameFlow')!.targetSnapshot.targetId).toBe('alternate-flyer');
    expect(w.getComponent<any>('melee', 'Resource')!.current).toBe(1);
  });

  it('a target Flow closes its window during committed Windup while motion moves it away, and the committed hit still lands', () => {
    const w = committedMelee();
    // The target's own production Flow closes ground eligibility; Velocity is
    // applied by motion, not by the test, after the target was captured.
    w.addComponent('flyer', { type: 'Velocity', vx: 13, vy: 0 } as Component);
    w.addComponent('flyer', { type: 'GameFlow', id: 'rise', current: 'Dive', entered: true, elapsed: 1, states: [
      { id: 'Dive', transitions: [{ after: 1, to: 'Rise' }] },
      { id: 'Rise', onEnter: [{ kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: 'flyer', value: false }, { kind: 'set-status', targetId: String(FLIGHT), targetEntity: 'flyer', value: true }] },
    ] } as Component);
    w.tick(); // capture starts, target has moved by production motion
    const captured = w.getComponent<any>('melee', 'GameFlow')!.targetSnapshot.targetId;
    for (let i = 0; i < 4; i++) w.tick();
    expect(captured).toBe('flyer');
    expect(w.getComponent<any>('flyer', 'Status')!.flags & FLIGHT).toBeTruthy();
    expect(w.getComponent<any>('flyer', 'Transform')!.x).toBeGreaterThan(30);
    expect(w.getComponent<any>('flyer', 'Resource')!.current).toBe(23);
  });

  it('a production hitbox applies hard control; the next Flow decision cancels Windup before release and preserves started CD', () => {
    const w = committedMelee();
    add(w, 'control-zone', { Transform: xf(0), Shape: { kind: 'circle', radius: 2 }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'cd', amount: 0, targetMask: GROUND, setMask: HARD_CONTROL, consumeOnHit: true } });
    w.tick(); // initial capture and production Hitbox queues/applies HARD_CONTROL
    expect(w.getComponent<any>('melee', 'Status')!.flags & HARD_CONTROL).toBeTruthy();
    w.tick(); // Flow reads the produced status, clears snapshot and enters Recovery
    expect(w.getComponent<any>('melee', 'GameFlow')!.current).toBe('Recovery');
    expect(w.getComponent<any>('melee', 'Resource')!.current).toBe(1);
    for (let i = 0; i < 3; i++) w.tick();
    expect(w.query('PrefabOrigin')).toHaveLength(0);
  });
});
