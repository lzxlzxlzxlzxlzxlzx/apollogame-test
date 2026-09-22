import type { StoragePort, SaveGame, SaveMeta } from './storage-port.js';
import { IndexedDbKV, migrateLocalStorageOnce, type StorageLike } from './indexeddb-kv.js';

// IndexedDB 存储后端（M1）——契约/序列化口径照抄 LocalStorageStoragePort（旧档字节原样迁入），
// 差别只有两处，都是 IndexedDB 该带来的：
//   ① 真事务：save/delete 的「数据 + 索引」单事务原子落库（localStorage 版的手工回滚退役）；
//   ② 容量：异步 API·配额以百 MB 计（收集养成长档不再顶 5MB 天花板）。
// 首次使用自动把 localStorage 旧档一次性迁入（只认领 SaveGame 形状·见 indexeddb-kv 迁移助手）。
export class IndexedDbStoragePort implements StoragePort {
  private readonly kv: IndexedDbKV;
  private readonly ns: string;
  private readonly lsPrefix: string;
  private readonly ls: StorageLike | null | undefined;
  private migrated: Promise<void> | null = null;

  constructor(opts: { kv?: IndexedDbKV; ns?: string; lsPrefix?: string; ls?: StorageLike | null } = {}) {
    this.kv = opts.kv ?? new IndexedDbKV();
    this.ns = opts.ns ?? 'snap';
    this.lsPrefix = opts.lsPrefix ?? 'apollo-save:';
    this.ls = opts.ls;
  }

  private key(slot: string): string {
    return `${this.ns}:${slot}`;
  }
  private get indexKey(): string {
    return `${this.ns}:__index__`;
  }

  private ready(): Promise<void> {
    if (this.migrated) return this.migrated;
    const p: Promise<void> = migrateLocalStorageOnce({
      kv: this.kv,
      ns: this.ns,
      lsPrefix: this.lsPrefix,
      ls: this.ls,
      // 只认领本线的 SaveGame 形状（meta+snapshot）；SaveEnvelope（checksum/gameId 顶层）留给 save 线迁
      claims: (v): boolean => {
        const o = v as { meta?: unknown; snapshot?: unknown } | null;
        return typeof o === 'object' && o !== null && typeof o.meta === 'object' && o.meta !== null &&
          typeof o.snapshot === 'object' && o.snapshot !== null;
      },
      metaOf: (_slot, parsed) => (parsed as SaveGame).meta,
    }).catch((e) => {
      // 迁移失败（如迁移事务被配额顶回）→ 本次会话端口照常可用（旧档仍安然在 localStorage）·
      // 旗标未落 → 置空缓存，下次调用/启动重试
      console.warn('[indexeddb-storage] localStorage 迁移未完成（将重试）：', e);
      if (this.migrated === p) this.migrated = null;
    });
    this.migrated = p;
    return p;
  }

  async save(slot: string, data: SaveGame): Promise<void> {
    await this.ready();
    const index = (await this.list()).filter((m) => m.slot !== slot);
    index.push(data.meta);
    // 数据 + 索引单事务原子：任一失败（含配额满）整体回滚，绝不脱节
    await this.kv.putMany([
      [this.key(slot), JSON.stringify(data)],
      [this.indexKey, JSON.stringify(index)],
    ]);
  }

  async load(slot: string): Promise<SaveGame | null> {
    await this.ready();
    const raw = await this.kv.get(this.key(slot));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as SaveGame; // 坏 JSON → null（同 localStorage 版：不炸存档界面）
    } catch {
      return null;
    }
  }

  async list(): Promise<SaveMeta[]> {
    await this.ready();
    const raw = await this.kv.get(this.indexKey);
    if (raw === null) return [];
    try {
      const index = JSON.parse(raw) as SaveMeta[];
      return Array.isArray(index) ? index.sort((a, b) => b.timestamp - a.timestamp) : [];
    } catch {
      return []; // 索引损坏 → 当空
    }
  }

  async delete(slot: string): Promise<void> {
    await this.ready();
    const index = (await this.list()).filter((m) => m.slot !== slot);
    await this.kv.putMany([[this.indexKey, JSON.stringify(index)]], [this.key(slot)]);
  }
}
