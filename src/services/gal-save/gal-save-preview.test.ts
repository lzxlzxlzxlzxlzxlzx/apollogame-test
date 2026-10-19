import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { createStoryRuntime, narrativeDirectorCapability } from '@skills/tier3/narrative-director.js';
import { hashWithOrder } from '@net/determinism.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { createGalProfile } from '../gal-profile/gal-profile.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
import { buildGalUiReadModel } from '../gal-ui/gal-ui-read-model.js';
import { GalSliceHost } from '../gal-ui/gal-ui-slice-host.js';
import { buildGalSliceTree } from '../gal-ui/gal-ui-structure.js';
import { auditState } from '../gal-ui/gal-ui-slice-audit-fixture.js';
import { GalManualSaveController } from './gal-manual-save.js';
import { IndexedDbGalSavePreviewPort } from './gal-save-preview-indexeddb.js';
import { GalSavePreviewController, MemoryGalSavePreviewPort, parseGalPreviewRecord,
  type GalPreviewCaptureFrame, type GalPreviewImage, type GalPreviewRecord,
  type GalSavePreviewPort } from './gal-save-preview.js';

const L = (text: string) => ({ 'zh-CN': text });
function pkg(id = 'preview-book'): GalPackage { return {
  schemaVersion: 1, id, title: L(id), defaultLocale: 'zh-CN', locales: ['zh-CN'],
  entry: { chapterId: 'a', nodeId: 'start' }, ui: { template: 'gal-template' },
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
  characters: {}, scenes: {}, media: { backgrounds: {}, cg: {}, audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  endings: { done: { title: L('结束') } }, gallery: { memories: {}, music: {} },
  chapters: { a: { id: 'a', title: L('序章'), start: 'start', nodes: {
    start: { kind: 'line', text: L('开始'), next: { chapterId: 'a', nodeId: 'done' } },
    done: { kind: 'ending', ending: 'done', text: L('完成') },
  } } },
}; }
function world(p: GalPackage): World {
  const w = new World();
  for (const system of narrativeDirectorCapability.systems) w.addSystem(system);
  w.createEntity('story'); w.addComponent('story', { type: 'NarrativePackage', package: p });
  w.addComponent('story', createStoryRuntime(p));
  w.createEntity('input'); w.addComponent('input', { type: 'InputQueue', actions: [] });
  w.tick(); return w;
}
function advance(w: World): void {
  w.addComponent('input', { type: 'InputQueue', actions: [
    { source: 'test', phase: 'action', key: 'narrative.advance' },
  ] });
  w.tick(); w.addComponent('input', { type: 'InputQueue', actions: [] });
}
function crc(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii'), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(body.length); checksum.writeUInt32BE(crc(Buffer.concat([name, body])));
  return Buffer.concat([length, name, body, checksum]);
}
function image(): GalPreviewImage {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA, 8-bit.
  const data = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk('IEND', Buffer.alloc(0))]);
  return { mimeType: 'image/png', data: data.toString('base64'), width: 1, height: 1 };
}
function setup(id = 'preview-book', previews: GalSavePreviewPort = new MemoryGalSavePreviewPort()) {
  const p = pkg(id), storage = new MemoryStoragePort(), manual = new GalManualSaveController(p, storage);
  return { p, storage, manual, previews, sidecar: new GalSavePreviewController(p, manual, previews), w: world(p) };
}

describe('GAL-ENG-06B non-authoritative save preview sidecar', () => {
  it('keeps old/new slots valid without an image and attaches a bounded raster to the exact save hash', async () => {
    const { manual, sidecar, w, storage } = setup();
    expect(await sidecar.resolve(1)).toEqual({ status: 'missing' });
    const meta = await manual.save(1, w);
    expect(await sidecar.resolve(1)).toEqual({ status: 'missing' });
    const before = hashWithOrder(w.snapshot(), w.snapshotOrder());
    expect(await sidecar.write(1, meta.hash, image())).toBe('stored');
    const result = await sidecar.resolve(1, meta.hash);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.src).toBe(`data:image/png;base64,${image().data}`);
      expect(result.record).toMatchObject({ packageId: 'preview-book', slot: 1, saveHash: meta.hash });
    }
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(before);
    expect((await storage.load(manual.slot(1)))!.meta.hash).toBe(meta.hash);
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });

  it('projects one validated image into a 4×3 LayoutNode slot grid without granting extra progress', async () => {
    const { p, manual, sidecar, w } = setup();
    const meta = await manual.save(2, w);
    expect(await sidecar.write(2, meta.hash, image())).toBe('stored');
    const preview = await sidecar.resolve(2, meta.hash);
    const model = buildGalUiReadModel({ pkg: p,
      projection: w.getComponent('story', 'NarrativeProjection')!, profile: createGalProfile(p),
      locale: 'zh-CN', manualSlots: await manual.list(), page: 1, hasActiveResume: false,
      previews: new Map([[2, preview]]) });
    expect(model.manual.slots).toHaveLength(12);
    expect(model.manual).toMatchObject({ columns: 4, rows: 3, slotsPerPage: 12 });
    expect(model.manual.slots[0]).toMatchObject({ preview: 'empty', canLoad: false });
    expect(model.manual.slots[1]).toMatchObject({ preview: 'ready', canLoad: true });
    expect(model.manual.slots[1]?.previewSrc).toMatch(/^data:image\/png;base64,/);
    const tree = buildGalSliceTree(model, auditState('slots'));
    expect(validateLayoutNode(tree)).toEqual([]);
    expect(JSON.stringify(tree)).toContain('gal-slot-2-preview-image');
    expect(JSON.stringify(tree)).not.toContain('暂无真实存档预览');
    expect(model.home.canLoad).toBe(true);
    const forged = preview.status === 'ready' ? { ...preview,
      record: { ...preview.record, packageId: 'foreign' } } : preview;
    const safe = buildGalUiReadModel({ pkg: p, projection: w.getComponent('story', 'NarrativeProjection')!,
      profile: createGalProfile(p), locale: 'zh-CN', manualSlots: await manual.list(), page: 1,
      hasActiveResume: false, previews: new Map([[2, forged]]) });
    expect(safe.manual.slots[1]).toMatchObject({ preview: 'no-preview', canLoad: true });
  });

  it('refreshes the mounted slice through the injected sidecar without changing save authority', async () => {
    const { p, manual, w, storage, previews, sidecar } = setup();
    const host = await GalSliceHost.create(p, w, 'story', {
      profile: new MemorySavePort(), manual: storage, savePreview: previews, savedAt: () => 1000,
    });
    const meta = await manual.save(2, w);
    await sidecar.write(2, meta.hash, image());
    await host.refreshView();
    await host.dispatch('gal.home.load');
    for (let attempt = 0; attempt < 30 && host.view.manual.slots[1]?.preview !== 'ready'; attempt++)
      await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.view.manual.slots[1]).toMatchObject({ preview: 'ready', canLoad: true });
    expect(validateLayoutNode(host.tree)).toEqual([]);
    advance(w); await manual.save(2, w);
    await host.refreshView();
    for (let attempt = 0; attempt < 30 && host.view.manual.slots[1]?.preview !== 'no-preview'; attempt++)
      await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.view.manual.slots[1]).toMatchObject({ preview: 'no-preview', canLoad: true });
  });

  it('never waits for a hanging sidecar while refreshing or saving a valid slot', async () => {
    const { p, w, storage, manual } = setup('hung');
    const pending: GalSavePreviewPort = { read: async () => new Promise(() => {}),
      write: async () => {}, delete: async () => {} };
    const host = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savePreview: pending, savedAt: () => 1000 });
    await manual.save(2, w);
    await host.refreshView();
    await host.dispatch('gal.home.load');
    await host.refreshView(); // The test's own timeout catches accidental waits on the never-settling read.
    expect(host.view.manual.slots[1]).toMatchObject({ preview: 'no-preview', canLoad: true });
    await host.dispatch('gal.slot.mode', 'save');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    expect(host.uiState.confirm).toBe('overwrite');
    await host.dispatch('gal.confirm.accept');
    expect(await manual.load(2, w)).toMatchObject({ status: 'loaded' });
  });

  it('reads sidecars only for the visible 12-slot page', async () => {
    const { p, w, storage, manual } = setup('paged');
    const reads: number[] = [];
    const counted: GalSavePreviewPort = { read: async (_id, slot) => { reads.push(slot); return null; },
      write: async () => {}, delete: async () => {} };
    const host = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savePreview: counted, savedAt: () => 1000 });
    await manual.save(13, w); await host.refreshView();
    await host.dispatch('gal.home.load');
    expect(reads).toEqual([]);
    await host.dispatch('gal.slot.page', '2');
    for (let attempt = 0; attempt < 30 && reads.length === 0; attempt++)
      await new Promise(resolve => setTimeout(resolve, 0));
    expect(reads).toEqual([13]);
  });

  it('rejects corrupt, oversized, cross-type and mismatched-dimension images without touching authority', async () => {
    const { manual, sidecar, w, previews, p } = setup();
    const meta = await manual.save(1, w), good = image();
    const damaged = [
      { ...good, width: 2 }, { ...good, data: `${good.data.slice(0, -4)}AAAA` },
      { ...good, mimeType: 'image/svg+xml' }, { ...good, data: 'A'.repeat(400_000) },
    ];
    for (const candidate of damaged)
      expect(await sidecar.write(1, meta.hash, candidate as GalPreviewImage)).toBe('invalid-image');
    for (const body of [Buffer.alloc(0), Buffer.from([0])]) {
      const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', Buffer.from(good.data, 'base64').subarray(16, 29)),
        chunk('IDAT', body), chunk('IEND', Buffer.alloc(0))]);
      const broken = { ...good, data: bytes.toString('base64') };
      expect(await sidecar.write(1, meta.hash, broken)).toBe('invalid-image');
      await previews.write({ schemaVersion: 1, packageId: p.id, slot: 1, saveHash: meta.hash, image: broken });
      expect(await sidecar.resolve(1)).toEqual({ status: 'damaged' });
    }
    await previews.delete(p.id, 1);
    const headerOnly = Buffer.alloc(30);
    headerOnly.write('RIFF'); headerOnly.writeUInt32LE(22, 4);
    headerOnly.write('WEBP', 8); headerOnly.write('VP8X', 12);
    headerOnly.writeUInt32LE(10, 16);
    expect(await sidecar.write(1, meta.hash, { mimeType: 'image/webp',
      data: headerOnly.toString('base64'), width: 1, height: 1 })).toBe('invalid-image');
    expect(await sidecar.resolve(1)).toEqual({ status: 'missing' });
    const corrupt: GalPreviewRecord = { schemaVersion: 1, packageId: p.id, slot: 1, saveHash: meta.hash,
      image: { ...good, data: `${good.data.slice(0, -4)}AAAA` } };
    await previews.write(corrupt);
    expect(await sidecar.resolve(1)).toEqual({ status: 'damaged' });
    expect(parseGalPreviewRecord({ ...corrupt, extra: true })).toBeUndefined();
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });

  it('does not show an old preview after overwrite, delete, cross-package lookup or delayed write', async () => {
    const previews = new MemoryGalSavePreviewPort();
    const a = setup('a', previews), b = setup('b', previews);
    const first = await a.manual.save(2, a.w);
    expect(await a.sidecar.write(2, first.hash, image())).toBe('stored');
    expect((await a.sidecar.resolve(2)).status).toBe('ready');
    expect(await b.sidecar.resolve(2)).toEqual({ status: 'missing' });
    advance(a.w);
    const second = await a.manual.save(2, a.w);
    expect(second.hash).not.toBe(first.hash);
    expect(await a.sidecar.resolve(2, first.hash)).toEqual({ status: 'stale' });
    expect(await a.sidecar.resolve(2, second.hash)).toEqual({ status: 'stale' });
    expect(await a.sidecar.write(2, first.hash, image())).toBe('stale');
    expect(await a.sidecar.delete(2)).toBe('deleted');
    expect(await a.sidecar.resolve(2)).toEqual({ status: 'missing' });
    expect(await b.manual.save(2, b.w)).toBeDefined();
    expect(await b.sidecar.resolve(2)).toEqual({ status: 'missing' });
  });

  it('rechecks authority after a delayed sidecar read and refuses a stale result', async () => {
    const base = new MemoryGalSavePreviewPort();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed: GalSavePreviewPort = { read: async (packageId, slot) => {
      const captured = await base.read(packageId, slot); await gate; return captured;
    }, write: record => base.write(record), delete: (packageId, slot) => base.delete(packageId, slot) };
    const { manual, sidecar, w } = setup('race', delayed);
    const first = await manual.save(1, w);
    expect(await sidecar.write(1, first.hash, image())).toBe('stored');
    const pending = sidecar.resolve(1, first.hash);
    advance(w);
    await manual.save(1, w); release();
    expect(await pending).toEqual({ status: 'stale' });
  });

  it('degrades sidecar read/write/delete failures while authority save/load/delete still works', async () => {
    const failing: GalSavePreviewPort = {
      read: async () => { throw new Error('preview offline'); },
      write: async () => { throw new Error('preview offline'); },
      delete: async () => { throw new Error('preview offline'); },
    };
    const { manual, sidecar, w } = setup('failure', failing);
    const meta = await manual.save(1, w);
    expect(await sidecar.write(1, meta.hash, image())).toBe('unavailable');
    expect(await sidecar.resolve(1)).toEqual({ status: 'unavailable' });
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
    expect(await sidecar.delete(1)).toBe('sidecar-failed');
    expect(await manual.load(1, w)).toEqual({ status: 'empty' });
  });

  it('treats throwing sidecar accessors as damaged without blocking valid authority', async () => {
    const malicious: GalSavePreviewPort = { read: async () => ({ schemaVersion: 1,
      packageId: 'malicious', slot: 1, saveHash: '12345678',
      get image() { throw new Error('bad sidecar getter'); } }),
    write: async () => {}, delete: async () => {} };
    const { manual, sidecar, w } = setup('malicious', malicious);
    await manual.save(1, w);
    expect(await sidecar.resolve(1)).toEqual({ status: 'damaged' });
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });

  it('never reads sidecar bytes for a corrupt authoritative save', async () => {
    const base = new MemoryGalSavePreviewPort(); let reads = 0;
    const monitored: GalSavePreviewPort = {
      read: async (id, slot) => { reads++; return base.read(id, slot); },
      write: record => base.write(record), delete: (id, slot) => base.delete(id, slot),
    };
    const { manual, sidecar, w, storage } = setup('bad-save', monitored);
    const meta = await manual.save(1, w);
    const saved = (await storage.load(manual.slot(1)))!;
    saved.meta.hash = 'ffffffff'; await storage.save(manual.slot(1), saved);
    expect(await sidecar.resolve(1)).toEqual({ status: 'invalid-save' });
    expect(reads).toBe(0);
    expect(await sidecar.write(1, meta.hash, image())).toBe('invalid-save');
    await expect(manual.load(1, w)).rejects.toThrow();
  });
});

describe('GAL-ENG-06D IndexedDB preview adapter with in-memory string KV', () => {
  function adapter() {
    const data = new Map<string, string>();
    const kv = {
      get: async (key: string) => data.get(key) ?? null,
      put: async (key: string, value: string) => { data.set(key, value); },
      delete: async (key: string) => { data.delete(key); },
    };
    return { data, port: new IndexedDbGalSavePreviewPort(kv) };
  }

  it('isolates packages and slots in a sidecar-only namespace, and survives overwrite/delete', async () => {
    const { data, port } = adapter();
    const a = setup('book:a', port), b = setup('book:b', port);
    const first = await a.manual.save(2, a.w);
    expect(await a.sidecar.write(2, first.hash, image())).toBe('stored');
    expect((await a.sidecar.resolve(2)).status).toBe('ready');
    expect(await b.sidecar.resolve(2)).toEqual({ status: 'missing' });
    expect([...data.keys()]).toEqual(['gal-preview:v1:["book:a",2]']);
    expect([...data.keys()].every(key => !key.startsWith('snap:') && !key.startsWith('env:'))).toBe(true);

    advance(a.w);
    const second = await a.manual.save(2, a.w);
    expect(await a.sidecar.resolve(2, second.hash)).toEqual({ status: 'stale' });
    expect(await a.sidecar.write(2, first.hash, image())).toBe('stale');
    expect(await a.sidecar.write(2, second.hash, image())).toBe('stored');
    expect((await a.sidecar.resolve(2, second.hash)).status).toBe('ready');
    expect(data.size).toBe(1);
    expect(await a.sidecar.delete(2)).toBe('deleted');
    expect(data.size).toBe(0);
    expect(await a.manual.load(2, a.w)).toEqual({ status: 'empty' });
  });

  it('reports damaged oversized/invalid JSON and rejects bad writes without touching authority', async () => {
    const { data, port } = adapter();
    const { manual, sidecar, w } = setup('damage', port);
    const meta = await manual.save(1, w);
    expect(await port.read('damage', 1)).toBeNull();
    const sidecarKey = 'gal-preview:v1:["damage",1]';
    data.set(sidecarKey, '{bad json');
    expect(await sidecar.resolve(1)).toEqual({ status: 'damaged' });
    data.set(sidecarKey, JSON.stringify({ oversized: 'x'.repeat(360_001) }));
    expect(await port.read('damage', 1)).toEqual({});
    expect(await sidecar.resolve(1)).toEqual({ status: 'damaged' });
    await expect(port.write({ schemaVersion: 1, packageId: 'damage', slot: 1,
      saveHash: meta.hash, image: { ...image(), width: 2 } })).rejects.toThrow('无效');
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });

  it('lets the controller downgrade unavailable KV operations while keeping valid saves', async () => {
    const unavailable = new IndexedDbGalSavePreviewPort({
      get: async () => { throw new Error('offline'); },
      put: async () => { throw new Error('offline'); },
      delete: async () => { throw new Error('offline'); },
    });
    const { manual, sidecar, w } = setup('offline', unavailable);
    const meta = await manual.save(1, w);
    expect(await sidecar.resolve(1)).toEqual({ status: 'unavailable' });
    expect(await sidecar.write(1, meta.hash, image())).toBe('unavailable');
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });
});

describe('GAL-ENG-06E explicit host capture after authoritative save', () => {
  async function commit(host: GalSliceHost, number = 1): Promise<void> {
    await host.dispatch('gal.slot.select', String(number));
    await host.dispatch('gal.slot.commit');
    await host.dispatch('gal.confirm.accept');
  }

  it('returns save feedback without awaiting capture, then binds the image to the saved hash', async () => {
    const { p, w, storage, manual, previews, sidecar } = setup('capture-book');
    let release!: (value: GalPreviewImage) => void;
    const gate = new Promise<GalPreviewImage>(resolve => { release = resolve; });
    const frames: GalPreviewCaptureFrame[] = [];
    let wrote!: () => void;
    const writeDone = new Promise<void>(resolve => { wrote = resolve; });
    const tracked: GalSavePreviewPort = { read: (id, slot) => previews.read(id, slot),
      write: async record => { await previews.write(record); wrote(); },
      delete: (id, slot) => previews.delete(id, slot) };
    const host = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savePreview: tracked, savedAt: () => 1000,
      previewCapture: { capture: frame => { frames.push(frame); return gate; } } });
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.save');
    await commit(host);
    expect(host.uiState.feedback).toContain('已保存至 NO. 1');
    expect(frames).toMatchObject([{ packageId: 'capture-book', refKey: '["a","start"]',
      speaker: null, text: '开始' }]);
    const meta = await manual.inspect(1);
    expect(meta).not.toBeNull();
    expect(await sidecar.resolve(1)).toEqual({ status: 'missing' });
    release(image());
    await writeDone;
    const result = await sidecar.resolve(1);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.record.saveHash).toBe(meta!.hash);
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });

  it('rejects an old late capture after a newer overwrite without changing save authority', async () => {
    const { p, w, storage, manual, previews, sidecar } = setup('late-capture');
    let releaseOld!: (value: GalPreviewImage) => void;
    const oldGate = new Promise<GalPreviewImage>(resolve => { releaseOld = resolve; });
    let captures = 0;
    let wrote!: () => void;
    const writeDone = new Promise<void>(resolve => { wrote = resolve; });
    const tracked: GalSavePreviewPort = { read: (id, slot) => previews.read(id, slot),
      write: async record => { await previews.write(record); wrote(); },
      delete: (id, slot) => previews.delete(id, slot) };
    const host = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savePreview: tracked, savedAt: () => 1000,
      previewCapture: { capture: () => ++captures === 1 ? oldGate : Promise.resolve(image()) } });
    await host.dispatch('gal.home.start'); await host.dispatch('gal.story.save');
    await commit(host);
    const first = (await manual.inspect(1))!;
    advance(w);
    await commit(host);
    const second = (await manual.inspect(1))!;
    expect(second.hash).not.toBe(first.hash);
    await writeDone;
    let result = await sidecar.resolve(1);
    expect(result.status).toBe('ready');
    releaseOld(image());
    for (let attempt = 0; attempt < 20; attempt++) await Promise.resolve();
    result = await sidecar.resolve(1);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.record.saveHash).toBe(second.hash);
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });

  it('serializes delayed old sidecar I/O so it cannot overwrite a newer capture', async () => {
    const p = pkg('delayed-write'), w = world(p), storage = new MemoryStoragePort();
    const manual = new GalManualSaveController(p, storage);
    const base = new MemoryGalSavePreviewPort();
    let signalFirst!: () => void, releaseFirst!: () => void, signalSecond!: () => void;
    const firstStarted = new Promise<void>(resolve => { signalFirst = resolve; });
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const secondFinished = new Promise<void>(resolve => { signalSecond = resolve; });
    let writes = 0;
    const delayed: GalSavePreviewPort = {
      read: (id, slot) => base.read(id, slot),
      write: async record => {
        const order = ++writes;
        if (order === 1) { signalFirst(); await firstGate; }
        await base.write(record);
        if (order === 2) signalSecond();
      },
      delete: (id, slot) => base.delete(id, slot),
    };
    const sidecar = new GalSavePreviewController(p, manual, delayed);
    const host = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savePreview: delayed, savedAt: () => 1000,
      previewCapture: { capture: async () => image() } });
    await host.dispatch('gal.home.start'); await host.dispatch('gal.story.save');
    await commit(host); await firstStarted;
    const first = (await manual.inspect(1))!;
    advance(w); await commit(host);
    const second = (await manual.inspect(1))!;
    expect(second.hash).not.toBe(first.hash);
    for (let attempt = 0; attempt < 20; attempt++)
      await new Promise<void>(resolve => setImmediate(resolve));
    expect((await sidecar.resolve(1, second.hash)).status).toBe('missing');
    expect(writes).toBe(1);
    releaseFirst(); await secondFinished;
    const result = await sidecar.resolve(1, second.hash);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.record.saveHash).toBe(second.hash);
    expect(await manual.load(1, w)).toMatchObject({ status: 'loaded' });
  });

  it('protects direct controller callers from a delayed old write racing a newer hash', async () => {
    const { p, w, storage, manual } = setup('direct-write-race');
    const base = new MemoryGalSavePreviewPort();
    let signalFirst!: () => void, releaseFirst!: () => void;
    const firstStarted = new Promise<void>(resolve => { signalFirst = resolve; });
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    let writes = 0;
    const port: GalSavePreviewPort = {
      read: (id, slot) => base.read(id, slot),
      write: async record => {
        if (++writes === 1) { signalFirst(); await firstGate; }
        await base.write(record);
      },
      delete: (id, slot) => base.delete(id, slot),
    };
    const sidecar = new GalSavePreviewController(p, manual, port);
    const first = await manual.save(1, w);
    const oldWrite = sidecar.write(1, first.hash, image());
    await firstStarted;
    advance(w);
    const second = await manual.save(1, w);
    const newWrite = sidecar.write(1, second.hash, image());
    for (let attempt = 0; attempt < 20; attempt++)
      await new Promise<void>(resolve => setImmediate(resolve));
    expect((await sidecar.resolve(1, second.hash)).status).toBe('missing');
    expect(writes).toBe(1);
    releaseFirst();
    expect(await oldWrite).toBe('stale');
    expect(await newWrite).toBe('stored');
    const result = await sidecar.resolve(1, second.hash);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.record.saveHash).toBe(second.hash);
    expect((await storage.load(manual.slot(1)))?.meta.hash).toBe(second.hash);
  });

  it('keeps capture optional and lets rejection or invalid image degrade to no preview', async () => {
    const { p, w, storage, manual, previews, sidecar } = setup('capture-failure');
    let calls = 0;
    const noSidecar = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savedAt: () => 1000,
      previewCapture: { capture: async () => { calls++; return image(); } } });
    await noSidecar.dispatch('gal.home.start'); await noSidecar.dispatch('gal.story.save');
    await commit(noSidecar);
    expect(calls).toBe(0);
    const failed = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savePreview: previews, savedAt: () => 1000,
      previewCapture: { capture: async () => { throw new Error('capture unavailable'); } } });
    await failed.dispatch('gal.story.save'); await commit(failed, 2);
    expect(await sidecar.resolve(2)).toEqual({ status: 'missing' });
    const bad = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
      manual: storage, savePreview: previews, savedAt: () => 1000,
      previewCapture: { capture: async () => ({ ...image(), width: 2 }) } });
    await bad.dispatch('gal.story.save'); await commit(bad, 3);
    expect(await sidecar.resolve(3)).toEqual({ status: 'missing' });
    expect(await manual.load(3, w)).toMatchObject({ status: 'loaded' });
  });
});

describe('GAL-ENG-06G same-realm multi-controller preview ordering', () => {
  it('orders old and new writes across controller and adapter instances sharing one backing store', async () => {
    const { p, w, manual, storage } = setup('multi-controller');
    const base = new MemoryGalSavePreviewPort();
    let signalOld!: () => void, releaseOld!: () => void;
    const oldStarted = new Promise<void>(resolve => { signalOld = resolve; });
    const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
    let writes = 0;
    const wrapper = (): GalSavePreviewPort => ({
      read: (id, slot) => base.read(id, slot),
      write: async record => {
        if (++writes === 1) { signalOld(); await oldGate; }
        await base.write(record);
      },
      delete: (id, slot) => base.delete(id, slot),
    });
    const older = new GalSavePreviewController(p, manual, wrapper());
    const newer = new GalSavePreviewController(p, manual, wrapper());
    const first = await manual.save(1, w);
    const oldWrite = older.write(1, first.hash, image());
    await oldStarted;
    advance(w);
    const second = await manual.save(1, w);
    expect(second.hash).not.toBe(first.hash);
    const newWrite = newer.write(1, second.hash, image());
    try {
      for (let attempt = 0; attempt < 10; attempt++) await new Promise<void>(resolve => setImmediate(resolve));
      expect(writes).toBe(1); // the second controller must not enter its adapter yet
      expect((await newer.resolve(1, second.hash)).status).toBe('missing');
    } finally { releaseOld(); }
    expect(await oldWrite).toBe('stale');
    expect(await newWrite).toBe('stored');
    const result = await newer.resolve(1, second.hash);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.record.saveHash).toBe(second.hash);
    expect((await storage.load(manual.slot(1)))?.meta.hash).toBe(second.hash);
  });

  it('does not lock an unrelated slot while an older slot write is pending', async () => {
    const { p, w, manual } = setup('separate-slots');
    const base = new MemoryGalSavePreviewPort();
    let signal!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { signal = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const port: GalSavePreviewPort = {
      read: (id, slot) => base.read(id, slot),
      write: async record => { if (record.slot === 1) { signal(); await gate; } await base.write(record); },
      delete: (id, slot) => base.delete(id, slot),
    };
    const first = new GalSavePreviewController(p, manual, port);
    const second = new GalSavePreviewController(p, manual, port);
    const firstMeta = await manual.save(1, w), secondMeta = await manual.save(2, w);
    const pending = first.write(1, firstMeta.hash, image());
    await started;
    try {
      expect(await second.write(2, secondMeta.hash, image())).toBe('stored');
      expect((await second.resolve(2)).status).toBe('ready');
    } finally { release(); }
    expect(await pending).toBe('stored');
  });

  it('releases a rejected sidecar operation for a later controller', async () => {
    const { p, w, manual } = setup('failed-then-retry');
    const base = new MemoryGalSavePreviewPort();
    const broken = new GalSavePreviewController(p, manual, {
      read: (id, slot) => base.read(id, slot),
      write: async () => { throw new Error('offline'); },
      delete: (id, slot) => base.delete(id, slot),
    });
    const retry = new GalSavePreviewController(p, manual, base);
    const meta = await manual.save(1, w);
    expect(await broken.write(1, meta.hash, image())).toBe('unavailable');
    expect(await retry.write(1, meta.hash, image())).toBe('stored');
    expect((await retry.resolve(1)).status).toBe('ready');
  });

  it('orders delayed delete before a new write so cleanup cannot erase the new preview', async () => {
    const { p, w, manual, storage } = setup('delete-write-race');
    const base = new MemoryGalSavePreviewPort();
    let signalDelete!: () => void, releaseDelete!: () => void;
    const deleteStarted = new Promise<void>(resolve => { signalDelete = resolve; });
    const deleteGate = new Promise<void>(resolve => { releaseDelete = resolve; });
    const oldPort: GalSavePreviewPort = {
      read: (id, slot) => base.read(id, slot), write: record => base.write(record),
      delete: async (id, slot) => { signalDelete(); await deleteGate; await base.delete(id, slot); },
    };
    const oldController = new GalSavePreviewController(p, manual, oldPort);
    const newController = new GalSavePreviewController(p, manual, base);
    const first = await manual.save(1, w);
    expect(await oldController.write(1, first.hash, image())).toBe('stored');
    const deleting = oldController.delete(1);
    await deleteStarted;
    advance(w);
    const second = await manual.save(1, w);
    expect(second.hash).not.toBe(first.hash);
    const newer = newController.write(1, second.hash, image());
    try {
      for (let attempt = 0; attempt < 10; attempt++) await new Promise<void>(resolve => setImmediate(resolve));
      expect((await newController.resolve(1, second.hash)).status).toBe('stale');
    } finally { releaseDelete(); }
    expect(await deleting).toBe('deleted');
    expect(await newer).toBe('stored');
    const result = await newController.resolve(1, second.hash);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.record.saveHash).toBe(second.hash);
    expect((await storage.load(manual.slot(1)))?.meta.hash).toBe(second.hash);
  });

  it('skips queued cleanup if a newer authoritative save occupies the slot', async () => {
    const { p, w, manual } = setup('delete-waits-for-write');
    const base = new MemoryGalSavePreviewPort();
    let signalWrite!: () => void, releaseWrite!: () => void;
    const writeStarted = new Promise<void>(resolve => { signalWrite = resolve; });
    const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
    let deletes = 0;
    const port: GalSavePreviewPort = {
      read: (id, slot) => base.read(id, slot),
      write: async record => { signalWrite(); await writeGate; await base.write(record); },
      delete: async (id, slot) => { deletes++; await base.delete(id, slot); },
    };
    const oldController = new GalSavePreviewController(p, manual, port);
    const cleanupController = new GalSavePreviewController(p, manual, port);
    const first = await manual.save(1, w);
    const oldWrite = oldController.write(1, first.hash, image());
    await writeStarted;
    const deleting = cleanupController.delete(1);
    for (let attempt = 0; attempt < 10 && await manual.inspect(1); attempt++)
      await new Promise<void>(resolve => setImmediate(resolve));
    expect(await manual.inspect(1)).toBeNull();
    advance(w);
    const second = await manual.save(1, w);
    try {
      for (let attempt = 0; attempt < 10; attempt++) await new Promise<void>(resolve => setImmediate(resolve));
      expect(deletes).toBe(0);
    } finally { releaseWrite(); }
    expect(await oldWrite).toBe('stale');
    expect(await deleting).toBe('deleted');
    expect(deletes).toBe(0);
    expect(await cleanupController.write(1, second.hash, image())).toBe('stored');
    expect((await cleanupController.resolve(1, second.hash)).status).toBe('ready');
  });
});
