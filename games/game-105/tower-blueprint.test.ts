import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { PhysicsSystem, preloadPhysics } from '@zerocraft/engine/renderer/three/physics.js';
import type { RigidBody3D, Transform3D } from '@zerocraft/engine/engine/protocol/components.js';
import { BLOCK_COUNT, BLOCK_HEIGHT, BLOCK_LENGTH, BLOCKS_PER_LAYER, BLOCK_WIDTH, PHYSICS_WORLD, TABLE_TOP, TOWER_BLOCKS, TOWER_DIMENSION_TOLERANCE, TOWER_LAYOUT, TOWER_LAYOUT_SEED, TOWER_LAYERS, createTowerLayout, towerBlueprint } from './tower-blueprint.js';

describe('game-105 S1/S2 physical tower specimen', () => {
  it('builds an 18 by 3 tower with all 54 blocks independently pickable and physical', () => {
    const blueprint = towerBlueprint();
    const blocks = Object.entries(blueprint.entities).filter(([id]) => id.startsWith('g105-block-'));
    expect(BLOCK_COUNT).toBe(TOWER_LAYERS * BLOCKS_PER_LAYER);
    expect(blocks).toHaveLength(54);
    for (const [, entity] of blocks) {
      expect(entity.Pickable3D).toMatchObject({ signal: 'g105-pick', hover: true });
      expect(entity.RigidBody3D).toMatchObject({ shape: 'box', mass: 0.9, settleSignal: 'g105-settled', toppleSignal: 'g105-toppled', toppleTilt: Math.PI / 4 });
    }
  });

  it('alternates each layer long axis by 90 degrees and maps seeded dimensions into the physics boxes', () => {
    expect(TOWER_DIMENSION_TOLERANCE).toEqual({ length: 0.007, width: 0.015, height: 0.01 });
    for (const block of TOWER_BLOCKS) {
      expect(block.axis).toEqual(block.layer % 2 === 0 ? [1, 0, 0] : [0, 0, 1]);
      expect(block.height).toBeGreaterThanOrEqual(BLOCK_HEIGHT * (1 - TOWER_DIMENSION_TOLERANCE.height));
      expect(block.height).toBeLessThanOrEqual(BLOCK_HEIGHT * (1 + TOWER_DIMENSION_TOLERANCE.height));
      expect(block.length).toBeGreaterThanOrEqual(BLOCK_LENGTH * (1 - TOWER_DIMENSION_TOLERANCE.length));
      expect(block.length).toBeLessThanOrEqual(BLOCK_LENGTH * (1 + TOWER_DIMENSION_TOLERANCE.length));
      expect(block.width).toBeGreaterThanOrEqual(BLOCK_WIDTH * (1 - TOWER_DIMENSION_TOLERANCE.width));
      expect(block.width).toBeLessThanOrEqual(BLOCK_WIDTH * (1 + TOWER_DIMENSION_TOLERANCE.width));
      const mesh = towerBlueprint().entities[block.id]?.Mesh3D as { width?: number; height?: number; depth?: number };
      expect(mesh.width).toBe(block.axis[0] ? block.length : block.width);
      expect(mesh.height).toBe(block.height);
      expect(mesh.depth).toBe(block.axis[2] ? block.length : block.width);
    }
    expect(BLOCK_LENGTH).toBeGreaterThan(BLOCK_HEIGHT);
  });

  it('uses a fixed seed for the S3 sample while allowing reproducible alternate tolerance samples', () => {
    expect(TOWER_LAYOUT.seed).toBe(TOWER_LAYOUT_SEED);
    expect(createTowerLayout(TOWER_LAYOUT_SEED).blocks).toEqual(TOWER_BLOCKS);
    expect(createTowerLayout(TOWER_LAYOUT_SEED + 1).blocks.map((block) => block.length)).not.toEqual(TOWER_BLOCKS.map((block) => block.length));
    expect(new Set(TOWER_BLOCKS.map((block) => block.length))).not.toHaveLength(1);
  });

  it('uses the delivered stacking physics configuration rather than the dice defaults', () => {
    expect(PHYSICS_WORLD).toEqual({ gravity: -9.82, restitution: 0, friction: 0.58, solverIterations: 40 });
    expect(towerBlueprint().entities['g105-physics']?.PhysicsWorld3D).toEqual(PHYSICS_WORLD);
    expect(towerBlueprint().entities['g105-table']?.RigidBody3D).toMatchObject({ mass: 0, shape: 'box' });
    expect(towerBlueprint().entities['g105-post']?.Post3D).toMatchObject({ aa: true });
  });
});

describe('game-105 real 54-block physics specimen', () => {
  beforeAll(async () => { await preloadPhysics(); });

  it('keeps the actual crossed tower upright for five seconds', () => {
    const engine = new Engine();
    engine.load(towerBlueprint());
    const top = TOWER_BLOCKS.at(-1)!;
    const y0 = engine.world.getComponent<Transform3D>(top.id, 'Transform3D')!.y;
    const physics = new PhysicsSystem();
    const settled = new Set<string>();
    for (let frame = 1; frame <= 300; frame++) {
      physics.sync(engine.world, frame * 16.7);
      for (const signal of physics.drainSignals()) if (signal.signal === 'g105-settled') settled.add(signal.arg);
    }
    const y1 = engine.world.getComponent<Transform3D>(top.id, 'Transform3D')!.y;
    expect(y0 - y1).toBeLessThan(BLOCK_HEIGHT * 1.1);
    expect(settled.size).toBe(BLOCK_COUNT);
    physics.dispose();
  });

  it('rebuilds fresh Cannon bodies after an empty physics frame before reusing block ids', () => {
    const engine = new Engine();
    engine.load(towerBlueprint());
    const physics = new PhysicsSystem();
    const id = TOWER_BLOCKS[0]!.id;
    physics.sync(engine.world, 16.7);
    physics.applyImpulse(id, 12, 0, 0);
    for (let frame = 2; frame <= 30; frame++) physics.sync(engine.world, frame * 16.7);
    for (const entityId of engine.world.getAllEntities()) engine.world.destroyEntity(entityId);
    physics.sync(engine.world, 31 * 16.7); // Empty frame is the restart cleanup boundary.
    engine.load(towerBlueprint());
    physics.sync(engine.world, 32 * 16.7);
    const reset = engine.world.getComponent<Transform3D>(id, 'Transform3D')!;
    expect(reset.x).toBeCloseTo(TOWER_BLOCKS[0]!.x);
    expect(reset.y).toBeCloseTo(TOWER_BLOCKS[0]!.y);
    physics.dispose();
  });

  it('puts the visible tabletop above the fallback floor instead of overlapping it', () => {
    const engine = new Engine();
    engine.load(towerBlueprint());
    engine.world.createEntity('g105-table-probe');
    engine.world.addComponent('g105-table-probe', { type: 'Transform3D', x: 5, y: 3, z: 5 });
    engine.world.addComponent('g105-table-probe', { type: 'Mesh3D', shape: 'box', width: .4, height: .4, depth: .4, tint: 0xffffff });
    engine.world.addComponent('g105-table-probe', { type: 'RigidBody3D', shape: 'box', mass: 1 } as RigidBody3D);
    const physics = new PhysicsSystem();
    for (let frame = 1; frame <= 300; frame++) physics.sync(engine.world, frame * 16.7);
    const onTable = engine.world.getComponent<Transform3D>('g105-table-probe', 'Transform3D')!;
    expect(onTable.y).toBeGreaterThan(.2 + TABLE_TOP * .6);
    expect(onTable.y).toBeLessThan(.2 + TABLE_TOP * 1.4);

    // Outside the 12x12 table, the general fallback floor remains available as a safe debris catch.
    engine.world.createEntity('g105-no-floor-probe');
    engine.world.addComponent('g105-no-floor-probe', { type: 'Transform3D', x: 8, y: 3, z: 0 });
    engine.world.addComponent('g105-no-floor-probe', { type: 'Mesh3D', shape: 'box', width: .4, height: .4, depth: .4, tint: 0xffffff });
    engine.world.addComponent('g105-no-floor-probe', { type: 'RigidBody3D', shape: 'box', mass: 1 } as RigidBody3D);
    for (let frame = 301; frame <= 600; frame++) physics.sync(engine.world, frame * 16.7);
    const onFloor = engine.world.getComponent<Transform3D>('g105-no-floor-probe', 'Transform3D')!;
    expect(onFloor.y).toBeGreaterThan(.15);
    expect(onFloor.y).toBeLessThan(.25);
    expect(onTable.y).toBeGreaterThan(onFloor.y + TABLE_TOP * .5);
    physics.dispose();
  });
});
