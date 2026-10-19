import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import type { IWorld } from '@engine/core/types.js';
import type { LifeActor, LifeCalendar, LifeCalendarAdvanceResult, LifeCalendarConfig, LifeCrop, LifeCropCatalog, LifeFarmPlot, LifeTimeAdvanceResult, Signal } from '@engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

const ADVANCE_DAY = 'life.advance-day';
const ADVANCE_TIME = 'life.advance-time';
const CALENDAR_REASONS = ['not-player', 'navigation-conflict', 'action-conflict', 'missing-calendar-config'] as const;

function trace(world: IWorld, system: string, kind: 'decision' | 'commit' | 'reject', what: string, why?: string): void {
  const debugTrace = findDebugTrace(world);
  if (debugTrace) appendTrace(debugTrace, debugTrace.tick ?? world.getVersion(), system, kind, what, why);
}

export const lifeCalendarCapability = defineCapability({
  id: 't2-life-calendar',
  version: '1.0.0',
  describe: {
    name: 'life calendar',
    summary: 'Advances the simulation date only from semantic player input.',
    semantic: ['tier2', 'life-sim'],
    whenToUse: 'Bind life.advance-day for an explicit player decision.',
    examples: ['life.advance-day → LifeCalendarAdvanceResult'],
  },
  components: {
    provides: {
      LifeCalendarAdvanceResult: defineComponent('LifeCalendarAdvanceResult', {
        status: t.enum(['advanced', 'rejected'] as const),
        reason: t.opt(t.enum(CALENDAR_REASONS)),
        totalDay: t.num(), seasonId: t.str(), dayOfSeason: t.num(),
      }, { category: 'event', describe: 'One-tick outcome of an explicit calendar advance.' }),
      LifeTimeAdvanceResult: defineComponent('LifeTimeAdvanceResult', {
        status:t.enum(['advanced','rejected'] as const), reason:t.opt(t.enum(CALENDAR_REASONS)), slotId:t.str(), wrappedDay:t.bool(),
      }, { category:'event', describe:'One-tick outcome of an explicit intra-day slot advance.' }),
    },
    reads: ['Signal', 'LifeActor', 'LifeCalendar', 'LifeCalendarConfig'],
    writes: ['LifeCalendar', 'LifeCalendarAdvanceResult', 'LifeTimeAdvanceResult'],
    consumes: [],
  },
  config: {},
  systems: [{
    id: 'life-calendar',
    // Calendar input is resolved before spatial projections so a slot boundary is visible in the same tick.
    // Action/navigation conflicts are rejected from the shared Signal set before either branch commits.
    runsAfter: ['life-input'],
    runsBefore: ['life-navigation'],
    reads: ['Signal', 'LifeActor', 'LifeCalendar', 'LifeCalendarConfig'],
    writes: ['LifeCalendar', 'LifeCalendarAdvanceResult', 'LifeTimeAdvanceResult'],
    consumes: [],
    execute(world: IWorld) {
      const calendarId = world.singleton('LifeCalendar');
      if (calendarId === undefined) return;
      world.removeComponent(calendarId, 'LifeCalendarAdvanceResult');
      world.removeComponent(calendarId, 'LifeTimeAdvanceResult');
      const calendar = world.getComponent<LifeCalendar>(calendarId, 'LifeCalendar');
      const configId = world.singleton('LifeCalendarConfig');
      const config = configId === undefined ? undefined : world.getComponent<LifeCalendarConfig>(configId, 'LifeCalendarConfig');
      if (!calendar) return;

      const intents = sortedIds(world, 'Signal')
        .map((id) => world.getComponent<Signal>(id, 'Signal'))
        .filter((signal): signal is Signal => signal?.name === ADVANCE_DAY || signal?.name === ADVANCE_TIME);
      if (intents.length === 0) return;

      const reject = (reason: typeof CALENDAR_REASONS[number]): void => {
        if (intents.some((intent) => intent.name === ADVANCE_DAY)) world.addComponent(calendarId, { type: 'LifeCalendarAdvanceResult', status: 'rejected', reason, totalDay: calendar.totalDay, seasonId: calendar.seasonId, dayOfSeason: calendar.dayOfSeason } as LifeCalendarAdvanceResult);
        if (intents.some((intent) => intent.name === ADVANCE_TIME)) world.addComponent(calendarId, { type:'LifeTimeAdvanceResult', status:'rejected', reason, slotId:calendar.slotId ?? config?.initialSlot ?? 'day', wrappedDay:false } as LifeTimeAdvanceResult);
        trace(world, 'life-calendar', 'reject', 'calendar advance rejected', reason);
      };
      const sources = [...new Set(intents.map((intent) => intent.source))];
      if (sources.length !== 1 || world.getComponent<LifeActor>(sources[0]!, 'LifeActor')?.kind !== 'player') {
        reject('not-player');
        return;
      }
      const source = sources[0]!;
      const signals = sortedIds(world, 'Signal').map((id) => world.getComponent<Signal>(id, 'Signal')).filter((signal): signal is Signal => !!signal);
      if (signals.some((signal) => signal.source === source && (signal.name.startsWith('life.move.') || signal.name === 'life.warp'))) {
        reject('navigation-conflict');
        return;
      }
      if (signals.some((signal) => signal.source === source && signal.name === 'life.action')) {
        reject('action-conflict');
        return;
      }
      if (intents.some((intent) => intent.name === ADVANCE_DAY) && intents.some((intent) => intent.name === ADVANCE_TIME)) {
        reject('action-conflict');
        return;
      }
      if (!config || config.seasons.length === 0) {
        reject('missing-calendar-config');
        return;
      }
      const currentIndex = config.seasons.findIndex((season) => season.id === calendar.seasonId);
      if (currentIndex < 0) {
        reject('missing-calendar-config');
        return;
      }
      const advanceDate = (): Pick<LifeCalendar,'totalDay'|'seasonId'|'dayOfSeason'> => {
        let season = config.seasons[currentIndex]!; let dayOfSeason = calendar.dayOfSeason + 1;
        if (dayOfSeason > season.lengthDays) { season = config.seasons[(currentIndex + 1) % config.seasons.length]!; dayOfSeason = 1; }
        return { totalDay:calendar.totalDay+1, seasonId:season.id, dayOfSeason };
      };
      const isTime = intents[0]!.name === ADVANCE_TIME;
      if (!isTime) {
        const next = advanceDate(); const slotId = config.initialSlot;
        trace(world, 'life-calendar', 'decision', `advance-day from ${calendar.seasonId}:${calendar.dayOfSeason}`);
        world.addComponent(calendarId, { type:'LifeCalendar', ...next, ...(slotId === undefined ? {} : { slotId }) } as LifeCalendar);
        world.addComponent(calendarId, { type:'LifeCalendarAdvanceResult', status:'advanced', ...next } as LifeCalendarAdvanceResult);
        trace(world, 'life-calendar', 'commit', `calendar ${next.seasonId}:${next.dayOfSeason}`, `total-day=${next.totalDay}${slotId ? ` slot=${slotId}` : ''}`);
        return;
      }
      const slots = config.slots;
      if (!slots || slots.length < 2 || !config.initialSlot) { reject('missing-calendar-config'); return; }
      const currentSlot = calendar.slotId ?? config.initialSlot; const slotIndex = slots.indexOf(currentSlot);
      if (slotIndex < 0) { reject('missing-calendar-config'); return; }
      const wrappedDay = slotIndex === slots.length - 1; const slotId = wrappedDay ? config.initialSlot : slots[slotIndex + 1]!;
      const nextDate = wrappedDay ? advanceDate() : { totalDay:calendar.totalDay, seasonId:calendar.seasonId, dayOfSeason:calendar.dayOfSeason };
      trace(world, 'life-calendar', 'decision', `advance-time from ${currentSlot}`, `next=${slotId}`);
      world.addComponent(calendarId, { type:'LifeCalendar', ...nextDate, slotId } as LifeCalendar);
      world.addComponent(calendarId, { type:'LifeTimeAdvanceResult', status:'advanced', slotId, wrappedDay } as LifeTimeAdvanceResult);
      if (wrappedDay) world.addComponent(calendarId, { type:'LifeCalendarAdvanceResult', status:'advanced', ...nextDate } as LifeCalendarAdvanceResult);
      trace(world, 'life-calendar', 'commit', `calendar slot=${slotId}`, wrappedDay ? `wrapped total-day=${nextDate.totalDay}` : 'same-day');
    },
  }],
});

export const lifeCropGrowthCapability = defineCapability({
  id: 't2-life-crop-growth',
  version: '1.0.0',
  describe: {
    name: 'life crop growth',
    summary: 'Grows watered sparse crops after a successful explicit day advance.',
    semantic: ['tier2', 'life-sim', 'farming'],
    whenToUse: 'After t2-life-calendar with LifeCropCatalog configured.',
    examples: ['watered turnip + advanced day → growing turnip + tilled plot'],
  },
  components: {
    provides: {},
    reads: ['LifeCalendar', 'LifeCalendarAdvanceResult', 'LifeFarmPlot', 'LifeCrop', 'LifeCropCatalog'],
    writes: ['LifeFarmPlot', 'LifeCrop'],
    consumes: [],
  },
  config: {},
  systems: [{
    id: 'life-crop-growth',
    // Crop writes the same sparse plot as farming, so its semantic order must not be inferred.
    runsAfter: ['life-calendar', 'life-planting', 'life-farming'],
    reads: ['LifeCalendar', 'LifeCalendarAdvanceResult', 'LifeFarmPlot', 'LifeCrop', 'LifeCropCatalog'],
    writes: ['LifeFarmPlot', 'LifeCrop'],
    consumes: [],
    execute(world: IWorld) {
      const calendarId = world.singleton('LifeCalendar');
      const result = calendarId === undefined ? undefined : world.getComponent<LifeCalendarAdvanceResult>(calendarId, 'LifeCalendarAdvanceResult');
      if (result?.status !== 'advanced') return;
      const catalogId = world.singleton('LifeCropCatalog');
      const catalog = catalogId === undefined ? undefined : world.getComponent<LifeCropCatalog>(catalogId, 'LifeCropCatalog');
      if (!catalog) {
        trace(world, 'life-crop-growth', 'reject', 'crop growth skipped', 'missing-crop-catalog');
        return;
      }
      let watered = 0;
      let grown = 0;
      for (const plotId of sortedIds(world, 'LifeFarmPlot')) {
        const plot = world.getComponent<LifeFarmPlot>(plotId, 'LifeFarmPlot');
        if (!plot || plot.soil !== 'watered') continue;
        watered += 1;
        const crop = world.getComponent<LifeCrop>(plotId, 'LifeCrop');
        const spec = crop ? catalog.crops.find((candidate) => candidate.id === crop.cropId) : undefined;
        if (crop && spec && crop.stage !== 'mature') {
          const daysGrown = Math.min(spec.growthDays, crop.daysGrown + 1);
          world.addComponent(plotId, { ...crop, daysGrown, stage: daysGrown >= spec.growthDays ? 'mature' : 'growing' } as LifeCrop);
          grown += 1;
        }
        world.addComponent(plotId, { ...plot, soil: 'tilled' } as LifeFarmPlot);
      }
      if (watered > 0) trace(world, 'life-crop-growth', 'commit', `processed ${watered} watered plots`, `grew=${grown}`);
    },
  }],
});
