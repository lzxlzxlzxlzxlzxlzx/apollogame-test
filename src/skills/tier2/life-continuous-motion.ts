import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import type { IWorld } from '@engine/core/types.js';
import { normalizeInto } from '@engine/math/vec2.js';
import type { Bounds, InputQueue, LifeActor, LifeContinuousMotion, LifePosition, LifeScene, LifeTileCatalog, Signal, Transform, Velocity } from '@engine/protocol/components.js';
import { lifePoseCell } from '@engine/protocol/life-pose.js';
import { LIFE_MOVE_STATE_ACTION } from '@engine/protocol/life-sim.js';
import { isLifeWalkable } from '@engine/protocol/life-tilemap.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

export const LIFE_CONTINUOUS_MOTION_CAPABILITY_ID = 't2-life-continuous-motion';
const START = 'life.move.start';
const STOP = 'life.move.stop';
const DIRS = new Set(['up', 'down', 'left', 'right']);
type Direction = 'up' | 'down' | 'left' | 'right';
function isDirection(value: string): value is Direction { return DIRS.has(value); }
const DIRECTION_BITS = Object.freeze({ up: 1, down: 2, left: 4, right: 8 } as const);

function parseMovementState(value: string | undefined): Record<Direction, boolean> | undefined {
  if (value === undefined || !/^(?:[0-9]|1[0-5])$/.test(value)) return undefined;
  const mask = Number(value);
  return {
    up: (mask & DIRECTION_BITS.up) !== 0,
    down: (mask & DIRECTION_BITS.down) !== 0,
    left: (mask & DIRECTION_BITS.left) !== 0,
    right: (mask & DIRECTION_BITS.right) !== 0,
  };
}

function heldLabel(state: Pick<LifeContinuousMotion, Direction>): string {
  const held = (Object.keys(DIRECTION_BITS) as Direction[]).filter((direction) => state[direction]);
  return held.length === 0 ? 'none' : held.join('+');
}

function sceneById(world: IWorld, sceneId: string): LifeScene | undefined {
  for (const [id] of world.query('LifeScene')) {
    const scene = world.getComponent<LifeScene>(id, 'LifeScene');
    if (scene?.sceneId === sceneId) return scene;
  }
  return undefined;
}

function trace(world: IWorld, system: string, kind: 'decision' | 'transition' | 'reject', subject: string, detail?: string): void {
  const debug = findDebugTrace(world);
  if (debug) appendTrace(debug, debug.tick ?? world.getVersion(), system, kind, subject, detail);
}

/** Semantic held-direction bridge. Transform is authoritative; motion-apply integrates accepted velocity. */
export const lifeContinuousMotionCapability = defineCapability({
  id: LIFE_CONTINUOUS_MOTION_CAPABILITY_ID,
  version: '1.1.0',
  describe: { name: 'life continuous motion', summary: 'Projects complete physical direction state, with legacy start/stop compatibility, into normalized collision-safe velocity and derives LifePosition from Transform.', semantic: ['life-sim', 'movement', 'input'], whenToUse: 'Life packages with continuous movement. Hosts enqueue life.move.state with a complete direction bitmask; legacy systems may still send life.move.start/stop with arg up/down/left/right.', examples: ['InputQueue action {key:"life.move.state",arg:"9"} → held up+right', 'Signal{ name:"life.move.start",arg:"right" } → Velocity{vx:speed,vy:0}'] },
  components: {
    provides: { LifeContinuousMotion: defineComponent('LifeContinuousMotion', { sceneId: t.str(), speed: t.num(), up: t.bool(), down: t.bool(), left: t.bool(), right: t.bool() }, { category: 'resource', describe: 'Held directions, current scene, and tile-units-per-tick speed. Transform is the only position authority.' }) },
    reads: ['InputQueue', 'Signal', 'LifeActor', 'LifeContinuousMotion', 'LifeScene', 'LifeTileCatalog', 'Transform', 'Velocity', 'LifePosition', 'Bounds', 'DebugTrace'], writes: ['LifeContinuousMotion', 'Velocity', 'LifePosition', 'Bounds'], consumes: [],
  },
  config: {},
  systems: [
    { id: 'life-continuous-motion', runsAfter: ['keybind', 'life-input'], runsBefore: ['life-continuous-collision', 'life-navigation'], reads: ['InputQueue', 'Signal', 'LifeActor', 'LifeContinuousMotion', 'Velocity', 'DebugTrace'], writes: ['LifeContinuousMotion', 'Velocity'], consumes: [], execute(world: IWorld) {
      const signals = new Map<string, Array<{ name: string; arg?: string }>>();
      for (const id of sortedIds(world, 'Signal')) {
        const signal = world.getComponent<Signal>(id, 'Signal');
        if (!signal || (signal.name !== START && signal.name !== STOP)) continue;
        const group = signals.get(signal.source); if (group) group.push(signal); else signals.set(signal.source, [signal]);
      }
      const snapshots = new Map<string, string | undefined>();
      for (const queueId of sortedIds(world, 'InputQueue')) {
        const queue = world.getComponent<InputQueue>(queueId, 'InputQueue');
        for (const action of queue?.actions ?? []) if (action.key === LIFE_MOVE_STATE_ACTION && action.phase === 'action') snapshots.set(action.source, action.arg);
      }
      const debug = findDebugTrace(world); let traceCount = 0;
      for (const id of sortedIds(world, 'LifeActor', 'LifeContinuousMotion', 'Velocity')) {
        const actor = world.getComponent<LifeActor>(id, 'LifeActor'); const state = world.getComponent<LifeContinuousMotion>(id, 'LifeContinuousMotion'); const velocity = world.getComponent<Velocity>(id, 'Velocity');
        if (!actor || actor.kind !== 'player' || !state || !velocity) continue;
        for (const signal of signals.get(id) ?? []) if (typeof signal.arg === 'string' && isDirection(signal.arg)) state[signal.arg] = signal.name === START;
        let projectedSnapshot = false;
        if (snapshots.has(id)) {
          const next = parseMovementState(snapshots.get(id));
          if (!next) {
            if (debug && traceCount < 3) {
              appendTrace(debug, debug.tick ?? world.getVersion(), 'life-continuous-motion', 'reject', `${id} movement state rejected`, `arg=${String(snapshots.get(id))}`); traceCount++;
            }
          } else {
            projectedSnapshot = true;
            const before = debug ? heldLabel(state) : undefined;
            state.up = next.up; state.down = next.down; state.left = next.left; state.right = next.right;
            if (debug && traceCount < 3) {
              const after = heldLabel(state);
              if (before !== after) {
                appendTrace(debug, debug.tick ?? world.getVersion(), 'life-continuous-motion', 'transition', `${id} held directions`, `${before}→${after}`); traceCount++;
              }
            }
          }
        }
        const dx = (state.right ? 1 : 0) - (state.left ? 1 : 0); const dy = (state.down ? 1 : 0) - (state.up ? 1 : 0);
        const direction = { x: 0, y: 0 }; normalizeInto(dx, dy, direction);
        velocity.vx = direction.x * state.speed; velocity.vy = direction.y * state.speed;
        if (projectedSnapshot && debug && traceCount < 3) {
          appendTrace(debug, debug.tick ?? world.getVersion(), 'life-continuous-motion', 'decision', `${id} velocity projection`, `${dx},${dy}`); traceCount++;
        }
      }
    }},
    { id: 'life-continuous-collision', runsAfter: ['life-continuous-motion'], runsBefore: ['motion-apply', 'life-navigation'], reads: ['LifeActor', 'LifeContinuousMotion', 'LifeScene', 'LifeTileCatalog', 'Transform', 'Velocity', 'DebugTrace'], writes: ['Velocity'], consumes: [], execute(world: IWorld) {
      const catalogEntity = world.singleton('LifeTileCatalog'); const catalog = catalogEntity === undefined ? undefined : world.getComponent<LifeTileCatalog>(catalogEntity, 'LifeTileCatalog');
      for (const id of sortedIds(world, 'LifeActor', 'LifeContinuousMotion', 'Transform', 'Velocity')) {
        const actor = world.getComponent<LifeActor>(id, 'LifeActor'); const state = world.getComponent<LifeContinuousMotion>(id, 'LifeContinuousMotion'); const transform = world.getComponent<Transform>(id, 'Transform'); const velocity = world.getComponent<Velocity>(id, 'Velocity');
        if (!actor || actor.kind !== 'player' || !state || !transform || !velocity || (velocity.vx === 0 && velocity.vy === 0)) continue;
        const scene = sceneById(world, state.sceneId);
        const walkable = (x: number, y: number): boolean => !!scene && !!catalog && x >= 0 && y >= 0 && x < scene.width && y < scene.height && isLifeWalkable(scene.layers, catalog.tiles, scene.width, x, y);
        const xCell = lifePoseCell(transform.x + velocity.vx, transform.y);
        const yCell = lifePoseCell(transform.x, transform.y + velocity.vy);
        const diagonalCell = lifePoseCell(transform.x + velocity.vx, transform.y + velocity.vy);
        const xAllowed = velocity.vx === 0 || walkable(xCell.x, xCell.y);
        const yAllowed = velocity.vy === 0 || walkable(yCell.x, yCell.y);
        const diagonalAllowed = velocity.vx === 0 || velocity.vy === 0 || walkable(diagonalCell.x, diagonalCell.y);
        if (!xAllowed) velocity.vx = 0; if (!yAllowed) velocity.vy = 0; if (!diagonalAllowed) { velocity.vx = 0; velocity.vy = 0; }
        if (!xAllowed || !yAllowed || !diagonalAllowed) trace(world, 'life-continuous-collision', 'reject', `${id} motion rejected`, `scene=${state.sceneId}`);
      }
    }},
    { id: 'life-position-sync', runsAfter: ['motion-apply', 'life-navigation'], reads: ['LifeActor', 'LifeContinuousMotion', 'LifeScene', 'Transform', 'LifePosition', 'Bounds', 'DebugTrace'], writes: ['LifePosition', 'Bounds'], consumes: [], execute(world: IWorld) {
      for (const id of sortedIds(world, 'LifeActor', 'LifeContinuousMotion', 'Transform', 'LifePosition')) {
        const actor = world.getComponent<LifeActor>(id, 'LifeActor'); const motion = world.getComponent<LifeContinuousMotion>(id, 'LifeContinuousMotion'); const transform = world.getComponent<Transform>(id, 'Transform'); const position = world.getComponent<LifePosition>(id, 'LifePosition');
        if (!actor || actor.kind !== 'player' || !motion || !transform || !position) continue;
        const cell = lifePoseCell(transform.x, transform.y); const x = cell.x; const y = cell.y; const sceneChanged = position.sceneId !== motion.sceneId;
        if (position.sceneId === motion.sceneId && position.x === x && position.y === y) continue;
        position.sceneId = motion.sceneId; position.x = x; position.y = y;
        if (sceneChanged) {
          const scene = sceneById(world, motion.sceneId); const bounds = world.getComponent<Bounds>('life:camera', 'Bounds');
          if (scene && bounds) {
            bounds.minX = 0; bounds.minY = 0; bounds.maxX = scene.width; bounds.maxY = scene.height;
          }
        }
        trace(world, 'life-position-sync', 'transition', `${id} logical position`, `${motion.sceneId}:${x},${y}`);
      }
    }},
  ],
});
