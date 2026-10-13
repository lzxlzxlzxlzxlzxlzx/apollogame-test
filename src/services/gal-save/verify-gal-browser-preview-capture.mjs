// Short-lived static-file browser verification: no app service or persistent storage is started.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-preview-capture-'));
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
  const sources = { background: await source('tex/gal-demo-backdrop'),
    portrait: await source('tex/gal-demo-portrait') };
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-save/gal-browser-preview-capture.audit.ts'),
        formats: ['iife'], name: 'GalPreviewAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:24px;background:#111426;color:white;font:16px sans-serif"><img id="preview" width="320" height="180" alt="scene preview"><p id="status">capturing…</p><script>window.__GAL_CAPTURE_SOURCES__=' + JSON.stringify(sources) + '</script><script src="audit.js"></script>');
  browser = await chromium.launch({ headless: true,
    ...(process.env.UI_AUDIT_CHROMIUM ? { executablePath: process.env.UI_AUDIT_CHROMIUM } : {}) });
  const page = await browser.newPage({ viewport: { width: 400, height: 260 } });
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => Boolean(window.__GAL_CAPTURE_AUDIT__), null, { timeout: 15000 });
  const result = await page.evaluate(() => window.__GAL_CAPTURE_AUDIT__);
  if (!result?.ok) throw new Error(`GAL capture audit failed: ${JSON.stringify(result)}`);
  if (result.width !== 320 || result.height !== 180) throw new Error('GAL capture dimensions drifted');
  if (process.argv.includes('--screenshot')) await page.locator('#preview').screenshot({ path: join(root,
    'docs/design/galgame/review/gal-eng-06f-demo-preview.png') });
  console.log('GAL BROWSER PREVIEW: PASS', JSON.stringify(result));
  await page.close();
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
