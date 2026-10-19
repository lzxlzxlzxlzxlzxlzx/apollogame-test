import { parseGalPreviewRecord, type GalPreviewCaptureFrame, type GalPreviewCapturePort,
  type GalPreviewImage } from './gal-save-preview.js';

/** Browser-only, render-only scene thumbnail. It never reads the DOM or a World snapshot. */
const WIDTH = 320;
const HEIGHT = 180;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const SOURCE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function allowedUrl(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 + 128) return null;
  try {
    const base = globalThis.location?.href;
    const url = new URL(raw, base);
    if (url.protocol === 'data:') return /^data:image\/(?:png|jpeg|webp);base64,/i.test(raw) ? raw : null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'blob:') return null;
    return url.origin === globalThis.location?.origin ? url.href : null;
  } catch { return null; }
}

async function loadImage(raw: string | undefined): Promise<ImageBitmap | null> {
  if (!raw || typeof fetch !== 'function' || typeof createImageBitmap !== 'function') return null;
  const url = allowedUrl(raw);
  if (!url) return null;
  try {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(4000) : undefined;
    const response = await fetch(url, { mode: 'cors', ...(signal ? { signal } : {}) });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) return null;
    const blob = await response.blob();
    if (!SOURCE_TYPES.has(blob.type) || blob.size > MAX_SOURCE_BYTES) return null;
    const image = await createImageBitmap(blob);
    if (image.width < 1 || image.height < 1 || image.width > 8192 || image.height > 8192) {
      image.close(); return null;
    }
    return image;
  } catch { return null; }
}

function cover(ctx: OffscreenCanvasRenderingContext2D, image: ImageBitmap): void {
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
  const width = image.width * scale, height = image.height * scale;
  ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
}

function portrait(ctx: OffscreenCanvasRenderingContext2D, image: ImageBitmap): void {
  // Same normalized stage rectangle as the V2 GAL story presentation (1440×900).
  const box = { x: 150, y: -2, width: 125, height: 188 };
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale, height = image.height * scale;
  ctx.drawImage(image, box.x + (box.width - width) / 2,
    box.y + (box.height - height) / 2, width, height);
}

async function encode(canvas: OffscreenCanvas, packageId: string): Promise<GalPreviewImage | null> {
  for (const option of [{ type: 'image/webp', quality: 0.8 },
    { type: 'image/webp', quality: 0.6 }, { type: 'image/png' }] as const) {
    try {
      const blob = await canvas.convertToBlob(option);
      if (blob.size < 1 || blob.size > MAX_OUTPUT_BYTES ||
          (blob.type !== 'image/webp' && blob.type !== 'image/png')) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      const image: GalPreviewImage = { mimeType: blob.type, data: btoa(binary), width: WIDTH, height: HEIGHT };
      if (parseGalPreviewRecord({ schemaVersion: 1, packageId, slot: 1,
        saveHash: '00000000', image })) return image;
    } catch { /* unsupported encoder or tainted canvas: try another bounded format */ }
  }
  return null;
}

/** Explicitly construct this in a browser app host and pass it as GalSlicePorts.previewCapture. */
export class BrowserGalPreviewCapturePort implements GalPreviewCapturePort {
  async capture(frame: GalPreviewCaptureFrame): Promise<GalPreviewImage | null> {
    if (!frame.packageId || (!frame.cgAssetKey && !frame.backgroundUrl && !frame.portraitUrl) ||
        typeof OffscreenCanvas !== 'function') return null;
    // A projected CG replaces the scene. Missing CG art must not expose the hidden background.
    if (frame.cgAssetKey) {
      const cg = await loadImage(frame.cgUrl);
      if (!cg) return null;
      try {
        const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#101426';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        cover(ctx, cg);
        return await encode(canvas, frame.packageId);
      } catch { return null; }
      finally { cg.close(); }
    }
    const [background, person] = await Promise.all([
      loadImage(frame.backgroundUrl), loadImage(frame.portraitUrl),
    ]);
    if (!background && !person) return null;
    try {
      const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#101426';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (background) cover(ctx, background);
      if (person) portrait(ctx, person);
      return await encode(canvas, frame.packageId);
    } catch { return null; }
    finally { background?.close(); person?.close(); }
  }
}
