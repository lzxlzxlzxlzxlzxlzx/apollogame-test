import { describe, expect, it } from 'vitest';
import { compileLifeGamePackage } from '../assembly/life-package-compile.js';
import { threeSceneLifePackage } from '../assembly/life-package.fixture.js';
import { sha256Canonical } from './life-generation-bundle.js';
import {
  hashLifeHostDescriptor, parseLifeHostDescriptor, validateLifeHostDescriptor, validateLifeHostCalendarLabels,
  LIFE_HOST_CALENDAR_LABEL_MAX_ENTRIES, LIFE_HOST_CALENDAR_LABEL_MAX_LENGTH,
  type LifeHostCalendarLabels,
} from './life-host-descriptor.js';
import { littleValleyHostDescriptorFixture } from './life-host-descriptor.fixture.js';

const withLabels = (calendarLabels: unknown) => {
  const host = littleValleyHostDescriptorFixture();
  return { ...host, hud: { ...host.hud, calendarLabels } };
};
const codes = (calendarLabels: unknown) => validateLifeHostDescriptor(withLabels(calendarLabels)).diagnostics.map((issue) => `${issue.path}:${issue.code}`);

describe('Life Host render-only calendar labels', () => {
  it('preserves exact legacy bytes and hash without inserting labels or defaults', () => {
    const host = littleValleyHostDescriptorFixture();
    const bytes = JSON.stringify(host);
    expect(JSON.stringify(parseLifeHostDescriptor(host))).toBe(bytes);
    expect(hashLifeHostDescriptor(host)).toBe(sha256Canonical(host));
    expect(Object.hasOwn(parseLifeHostDescriptor(host).hud, 'calendarLabels')).toBe(false);
    expect(validateLifeHostCalendarLabels(host, undefined)).toEqual({ ok: true, diagnostics: [] });
  });

  it('accepts sparse safe names for multiple independent calendars with cloned pure data', () => {
    const labels: LifeHostCalendarLabels = { seasons: { eclipse: '月相季', 'season:harvest.2': '收获季' }, slots: { dawn: '黎明', night: '夜晚' } };
    const parsed = parseLifeHostDescriptor(withLabels(labels));
    expect(parsed.hud.calendarLabels).toEqual(labels);
    expect(parsed.hud.calendarLabels).not.toBe(labels);
    const calendar = { seasons: [{ id: 'eclipse' }, { id: 'season:harvest.2' }], slots: ['dawn', 'night', 'noon'] };
    const before = JSON.stringify({ parsed, calendar });
    expect(validateLifeHostCalendarLabels(parsed, calendar)).toEqual({ ok: true, diagnostics: [] });
    expect(JSON.stringify({ parsed, calendar })).toBe(before);
    const other = parseLifeHostDescriptor(withLabels({ seasons: { winter: '冬季' } }));
    expect(validateLifeHostCalendarLabels(other, { seasons: [{ id: 'winter' }] }).ok).toBe(true);
    for (const empty of [{}, { seasons: {}, slots: {} }]) {
      expect(validateLifeHostCalendarLabels(parseLifeHostDescriptor(withLabels(empty)), undefined).ok).toBe(true);
    }
  });

  it('hashes configured names canonically but keeps the package compiler output identical', () => {
    const a = withLabels({ seasons: { eclipse: '月相季' }, slots: { night: '夜晚', dawn: '黎明' } });
    const b = withLabels({ slots: { dawn: '黎明', night: '夜晚' }, seasons: { eclipse: '月相季' } });
    expect(hashLifeHostDescriptor(a)).toBe(hashLifeHostDescriptor(b));
    expect(hashLifeHostDescriptor(a)).not.toBe(hashLifeHostDescriptor(withLabels({ seasons: { eclipse: '另一季' } })));
    const pkg = threeSceneLifePackage();
    const before = sha256Canonical(compileLifeGamePackage(pkg));
    parseLifeHostDescriptor(a);
    expect(sha256Canonical(compileLifeGamePackage(pkg))).toBe(before);
  });

  it('matches compiler spring default and absence of slotId for missing calendar or slots', () => {
    const pkg = threeSceneLifePackage();
    expect(pkg.calendar).toBeUndefined();
    const manifest = compileLifeGamePackage(pkg);
    expect(manifest.entities['life:calendar-config']!.LifeCalendarConfig).toEqual({ seasons: [{ id: 'spring', lengthDays: 28 }] });
    expect(manifest.entities['life:calendar']!.LifeCalendar).toEqual({ totalDay: 1, seasonId: 'spring', dayOfSeason: 1 });
    const defaults = parseLifeHostDescriptor(withLabels({ seasons: { spring: '春季' } }));
    expect(validateLifeHostCalendarLabels(defaults, undefined).ok).toBe(true);
    const noSlots = parseLifeHostDescriptor(withLabels({ seasons: { eclipse: '月相季' } }));
    expect(validateLifeHostCalendarLabels(noSlots, { seasons: [{ id: 'eclipse' }] }).ok).toBe(true);
    const inventedDay = parseLifeHostDescriptor(withLabels({ slots: { day: '白昼' } }));
    for (const calendar of [undefined, { seasons: [{ id: 'eclipse' }] }]) {
      expect(validateLifeHostCalendarLabels(inventedDay, calendar).diagnostics).toContainEqual(expect.objectContaining({ path: '/hud/calendarLabels/slots/day', code: 'calendar_reference' }));
    }
  });

  it('rejects dangling season/slot names, including unknown names against implicit defaults', () => {
    const host = parseLifeHostDescriptor(withLabels({ seasons: { eclipse: '月相季' }, slots: { dawn: '黎明' } }));
    expect(validateLifeHostCalendarLabels(host, undefined).diagnostics.map((issue) => `${issue.path}:${issue.code}`)).toEqual([
      '/hud/calendarLabels/seasons/eclipse:calendar_reference', '/hud/calendarLabels/slots/dawn:calendar_reference',
    ]);
    expect(validateLifeHostCalendarLabels(host, { seasons: [{ id: 'eclipse' }], slots: ['day', 'night'] }).diagnostics).toEqual([
      { path: '/hud/calendarLabels/slots/dawn', code: 'calendar_reference', message: 'must name an existing calendar slot id' },
    ]);
  });

  it.each([null, [], 'label', 5, Object.create({ seasons: {} }), Object.create(null)])('rejects non-plain calendar label object %s', (labels) => {
    expect(codes(labels)).toContain('/hud/calendarLabels:type');
  });
  it.each(['seasons', 'slots'])('rejects non-plain %s maps', (kind) => {
    for (const map of [null, [], 'labels', 5, Object.create({ dawn: '黎明' }), Object.create(null)]) {
      expect(codes({ [kind]: map })).toContain(`/hud/calendarLabels/${kind}:type`);
    }
  });
  it('rejects unknown labels fields instead of accepting translations as free code', () => {
    expect(codes({ formatter: 'return clock', seasons: {} })).toContain('/hud/calendarLabels/formatter:unknown_field');
    expect(codes({ seasons: { eclipse: { text: '月相季' } } })).toContain('/hud/calendarLabels/seasons/eclipse:text');
  });
  it.each(['', ' ', ' dawn', 'dawn ', '../dawn', 'dawn/night', 'dawn\\night', '__proto__', 'constructor', 'prototype', 'day\nnight', 'day\u202enight', '<day>', 'x'.repeat(129)])('rejects unsafe map id %j with escaped pointer', (id) => {
    const labels = JSON.parse(JSON.stringify({ seasons: { [id]: '显示名' } }));
    expect(validateLifeHostDescriptor(withLabels(labels)).diagnostics).toContainEqual(expect.objectContaining({ code: 'calendar_id', path: `/hud/calendarLabels/seasons/${id.replace(/~/g, '~0').replace(/\//g, '~1')}` }));
  });
  it.each(['', ' ', null, 1, false, {}, []])('rejects empty or non-text displayed name %j', (name) => {
    expect(codes({ slots: { dawn: name } })).toContain('/hud/calendarLabels/slots/dawn:text');
  });
  it.each(['黎\n明', '黎\r明', '黎\t明', '黎\u0000明', '黎\u007f明', '黎\u0085明', '黎\u200b明', '黎\u2028明', '黎\u202e明', '黎\u2066明', '<script>黎明</script>'])('rejects control/invisible/markup name %j', (name) => {
    expect(codes({ slots: { dawn: name } })).toContain('/hud/calendarLabels/slots/dawn:plain_text');
  });
  it('bounds map entries and display name length without truncating accepted content', () => {
    const max = '字'.repeat(LIFE_HOST_CALENDAR_LABEL_MAX_LENGTH);
    expect(parseLifeHostDescriptor(withLabels({ slots: { dawn: max } })).hud.calendarLabels?.slots?.dawn).toBe(max);
    expect(codes({ slots: { dawn: `${max}字` } })).toContain('/hud/calendarLabels/slots/dawn:text_limit');
    const entries = Object.fromEntries(Array.from({ length: LIFE_HOST_CALENDAR_LABEL_MAX_ENTRIES }, (_, i) => [`slot:${i}`, '名']));
    expect(codes({ slots: entries })).toEqual([]);
    expect(codes({ slots: { ...entries, extra: '名' } })).toContain('/hud/calendarLabels/slots:entry_limit');
  });
});
