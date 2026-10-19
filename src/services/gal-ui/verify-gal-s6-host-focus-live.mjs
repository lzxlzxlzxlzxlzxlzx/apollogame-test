// S6 actual GalSliceHost keyboard/focus/modal chain. Isolated static file and memory-only ports.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../../..'), tempRoot = resolve(tmpdir());
const temporary = await mkdtemp(join(tempRoot, 'gal-s6-host-focus-'));
const relativeTemp = relative(tempRoot, temporary);
assert.ok(relativeTemp && !relativeTemp.startsWith('..') && !isAbsolute(relativeTemp));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'GalS6HostFocus', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => !!window.__galAudit);
  const waitPage = name => page.waitForFunction(value => window.__galAudit.page() === value, name);
  const activeIn = id => page.evaluate(id => !!document.activeElement?.closest(`#${id}`), id);
  const keyActivate = async id => { await page.locator(`#${id}`).focus(); await page.keyboard.press('Enter'); };
  const shot = async name => {
    if (process.argv.includes('--transient-shots')) return;
    await page.screenshot({ path: join(root, `docs/design/galgame/review/gal-s6-host-focus-${name}.png`) });
  };

  await keyActivate('starter-act-0'); await waitPage('story');
  await keyActivate('gal-story-settings'); await waitPage('settings');
  await keyActivate('gal-settings-tab-confirm');
  await page.waitForFunction(() => window.__galAudit.settingsTab() === 'confirm');
  await keyActivate('gal-settings-back'); await waitPage('story');

  await keyActivate('gal-story-history');
  await page.locator('#gal-history-modal [role="dialog"]').waitFor();
  assert.equal(await activeIn('gal-history-modal'), true, 'history must own focus');
  await page.keyboard.press('Tab');
  assert.equal(await activeIn('gal-history-modal'), true, 'Tab escaped history');
  await shot('history');
  await page.keyboard.press('Escape');
  await page.locator('#gal-history-modal').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.__galAudit.page()), 'story');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'gal-story-history',
    'history close must restore trigger focus');

  await keyActivate('gal-story-home');
  await page.locator('#gal-confirm [role="dialog"]').waitFor();
  assert.equal(await activeIn('gal-confirm'), true, 'confirmation must own focus');
  assert.equal(await page.locator('#gal-confirm [role="dialog"]').getAttribute('aria-modal'), 'true');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await activeIn('gal-confirm'), true, 'Shift+Tab escaped confirmation');
  await page.locator('#gal-story-save').dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__galAudit.page()), 'story', 'modal background action leaked');
  assert.equal(await page.evaluate(() => window.__galAudit.confirm()), 'return-title');
  await shot('confirm');
  await page.keyboard.press('Escape');
  await page.locator('#gal-confirm').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.__galAudit.page()), 'story');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'gal-story-home',
    'confirmation cancel must restore trigger focus');
  await keyActivate('gal-story-home');
  await keyActivate('gal-confirm-yes'); await waitPage('home');

  await keyActivate('gal-home-gallery'); await waitPage('gallery');
  await page.evaluate(async () => window.__galAudit.unlockCg('cg-1'));
  await keyActivate('gal-gallery-cg-tab');
  await page.locator('#gal-gallery-card-cg-1').click();
  await page.locator('#gal-cg-modal [role="dialog"]').waitFor();
  assert.equal(await activeIn('gal-cg-modal'), true, 'CG modal must own focus');
  await shot('cg');
  await page.keyboard.press('Escape');
  await page.locator('#gal-cg-modal').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.__galAudit.page()), 'gallery');
  await keyActivate('gal-gallery-back'); await waitPage('home');
  assert.deepEqual(errors, []);
  console.log('GAL S6 real host PASS: keyboard Enter across home/story/settings/gallery, history/confirm/CG modal focus trap, Escape exits, confirmation accept and return.');
} finally {
  await browser?.close();
  assert.ok(temporary.startsWith(tempRoot + sep) && basename(temporary).startsWith('gal-s6-host-focus-'));
  await rm(temporary, { recursive: true, force: true });
}
