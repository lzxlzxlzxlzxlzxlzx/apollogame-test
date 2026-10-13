import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import type { DebugTrace, LifeContinuousMotion, LifeCrop, LifeFarmPlot, LifeHarvestActionResult, LifeItemCatalog, LifePosition, Transform } from '@engine/protocol/components.js';
import type { Inventory } from './inventory.js';
import { invCount } from './inventory.js';
import { lifeFarmPlotEntityId } from '@engine/protocol/life-farming.js';

function pkg(): any {
  const value: any = JSON.parse(JSON.stringify(threeSceneLifePackage()));
  value.itemCatalog = [{ id: 'seed.turnip', kind: 'seed', skinKey: 'item:seed' }, { id: 'crop.turnip', kind: 'crop', skinKey: 'item:crop' }, { id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }];
  value.playerInventory = { slots: 2, maxStack: 9, items: [{ itemId: 'seed.turnip', count: 1 }] };
  value.cropCatalog = [{ id: 'turnip', seedItemId: 'seed.turnip', harvestItemId: 'crop.turnip', growthDays: 1 }];
  return value;
}
function make(): Engine {
  const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(pkg()).blueprint);
  engine.world.addComponent('life:player', { type: 'LifePosition', sceneId: 'farm', x: 1, y: 1 } as LifePosition);
  engine.world.addComponent('life:player', { type: 'Transform', x: 1, y: 1, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!.sceneId = 'farm';
  return engine;
}
function action(engine: Engine, source: QueuedInputSource, key: string, arg?: string): void {
  source.enqueueAction(key, arg === undefined ? undefined : { arg });
  applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1)); engine.world.tick();
}
const plotId = lifeFarmPlotEntityId('farm', 1, 1);
function mature(engine: Engine, cropId = 'turnip'): void {
  engine.world.createEntity(plotId);
  engine.world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: 'farm', x: 1, y: 1, soil: 'tilled' } as LifeFarmPlot);
  engine.world.addComponent(plotId, { type: 'LifeCrop', cropId, daysGrown: 1, stage: 'mature' } as LifeCrop);
}

describe('t2-life-harvest', () => {
  it('completes the action chain from seed to mature crop to atomic standard-inventory harvest', () => {
    const engine = make(); const source = new QueuedInputSource('host');
    action(engine, source, 'life.action', 'till');
    action(engine, source, 'life.action', 'water');
    action(engine, source, 'life.select-item', 'seed.turnip'); action(engine, source, 'life.action', 'plant');
    action(engine, source, 'life.advance-day');
    expect(engine.world.getComponent<LifeCrop>(plotId, 'LifeCrop')).toMatchObject({ stage: 'mature', daysGrown: 1 });
    action(engine, source, 'life.action', 'harvest');
    const inventory = engine.world.getComponent<Inventory>('life:player', 'Inventory')!;
    expect(invCount(inventory, 'crop.turnip')).toBe(1);
    expect(engine.world.hasComponent(plotId, 'LifeCrop')).toBe(false);
    expect(engine.world.getComponent<LifeFarmPlot>(plotId, 'LifeFarmPlot')).toMatchObject({ soil: 'tilled' });
    expect(engine.world.getComponent<LifeHarvestActionResult>('life:player', 'LifeHarvestActionResult')).toEqual({ type: 'LifeHarvestActionResult', status: 'applied', sceneId: 'farm', x: 1, y: 1, cropId: 'turnip', itemId: 'crop.turnip', quantity: 1 });
  });

  it('rejects missing, immature, unknown, invalid-item, and full-inventory harvests without partial writes', () => {
    const cases: Array<[string, (engine: Engine) => void, string]> = [
      ['missing-plot', () => {}, 'missing-plot'],
      ['missing-crop', (engine) => { engine.world.createEntity(plotId); engine.world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: 'farm', x: 1, y: 1, soil: 'tilled' } as LifeFarmPlot); }, 'missing-crop'],
      ['not-mature', (engine) => { mature(engine); engine.world.addComponent(plotId, { type: 'LifeCrop', cropId: 'turnip', daysGrown: 0, stage: 'seeded' } as LifeCrop); }, 'not-mature'],
      ['unknown-crop', (engine) => mature(engine, 'ghost'), 'unknown-crop'],
      ['invalid-harvest-item', (engine) => { mature(engine); engine.world.addComponent('life:item-catalog', { type: 'LifeItemCatalog', items: [{ id: 'seed.turnip', kind: 'seed', skinKey: 'item:seed' }, { id: 'crop.turnip', kind: 'resource', skinKey: 'item:crop' }] } as LifeItemCatalog); }, 'invalid-harvest-item'],
      ['inventory-full', (engine) => { mature(engine); engine.world.addComponent('life:player', { type: 'Inventory', id: 'bag:life:player', slots: 1, maxStack: 1, items: [{ kind: 'seed.turnip', count: 1 }] } as Inventory); }, 'inventory-full'],
    ];
    for (const [, arrange, reason] of cases) {
      const engine = make(); const source = new QueuedInputSource('host'); arrange(engine);
      const beforeInventory = JSON.stringify(engine.world.getComponent<Inventory>('life:player', 'Inventory'));
      const beforeCrop = JSON.stringify(engine.world.getComponent<LifeCrop>(plotId, 'LifeCrop'));
      action(engine, source, 'life.action', 'harvest');
      expect(engine.world.getComponent<LifeHarvestActionResult>('life:player', 'LifeHarvestActionResult')).toMatchObject({ status: 'rejected', reason });
      expect(JSON.stringify(engine.world.getComponent<Inventory>('life:player', 'Inventory'))).toBe(beforeInventory);
      expect(JSON.stringify(engine.world.getComponent<LifeCrop>(plotId, 'LifeCrop'))).toBe(beforeCrop);
    }
  });

  it('removes a crop only once and clears stale harvest results on no-action ticks', () => {
    const engine = make(); const source = new QueuedInputSource('host'); mature(engine);
    action(engine, source, 'life.action', 'harvest'); action(engine, source, 'life.action', 'harvest');
    expect(engine.world.getComponent<LifeHarvestActionResult>('life:player', 'LifeHarvestActionResult')).toMatchObject({ status: 'rejected', reason: 'missing-crop' });
    applyCommands(engine.world, []); engine.world.tick();
    expect(engine.world.hasComponent('life:player', 'LifeHarvestActionResult')).toBe(false);
  });

  it('traces applied and rejected outcomes while idle harvest processing stays quiet', () => {
    const engine = make(); const source = new QueuedInputSource('host');
    engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
    engine.world.tick(); expect(engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.filter((event) => event.system === 'life-harvest')).toEqual([]);
    mature(engine); action(engine, source, 'life.action', 'harvest');
    expect(engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-harvest', kind: 'decision' }), expect.objectContaining({ system: 'life-harvest', kind: 'commit' })]));
    const trace = engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!; trace.events = [];
    action(engine, source, 'life.action', 'harvest');
    expect(trace.events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-harvest', kind: 'reject', why: 'missing-crop' })]));
  });
});
