import type { GalPackage } from '@engine/protocol/galgame.js';
import { CorruptSaveError } from '../save/envelope.js';
import { GalManualSaveController } from './gal-manual-save.js';

export type GalPreviewMime = 'image/png' | 'image/webp';
export interface GalPreviewImage {
  readonly mimeType: GalPreviewMime;
  /** Canonical base64 raster bytes, never HTML/SVG or a remote URL. */
  readonly data: string;
  readonly width: number;
  readonly height: number;
}
/** Read-only presentation frame supplied to an app-host image encoder, never stored in World. */
export interface GalPreviewCaptureFrame {
  readonly packageId: string;
  readonly refKey: string;
  readonly speaker: string | null;
  readonly text: string | null;
  readonly backgroundAssetKey?: string;
  readonly backgroundUrl?: string;
  readonly portraitAssetKey?: string;
  readonly portraitUrl?: string;
  readonly cgAssetKey?: string;
  readonly cgUrl?: string;
}
export interface GalPreviewCapturePort {
  capture(frame: GalPreviewCaptureFrame): Promise<GalPreviewImage | null>;
}
export interface GalPreviewRecord {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly slot: number;
  readonly saveHash: string;
  readonly image: GalPreviewImage;
}

/** Non-authoritative, replaceable sidecar. Implementations must isolate package + slot. */
export interface GalSavePreviewPort {
  read(packageId: string, slot: number): Promise<unknown | null>;
  write(record: GalPreviewRecord): Promise<void>;
  delete(packageId: string, slot: number): Promise<void>;
}

/** Test/default ephemeral adapter; this never touches a database or browser storage. */
export class MemoryGalSavePreviewPort implements GalSavePreviewPort {
  private readonly records = new Map<string, unknown>();
  private key(packageId: string, slot: number): string { return JSON.stringify([packageId, slot]); }
  async read(packageId: string, slot: number): Promise<unknown | null> {
    const record = this.records.get(this.key(packageId, slot));
    return record === undefined ? null : structuredClone(record);
  }
  async write(record: GalPreviewRecord): Promise<void> {
    this.records.set(this.key(record.packageId, record.slot), structuredClone(record));
  }
  async delete(packageId: string, slot: number): Promise<void> {
    this.records.delete(this.key(packageId, slot));
  }
}

export type GalPreviewResult =
  | { readonly status: 'ready'; readonly record: GalPreviewRecord; readonly src: string }
  | { readonly status: 'missing' | 'damaged' | 'unavailable' | 'invalid-save' | 'stale' };
export type GalPreviewWriteResult = 'stored' | 'stale' | 'invalid-save' | 'invalid-image' | 'unavailable';

const MAX_BYTES = 256 * 1024;
const MAX_EDGE = 1024;
const HASH = /^[0-9a-f]{8}$/;
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function u32be(bytes: string, offset: number): number {
  return (bytes.charCodeAt(offset) * 0x1000000 + (bytes.charCodeAt(offset + 1) << 16) +
    (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3)) >>> 0;
}
function u32le(bytes: string, offset: number): number {
  return (bytes.charCodeAt(offset) + (bytes.charCodeAt(offset + 1) << 8) +
    (bytes.charCodeAt(offset + 2) << 16) + bytes.charCodeAt(offset + 3) * 0x1000000) >>> 0;
}
function crc32(bytes: string, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes.charCodeAt(i);
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngSize(bytes: string): readonly [number, number] | undefined {
  if (bytes.length < 57 || !bytes.startsWith('\x89PNG\r\n\x1a\n')) return undefined;
  let offset = 8, idat = false, ending = false, width = 0, height = 0, first = true;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset), end = offset + 12 + length;
    if (length > MAX_BYTES || end > bytes.length) return undefined;
    const type = bytes.slice(offset + 4, offset + 8);
    if (u32be(bytes, offset + 8 + length) !== crc32(bytes, offset + 4, offset + 8 + length)) return undefined;
    if (first) {
      if (type !== 'IHDR' || length !== 13) return undefined;
      width = u32be(bytes, offset + 8); height = u32be(bytes, offset + 12);
      if (bytes.charCodeAt(offset + 18) !== 0 || bytes.charCodeAt(offset + 19) !== 0 ||
          bytes.charCodeAt(offset + 20) > 1) return undefined;
      first = false;
    } else if (type === 'IDAT') idat = true;
    else if (type === 'IEND') { ending = length === 0 && end === bytes.length; break; }
    offset = end;
  }
  return idat && ending ? [width, height] : undefined;
}
function webpSize(bytes: string): readonly [number, number] | undefined {
  if (bytes.length < 30 || bytes.slice(0, 4) !== 'RIFF' || bytes.slice(8, 12) !== 'WEBP' ||
      u32le(bytes, 4) !== bytes.length - 8) return undefined;
  let offset = 12, dimensions: readonly [number, number] | undefined, hasImage = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.slice(offset, offset + 4), length = u32le(bytes, offset + 4);
    const end = offset + 8 + length, next = end + (length & 1);
    if (length > MAX_BYTES || next > bytes.length) return undefined;
    if (type === 'VP8X' && offset === 12 && length >= 10) {
      dimensions = [1 + bytes.charCodeAt(offset + 12) + (bytes.charCodeAt(offset + 13) << 8) +
        (bytes.charCodeAt(offset + 14) << 16),
      1 + bytes.charCodeAt(offset + 15) + (bytes.charCodeAt(offset + 16) << 8) +
        (bytes.charCodeAt(offset + 17) << 16)];
    } else if (type === 'VP8L' && length > 5 && bytes.charCodeAt(offset + 8) === 0x2f) {
      const bits = u32le(bytes, offset + 9);
      dimensions ??= [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
      hasImage = true;
    } else if (type === 'VP8 ' && length > 10 && bytes.slice(offset + 11, offset + 14) === '\x9d\x01\x2a') {
      dimensions ??= [(bytes.charCodeAt(offset + 14) | (bytes.charCodeAt(offset + 15) << 8)) & 0x3fff,
        (bytes.charCodeAt(offset + 16) | (bytes.charCodeAt(offset + 17) << 8)) & 0x3fff];
      hasImage = true;
    }
    offset = next;
  }
  return hasImage && offset === bytes.length ? dimensions : undefined;
}

/** Strictly validate a bounded raster payload before any value reaches Image.src. */
export function parseGalPreviewRecord(raw: unknown): GalPreviewRecord | undefined {
  try {
  if (!exact(raw, ['schemaVersion', 'packageId', 'slot', 'saveHash', 'image']) || raw.schemaVersion !== 1 ||
      typeof raw.packageId !== 'string' || !raw.packageId || !Number.isSafeInteger(raw.slot) ||
      (raw.slot as number) < 1 || typeof raw.saveHash !== 'string' || !HASH.test(raw.saveHash) ||
      !exact(raw.image, ['mimeType', 'data', 'width', 'height'])) return undefined;
  const image = raw.image;
  if ((image.mimeType !== 'image/png' && image.mimeType !== 'image/webp') ||
      typeof image.data !== 'string' || image.data.length > Math.ceil(MAX_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) ||
      !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      (image.width as number) < 1 || (image.width as number) > MAX_EDGE ||
      (image.height as number) < 1 || (image.height as number) > MAX_EDGE ||
      (image.width as number) * (image.height as number) > MAX_EDGE * MAX_EDGE) return undefined;
  let bytes: string;
  try { bytes = atob(image.data); } catch { return undefined; }
  if (bytes.length > MAX_BYTES || btoa(bytes) !== image.data) return undefined;
  const dimensions = image.mimeType === 'image/png' ? pngSize(bytes) : webpSize(bytes);
  if (!dimensions || dimensions[0] !== image.width || dimensions[1] !== image.height) return undefined;
  return structuredClone(raw) as unknown as GalPreviewRecord;
  } catch { return undefined; }
}

/** Decode is deliberately separate from structural parsing; CRC alone cannot prove a raster renders. */
async function decodes(record: GalPreviewRecord): Promise<boolean> {
  const bytes = Uint8Array.from(atob(record.image.data), character => character.charCodeAt(0));
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer],
        { type: record.image.mimeType }));
      const valid = bitmap.width === record.image.width && bitmap.height === record.image.height;
      bitmap.close();
      return valid;
    } catch { return false; }
  }
  // Node/test hosts have no image decoder. The capture contract is RGBA8 PNG; fail closed on other formats.
  if (record.image.mimeType !== 'image/png' || bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0)
    return false;
  const compressed: number[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = u32be(String.fromCharCode(...bytes.subarray(offset, offset + 4)), 0);
    if (String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'IDAT')
      for (const byte of bytes.subarray(offset + 8, offset + 8 + length)) compressed.push(byte);
    offset += 12 + length;
  }
  if (!compressed.length) return false;
  const expected = (record.image.width * 4 + 1) * record.image.height;
  let total = 0;
  const raw: number[] = [];
  try {
    const payload = Uint8Array.from(compressed);
    const reader = new Blob([payload.buffer as ArrayBuffer]).stream()
      .pipeThrough(new DecompressionStream('deflate')).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > expected) { await reader.cancel(); return false; }
      for (const byte of value) raw.push(byte);
    }
  } catch { return false; }
  if (total !== expected) return false;
  for (let row = 0; row < record.image.height; row++)
    if (raw[row * (record.image.width * 4 + 1)]! > 4) return false;
  return true;
}

/** Authority is inspected first; a sidecar can never make an invalid save readable. */
// A preview is keyed by package + slot, not by controller instance. Multiple UI hosts in the
// same JS realm may use different port wrappers for the same backing store. This only orders
// local writes; cross-tab/process ordering still needs storage-level coordination.
const previewWrites = new Map<string, Promise<void>>();

export class GalSavePreviewController {
  constructor(private readonly pkg: GalPackage, private readonly manual: GalManualSaveController,
    private readonly port: GalSavePreviewPort) {}

  async resolve(number: number, expectedHash?: string): Promise<GalPreviewResult> {
    const authority = await this.authority(number);
    if (authority.status !== 'valid') return { status: authority.status };
    if (expectedHash !== undefined && expectedHash !== authority.hash) return { status: 'stale' };
    let raw: unknown;
    try { raw = await this.port.read(this.pkg.id, number); }
    catch { return { status: 'unavailable' }; }
    if (raw === null) return { status: 'missing' };
    const record = parseGalPreviewRecord(raw);
    if (!record) return { status: 'damaged' };
    if (record.packageId !== this.pkg.id || record.slot !== number || record.saveHash !== authority.hash)
      return { status: 'stale' };
    if (!await decodes(record)) return { status: 'damaged' };
    const latest = await this.authority(number);
    if (latest.status !== 'valid' || latest.hash !== authority.hash) return { status: 'stale' };
    return { status: 'ready', record,
      src: `data:${record.image.mimeType};base64,${record.image.data}` };
  }

  async write(number: number, saveHash: string, image: GalPreviewImage): Promise<GalPreviewWriteResult> {
    return this.enqueue(number, () => this.writeOnce(number, saveHash, image));
  }

  private async enqueue<T>(number: number, task: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([this.pkg.id, number]);
    const prior = previewWrites.get(key) ?? Promise.resolve();
    const operation = prior.catch(() => {}).then(task);
    const settled = operation.then(() => {}, () => {});
    previewWrites.set(key, settled);
    try { return await operation; }
    finally { if (previewWrites.get(key) === settled) previewWrites.delete(key); }
  }

  private async writeOnce(number: number, saveHash: string, image: GalPreviewImage): Promise<GalPreviewWriteResult> {
    const authority = await this.authority(number);
    if (authority.status !== 'valid') return authority.status === 'invalid-save' ? 'invalid-save' : 'stale';
    if (authority.hash !== saveHash) return 'stale';
    const record = parseGalPreviewRecord({ schemaVersion: 1, packageId: this.pkg.id,
      slot: number, saveHash, image });
    if (!record || !await decodes(record)) return 'invalid-image';
    try { await this.port.write(record); } catch { return 'unavailable'; }
    const latest = await this.authority(number);
    return latest.status === 'valid' && latest.hash === saveHash ? 'stored' : 'stale';
  }

  async delete(number: number): Promise<'deleted' | 'sidecar-failed'> {
    await this.manual.delete(number);
    return this.enqueue(number, async () => {
      // A new authoritative save may have occupied the slot while this cleanup waited.
      if ((await this.authority(number)).status === 'valid') return 'deleted';
      try { await this.port.delete(this.pkg.id, number); return 'deleted'; }
      catch { return 'sidecar-failed'; }
    });
  }

  private async authority(number: number): Promise<
    { status: 'valid'; hash: string } | { status: 'missing' | 'invalid-save' | 'unavailable' }> {
    try {
      const meta = await this.manual.inspect(number);
      return meta ? { status: 'valid', hash: meta.hash } : { status: 'missing' };
    } catch (error) {
      return { status: error instanceof CorruptSaveError ? 'invalid-save' : 'unavailable' };
    }
  }
}
