import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserGalPreviewCapturePort } from './gal-browser-preview-capture.js';
import { parseGalPreviewRecord, type GalPreviewCaptureFrame } from './gal-save-preview.js';

function crc(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii'), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function png(): Blob {
  const width = 320, height = 180;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))),
    chunk('IEND', Buffer.alloc(0))]);
  return new Blob([bytes], { type: 'image/png' });
}
const frame = (values: Partial<GalPreviewCaptureFrame> = {}): GalPreviewCaptureFrame => ({
  packageId: 'browser-preview', refKey: '["a","line"]', speaker: '澪', text: '月夜', ...values,
});
function environment(encoded: () => Promise<Blob> = async () => png()) {
  const draws: number[][] = [], closed: number[] = [], encodes: Array<{ type: string; quality?: number }> = [];
  let created = 0;
  vi.stubGlobal('location', { href: 'https://gal.example/game', origin: 'https://gal.example' });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(new Blob(['asset'], { type: 'image/png' }),
    { status: 200, headers: { 'content-type': 'image/png', 'x-url': url } })));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => {
    const index = ++created;
    return { width: index === 1 ? 1440 : 563, height: index === 1 ? 900 : 845,
      close: () => { closed.push(index); } };
  }));
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(readonly width: number, readonly height: number) {}
    getContext() { return { fillStyle: '', fillRect: vi.fn(),
      drawImage: (...args: unknown[]) => { draws.push(args.slice(1) as number[]); } }; }
    async convertToBlob(option: { type: string; quality?: number }) {
      encodes.push(option); return encoded();
    }
  });
  return { draws, closed, encodes };
}
afterEach(() => vi.unstubAllGlobals());

describe('GAL-ENG-06F browser scene thumbnail encoder', () => {
  it('composes resolved scene assets offscreen into a bounded sidecar-compatible raster', async () => {
    const { draws, closed, encodes } = environment();
    const image = await new BrowserGalPreviewCapturePort().capture(frame({
      backgroundAssetKey: 'bg/night', backgroundUrl: '/night.png',
      portraitAssetKey: 'portrait/mio', portraitUrl: '/mio.png',
    }));
    expect(image).toMatchObject({ mimeType: 'image/png', width: 320, height: 180 });
    expect(parseGalPreviewRecord({ schemaVersion: 1, packageId: 'browser-preview', slot: 2,
      saveHash: '12345678', image })).toBeDefined();
    expect(draws).toHaveLength(2);
    expect(draws[0]).toEqual([0, -10, 320, 200]);
    expect(draws[1]?.[0]).toBe(150);
    expect(draws[1]?.[1]).toBeCloseTo(-1.81, 2);
    expect(draws[1]?.[2]).toBe(125);
    expect(draws[1]?.[3]).toBeCloseTo(187.61, 2);
    expect(closed).toHaveLength(2);
    expect(encodes[0]?.type).toBe('image/webp');
  });

  it('returns no preview for missing art, foreign URLs, or image load failure', async () => {
    const { draws } = environment();
    const capture = new BrowserGalPreviewCapturePort();
    expect(await capture.capture(frame())).toBeNull();
    expect(await capture.capture(frame({ backgroundUrl: 'https://foreign.example/a.png' }))).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await capture.capture(frame({ backgroundUrl: '/missing.png' }))).toBeNull();
    expect(draws).toHaveLength(0);
  });

  it('captures only the active CG shot and never falls back to its hidden scene', async () => {
    const { draws, closed } = environment();
    const capture = new BrowserGalPreviewCapturePort();
    const frameWithScene = frame({ cgAssetKey: 'cg/shot-2', cgUrl: '/shot-2.png',
      backgroundUrl: '/night.png', portraitUrl: '/mio.png' });
    expect(await capture.capture(frameWithScene)).toMatchObject({ width: 320, height: 180 });
    expect(draws).toEqual([[0, -10, 320, 200]]);
    expect(closed).toEqual([1]);
    expect(await capture.capture(frame({ ...frameWithScene, cgUrl: undefined }))).toBeNull();
    expect(draws).toHaveLength(1);
  });

  it('falls back to PNG after oversized WebP attempts and degrades when all encoders fail', async () => {
    let calls = 0;
    const oversized = () => new Blob([new Uint8Array(257 * 1024)], { type: 'image/webp' });
    const { encodes } = environment(async () => ++calls < 3 ? oversized() : png());
    const capture = new BrowserGalPreviewCapturePort();
    expect((await capture.capture(frame({ backgroundUrl: '/night.png' })))?.mimeType).toBe('image/png');
    expect(encodes.map(option => option.type)).toEqual(['image/webp', 'image/webp', 'image/png']);
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }; }
      async convertToBlob() { throw new Error('encoder unavailable'); }
    });
    expect(await capture.capture(frame({ backgroundUrl: '/night.png' }))).toBeNull();
  });
});
