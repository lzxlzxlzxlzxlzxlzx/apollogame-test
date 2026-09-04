import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { PhysicsSystem, preloadPhysics } from '@zerocraft/engine/renderer/three/physics.js';
import { BLOCK_LENGTH, TOWER_BLOCKS, towerBlueprint } from '../games/game-105/tower-blueprint.js';
import { TowerActionExecutor } from '../games/game-105/tower-action-executor.js';
import { TowerGameSession } from '../games/game-105/tower-session.js';

type Run = {
  blockId: string;
  layer: number;
  maxForce: number;
  anchorStep: number;
  holdFrames: number;
  actualMaxDistance: number;
  reachedExtractionDistance: boolean;
  collapseLocked: boolean;
  phaseAfterRelease: string;
  toppledIds: string[];
};

const INITIAL_SETTLE_FRAMES = 180;
const POST_RELEASE_FRAMES = 180;
const CASES = [
  { maxForce: 420, anchorStep: BLOCK_LENGTH * 0.035, holdFrames: 300 },
  { maxForce: 420, anchorStep: BLOCK_LENGTH * 0.07, holdFrames: 360 },
  { maxForce: 700, anchorStep: BLOCK_LENGTH * 0.035, holdFrames: 300 },
  { maxForce: 700, anchorStep: BLOCK_LENGTH * 0.07, holdFrames: 360 },
  { maxForce: 1000, anchorStep: BLOCK_LENGTH * 0.07, holdFrames: 360 },
] as const;

const candidates = TOWER_BLOCKS.filter((block) => block.layer >= 12 || block.id === 'g105-block-00-00' || block.id === 'g105-block-08-01');

await preloadPhysics();
const runs: Run[] = [];
for (const block of candidates) for (const config of CASES) runs.push(run(block.id, config));

const report = {
  generatedAt: new Date().toISOString(),
  seed: 105031,
  constants: { extractionDistance: BLOCK_LENGTH * .92, initialSettleFrames: INITIAL_SETTLE_FRAMES, postReleaseFrames: POST_RELEASE_FRAMES },
  cases: CASES,
  candidates: candidates.map(({ id, layer, slot, channel }) => ({ id, layer, slot, channel })),
  runs,
  successfulNonCollapseRuns: runs.filter((item) => item.reachedExtractionDistance && !item.collapseLocked),
};
const output = resolve('public/games/game-105/probe/S4-physics-calibration.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, total: runs.length, successfulNonCollapse: report.successfulNonCollapseRuns.length }, null, 2));

function run(blockId: string, config: typeof CASES[number]): Run {
  const engine = new Engine();
  const physics = new PhysicsSystem();
  const session = new TowerGameSession();
  let frame = 0;
  const toppledIds = new Set<string>();
  engine.load(towerBlueprint());
  const executor = new TowerActionExecutor({ world: engine.world, session, invalidate: () => {}, restart: () => {}, pullMaxForce: config.maxForce });
  const tick = () => {
    physics.sync(engine.world, ++frame * 16.7);
    executor.observePhysicalPull();
    const signals = physics.drainSignals().filter((signal) => signal.signal === 'g105-toppled' || signal.signal === 'g105-settled');
    for (const signal of signals) if (signal.signal === 'g105-toppled') toppledIds.add(signal.arg);
    const towerIds = TOWER_BLOCKS.filter((item) => !session.extractedBlocks.has(item.id)).map((item) => item.id);
    session.observePhysics(physics.areBodiesSleeping(towerIds), signals.filter((signal) => signal.signal === 'g105-toppled').map((signal) => signal.arg));
  };
  for (let index = 0; index < INITIAL_SETTLE_FRAMES; index++) tick();
  const block = TOWER_BLOCKS.find((item) => item.id === blockId)!;
  let actualMaxDistance = 0;
  if (session.phase === 'player-ready' && executor.execute('player', { type: 'grab', blockId })) {
    const target = BLOCK_LENGTH * 1.12;
    for (let index = 0; index < config.holdFrames && session.phase !== 'collapse-locked'; index++) {
      if (executor.requestedPullDistance < target) executor.execute('player', { type: 'pull', delta: Math.min(config.anchorStep, target - executor.requestedPullDistance) });
      tick();
      actualMaxDistance = Math.max(actualMaxDistance, executor.actualPullDistance);
    }
    executor.execute('player', { type: 'release' });
  }
  for (let index = 0; index < POST_RELEASE_FRAMES && session.phase !== 'collapse-locked'; index++) tick();
  return {
    blockId,
    layer: block.layer,
    ...config,
    actualMaxDistance: Number(actualMaxDistance.toFixed(4)),
    reachedExtractionDistance: actualMaxDistance >= BLOCK_LENGTH * .92,
    collapseLocked: session.phase === 'collapse-locked',
    phaseAfterRelease: session.phase,
    toppledIds: [...toppledIds].sort(),
  };
}
