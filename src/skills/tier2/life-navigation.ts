import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { LifeActor, LifeContinuousMotion, LifeMoveRequest, LifeWarpRequest, LifeScene, LifeSpawn, LifeTileCatalog, LifeWarp, LifeWarpResult, Transform } from '@engine/protocol/components.js';
import { isLifeWalkable } from '@engine/protocol/life-tilemap.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';
import { lifeAccessMet } from './life-access.js';

const SYSTEM_ID = 'life-navigation';
const CARDINAL = new Set(['1,0', '-1,0', '0,1', '0,-1']);
function reject(world: IWorld, what: string, why: string): void { const trace = findDebugTrace(world); if (trace) appendTrace(trace, trace.tick ?? world.getVersion(), SYSTEM_ID, 'reject', what, why); }
function sceneById(world: IWorld, sceneId: string): LifeScene | undefined { for (const [id] of world.query('LifeScene')) { const scene = world.getComponent<LifeScene>(id, 'LifeScene'); if (scene?.sceneId === sceneId) return scene; } return undefined; }
function warpById(world: IWorld, sceneId: string, warpId: string): LifeWarp | undefined { for (const [id] of world.query('LifeWarp')) { const warp = world.getComponent<LifeWarp>(id, 'LifeWarp'); if (warp?.sceneId === sceneId && warp.warpId === warpId) return warp; } return undefined; }
function spawnById(world: IWorld, sceneId: string, spawnId: string): LifeSpawn | undefined { for (const [id] of world.query('LifeSpawn')) { const spawn = world.getComponent<LifeSpawn>(id, 'LifeSpawn'); if (spawn?.sceneId === sceneId && spawn.spawnId === spawnId) return spawn; } return undefined; }

export const lifeNavigationCapability = defineCapability({
  id: 't2-life-navigation', version: '1.0.0',
  describe: { name: 'life navigation', summary: 'Deterministic player-only cardinal tile movement and explicit Warp requests over LifeGamePackage static data.', semantic: ['tier2', 'life-sim', 'navigation', 'grid', 'scene-warp'], whenToUse: 'Use with t3-life-world for player grid movement. Add LifeMoveRequest or LifeWarpRequest to the player actor; every request is consumed.', examples: ['LifeMoveRequest{dx:1,dy:0}', 'LifeWarpRequest{warpId:"town-farm-door"}'] },
  components: { provides: {
    LifeActor: defineComponent('LifeActor', { actorId: t.str(), kind: t.enum(['player', 'npc'] as const) }, { category: 'config', describe: 'Life actor identity. ENG-03 only interprets kind=player.' }),
    LifePosition: defineComponent('LifePosition', { sceneId: t.str(), x: t.num(), y: t.num() }, { category: 'resource', describe: 'Derived logical tile cache from Transform; snapshot/hash state.' }),
    LifeMoveRequest: defineComponent('LifeMoveRequest', { dx: t.num(), dy: t.num() }, { category: 'event', describe: 'One requested cardinal grid step; consumed whether accepted or rejected.' }),
    LifeWarpRequest: defineComponent('LifeWarpRequest', { warpId: t.str() }, { category: 'event', describe: 'Explicit Warp request; consumed whether accepted or rejected.' }),
    LifeWarpResult: defineComponent('LifeWarpResult', { status: t.enum(['applied','rejected'] as const), reason: t.opt(t.enum(['unknown','not-at-warp','invalid-target','locked'] as const)), warpId: t.opt(t.str()) }, { category: 'event', describe: 'Deterministic Warp outcome, including data-gated rejection.' }),
  }, reads: ['LifeActor', 'LifeContinuousMotion', 'LifeScene', 'LifeTileCatalog', 'LifeWarp', 'LifeSpawn', 'LifeMoveRequest', 'LifeWarpRequest', 'LifeWarpResult', 'Flag', 'Resource', 'Transform'], writes: ['LifeContinuousMotion', 'Transform', 'LifeWarpResult'], consumes: ['LifeMoveRequest', 'LifeWarpRequest'] }, config: {},
  systems: [{ id: SYSTEM_ID, runsAfter: ['life-input', 'motion-apply'], reads: ['LifeActor', 'LifeContinuousMotion', 'LifeScene', 'LifeTileCatalog', 'LifeWarp', 'LifeSpawn', 'LifeMoveRequest', 'LifeWarpRequest', 'LifeWarpResult', 'Flag', 'Resource', 'Transform'], writes: ['LifeContinuousMotion', 'Transform', 'LifeWarpResult'], consumes: ['LifeMoveRequest', 'LifeWarpRequest'], execute(world) {
    const catalogEntity = world.singleton('LifeTileCatalog'); const catalog = catalogEntity === undefined ? undefined : world.getComponent<LifeTileCatalog>(catalogEntity, 'LifeTileCatalog');
    for (const entityId of sortedIds(world, 'LifeActor', 'LifeContinuousMotion', 'Transform')) {
      const actor = world.getComponent<LifeActor>(entityId, 'LifeActor');
      const motion = world.getComponent<LifeContinuousMotion>(entityId, 'LifeContinuousMotion'); const transform = world.getComponent<Transform>(entityId, 'Transform');
      if (!actor || !motion || !transform || actor.kind !== 'player') continue;
      const move = world.getComponent<LifeMoveRequest>(entityId, 'LifeMoveRequest'); const warpRequest = world.getComponent<LifeWarpRequest>(entityId, 'LifeWarpRequest');
      if (world.hasComponent(entityId, 'LifeWarpResult')) world.removeComponent(entityId, 'LifeWarpResult');
      if (!move && !warpRequest) continue;
      if (move && warpRequest) { reject(world, `${entityId} request rejected`, 'move and warp in the same tick are ambiguous'); continue; }
      if (move) {
        if (!CARDINAL.has(`${move.dx},${move.dy}`)) { reject(world, `${entityId} move rejected`, 'request is not a cardinal unit vector'); continue; }
        if (motion.up || motion.down || motion.left || motion.right) { reject(world, `${entityId} move rejected`, 'grid and continuous movement in the same tick are ambiguous'); continue; }
        const x = Math.floor(transform.x); const y = Math.floor(transform.y); const scene = sceneById(world, motion.sceneId); const nx = x + move.dx; const ny = y + move.dy;
        if (!scene || !catalog || nx < 0 || ny < 0 || nx >= scene.width || ny >= scene.height) { reject(world, `${entityId} move rejected`, 'target is outside a known current scene'); continue; }
        if (!isLifeWalkable(scene.layers, catalog.tiles, scene.width, nx, ny)) { reject(world, `${entityId} move rejected`, 'target terrain is not walkable'); continue; }
        const trace = findDebugTrace(world);
        if (trace) { const tick = trace.tick ?? world.getVersion(); appendTrace(trace, tick, SYSTEM_ID, 'decision', `${entityId} move ${x},${y}→${nx},${ny}`, `scene=${motion.sceneId}`); transform.x = nx; transform.y = ny; appendTrace(trace, tick, SYSTEM_ID, 'commit', `${entityId} Transform=${motion.sceneId}:${nx},${ny}`); }
        else { transform.x = nx; transform.y = ny; }
        continue;
      }
      const x = Math.floor(transform.x); const y = Math.floor(transform.y); const warp = warpById(world, motion.sceneId, warpRequest!.warpId);
      if (!warp) { world.addComponent(entityId,{type:'LifeWarpResult',status:'rejected',reason:'unknown',warpId:warpRequest!.warpId} as LifeWarpResult); reject(world, `${entityId} warp rejected`, 'warp is unknown in current scene'); continue; }
      if (x !== warp.x || y !== warp.y) { world.addComponent(entityId,{type:'LifeWarpResult',status:'rejected',reason:'not-at-warp',warpId:warp.warpId} as LifeWarpResult); reject(world, `${entityId} warp rejected`, 'actor is not standing on warp location'); continue; }
      if (!lifeAccessMet(world, warp.requires)) { world.addComponent(entityId,{type:'LifeWarpResult',status:'rejected',reason:'locked',warpId:warp.warpId} as LifeWarpResult); reject(world, `${entityId} warp rejected`, 'locked'); continue; }
      const target = spawnById(world, warp.toSceneId, warp.toSpawnId);
      if (!target || !sceneById(world, warp.toSceneId)) { world.addComponent(entityId,{type:'LifeWarpResult',status:'rejected',reason:'invalid-target',warpId:warp.warpId} as LifeWarpResult); reject(world, `${entityId} warp rejected`, 'warp target scene or spawn is invalid'); continue; }
      const trace = findDebugTrace(world);
      if (trace) { const tick = trace.tick ?? world.getVersion(); appendTrace(trace, tick, SYSTEM_ID, 'transition', `${entityId} ${motion.sceneId}→${target.sceneId}`, `warp=${warp.warpId}`); motion.sceneId = target.sceneId; transform.x = target.x; transform.y = target.y; appendTrace(trace, tick, SYSTEM_ID, 'commit', `${entityId} Transform=${target.sceneId}:${target.x},${target.y}`); }
      else { motion.sceneId = target.sceneId; transform.x = target.x; transform.y = target.y; }
      world.addComponent(entityId,{type:'LifeWarpResult',status:'applied',warpId:warp.warpId} as LifeWarpResult);
    }
  }}],
});
