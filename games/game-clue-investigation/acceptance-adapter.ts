// S4 GD 验收剧本接线：语义动作只进入 InputQueue，规则仍由 manifest 能力解释。
import { readFileSync } from 'node:fs';
import { parseManifestDetailed } from '@zerocraft/engine/assembly/manifest.js';
import { parseAssetIndex } from '@zerocraft/engine/assets/asset-index.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/index.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';

interface AcceptanceWorld {
  engine: Engine;
  input: QueuedInputSource;
  tick(): void;
  getAllEntities(): string[];
  getComponent(id: string, type: string): unknown;
}

export function createWorld(_seed: number, _config: Record<string, unknown> = {}): AcceptanceWorld {
  const manifest = JSON.parse(readFileSync(new URL('../../library/game-clue-investigation/manifest.json', import.meta.url), 'utf8')) as unknown;
  const assetIndex = parseAssetIndex(JSON.parse(readFileSync(new URL('../../library/game-clue-investigation/art/index.json', import.meta.url), 'utf8')));
  const parsed = parseManifestDetailed(manifest, { assetIndex });
  if (parsed.warnings.length) throw new Error(`Manifest warnings: ${parsed.warnings.join('; ')}`);
  const input = new QueuedInputSource('gci-acceptance');
  const engine = new Engine({ input, tickRate: 60 });
  engine.load(parsed.blueprint);
  return {
    engine,
    input,
    tick(): void {
      applyCommands(engine.world, input.commandsForTick(engine.world.getVersion() + 1));
      engine.world.tick();
    },
    getAllEntities(): string[] { return engine.world.getAllEntities() as string[]; },
    getComponent(id: string, type: string): unknown { return engine.world.getComponent(id, type as never); },
  };
}

export function applySignal(world: AcceptanceWorld, signal: string): void {
  world.input.enqueueAction(signal);
}

export function readWorld(world: AcceptanceWorld): AcceptanceWorld {
  return world;
}
