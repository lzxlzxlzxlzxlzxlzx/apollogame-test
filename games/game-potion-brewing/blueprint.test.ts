import { describe, expect, it } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { AngularGesture, DropZone, OrderedActionSession } from '@zerocraft/engine/engine/protocol/components.js';
import { buildPotionBlueprint } from './blueprint.js';
import { EMBER_ROUND, MOON_ROUND } from './fixtures.js';
import { applySignal, createWorld } from './acceptance-adapter.js';

describe('game-potion-brewing S3 blueprint', () => {
  it.each([MOON_ROUND, EMBER_ROUND])('真引擎装载并空跑两 tick：$recipe.recipeId', (round) => {
    const engine = new Engine();
    engine.load(buildPotionBlueprint(round));
    engine.world.tick();
    engine.world.tick();
    const session = engine.world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession');
    expect(session?.status).toBe('active');
    expect(session?.stepIndex).toBe(0);
    expect(session?.steps).toHaveLength(round.recipe.steps.length);
    expect(engine.world.getComponent<DropZone>('cauldron-mouth', 'DropZone')?.hitShape).toBe('ellipse');
    expect(engine.world.getComponent<AngularGesture>('rod', 'AngularGesture')?.sessionEntity).toBe('cauldron');
  });

  it('两份原型配方的方向、材料与错误干扰项只写在配方/蓝图数据中', () => {
    const moon = buildPotionBlueprint(MOON_ROUND);
    const ember = buildPotionBlueprint(EMBER_ROUND);
    const moonSession = moon.entities['cauldron']?.OrderedActionSession;
    const emberSession = ember.entities['cauldron']?.OrderedActionSession;
    expect(moonSession?.steps).toEqual([
      { expectedAction: 'brew.add.moon-herb', requiredCount: 1 },
      { expectedAction: 'brew.stir.clockwise', requiredCount: 2 },
      { expectedAction: 'brew.add.silver-leaf', requiredCount: 1 },
      { expectedAction: 'brew.stir.counterclockwise', requiredCount: 1 },
    ]);
    expect(moonSession?.acceptedActions).toContain('brew.add.red-berry');
    expect(emberSession?.steps).toEqual([
      { expectedAction: 'brew.add.red-berry', requiredCount: 1 },
      { expectedAction: 'brew.add.pepper-seed', requiredCount: 1 },
      { expectedAction: 'brew.stir.counterclockwise', requiredCount: 2 },
      { expectedAction: 'brew.add.dawn-petal', requiredCount: 1 },
      { expectedAction: 'brew.stir.clockwise', requiredCount: 1 },
    ]);
  });

  it('同一材料可重复使用；多投仍由有序步骤判错', () => {
    const world = createWorld(1, { fixture: 'repeat' });
    expect(world.engine.world.getComponent('ingredient:moon-herb', 'Resource')).toBeUndefined();
    applySignal(world, 'brew.add.moon-herb'); world.tick();
    applySignal(world, 'brew.add.moon-herb'); world.tick();
    world.tick(); world.tick();
    expect(world.engine.world.getAllEntities()).toContain('ingredient:moon-herb');
    expect(world.engine.world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')?.stepIndex).toBe(2);
    applySignal(world, 'brew.add.moon-herb'); world.tick();
    expect(world.engine.world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')?.status).toBe('failure');
  });

  it('错误材料只使会话失败，不销毁材料实体', () => {
    const world = createWorld(1, { fixture: 'moon' });
    applySignal(world, 'brew.add.red-berry'); world.tick();
    expect(world.engine.world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')?.status).toBe('failure');
    expect(world.engine.world.getAllEntities()).toContain('ingredient:moon-herb');
    expect(world.engine.world.getAllEntities()).toContain('ingredient:red-berry');
  });

});
