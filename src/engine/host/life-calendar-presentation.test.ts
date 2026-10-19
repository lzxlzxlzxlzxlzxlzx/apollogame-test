import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from '../../assembly/life-package-compile.js';
import { threeSceneLifePackage } from '../../assembly/life-package.fixture.js';
import { Engine } from '../../runtime/engine.js';
import type { LifeCalendar } from '../protocol/components.js';
import { selectLifeHostView } from '../../assembly/life-host/life-presenter.js';
import { lifeHostPersistentHash } from '../../assembly/life-host/life-save.js';

const setup = () => {
  const engine = new Engine();
  engine.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint);
  engine.world.tick();
  return engine.world;
};

describe('Life render-only calendar display labels', () => {
  it('keeps omitted configuration exactly compatible', () => {
    const world = setup();
    const cal = world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')!;
    const before = world.snapshot();
    expect(selectLifeHostView(world)).toEqual(selectLifeHostView(world, {}, {}, undefined));
    expect(selectLifeHostView(world).date).toContain(` ${cal.dayOfSeason}日（第${cal.totalDay}天）`);
    expect(world.snapshot()).toEqual(before);
  });

  it('maps arbitrary season and slot IDs without creating a second date or mutating World/save/hash', () => {
    const world = setup();
    const cal = world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')!;
    cal.slotId = 'blue-shift';
    const labels = { seasons: { [cal.seasonId]: '风铃季' }, slots: { [cal.slotId!]: '晨风' } };
    const before = world.snapshot();
    const hash = lifeHostPersistentHash(world);
    const projected = selectLifeHostView(world, {}, {}, labels);
    expect(projected.date).toBe(`风铃季·第${cal.dayOfSeason}天`);
    expect(projected.slot).toBe('晨风');
    expect(world.snapshot()).toEqual(before);
    expect(lifeHostPersistentHash(world)).toBe(hash);
    expect(labels).toEqual({ seasons: { [cal.seasonId]: '风铃季' }, slots: { [cal.slotId!]: '晨风' } });
  });

  it('reads changed authoritative IDs/days rather than freezing the prototype demo values', () => {
    const world = setup();
    const cal = world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')!;
    const labels = { seasons: { other: '星火季' }, slots: { evening: '薄暮' } };
    cal.seasonId = 'other'; cal.dayOfSeason = 9; cal.slotId = 'evening'; cal.totalDay = 37;
    const before = world.snapshot();
    expect(selectLifeHostView(world, {}, {}, labels)).toMatchObject({ date: '星火季·第9天', slot: '薄暮' });
    expect(world.snapshot()).toEqual(before);
  });

  it('uses honest ID fallback for an unmapped live value', () => {
    const world = setup();
    const cal = world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')!;
    cal.seasonId = 'blue-moon'; cal.slotId = 'late-evening';
    const projected = selectLifeHostView(world, {}, {}, { seasons: {}, slots: {} });
    expect(projected.date).toBe(`Blue Moon·第${cal.dayOfSeason}天`);
    expect(projected.slot).toBe('Late Evening');
  });

  it('does not interpret inherited object keys as display labels or invent a missing legacy slot', () => {
    const world = setup();
    const cal = world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar')!;
    cal.seasonId = 'constructor'; cal.slotId = '__proto__';
    expect(selectLifeHostView(world, {}, {}, { seasons: {}, slots: {} })).toMatchObject({ date: `Constructor·第${cal.dayOfSeason}天`, slot: 'Proto' });
    delete cal.slotId;
    expect(selectLifeHostView(world, {}, {}, { slots: { day: '白昼' } }).slot).toBe('—');
  });
});
