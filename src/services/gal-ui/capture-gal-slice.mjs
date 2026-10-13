// S4 evidence only: builds static audit entries and closes an isolated headless browser.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'docs/design/galgame/review');
const temporary = await mkdtemp(join(tmpdir(), 'gal-s4-'));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.UI_AUDIT_CHROMIUM });
  for (const state of ['home', 'story', 'slots', 'load-empty', 'confirm']) {
    const target = join(temporary, state);
    await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
      build: { write: true, outDir: target, emptyOutDir: false,
        lib: { entry: join(root, `src/services/gal-ui/gal-ui-${state}.audit.ts`), formats: ['iife'],
          name: 'GalAudit', fileName: () => 'audit.js' } } });
    await writeFile(join(target, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(target, 'index.html')).href);
    await page.waitForTimeout(300);
    if (state === 'home' &&
      (await page.locator('#gal-home-gallery').isDisabled() || await page.locator('#starter-act-0').isDisabled()))
      throw new Error('home gallery/start enabled state not rendered');
    if (state === 'load-empty' && !await page.locator('#gal-slots-commit').isDisabled())
      throw new Error('empty load slot did not disable commit');
    if (state === 'confirm' && !await page.locator('[role="dialog"]').isVisible())
      throw new Error('confirmation dialog not visible');
    await page.screenshot({ path: join(output, `gal-ui-03a-${state}.png`) });
    if (state === 'home') {
      const start = page.locator('#starter-act-0');
      await start.hover();
      await page.screenshot({ path: join(output, 'gal-ui-03a-home-hover.png') });
      await page.mouse.down();
      await page.screenshot({ path: join(output, 'gal-ui-03a-home-pressed.png') });
      await page.mouse.up();
    }
    await page.close();
  }
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
