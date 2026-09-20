import { describe, it, expect, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Caster, DebugTrace, GameFlow, Resource, SpawnRequest, Transform } from '@engine/protocol/components.js';
import { casterCapability } from './caster.js';
import { resourceCapability } from '@atom-skills/index.js';
import { mortalCapability } from '@skills/tier2/mortal.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { hashSnapshot } from '@net/determinism.js';

// Capability contract tests: a captured identity is input, not a simulated lifecycle.
// Signals/death are external inputs; the public caster/resource/mortal systems execute effects.
function fixture(): World {
  const w = new World();
  for (const s of casterCapability.systems) w.addSystem(s);
  for (const [id, x] of [['source', 0], ['locked', 10], ['replacement', 1]] as const) {
    w.createEntity(id);
    w.addComponent(id, { type: 'Transform', x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent(id, { type: 'Resource', id: 'hp', current: 10, min: 0, max: 10 } as Resource);
    w.addComponent(id, { type: 'Tag', flags: 3 });
  }
  w.addComponent('source', { type: 'Relation', kind: 'target', targetId: 'replacement' });
  w.createEntity('skill');
  w.addComponent('skill', {
    type: 'GameFlow', id: 'skill', current: 'active', entered: true, states: [{ id: 'active' }],
    targetSnapshot: { sourceId: 'source', targetId: 'locked' },
  } as GameFlow);
  w.addComponent('skill', {
    type: 'Caster', onSignal: 'fire', template: 'marker', at: 'target', targetFlow: 'skill',
    targetCheck: { aliveResource: 'hp' }, sourceCheck: { aliveResource: 'hp' },
  } as Caster);
  w.createEntity('input');
  w.addComponent('input', { type: 'Signal', name: 'fire', source: 'input' });
  return w;
}
const request = (w: World) => w.getComponent<SpawnRequest>('skill', 'SpawnRequest');

describe('targeted-caster — captured identity and execution policy', () => {
  it('Relation reselection does not replace the captured target; source comes from snapshot', () => {
    const w = fixture();
    w.tick();
    expect(request(w)).toMatchObject({ x: 10, y: 0, source: 'source', templateId: 'marker' });
  });

  it('movement and restored flight after capture do not reject a life-only execution check', () => {
    const w = fixture();
    w.getComponent<Transform>('locked', 'Transform')!.x = 1000;
    w.addComponent('locked', { type: 'Tag', flags: 0 });
    w.tick();
    expect(request(w)).toMatchObject({ x: 1000, source: 'source' });
  });

  it.each(['source', 'locked'])('%s at zero HP rejects execution without retargeting', (id) => {
    const w = fixture();
    w.getComponent<Resource>(id, 'Resource')!.current = 0;
    w.tick();
    expect(request(w)).toBeUndefined();
  });

  it.each(['source', 'locked'])('%s removed from world rejects execution', (id) => {
    const w = fixture();
    w.destroyEntity(id);
    w.tick();
    expect(request(w)).toBeUndefined();
  });

  it.each(['source', 'locked'])('DestroyRequest on a separate carrier targeting %s rejects execution', (id) => {
    const w = fixture();
    w.createEntity('death-carrier');
    w.addComponent('death-carrier', { type: 'DestroyRequest', entityId: id });
    w.tick();
    expect(request(w)).toBeUndefined();
  });

  it('unrelated pending destruction does not block a live captured pair', () => {
    const w = fixture();
    w.createEntity('death-carrier');
    w.addComponent('death-carrier', { type: 'DestroyRequest', entityId: 'replacement' });
    w.tick();
    expect(request(w)).toMatchObject({ x: 10, source: 'source' });
  });

  it('missing snapshot never falls back to Relation or nearest target', () => {
    const w = fixture();
    delete w.getComponent<GameFlow>('skill', 'GameFlow')!.targetSnapshot;
    w.tick();
    expect(request(w)).toBeUndefined();
  });

  it('configured source control mask rejects an interrupted source', () => {
    const w = fixture();
    w.getComponent<Caster>('skill', 'Caster')!.sourceCheck = { aliveResource: 'hp', rejectStatusMask: 4 };
    w.addComponent('source', { type: 'Status', flags: 4 });
    w.tick();
    expect(request(w)).toBeUndefined();
  });

  it('REQ-006 captured identity is independent of self placement', () => {
    const w = fixture(); w.getComponent<Caster>('skill', 'Caster')!.at = 'self';
    w.tick(); expect(request(w)).toMatchObject({ x: 0, source: 'source', spawnPhase: 'resolve' });
    expect(request(w)?.targetEntity).toBeUndefined();
  });
  it('unsupported pointer placement in the committed path fails closed', () => {
    const w = fixture(); w.getComponent<Caster>('skill', 'Caster')!.at = 'pointer';
    w.tick(); expect(request(w)).toBeUndefined();
  });

  it('trace records rejection while leaving deterministic state/hash unchanged', () => {
    const plain = fixture();
    const traced = fixture();
    for (const w of [plain, traced]) w.getComponent<Resource>('locked', 'Resource')!.current = 0;
    traced.addComponent('skill', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
    plain.tick();
    traced.tick();
    const trace = traced.getComponent<DebugTrace>('skill', 'DebugTrace')!;
    expect(trace.events.some(e => e.system === 'targeted-caster' && e.kind === 'reject')).toBe(true);
    expect(hashSnapshot(traced.snapshot())).toBe(hashSnapshot(plain.snapshot()));
    const state = traced.snapshot();
    delete state.skill.DebugTrace;
    expect(state).toEqual(plain.snapshot());
  });

  it.each(['source', 'locked'])('same-tick resource damage kills %s before effect creation', (id) => {
    const w = fixture();
    // Register combat systems AFTER caster to prove declaration order, not installation luck.
    for (const cap of [resourceCapability, mortalCapability, destroyCapability]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    w.addComponent(id, { type: 'Mortal', resource: 'hp', atOrBelow: 0 });
    w.addComponent(id, { type: 'ResourceModify', resourceId: 'hp', amount: -10, scope: 'local' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      w.tick();
      expect(request(w)).toBeUndefined();
      expect(w.getAllEntities()).not.toContain(id);
      expect(warn.mock.calls.filter(args => String(args[0]).includes('topological-sort'))).toEqual([]);
    } finally { warn.mockRestore(); }
  });
});
