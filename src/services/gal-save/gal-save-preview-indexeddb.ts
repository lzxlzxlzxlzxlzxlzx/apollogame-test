import { IndexedDbKV } from '../storage/indexeddb-kv.js';
import { parseGalPreviewRecord, type GalPreviewRecord, type GalSavePreviewPort } from './gal-save-preview.js';

/** Sidecar only: the authoritative snapshot and profile use their existing ports. */
type PreviewKV = Pick<IndexedDbKV, 'get' | 'put' | 'delete'>;
const PREFIX = 'gal-preview:v1:';
// 256 KiB raster bytes expand to <350 KiB base64; leave room for bounded metadata.
const MAX_JSON_CHARS = 360_000;

function key(packageId: string, slot: number): string {
  if (!packageId || !Number.isSafeInteger(slot) || slot < 1)
    throw new TypeError('GAL 预览键需要有效 packageId 与正整数槽号');
  return `${PREFIX}${JSON.stringify([packageId, slot])}`;
}

/** Optional browser adapter. Constructing it opens no database; I/O starts on port use. */
export class IndexedDbGalSavePreviewPort implements GalSavePreviewPort {
  constructor(private readonly kv: PreviewKV = new IndexedDbKV()) {}

  async read(packageId: string, slot: number): Promise<unknown | null> {
    const raw = await this.kv.get(key(packageId, slot));
    if (raw === null) return null;
    if (raw.length > MAX_JSON_CHARS) return {}; // damaged, not missing
    try { return JSON.parse(raw) as unknown; }
    catch { return {}; } // the controller reports damaged without weakening the save
  }

  async write(record: GalPreviewRecord): Promise<void> {
    const valid = parseGalPreviewRecord(record);
    if (!valid) throw new TypeError('GAL 预览记录无效');
    const payload = JSON.stringify(valid);
    if (payload.length > MAX_JSON_CHARS) throw new TypeError('GAL 预览记录超限');
    await this.kv.put(key(valid.packageId, valid.slot), payload);
  }

  delete(packageId: string, slot: number): Promise<void> {
    return this.kv.delete(key(packageId, slot));
  }
}
