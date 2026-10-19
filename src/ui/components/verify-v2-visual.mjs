// Short-lived isolated file:// Chromium audit, with anchor-checked sabotage switches.
import { build } from 'vite';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'gal-pui-v2-visual-'));
const shots = join(root, 'docs/design/galgame/self-check');
const browserPath = [process.env.UI_AUDIT_CHROMIUM, chromium.executablePath(),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => p && existsSync(p));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error', build: { write: true, outDir: temporary,
    emptyOutDir: false, lib: { entry: join(root, 'src/ui/components/v2-visual.audit.ts'), formats: ['iife'], name: 'V2VisualAudit', fileName: () => 'fixture.js' } } });
  writeFileSync(join(temporary, 'audit.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script src="./fixture.js"></script></body>');
  browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
  mkdirSync(shots, { recursive: true });
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(join(temporary, 'audit.html')).href}${theme === 'light' ? '?light' : ''}`);
    const dialog = page.locator('#modal [data-modal-dialog]');
    if (process.env.SABOTAGE_V2_VISUAL === 'modal' && theme === 'dark') {
      const hits = await dialog.count(); assert(hits === 1, `modal sabotage anchor hit ${hits}`);
      await dialog.evaluate((el) => { el.style.minHeight = '200px'; });
      console.log('sabotage modal anchor hit=1');
    }
    const box = await dialog.boundingBox();
    assert(box && box.width === 800 && box.height === 310, `${theme} Modal geometry ${JSON.stringify(box)}`);
    const title = page.locator('#modal-title');
    assert(await title.evaluate((el) => getComputedStyle(el).fontSize) === '30px', `${theme} Modal title size`);
    assert(await title.evaluate((el) => getComputedStyle(el).textAlign) === 'center', `${theme} Modal title alignment`);
    assert(await dialog.getAttribute('aria-labelledby') === 'modal-title', `${theme} Modal accessible name`);
    assert(await dialog.getAttribute('aria-modal') === 'true', `${theme} Modal aria-modal`);
    assert(await dialog.evaluate((el) => el.contains(document.activeElement)), `${theme} Modal initial focus`);
    await page.screenshot({ path: join(shots, `pui-v2-visual-${theme}-modal.png`) });
    await page.keyboard.press('Escape');
    assert(await dialog.count() === 0, `${theme} Escape did not close Modal`);
    assert((await page.evaluate(() => window.__v2Actions)).includes('modal.close'), `${theme} Escape ActionSink`);
    await page.locator('#open-button').click();
    assert(await dialog.count() === 1, `${theme} Modal reopen`);
    await page.locator('#modal').click({ position: { x: 5, y: 5 } });
    assert(await dialog.count() === 0, `${theme} scrim did not close Modal`);
    const cue = page.locator('#cue');
    if (process.env.SABOTAGE_V2_VISUAL === 'cue' && theme === 'dark') {
      const hits = await cue.count(); assert(hits === 1, `cue sabotage anchor hit ${hits}`);
      await cue.evaluate((el) => { el.style.animation = 'none'; });
      console.log('sabotage cue anchor hit=1');
    }
    const cueStyle = await cue.evaluate((el) => {
      const animation = el.getAnimations()[0];
      if (animation) { animation.pause(); animation.currentTime = 650; }
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration, opacity: style.opacity, transform: style.transform };
    });
    assert(cueStyle.name === 'apollo-cue' && cueStyle.duration === '1.3s', `${theme} cue identity ${JSON.stringify(cueStyle)}`);
    assert(Number(cueStyle.opacity) >= 0.34 && Number(cueStyle.opacity) <= 0.36, `${theme} cue midpoint opacity ${JSON.stringify(cueStyle)}`);
    assert(cueStyle.transform.includes(', 4)'), `${theme} cue midpoint transform ${JSON.stringify(cueStyle)}`);
    const btn = page.locator('#skin-button');
    assert(await page.locator('#legacy-button').getAttribute('data-apollo-skin-feedback') === null, `${theme} legacy opt-in drift`);
    if (process.env.SABOTAGE_V2_VISUAL === 'button' && theme === 'dark') {
      const hits = await btn.count(); assert(hits === 1, `button sabotage anchor hit ${hits}`);
      await btn.evaluate((el) => { el.style.setProperty('--apollo-skin-hover-brightness', '1'); });
      console.log('sabotage button anchor hit=1');
    }
    const duration = await btn.evaluate((el) => getComputedStyle(el).transitionDuration);
    assert(duration.split(',').every((part) => part.trim() === '0.16s'), `${theme} Button transition ${duration}`);
    await btn.hover();
    await page.waitForTimeout(200);
    const hover = await btn.evaluate((el) => getComputedStyle(el).filter);
    assert(hover.includes('brightness(1.32)') && hover.includes('8px'), `${theme} Button hover ${hover}`);
    await page.mouse.down();
    await page.waitForTimeout(200);
    const press = await btn.evaluate((el) => ({ filter: getComputedStyle(el).filter, marker: el.hasAttribute('data-apollo-pressed') }));
    assert(press.marker && press.filter.includes('brightness(0.85)'), `${theme} Button pressed ${JSON.stringify(press)}`);
    await page.mouse.up();
    assert((await page.evaluate(() => window.__v2Actions)).includes('skin.start'), `${theme} Button ActionSink`);
    assert(await page.locator('#disabled-button').isDisabled(), `${theme} disabled Button native state`);
    await page.locator('#disabled-button').click({ force: true }).catch(() => {});
    assert(!(await page.evaluate(() => window.__v2Actions)).includes('skin.disabled'), `${theme} disabled Button emitted`);
    await page.screenshot({ path: join(shots, `pui-v2-visual-${theme}-controls.png`) });
    console.log(`${theme}: modal/cue/button/pointer/disabled PASS`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${pathToFileURL(join(temporary, 'audit.html')).href}#closed`);
  const reduced = await page.locator('#cue').evaluate((el) => getComputedStyle(el).animationDuration);
  assert(reduced === '0s', `reduced-motion cue duration ${reduced}`);
  const buttonDuration = await page.locator('#skin-button').evaluate((el) => getComputedStyle(el).transitionDuration);
  assert(buttonDuration.split(',').every((part) => part.trim() === '0s'), `reduced-motion Button transition ${buttonDuration}`);
  console.log('reduced-motion cue/button PASS');
  await context.close();
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
  console.log('isolated Chromium closed; temporary bundle removed');
}
