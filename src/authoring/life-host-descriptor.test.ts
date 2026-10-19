import { describe, expect, it } from 'vitest';
import {
  deriveLifeHostSaveNamespace,
  hashLifeHostDescriptor,
  parseLifeHostDescriptor,
  validateLifeHostDescriptor,
} from './life-host-descriptor.js';
import { littleValleyHostDescriptorFixture, seasideMarketHostDescriptorFixture } from './life-host-descriptor.fixture.js';
import { sha256Canonical } from './life-generation-bundle.js';

const clone = <T>(value: T): T => structuredClone(value);
const codes = (value: unknown): string[] => validateLifeHostDescriptor(value).diagnostics.map((entry) => `${entry.path}:${entry.code}`);

describe('LifeHostDescriptor v1', () => {
  it('accepts and clones the Little Valley-equivalent descriptor without claiming runtime migration', () => {
    const source = littleValleyHostDescriptorFixture();
    expect(validateLifeHostDescriptor(source)).toEqual({ ok: true, diagnostics: [] });
    const parsed = parseLifeHostDescriptor(source);
    expect(parsed).toEqual(source);
    expect(parsed).not.toBe(source);
    expect(parsed.save.namespace).toBe('life:game-simlife:v1');
  });

  it('accepts an unrelated second game only through the shared engine-owned viewport profile', () => {
    const other = seasideMarketHostDescriptorFixture();
    expect(validateLifeHostDescriptor(other)).toEqual({ ok: true, diagnostics: [] });
    expect(JSON.stringify(other)).not.toContain('little-valley');
    expect(other).toMatchObject({ slug: 'game-seaside-market', artSlug: 'game-seaside-market', viewport: { profile: 'life-standard-v1' } });
  });

  it('keeps inventory chrome opt-in and accepts only the closed bounded descriptor', () => {
    const legacy = littleValleyHostDescriptorFixture();
    expect(legacy.inventoryPanel).toBeUndefined();
    expect(validateLifeHostDescriptor(legacy)).toEqual({ ok: true, diagnostics: [] });
    const enabled = { ...legacy, inventoryPanel: { enabled: true, columns: 4, titleLabelKey: 'inventory' } };
    expect(parseLifeHostDescriptor(enabled).inventoryPanel).toEqual(enabled.inventoryPanel);
  });

  it('rejects malformed inventory chrome with path-level diagnostics', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.inventoryPanel = { enabled: 'yes', columns: 0, titleLabelKey: 'free-title', css: 'fixed' };
    expect(codes(raw)).toEqual([
      '/inventoryPanel/columns:range',
      '/inventoryPanel/css:unknown_field',
      '/inventoryPanel/enabled:type',
      '/inventoryPanel/titleLabelKey:label_key',
    ]);
    raw.inventoryPanel = Object.create({ enabled: true, columns: 3, titleLabelKey: 'inventory' });
    expect(codes(raw)).toEqual(['/inventoryPanel:type']);
  });

  it('keeps quest chrome opt-in and accepts only the closed tracking contract', () => {
    const legacy = littleValleyHostDescriptorFixture();
    expect(legacy.questPanel).toBeUndefined();
    const enabled = { ...legacy, questPanel: { enabled: true, titleLabelKey: 'quests', defaultTracking: 'first-active' } };
    expect(parseLifeHostDescriptor(enabled).questPanel).toEqual(enabled.questPanel);
  });

  it('rejects malformed quest chrome and inherited objects with stable paths', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.questPanel = { enabled: 'yes', titleLabelKey: 'free-title', defaultTracking: 'nearest', css: 'fixed' };
    expect(codes(raw)).toEqual([
      '/questPanel/css:unknown_field',
      '/questPanel/defaultTracking:enum',
      '/questPanel/enabled:type',
      '/questPanel/titleLabelKey:label_key',
    ]);
    raw.questPanel = Object.create({ enabled: true, titleLabelKey: 'quests', defaultTracking: 'first-active' });
    expect(codes(raw)).toEqual(['/questPanel:type']);
  });

  it('keeps the profile drawer optional and strict',()=>{
    const legacy=littleValleyHostDescriptorFixture();expect(legacy.profilePanel).toBeUndefined();
    const enabled={...legacy,profilePanel:{enabled:true,titleLabelKey:'profile' as const}};
    expect(parseLifeHostDescriptor(enabled).profilePanel).toEqual(enabled.profilePanel);
    const invalid={...legacy,profilePanel:{enabled:'yes',titleLabelKey:'free',css:'fixed'}};
    expect(codes(invalid)).toEqual(['/profilePanel/css:unknown_field','/profilePanel/enabled:type','/profilePanel/titleLabelKey:label_key']);
  });

  it('rejects unknown root/nested fields and dangerous property names with stable paths', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.freeModulePath = './host.ts';
    raw.viewport.css = 'position:fixed';
    raw.hud.action = 'life.advance-day';
    raw.hud.labels['npc.mayor'] = '镇长';
    Object.defineProperty(raw.save, '__proto__', { value: 'pollute', enumerable: true, configurable: true });
    raw.input.constructor = 'Keyboard';
    expect(codes(raw)).toEqual([
      '/freeModulePath:unknown_field',
      '/hud/action:unknown_field',
      '/hud/labels/npc.mayor:label_key',
      '/input/constructor:unknown_field',
      '/save/__proto__:unknown_field',
      '/viewport/css:unknown_field',
    ]);
  });

  it('rejects non-plain objects instead of traversing inherited fields', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, unknown>;
    raw.hud = Object.create({ preset: 'life-standard-v1' }) as unknown;
    expect(codes(raw)).toContain('/hud:type');
  });

  it.each([
    ['plain wrong name', 'other.json'],
    ['parent traversal', '../life.json'],
    ['absolute', '/life.json'],
    ['windows absolute', 'C:\\life.json'],
    ['backslash variant', 'folder\\life.json'],
    ['URL', 'https://example.test/life.json'],
    ['data URL', 'data:application/json,{}'],
  ])('rejects packagePath: %s', (_name, value) => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.packagePath = value;
    expect(codes(raw)).toContain('/packagePath:path');
  });

  it.each(['../asset-slots.json', '/asset-slots.json', 'folder\\asset-slots.json', 'https://example.test/a.json'])('rejects unsafe assetSlotsPath %s', (value) => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.assetSlotsPath = value;
    expect(codes(raw)).toContain('/assetSlotsPath:path');
  });

  it('rejects bad slug and cross-game artSlug', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.slug = 'Little Valley'; raw.artSlug = 'game-other';
    expect(codes(raw)).toEqual(expect.arrayContaining(['/slug:slug', '/artSlug:art_slug']));
  });

  it('rejects free viewport numbers and unknown profile ids with stable diagnostics', () => {
    const raw = clone(seasideMarketHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.viewport = { profile: 'free-camera-v9', fieldW: 1440, fieldH: 900, cellSize: 48 };
    expect(codes(raw)).toEqual([
      '/viewport/cellSize:unknown_field',
      '/viewport/fieldH:unknown_field',
      '/viewport/fieldW:unknown_field',
      '/viewport/profile:enum',
    ]);
  });

  it('rejects unknown viewport, theme, HUD, input and save enums', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.viewport.profile = 'fluid'; raw.theme = 'custom';
    raw.hud.preset = 'free-dom'; raw.input.preset = 'script'; raw.save.autosave = 'every-frame';
    expect(codes(raw)).toEqual(expect.arrayContaining([
      '/viewport/profile:enum', '/theme:enum', '/hud/preset:enum', '/input/preset:enum', '/save/autosave:enum',
    ]));
  });

  it('rejects arbitrary/overlong/control-character HUD text', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.hud.title = 'x'.repeat(121);
    raw.hud.labels.objective = `line1\nline2`;
    raw.hud.labels['zone.farm'] = '农田';
    expect(codes(raw)).toEqual(expect.arrayContaining([
      '/hud/title:text_limit', '/hud/labels/objective:plain_text', '/hud/labels/zone.farm:label_key',
    ]));
  });

  it('derives the only accepted save namespace from slug and rejects version drift', () => {
    expect(deriveLifeHostSaveNamespace('game-seaside-market')).toBe('life:game-seaside-market:v1');
    const raw = clone(seasideMarketHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.save.namespace = 'life:little-valley:v1'; raw.save.schemaVersion = 2;
    expect(codes(raw)).toEqual(expect.arrayContaining(['/save/namespace:namespace', '/save/schemaVersion:schema_version']));
  });

  it('canonical hash ignores object key order but changes for a visible value', () => {
    const source = littleValleyHostDescriptorFixture();
    const reordered = {
      save: source.save, input: source.input, hud: { labels: { ...source.hud.labels }, title: source.hud.title, preset: source.hud.preset },
      theme: source.theme, viewport: { profile: source.viewport.profile },
      artSlug: source.artSlug, assetSlotsPath: source.assetSlotsPath, packagePath: source.packagePath, slug: source.slug, schema: source.schema,
    };
    expect(hashLifeHostDescriptor(reordered)).toBe(hashLifeHostDescriptor(source));
    const changed = clone(source) as unknown as Record<string, any>; changed.hud.title = '另一座镇';
    expect(hashLifeHostDescriptor(changed)).not.toBe(hashLifeHostDescriptor(source));
  });

  it('accepts a same-game ui skin and rejects foreign keys, urls, atlases, and slice drift', () => {
    const raw = clone(littleValleyHostDescriptorFixture()) as unknown as Record<string, any>;
    raw.uiSkin = {
      id: 'moonshadow-courtyard',
      slots: {
        trackedQuestFrame: 'art:game-simlife:ui:tracked-quest',
        worldStatusRibbon: 'art:game-simlife:ui:world-status',
        panelFrame: 'art:game-simlife:ui:panel',
        hudChrome: 'art:game-simlife:ui:hud-chrome',
        questIcon: 'art:game-simlife:ui:entry-quest-scroll',
        inventoryIcon: 'art:game-simlife:ui:entry-backpack',
        profileIcon: 'art:game-simlife:ui:entry-profile',
      },
      slices: { trackedQuestFrame: { source: 32 }, panelFrame: { source: 48, display: 24 } },
    };
    expect(validateLifeHostDescriptor(raw).ok).toBe(true);
    expect(hashLifeHostDescriptor(littleValleyHostDescriptorFixture())).toBe(hashLifeHostDescriptor(parseLifeHostDescriptor(littleValleyHostDescriptorFixture())));
    raw.uiSkin.slots.panelFrame = 'art:game-other:ui:panel';
    expect(codes(raw)).toContain('/uiSkin/slots/panelFrame:skin_key');
    raw.uiSkin.slots.panelFrame = 'https://example.test/panel.png';
    expect(codes(raw)).toContain('/uiSkin/slots/panelFrame:skin_key');
    raw.uiSkin.slots.panelFrame = 'art:game-simlife:ui:panel';
    raw.uiSkin.slots.resourceBadgeAtlas = 'art:game-simlife:ui:badges';
    expect(codes(raw)).toContain('/uiSkin/slots/resourceBadgeAtlas:unknown_field');
    delete raw.uiSkin.slots.resourceBadgeAtlas;
    raw.uiSkin.slices.panelFrame = { source: 0, color: '#fff' };
    expect(codes(raw)).toContain('/uiSkin/slices/panelFrame/source:range');
    expect(codes(raw)).toContain('/uiSkin/slices/panelFrame/color:unknown_field');
  });

  it('keeps diagnostics machine-readable, sorted, and exception-free', () => {
    const first = validateLifeHostDescriptor({});
    const second = validateLifeHostDescriptor({});
    expect(first).toEqual(second);
    expect(first.diagnostics.every((entry) => Object.keys(entry).sort().join(',') === 'code,message,path')).toBe(true);
    expect(first.diagnostics.map((entry) => entry.path)).toEqual([...first.diagnostics.map((entry) => entry.path)].sort());
    expect(() => parseLifeHostDescriptor({})).toThrow(/^Invalid LifeHostDescriptor:/);
  });

  it.each(['questIcon', 'inventoryIcon', 'profileIcon'])('keeps %s an optional strict same-game key, never a URL or slice', (slot) => {
    const legacy = littleValleyHostDescriptorFixture();
    const make = (value: unknown) => ({ ...legacy, uiSkin: { id: 'moon', slots: { [slot]: value } } });
    const valid = make('art:game-simlife:ui:entry');
    expect(parseLifeHostDescriptor(valid)).toEqual(valid);
    for (const value of ['', null, 1, 'https://example.test/icon.png', 'data:image/png;base64,eA==', '../icon.png', 'art:game-other:ui:entry', 'art:game-simlife:ui:entry/path']) {
      expect(codes(make(value))).toContain(`/uiSkin/slots/${slot}:skin_key`);
    }
    expect(codes({ ...valid, uiSkin: { ...valid.uiSkin, slices: { [slot]: { source: 16 } } } })).toContain(`/uiSkin/slices/${slot}:unknown_field`);
    expect(Object.hasOwn(parseLifeHostDescriptor(legacy), 'uiSkin')).toBe(false);
  });

  it('preserves the exact legacy descriptor and canonical hash without adding skin defaults', () => {
    const legacy = littleValleyHostDescriptorFixture();
    const parsed = parseLifeHostDescriptor(legacy);
    expect(parsed).toEqual(legacy);
    expect(Object.hasOwn(parsed, 'uiSkin')).toBe(false);
    expect(hashLifeHostDescriptor(legacy)).toBe(sha256Canonical(legacy));
  });

  it.each(['', 'art:game-other:ui:panel', 'art:game-simlife-other:ui:panel', 'https://example.test/x', 'data:image/png;base64,eA==', '../panel.png', 'art:game-simlife:ui:', 'art:game-simlife:ui:panel;display:none', 'art:game-simlife:ui:panel/name'])('rejects unsafe or foreign UI key %s', (value) => {
    const legacy = littleValleyHostDescriptorFixture();
    expect(codes({ ...legacy, uiSkin: { id: 'moon', slots: { panelFrame: value } } })).toContain('/uiSkin/slots/panelFrame:skin_key');
  });

  it('rejects extra skin fields, both atlas slots and unknown slice fields', () => {
    const legacy = littleValleyHostDescriptorFixture();
    const raw = { ...legacy, uiSkin: { id: 'moon', css: 'fixed', slots: { resourceBadgeAtlas: 'art:game-simlife:ui:atlas', profileAttributeAtlas: 'art:game-simlife:ui:atlas' }, slices: { worldStatusRibbon: { source: 4 } } } };
    expect(codes(raw)).toEqual(expect.arrayContaining(['/uiSkin/css:unknown_field', '/uiSkin/slots/resourceBadgeAtlas:unknown_field', '/uiSkin/slots/profileAttributeAtlas:unknown_field', '/uiSkin/slices/worldStatusRibbon:unknown_field']));
  });

  it.each([0, -1, 257, 1.5, null, '16'])('rejects invalid skin source margin %s', (source) => {
    const raw = { ...littleValleyHostDescriptorFixture(), uiSkin: { id: 'moon', slots: { panelFrame: 'art:game-simlife:ui:panel' }, slices: { panelFrame: { source } } } };
    expect(codes(raw)).toContain('/uiSkin/slices/panelFrame/source:range');
  });

  it.each([0, -1, 129, 2.5, null, '8'])('rejects invalid skin display border %s', (display) => {
    const raw = { ...littleValleyHostDescriptorFixture(), uiSkin: { id: 'moon', slots: { panelFrame: 'art:game-simlife:ui:panel' }, slices: { panelFrame: { source: 16, display } } } };
    expect(codes(raw)).toContain('/uiSkin/slices/panelFrame/display:range');
  });

  it('rejects malformed skin objects and dangling slice configuration', () => {
    const legacy = littleValleyHostDescriptorFixture();
    for (const uiSkin of [null, [], Object.create({ id: 'moon', slots: {} })]) expect(codes({ ...legacy, uiSkin })).toContain('/uiSkin:type');
    expect(codes({ ...legacy, uiSkin: { id: 'Moon Shade', slots: {} } })).toContain('/uiSkin/id:skin_id');
    expect(codes({ ...legacy, uiSkin: { id: 'moon', slots: {}, slices: { panelFrame: { source: 1 } } } })).toContain('/uiSkin/slices/panelFrame:skin_slot');
  });
});
