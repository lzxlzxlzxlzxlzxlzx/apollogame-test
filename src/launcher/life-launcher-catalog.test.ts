import { describe, expect, it } from 'vitest';
import rawSlots from '../../games/game-simlife/little-valley.asset-slots.json';
import { threeSceneLifePackage } from '../assembly/life-package.fixture.js';
import { seasideMarketHostDescriptorFixture } from '../authoring/life-host-descriptor.fixture.js';
import {
  LIFE_LAUNCHER_SCHEMA, discoverLifeLauncherCatalog, type LifeLauncherEntryV1,
} from './life-launcher-catalog.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function entry(id = 'game-seaside-market'): LifeLauncherEntryV1 {
  return {
    schema: LIFE_LAUNCHER_SCHEMA, id, title: '海风集市', subtitle: '潮汐经营 · 数据驱动',
    description: '一份独立的 Life 启动器测试内容。', color: '#17364a', accentColor: '#62d6c5', icon: '🐚',
  };
}

function fixture(directory = 'game-seaside-market') {
  const descriptor = clone(seasideMarketHostDescriptorFixture()) as any;
  descriptor.slug = directory; descriptor.artSlug = directory; descriptor.save.namespace = `life:${directory}:v1`;
  const lifePackage = clone(threeSceneLifePackage()) as any;
  lifePackage.meta.id = directory; lifePackage.meta.title = 'Seaside Market';
  const slots = clone(rawSlots) as any; slots.game = directory;
  const root = `../../games/${directory}`;
  return {
    entries: { [`${root}/life-launcher.json`]: entry(directory) },
    hosts: { [`${root}/life-host.json`]: descriptor },
    packages: { [`${root}/life.json`]: lifePackage },
    slots: { [`${root}/asset-slots.json`]: slots },
  };
}

describe('Life launcher catalog', () => {
  it('validates calendar label references before producing a runnable bundle', () => {
    const value = fixture();
    const host = value.hosts[Object.keys(value.hosts)[0]!]!;
    host.hud.calendarLabels = { seasons: { spring: '春季' } };
    expect(discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots).items[0]!.bundle).toBeDefined();
    host.hud.calendarLabels.slots = { dawn: '黎明' };
    const invalid = discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots).items[0]!;
    expect(invalid.bundle).toBeUndefined();
    expect(invalid.gameEntry.status).toBe('coming-soon');
    expect(invalid.diagnostics).toContainEqual(expect.objectContaining({ path: '/host/hud/calendarLabels/slots/dawn', code: 'calendar_reference' }));
  });
  it('discovers a second arbitrary Life game from fixed same-directory modules with no loader branch', () => {
    const value = fixture();
    const catalog = discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots);
    expect(catalog.items).toHaveLength(1);
    expect(catalog.gameEntries[0]).toMatchObject({ id: 'life:game-seaside-market', title: '海风集市', status: 'playable' });
    expect(catalog.items[0]!.bundle?.descriptor.slug).toBe('game-seaside-market');
    expect(JSON.stringify({ gameEntry: catalog.gameEntries[0], descriptor: catalog.items[0]!.bundle?.descriptor, lifePackage: catalog.items[0]!.bundle?.lifePackage })).not.toContain('小山谷');
  });

  it('returns an empty catalog when no launcher entries exist', () => {
    expect(discoverLifeLauncherCatalog({}, {}, {}, {})).toEqual({ items: [], gameEntries: [] });
  });

  it('rejects unknown metadata and never interprets paths, URLs or module specifiers from entry data', () => {
    const value = fixture();
    const key = Object.keys(value.entries)[0]!;
    (value.entries[key] as any).module = 'https://evil.invalid/game.js';
    const item = discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots).items[0]!;
    expect(item.bundle).toBeUndefined();
    expect(item.gameEntry.status).toBe('coming-soon');
    expect(item.diagnostics).toContainEqual(expect.objectContaining({ path: '/module', code: 'unknown_field' }));
  });

  it('rejects non-plain and prototype-shaped entry objects', () => {
    const value = fixture(); const key = Object.keys(value.entries)[0]!;
    value.entries[key] = Object.assign(Object.create({ inherited: true }), entry()) as LifeLauncherEntryV1;
    expect(discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots).items[0]!.diagnostics[0]?.code).toBe('type');
    value.entries[key] = JSON.parse(JSON.stringify({ ...entry(), constructor: 'escape' }));
    expect(discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots).items[0]!.diagnostics).toContainEqual(expect.objectContaining({ path: '/constructor', code: 'unknown_field' }));
  });

  it.each([
    ['host', (value: ReturnType<typeof fixture>) => { (value.hosts[Object.keys(value.hosts)[0]!] as any).packagePath = '../life.json'; }, 'invalid_host'],
    ['package', (value: ReturnType<typeof fixture>) => { (value.packages[Object.keys(value.packages)[0]!] as any).scenes = []; }, 'invalid_package'],
    ['slots', (value: ReturnType<typeof fixture>) => { (value.slots[Object.keys(value.slots)[0]!] as any).slots[0].assetKey = 'https://evil.invalid/x.png'; }, 'invalid_slots'],
  ])('isolates an invalid %s contract before it becomes runnable', (_label, mutate, code) => {
    const value = fixture(); mutate(value);
    const item = discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots).items[0]!;
    expect(item.bundle).toBeUndefined();
    expect(item.gameEntry.status).toBe('coming-soon');
    expect(item.diagnostics.map((issue) => issue.code)).toContain(code);
  });

  it('requires all three exact same-directory fixed files', () => {
    const value = fixture();
    const item = discoverLifeLauncherCatalog(value.entries, {}, {}, {}).items[0]!;
    expect(item.diagnostics.map((issue) => issue.code)).toEqual(['missing_module', 'missing_module', 'missing_module']);
    expect(item.bundle).toBeUndefined();
  });

  it('fails closed on directory, descriptor, package and slot identity mismatches', () => {
    const value = fixture();
    const hostKey = Object.keys(value.hosts)[0]!; const packageKey = Object.keys(value.packages)[0]!; const slotsKey = Object.keys(value.slots)[0]!;
    (value.entries[Object.keys(value.entries)[0]!] as any).id = 'game-other';
    (value.hosts[hostKey] as any).slug = 'game-other'; (value.hosts[hostKey] as any).artSlug = 'game-other'; (value.hosts[hostKey] as any).save.namespace = 'life:game-other:v1';
    (value.packages[packageKey] as any).meta.id = 'game-other';
    (value.slots[slotsKey] as any).game = 'game-other';
    const codes = discoverLifeLauncherCatalog(value.entries, value.hosts, value.packages, value.slots).items[0]!.diagnostics.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['directory_mismatch', 'slug_mismatch', 'package_id_mismatch', 'slots_game_mismatch']));
  });

  it('detects duplicate claimed ids and sorts diagnostics/items stably', () => {
    const a = fixture('game-alpha'); const z = fixture('game-zeta');
    const aKey = Object.keys(a.entries)[0]!; const zKey = Object.keys(z.entries)[0]!;
    (a.entries[aKey] as any).id = 'game-shared'; (z.entries[zKey] as any).id = 'game-shared';
    const catalog = discoverLifeLauncherCatalog(
      { ...z.entries, ...a.entries }, { ...z.hosts, ...a.hosts }, { ...z.packages, ...a.packages }, { ...z.slots, ...a.slots },
    );
    expect(catalog.items.map((item) => item.directory)).toEqual(['game-alpha', 'game-zeta']);
    expect(catalog.items.every((item) => item.diagnostics.some((issue) => issue.code === 'duplicate_id'))).toBe(true);
    expect(catalog.items.every((item) => item.bundle === undefined)).toBe(true);
  });

  it('ignores module keys outside the compile-time convention', () => {
    const value = fixture();
    const unsafe = { 'https://evil.invalid/life-launcher.json': entry(), '../outside/life-launcher.json': entry(), ...value.entries };
    expect(discoverLifeLauncherCatalog(unsafe, value.hosts, value.packages, value.slots).items).toHaveLength(1);
  });
});
