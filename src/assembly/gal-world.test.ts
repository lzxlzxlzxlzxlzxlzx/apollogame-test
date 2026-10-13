import { describe, expect, it } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { Flag, InputQueue, Resource } from '@engine/protocol/components.js';
import { NARRATIVE_ADVANCE, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { GalSliceHost } from '../services/gal-ui/gal-ui-slice-host.js';
import { MemorySavePort } from '../services/save/memory-save-port.js';
import { MemoryStoragePort } from '../services/storage/memory-storage.js';
import { createGalWorld } from './gal-world.js';

const L = (value: string) => ({ 'zh-CN': value });
function pkg(): GalPackage { return {
  schemaVersion: 1, id: 'bootstrap-test', title: L('初始世界'), defaultLocale: 'zh-CN', locales: ['zh-CN'],
  entry: { chapterId: 'a', nodeId: 'intro' }, ui: { template: 'gal-template' },
  characters: {}, scenes: {},
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
  media: { backgrounds: {}, cg: {}, audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  gallery: { memories: {}, music: {} }, endings: { end: { title: L('终章') } },
  chapters: { a: { id: 'a', title: L('第一章'), start: 'intro', nodes: {
    intro: { kind: 'line', text: L('开始'), enter: [
      { kind: 'resource', id: 'affection', op: 'add', value: 2 },
      { kind: 'flag', id: 'met', value: true },
    ], next: { chapterId: 'a', nodeId: 'end' } },
    end: { kind: 'ending', ending: 'end', text: L('结束') },
  } } },
}; }
function initial() { return { schema: 1, entities: {
  affection: { Resource: { id: 'affection', current: 1, min: 0, max: 10 } },
  met: { Flag: { id: 'met', active: false } },
  random: { RandomSeed: { seed: 12345, sequence: 0 } },
} }; }

describe('GAL world bootstrap', () => {
  it('builds a story from a validated package and restricted Manifest data', () => {
    const data = initial();
    const { pkg: parsed, world, storyEntity } = createGalWorld(pkg(), data);
    expect(storyEntity).toBe('story');
    expect(parsed.id).toBe('bootstrap-test');
    expect(world.getComponent<Resource>('affection', 'Resource')?.current).toBe(3);
    expect(world.getComponent<Flag>('met', 'Flag')?.active).toBe(true);
    expect(world.getComponent<StoryRuntime>('story', 'StoryRuntime')?.current.nodeId).toBe('intro');
    expect(world.getComponent('story', 'NarrativeProjection')).toBeTruthy();
    expect(data.entities.affection.Resource.current).toBe(1);
    world.getComponent<InputQueue>('input', 'InputQueue')!.actions = [{ source: 'test', key: NARRATIVE_ADVANCE, phase: 'action' }];
    world.tick();
    expect(world.getComponent<StoryRuntime>('story', 'StoryRuntime')?.current.nodeId).toBe('end');
  });

  it('rejects non-GAL systems, invalid seeds and ambiguous resource IDs', () => {
    expect(() => createGalWorld(pkg(), { ...initial(), capabilities: ['t2-effect-apply'] }))
      .toThrow('unsupported root field capabilities');
    expect(() => createGalWorld(pkg(), { ...initial(), entities: {
      ...initial().entities, second: { Resource: { id: 'affection', current: 0, min: 0, max: 1 } },
    } })).toThrow('duplicate Resource');
    expect(() => createGalWorld(pkg(), { ...initial(), entities: {
      ...initial().entities, random: { RandomSeed: { seed: 12345, sequence: 1 } },
    } })).toThrow('invalid RandomSeed');
    expect(() => createGalWorld(pkg(), { ...initial(), entities: {
      ...initial().entities, story: { Flag: { id: 'extra', active: false } },
    } })).toThrow('entity story is reserved');
    expect(() => createGalWorld(pkg(), { ...initial(), extra: () => true }))
      .toThrow('companion must contain only finite JSON values');
    expect(() => createGalWorld({ ...pkg(), extra: () => true }, initial()))
      .toThrow('package must contain only finite JSON values');
    const sparse = pkg() as unknown as { locales: string[] };
    sparse.locales = Array(1);
    expect(() => createGalWorld(sparse, initial())).toThrow('package must contain only finite JSON values');
    expect(() => createGalWorld(pkg(), { schema: 1, entities: {
      met: initial().entities.met, random: initial().entities.random,
    } })).toThrow('refers to missing Resource affection');
    expect(() => createGalWorld(pkg(), { ...initial(), templates: { unused: { Effect: { kind: 'destroy' } } } }))
      .toThrow('template unused must define one initial component');
    expect(() => createGalWorld(pkg(), { ...initial(), entities: {
      ...initial().entities, 'more-{{i}}': { $repeat: { count: 1_000_000_000 },
        Resource: { id: 'more', current: 0, min: 0, max: 1 } },
    } })).toThrow('cannot use $repeat');
  });

  it('uses existing Manifest template expansion for initial values', () => {
    const data = { schema: 1, templates: { resource: {
      Resource: { id: '{{name}}', current: '{{value}}', min: 0, max: 10 },
    } }, entities: {
      affection: { $template: 'resource', $params: { name: 'affection', value: 1 } },
      met: { Flag: { id: 'met', active: false } },
      random: { RandomSeed: { seed: 12345, sequence: 0 } },
    } };
    const { world } = createGalWorld(pkg(), data);
    expect(world.getComponent<Resource>('affection', 'Resource')?.current).toBe(3);
  });

  it('hands the assembled world to the existing generic GAL UI host', async () => {
    const { pkg: parsed, world, storyEntity } = createGalWorld(pkg(), initial());
    const host = await GalSliceHost.create(parsed, world, storyEntity, {
      profile: new MemorySavePort(), manual: new MemoryStoragePort(), savedAt: () => 1000,
    });
    expect(host.view.story.ref.nodeId).toBe('intro');
  });
});
