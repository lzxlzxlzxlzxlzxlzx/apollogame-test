import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseManifestDetailed } from '@zerocraft/engine/assembly/manifest.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { GameFlow, Resource } from '@zerocraft/engine/engine/protocol/components.js';

const manifest = JSON.parse(
  readFileSync(new URL('../../library/game-clue-investigation/manifest.json', import.meta.url), 'utf8'),
) as unknown;

function loadTwoTicks(): Engine {
  const parsed = parseManifestDetailed(manifest);
  const engine = new Engine({ tickRate: 60 });
  engine.load(parsed.blueprint);
  engine.world.tick();
  engine.world.tick();
  return engine;
}

describe('game-clue-investigation S3 skeleton', () => {
  it('is a strict, reference-closed manifest with no parser warnings', () => {
    const parsed = parseManifestDetailed(manifest);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.blueprint.capabilities.map((capability) => capability.id)).toEqual(expect.arrayContaining([
      'a1-transform', 'c1-shape', 'l2-color', 'i1-input-capture',
      'f1-resource', 'f2-flag', 't2-clickable', 't3-flow',
    ]));
  });

  it('loads in the real engine and idles for two ticks', () => {
    expect(() => loadTwoTicks()).not.toThrow();
  });

  it('preserves the frozen 1440x900 seven-object scene skeleton through S4', () => {
    const engine = loadTwoTicks();
    const objectIds = engine.world.getAllEntities().filter((id) => id.startsWith('object-')).sort();
    expect(objectIds).toEqual([
      'object-clock',
      'object-cup',
      'object-letter',
      'object-lock',
      'object-prints',
      'object-rug',
      'object-shelf',
    ]);
    expect(engine.world.getComponent<Resource>('required-collected', 'Resource')?.current).toBe(0);
    expect(engine.world.getComponent<Resource>('required-total', 'Resource')?.current).toBe(2);
    expect(engine.world.getComponent<GameFlow>('investigation-flow', 'GameFlow')?.current).toBe('scene-idle');
  });

  it('is deterministic after the required two-tick empty run', () => {
    expect(loadTwoTicks().hash()).toBe(loadTwoTicks().hash());
  });
});
