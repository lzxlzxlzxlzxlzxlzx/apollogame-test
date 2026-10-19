// S4 browser player-chain check; local static build, isolated headless browser, no service.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-wheel-'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'GalLiveAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => !!window.__galAudit);
  const waitRef = async (nodeId) => page.waitForFunction(id => window.__galAudit.ref() === JSON.stringify(['a', id]), nodeId);
  const waitPage = async (name) => page.waitForFunction(value => window.__galAudit.page() === value, name);
  const screenshot = async (name) => page.screenshot({ path: join(root, `docs/design/galgame/review/gal-ui-03a-live-${name}.png`) });
  await page.locator('#starter-act-0').click(); await waitPage('story');
  await page.waitForFunction(async () => await window.__galAudit.readIntro());
  await screenshot('intro');
  await page.mouse.move(700, 760); await page.mouse.wheel(0, 120); await waitRef('choice');
  await screenshot('choice');
  await page.locator('[data-action="narrative.choose"][data-arg="yes"]').click(); await waitRef('yes');
  await page.mouse.wheel(0, -120); await waitRef('choice');
  await page.locator('[data-action="narrative.choose"][data-arg="no"]').click(); await waitRef('no');
  await screenshot('rechoice');
  await page.locator('#gal-story-save').click(); await waitPage('slots');
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  await page.waitForFunction(() => window.__galAudit.confirm() === 'save-empty');
  await page.locator('#gal-confirm-yes').click();
  await page.waitForFunction(() => window.__galAudit.slot2());
  await screenshot('saved-slot2');
  await page.locator('#gal-slots-back').click(); await waitPage('story');
  await page.mouse.move(700, 760); await page.mouse.wheel(0, -120); await waitRef('choice');
  await page.locator('#gal-story-load').click(); await waitPage('slots');
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  await page.waitForFunction(() => window.__galAudit.confirm() === 'load');
  await page.locator('#gal-confirm-yes').click(); await waitPage('story'); await waitRef('no');
  if (!await page.evaluate(async () => await window.__galAudit.readIntro())) throw new Error('Profile read state rewound');
  await screenshot('loaded-slot2');
  console.log('GAL-UI-03A live 1440×900: start, read, wheel↓, stable choice, wheel↑, rechoice, slot 2 save/load, Profile retained — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
