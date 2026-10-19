import { describe, expect, it } from 'vitest';
import type { GameFlow, Flag, Resource } from '@zerocraft/engine/engine/protocol/components.js';
import { createWorld, applySignal } from './acceptance-adapter.js';
import { readFileSync } from 'node:fs';
import { validateLayoutNode } from '@ui/components/validate.js';
import type { LayoutNode } from '@ui/components/types.js';

const flow = (world: ReturnType<typeof createWorld>): string | undefined =>
  world.engine.world.getComponent<GameFlow>('investigation-flow', 'GameFlow')?.current;
const resource = (world: ReturnType<typeof createWorld>, id: string): number | undefined =>
  world.engine.world.getComponent<Resource>(id, 'Resource')?.current;
const flag = (world: ReturnType<typeof createWorld>, id: string): boolean | undefined => {
  for (const [entity] of world.engine.world.query('Flag')) {
    const value = world.engine.world.getComponent<Flag>(entity, 'Flag');
    if (value?.id === id) return value.active;
  }
  return undefined;
};

function until(world: ReturnType<typeof createWorld>, state: string, cap = 90): void {
  for (let i = 0; i < cap && flow(world) !== state; i++) world.tick();
  expect(flow(world)).toBe(state);
}

describe('game-clue-investigation S4 interaction', () => {
  it('keeps the cartridge LayoutNode tree schema-clean', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../library/game-clue-investigation/manifest.json', import.meta.url), 'utf8')) as { presentation: { ui: LayoutNode } };
    expect(validateLayoutNode(manifest.presentation.ui as LayoutNode)).toEqual([]);
  });
  it('routes a real world-coordinate pointer hit into the same investigation chain', () => {
    const world = createWorld(41);
    world.tick();
    world.input.enqueue({ source: 'gci-acceptance', x: 246, y: 433, phase: 'down' });
    until(world, 'clue-reveal');
    expect(flag(world, 'viewed.lock')).toBe(true);
    expect(resource(world, 'required-collected')).toBe(0);
  });

  it('keeps all hotspots inert while a clue is open', () => {
    const world = createWorld(42);
    applySignal(world, 'investigate.lock');
    until(world, 'clue-reveal');
    world.input.enqueue({ source: 'gci-acceptance', x: 1204, y: 184, phase: 'down' });
    world.tick();
    expect(flow(world)).toBe('clue-reveal');
    expect(flag(world, 'viewed.clock')).toBe(false);
  });

  it('does not double count a repeated collect action before the collection transition', () => {
    const world = createWorld(43);
    applySignal(world, 'investigate.lock');
    until(world, 'clue-reveal');
    applySignal(world, 'clue.collect');
    world.tick();
    applySignal(world, 'clue.collect');
    world.tick();
    expect(resource(world, 'required-collected')).toBe(1);
    expect(flag(world, 'collected.lock')).toBe(true);
    expect(flow(world)).toBe('clue-collected');
  });

  it('replays the same input sequence to the same world hash', () => {
    const play = (): string => {
      const world = createWorld(44);
      applySignal(world, 'investigate.letter');
      until(world, 'clue-reveal');
      applySignal(world, 'clue.collect');
      until(world, 'scene-idle');
      return world.engine.hash();
    };
    expect(play()).toBe(play());
  });
});
