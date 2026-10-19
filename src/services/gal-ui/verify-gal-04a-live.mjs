// GAL-UI-04A: static local build and isolated short-lived browser; no application service.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-04a-'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'Gal04AAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await page.waitForFunction(() => !!window.__galAudit);
  const waitPage = name => page.waitForFunction(value => window.__galAudit.page() === value, name);
  const capture = async name => page.screenshot({ path: join(root, `docs/design/galgame/review/gal-ui-04a-${name}.png`) });
  const boxes = async selectors => Object.fromEntries(await Promise.all(Object.entries(selectors).map(async ([name, selector]) =>
    [name, await page.locator(selector).boundingBox()])));

  await page.locator('#gal-home-settings').click(); await waitPage('settings');
  const actualText = await boxes({ shell: '#gal-settings-shell', heading: '#gal-settings-heading',
    tabs: '#gal-settings-tabs', grid: '#gal-settings-grid', footer: '#gal-settings-footer' });
  const actualCards = { text: await boxes({ first: '#gal-settings-text-card', second: '#gal-settings-input-card' }) };
  await capture('text');
  for (const tab of ['audio', 'display', 'confirm']) {
    if (tab === 'confirm') {
      await page.locator('#gal-settings-tab-confirm').hover();
      await capture('tab-hover');
      await page.mouse.down(); await capture('tab-pressed'); await page.mouse.up();
    }
    await page.locator(`#gal-settings-tab-${tab}`).click();
    await page.waitForFunction(value => window.__galAudit.settingsTab() === value, tab);
    const names = tab === 'audio' ? ['gal-settings-volume-card', 'gal-settings-audio-other-card'] :
      tab === 'display' ? ['gal-settings-display-card', 'gal-settings-accessibility-card'] :
        ['gal-settings-confirm-save', 'gal-settings-confirm-flow'];
    actualCards[tab] = await boxes({ first: `#${names[0]}`, second: `#${names[1]}` });
    await capture(tab);
  }
  if (!await page.locator('#gal-settings-reset').isDisabled())
    throw new Error('Global reset is actionable without real consumers');
  const toggle = key => page.locator(`#gal-confirm-toggle-${key} label`);
  await toggle('saveEmpty').click();
  await page.waitForFunction(() => window.__galAudit.confirmation('saveEmpty') === false);
  if (!await page.evaluate(() => window.__galAudit.confirmation('overwrite')))
    throw new Error('saveEmpty crossed into overwrite');
  await page.evaluate(() => window.__galAudit.failProfileWrite(true));
  await toggle('overwrite').click();
  await page.locator('#gal-slice-feedback').waitFor();
  if (!await page.evaluate(() => window.__galAudit.confirmation('overwrite')))
    throw new Error('failed Profile write changed authoritative preference');
  if (!await page.locator('#gal-confirm-toggle-overwrite input').isChecked())
    throw new Error('failed Profile write left optimistic checked state');
  await capture('failure');
  await page.evaluate(() => window.__galAudit.failProfileWrite(false));
  await page.locator('#gal-settings-back').click(); await waitPage('home');

  await page.locator('#starter-act-0').click(); await waitPage('story');
  const beforeWheel = await page.evaluate(() => window.__galAudit.ref());
  await page.locator('#gal-story-settings').click(); await waitPage('settings');
  await page.mouse.move(650, 450); await page.mouse.wheel(0, 120);
  if (await page.evaluate(() => window.__galAudit.ref()) !== beforeWheel)
    throw new Error('Settings wheel leaked to story');
  await page.locator('#gal-settings-nav-home').click();
  await page.waitForFunction(() => window.__galAudit.confirm() === 'return-title');
  if (await page.evaluate(() => window.__galAudit.page()) !== 'settings')
    throw new Error('Settings home navigation bypassed return-title policy');
  await page.locator('#gal-confirm-no').click();
  await page.locator('#gal-settings-back').click(); await waitPage('story');
  await page.locator('#gal-story-save').click(); await waitPage('slots');
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  if (await page.evaluate(() => window.__galAudit.confirm()) !== null)
    throw new Error('saveEmpty still prompted after disabling only saveEmpty');
  await page.waitForFunction(() => window.__galAudit.slot2());
  await page.locator('#gal-slots-commit').click();
  await page.waitForFunction(() => window.__galAudit.confirm() === 'overwrite');
  await page.locator('#gal-confirm-no').click();
  await page.locator('#gal-slot-2').click();
  await page.locator('#gal-mode-load').click();
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  await page.waitForFunction(() => window.__galAudit.confirm() === 'load');
  await page.locator('#gal-confirm-yes').click(); await waitPage('story');
  await page.locator('#gal-story-home').click();
  await page.waitForFunction(() => window.__galAudit.confirm() === 'return-title');
  await page.locator('#gal-confirm-no').click();
  await page.locator('#gal-story-settings').click(); await waitPage('settings');
  await page.locator('#gal-settings-tab-confirm').click();
  await toggle('returnTitle').click();
  await page.waitForFunction(() => window.__galAudit.confirmation('returnTitle') === false);
  await page.locator('#gal-settings-back').click(); await waitPage('story');
  await page.locator('#gal-story-home').click(); await waitPage('home');
  if (await page.evaluate(() => window.__galAudit.confirm()) !== null)
    throw new Error('returnTitle still prompted after its independent switch was disabled');
  await page.locator('#starter-act-0').click();
  await page.waitForFunction(() => window.__galAudit.confirm() === 'new-game');
  await page.locator('#gal-confirm-no').click();
  await page.locator('#gal-home-settings').click(); await waitPage('settings');
  await page.locator('#gal-settings-tab-confirm').click();
  await toggle('newGame').click();
  await page.waitForFunction(() => window.__galAudit.confirmation('newGame') === false);
  await toggle('load').click();
  await page.waitForFunction(() => window.__galAudit.confirmation('load') === false);
  await toggle('exitGame').click();
  await page.waitForFunction(() => window.__galAudit.confirmation('exitGame') === false);
  await page.locator('#gal-settings-back').click(); await waitPage('home');
  await page.locator('#starter-act-0').click(); await waitPage('story');
  if (await page.evaluate(() => window.__galAudit.confirm()) !== null)
    throw new Error('newGame still prompted after its independent switch was disabled');

  const prototype = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await prototype.goto(pathToFileURL(join(root, 'docs/design/galgame/gal-ui-complete-v2.dc.html')).href);
  await prototype.locator('#home [data-open="settings"]').click();
  const prototypeText = Object.fromEntries(await Promise.all(Object.entries({
    shell: '#settings .panel-skin', heading: '#settings .sys-heading', tabs: '#settings .settings-tabs',
    grid: '#settings .settings-grid', footer: '#settings .sys-foot',
  }).map(async ([name, selector]) => [name, await prototype.locator(selector).first().boundingBox()])));
  const prototypeCards = {};
  for (const tab of ['text', 'audio', 'display', 'confirm']) {
    if (tab !== 'text') await prototype.locator(`#settings [data-settings-tab="${tab}"]`).click();
    const active = prototype.locator('#settings .settings-tab.active .settings-card');
    prototypeCards[tab] = { first: await active.nth(0).boundingBox(), second: await active.nth(1).boundingBox() };
    await prototype.screenshot({ path: join(root, `docs/design/galgame/review/gal-ui-04a-prototype-${tab}.png`) });
  }
  await prototype.close();
  console.log(JSON.stringify({ actualText, prototypeText, actualCards, prototypeCards }));
  console.log('GAL-UI-04A live 1440×900: four tabs, six keys, save failure, wheel isolation, empty save/overwrite/load/new game/return title — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
