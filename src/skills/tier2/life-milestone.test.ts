import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import { hashSnapshot } from '@net/determinism.js';
import { SystemPhase } from '@engine/core/types.js';
import type { DebugTrace, Flag, LifeContinuousMotion, LifeCrop, LifeFarmPlot, LifeMilestoneLedger, LifePosition, Resource, ResourceModify, Transform } from '@engine/protocol/components.js';
import { lifeFarmPlotEntityId } from '@engine/protocol/life-farming.js';
import { lifeMilestoneCapability } from './life-milestone.js';

const plotId = lifeFarmPlotEntityId('farm', 1, 1);
function pkg(): any {
  const value: any = JSON.parse(JSON.stringify(threeSceneLifePackage()));
  value.itemCatalog = [{ id: 'seed.turnip', kind: 'seed', skinKey: 'item:seed' }, { id: 'crop.turnip', kind: 'crop', skinKey: 'item:crop' }, { id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }];
  value.playerInventory = { slots: 2, maxStack: 9, items: [] };
  value.cropCatalog = [{ id: 'turnip', seedItemId: 'seed.turnip', harvestItemId: 'crop.turnip', growthDays: 1 }];
  value.logic = { flags: [{ id: 'flag.first', initial: false }], resources: [{ id: 'resource.renown', initial: 0, min: 0, max: 9 }] };
  value.milestones = [{ id: 'first-turnip', trigger: 'harvest.applied', cropId: 'turnip', repeat: 'once', effects: { flags: [{ id: 'flag.first', value: true }], resources: [{ id: 'resource.renown', amount: 2 }] } }];
  return value;
}
function make(trace = false, milestones?: any[]): Engine {
  const source = pkg(); if (milestones) source.milestones = milestones;
  const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(source).blueprint);
  engine.world.addComponent('life:player', { type: 'LifePosition', sceneId: 'farm', x: 1, y: 1 } as LifePosition);
  engine.world.addComponent('life:player', { type: 'Transform', x: 1, y: 1, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!.sceneId = 'farm';
  engine.world.createEntity(plotId); engine.world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: 'farm', x: 1, y: 1, soil: 'tilled' } as LifeFarmPlot); engine.world.addComponent(plotId, { type: 'LifeCrop', cropId: 'turnip', daysGrown: 1, stage: 'mature' } as LifeCrop);
  if (trace) { engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 1, max: 20 } as DebugTrace); }
  return engine;
}
function harvest(engine: Engine): void { const source = new QueuedInputSource('host'); source.enqueueAction('life.action', { arg: 'harvest' }); applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1)); engine.world.tick(); }

describe('t2-life-milestone', () => {
  it('commits harvest facts once, then routes declared resource effects through ResourceModify', () => {
    const engine = make(); harvest(engine);
    expect(engine.world.getComponent<Flag>('life:logic:flag:flag.first', 'Flag')).toMatchObject({ active: true });
    expect(engine.world.getComponent<LifeMilestoneLedger>('life:milestone-ledger', 'LifeMilestoneLedger')!.completedIds).toEqual(['first-turnip']);
    expect(engine.world.getComponent<ResourceModify>('life:logic:resource:resource.renown', 'ResourceModify')).toMatchObject({ resourceId: 'resource.renown', amount: 2 });
    engine.world.tick();
    expect(engine.world.getComponent<Resource>('life:logic:resource:resource.renown', 'Resource')).toMatchObject({ current: 2 });
  });

  it('is deterministic, has a Commit boundary, and traces rejected harvests without applying milestones', () => {
    expect(lifeMilestoneCapability.systems[0]!.phase).toBe(SystemPhase.Commit);
    const a = make(), b = make(); harvest(a); harvest(b); expect(hashSnapshot(a.world.snapshot())).toBe(hashSnapshot(b.world.snapshot()));
    const rejected = make(true); rejected.world.removeComponent(plotId, 'LifeCrop'); harvest(rejected);
    expect(rejected.world.getComponent<Flag>('life:logic:flag:flag.first', 'Flag')).toMatchObject({ active: false });
    expect(rejected.world.getComponent<LifeMilestoneLedger>('life:milestone-ledger', 'LifeMilestoneLedger')!.completedIds).toEqual([]);
    expect(rejected.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-milestone', kind: 'reject', why: 'harvest-not-applied' })]));
  });

  it('accumulates same-resource rewards from every matching milestone independently of declaration order', () => {
    const milestones = [
      { id: 'reward-a', trigger: 'harvest.applied', cropId: 'turnip', repeat: 'once', effects: { resources: [{ id: 'resource.renown', amount: 2 }] } },
      { id: 'reward-b', trigger: 'harvest.applied', cropId: 'turnip', repeat: 'once', effects: { resources: [{ id: 'resource.renown', amount: 3 }] } },
    ];
    const run = (declared: any[]) => { const engine = make(false, declared); harvest(engine); const pending = engine.world.getComponent<ResourceModify>('life:logic:resource:resource.renown', 'ResourceModify'); engine.world.tick(); return { pending, value: engine.world.getComponent<Resource>('life:logic:resource:resource.renown', 'Resource')!.current, hash: hashSnapshot(engine.world.snapshot()) }; };
    const forward = run(milestones); const reversed = run([...milestones].reverse());
    expect(forward.pending).toMatchObject({ resourceId: 'resource.renown', amount: 5, scope: 'global' });
    expect(forward.value).toBe(5); expect(reversed.value).toBe(5); expect(forward.hash).toBe(reversed.hash);
  });
});
