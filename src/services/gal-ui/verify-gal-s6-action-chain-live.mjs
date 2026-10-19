// Real mounted GAL chain. Memory-only ports, isolated static file, no owner profile/database.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../../..'), tempRoot = resolve(tmpdir());
const temporary = await mkdtemp(join(tempRoot, 'gal-s6-action-chain-'));
const relativeTemp = relative(tempRoot, temporary);
assert.ok(relativeTemp && !relativeTemp.startsWith('..') && !isAbsolute(relativeTemp));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'GalS6ActionChain', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => !!window.__galAudit);
  const waitPage = name => page.waitForFunction(value => window.__galAudit.page() === value, name);
  const waitRefChange = ref => page.waitForFunction(value => window.__galAudit.ref() !== value, ref);
  const currentRef = () => page.evaluate(() => window.__galAudit.ref());
  const shot = async name => {
    if (process.argv.includes('--transient-shots')) return;
    await page.screenshot({ path: join(root, `docs/design/galgame/self-check/shots/GAL-ART-01A-s6-${name}.png`) });
  };
  const click = async id => page.locator(`#${id}`).click();
  const acceptIfAsked = async () => {
    if (await page.locator('#gal-confirm-yes').count()) await click('gal-confirm-yes');
  };

  assert.equal(await page.evaluate(() => window.__galAudit.page()), 'home');
  await click('starter-act-0'); await waitPage('story');
  const intro = await currentRef();
  await shot('01-start');
  await click('gal-story-dialogue'); await waitRefChange(intro);
  const choice = await currentRef();
  assert.equal(await page.locator('[data-action="narrative.choose"]').count(), 2);
  await shot('02-choice');

  // Empty load is an honest disabled state, never a successful read.
  await click('gal-story-load'); await waitPage('slots');
  await click('gal-slot-2');
  assert.equal(await page.locator('#gal-slots-commit').isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__galAudit.slot2()), false);
  await shot('03-empty-load');
  await page.locator('[data-action="gal.slot.back"]').click(); await waitPage('story');
  assert.equal(await currentRef(), choice);

  await page.locator('[data-action="narrative.choose"][data-arg="yes"]').click();
  await waitRefChange(choice);
  const yes = await currentRef();
  await click('gal-story-save'); await waitPage('slots');
  await click('gal-slot-2');
  assert.equal(await page.locator('#gal-slots-commit').isDisabled(), false);
  await click('gal-slots-commit'); await acceptIfAsked();
  await page.waitForFunction(() => window.__galAudit.slot2());
  assert.equal(await currentRef(), yes);
  await shot('04-saved');
  await page.locator('[data-action="gal.slot.back"]').click(); await waitPage('story');

  await page.locator('#gal-story-dialogue').dispatchEvent('wheel', { bubbles: true, deltaY: -120 });
  await page.waitForFunction(value => window.__galAudit.ref() === value, choice);
  await page.locator('[data-action="narrative.choose"][data-arg="no"]').click();
  await waitRefChange(choice);
  const no = await currentRef();
  assert.notEqual(no, yes);
  await shot('05-rechoice');
  await click('gal-story-load'); await waitPage('slots');
  await click('gal-slot-2'); await click('gal-slots-commit'); await acceptIfAsked();
  await waitPage('story');
  await page.waitForFunction(value => window.__galAudit.ref() === value, yes);
  await shot('06-loaded');

  const authoritativeHash = await page.evaluate(() => window.__galAudit.activeHash());
  const profileBeforeReplay = await page.evaluate(() => window.__galAudit.profileJson());
  await page.evaluate(() => window.__galAudit.unlockMemory('memory-1'));
  await click('gal-story-home'); await acceptIfAsked(); await waitPage('home');
  await click('gal-home-gallery'); await waitPage('gallery');
  await click('gal-memory-play-memory-1'); await waitPage('story');
  assert.equal(await page.evaluate(() => window.__galAudit.replayMemoryId()), 'memory-1');
  assert.equal(await page.locator('#gal-story-save').count(), 0, 'replay must not offer manual save');
  await shot('07-replay');
  await click('gal-replay-exit'); await waitPage('gallery');
  assert.equal(await page.evaluate(() => window.__galAudit.activeHash()), authoritativeHash,
    'replay modified authoritative World');
  const profileAfterReplay = JSON.parse(await page.evaluate(() => window.__galAudit.profileJson()));
  const profileBefore = JSON.parse(profileBeforeReplay);
  assert.deepEqual(profileAfterReplay.readNodeIds, profileBefore.readNodeIds,
    'replay modified authoritative read history');
  await click('gal-gallery-back'); await waitPage('home');
  await click('starter-act-0'); await acceptIfAsked(); await waitPage('story');
  await page.waitForFunction(value => window.__galAudit.ref() === value, intro);
  assert.equal(await page.evaluate(() => window.__galAudit.slot2()), true,
    'new game unexpectedly removed manual save');
  await shot('08-restarted');
  await click('gal-story-dialogue');
  await page.waitForFunction(value => window.__galAudit.ref() === value, choice);
  assert.deepEqual(errors, []);
  console.log('GAL S6 real action chain PASS: start, choice, empty-load rejection, save, rollback/rechoice, load, isolated replay/exit, restart and advance.');
} finally {
  await browser?.close();
  assert.ok(temporary.startsWith(tempRoot + sep) && basename(temporary).startsWith('gal-s6-action-chain-'));
  await rm(temporary, { recursive: true, force: true });
}
