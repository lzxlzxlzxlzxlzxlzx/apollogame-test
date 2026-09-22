// ═══════════════════════════════════════════════════════════════
//  IndexedDbKV —— 浏览器本地 DB 的薄封装（M1·docs/design/save-backend-design-2026-08.md）。
//  基础设施：副作用 IO，在确定性 sim 之外（同 StoragePort/SavePort 哲学）。
//  单库单表：库 `apollo-db` · 表 `kv` · 键 = `{ns}:{slot}` 字符串 · 值 = JSON 字符串
//  （序列化口径与 localStorage 端口完全一致 → 旧档可按字节原样迁入）。
//  putMany = 单事务原子多写/多删——localStorage 版的「手工回滚」在这里由真事务替代：
//  任一请求失败（含配额满）整个事务回滚，数据/索引永不脱节。
// ═══════════════════════════════════════════════════════════════

export interface IndexedDbKVOptions {
  dbName?: string; // 默认 'apollo-db'
  storeName?: string; // 默认 'kv'
  factory?: IDBFactory; // 测试注入（fake-indexeddb 的 new IDBFactory()）；缺省 globalThis.indexedDB
}

const DB_VERSION = 1;

/** 环境里有没有可用的 IndexedDB（select-storage 的同步探测用）。 */
export function indexedDbAvailable(
  factory: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB,
): boolean {
  return typeof factory !== 'undefined' && factory !== null && typeof factory.open === 'function';
}

function requestDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'));
  });
}

export class IndexedDbKV {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly factory: IDBFactory | undefined;
  private dbP: Promise<IDBDatabase> | null = null;

  constructor(opts: IndexedDbKVOptions = {}) {
    this.dbName = opts.dbName ?? 'apollo-db';
    this.storeName = opts.storeName ?? 'kv';
    this.factory = opts.factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  }

  private ensure(): Promise<IDBDatabase> {
    if (this.dbP) return this.dbP;
    const f = this.factory;
    if (!indexedDbAvailable(f)) return Promise.reject(new Error('IndexedDB 不可用（headless/隐私模式）'));
    const open = new Promise<IDBDatabase>((resolve, reject) => {
      const req = f!.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open 失败'));
    });
    // 打开失败清缓存允许下次重试（如隐私模式转常规后恢复）
    this.dbP = open.catch((e) => {
      this.dbP = null;
      throw e;
    });
    return this.dbP;
  }

  async get(key: string): Promise<string | null> {
    const db = await this.ensure();
    const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);
    const v = await requestDone(store.get(key));
    return typeof v === 'string' ? v : null;
  }

  /** 单事务原子批写 + 批删：任一失败整体回滚（数据/索引永不脱节的地基）。 */
  async putMany(
    entries: ReadonlyArray<readonly [string, string]>,
    deletes: ReadonlyArray<string> = [],
  ): Promise<void> {
    const db = await this.ensure();
    const tx = db.transaction(this.storeName, 'readwrite');
    const done = txDone(tx);
    try {
      const store = tx.objectStore(this.storeName);
      for (const [k, v] of entries) store.put(v, k);
      for (const k of deletes) store.delete(k);
    } catch (e) {
      // ⚠ 规范坑（本测试撞出）：put() 的**同步**异常（非法键等）不会自动中止事务——
      // 不显式 abort 的话批内先前的合法写照样提交=「原子」变假。异步失败（真配额满）才自动中止。
      try {
        tx.abort();
      } catch { /* 事务已完结则 abort 抛 InvalidStateError·忽略 */ }
      await done.catch(() => undefined);
      throw e;
    }
    await done;
  }

  put(key: string, value: string): Promise<void> {
    return this.putMany([[key, value]]);
  }

  delete(key: string): Promise<void> {
    return this.putMany([], [key]);
  }

  /** 列出全部键（前缀过滤在 JS 侧做——单表小数据量·省掉 IDBKeyRange 全局依赖）。 */
  async listKeys(prefix: string): Promise<string[]> {
    const db = await this.ensure();
    const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);
    const keys = await requestDone(store.getAllKeys());
    return keys.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));
  }

  async close(): Promise<void> {
    if (!this.dbP) return;
    const db = await this.dbP.catch(() => null);
    db?.close();
    this.dbP = null;
  }
}

// ── localStorage → IndexedDB 一次性迁移（两个端口共用的助手）─────────────────
//
// 口径（图纸 M1）：首次使用把 localStorage 里本端口认领的存档按**原始字符串字节原样**搬进 DB，
// 索引不信共享的 `__index__`（两条 localStorage 端口线历史上共用 'apollo-save:' 前缀，索引互踩），
// 而是从搬入的值重建；搬完把原键改名为只读备份键 `{lsPrefix}__migrated__:{slot}`（防新旧双写分叉）。
// 整批入库走单事务（含完成旗标）：中途失败 = 旗标不落 = 下次启动重试，绝不半迁移。

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // 部分隐私模式访问即抛
  }
}

export const MIGRATED_FLAG_SLOT = '__migrated__';

export async function migrateLocalStorageOnce(opts: {
  kv: IndexedDbKV;
  ns: string; // 本端口的 DB 键命名空间（如 'snap' / 'env'）
  lsPrefix: string; // localStorage 侧前缀（历史口径 'apollo-save:'）
  /** 值形状认领判定——只搬本端口的档，别的端口的值原地不动（历史前缀共用所致）。 */
  claims: (parsed: unknown) => boolean;
  /** 从搬入值重建索引条目（形状 = 该端口 list() 的元素）。 */
  metaOf: (slot: string, parsed: unknown) => unknown;
  ls?: StorageLike | null; // 测试注入；缺省真 localStorage
}): Promise<void> {
  const { kv, ns, lsPrefix } = opts;
  const flagKey = `${ns}:${MIGRATED_FLAG_SLOT}`;
  if ((await kv.get(flagKey)) !== null) return; // 已迁移过
  const ls = opts.ls === undefined ? defaultLocalStorage() : opts.ls;
  const indexLsKey = `${lsPrefix}__index__`;
  const backupPrefix = `${lsPrefix}${MIGRATED_FLAG_SLOT}:`;
  // DB 已有键优先（防「首迁失败→玩家已在 DB 新存→次迁成功」拿 localStorage 旧档砸新档）
  const existing = new Set(await kv.listKeys(`${ns}:`));
  const entries: Array<readonly [string, string]> = [];
  const metas: unknown[] = [];
  const migratedLsKeys: string[] = [];
  if (ls) {
    const lsKeys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k !== null && k.startsWith(lsPrefix) && k !== indexLsKey && !k.startsWith(backupPrefix)) lsKeys.push(k);
    }
    for (const k of lsKeys) {
      const raw = ls.getItem(k);
      if (raw === null) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn(`[indexeddb-kv] 迁移拒收：${k} 非法 JSON（原地保留·不入库）`);
        continue;
      }
      if (!opts.claims(parsed)) continue; // 别的端口的档——留给它自己迁
      const slot = k.slice(lsPrefix.length);
      migratedLsKeys.push(k); // DB 更新还是入库，原键一律转备份（止住新旧双写分叉）
      if (existing.has(`${ns}:${slot}`)) continue; // DB 里已有（更新）→ 不砸
      entries.push([`${ns}:${slot}`, raw] as const); // 字节原样 → 旧档往返无损
      metas.push(opts.metaOf(slot, parsed));
    }
  }
  if (metas.length > 0) {
    // 与 DB 里已成形的索引合并（已有条目优先），不覆写
    let existingMetas: unknown[] = [];
    const rawIdx = await kv.get(`${ns}:__index__`);
    if (rawIdx !== null) {
      try {
        const arr = JSON.parse(rawIdx);
        if (Array.isArray(arr)) existingMetas = arr;
      } catch { /* 索引坏 → 按空合并 */ }
    }
    entries.push([`${ns}:__index__`, JSON.stringify([...existingMetas, ...metas])] as const);
  }
  entries.push([flagKey, '1'] as const);
  await kv.putMany(entries); // 单事务：档 + 索引 + 旗标一锤子落库
  // 落库成功后才动 localStorage：原键 → 只读备份键（best-effort·失败不阻断使用）
  if (ls) {
    for (const k of migratedLsKeys) {
      try {
        const raw = ls.getItem(k);
        if (raw !== null) {
          ls.setItem(backupPrefix + k.slice(lsPrefix.length), raw);
          ls.removeItem(k);
        }
      } catch (e) {
        console.warn(`[indexeddb-kv] 迁移备份改名失败（档已安全入库·仅备份键未立）：${k}`, e);
      }
    }
  }
}
