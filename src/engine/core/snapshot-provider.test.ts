import { describe, it, expect } from 'vitest';
import { World } from './world.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { steeringCapability } from '@skills/tier2/steering.js';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';
import type { Transform, Relation, FrameStartTransform } from '../protocol/components.js';

function place(world: World, id: string, x: number) {
  world.createEntity(id);
  world.addComponent(id, { type: 'Transform', x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  world.addComponent(id, { type: 'Shape', kind: 'circle', radius: 1 });
}
function turret(world: World) {
  place(world, 'turret', 0);
  world.addComponent('turret', { type: 'Perception', targetTag: 2, sightRadius: 5 });
}

describe('shared frame-start snapshot provider', () => {
  it('static aggro captures on first tick without installing free motion', () => {
    const world = new World();
    aggroCapability.systems.forEach(s => world.addSystem(s));
    turret(world); place(world, 'enemy', 4);
    world.addComponent('enemy', { type: 'Tag', flags: 2 });
    world.tick();
    expect(world.getComponent<Relation>('turret', 'Relation')?.targetId).toBe('enemy');
    expect(world.getSortedSystems().map(s => s.id)).toEqual(['frame-start-transform', 'aggro']);
  });
  it('decisions read tick start while actual overlap reads moved position', () => {
    const world = new World();
    const caps = [aggroCapability, motionApplyCapability, overlapDetectCapability];
    caps.flatMap(c => c.systems).forEach(s => world.addSystem(s));
    turret(world); place(world, 'enemy', 10);
    world.addComponent('enemy', { type: 'Tag', flags: 2 });
    world.addComponent('enemy', { type: 'Velocity', vx: -9, vy: 0 });
    world.tick();
    expect(world.getComponent('turret', 'Relation')).toBeUndefined();
    expect(world.getComponent<FrameStartTransform>('enemy', 'FrameStartTransform')?.x).toBe(10);
    expect(world.getComponent<Transform>('enemy', 'Transform')?.x).toBe(1);
    expect(world.query('Overlap')).toHaveLength(1);
    world.tick();
    expect(world.getComponent<Relation>('turret', 'Relation')?.targetId).toBe('enemy');
  });
  it('multiple decision consumers share one provider and audit matches execution', () => {
    const world = new World();
    const caps = [aggroCapability, steeringCapability, motionApplyCapability];
    caps.flatMap(c => c.systems).forEach(s => world.addSystem(s));
    const systems = world.getSortedSystems();
    expect(systems.filter(s => s.id === 'frame-start-transform')).toHaveLength(1);
    const graph = analyzeSystemGraph(caps);
    expect(graph.systemCount).toBe(systems.length);
    expect(graph.duplicateIds).toEqual([]);
    expect(graph.sccs).toEqual([]);
  });
  it('motion-only retains its public first system and pays no snapshot cost', () => {
    const world = new World();
    expect(motionApplyCapability.systems[0].id).toBe('motion-apply');
    motionApplyCapability.systems.forEach(s => world.addSystem(s));
    place(world, 'body', 0); world.tick();
    expect(world.query('FrameStartTransform')).toEqual([]);
    expect(world.getSortedSystems()).toHaveLength(1);
  });
  it('new worlds with reused entity IDs capture their own first positions', () => {
    for (const x of [2, 20, 3]) {
      const world = new World();
      aggroCapability.systems.forEach(s => world.addSystem(s));
      turret(world); place(world, 'enemy', x);
      world.addComponent('enemy', { type: 'Tag', flags: 2 }); world.tick();
      expect(world.getComponent<FrameStartTransform>('enemy', 'FrameStartTransform')?.x).toBe(x);
      expect(world.getComponent<Relation>('turret', 'Relation')?.targetId).toBe(x <= 5 ? 'enemy' : undefined);
    }
  });
});
