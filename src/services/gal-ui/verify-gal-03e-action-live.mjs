// GAL-UI-03E real-browser action chain on a static bundle with in-memory ports only.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-03e-action-'));
const output = join(root, 'docs/design/galgame/review');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ entryPoints: [join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts')],
    bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
    tsconfig: join(root, 'tsconfig.json'), outfile: join(temporary, 'audit.js'), logLevel: 'error' });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launchPersistentContext(join(temporary, 'browser-profile'), { executablePath,
    headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
    await page.waitForFunction(() => !!window.__galAudit);
    const state = () => page.evaluate(() => ({ page: window.__galAudit.page(), ref: window.__galAudit.ref() }));
    const waitRef = node => page.waitForFunction(value => window.__galAudit.ref().includes(`"${value}"`), node);
    const shot = async name => {
      if (!process.argv.includes('--transient-shots'))
        await page.screenshot({ path: join(output, `gal-ui-03e-action-${name}.png`) });
      console.log(`${name} ${JSON.stringify(await state())}`);
    };
    await page.locator('#starter-act-0').click();
    await waitRef('intro'); await shot('intro');
    await page.locator('#gal-story-dialogue').click({ position: { x: 700, y: 130 } });
    await waitRef('choice'); await shot('choice');
    if (await page.locator('#gal-story-dialogue').getAttribute('data-action'))
      throw new Error('Choice dialogue should not advance');
    await page.locator('[data-action="narrative.choose"][data-arg="yes"]').click();
    await waitRef('yes'); await shot('yes');
    await page.locator('#gal-story-dialogue').hover();
    await page.mouse.wheel(0, -120);
    await waitRef('choice'); await shot('rollback');
    await page.locator('[data-action="narrative.choose"][data-arg="no"]').click();
    await waitRef('no'); await shot('no');
    await page.locator('#gal-story-load').click();
    await page.locator('#gal-slots-shell').waitFor({ state: 'visible' });
    await shot('load-entry');
    await page.locator('#gal-slots-back').click();
    await page.locator('#gal-story-settings').click();
    await page.locator('#gal-settings-shell').waitFor({ state: 'visible' });
    await shot('settings-entry');
    console.log('GAL-UI-03E static browser action chain: PASS');
  } finally { await page.close(); }
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
