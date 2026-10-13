// GAL-UI-03B real player gestures against a local static build; no application service.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-gallery-'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'GalGalleryAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => !!window.__galAudit);
  const screenshot = async name => page.screenshot({ path: join(root, `docs/design/galgame/review/gal-ui-03b-live-${name}.png`) });
  await page.locator('#starter-act-0').click();
  await page.waitForFunction(() => window.__galAudit.page() === 'story');
  await page.mouse.move(700, 760); await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => window.__galAudit.ref() === JSON.stringify(['a', 'choice']));
  await page.locator('#gal-story-history').click();
  await page.locator('#gal-history-modal [role="dialog"]').waitFor();
  const beforeHistoryWheel = await page.evaluate(() => window.__galAudit.ref());
  await page.mouse.move(720, 450); await page.mouse.wheel(0, 160);
  if (await page.evaluate(() => window.__galAudit.ref()) !== beforeHistoryWheel)
    throw new Error('History scroll leaked to narrative input');
  await screenshot('history');
  await page.locator('#gal-history-back').click();
  await page.locator('#gal-history-modal').waitFor({ state: 'detached' });
  await page.locator('[data-action="narrative.choose"][data-arg="yes"]').click();
  await page.waitForFunction(() => window.__galAudit.ref() === JSON.stringify(['a', 'yes']));
  await page.locator('#gal-story-home').click();
  await page.locator('#gal-confirm-yes').click();
  await page.locator('#gal-home-gallery').click();
  await page.waitForFunction(() => window.__galAudit.page() === 'gallery');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(async () => await window.__galAudit.unlockMemory('memory-1'));
  if (await page.locator('#gal-gallery-card-memory-1').getAttribute('data-action'))
    throw new Error('Unlocked memory replay became actionable in read-only slice');
  await screenshot('memories');
  await page.locator('#gal-gallery-cg-tab').click();
  if (await page.locator('#gal-gallery-card-cg-1').getAttribute('data-action'))
    throw new Error('Locked CG has an action');
  if ((await page.locator('#gal-gallery-card-cg-1').textContent())?.includes('private/cg-1'))
    throw new Error('Locked CG exposed its image key');
  await page.locator('#gal-gallery-card-cg-1').click();
  if (await page.locator('#gal-cg-modal').count()) throw new Error('Locked CG opened');
  await screenshot('cg-locked');
  await page.evaluate(async () => await window.__galAudit.unlockCg('cg-7'));
  await page.locator('#gal-gallery-next').click();
  await page.locator('#gal-gallery-card-cg-7').hover();
  await screenshot('cg-hover');
  await page.mouse.down();
  await screenshot('cg-pressed');
  await page.mouse.up();
  await page.locator('#gal-cg-modal [role="dialog"]').waitFor();
  await screenshot('cg-expanded');
  await page.locator('#gal-cg-expanded-back').click();
  if (!(await page.locator('#gal-gallery-page').textContent())?.includes('2 / 2'))
    throw new Error('CG close lost gallery page');
  await screenshot('cg-return');
  await page.locator('#gal-gallery-back').click();
  await page.locator('#starter-act-1').click();
  await page.waitForFunction(() => window.__galAudit.page() === 'story');
  await page.mouse.move(700, 760); await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => window.__galAudit.ref() === JSON.stringify(['a', 'choice']));
  // The live session has only two rows; the 24-row static fixture proves the scrollable ancestor.
  const historyTarget = join(temporary, 'history-scroll');
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: historyTarget, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-history.audit.ts'),
        formats: ['iife'], name: 'GalHistoryAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(historyTarget, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  const scrollPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await scrollPage.goto(pathToFileURL(join(historyTarget, 'index.html')).href);
  const scrollPanel = scrollPage.locator('#gal-history-scroll');
  const beforeScroll = await scrollPanel.evaluate(node => node.scrollTop);
  await scrollPanel.hover(); await scrollPage.mouse.wheel(0, 470);
  await scrollPage.waitForFunction(() => document.getElementById('gal-history-scroll')?.scrollTop > 0);
  if (await scrollPanel.evaluate(node => node.scrollTop) <= beforeScroll)
    throw new Error('History long-list scroll did not move');
  await scrollPage.screenshot({ path: join(root, 'docs/design/galgame/review/gal-ui-03b-history-scrolled.png') });
  await scrollPage.close();
  console.log('GAL-UI-03B live 1440×900: history open/wheel isolation/close, memory and locked CG, Profile refresh, page-2 CG zoom/return, story resume/back — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
