// GAL-ENG-06H: static-file browser chain; isolated browser and ephemeral in-memory ports only.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-preview-live-'));
const offset = relative(tmpdir(), temporary);
if (!offset || offset.startsWith('..') || isAbsolute(offset)) throw new Error('unsafe temporary path');
let browser;
try {
  const index = JSON.parse(await readFile(join(root, 'public/games/gal-template/art/index.json'), 'utf8'));
  const source = async id => {
    const asset = index.assets.find(row => row.id === id && row.type === 'texture' && row.status === 'filled');
    if (!asset?.path?.startsWith('/games/gal-template/art/textures/demo/'))
      throw new Error(`missing registered GAL demo source ${id}`);
    const artRoot = resolve(root, 'public/games/gal-template/art/textures/demo');
    const target = resolve(root, 'public', asset.path.slice(1));
    const inside = relative(artRoot, target);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error(`unsafe GAL demo source ${id}`);
    const bytes = await readFile(target);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  };
  const contentUrls = { 'tex/gal-demo-backdrop': await source('tex/gal-demo-backdrop'),
    'tex/gal-demo-portrait': await source('tex/gal-demo-portrait') };
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-save-preview-live.audit.ts'),
        formats: ['iife'], name: 'GalPreviewLiveAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script>window.__galPreviewAuditAssets=' +
    JSON.stringify(contentUrls) + '</script><script src="audit.js"></script>');
  browser = await chromium.launch({ headless: true,
    ...(process.env.UI_AUDIT_CHROMIUM ? { executablePath: process.env.UI_AUDIT_CHROMIUM } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => Boolean(window.__galPreviewAudit || window.__galPreviewAuditError),
    null, { timeout: 20000 });
  const startupError = await page.evaluate(() => window.__galPreviewAuditError ?? null);
  if (startupError) throw new Error(startupError);
  const waitPage = name => page.waitForFunction(expected => window.__galPreviewAudit.page() === expected, name);
  await page.locator('#starter-act-0').click(); await waitPage('story');
  await page.locator('#gal-story-save').click(); await waitPage('slots');
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  await page.waitForFunction(() => window.__galPreviewAudit.confirm() === 'save-empty');
  await page.locator('#gal-confirm-yes').click();
  await page.waitForFunction(() => window.__galPreviewAudit.feedback()?.includes('已保存至 NO. 2'));
  await page.waitForFunction(() => window.__galPreviewAudit.slot2()?.preview === 'ready', null,
    { timeout: 20000 });
  const saved = await page.evaluate(async () => {
    const audit = window.__galPreviewAudit;
    const slot = audit.slot2(), preview = await audit.preview(), hash = await audit.currentHash();
    const img = document.getElementById('gal-slot-2-preview-image');
    return { slotPreview: slot?.preview, cardHasSrc: slot?.previewSrc?.startsWith('data:image/webp;base64,') ?? false,
      authorityHash: hash,
      previewHash: preview.status === 'ready' ? preview.record.saveHash : null,
      mime: preview.status === 'ready' ? preview.record.image.mimeType : null,
      width: img?.naturalWidth ?? 0, height: img?.naturalHeight ?? 0 };
  });
  if (saved.slotPreview !== 'ready' || !saved.cardHasSrc ||
      saved.previewHash !== saved.authorityHash || saved.mime !== 'image/webp' ||
      saved.width !== 320 || saved.height !== 180)
    throw new Error(`GAL live preview mismatch: ${JSON.stringify(saved)}`);
  if (process.argv.includes('--screenshot')) await page.screenshot({ path: join(root,
    'docs/design/galgame/review/gal-eng-06h-live-preview.png') });
  await page.locator('#gal-slots-back').click(); await waitPage('story');
  await page.locator('#gal-story-load').click(); await waitPage('slots');
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  await page.waitForFunction(() => window.__galPreviewAudit.confirm() === 'load');
  await page.locator('#gal-confirm-yes').click(); await waitPage('story');
  if (await page.evaluate(() => window.__galPreviewAudit.visibleRef()) !== '["a","intro"]')
    throw new Error('GAL live preview save/load did not restore story ref');
  await page.close();

  const noPort = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await noPort.addInitScript(() => { window.__galPreviewAuditNoPort = true; });
  await noPort.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await noPort.waitForFunction(() => Boolean(window.__galPreviewAudit || window.__galPreviewAuditError));
  const noPortError = await noPort.evaluate(() => window.__galPreviewAuditError ?? null);
  if (noPortError) throw new Error(noPortError);
  await noPort.locator('#starter-act-0').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.page() === 'story');
  await noPort.locator('#gal-story-save').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.page() === 'slots');
  await noPort.locator('#gal-slot-2').click(); await noPort.locator('#gal-slots-commit').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.confirm() === 'save-empty');
  await noPort.locator('#gal-confirm-yes').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.feedback()?.includes('已保存至 NO. 2'));
  const fallback = await noPort.evaluate(async () => ({
    slotPreview: window.__galPreviewAudit.slot2()?.preview,
    authorityHash: await window.__galPreviewAudit.currentHash(),
  }));
  if (fallback.slotPreview !== 'no-preview' || !fallback.authorityHash)
    throw new Error(`GAL no-sidecar fallback failed: ${JSON.stringify(fallback)}`);
  await noPort.locator('#gal-slots-back').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.page() === 'story');
  await noPort.locator('#gal-story-load').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.page() === 'slots');
  await noPort.locator('#gal-slot-2').click(); await noPort.locator('#gal-slots-commit').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.confirm() === 'load');
  await noPort.locator('#gal-confirm-yes').click();
  await noPort.waitForFunction(() => window.__galPreviewAudit.page() === 'story');
  if (await noPort.evaluate(() => window.__galPreviewAudit.visibleRef()) !== '["a","intro"]')
    throw new Error('GAL no-sidecar save/load did not restore story ref');
  await noPort.close();
  console.log('GAL LIVE PREVIEW: PASS', JSON.stringify({ withPreview: saved, noPreviewPort: fallback }));
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
