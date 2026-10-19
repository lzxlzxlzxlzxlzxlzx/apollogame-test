// GAL-ENG-06C static-file browser acceptance. No application server or real business storage.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-replay-'));
const screenshotDir = process.argv.includes('--transient-shots') ? temporary :
  join(root, 'docs/design/galgame/review');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'GalReplayAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => !!window.__galAudit);
  await page.locator('#starter-act-0').click();
  await page.waitForFunction(() => window.__galAudit.page() === 'story');
  await page.locator('#gal-story-home').click();
  await page.locator('#gal-confirm-yes').click();
  await page.evaluate(async () => await window.__galAudit.unlockMemory('memory-1'));
  await page.locator('#gal-home-gallery').click();
  await page.waitForFunction(() => window.__galAudit.page() === 'gallery');
  if (await page.locator('#gal-memory-play-memory-2').count()) throw new Error('Locked memory got a play control');
  const before = await page.evaluate(async () => ({ hash: window.__galAudit.activeHash(),
    profile: await window.__galAudit.profileJson(), slots: await window.__galAudit.slotsJson(),
    ref: window.__galAudit.ref() }));
  await page.locator('#gal-memory-play-memory-1').click();
  await page.waitForFunction(() => window.__galAudit.replayMemoryId() === 'memory-1');
  await page.screenshot({ path: join(screenshotDir, 'gal-eng-06c-replay.png') });
  if (await page.locator('#gal-story-save').count()) throw new Error('Replay exposed save control');
  await page.locator('#gal-story-advance').click();
  await page.locator('[data-action="narrative.choose"][data-arg="yes"]').click();
  await page.mouse.move(700, 760); await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => window.__galAudit.visibleRef() === JSON.stringify(['a', 'choice']));
  await page.locator('[data-action="narrative.choose"][data-arg="no"]').click();
  await page.locator('#gal-story-advance').click();
  await page.waitForFunction(() => window.__galAudit.page() === 'gallery');
  if (await page.evaluate(() => document.activeElement?.id) !== 'gal-memory-play-memory-1')
    throw new Error('Replay did not restore gallery focus');
  const after = await page.evaluate(async () => ({ hash: window.__galAudit.activeHash(),
    profile: await window.__galAudit.profileJson(), slots: await window.__galAudit.slotsJson(),
    ref: window.__galAudit.ref() }));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Replay mutated active state');
  await page.screenshot({ path: join(screenshotDir, 'gal-eng-06c-return.png') });
  await page.locator('#gal-memory-play-memory-1').click();
  await page.locator('#gal-replay-exit').click();
  await page.waitForFunction(() => window.__galAudit.page() === 'gallery');
  console.log('GAL-ENG-06C static file 1440×900: locked control, gallery click, two branches, wheel rollback, completion/exit, focus and active-state preservation — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
