// GAL-ENG-06A static-file browser acceptance; no app server, persistent port or account.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-playback-'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'GalPlaybackAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => !!window.__galAudit);
  await page.locator('#starter-act-0').click();
  await page.waitForFunction(async () => window.__galAudit.page() === 'story' && await window.__galAudit.readIntro());
  await page.locator('#gal-story-auto').click();
  await page.waitForFunction(() => window.__galAudit.ref() === JSON.stringify(['a', 'choice']));
  if (await page.evaluate(() => window.__galAudit.playbackMode()) !== 'off') throw new Error('auto did not stop at choice');
  if (!await page.locator('#gal-story-options').isVisible()) throw new Error('choice is not visible');
  await page.mouse.move(700, 760); await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => window.__galAudit.ref() === JSON.stringify(['a', 'intro']));
  if (!await page.locator('#gal-story-auto').isVisible()) throw new Error('manual rollback lost playback control');
  console.log('GAL-ENG-06A static browser: real click auto → visible choice stop → real wheel rollback — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
