import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbKV, type StorageLike } from '../storage/indexeddb-kv.js';
import { IndexedDbStoragePort } from '../storage/indexeddb-storage.js';
import { IndexedDbSavePort } from './indexeddb-save-port.js';
import { sealEnvelope, openEnvelope, CorruptSaveError } from './envelope.js';
import type { SaveCodec, SaveEnvelope } from './save-port.js';

// M1 本地 DB · save 线（版本化信封向）。契约照抄 LocalStorageSavePort；checksum/迁移链仍归
// envelope.ts（此处验证经 DB 往返后 seal/open 链路原样成立——含篡改必被抓）。

const codec: SaveCodec = { gameId: 'test-game', schema: 2, migrations: { 1: (d) => ({ ...(d as object), v2: true }) } };
const freshKv = (): IndexedDbKV => new IndexedDbKV({ factory: new IDBFactory() });

class FakeLs implements StorageLike {
  private m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}

class FaultKV extends IndexedDbKV {
  fail = false;
  override putMany(entries: ReadonlyArray<readonly [string, string]>, deletes: ReadonlyArray<string> = []): Promise<void> {
    if (this.fail) return Promise.reject(new Error('QuotaExceededError（模拟配额满）'));
    return super.putMany(entries, deletes);
  }
}

describe('save · IndexedDbSavePort（信封向·契约照抄 localStorage 版）', () => {
  it('write→read 往返；覆写去重；list 按 savedAt 降序；remove 连索引', async () => {
    const port = new IndexedDbSavePort({ kv: freshKv(), ls: null });
    await port.write('a', sealEnvelope({ gold: 1 }, codec, 100));
    await port.write('b', sealEnvelope({ gold: 2 }, codec, 300));
    await port.write('a', sealEnvelope({ gold: 3 }, codec, 200));
    expect((await port.read('missing'))).toBeNull();
    expect((await port.list()).map((m) => m.slot)).toEqual(['b', 'a']); // savedAt 降序·a 去重
    const env = await port.read('a');
    expect(openEnvelope(env!, codec)).toEqual({ gold: 3 }); // 经 DB 往返 seal/open 成立
    await port.remove('a');
    expect(await port.read('a')).toBeNull();
    expect((await port.list()).map((m) => m.slot)).toEqual(['b']);
  });

  it('篡改必被抓：DB 里的信封 data 被改 → openEnvelope 抛 CorruptSaveError（checksum 链路经 DB 不减弱）', async () => {
    const kv = freshKv();
    const port = new IndexedDbSavePort({ kv, ls: null });
    await port.write('a', sealEnvelope({ gold: 7 }, codec, 100));
    const raw = (await kv.get('env:a'))!;
    await kv.put('env:a', raw.replace('"gold":7', '"gold":9999')); // 直改库
    const tampered = await port.read('a'); // 端口只管形状：读得回
    expect(() => openEnvelope(tampered!, codec)).toThrow(CorruptSaveError); // 校验层抓
  });

  it('坏 JSON → read null 不炸；配额满（注入）→ 报错不静默·老信封与索引原封', async () => {
    const kv = new FaultKV({ factory: new IDBFactory() });
    const port = new IndexedDbSavePort({ kv, ls: null });
    await port.write('a', sealEnvelope({ gold: 1 }, codec, 100));
    await kv.put('env:broken', '{oops');
    expect(await port.read('broken')).toBeNull();
    kv.fail = true;
    await expect(port.write('a', sealEnvelope({ gold: 2 }, codec, 200))).rejects.toThrow('配额满');
    kv.fail = false;
    expect(openEnvelope((await port.read('a'))!, codec)).toEqual({ gold: 1 });
    expect((await port.list()).find((m) => m.slot === 'a')?.savedAt).toBe(100);
  });

  it('迁移分工：同一 localStorage 前缀下两线各领各档（信封归 save 线·SaveGame 归 storage 线）', async () => {
    const ls = new FakeLs();
    const rawEnv = JSON.stringify(sealEnvelope({ gold: 5 }, codec, 500));
    const rawGame = JSON.stringify({ meta: { slot: 'w', tick: 1, hash: 'h', timestamp: 1 }, snapshot: { tick: 1 } });
    ls.setItem('apollo-save:mysave', rawEnv);
    ls.setItem('apollo-save:w', rawGame);
    const factory = new IDBFactory();
    const savePort = new IndexedDbSavePort({ kv: new IndexedDbKV({ factory }), ls });
    const storagePort = new IndexedDbStoragePort({ kv: new IndexedDbKV({ factory }), ls });
    expect(openEnvelope((await savePort.read('mysave'))!, codec)).toEqual({ gold: 5 }); // save 线领信封
    expect(await savePort.read('w')).toBeNull(); // SaveGame 不归它
    expect((await storagePort.load('w'))?.meta.tick).toBe(1); // storage 线领 SaveGame
    expect(await storagePort.load('mysave')).toBeNull();
    expect(ls.getItem('apollo-save:mysave')).toBeNull(); // 各自原键退役成备份
    expect(ls.getItem('apollo-save:__migrated__:mysave')).toBe(rawEnv);
    expect(ls.getItem('apollo-save:__migrated__:w')).toBe(rawGame);
  });

  it('旧 schema 档迁入后走既有迁移链升级（v1 信封 → openEnvelope 升到 v2）', async () => {
    const ls = new FakeLs();
    const v1codec: SaveCodec = { gameId: 'test-game', schema: 1 };
    const v1env = sealEnvelope({ gold: 8 }, v1codec, 50); // 旧版本存的档
    ls.setItem('apollo-save:old', JSON.stringify(v1env));
    const port = new IndexedDbSavePort({ kv: freshKv(), ls });
    const migrated = openEnvelope((await port.read('old'))! as SaveEnvelope, codec); // 用当前 v2 codec 开
    expect(migrated).toEqual({ gold: 8, v2: true }); // 迁移链在 DB 之上原样生效
  });
});
