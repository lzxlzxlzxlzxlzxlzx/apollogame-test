// GAL-UI-03D: static-file 1440×900 geometry, four states and placeholder-image check.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-03d-'));
const screenshots = process.argv.includes('--transient-shots') ? temporary : join(root, 'docs/design/galgame/review');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
const box = async (page, selector) => page.locator(selector).first().evaluate(element => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return [x, y, width, height].map(Math.round);
});
const diff = (actual, expected) => actual.map((value, index) => value - expected[index]);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error', build: {
    write: true, outDir: temporary, emptyOutDir: false,
    lib: { entry: join(root, 'src/services/gal-ui/gal-ui-slots-03d.audit.ts'),
      formats: ['iife'], name: 'Gal03DAudit', fileName: () => 'audit.js' },
  } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath });
  const actual = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const prototype = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await actual.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await prototype.goto(pathToFileURL(join(root, 'docs/design/galgame/gal-ui-complete-v2.dc.html')).href);
  await prototype.locator('#home [data-open="load"]').click();
  await actual.locator('#gal-slot-3-preview-image').waitFor();
  const cards = actual.locator('#gal-slots-grid > [id^="gal-slots-row-"] > [id^="gal-slot-"]');
  const referenceCards = prototype.locator('#slot-grid > .slot');
  const actualCards = [], targetCards = [];
  for (let index = 0; index < 12; index++) {
    actualCards.push(await box(actual, `#gal-slot-${index + 1}`));
    const rect = await referenceCards.nth(index).boundingBox();
    targetCards.push([rect.x, rect.y, rect.width, rect.height].map(Math.round));
  }
  const report = { target: { grid: await box(prototype, '#slot-grid'), cards: targetCards,
    footer: await box(prototype, '#saveview .sys-foot') },
  actual: { grid: await box(actual, '#gal-slots-grid'), cards: actualCards,
    footer: await box(actual, '#gal-slots-footer'), toolbar: await box(actual, '#gal-slots-toolbar') },
  state: ['empty', 'no-preview', 'ready', 'damaged'] };
  await actual.screenshot({ path: join(screenshots, 'gal-ui-03d-actual-four-states.png') });
  await prototype.screenshot({ path: join(screenshots, 'gal-ui-03d-prototype-slots.png') });
  for (let index = 1; index <= 4; index++)
    await actual.locator(`#gal-slot-${index}`).screenshot({ path: join(screenshots, `gal-ui-03d-state-${report.state[index - 1]}.png`) });
  console.log(JSON.stringify(report));
  if (await cards.count() !== 12 || await referenceCards.count() !== 12) throw new Error('4×3 slot count regressed');
  for (const name of ['grid', 'footer']) {
    if (diff(report.actual[name], report.target[name]).some(value => Math.abs(value) > 1))
      throw new Error(`${name} mismatched: ${JSON.stringify({ actual: report.actual[name], target: report.target[name] })}`);
  }
  for (let index = 0; index < 12; index++)
    if (diff(actualCards[index], targetCards[index]).some(value => Math.abs(value) > 1))
      throw new Error(`slot ${index + 1} mismatched: ${JSON.stringify({ actual: actualCards[index], target: targetCards[index] })}`);
  const imageLoaded = await actual.locator('#gal-slot-3-preview-image')
    .evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
  if (!imageLoaded) throw new Error('Test-color preview did not load');
  for (let index = 1; index <= 12; index++) {
    const card = await box(actual, `#gal-slot-${index}`);
    for (const part of ['preview', 'meta', 'state']) {
      const inner = await box(actual, `#gal-slot-${index}-${part}`);
      if (inner[1] + inner[3] > card[1] + card[3] || inner[0] + inner[2] > card[0] + card[2])
        throw new Error(`slot ${index} ${part} overflow`);
    }
  }
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error', build: {
    write: true, outDir: temporary, emptyOutDir: false,
    lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
      formats: ['iife'], name: 'Gal03DFlow', fileName: () => 'live.js' },
  } });
  await writeFile(join(temporary, 'live.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="live.js"></script>');
  const live = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await live.goto(pathToFileURL(join(temporary, 'live.html')).href);
  await live.waitForFunction(() => !!window.__galAudit);
  await live.locator('#starter-act-0').click();
  await live.waitForFunction(() => window.__galAudit.page() === 'story');
  const originalRef = await live.evaluate(() => window.__galAudit.ref());
  await live.locator('#gal-story-save').click();
  await live.waitForFunction(() => window.__galAudit.page() === 'slots');
  await live.locator('#gal-page-next').click();
  await live.locator('#gal-slot-13').waitFor();
  if (await live.locator('#gal-slot-1').count()) throw new Error('Page 1 slot leaked onto page 2');
  await live.screenshot({ path: join(screenshots, 'gal-ui-03d-page2.png') });
  await live.locator('#gal-page-prev').click();
  await live.locator('#gal-slot-2').click();
  await live.locator('#gal-slots-commit').click();
  await live.waitForFunction(() => window.__galAudit.confirm() === 'save-empty');
  await live.locator('#gal-confirm-yes').click();
  await live.waitForFunction(() => window.__galAudit.slot2());
  await live.screenshot({ path: join(screenshots, 'gal-ui-03d-slot2-saved.png') });
  await live.locator('#gal-slots-back').click();
  await live.waitForFunction(() => window.__galAudit.page() === 'story');
  await live.locator('#gal-story-load').click();
  await live.waitForFunction(() => window.__galAudit.page() === 'slots');
  await live.locator('#gal-slot-2').click();
  await live.locator('#gal-slots-commit').click();
  await live.waitForFunction(() => window.__galAudit.confirm() === 'load');
  await live.locator('#gal-confirm-yes').click();
  await live.waitForFunction(() => window.__galAudit.page() === 'story');
  if (await live.evaluate(() => window.__galAudit.ref()) !== originalRef)
    throw new Error('Slot 2 load restored a different story position');
  console.log('GAL-UI-03D four-state static-file prototype geometry, 4×3, image and overflow — PASS');
  console.log('GAL-UI-03D in-memory live chain: page 2/1, slot 2 save confirmation and load — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
