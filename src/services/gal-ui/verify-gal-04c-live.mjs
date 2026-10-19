// GAL-UI-04C: compare the approved prototype and real LayoutNode settings at 1440×900.
// Builds a temporary static file; never starts an application server or uses real storage.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-04c-'));
const screenshotDir = process.argv.includes('--transient-shots') ? temporary :
  join(root, 'docs/design/galgame/review');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
const target = {
  shell: [18, 61, 1404, 824], heading: [84, 109, 1272, 61],
  tabs: [84, 185, 1272, 44],
  footer: [84, 782, 1272, 51], bar: [31, 14, 1378, 42],
};
const actualSelectors = { shell: '#gal-settings-shell', heading: '#gal-settings-heading',
  tabs: '#gal-settings-tabs', grid: '#gal-settings-grid', footer: '#gal-settings-footer',
  bar: '#gal-settings-system-bar', nav: '#gal-settings-nav' };
const prototypeSelectors = { shell: '#settings .panel-skin', heading: '#settings .sys-heading',
  tabs: '#settings .settings-tabs', grid: '#settings .settings-tab.active .settings-grid', footer: '#settings .sys-foot',
  bar: '#settings .system-bar', nav: '#settings .system-nav' };
const cardSelectors = {
  text: ['gal-settings-text-card', 'gal-settings-input-card'],
  audio: ['gal-settings-volume-card', 'gal-settings-audio-other-card'],
  display: ['gal-settings-display-card', 'gal-settings-accessibility-card'],
  confirm: ['gal-settings-confirm-save', 'gal-settings-confirm-flow'],
};
const rect = box => box && [box.x, box.y, box.width, box.height].map(value => Math.round(value));
const boxes = async (page, selectors) => Object.fromEntries(await Promise.all(Object.entries(selectors).map(async ([key, selector]) =>
  [key, rect(await page.locator(selector).first().boundingBox())])));
const delta = (actual, expected) => actual.map((value, index) => value - expected[index]);
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-live-wheel.audit.ts'),
        formats: ['iife'], name: 'Gal04CAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const actual = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const prototype = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await actual.goto(pathToFileURL(join(temporary, 'index.html')).href);
  await prototype.goto(pathToFileURL(join(root, 'docs/design/galgame/gal-ui-complete-v2.dc.html')).href);
  await actual.waitForFunction(() => !!window.__galAudit);
  await actual.locator('#gal-home-settings').click();
  await prototype.locator('#home [data-open="settings"]').click();
  const report = {};
  for (const tab of ['text', 'audio', 'display', 'confirm']) {
    if (tab !== 'text') {
      await actual.locator(`#gal-settings-tab-${tab}`).click();
      await actual.waitForFunction(value => window.__galAudit.settingsTab() === value, tab);
      await prototype.locator(`#settings [data-settings-tab="${tab}"]`).click();
    }
    const a = await boxes(actual, actualSelectors);
    const p = await boxes(prototype, prototypeSelectors);
    const aCards = await boxes(actual, {
      first: `#${cardSelectors[tab][0]}`, second: `#${cardSelectors[tab][1]}`,
    });
    const pCards = { first: rect(await prototype.locator('#settings .settings-tab.active .settings-card').nth(0).boundingBox()),
      second: rect(await prototype.locator('#settings .settings-tab.active .settings-card').nth(1).boundingBox()) };
    const tabTarget = { ...target, grid: [84, 244, 1272, tab === 'text' || tab === 'audio' ? 320 : 256] };
    report[tab] = { target: tabTarget, actual: a, prototype: p, cards: { actual: aCards, prototype: pCards } };
    for (const [name, expected] of Object.entries(tabTarget)) {
      if (!a[name] || delta(a[name], expected).some(value => Math.abs(value) > 1))
        throw new Error(`${tab} ${name} mismatched fixed target: ${JSON.stringify({ actual: a[name], expected })}`);
    }
    for (const name of ['nav', 'grid']) {
      if (!a[name] || !p[name] || delta(a[name], p[name]).some(value => Math.abs(value) > 1))
        throw new Error(`${tab} ${name} mismatched prototype: ${JSON.stringify({ actual: a[name], prototype: p[name] })}`);
    }
    for (const name of ['first', 'second']) {
      if (!aCards[name] || !pCards[name] || delta(aCards[name], pCards[name]).some(value => Math.abs(value) > 1))
        throw new Error(`${tab} ${name} card moved: ${JSON.stringify({ actual: aCards[name], prototype: pCards[name] })}`);
    }
    const inside = a.nav[1] + a.nav[3] <= a.shell[1];
    if (!inside) throw new Error(`${tab} navigation is not outside the system frame`);
    await actual.screenshot({ path: join(screenshotDir, `gal-ui-04c-${tab}.png`) });
    await prototype.screenshot({ path: join(screenshotDir, `gal-ui-04c-prototype-${tab}.png`) });
  }
  await actual.locator('#gal-settings-back').click();
  await actual.locator('#starter-act-0').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'story');
  await actual.locator('#gal-story-settings').click();
  await actual.locator('#gal-settings-nav-home').click();
  await actual.locator('#gal-confirm').waitFor({ state: 'visible' });
  if (await actual.evaluate(() => window.__galAudit.page()) !== 'settings')
    throw new Error('Confirmation bypassed settings page');
  const modalNav = rect(await actual.locator('#gal-settings-nav').boundingBox());
  if (!modalNav || delta(modalNav, report.text.prototype.nav).some(value => Math.abs(value) > 1))
    throw new Error('Navigation geometry changed behind confirmation');
  await actual.screenshot({ path: join(screenshotDir, 'gal-ui-04c-confirm-modal.png') });
  await actual.locator('#gal-confirm-no').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'settings');
  await actual.locator('#gal-settings-nav-home').click();
  await actual.locator('#gal-confirm-yes').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'home');
  await actual.locator('#gal-home-settings').click();
  await actual.locator('#gal-settings-tab-confirm').click();
  if (!await actual.locator('#gal-settings-reset').isDisabled()) throw new Error('Unimplemented reset became enabled');
  for (const id of ['gal-setting-master-control', 'gal-setting-fullscreen-control']) {
    const input = actual.locator(`#${id} input, #${id} button`).first();
    if (await input.count() && !await input.isDisabled()) throw new Error(`${id} became enabled`);
  }
  for (const key of ['saveEmpty', 'overwrite', 'load', 'newGame', 'returnTitle', 'exitGame']) {
    await actual.locator(`#gal-confirm-toggle-${key} label`).click();
    await actual.waitForFunction(value => window.__galAudit.confirmation(value) === false, key);
  }
  await actual.locator('#gal-settings-back').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'home');
  await actual.locator('#starter-act-0').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'story');
  await actual.locator('#gal-story-auto').click();
  if (await actual.evaluate(() => window.__galAudit.playbackMode()) !== 'auto') throw new Error('Auto regressed');
  await actual.locator('#gal-story-settings').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'settings');
  const beforeWheel = await actual.evaluate(() => window.__galAudit.ref());
  await actual.mouse.move(650, 450); await actual.mouse.wheel(0, 120);
  if (await actual.evaluate(() => window.__galAudit.ref()) !== beforeWheel) throw new Error('Settings wheel leaked to story');
  await actual.locator('#gal-settings-nav-home').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'home');
  await actual.locator('#starter-act-1').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'story');
  await actual.locator('#gal-story-skip').click();
  if (await actual.evaluate(() => window.__galAudit.playbackMode()) !== 'skip') throw new Error('Skip regressed');
  await actual.locator('#gal-story-settings').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'settings');
  await actual.locator('#gal-settings-tab-confirm').click();
  await actual.locator('#gal-settings-nav-home').click();
  await actual.waitForFunction(() => window.__galAudit.page() === 'home');
  console.log(JSON.stringify(report));
  console.log('GAL-UI-04C static file 1440×900: four-page geometry, outside nav, settings/Auto/Skip/confirm controls and wheel isolation — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
