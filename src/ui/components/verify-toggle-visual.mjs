// Short-lived, isolated, file:// Chromium audit for Toggle.visual.
import { build } from 'vite';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'gal-pui-toggle-visual-'));
const shots = join(root, 'docs/design/galgame/self-check');
const browserPath = [process.env.UI_AUDIT_CHROMIUM, chromium.executablePath(),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((candidate) => candidate && existsSync(candidate));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = (page, id) => page.locator(`#${id} [data-apollo-toggle-track]`).evaluate((el) => {
  const track = getComputedStyle(el);
  const knob = el.querySelector('[data-apollo-toggle-knob]');
  const thumb = getComputedStyle(knob);
  return { width: track.width, height: track.height, bg: track.backgroundColor, border: track.borderTopColor,
    knobWidth: thumb.width, knobBg: thumb.backgroundColor, left: thumb.left, top: thumb.top };
});
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error', build: { write: true, outDir: temporary,
    emptyOutDir: false, lib: { entry: join(root, 'src/ui/components/toggle-visual.audit.ts'), formats: ['iife'], name: 'ToggleVisualAudit', fileName: () => 'fixture.js' } } });
  writeFileSync(join(temporary, 'audit.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script src="./fixture.js"></script></body>');
  browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
  mkdirSync(shots, { recursive: true });
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 320 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(join(temporary, 'audit.html')).href}${theme === 'light' ? '#light' : ''}`);
    if (process.env.SABOTAGE_TOGGLE_VISUAL === '1' && theme === 'dark') {
      const hits = await page.locator('#measured [data-apollo-toggle-track]').count();
      assert(hits === 1, `sabotage Toggle.visual track anchor hit ${hits}, expected 1`);
      await page.locator('#measured [data-apollo-toggle-track]').evaluate((el) => { el.style.background = '#000'; });
      console.log('sabotage Toggle.visual track anchor hit=1; isolated browser track color changed');
    }
    if (process.env.SABOTAGE_TOGGLE_LABEL === '1' && theme === 'dark') {
      const hits = await page.locator('#measured-i[aria-label="自动语音"]').count();
      assert(hits === 1, `sabotage Toggle.visual accessible-name anchor hit ${hits}, expected 1`);
      await page.locator('#measured-i').evaluate((el) => el.removeAttribute('aria-label'));
      console.log('sabotage Toggle.visual accessible-name anchor hit=1; isolated browser aria-label removed');
    }
    const off = await read(page, 'measured');
    assert(JSON.stringify(off) === JSON.stringify({ width: '75px', height: '31px', bg: 'rgb(27, 36, 69)', border: 'rgb(216, 195, 137)', knobWidth: '22px', knobBg: 'rgb(139, 154, 195)', left: '4px', top: '3px' }), `${theme} off mismatch ${JSON.stringify(off)}`);
    assert((await page.locator('#measured label').textContent()).trim() === '', `${theme} measured Toggle repeats the external row name`);
    assert((await page.locator('#disabled label').textContent()).trim() === '', `${theme} disabled Toggle repeats the external row name`);
    assert(await page.getByRole('checkbox', { name: '自动语音' }).count() === 1, `${theme} measured checkbox lacks accessible name`);
    assert(await page.getByRole('checkbox', { name: '禁用' }).count() === 1, `${theme} disabled checkbox lacks accessible name`);
    const disabled = await read(page, 'disabled');
    assert(disabled.bg === 'rgb(91, 103, 158)' && disabled.left === '46px', `${theme} disabled checked visual ${JSON.stringify(disabled)}`);
    const legacy = await read(page, 'legacy').catch(() => null);
    assert(legacy === null, `${theme} legacy unexpectedly acquired measured visual`);
    assert((await page.locator('#legacy').innerHTML()).includes('width:36px;height:20px'), `${theme} legacy size drift`);
    const disabledInput = page.locator('#disabled-i');
    assert(await disabledInput.isDisabled(), `${theme} disabled input active`);
    await page.screenshot({ path: join(shots, `pui-toggle-visual-${theme}-off.png`) });
    await page.locator('#measured label').click();
    const on = await read(page, 'measured');
    assert(on.bg === 'rgb(91, 103, 158)' && on.knobBg === 'rgb(239, 241, 255)' && on.left === '46px', `${theme} on mismatch ${JSON.stringify(on)}`);
    assert((await page.evaluate(() => window.__toggleActions)).join(',') === 'toggle.voice:true', `${theme} pointer ActionSink mismatch`);
    await page.screenshot({ path: join(shots, `pui-toggle-visual-${theme}-on.png`) });
    await page.locator('#measured-i').focus();
    await page.keyboard.press('Space');
    const afterSpace = await read(page, 'measured');
    assert(afterSpace.left === '4px', `${theme} keyboard Space did not toggle off`);
    assert((await page.evaluate(() => window.__toggleActions)).join(',') === 'toggle.voice:true,toggle.voice:false', `${theme} keyboard ActionSink mismatch`);
    await page.locator('#disabled label').click({ force: true });
    assert((await page.evaluate(() => window.__toggleActions)).length === 2, `${theme} disabled input enqueued`);
    console.log(`${theme}: off/on/disabled/legacy/pointer/keyboard PASS`);
    await context.close();
  }
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
  console.log('isolated Chromium closed; temporary bundle removed');
}
