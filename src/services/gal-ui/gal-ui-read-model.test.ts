import { describe, expect, it } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { NarrativeProjection } from '@skills/tier3/narrative-director.js';
import { createGalProfile, markRead, unlock } from '../gal-profile/gal-profile.js';
import type { GalManualSlot } from '../gal-save/gal-manual-save.js';
import { resolveBindings } from '@ui/components/bindings.js';
import type { ButtonProps, LayoutNode } from '@ui/components/types.js';
import { buildGalUiReadModel, galUiDataSource } from './gal-ui-read-model.js';

const L = (zh: string, en: string) => ({ 'zh-CN': zh, en });
function pkg(id = 'gal-a'): GalPackage {
  return {
    schemaVersion: 1, id, title: L('月影书简', 'Moon Letters'), defaultLocale: 'zh-CN', locales: ['zh-CN', 'en'],
    entry: { chapterId: 'a', nodeId: 'intro' }, ui: { template: 'gal-template' },
    preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only', bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
    characters: { m: { id: 'm', name: L('澪', 'Mio'), portraits: { neutral: 'portrait', expressions: {}, fallback: 'neutral' } } },
    scenes: {}, media: { backgrounds: {}, cg: {}, audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
    endings: { good: { title: L('好', 'Good') } }, gallery: { memories: {}, music: {} },
    chapters: { a: { id: 'a', title: L('第一章', 'Chapter One'), start: 'intro', nodes: {
      intro: { kind: 'line', speaker: 'm', text: L('欢迎', 'Welcome'), next: { chapterId: 'a', nodeId: 'pick' } },
      pick: { kind: 'choice', prompt: L('请选择', 'Choose'), options: [
        { id: 'accept', text: L('接过书', 'Take the book'), next: { chapterId: 'a', nodeId: 'good' } },
        { id: 'ask', text: L('询问', 'Ask'), next: { chapterId: 'a', nodeId: 'good' } },
      ] },
      good: { kind: 'ending', ending: 'good', text: L('终章', 'Ending') },
    } } },
  };
}
function choiceProjection(packageId = 'gal-a'): NarrativeProjection {
  return {
    type: 'NarrativeProjection', packageId, chapterId: 'a', nodeId: 'pick', kind: 'choice',
    cast: {}, sfxIds: [], sfxAssetKeys: [], text: L('请选择', 'Choose'),
    options: [
      { id: 'accept', text: L('接过书', 'Take the book'), available: true },
      { id: 'ask', text: L('询问', 'Ask'), available: false },
    ],
  };
}
function slot(number: number, packageId = 'gal-a', label?: string): GalManualSlot {
  return { number, meta: {
    slot: `zerocraft.gal-manual.v1.${packageId}.${number}`,
    tick: number, hash: '0123abcd', timestamp: 1000 + number, ...(label === undefined ? {} : { label }),
  } };
}

describe('GAL-UI-01B read-only view model', () => {
  it('projects only explicit narrative background and visible portrait asset keys', () => {
    const p = pkg();
    const projection: NarrativeProjection = { ...choiceProjection(), backgroundAssetKey: 'demo/bg',
      cast: { hidden: { visible: false, assetKey: 'private/hidden' },
        mio: { visible: true, assetKey: 'demo/portrait' } } };
    const view = buildGalUiReadModel({ pkg: p, projection, profile: createGalProfile(p), locale: 'zh-CN',
      manualSlots: [], page: 1, hasActiveResume: false });
    expect(view.story).toMatchObject({ backgroundAssetKey: 'demo/bg', portraitAssetKey: 'demo/portrait' });
    expect(JSON.stringify(view)).not.toContain('private/hidden');
  });
  it('projects localized stable choices, read status and a 4×3 page without changing inputs', () => {
    const p = pkg(); const projection = choiceProjection();
    const profile = markRead(createGalProfile(p), p, { chapterId: 'a', nodeId: 'pick' });
    const manualSlots = [slot(13, 'gal-a', '第十三格'), slot(1), slot(12)];
    const before = JSON.stringify([p, projection, profile, manualSlots]);
    const input = { pkg: p, projection, profile, locale: 'en', manualSlots, page: 1, hasActiveResume: false };
    const first = buildGalUiReadModel(input);
    expect(JSON.stringify(buildGalUiReadModel(input))).toBe(JSON.stringify(first));
    expect(first.story).toMatchObject({ refKey: '["a","pick"]', chapterTitle: 'Chapter One', text: 'Choose', read: true });
    expect(first.story.choices).toEqual([
      { id: 'accept', label: 'Take the book', disabled: false },
      { id: 'ask', label: 'Ask', disabled: true },
    ]);
    expect(first.home).toEqual({ canStart: true, canContinue: true, canLoad: true });
    expect(first.manual).toMatchObject({ page: 1, pageCount: 2, columns: 4, rows: 3, slotsPerPage: 12 });
    expect(first.manual.slots).toHaveLength(12);
    expect(first.manual.slots[0]).toEqual({ number: 1, filled: true, canLoad: true, label: null, tick: 1, timestamp: 1001, preview: 'no-preview' });
    expect(first.manual.slots[1]).toEqual({ number: 2, filled: false, canLoad: false, label: null, tick: null, timestamp: null, preview: 'empty' });
    expect(first.manual.slots[11]?.number).toBe(12);
    expect(buildGalUiReadModel({ ...input, page: 2 }).manual.slots[0]).toEqual({
      number: 13, filled: true, canLoad: true, label: '第十三格', tick: 13, timestamp: 1013, preview: 'no-preview',
    });
    expect(JSON.stringify([p, projection, profile, manualSlots])).toBe(before);
  });

  it('uses the existing repeat binding to preserve stable choice ids, booleans and unique node ids', () => {
    const p = pkg(); const profile = createGalProfile(p);
    const model = buildGalUiReadModel({ pkg: p, projection: choiceProjection(), profile, locale: 'zh-CN', manualSlots: [], page: 1, hasActiveResume: false });
    const tree: LayoutNode = { type: 'Panel', id: 'choices', props: { bare: true }, repeat: {
      source: 'gal.options', key: 'id', template: { type: 'Button', id: 'choice', props: {
        label: '{{item.label}}', action: 'narrative.choose', actionArg: '{{item.id}}', disabled: '{{item.disabled}}',
      } as unknown as ButtonProps },
    } };
    const expanded = resolveBindings(tree, galUiDataSource(model));
    const buttons = expanded.children ?? [];
    expect(buttons.map(button => button.id)).toEqual(['choice#accept', 'choice#ask']);
    expect(buttons.map(button => button.props as ButtonProps)).toEqual([
      { label: '接过书', action: 'narrative.choose', actionArg: 'accept', disabled: false },
      { label: '询问', action: 'narrative.choose', actionArg: 'ask', disabled: true },
    ]);
    expect(expanded.repeat).toBeUndefined();
    expect(galUiDataSource(model).list?.('gal.slots')).toHaveLength(12);
  });

  it('extends beyond the 24-cell demo and keeps same-number slots isolated by package', () => {
    const a = pkg(); const b = pkg('gal-b');
    const modelA = buildGalUiReadModel({
      pkg: a, projection: choiceProjection(), profile: createGalProfile(a), locale: 'zh-CN',
      manualSlots: [slot(1), slot(25, 'gal-a', '后续页')], page: 3, hasActiveResume: false,
    });
    expect(modelA.manual.pageCount).toBe(3);
    expect(modelA.manual.slots[0]).toMatchObject({ number: 25, filled: true, label: '后续页', preview: 'no-preview' });
    expect(modelA.manual.slots[11]?.number).toBe(36);
    const modelB = buildGalUiReadModel({
      pkg: b, projection: choiceProjection('gal-b'), profile: createGalProfile(b), locale: 'zh-CN',
      manualSlots: [slot(1, 'gal-b', '乙包存档')], page: 1, hasActiveResume: false,
    });
    expect(modelB.manual.slots[0]?.label).toBe('乙包存档');
    expect(() => buildGalUiReadModel({
      pkg: b, projection: choiceProjection('gal-b'), profile: createGalProfile(b), locale: 'zh-CN',
      manualSlots: [slot(1)], page: 1, hasActiveResume: false,
    })).toThrow(/slot/);
  });

  it('reflects rollback/re-choice from the new authoritative projection while global read remains unchanged', () => {
    const p = pkg(); const profile = markRead(createGalProfile(p), p, { chapterId: 'a', nodeId: 'intro' });
    const base = { pkg: p, profile, locale: 'zh-CN', manualSlots: [], page: 1, hasActiveResume: false };
    const pick = buildGalUiReadModel({ ...base, projection: choiceProjection() });
    expect(pick.story.read).toBe(false);
    expect(pick.story.choices[0]?.id).toBe('accept');
    const revised = choiceProjection(); revised.options![0]!.available = false; revised.options![1]!.available = true;
    const after = buildGalUiReadModel({ ...base, projection: revised });
    expect(after.story.choices).toEqual([
      { id: 'accept', label: '接过书', disabled: true }, { id: 'ask', label: '询问', disabled: false },
    ]);
    expect(after.story.read).toBe(false);
    expect(profile.readNodeIds).toEqual(['["a","intro"]']);
  });

  it('fails closed on wrong package, locale, duplicated/damaged ids and foreign/corrupt slots', () => {
    const p = pkg(); const projection = choiceProjection(); const profile = createGalProfile(p);
    const base = { pkg: p, projection, profile, locale: 'zh-CN', manualSlots: [] as GalManualSlot[], page: 1, hasActiveResume: false };
    expect(() => buildGalUiReadModel({ ...base, hasActiveResume: undefined as never })).toThrow(/hasActiveResume/);
    expect(() => buildGalUiReadModel({ ...base, locale: 'fr' })).toThrow(/locale/);
    expect(() => buildGalUiReadModel({ ...base, projection: choiceProjection('gal-b') })).toThrow(/package/);
    expect(() => buildGalUiReadModel({ ...base, profile: createGalProfile(pkg('gal-b')) })).toThrow(/package/);
    const duplicate = choiceProjection(); duplicate.options![1]!.id = 'accept';
    expect(() => buildGalUiReadModel({ ...base, projection: duplicate })).toThrow(/choice/);
    const missing = choiceProjection(); missing.options![0] = { ...missing.options![0]!, text: { en: 'Take the book' } };
    expect(() => buildGalUiReadModel({ ...base, projection: missing })).toThrow(/locale/);
    expect(() => buildGalUiReadModel({ ...base, manualSlots: [slot(1, 'gal-b')] })).toThrow(/slot/);
    expect(() => buildGalUiReadModel({ ...base, manualSlots: [slot(1), slot(1)] })).toThrow(/slot/);
    expect(() => buildGalUiReadModel({ ...base, manualSlots: [{ ...slot(1), meta: { ...slot(1).meta, hash: '' } }] })).toThrow(/slot/);
    expect(() => buildGalUiReadModel({ ...base, manualSlots: [{ ...slot(1), meta: { ...slot(1).meta, extra: 'bad' } as never }] })).toThrow(/slot/);
    expect(() => buildGalUiReadModel({ ...base, page: 3 })).toThrow(/page/);
  });

  it('enables Continue only for an active resume point or an actual save, never for read history alone', () => {
    const p = pkg();
    const projection: NarrativeProjection = {
      type: 'NarrativeProjection', packageId: p.id, chapterId: 'a', nodeId: 'intro', kind: 'line',
      cast: {}, sfxIds: [], sfxAssetKeys: [], text: L('欢迎', 'Welcome'), speakerName: L('澪', 'Mio'),
    };
    const base = { pkg: p, projection, profile: createGalProfile(p), locale: 'zh-CN', manualSlots: [] as GalManualSlot[], page: 1 };
    expect(buildGalUiReadModel({ ...base, hasActiveResume: false }).home).toEqual({ canStart: true, canContinue: false, canLoad: false });
    expect(buildGalUiReadModel({ ...base, hasActiveResume: true }).home).toEqual({ canStart: true, canContinue: true, canLoad: false });
    expect(buildGalUiReadModel({ ...base, hasActiveResume: false, manualSlots: [slot(1)] }).home).toEqual({ canStart: true, canContinue: true, canLoad: true });
    const readOnly = { ...base, profile: markRead(base.profile, p, { chapterId: 'a', nodeId: 'intro' }) };
    expect(buildGalUiReadModel({ ...readOnly, hasActiveResume: false }).home.canContinue).toBe(false);
  });
});

describe('GAL-UI-03B read-only history and gallery projection', () => {
  it('shows only the current bounded history branch, reports an empty window and rejects invalid cursors', () => {
    const p = pkg();
    const base = { pkg: p, projection: choiceProjection(), profile: createGalProfile(p),
      locale: 'zh-CN', manualSlots: [] as GalManualSlot[], page: 1, hasActiveResume: true };
    expect(buildGalUiReadModel(base).history).toEqual({ cursor: -1, windowSize: 0, rows: [] });
    const history = { cursor: 1, entries: [
      { ref: { chapterId: 'a', nodeId: 'intro' }, kind: 'line' as const, speakerId: 'm', text: L('欢迎', 'Welcome') },
      { ref: { chapterId: 'a', nodeId: 'pick' }, kind: 'choice' as const, text: L('请选择', 'Choose') },
      { ref: { chapterId: 'a', nodeId: 'good' }, kind: 'ending' as const, text: L('旧未来', 'Old future') },
    ] };
    const before = JSON.stringify(history);
    const view = buildGalUiReadModel({ ...base, history });
    expect(view.history).toMatchObject({ cursor: 1, windowSize: 3 });
    expect(view.history.rows.map(row => row.text)).toEqual(['欢迎', '请选择']);
    expect(view.history.rows[0]?.speaker).toBe('澪');
    expect(JSON.stringify(history)).toBe(before);
    expect(() => buildGalUiReadModel({ ...base, history: { ...history, cursor: 3 } })).toThrow(/history/);
    expect(() => buildGalUiReadModel({ ...base, history: { cursor: 0, entries: Array.from({ length: 513 }, () => history.entries[0]!) } })).toThrow(/history/);
  });

  it('sorts catalog IDs and reveals an image key only for an unlocked same-package CG', () => {
    const a = pkg();
    const p: GalPackage = { ...a, media: { ...a.media, cg: {
      z: { image: 'secret/z', title: L('最后', 'Last'), unlock: { kind: 'explicit' } },
      a: { image: 'secret/a', title: L('第一', 'First'), unlock: { kind: 'explicit' } },
    } } };
    const base = { pkg: p, projection: choiceProjection(), locale: 'en',
      manualSlots: [] as GalManualSlot[], page: 1, hasActiveResume: false };
    const locked = buildGalUiReadModel({ ...base, profile: createGalProfile(p) });
    expect(locked.gallery.cg.map(card => card.id)).toEqual(['a', 'z']);
    expect(locked.gallery.cg.every(card => card.title === '未解锁' && !card.unlocked)).toBe(true);
    expect(JSON.stringify(locked)).not.toContain('secret/');
    const unlocked = buildGalUiReadModel({ ...base, profile: unlock(createGalProfile(p), p, 'cg', 'z') });
    expect(unlocked.gallery.cg[1]).toMatchObject({ id: 'z', title: 'Last', unlocked: true, preview: 'no-asset' });
    expect(unlocked.gallery.cg[1]?.assetKey).toBe('secret/z');
    expect(unlocked.gallery.cg[0]?.assetKey).toBeUndefined();
    expect(JSON.stringify(unlocked)).not.toContain('secret/a');
    const other = { ...p, id: 'gal-b' };
    expect(() => buildGalUiReadModel({ ...base, pkg: other, projection: choiceProjection('gal-b'),
      profile: unlock(createGalProfile(p), p, 'cg', 'z') })).toThrow(/package/);
  });
});
