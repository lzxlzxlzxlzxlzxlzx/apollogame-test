// Short-lived, isolated file:// browser acceptance; no ZeroCraft service or owner profile.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'pui-icon-only-'));
const browserPath = [process.env.UI_AUDIT_CHROMIUM, chromium.executablePath(),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((path) => path && existsSync(path));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error', build: { write: true, outDir: temporary,
    emptyOutDir: false, lib: { entry: join(root, 'src/ui/components/icon-only-button.audit.ts'), formats: ['iife'], name: 'IconOnlyAudit', fileName: () => 'fixture.js' } } });
  writeFileSync(join(temporary, 'audit.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="./fixture.js"></script>');
  browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 760, height: 360 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${pathToFileURL(join(temporary, 'audit.html')).href}${theme === 'light' ? '#light' : ''}`);
    const ready = page.locator('#icon-ready');
    const failed = page.locator('#icon-failed');
    const disabled = page.locator('#icon-disabled');
    await ready.locator('img').evaluate((image) => image.decode());
    await page.waitForFunction(() => document.getElementById('icon-ready')?.hasAttribute('data-apollo-icon-loaded'));
    if (process.env.SABOTAGE_ICON_ONLY === '1' && theme === 'dark') {
      const hits = await page.evaluate(() => {
        const style = document.getElementById('apollo-ui-keyframes');
        const anchor = '[data-apollo-icon-only][data-apollo-icon-loaded] [data-apollo-icon-label]{display:none!important}';
        const source = style?.textContent ?? '';
        const count = source.split(anchor).length - 1;
        if (count === 1) style.textContent = source.replace(anchor, '');
        return count;
      });
      assert(hits === 1, `sabotage CSS anchor hit ${hits}, expected exactly 1`);
      console.log('sabotage CSS anchor hit=1; isolated browser rule removed');
    }
    assert(await ready.evaluate((el) => getComputedStyle(el.querySelector('[data-apollo-icon-label]')).display === 'none'), `${theme} loaded label remained visible`);
    assert(await ready.getAttribute('aria-label') === '背包', `${theme} missing accessible name`);
    assert(await failed.evaluate((el) => getComputedStyle(el.querySelector('[data-apollo-icon-label]')).display !== 'none'), `${theme} missing-image fallback hidden`);
    assert(await disabled.isDisabled(), `${theme} disabled flag missing`);
    const readyBox = await ready.boundingBox(); const narrowBox = await disabled.boundingBox();
    assert(readyBox?.width === 48 && readyBox.height === 48, `${theme} 48px icon box drifted`);
    assert(narrowBox?.width === 32 && narrowBox.height === 32, `${theme} 32px icon box drifted`);
    await page.keyboard.press('Tab');
    assert(await ready.evaluate((el) => el === document.activeElement && el.matches(':focus-visible')), `${theme} first Tab did not focus icon button`);
    assert(await ready.evaluate((el) => getComputedStyle(el).outlineWidth !== '0px'), `${theme} focus ring invisible`);
    await page.keyboard.press('Enter');
    assert(await page.evaluate(() => window.__iconActions) === 1, `${theme} Enter did not act once`);
    await page.keyboard.press('Space');
    assert(await page.evaluate(() => window.__iconActions) === 2, `${theme} Space did not act once`);
    await ready.hover();
    assert(await ready.evaluate((el) => el.matches(':hover')), `${theme} hover missing`);
    await page.mouse.down();
    assert(await ready.evaluate((el) => el.matches(':active')), `${theme} pressed missing`);
    await page.mouse.up();
    assert(await page.evaluate(() => window.__iconActions) === 3, `${theme} mouse did not act once`);
    await disabled.click({ force: true });
    assert(await page.evaluate(() => window.__iconActions) === 3, `${theme} disabled acted`);
    await page.keyboard.press('Tab');
    assert(!(await disabled.evaluate((el) => el === document.activeElement)), `${theme} disabled entered tab order`);
    assert(errors.length === 0, `${theme} page errors: ${errors.join(' | ')}`);
    await page.evaluate(() => window.__iconUnmount());
    assert(await page.locator('button').count() === 0, `${theme} unmount leaked controls`);
    await context.close();
    console.log(`${theme}: native Tab/Enter/Space, hover/press, fallback, disabled, unmount PASS`);
  }
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
  console.log('isolated browser closed; temporary bundle removed');
}
