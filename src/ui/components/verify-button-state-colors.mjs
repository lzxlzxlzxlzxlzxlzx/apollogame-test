// Short-lived file:// Chromium probe for the native Button four-state palette.
import { build } from 'vite';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'gal-pui-button-state-'));
const shots = join(root, 'docs/design/galgame/self-check');
const browserPath = [process.env.UI_AUDIT_CHROMIUM, chromium.executablePath(),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((candidate) => candidate && existsSync(candidate));
let browser;

const rgb = (r, g, b) => `rgb(${r}, ${g}, ${b})`;
const read = (page, selector) => page.locator(selector).evaluate((el) => {
  const style = getComputedStyle(el);
  return { bg: style.backgroundColor, border: style.borderTopColor, color: style.color, opacity: style.opacity,
    disabled: el.hasAttribute('disabled'), focused: el.matches(':focus-visible') };
});
const waitBg = (page, value) => page.waitForFunction((expected) => getComputedStyle(document.getElementById('state-enabled')).backgroundColor === expected, value, { timeout: 3000 });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const luminance = (value) => {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert(channels?.length === 3, `cannot parse RGB ${value}`);
  return channels.map((channel) => { const n = channel / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
};
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const checkContrast = (state, label) => assert(contrast(state.bg, state.color) >= 4.5, `${label} text contrast ${contrast(state.bg, state.color).toFixed(2)} < 4.5`);

try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/ui/components/button-state-colors.audit.ts'), formats: ['iife'], name: 'ButtonStateAudit', fileName: () => 'fixture.js' } } });
  writeFileSync(join(temporary, 'audit.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script src="./fixture.js"></script></body>');
  browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
  mkdirSync(shots, { recursive: true });
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 760, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(join(temporary, 'audit.html')).href}${theme === 'light' ? '#light' : ''}`);
    const enabled = page.locator('#state-enabled');
    const disabled = page.locator('#state-disabled');
    const defaultState = await read(page, '#state-enabled');
    assert(defaultState.bg === rgb(16, 26, 54), `${theme} default background ${defaultState.bg}`);
    assert(defaultState.border === rgb(215, 189, 128), `${theme} default border ${defaultState.border}`);
    checkContrast(defaultState, `${theme} default`);
    if (process.env.SABOTAGE_BUTTON_STATES === '1' && theme === 'dark') {
      const hits = await page.evaluate(() => {
        const style = document.getElementById('apollo-ui-keyframes');
        const anchor = '[data-apollo-btn][data-apollo-state-colors]:not([disabled]):hover{background:var(--apollo-btn-hover-bg)!important;border-color:var(--apollo-btn-hover-border)!important;color:var(--apollo-btn-hover-text)!important}';
        const before = style?.textContent ?? '';
        const count = before.split(anchor).length - 1;
        if (count === 1) style.textContent = before.replace(anchor, '');
        return count;
      });
      assert(hits === 1, `sabotage hover selector anchor hit ${hits}, expected exactly 1`);
      console.log('sabotage hover selector anchor hit=1; isolated browser CSS rule removed');
    }
    await page.screenshot({ path: join(shots, `pui-button-states-${theme}-default.png`) });
    await enabled.hover();
    await waitBg(page, rgb(83, 92, 145));
    const hoverState = await read(page, '#state-enabled');
    assert(hoverState.border === rgb(228, 214, 170), `${theme} hover border ${hoverState.border}`);
    checkContrast(hoverState, `${theme} hover`);
    await page.screenshot({ path: join(shots, `pui-button-states-${theme}-hover.png`) });
    await page.mouse.down();
    await waitBg(page, rgb(41, 51, 89));
    const pressed = await read(page, '#state-enabled');
    assert(pressed.border === rgb(241, 214, 145), `${theme} pressed border ${pressed.border}`);
    checkContrast(pressed, `${theme} pressed`);
    await page.screenshot({ path: join(shots, `pui-button-states-${theme}-pressed.png`) });
    await page.mouse.up();
    assert((await page.evaluate(() => window.__stateActions)) === 1, `${theme} native click did not enqueue exactly once`);
    const off = await read(page, '#state-disabled');
    assert(off.disabled && off.bg === rgb(48, 56, 75) && off.opacity === '1', `${theme} disabled palette ${JSON.stringify(off)}`);
    checkContrast(off, `${theme} disabled`);
    await disabled.click({ force: true });
    assert((await page.evaluate(() => window.__stateActions)) === 1, `${theme} disabled click enqueued`);
    await page.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i < 4 && !(await read(page, '#state-enabled')).focused; i++) await page.keyboard.press('Tab');
    const focus = await read(page, '#state-enabled');
    assert(focus.focused, `${theme} enabled Button lacks keyboard :focus-visible`);
    assert(!(await read(page, '#state-disabled')).focused, `${theme} disabled Button entered focus order`);
    await page.screenshot({ path: join(shots, `pui-button-states-${theme}-focus.png`) });
    console.log(`${theme}: default/hover/pressed/disabled/focus/action PASS`);
    await context.close();
  }
  // A real touch pointer held down must enter the pressed palette, not merely dispatch a synthetic JS event.
  const touch = await browser.newContext({ viewport: { width: 760, height: 360 }, hasTouch: true, isMobile: true });
  const page = await touch.newPage();
  await page.goto(pathToFileURL(join(temporary, 'audit.html')).href);
  const bounds = await page.locator('#state-enabled').boundingBox();
  assert(!!bounds, 'touch target absent');
  const cdp = await touch.newCDPSession(page);
  const x = Math.round(bounds.x + bounds.width / 2);
  const y = Math.round(bounds.y + bounds.height / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await waitBg(page, rgb(41, 51, 89));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert(!(await page.locator('#state-enabled').evaluate((el) => el.hasAttribute('data-apollo-pressed'))), 'touch press marker leaked after release');
  assert((await page.evaluate(() => window.__stateActions)) === 1, 'touch release did not enqueue exactly once');
  console.log('touch held-pressed: PASS');
  await touch.close();
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
  console.log('isolated Chromium closed; temporary bundle removed');
}
