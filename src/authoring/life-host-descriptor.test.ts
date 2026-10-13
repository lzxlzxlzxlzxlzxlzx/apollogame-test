import { describe, expect, it } from 'vitest';
import {
  deriveLifeHostSaveNamespace,
  hashLifeHostDescriptor,
  parseLifeHostDescriptor,
  validateLifeHostDescriptor,
} from './life-host-descriptor.js';
import { littleValleyHostDescriptorFixture, seasideMarketHostDescriptorFixture } from './life-host-descriptor.fixture.js';

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

  it('keeps diagnostics machine-readable, sorted, and exception-free', () => {
    const first = validateLifeHostDescriptor({});
    const second = validateLifeHostDescriptor({});
    expect(first).toEqual(second);
    expect(first.diagnostics.every((entry) => Object.keys(entry).sort().join(',') === 'code,message,path')).toBe(true);
    expect(first.diagnostics.map((entry) => entry.path)).toEqual([...first.diagnostics.map((entry) => entry.path)].sort());
    expect(() => parseLifeHostDescriptor({})).toThrow(/^Invalid LifeHostDescriptor:/);
  });
});
