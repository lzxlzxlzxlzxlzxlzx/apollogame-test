// GAL-ENG-06B: same-canvas read-only prototype/current slot evidence. No server or persistence.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const output = join(root, 'docs/design/galgame/review');
const temporary = await mkdtemp(join(tmpdir(), 'gal-06b-slots-'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
const box = async (page, selector) => page.locator(selector).first().evaluate(element => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
});
try {
  browser = await chromium.launch({ executablePath: executable });
  const prototype = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await prototype.goto(pathToFileURL(join(root, 'docs/design/galgame/gal-ui-complete-v2.dc.html')).href);
  await prototype.locator('#home [data-open="load"]').click();
  await prototype.locator('#slot-grid .slot').first().waitFor();
  const prototypeBoxes = { grid: await box(prototype, '#slot-grid'),
    card: await box(prototype, '#slot-grid .slot'), shot: await box(prototype, '#slot-grid .slot-shot') };
  await prototype.screenshot({ path: join(output, 'gal-eng-06b-prototype-slots.png') });
  await prototype.close();

  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error', build: {
    write: true, outDir: temporary, emptyOutDir: false,
    lib: { entry: join(root, 'src/services/gal-ui/gal-ui-slots-preview.audit.ts'),
      formats: ['iife'], name: 'GalPreviewAudit', fileName: () => 'audit.js' },
  } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  const current = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await current.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await current.locator('#gal-slot-2-preview-image').waitFor();
  const currentBoxes = { grid: await box(current, '#gal-slots-grid'),
    emptyCard: await box(current, '#gal-slot-1'), readyCard: await box(current, '#gal-slot-2'),
    number: await box(current, '#gal-slot-2-number'),
    previewPanel: await box(current, '#gal-slot-2-preview'),
    image: await box(current, '#gal-slot-2-preview-image'),
    readyMeta: await box(current, '#gal-slot-2-meta'), readyState: await box(current, '#gal-slot-2-state') };
  const imageLoaded = await current.locator('#gal-slot-2-preview-image')
    .evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
  const visibleCards = await current.locator('#gal-slots-grid > *').count();
  await current.screenshot({ path: join(output, 'gal-eng-06b-current-slots-preview.png') });
  await current.close();
  console.log(JSON.stringify({ viewport: [1440, 900], prototype: prototypeBoxes, current: currentBoxes,
    imageLoaded, visibleCards }, null, 2));
  if (!imageLoaded || currentBoxes.readyState.y + currentBoxes.readyState.height >
      currentBoxes.readyCard.y + currentBoxes.readyCard.height ||
      currentBoxes.image.y + currentBoxes.image.height >
      currentBoxes.previewPanel.y + currentBoxes.previewPanel.height || visibleCards !== 12) process.exitCode = 1;
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
