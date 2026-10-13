import { describe, expect, it } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/determinism.js';
import { worldWith } from '../../test-fixtures/test-kit.js';
import { NARRATIVE_ACK, NARRATIVE_ADVANCE, NARRATIVE_BACK, NARRATIVE_CHOOSE, NARRATIVE_READ_COMPLETE,
  createStoryRuntime, narrativeDirectorCapability, readNarrativeEvents, storyRefKey,
  type NarrativeOutbox, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { computeChecksum, sealEnvelope } from '../save/envelope.js';
import type { SavePort } from '../save/save-port.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
import { GalManualSaveController } from '../gal-save/gal-manual-save.js';
import { createGalProfile, galProfileCodec, galProfileSlot, loadGalProfile, persistGalConfirmation } from './gal-profile.js';
import { GalNarrativeProfileBridge } from './narrative-profile-bridge.js';

const L = (value: string) => ({ 'zh-CN': value });
const ref = (nodeId: string) => ({ chapterId: 'a', nodeId });
function pkg(id = 'gal-bridge'): GalPackage {
  return {
    schemaVersion: 1, id, title: L(id), defaultLocale: 'zh-CN', locales: ['zh-CN'], entry: ref('start'),
    ui: { template: 'gal-template' }, characters: {}, scenes: {},
    preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
      bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
    media: { backgrounds: {}, cg: { cg: { image: 'art:cg', title: L('CG'), unlock: { kind: 'explicit' } } },
      audio: { bgm: { theme: { asset: 'audio:theme', loop: true } }, sfx: {}, voice: {} }, video: {} },
    gallery: { memories: { memory: { title: L('回想'), entry: ref('start'), unlock: { kind: 'explicit' } } },
      music: { theme: { unlock: { kind: 'explicit' } } } },
    endings: { good: { title: L('好') }, bad: { title: L('坏') } },
    chapters: { a: { id: 'a', title: L('第一章'), start: 'start', nodes: {
      start: { kind: 'line', text: L('开始'), enter: [{ kind: 'unlockCg', id: 'cg' }], next: ref('pick') },
      pick: { kind: 'choice', prompt: L('选择'), options: [
        { id: 'yes', text: L('好'), effects: [{ kind: 'unlockMemory', id: 'memory' }], next: ref('good') },
        { id: 'no', text: L('坏'), next: ref('bad') },
      ] },
      good: { kind: 'ending', ending: 'good', text: L('好结局'), enter: [{ kind: 'unlockMusic', id: 'theme' }] },
      bad: { kind: 'ending', ending: 'bad', text: L('坏结局') },
    } } },
  };
}
function makeWorld(p = pkg()): World {
  const w = worldWith(narrativeDirectorCapability);
  w.createEntity('story'); w.addComponent('story', { type: 'NarrativePackage', package: p });
  w.addComponent('story', createStoryRuntime(p));
  w.createEntity('input'); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
  return w;
}
function action(w: World, key?: string, arg?: string): void {
  w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: key ? [{ source:'test', phase:'action', key, arg }] : [] });
  w.tick();
  w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
}
function ackTick(w: World): void { w.tick(); w.addComponent<InputQueue>('input', { type:'InputQueue', actions:[] }); }
const queue = (w: World) => w.peek<InputQueue>('input', 'InputQueue')!;
const runtime = (w: World) => w.peek<StoryRuntime>('story', 'StoryRuntime')!;

describe('GAL-ENG-04B narrative profile bridge', () => {
  it('keeps both milestone unlock and confirmation changes under concurrent Profile writers', async () => {
    for (const order of ['bridge-first', 'preference-first'] as const) {
      const p = pkg(`gal-05a-${order}`), w = makeWorld(p), port = new MemorySavePort();
      const bridge = new GalNarrativeProfileBridge(p, port);
      action(w); // enter start -> unlock CG milestone in outbox
      const drain = () => bridge.drain(w, 'story', 20);
      const preference = () => persistGalConfirmation(port, p, 'load', false, 21);
      const results = order === 'bridge-first'
        ? await Promise.all([drain(), preference()])
        : await Promise.all([preference(), drain()]);
      expect(results).toHaveLength(2);
      const saved = await loadGalProfile(port, p);
      expect(saved.unlockedCgIds).toEqual(['cg']);
      expect(saved.preferences.confirmations.load).toBe(false);
    }
  });
  it('folds only explicit read and unlock milestones, then queues ack after profile persistence', async () => {
    const p = pkg(), w = makeWorld(p), port = new MemorySavePort(), bridge = new GalNarrativeProfileBridge(p, port);
    expect(await bridge.drain(w, 'story', 1)).toEqual({ status:'empty' });
    action(w);
    expect(readNarrativeEvents(w, 'story').some(e => e.kind === 'reach-node')).toBe(true);
    const first = await bridge.drain(w, 'story', 2);
    expect(first).toMatchObject({ status:'ack-queued', processed:2 });
    expect(queue(w).actions).toEqual([{ source:'gal-profile-bridge', phase:'action', key:NARRATIVE_ACK, arg:String(readNarrativeEvents(w, 'story').at(-1)!.seq) }]);
    let profile = await loadGalProfile(port, p);
    expect(profile.readNodeIds).toEqual([]);
    expect(profile.unlockedCgIds).toEqual(['cg']);
    ackTick(w); expect(readNarrativeEvents(w, 'story')).toEqual([]);
    action(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('start')));
    action(w, NARRATIVE_ADVANCE); action(w, NARRATIVE_CHOOSE, 'yes');
    const saved = await bridge.drain(w, 'story', 3);
    expect(saved.status).toBe('ack-queued');
    profile = await loadGalProfile(port, p);
    expect(profile.readNodeIds).toEqual([storyRefKey(ref('start'))]);
    expect(profile.unlockedEndingIds).toEqual(['good']);
    expect(profile.unlockedMemoryIds).toEqual(['memory']);
    expect(profile.unlockedMusicIds).toEqual(['theme']);
    ackTick(w); expect(readNarrativeEvents(w, 'story')).toEqual([]);
    expect(await bridge.drain(w, 'story', 4)).toEqual({ status:'empty' });
  });

  it('never acknowledges failed saves, invalid time, invalid events or corrupt profiles; retry is idempotent', async () => {
    const p = pkg(), w = makeWorld(p), base = new MemorySavePort(); action(w);
    let failWrite = true;
    const port: SavePort = { list: () => base.list(), read: slot => base.read(slot), remove: slot => base.remove(slot),
      write: (slot, env) => failWrite ? Promise.reject(new Error('offline')) : base.write(slot, env) };
    const bridge = new GalNarrativeProfileBridge(p, port);
    expect(await bridge.drain(w, 'story', Number.NaN)).toMatchObject({ status:'failed', stage:'validate' });
    expect(await bridge.drain(w, 'story', 1)).toMatchObject({ status:'failed', stage:'save' });
    expect(queue(w).actions).toEqual([]);
    expect(readNarrativeEvents(w, 'story').length).toBeGreaterThan(0);
    failWrite = false;
    expect((await bridge.drain(w, 'story', 2)).status).toBe('ack-queued');
    // Simulate a host that loses the queued ack before the next tick.
    w.addComponent<InputQueue>('input', { type:'InputQueue', actions:[] });
    expect((await bridge.drain(w, 'story', 3)).status).toBe('ack-queued');
    expect((await loadGalProfile(base, p)).unlockedCgIds).toEqual(['cg']);
    ackTick(w);
    const next = makeWorld(p); action(next);
    const box = next.peek<NarrativeOutbox>('story', 'NarrativeOutbox')!;
    box.pending[0].contentId = 'missing'; box.pending[0].id = JSON.stringify([p.id, box.pending[0].kind, 'missing']);
    expect(await bridge.drain(next, 'story', 4)).toMatchObject({ status:'failed', stage:'validate' });
    expect(queue(next).actions).toEqual([]);
    const bad = sealEnvelope({ ...createGalProfile(p), unlockedCgIds:['unknown'] }, galProfileCodec(p), 5);
    await base.write(galProfileSlot(p), bad);
    const clean = makeWorld(p); action(clean);
    expect(await bridge.drain(clean, 'story', 6)).toMatchObject({ status:'failed', stage:'load' });
    expect(queue(clean).actions).toEqual([]);
  });

  it('rejects bad checksum, foreign envelope and read failure without clearing the outbox', async () => {
    const p = pkg(), w = makeWorld(p), base = new MemorySavePort(), bridge = new GalNarrativeProfileBridge(p, base);
    action(w);
    const expected = readNarrativeEvents(w, 'story');
    const env = sealEnvelope(createGalProfile(p), galProfileCodec(p), 1);
    await base.write(galProfileSlot(p), { ...env, checksum:'bad' });
    expect(await bridge.drain(w, 'story', 2)).toMatchObject({ status:'failed', stage:'load' });
    expect(readNarrativeEvents(w, 'story')).toEqual(expected);
    await base.write(galProfileSlot(p), { ...env, gameId:'foreign',
      checksum:computeChecksum(env.schema, 'foreign', env.savedAt, env.data) });
    expect(await bridge.drain(w, 'story', 3)).toMatchObject({ status:'failed', stage:'load' });
    expect(queue(w).actions).toEqual([]);
    const failing: SavePort = { list: () => base.list(), read: async () => { throw new Error('offline'); },
      write: (slot, value) => base.write(slot, value), remove: slot => base.remove(slot) };
    expect(await new GalNarrativeProfileBridge(p, failing).drain(w, 'story', 4)).toMatchObject({ status:'failed', stage:'load' });
    expect(readNarrativeEvents(w, 'story')).toEqual(expected);
  });

  it('rejects a different publication with the same package ID before writing Profile or ack', async () => {
    const published = pkg(), w = makeWorld(published), port = new MemorySavePort();
    action(w);
    const expected = readNarrativeEvents(w, 'story');
    const stale = pkg();
    delete (stale.chapters.a.nodes.start as { enter?: unknown }).enter;
    const bridge = new GalNarrativeProfileBridge(stale, port);
    expect(await bridge.drain(w, 'story', 1)).toMatchObject({ status:'failed', stage:'validate' });
    expect(readNarrativeEvents(w, 'story')).toEqual(expected);
    expect(queue(w).actions).toEqual([]);
    expect(await port.read(galProfileSlot(stale))).toBeNull();
  });

  it('retries when the queued ack is rejected by Director', async () => {
    const p = pkg(), w = makeWorld(p), base = new MemorySavePort(), bridge = new GalNarrativeProfileBridge(p, base);
    action(w);
    expect((await bridge.drain(w, 'story', 1)).status).toBe('ack-queued');
    const ack = queue(w).actions[0];
    w.addComponent<InputQueue>('input', { type:'InputQueue', actions:[{ ...ack, arg:'999999' }] });
    ackTick(w);
    expect(runtime(w).lastReceipt?.reason).toBe('invalid-input');
    expect(readNarrativeEvents(w, 'story').length).toBeGreaterThan(0);
    expect((await bridge.drain(w, 'story', 2)).status).toBe('ack-queued');
    ackTick(w);
    expect(readNarrativeEvents(w, 'story')).toEqual([]);
    expect((await loadGalProfile(base, p)).unlockedCgIds).toEqual(['cg']);
  });

  it('does not overwrite player input; retry queues ack when the input slot becomes idle', async () => {
    const p = pkg(), w = makeWorld(p), bridge = new GalNarrativeProfileBridge(p, new MemorySavePort()); action(w);
    w.addComponent<InputQueue>('input', { type:'InputQueue', actions:[{ source:'player', phase:'action', key:NARRATIVE_ADVANCE }] });
    expect(await bridge.drain(w, 'story', 1)).toMatchObject({ status:'saved-pending-ack', reason:'input-busy' });
    expect(queue(w).actions[0].key).toBe(NARRATIVE_ADVANCE);
    w.addComponent<InputQueue>('input', { type:'InputQueue', actions:[] });
    expect((await bridge.drain(w, 'story', 2)).status).toBe('ack-queued');
    ackTick(w); expect(readNarrativeEvents(w, 'story')).toEqual([]);
  });

  it('serializes concurrent drains and refuses stale ack after World restore during asynchronous save', async () => {
    const p = pkg(), w = makeWorld(p), base = new MemorySavePort(); action(w);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let writes = 0;
    const port: SavePort = { list: () => base.list(), read: slot => base.read(slot), remove: slot => base.remove(slot),
      write: async (slot, env) => { writes++; if (writes === 1) await gate; await base.write(slot, env); } };
    const bridge1 = new GalNarrativeProfileBridge(p, port), bridge2 = new GalNarrativeProfileBridge(p, port);
    const first = bridge1.drain(w, 'story', 1);
    const second = bridge2.drain(w, 'story', 2);
    await Promise.resolve(); await Promise.resolve();
    const snapshot = w.snapshot(), order = w.snapshotOrder();
    w.restore(snapshot, order);
    release();
    expect(await first).toMatchObject({ status:'saved-pending-ack', reason:'stale-world' });
    expect((await second).status).toBe('ack-queued');
    expect(writes).toBe(2);
    expect((await loadGalProfile(base, p)).unlockedCgIds).toEqual(['cg']);
    ackTick(w); expect(readNarrativeEvents(w, 'story')).toEqual([]);
  });

  it('serializes two drains of different pending prefixes without losing the later read mark', async () => {
    const p = pkg(), w = makeWorld(p), base = new MemorySavePort(); action(w);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let writes = 0;
    const port: SavePort = { list: () => base.list(), read: slot => base.read(slot), remove: slot => base.remove(slot),
      write: async (slot, env) => { writes++; if (writes === 1) await gate; await base.write(slot, env); } };
    const firstBridge = new GalNarrativeProfileBridge(p, port),
      secondBridge = new GalNarrativeProfileBridge(p, { ...port }); // distinct wrapper, same backing store
    const first = firstBridge.drain(w, 'story', 1);
    await Promise.resolve();
    action(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('start')));
    const second = secondBridge.drain(w, 'story', 2);
    release();
    expect((await first).status).toBe('ack-queued');
    expect(await second).toMatchObject({ status:'saved-pending-ack', reason:'input-busy' });
    expect(writes).toBe(2);
    expect((await loadGalProfile(base, p)).readNodeIds).toEqual([storyRefKey(ref('start'))]);
    ackTick(w);
    expect((await secondBridge.drain(w, 'story', 3)).status).toBe('ack-queued');
    ackTick(w); expect(readNarrativeEvents(w, 'story')).toEqual([]);
  });

  it('isolates same IDs across packages and keeps Profile outside manual slots 12/13', async () => {
    const p = pkg('gal-a'), q = pkg('gal-b'), port = new MemorySavePort();
    const a = makeWorld(p), b = makeWorld(q); action(a); action(b);
    const bridgeA = new GalNarrativeProfileBridge(p, port), bridgeB = new GalNarrativeProfileBridge(q, port);
    expect((await bridgeA.drain(a, 'story', 1)).status).toBe('ack-queued');
    expect((await bridgeB.drain(b, 'story', 2)).status).toBe('ack-queued');
    expect((await loadGalProfile(port, p)).unlockedCgIds).toEqual(['cg']);
    expect((await loadGalProfile(port, q)).unlockedCgIds).toEqual(['cg']);
    const slots = new MemoryStoragePort(), controller = new GalManualSaveController(p, slots);
    ackTick(a);
    await controller.save(12, a); action(a, NARRATIVE_ADVANCE); await controller.save(13, a);
    await controller.load(12, a);
    expect((await loadGalProfile(port, p)).unlockedCgIds).toEqual(['cg']);
    expect((await loadGalProfile(port, q)).unlockedCgIds).toEqual(['cg']);
  });

  it('retains earlier unlocks after rollback and a different branch ending', async () => {
    const p = pkg(), w = makeWorld(p), port = new MemorySavePort(), bridge = new GalNarrativeProfileBridge(p, port);
    action(w); action(w, NARRATIVE_ADVANCE); action(w, NARRATIVE_CHOOSE, 'yes');
    expect((await bridge.drain(w, 'story', 1)).status).toBe('ack-queued');
    ackTick(w);
    expect((await loadGalProfile(port, p)).unlockedEndingIds).toEqual(['good']);
    action(w, NARRATIVE_BACK);
    expect(runtime(w).current).toEqual(ref('pick'));
    action(w, NARRATIVE_CHOOSE, 'no');
    expect((await bridge.drain(w, 'story', 2)).status).toBe('ack-queued');
    ackTick(w);
    const profile = await loadGalProfile(port, p);
    expect(profile.unlockedEndingIds).toEqual(['bad', 'good']);
    expect(profile.unlockedMemoryIds).toEqual(['memory']);
  });

  it('releases 256-event backpressure only after persistence and named ack', async () => {
    const p = pkg();
    const cg = p.media.cg as Record<string, unknown>;
    for (let i = 0; i < 254; i++) cg[`extra${i}`] = { image:`art:extra${i}`, title:L('额外'), unlock:{ kind:'reach-node', ref:ref('start') } };
    const w = makeWorld(p), port = new MemorySavePort(), bridge = new GalNarrativeProfileBridge(p, port);
    action(w);
    expect(readNarrativeEvents(w, 'story')).toHaveLength(256);
    action(w, NARRATIVE_ADVANCE);
    expect(runtime(w).lastReceipt?.reason).toBe('outbox-full');
    expect(runtime(w).current).toEqual(ref('start'));
    expect((await bridge.drain(w, 'story', 1)).status).toBe('ack-queued');
    expect(readNarrativeEvents(w, 'story')).toHaveLength(256);
    ackTick(w); expect(readNarrativeEvents(w, 'story')).toEqual([]);
    action(w, NARRATIVE_ADVANCE);
    expect(runtime(w).current).toEqual(ref('pick'));
  });

  it('replays the same named ack input into the same World hash', async () => {
    const run = async (): Promise<string> => {
      const p = pkg(), w = makeWorld(p), bridge = new GalNarrativeProfileBridge(p, new MemorySavePort());
      action(w);
      expect((await bridge.drain(w, 'story', 50)).status).toBe('ack-queued');
      ackTick(w);
      return hashSnapshot(w.snapshot());
    };
    expect(await run()).toBe(await run());
  });
});
