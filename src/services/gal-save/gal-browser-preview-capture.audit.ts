import { BrowserGalPreviewCapturePort } from './gal-browser-preview-capture.js';
import { parseGalPreviewRecord } from './gal-save-preview.js';

async function dataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function audit(): Promise<void> {
  const supplied = (window as unknown as { __GAL_CAPTURE_SOURCES__?: { background: string; portrait: string } })
    .__GAL_CAPTURE_SOURCES__;
  const background = new OffscreenCanvas(640, 360);
  const bg = background.getContext('2d')!;
  const gradient = bg.createLinearGradient(0, 0, 640, 360);
  gradient.addColorStop(0, '#211647'); gradient.addColorStop(1, '#54759b');
  bg.fillStyle = gradient; bg.fillRect(0, 0, 640, 360);
  bg.fillStyle = '#d6d6aa'; bg.beginPath(); bg.arc(460, 90, 42, 0, Math.PI * 2); bg.fill();
  const portrait = new OffscreenCanvas(240, 360);
  const person = portrait.getContext('2d')!;
  person.fillStyle = '#c6a4d5'; person.beginPath(); person.arc(120, 98, 45, 0, Math.PI * 2); person.fill();
  person.fillStyle = '#32264f'; person.fillRect(62, 145, 116, 215);
  const result = await new BrowserGalPreviewCapturePort().capture({
    packageId: 'gal-audit', refKey: '["a","line"]', speaker: '澪', text: '月色静静落下。',
    backgroundAssetKey: supplied ? 'tex/gal-demo-backdrop' : 'tex/audit-bg',
    backgroundUrl: supplied?.background ?? await dataUrl(background),
    portraitAssetKey: supplied ? 'tex/gal-demo-portrait' : 'tex/audit-person',
    portraitUrl: supplied?.portrait ?? await dataUrl(portrait),
  });
  if (!result || !parseGalPreviewRecord({ schemaVersion: 1, packageId: 'gal-audit',
    slot: 1, saveHash: '12345678', image: result })) throw new Error('invalid captured raster');
  const image = document.querySelector<HTMLImageElement>('#preview')!;
  image.src = `data:${result.mimeType};base64,${result.data}`;
  await image.decode();
  if (image.naturalWidth !== 320 || image.naturalHeight !== 180) throw new Error('wrong thumbnail size');
  document.querySelector('#status')!.textContent = `${result.mimeType} · ${Math.floor(result.data.length * 3 / 4)} bytes`;
  (window as unknown as { __GAL_CAPTURE_AUDIT__: unknown }).__GAL_CAPTURE_AUDIT__ =
    { ok: true, mimeType: result.mimeType, width: result.width, height: result.height };
}

void audit().catch(error => {
  (window as unknown as { __GAL_CAPTURE_AUDIT__: unknown }).__GAL_CAPTURE_AUDIT__ =
    { ok: false, error: String(error) };
});
