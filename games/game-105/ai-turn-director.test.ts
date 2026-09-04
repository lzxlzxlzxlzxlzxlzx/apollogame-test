import { describe, expect, it } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { Joint3D, WorldUI3D } from '@zerocraft/engine/engine/protocol/components.js';
import { AITurnDirector } from './ai-turn-director.js';
import { createLocalAIObservation } from './local-ai-observation.js';
import { TOWER_BLOCKS, towerBlueprint } from './tower-blueprint.js';
import { TowerActionExecutor } from './tower-action-executor.js';
import { TowerGameSession } from './tower-session.js';

describe('AITurnDirector shared executor ownership', () => {
  it('never cancels a player-owned Joint3D while the AI is idle', () => {
    const engine = new Engine(); engine.load(towerBlueprint());
    const session = new TowerGameSession();
    for (let frame = 0; frame < 30; frame++) session.observePhysics(true);
    const executor = new TowerActionExecutor({ world: engine.world, session, invalidate: () => {}, restart: () => {} });
    const director = new AITurnDirector(executor);
    const block = TOWER_BLOCKS[0]!;
    expect(executor.execute('player', { type: 'grab', blockId: block.id })).toBe(true);
    director.tick(createLocalAIObservation({ phase: session.phase, turn: session.turn, layout: TOWER_BLOCKS, extractedIds: session.extractedBlocks, settledExtractionHistory: [], selectedBlockId: executor.selectedBlockId, consumedSignals: [] }));
    expect(executor.grabbedBy).toBe('player');
    expect(engine.world.getComponent<Joint3D>(block.id, 'Joint3D')).toBeTruthy();
  });

  it('shows a skinned, high-contrast factual hover panel and removes it on exit', () => {
    const engine = new Engine(); engine.load(towerBlueprint());
    const session = new TowerGameSession();
    for (let frame = 0; frame < 30; frame++) session.observePhysics(true);
    const executor = new TowerActionExecutor({ world: engine.world, session, invalidate: () => {}, restart: () => {} });
    const block = TOWER_BLOCKS[0]!;

    expect(executor.execute('player', { type: 'hover', blockId: block.id })).toBe(true);
    const ui = engine.world.getComponent<WorldUI3D>(block.id, 'WorldUI3D');
    expect(ui?.node?.type).toBe('Panel');
    expect(ui?.node?.props).toMatchObject({ edge: 'gold' });
    expect(ui?.node?.layout).toMatchObject({ radius: 999, padding: 5 });
    const copy = ui?.node?.children?.[0];
    expect(copy).toMatchObject({ type: 'Label', props: { text: '樱粉 · 1分' } });
    expect((copy?.props as { spans?: Array<{ text: string }> }).spans?.map((span) => span.text)).toEqual(['樱粉 · ', '1分']);

    expect(executor.execute('player', { type: 'hover', blockId: null })).toBe(true);
    expect(engine.world.getComponent<WorldUI3D>(block.id, 'WorldUI3D')).toBeUndefined();
  });
});
