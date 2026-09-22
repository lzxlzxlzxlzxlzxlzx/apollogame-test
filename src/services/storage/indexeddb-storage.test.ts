import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbKV, indexedDbAvailable, type StorageLike } from './indexeddb-kv.js';
import { IndexedDbStoragePort } from './indexeddb-storage.js';
import { MemoryStoragePort } from './memory-storage.js';
import { SteamCloudStoragePort } from './steam-cloud-storage.js';
import { createStoragePort } from './select-storage.js';
import type { SaveGame } from './storage-port.js';

// M1 本地 DB（图纸 docs/design/save-backend-design-2026-08.md）验收测试。
// 口径 = 大扫除坏路标准：坏档/索引坏/事务回滚/配额满(注入)/迁移往返 + 工厂优先级契约。
// 每测注入独立 new IDBFactory()（fake-indexeddb·真事务语义）→ 测试间零共享、node 环境即可跑。

const game = (slot: string, tick: number, ts: number): SaveGame => ({
  meta: { slot, tick, hash: 'h' + tick, timestamp: ts, label: 'L' + tick },
  snapshot: { tick, entities: [] } as unknown as SaveGame['snapshot'],
});

const freshKv = (): IndexedDbKV => new IndexedDbKV({ factory: new IDBFactory() });

/** Map 版 StorageLike——迁移测试注入，不碰真 localStorage。 */
class FakeLs implements StorageLike {
  private m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
  keys(): string[] { return [...this.m.keys()]; }
}

/** putMany 可开关注坏的 KV——配额满/事务失败的端口级注入面。 */
class FaultKV extends IndexedDbKV {
  fail = false;
  override putMany(entries: ReadonlyArray<readonly [string, string]>, deletes: ReadonlyArray<string> = []): Promise<void> {
    if (this.fail) return Promise.reject(new Error('QuotaExceededError（模拟配额满）'));
    return super.putMany(entries, deletes);
  }
}

describe('storage · IndexedDbKV（薄封装·真事务）', () => {
  it('put/get/delete/listKeys 往返；缺键 → null', async () => {
    const kv = freshKv();
    await kv.put('snap:a', '1');
    await kv.put('env:b', '2');
    expect(await kv.get('snap:a')).toBe('1');
    expect(await kv.get('snap:missing')).toBeNull();
    expect(await kv.listKeys('snap:')).toEqual(['snap:a']); // 前缀过滤·不见 env:
    await kv.delete('snap:a');
    expect(await kv.get('snap:a')).toBeNull();
  });

  it('事务回滚：putMany 批内一笔非法 → 整批回滚（先前合法笔也不落库）', async () => {
    const kv = freshKv();
    await kv.put('snap:keep', 'old');
    await expect(
      kv.putMany([
        ['snap:keep', 'new'],
        [{ bogus: true } as unknown as string, 'x'], // 非法键（对象非合法 IDB key）→ 同步抛 → 事务中止
      ]),
    ).rejects.toThrow();
    expect(await kv.get('snap:keep')).toBe('old'); // 同批合法写被回滚 → 原值仍在
  });

  it('indexedDbAvailable：真工厂 true·undefined false', () => {
    expect(indexedDbAvailable(new IDBFactory())).toBe(true);
    expect(indexedDbAvailable(undefined)).toBe(false);
  });
});

describe('storage · IndexedDbStoragePort（契约照抄 localStorage 版·真事务原子）', () => {
  it('save→load 往返；覆写去重；list 按 timestamp 降序；delete 连索引', async () => {
    const port = new IndexedDbStoragePort({ kv: freshKv(), ls: null });
    await port.save('a', game('a', 1, 100));
    await port.save('b', game('b', 2, 300));
    await port.save('a', game('a', 3, 200)); // 覆写 a
    expect((await port.load('a'))?.meta.tick).toBe(3);
    expect(await port.load('missing')).toBeNull();
    const list = await port.list();
    expect(list.map((m) => m.slot)).toEqual(['b', 'a']); // 300 > 200 降序·a 只一条
    await port.delete('a');
    expect((await port.list()).map((m) => m.slot)).toEqual(['b']);
    expect(await port.load('a')).toBeNull();
  });

  it('持久化：同库新端口实例读回上一实例的档', async () => {
    const factory = new IDBFactory();
    await new IndexedDbStoragePort({ kv: new IndexedDbKV({ factory }), ls: null }).save('p', game('p', 9, 900));
    const port2 = new IndexedDbStoragePort({ kv: new IndexedDbKV({ factory }), ls: null });
    expect((await port2.load('p'))?.meta.tick).toBe(9);
  });

  it('坏档：值被改成非法 JSON → load null 不炸；索引坏 → list [] 不炸', async () => {
    const kv = freshKv();
    const port = new IndexedDbStoragePort({ kv, ls: null });
    await port.save('a', game('a', 1, 100));
    await kv.put('snap:a', '{oops'); // DevTools 级破坏
    expect(await port.load('a')).toBeNull();
    await kv.put('snap:__index__', '[broken');
    expect(await port.list()).toEqual([]);
    await port.save('b', game('b', 2, 200)); // 端口继续可用
    expect((await port.list()).map((m) => m.slot)).toEqual(['b']);
  });

  it('配额满（注入 putMany 拒绝）：覆写失败 → 报错不静默·老档与索引原封不动（真事务无脱节）', async () => {
    const kv = new FaultKV({ factory: new IDBFactory() });
    const port = new IndexedDbStoragePort({ kv, ls: null });
    await port.save('a', game('a', 1, 100));
    kv.fail = true;
    await expect(port.save('a', game('a', 2, 200))).rejects.toThrow('配额满');
    kv.fail = false;
    expect((await port.load('a'))?.meta.tick).toBe(1); // 数据没被半写
    expect((await port.list()).find((m) => m.slot === 'a')?.tick).toBe(1); // 索引与数据一致
  });
});

describe('storage · localStorage → IndexedDB 一次性迁移', () => {
  const seed = (): { ls: FakeLs; rawS1: string } => {
    const ls = new FakeLs();
    const rawS1 = JSON.stringify(game('s1', 7, 700));
    ls.setItem('apollo-save:s1', rawS1); // 本线 SaveGame → 认领
    ls.setItem('apollo-save:g1', JSON.stringify({ schema: 1, gameId: 'g', savedAt: 5, checksum: 'c', data: {} })); // save 线信封 → 不动
    ls.setItem('apollo-save:corrupt', '{bad'); // 坏 JSON → 原地保留
    ls.setItem('apollo-save:__index__', JSON.stringify([{ slot: 's1', tick: 0, hash: 'stale', timestamp: 0 }])); // 共享索引 → 不信不搬
    return { ls, rawS1 };
  };

  it('往返：SaveGame 字节原样入库·索引从值重建·原键改只读备份键·他线/坏档/共享索引原地不动', async () => {
    const { ls, rawS1 } = seed();
    const kv = freshKv();
    const port = new IndexedDbStoragePort({ kv, ls });
    expect((await port.load('s1'))?.meta.tick).toBe(7); // 往返读回
    expect(await kv.get('snap:s1')).toBe(rawS1); // 字节原样
    expect((await port.list()).map((m) => m.slot)).toEqual(['s1']); // 索引重建（不搬 stale 共享索引）
    expect(ls.getItem('apollo-save:s1')).toBeNull(); // 原键退役
    expect(ls.getItem('apollo-save:__migrated__:s1')).toBe(rawS1); // 只读备份键
    expect(ls.getItem('apollo-save:g1')).not.toBeNull(); // 信封留给 save 线
    expect(ls.getItem('apollo-save:corrupt')).toBe('{bad'); // 坏档原地保留
    expect(ls.getItem('apollo-save:__index__')).not.toBeNull(); // 共享索引不动
  });

  it('只迁一次：旗标落库后 localStorage 再出现新档也不再搬', async () => {
    const { ls } = seed();
    const kv = freshKv();
    await new IndexedDbStoragePort({ kv, ls }).list(); // 首用触发迁移
    ls.setItem('apollo-save:late', JSON.stringify(game('late', 1, 1)));
    const port2 = new IndexedDbStoragePort({ kv, ls }); // 同库新端口
    expect(await port2.load('late')).toBeNull(); // 不重迁
    expect(ls.getItem('apollo-save:late')).not.toBeNull(); // 也不动它
  });

  it('DB 已有键优先：DB 里的新档不被 localStorage 旧档砸掉（原键仍转备份止分叉）', async () => {
    // 真实 interleave：旗标未落（如另一标签页迁移中/上次迁移事务被顶回）而本 DB 已有
    // save() 原子写入的「数据+索引」——迁移绝不能拿 localStorage 旧档砸它。
    const kv = freshKv();
    const newer = game('s1', 99, 9900);
    await kv.putMany([
      ['snap:s1', JSON.stringify(newer)],
      ['snap:__index__', JSON.stringify([newer.meta])],
    ]); // 与 save() 同形的原子写·旗标未落
    const { ls, rawS1 } = seed();
    const port = new IndexedDbStoragePort({ kv, ls }); // 带旧 localStorage 迁移
    expect((await port.load('s1'))?.meta.tick).toBe(99); // DB 胜
    const s1metas = (await port.list()).filter((m) => m.slot === 's1');
    expect(s1metas.map((m) => m.tick)).toEqual([99]); // 索引合并·已有条目优先·不重复
    expect(ls.getItem('apollo-save:s1')).toBeNull(); // 旧键仍退役
    expect(ls.getItem('apollo-save:__migrated__:s1')).toBe(rawS1); // 备份仍立
  });

  it('索引合并：DB 已有索引条目与迁入新条目并存（复查 S4 实证缺口回填·合并改覆写即红）', async () => {
    // 场景：旗标未落 + DB 已有 save() 同形原子写入的档 a + localStorage 只有新槽 b。
    // 迁移须把 b 并进已有索引而非覆写——否则 a 从 list() 消失（数据在库·索引失明）。
    const kv = freshKv();
    const a = game('a', 99, 9900);
    await kv.putMany([
      ['snap:a', JSON.stringify(a)],
      ['snap:__index__', JSON.stringify([a.meta])],
    ]);
    const ls = new FakeLs();
    ls.setItem('apollo-save:b', JSON.stringify(game('b', 7, 700)));
    const port = new IndexedDbStoragePort({ kv, ls });
    expect((await port.list()).map((m) => m.slot).sort()).toEqual(['a', 'b']); // 合并·a 不丢
    expect((await port.load('a'))?.meta.tick).toBe(99);
    expect((await port.load('b'))?.meta.tick).toBe(7);
  });

  it('迁移失败重试：迁移事务被顶回 → 原键原地不动·同端口下次操作重迁成功', async () => {
    const { ls, rawS1 } = seed();
    const kv = new FaultKV({ factory: new IDBFactory() });
    kv.fail = true;
    const port = new IndexedDbStoragePort({ kv, ls });
    expect(await port.list()).toEqual([]); // 首用迁移失败 → 端口不炸（本会话当空库用）
    expect(ls.getItem('apollo-save:s1')).toBe(rawS1); // 原键一根汗毛没动（失败绝不半迁）
    expect(ls.getItem('apollo-save:__migrated__:s1')).toBeNull();
    kv.fail = false;
    expect((await port.load('s1'))?.meta.tick).toBe(7); // 同一端口实例下次操作自动重迁
    expect(ls.getItem('apollo-save:__migrated__:s1')).toBe(rawS1);
  });
});

describe('storage · createStoragePort 工厂优先级（IndexedDB 腿）', () => {
  const g = globalThis as { indexedDB?: IDBFactory };

  it('无云无 mock、有 IndexedDB → IndexedDbStoragePort（③ 插在 localStorage 前）', () => {
    const prev = g.indexedDB;
    g.indexedDB = new IDBFactory();
    try {
      expect(createStoragePort(undefined, { mock: false })).toBeInstanceOf(IndexedDbStoragePort);
    } finally {
      if (prev === undefined) delete g.indexedDB; else g.indexedDB = prev;
    }
  });

  it('mock Steam 仍压过 IndexedDB（② > ③）', () => {
    const prev = g.indexedDB;
    g.indexedDB = new IDBFactory();
    try {
      expect(createStoragePort(undefined, { mock: true })).toBeInstanceOf(SteamCloudStoragePort);
    } finally {
      if (prev === undefined) delete g.indexedDB; else g.indexedDB = prev;
    }
  });

  it('无 IndexedDB、无 localStorage（node 素环境）→ MemoryStoragePort 兜底', () => {
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe('undefined'); // 前提自证
    expect(createStoragePort(undefined, { mock: false })).toBeInstanceOf(MemoryStoragePort);
  });
});
