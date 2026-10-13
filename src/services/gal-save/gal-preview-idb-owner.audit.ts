// Isolated local browser audit fixture. Never point this at a remote database.
import { IndexedDbKV } from '../storage/indexeddb-kv.js';
import { IndexedDbGalSavePreviewPort } from './gal-save-preview-indexeddb.js';
import type { GalPreviewRecord } from './gal-save-preview.js';

const packageId = 'gal-preview-owner-audit';
const slot = 2;
const saveHash = '12345678';
const kv = new IndexedDbKV({ dbName: 'gal-preview-owner-audit-v1', storeName: 'kv' });
const port = new IndexedDbGalSavePreviewPort(kv);

async function sample(): Promise<GalPreviewRecord> {
  const canvas = new OffscreenCanvas(8, 8);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Owner IDB audit has no 2D canvas');
  ctx.fillStyle = '#7460af'; ctx.fillRect(0, 0, 8, 8);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  const data = btoa(String.fromCharCode(...bytes));
  return { schemaVersion: 1, packageId, slot, saveHash,
    image: { mimeType: 'image/png', data, width: 8, height: 8 } };
}

Object.assign(window, { __galOwnerIdbAudit: {
  write: async () => { await port.write(await sample()); return true; },
  read: async () => {
    const value = await port.read(packageId, slot);
    if (value === null) return { status: 'missing' };
    if (!value || typeof value !== 'object' || !('image' in value)) return { status: 'damaged' };
    const record = value as GalPreviewRecord;
    return { status: 'ready', packageId: record.packageId, slot: record.slot,
      saveHash: record.saveHash, width: record.image.width, height: record.image.height,
      mimeType: record.image.mimeType };
  },
  corrupt: async () => { await kv.put(`gal-preview:v1:${JSON.stringify([packageId, slot])}`, '{broken json'); },
  delete: async () => { await port.delete(packageId, slot); },
  close: async () => { await kv.close(); },
} });
