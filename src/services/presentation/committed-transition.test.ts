import { describe, expect, it } from 'vitest';
import { projectCommittedTransition, type PresentationCatalog } from './committed-transition.js';
import { World } from '@engine/core/world.js';
import { projectCommittedTransitionWithTrace } from './committed-transition.js';

const catalog: PresentationCatalog = { phases: ['lift', 'impact', 'ready', 'result'], sequences: { played: ['lift', 'impact', 'ready'], terminal: ['impact', 'result'] }, settledPhases: ['ready', 'result'] };

describe('committed render-only transition projection', () => {
  it('advances or skips without mutating the committed post-state', () => {
    const after = Object.freeze({ progress: 3, focus: 1 });
    const projected = projectCommittedTransition(catalog, { kind: 'played', before: { progress: 0, focus: 2 }, after });
    expect(projected.accepted).toBe(true);
    if (!projected.accepted) return;
    expect(projected.controller.phase).toBe('lift');
    expect(projected.controller.advance()).toBe('impact');
    expect(projected.controller.skip()).toBe('ready');
    expect(projected.controller.after).toBe(after);
  });

  it('rejects unknown kinds and malformed closed phase tables', () => {
    expect(projectCommittedTransition(catalog, { kind: 'forged', before: 0, after: 1 })).toEqual({ accepted: false, reason: 'unknown committed transition kind: forged' });
    expect(projectCommittedTransition({ ...catalog, sequences: { broken: ['lift'] } }, { kind: 'broken', before: 0, after: 1 })).toEqual({ accepted: false, reason: 'sequence broken does not end in a settled phase' });
  });

  it('keeps reduced-motion on the same committed result', () => {
    const normal = projectCommittedTransition(catalog, { kind: 'terminal', before: 0, after: 1 });
    const reduced = projectCommittedTransition(catalog, { kind: 'terminal', before: 0, after: 1 }, true);
    if (!normal.accepted || !reduced.accepted) throw new Error('fixture must project');
    expect(normal.controller.skip()).toBe('result');
    expect(reduced.controller.skip()).toBe('result');
    expect(reduced.controller.after).toBe(normal.controller.after);
  });

  it('writes an opt-in reject trace without changing the projection contract', () => {
    const world = new World(); world.createEntity('trace'); world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 9, max: 8 });
    const rejected = projectCommittedTransitionWithTrace(world, catalog, { kind: 'forged', before: 0, after: 1 });
    expect(rejected.accepted).toBe(false);
    expect(world.getComponent<any>('trace', 'DebugTrace')?.events).toMatchObject([{ tick: 9, kind: 'reject', why: 'unknown committed transition kind: forged' }]);
  });
});
