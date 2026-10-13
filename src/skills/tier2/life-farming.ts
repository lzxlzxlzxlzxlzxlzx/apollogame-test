import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import type { IWorld } from '@engine/core/types.js';
import type { DebugTrace, LifeActionResult, LifeActor, LifeFarmActionResult, LifeFarmPlot, LifePosition, LifeScene, LifeTileCatalog } from '@engine/protocol/components.js';
import { LIFE_FARM_ACTION_REJECT_REASONS, type LifeFarmActionRejectReason, lifeFarmPlotEntityId } from '@engine/protocol/life-farming.js';
import { lifeGroundTagsAt } from '@engine/protocol/life-tilemap.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

export const LIFE_FARMING_CAPABILITY_ID = 't2-life-farming';
const FARM_ACTIONS = new Set(['till', 'water']);

/** Consumes accepted till/water judgements into sparse, snapshot-safe soil state. */
export const lifeFarmingCapability = defineCapability({
  id: LIFE_FARMING_CAPABILITY_ID, version: '1.0.0',
  describe: {
    name: 'life sparse farming', summary: 'Applies accepted till/water actions to plantable static terrain using only sparse LifeFarmPlot entities.',
    semantic: ['tier2', 'life-sim', 'farming', 'sparse-state', 'terrain'],
    whenToUse: 'After t2-life-action. It only consumes accepted till/water at the actor position; planting, crops, harvests, inventory, stamina, time, and visuals are separate capabilities.',
    examples: ['accepted till on plantable terrain → LifeFarmPlot{soil:"tilled"}', 'accepted water without a plot → LifeFarmActionResult{status:"rejected",reason:"missing-plot"}'],
  },
  components: { provides: {
    LifeFarmPlot: defineComponent('LifeFarmPlot', { sceneId: t.str(), x: t.num(), y: t.num(), soil: t.enum(['tilled', 'watered'] as const) }, { category: 'resource', describe: 'Persistent sparse farm state. Exists only after a successful till; identity is lifeFarmPlotEntityId(sceneId,x,y).' }),
    LifeFarmActionResult: defineComponent('LifeFarmActionResult', { action: t.enum(['till', 'water'] as const), status: t.enum(['applied', 'rejected'] as const), reason: t.opt(t.enum(LIFE_FARM_ACTION_REJECT_REASONS)), sceneId: t.str(), x: t.num(), y: t.num() }, { category: 'event', describe: 'One-tick farming outcome. applied has no reason; rejected has one closed reason.' }),
  }, reads: ['LifeActor', 'LifePosition', 'LifeActionResult', 'LifeScene', 'LifeTileCatalog', 'LifeFarmPlot', 'DebugTrace'], writes: ['LifeFarmPlot', 'LifeFarmActionResult'], consumes: [] }, config: {},
  systems: [{
    id: 'life-farming', runsAfter: ['life-action'],
    reads: ['LifeActor', 'LifePosition', 'LifeActionResult', 'LifeScene', 'LifeTileCatalog', 'LifeFarmPlot', 'DebugTrace'], writes: ['LifeFarmPlot', 'LifeFarmActionResult'], consumes: [],
    execute(world: IWorld) {
      const actorIds = sortedIds(world, 'LifeActor');
      for (const actorId of actorIds) if (world.hasComponent(actorId, 'LifeFarmActionResult')) world.removeComponent(actorId, 'LifeFarmActionResult');
      const catalogId = world.singleton('LifeTileCatalog');
      const catalog = catalogId === undefined ? undefined : world.getComponent<LifeTileCatalog>(catalogId, 'LifeTileCatalog');
      const scenes = new Map<string, LifeScene>();
      for (const sceneId of sortedIds(world, 'LifeScene')) { const scene = world.getComponent<LifeScene>(sceneId, 'LifeScene'); if (scene) scenes.set(scene.sceneId, scene); }
      const trace = findDebugTrace(world); let traceCount = 0;
      const record = (kind: 'decision' | 'commit' | 'reject', what: string, why?: string) => {
        if (!trace || traceCount >= 3) return;
        appendTrace(trace, trace.tick ?? world.getVersion(), 'life-farming', kind, what, why); traceCount++;
      };
      const reject = (actorId: string, action: 'till' | 'water', position: LifePosition, reason: LifeFarmActionRejectReason) => {
        world.addComponent(actorId, { type: 'LifeFarmActionResult', action, status: 'rejected', reason, sceneId: position.sceneId, x: position.x, y: position.y } as LifeFarmActionResult);
        record('reject', `${actorId} ${action} rejected`, reason);
      };
      for (const actorId of sortedIds(world, 'LifeActor', 'LifePosition', 'LifeActionResult')) {
        const actor = world.getComponent<LifeActor>(actorId, 'LifeActor');
        const position = world.getComponent<LifePosition>(actorId, 'LifePosition');
        const actionResult = world.getComponent<LifeActionResult>(actorId, 'LifeActionResult');
        if (!actor || !position || !actionResult || actor.kind !== 'player' || actionResult.status !== 'accepted' || !actionResult.action || !FARM_ACTIONS.has(actionResult.action)) continue;
        const action = actionResult.action as 'till' | 'water';
        const scene = scenes.get(position.sceneId);
        if (!scene || !catalog || position.x < 0 || position.y < 0 || position.x >= scene.width || position.y >= scene.height) { reject(actorId, action, position, 'invalid-scene'); continue; }
        if (!lifeGroundTagsAt(scene.layers, catalog.tiles, scene.width, position.x, position.y).includes('plantable')) { reject(actorId, action, position, 'not-plantable'); continue; }
        const plotId = lifeFarmPlotEntityId(position.sceneId, position.x, position.y);
        const plot = world.getComponent<LifeFarmPlot>(plotId, 'LifeFarmPlot');
        if (action === 'till') {
          if (plot) { reject(actorId, action, position, 'already-tilled'); continue; }
          record('decision', `${actorId} till ${position.sceneId}:${position.x},${position.y}`);
          world.createEntity(plotId);
          world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: position.sceneId, x: position.x, y: position.y, soil: 'tilled' } as LifeFarmPlot);
        } else {
          if (!plot) { reject(actorId, action, position, 'missing-plot'); continue; }
          if (plot.soil === 'watered') { reject(actorId, action, position, 'already-watered'); continue; }
          record('decision', `${actorId} water ${position.sceneId}:${position.x},${position.y}`);
          world.addComponent(plotId, { ...plot, soil: 'watered' } as LifeFarmPlot);
        }
        world.addComponent(actorId, { type: 'LifeFarmActionResult', action, status: 'applied', sceneId: position.sceneId, x: position.x, y: position.y } as LifeFarmActionResult);
        record('commit', `${actorId} LifeFarmActionResult=applied`, `action=${action}`);
      }
    },
  }],
});
