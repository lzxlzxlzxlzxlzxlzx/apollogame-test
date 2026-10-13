import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { validateLifeGamePackage } from '@assembly/life-package.js';
import type { LifeCalendar, LifeCalendarAdvanceResult, LifeCrop, LifeFarmPlot, LifeTimeAdvanceResult, Signal } from '@engine/protocol/components.js';

function pkg(): any {
  const value: any = JSON.parse(JSON.stringify(threeSceneLifePackage()));
  value.calendar = { seasons: [{ id: 'spring', lengthDays: 2 }, { id: 'summer', lengthDays: 1 }], initialSeasonId: 'spring', initialDayOfSeason: 1 };
  value.itemCatalog = [{ id: 'seed.turnip', kind: 'seed', skinKey: 'item:seed' }, { id: 'crop.turnip', kind: 'crop', skinKey: 'item:crop' }, { id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }];
  value.playerInventory = { slots: 2, maxStack: 9, items: [] };
  value.cropCatalog = [{ id: 'turnip', seedItemId: 'seed.turnip', harvestItemId: 'crop.turnip', growthDays: 2 }];
  return value;
}
function make(): Engine { const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(pkg()).blueprint); return engine; }
function advance(engine: Engine, source: QueuedInputSource): void {
  source.enqueueAction('life.advance-day');
  applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1));
  engine.world.tick();
}
function advanceTime(engine: Engine, source: QueuedInputSource): void {
  source.enqueueAction('life.advance-time');
  applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1));
  engine.world.tick();
}

describe('t2-life-calendar and t2-life-crop-growth', () => {
  it('advances only via semantic input, crosses seasons, and grows then dries watered sparse crops', () => {
    const engine = make();
    engine.world.createEntity('plot');
    engine.world.addComponent('plot', { type: 'LifeFarmPlot', sceneId: 'farm', x: 0, y: 0, soil: 'watered' } as LifeFarmPlot);
    engine.world.addComponent('plot', { type: 'LifeCrop', cropId: 'turnip', daysGrown: 0, stage: 'seeded' } as LifeCrop);
    engine.world.tick();
    expect(engine.world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')).toMatchObject({ totalDay: 1, seasonId: 'spring', dayOfSeason: 1 });
    expect(engine.world.getComponent<LifeCrop>('plot', 'LifeCrop')).toMatchObject({ daysGrown: 0, stage: 'seeded' });

    const source = new QueuedInputSource('host');
    advance(engine, source);
    expect(engine.world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')).toMatchObject({ totalDay: 2, seasonId: 'spring', dayOfSeason: 2 });
    expect(engine.world.getComponent<LifeCalendarAdvanceResult>('life:calendar', 'LifeCalendarAdvanceResult')).toMatchObject({ status: 'advanced' });
    expect(engine.world.getComponent<LifeCrop>('plot', 'LifeCrop')).toMatchObject({ daysGrown: 1, stage: 'growing' });
    expect(engine.world.getComponent<LifeFarmPlot>('plot', 'LifeFarmPlot')).toMatchObject({ soil: 'tilled' });

    engine.world.addComponent('plot', { type: 'LifeFarmPlot', sceneId: 'farm', x: 0, y: 0, soil: 'watered' } as LifeFarmPlot);
    advance(engine, source);
    expect(engine.world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')).toMatchObject({ totalDay: 3, seasonId: 'summer', dayOfSeason: 1 });
    expect(engine.world.getComponent<LifeCrop>('plot', 'LifeCrop')).toMatchObject({ daysGrown: 2, stage: 'mature' });
  });

  it('folds exact day intents and rejects a conflicting same-player navigation signal', () => {
    const engine = make();
    for (const [id, name] of [['a', 'life.advance-day'], ['b', 'life.advance-day']] as const) {
      engine.world.createEntity(id);
      engine.world.addComponent(id, { type: 'Signal', name, source: 'life:player' } as Signal);
    }
    engine.world.tick();
    expect(engine.world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')?.totalDay).toBe(2);

    engine.world.createEntity('conflict');
    engine.world.addComponent('conflict', { type: 'Signal', name: 'life.move.right', source: 'life:player' } as Signal);
    engine.world.createEntity('advance');
    engine.world.addComponent('advance', { type: 'Signal', name: 'life.advance-day', source: 'life:player' } as Signal);
    engine.world.tick();
    expect(engine.world.getComponent<LifeCalendarAdvanceResult>('life:calendar', 'LifeCalendarAdvanceResult')).toMatchObject({ status: 'rejected', reason: 'navigation-conflict', totalDay: 2 });
  });

  it('validates explicit calendar data while retaining the legacy default when omitted', () => {
    const invalid = pkg(); invalid.calendar.initialDayOfSeason = 3;
    expect(validateLifeGamePackage(invalid).issues.map((issue) => issue.path)).toContain('$.calendar.initialDayOfSeason');
    const duplicate = pkg(); duplicate.calendar.seasons[1].id = 'spring';
    expect(validateLifeGamePackage(duplicate).issues.map((issue) => issue.path)).toContain('$.calendar.seasons[1].id');
    expect(validateLifeGamePackage(threeSceneLifePackage()).ok).toBe(true);
  });

  it('advances authored slots, wraps the final slot into the next day, and advance-day resets the slot', () => {
    const raw = pkg(); raw.calendar.slots = ['morning', 'afternoon']; raw.calendar.initialSlot = 'morning';
    const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(raw).blueprint);
    const source = new QueuedInputSource('host');
    advanceTime(engine, source);
    expect(engine.world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')).toMatchObject({ totalDay: 1, slotId: 'afternoon' });
    expect(engine.world.getComponent<LifeTimeAdvanceResult>('life:calendar', 'LifeTimeAdvanceResult')).toMatchObject({ status: 'advanced', slotId: 'afternoon', wrappedDay: false });
    advanceTime(engine, source);
    expect(engine.world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')).toMatchObject({ totalDay: 2, dayOfSeason: 2, slotId: 'morning' });
    expect(engine.world.getComponent<LifeTimeAdvanceResult>('life:calendar', 'LifeTimeAdvanceResult')).toMatchObject({ status: 'advanced', slotId: 'morning', wrappedDay: true });
    advanceTime(engine, source);
    advance(engine, source);
    expect(engine.world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')).toMatchObject({ totalDay: 3, seasonId: 'summer', dayOfSeason: 1, slotId: 'morning' });
  });

  it('keeps the declared life pipeline in strict semantic order', () => {
    const ids = make().world.getSortedSystems().map((system) => system.id);
    const pipeline = ['keybind', 'life-input', 'life-calendar', 'life-navigation', 'life-activity', 'life-item-selection', 'life-action', 'life-farming', 'life-planting', 'life-crop-growth', 'life-harvest'];
    for (let index = 1; index < pipeline.length; index += 1) expect(ids.indexOf(pipeline[index - 1]!)).toBeLessThan(ids.indexOf(pipeline[index]!));
  });
});
