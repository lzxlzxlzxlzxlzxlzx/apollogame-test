import { describe, expect, it } from 'vitest';
import { TOWER_BLOCKS } from './tower-blueprint.js';
import { createLocalAIObservation, LOCAL_AI_OBSERVATION_VERSION } from './local-ai-observation.js';

const input = () => ({
  phase: 'player-ready', turn: 'ai', layout: TOWER_BLOCKS, extractedIds: new Set<string>(),
  settledExtractionHistory: [], selectedBlockId: null, consumedSignals: [],
});

describe('LocalAIObservation', () => {
  it('exposes only approved, injectible layout and consumed-signal facts', () => {
    const observation = createLocalAIObservation({ ...input(), extractedIds: new Set([TOWER_BLOCKS[0]!.id]), consumedSignals: [{ signal: 'g105-toppled', blockId: TOWER_BLOCKS[1]!.id }] });
    expect(observation.version).toBe(LOCAL_AI_OBSERVATION_VERSION);
    expect(observation.candidates[0]).toEqual({ id: TOWER_BLOCKS[0]!.id, axis: TOWER_BLOCKS[0]!.axis, layer: 0 });
    expect(JSON.stringify(observation)).not.toContain('Transform3D');
    expect(JSON.stringify(observation)).not.toContain('risk');
  });

  it('rejects illegal phase, signal, and unknown block IDs instead of widening the AI view', () => {
    expect(() => createLocalAIObservation({ ...input(), phase: 'teleport' })).toThrow('illegal phase');
    expect(() => createLocalAIObservation({ ...input(), extractedIds: new Set(['unknown-block']) })).toThrow('unknown block');
    expect(() => createLocalAIObservation({ ...input(), consumedSignals: [{ signal: 'private-cannon-state', blockId: TOWER_BLOCKS[0]!.id }] })).toThrow('illegal signal');
  });
});
