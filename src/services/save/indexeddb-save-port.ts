import type { SavePort, SaveEnvelope, SaveMeta } from './save-port.js';
import { IndexedDbKV, migrateLocalStorageOnce, type StorageLike } from '../storage/indexeddb-kv.js';

// IndexedDB 后端（M1）——契约/序列化口径照抄 LocalStorageSavePort（旧档字节原样迁入）。
// 与 storage 线共用同一个库/表（indexeddb-kv 单库单表），键命名空间 'env' 隔离——
// 历史上两条 localStorage 线共用 'apollo-save:' 前缀互踩索引的隐患，在 DB 侧不再复刻。
// write/remove 的「信封 + 索引」走单事务原子（localStorage 版的手工回滚退役）。
// 信封本体的 checksum/迁移链校验仍在 envelope.ts 的 seal/open 做（关注点分离·契约不变）。
export class IndexedDbSavePort implements SavePort {
  private readonly kv: IndexedDbKV;
  private readonly ns: string;
  private readonly lsPrefix: string;
  private readonly ls: StorageLike | null | undefined;
  private migrated: Promise<void> | null = null;

  constructor(opts: { kv?: IndexedDbKV; ns?: string; lsPrefix?: string; ls?: StorageLike | null } = {}) {
    this.kv = opts.kv ?? new IndexedDbKV();
    this.ns = opts.ns ?? 'env';
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
      // 只认领本线的 SaveEnvelope 形状（checksum/gameId/schema 顶层）；SaveGame（meta+snapshot）留给 storage 线迁
      claims: (v): boolean => {
        const o = v as { checksum?: unknown; gameId?: unknown; schema?: unknown } | null;
        return typeof o === 'object' && o !== null && typeof o.checksum === 'string' &&
          typeof o.gameId === 'string' && typeof o.schema === 'number';
      },
      metaOf: (slot, parsed): SaveMeta => {
        const e = parsed as SaveEnvelope;
        return { slot, schema: e.schema, gameId: e.gameId, savedAt: e.savedAt };
      },
    }).catch((e) => {
      console.warn('[indexeddb-save-port] localStorage 迁移未完成（将重试）：', e);
      if (this.migrated === p) this.migrated = null;
    });
    this.migrated = p;
    return p;
  }

  async list(): Promise<SaveMeta[]> {
    await this.ready();
    const raw = await this.kv.get(this.indexKey);
    if (raw === null) return [];
    try {
      const index = JSON.parse(raw) as SaveMeta[];
      return Array.isArray(index) ? index.sort((a, b) => b.savedAt - a.savedAt) : [];
    } catch {
      return []; // 索引损坏 → 当空（信封本体校验在 openEnvelope 的 checksum）
    }
  }

  async read(slot: string): Promise<SaveEnvelope | null> {
    await this.ready();
    const raw = await this.kv.get(this.key(slot));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as SaveEnvelope; // 坏 JSON → null；内容篡改由 openEnvelope checksum 抓
    } catch {
      return null;
    }
  }

  async write(slot: string, envelope: SaveEnvelope): Promise<void> {
    await this.ready();
    const index = (await this.list()).filter((m) => m.slot !== slot);
    index.push({ slot, schema: envelope.schema, gameId: envelope.gameId, savedAt: envelope.savedAt });
    // 信封 + 索引单事务原子：任一失败（含配额满）整体回滚，绝不脱节
    await this.kv.putMany([
      [this.key(slot), JSON.stringify(envelope)],
      [this.indexKey, JSON.stringify(index)],
    ]);
  }

  async remove(slot: string): Promise<void> {
    await this.ready();
    const index = (await this.list()).filter((m) => m.slot !== slot);
    await this.kv.putMany([[this.indexKey, JSON.stringify(index)]], [this.key(slot)]);
  }
}
