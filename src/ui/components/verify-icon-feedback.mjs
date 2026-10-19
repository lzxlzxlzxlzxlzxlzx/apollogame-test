// Isolated file:// visual and input proof; no ZeroCraft service or Owner profile.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'pui-icon-feedback-'));
const browserPath = [process.env.UI_AUDIT_CHROMIUM, chromium.executablePath(),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((path) => path && existsSync(path));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const closeTo = (actual, expected) => Math.abs(actual - expected) < 0.15;
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error', build: { write: true, outDir: temporary,
    emptyOutDir: false, lib: { entry: join(root, 'src/ui/components/icon-feedback.audit.ts'), formats: ['iife'], name: 'IconFeedbackAudit', fileName: () => 'fixture.js' } } });
  writeFileSync(join(temporary, 'audit.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="./fixture.js"></script>');
  browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 760, height: 360 }, hasTouch: true });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${pathToFileURL(join(temporary, 'audit.html')).href}${theme === 'light' ? '#light' : ''}`);
    const ready = page.locator('#feedback-ready');
    const image = ready.locator('[data-apollo-icon-img]');
    await image.evaluate((element) => element.decode());
    await page.waitForFunction(() => document.getElementById('feedback-ready')?.hasAttribute('data-apollo-icon-loaded'));
    const state = () => ready.evaluate((button) => {
      const img = button.querySelector('[data-apollo-icon-img]');
      const imageStyle = getComputedStyle(img);
      const buttonStyle = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(imageStyle.transform === 'none' ? undefined : imageStyle.transform);
      return { y: matrix.m42, filter: imageStyle.filter, transition: imageStyle.transitionDuration,
        buttonTransform: buttonStyle.transform, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    });
    const initial = await state();
    assert(initial.box.width === 60 && initial.box.height === 60, `${theme} outer size 60 drifted`);
    assert((await page.locator('#feedback-narrow').boundingBox())?.width === 42, `${theme} narrow outer size 42 drifted`);
    assert(closeTo(initial.y, 0), `${theme} default image translated`);
    assert(initial.buttonTransform === 'none', `${theme} button hit box transformed`);
    assert(await ready.getAttribute('aria-label') === '任务日志', `${theme} aria name missing`);
    assert(await page.locator('#feedback-missing [data-apollo-icon-label]').evaluate((el) => getComputedStyle(el).display !== 'none'), `${theme} broken image lost text fallback`);
    if (process.env.SABOTAGE_ICON_FEEDBACK === '1' && theme === 'dark') {
      const hits = await page.evaluate(() => {
        const style = document.getElementById('apollo-ui-keyframes');
        const anchor = '[data-apollo-icon-feedback]:not([disabled]):hover [data-apollo-icon-img]{transform:translateY(var(--apollo-icon-hover-y));filter:brightness(var(--apollo-icon-hover-brightness)) drop-shadow(0 0 var(--apollo-icon-glow-radius) var(--apollo-icon-glow-color))}';
        const source = style?.textContent ?? '';
        const count = source.split(anchor).length - 1;
        if (count === 1) style.textContent = source.replace(anchor, '');
        return count;
      });
      assert(hits === 1, `sabotage CSS anchor hit ${hits}, expected 1`);
      console.log('sabotage CSS anchor hit=1; isolated hover rule removed');
    }
    await page.keyboard.press('Tab');
    assert(await ready.evaluate((el) => el === document.activeElement && el.matches(':focus-visible') && getComputedStyle(el).outlineWidth !== '0px'), `${theme} native focus ring missing`);
    await ready.hover(); await page.waitForTimeout(160);
    const hover = await state();
    assert(closeTo(hover.y, -3), `${theme} hover image y=${hover.y}, expected -3`);
    assert(hover.filter.includes('brightness(1.2)') && hover.filter.includes('5px') && hover.filter.includes('214, 182, 239'), `${theme} hover filter=${hover.filter}`);
    assert(JSON.stringify(hover.box) === JSON.stringify(initial.box), `${theme} hover moved button hit box`);
    await page.mouse.down(); await page.waitForTimeout(160);
    const pressed = await state();
    assert(closeTo(pressed.y, 3), `${theme} pressed image y=${pressed.y}, expected +3`);
    assert(pressed.filter === 'brightness(0.85)', `${theme} pressed retained hover glow: ${pressed.filter}`);
    assert(JSON.stringify(pressed.box) === JSON.stringify(initial.box), `${theme} pressed moved button hit box`);
    await page.mouse.up();
    assert(await page.evaluate(() => window.__feedbackActions) === 1, `${theme} pointer click not exactly once`);
    await ready.focus();
    await page.keyboard.down('Enter'); await page.waitForTimeout(160);
    assert(closeTo((await state()).y, 3), `${theme} Enter keydown missing pressed visual`);
    await page.keyboard.up('Enter');
    assert(await page.evaluate(() => window.__feedbackActions) === 2, `${theme} Enter action count drifted`);
    await page.keyboard.down('Space'); await page.waitForTimeout(160);
    assert(closeTo((await state()).y, 3), `${theme} Space keydown missing pressed visual`);
    await page.keyboard.up('Space');
    assert(await page.evaluate(() => window.__feedbackActions) === 3, `${theme} Space action count drifted`);
    await page.evaluate(() => document.getElementById('feedback-ready').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, button: 0 })));
    assert(await ready.evaluate((el) => el.hasAttribute('data-apollo-pressed')), `${theme} touch-like pointerdown did not mark pressed`);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 77, button: 0 })));
    assert(await ready.evaluate((el) => !el.hasAttribute('data-apollo-pressed')), `${theme} pointer cancel left pressed mark`);
    const tapBox = await ready.boundingBox();
    assert(tapBox !== null, `${theme} touch target has no box`);
    await page.touchscreen.tap(tapBox.x + tapBox.width / 2, tapBox.y + tapBox.height / 2);
    assert(await page.evaluate(() => window.__feedbackActions) === 4, `${theme} native touch tap action count drifted`);
    assert(await ready.evaluate((el) => !el.hasAttribute('data-apollo-pressed')), `${theme} touch tap left pressed mark`);
    const disabled = page.locator('#feedback-disabled');
    assert(await disabled.isDisabled(), `${theme} disabled semantics missing`);
    const disabledStyle = await disabled.evaluate((button) => ({ opacity: getComputedStyle(button).opacity,
      filter: getComputedStyle(button.querySelector('[data-apollo-icon-img]')).filter,
      transform: getComputedStyle(button.querySelector('[data-apollo-icon-img]')).transform }));
    assert(disabledStyle.opacity === '0.48' && disabledStyle.filter === 'grayscale(0.7)' && disabledStyle.transform === 'none', `${theme} disabled visual ${JSON.stringify(disabledStyle)}`);
    await disabled.click({ force: true });
    assert(await page.evaluate(() => window.__feedbackActions) === 4, `${theme} disabled action leaked`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert((await state()).transition.split(',').every((part) => part.trim() === '0s'), `${theme} reduced motion retained transition`);
    assert(errors.length === 0, `${theme} page errors: ${errors.join(' | ')}`);
    await page.evaluate(() => window.__feedbackUnmount());
    assert(await page.locator('button').count() === 0, `${theme} unmount left buttons`);
    await context.close();
    console.log(`${theme}: hover/pressed/disabled, native keys and touch tap/cancel, reduced motion, fallback PASS`);
  }
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
  console.log('isolated browser closed; temporary bundle removed');
}
