import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { GalNode, GalPackage } from '@engine/protocol/galgame.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { hashWithOrder } from '@net/determinism.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { createGalProfile, loadGalProfile, saveGalProfile, unlock } from '../gal-profile/gal-profile.js';
import type { SaveGame, StoragePort } from '../storage/storage-port.js';
import { NARRATIVE_ACK, createStoryRuntime, narrativeDirectorCapability, readNarrativeEvents,
  type NarrativeHistory, type NarrativePackage, type NarrativeProjection, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { GalManualSaveController } from './gal-manual-save.js';

const L = (text: string) => ({ 'zh-CN': text });
function pkg(id = 'gal-a'): GalPackage {
  return {
    schemaVersion: 1, id, title: L(id), defaultLocale: 'zh-CN', locales: ['zh-CN'],
    entry: { chapterId: 'a', nodeId: 'start' }, ui: { template: 'gal-template' },
    preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only', bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
    characters: {}, scenes: {}, media: { backgrounds: {}, cg: {}, audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
    endings: { good: { title: L('好') }, bad: { title: L('坏') } }, gallery: { memories: {}, music: {} },
    chapters: { a: { id: 'a', title: L('第一章'), start: 'start', nodes: {
      start: { kind: 'line', text: L('开始'), next: { chapterId: 'a', nodeId: 'pick' } },
      pick: { kind: 'choice', prompt: L('选'), options: [
        { id: 'yes', text: L('是'), next: { chapterId: 'a', nodeId: 'good' } },
        { id: 'no', text: L('否'), next: { chapterId: 'a', nodeId: 'bad' } },
      ] },
      good: { kind: 'ending', ending: 'good', text: L('好结局') },
      bad: { kind: 'ending', ending: 'bad', text: L('坏结局') },
    } } },
  };
}
function world(packageData = pkg()): World {
  const w = new World();
  for (const system of narrativeDirectorCapability.systems) w.addSystem(system);
  w.createEntity('10'); w.addComponent('10', { type: 'NarrativePackage', package: packageData });
  w.addComponent('10', createStoryRuntime(packageData));
  w.createEntity('2'); w.addComponent('2', { type: 'InputQueue', actions: [] });
  w.createEntity('seed'); w.addComponent('seed', { type: 'RandomSeed', seed: 7, sequence: 0 });
  w.createEntity('resource'); w.addComponent('resource', { type: 'Resource', id: 'points', current: 1, min: 0, max: 9 });
  w.tick();
  return w;
}
function act(w: World, key: string, arg?: string): void {
  w.addComponent('2', { type: 'InputQueue', actions: [{ source: 'test', phase: 'action', key, arg }] });
  w.tick();
  w.addComponent('2', { type: 'InputQueue', actions: [] });
}
function bytes(w: World): string { return JSON.stringify([w.snapshot(), w.snapshotOrder()]); }
async function rewrite(port: StoragePort, slot: string, edit: (data: SaveGame) => void, rehash = true): Promise<void> {
  const data = (await port.load(slot))!;
  edit(data);
  if (rehash) data.meta.hash = hashWithOrder(data.snapshot, data.order);
  await port.save(slot, data);
}

describe('GAL-ENG-03B manual save controller', () => {
  it('keeps numbered slots package-isolated, ordered, exact-delete and beyond a 12-cell page', async () => {
    const port = new MemoryStoragePort();
    const a = new GalManualSaveController(pkg(), port);
    const b = new GalManualSaveController(pkg('gal-b'), port);
    const wa = world(); const wb = world(pkg('gal-b'));
    expect(await a.load(1, wa)).toEqual({ status: 'empty' });
    await a.save(13, wa, '第十三格'); await a.save(1, wa); await a.save(12, wa);
    await b.save(1, wb);
    expect((await a.list()).map(x => x.number)).toEqual([1, 12, 13]);
    expect((await b.list()).map(x => x.number)).toEqual([1]);
    await a.delete(12);
    expect((await a.list()).map(x => x.number)).toEqual([1, 13]);
    expect((await b.list()).map(x => x.number)).toEqual([1]);
    expect(() => a.slot(0)).toThrow(RangeError);
    expect(() => a.slot(1.5)).toThrow(RangeError);
    expect(() => a.slot(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('restores history, values, order and no pending input without rolling back external profile', async () => {
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(pkg(), port); const w = world();
    act(w, 'narrative.advance');
    const expected = w.snapshot(); const order = w.snapshotOrder();
    const profilePort = new MemorySavePort();
    const externalProfile = unlock(createGalProfile(pkg()), pkg(), 'ending', 'good');
    await saveGalProfile(profilePort, pkg(), externalProfile, 1234);
    w.addComponent('2', { type: 'InputQueue', actions: [{ source: 'test', phase: 'action', key: 'narrative.choose', arg: 'yes' }] });
    await controller.save(1, w);
    const stored = (await port.load(controller.slot(1)))!;
    expect((stored.snapshot['2']!.InputQueue as InputQueue).actions).toEqual([]);
    expect(stored.meta.tick).toBe(w.getVersion());
    act(w, 'narrative.choose', 'yes');
    w.addComponent('resource', { type: 'Resource', id: 'points', current: 9, min: 0, max: 9 });
    w.addComponent('seed', { type: 'RandomSeed', seed: 99, sequence: 3 });
    w.emit('narrative.advance', { pending: true });
    expect(await controller.load(1, w)).toMatchObject({ status: 'loaded' });
    expect(w.snapshotOrder()).toEqual(order);
    expect((w.snapshot()['2']!.InputQueue as InputQueue).actions).toEqual([]);
    expect(w.events('narrative.advance')).toEqual([]);
    expect(w.getComponent('10', 'StoryRuntime')).toEqual(expected['10']!.StoryRuntime);
    expect(w.getComponent('10', 'NarrativeHistory')).toEqual(expected['10']!.NarrativeHistory);
    expect(w.getComponent('resource', 'Resource')).toEqual(expected.resource!.Resource);
    expect(w.getComponent('seed', 'RandomSeed')).toEqual(expected.seed!.RandomSeed);
    expect((await loadGalProfile(profilePort, pkg())).unlockedEndingIds).toEqual(['good']);
    w.tick();
    expect((w.getComponent<StoryRuntime>('10', 'StoryRuntime')!.current).nodeId).toBe('pick');
    act(w, 'narrative.choose', 'no');
    expect((w.getComponent<StoryRuntime>('10', 'StoryRuntime')!.current).nodeId).toBe('bad');
  });

  it('opens a fresh history window for a legacy slot lacking NarrativeHistory', async () => {
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(pkg(), port); const w = world();
    act(w, 'narrative.advance'); await controller.save(1, w);
    await rewrite(port, controller.slot(1), data => { delete data.snapshot['10']!.NarrativeHistory; });
    expect(await controller.load(1, w)).toMatchObject({ status: 'loaded' });
    expect(w.getComponent('10', 'NarrativeHistory')).toBeUndefined();
    act(w, 'narrative.choose', 'yes');
    const history = w.getComponent<NarrativeHistory>('10', 'NarrativeHistory')!;
    expect(history.entries[0].ref.nodeId).toBe('pick');
  });

  it('restores a saved branch and allows deterministic rollback across the choice', async () => {
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(pkg(), port); const w = world();
    act(w, 'narrative.advance'); act(w, 'narrative.choose', 'yes');
    await controller.save(1, w);
    const stored = (await port.load(controller.slot(1)))!;
    const run = async (): Promise<string> => {
      await controller.load(1, w);
      act(w, 'narrative.back');
      expect(w.getComponent<StoryRuntime>('10', 'StoryRuntime')!.current.nodeId).toBe('pick');
      act(w, 'narrative.choose', 'no');
      return hashWithOrder(w.snapshot(), w.snapshotOrder());
    };
    const first = await run();
    const second = await run();
    expect(first).toBe(second);
    expect(w.getComponent<StoryRuntime>('10', 'StoryRuntime')!.current.nodeId).toBe('bad');
    expect((await port.load(controller.slot(1)))!.meta.hash).toBe(stored.meta.hash);
  });

  it('rejects corrupt hash, wrong package, bad ref, bad history and package revision without active mutation', async () => {
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(pkg(), port); const w = world();
    act(w, 'narrative.advance'); await controller.save(1, w);
    const original = (await port.load(controller.slot(1)))!;
    const before = bytes(w);
    const cases: Array<(data: SaveGame) => void> = [
      data => { data.meta.hash = 'wrong'; },
      data => { data.snapshot['10']!.NarrativePackage = { type: 'NarrativePackage', package: pkg('other') } as NarrativePackage; },
      data => { (data.snapshot['10']!.StoryRuntime as StoryRuntime).current = { chapterId: 'a', nodeId: 'missing' }; },
      data => { (data.snapshot['10']!.NarrativeHistory as NarrativeHistory).cursor = 999; },
      data => { data.snapshot['10']!.NarrativePackage = { type: 'NarrativePackage', package: { ...pkg(), title: L('更新') } } as NarrativePackage; },
      data => { data.order = ['10', '10', 'seed', 'resource']; },
      data => { data.meta.slot = 'someone-else'; },
    ];
    for (const [index, mutate] of cases.entries()) {
      const data = structuredClone(original); mutate(data);
      if (index !== 0) data.meta.hash = hashWithOrder(data.snapshot, data.order);
      await port.save(controller.slot(1), data);
      await expect(controller.load(1, w)).rejects.toThrow();
      expect(bytes(w)).toBe(before);
    }
  });

  it('propagates read/write failures and rejects a mismatched history at save time', async () => {
    const backing = new MemoryStoragePort(); const base = new GalManualSaveController(pkg(), backing); const w = world();
    await base.save(1, w);
    const broken: StoragePort = {
      save: async () => { throw new Error('write failed'); },
      load: async () => { throw new Error('read failed'); },
      list: () => backing.list(), delete: slot => backing.delete(slot),
    };
    const controller = new GalManualSaveController(pkg(), broken);
    const before = bytes(w);
    await expect(controller.save(2, w)).rejects.toThrow('write failed');
    await expect(controller.load(1, w)).rejects.toThrow('read failed');
    expect(bytes(w)).toBe(before);
    expect((await base.list()).map(x => x.number)).toEqual([1]);
    const history = w.getComponent<NarrativeHistory>('10', 'NarrativeHistory')!;
    w.addComponent('10', { ...history, cursor: 999 });
    await expect(base.save(2, w)).rejects.toThrow();
    expect((await base.list()).map(x => x.number)).toEqual([1]);
  });

  it('refuses to replace an active World that incorrectly owns GalProfile', async () => {
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(pkg(), port); const w = world();
    await controller.save(1, w);
    w.createEntity('profile');
    w.addComponent('profile', { type: 'GalProfile', packageId: 'gal-a' });
    const before = bytes(w);
    await expect(controller.load(1, w)).rejects.toThrow('GalProfile');
    expect(bytes(w)).toBe(before);
  });

  it('rejects a rehashed legacy slot with forged projection text and no history', async () => {
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(pkg(), port); const w = world();
    await controller.save(1, w);
    const before = bytes(w);
    await rewrite(port, controller.slot(1), data => {
      delete data.snapshot['10']!.NarrativeHistory;
      (data.snapshot['10']!.NarrativeProjection as NarrativeProjection).text = L('伪造文案');
    });
    await expect(controller.load(1, w)).rejects.toThrow('投影');
    expect(bytes(w)).toBe(before);
  });

  it('rejects forged text in a non-current history entry before it can appear on rollback or in backlog', async () => {
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(pkg(), port); const w = world();
    act(w, 'narrative.advance'); await controller.save(1, w);
    const before = bytes(w);
    await rewrite(port, controller.slot(1), data => {
      (data.snapshot['10']!.NarrativeHistory as NarrativeHistory).entries[0].projection.text = L('伪造旧句');
    });
    await expect(controller.load(1, w)).rejects.toThrow('历史第 0 条');
    expect(bytes(w)).toBe(before);
    await rewrite(port, controller.slot(1), data => {
      const entry = (data.snapshot['10']!.NarrativeHistory as NarrativeHistory).entries[0];
      entry.projection.text = L('开始');
      entry.text = L('伪造回看');
    });
    await expect(controller.load(1, w)).rejects.toThrow('历史第 0 条');
    expect(bytes(w)).toBe(before);
  });

  it('round-trips the bounded 512-step history without copying static package into entries', async () => {
    const base = pkg(); const nodes: Record<string, GalNode> = {};
    for (let i = 0; i <= 512; i++) nodes[`n${i}`] = {
      kind: 'line', text: L(`第 ${i} 句`), next: { chapterId: 'a', nodeId: i === 512 ? 'end' : `n${i + 1}` },
    };
    nodes.end = { kind: 'ending', ending: 'good', text: L('结束') };
    const longPkg: GalPackage = { ...base, entry: { chapterId: 'a', nodeId: 'n0' },
      chapters: { a: { id: 'a', title: L('长章'), start: 'n0', nodes } } };
    const port = new MemoryStoragePort(); const controller = new GalManualSaveController(longPkg, port);
    const w = world(longPkg);
    for (let i = 0; i < 512; i++) {
      act(w, 'narrative.advance');
      const last = readNarrativeEvents(w, '10').at(-1);
      if (last) { act(w, NARRATIVE_ACK, String(last.seq)); expect(w.getComponent<StoryRuntime>('10', 'StoryRuntime')!.lastReceipt?.status).toBe('applied'); }
    }
    const original = w.getComponent<NarrativeHistory>('10', 'NarrativeHistory')!;
    expect(original.entries).toHaveLength(512);
    await controller.save(1, w);
    const stored = (await port.load(controller.slot(1)))!;
    const history = stored.snapshot['10']!.NarrativeHistory as NarrativeHistory;
    expect(history.entries).toHaveLength(512);
    expect(JSON.stringify(history)).not.toContain('NarrativePackage');
    act(w, 'narrative.advance');
    await controller.load(1, w);
    expect(w.getComponent<NarrativeHistory>('10', 'NarrativeHistory')!.cursor).toBe(511);
    expect(w.getComponent<StoryRuntime>('10', 'StoryRuntime')!.current.nodeId).toBe('n512');
  });
});
