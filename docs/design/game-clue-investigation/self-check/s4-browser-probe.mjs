// 本游戏 S4/S5 真浏览器旅程：只启动短时局部 Vite + 隔离无头 Edge，finally 全部清理。
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { cartProbeFixture, detectBrowserRuntime, startDevServer, stopDevServer } from '../../../../scripts/lib/render-harness.mjs';

const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const out = join(root, 'docs/design/game-clue-investigation/self-check/shots');
const stage = process.argv.includes('--s5') ? 'S5' : 'S4';
const shotPath = (name) => join(out, name.replace(/^S4-/, `${stage}-`));
const fixture = cartProbeFixture(root, 'game-clue-investigation');
const browserRuntime = detectBrowserRuntime();
if (!browserRuntime.ok) throw new Error(`无可用浏览器：${browserRuntime.reason}`);

const dev = await startDevServer(root, { port: 5720 });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: browserRuntime.execPath, args: ['--no-sandbox'] });
  const prototypePage = await browser.newPage({ viewport: { width: 1480, height: 940 }, deviceScaleFactor: 1 });
  await prototypePage.goto(pathToFileURL(join(root, 'docs/design/game-clue-investigation/prototype.dc.html')).href, { waitUntil: 'load' });
  await prototypePage.locator('.prototype-panel').evaluate((element) => { element.style.display = 'none'; });
  await prototypePage.locator('.status-strip').evaluate((element) => { element.style.display = 'none'; });
  mkdirSync(out, { recursive: true });
  await prototypePage.locator('#stage').screenshot({ path: shotPath('S4-00-prototype-idle.png'), animations: 'disabled' });
  for (const [state, name] of [
    ['flavor-result', 'S4-00-prototype-flavor.png'],
    ['clue-reveal', 'S4-00-prototype-reveal.png'],
    ['clue-collected', 'S4-00-prototype-collected.png'],
    ['completed', 'S4-00-prototype-completed.png'],
    ['exit-confirm', 'S4-00-prototype-exit.png'],
  ]) {
    await prototypePage.locator('#stateSelect').evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, state);
    await prototypePage.locator('#stage').screenshot({ path: shotPath(name), animations: 'disabled' });
  }
  await prototypePage.close();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
  await page.route('**/api/library/game-clue-investigation/manifest', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
  await page.goto(`http://localhost:${dev.port}/?game=lib:game-clue-investigation`, { waitUntil: 'load' });
  const canvas = page.locator('canvas').last();
  await canvas.waitFor({ state: 'visible' });
  await page.locator('#case-heading').waitFor({ state: 'visible' });

  const shot = async (name) => page.screenshot({ path: shotPath(name), animations: 'disabled' });
  const rect = async () => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas 无边界');
    return box;
  };
  const hit = async (x, y) => {
    const box = await rect();
    await page.mouse.click(box.x + box.width * x / 1440, box.y + box.height * y / 900);
  };
  const assertText = async (selector, text) => {
    await page.locator(selector).getByText(text, { exact: false }).waitFor({ state: 'visible', timeout: 4000 });
  };
  const idleRect = await rect();
  await shot('S4-01-idle.png');
  await page.locator('#ledger-title').click();
  await page.locator('#clue-ledger').waitFor({ state: 'detached', timeout: 5000 });
  await shot('S4-01b-ledger-collapsed.png');
  await page.locator('#view-records').click();
  await page.locator('#clue-ledger').waitFor({ state: 'visible', timeout: 5000 });

  const cupPoint = { x: idleRect.x + idleRect.width * 933 / 1440, y: idleRect.y + idleRect.height * 557 / 900 };
  await page.mouse.move(cupPoint.x, cupPoint.y);
  await page.locator('#cart-focus-object-cup[data-pointer-feedback-state="hover"]').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-01c-cup-hover.png');
  await page.mouse.down();
  await page.locator('#cart-focus-object-cup[data-pointer-feedback-state="pressed"]').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-01d-cup-pressed.png');
  await page.mouse.up();
  await assertText('#flavor-archive', '茶杯');
  const flavorRect = await rect();
  if (stage === 'S5') {
    await page.waitForTimeout(260);
    const button = await page.locator('#flavor-continue').boundingBox();
    if (!button || Math.abs(button.x - 1151) > 1 || Math.abs(button.y - 817) > 1 || button.width !== 210 || button.height !== 58) throw new Error(`S4档案条按钮几何漂移：${JSON.stringify(button)}`);
  }
  if (Math.abs(flavorRect.x - idleRect.x) > 0.5 || Math.abs(flavorRect.y - idleRect.y) > 0.5) {
    throw new Error(`档案条使场景漂移：idle=${JSON.stringify(idleRect)}, flavor=${JSON.stringify(flavorRect)}`);
  }
  await shot('S4-02-flavor.png');
  await page.locator('[data-action="investigation.close"]').last().click();
  await page.locator('#flavor-archive').waitFor({ state: 'detached' });

  await hit(246, 433);
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible' });
  if (stage === 'S5') {
    await page.waitForTimeout(300);
    const pose = await page.locator('#evidence-structure').evaluate((el) => getComputedStyle(el).transform);
    if (pose !== 'none' && pose !== 'matrix(1, 0, 0, 1, 0, 0)') throw new Error(`证物240ms后未归位：${pose}`);
    const imageSlot = await page.locator('#evidence-image-slot').boundingBox();
    const collect = await page.locator('#lock-collect').boundingBox();
    if (imageSlot?.width !== 710 || collect?.width !== 225 || collect?.height !== 58) throw new Error(`S4证物控件几何漂移：${JSON.stringify({ imageSlot, collect })}`);
  }
  await shot('S4-03-lock-reveal.png');
  await page.locator('#lock-collect').click();
  await page.locator('#clue-collected-modal').waitFor({ state: 'visible' });
  await shot('S4-04-lock-collected.png');
  await page.locator('#clue-collected-modal').waitFor({ state: 'detached', timeout: 5000 });

  await hit(978, 638);
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible' });
  await page.locator('#prints-collect').click();
  await page.locator('#investigation-completed-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-05-completed.png');
  await page.locator('#completed-restart').click();
  await page.locator('#investigation-completed-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#progress-count').getByText('0').waitFor({ state: 'visible' });
  await shot('S4-06-restarted.png');

  await page.locator('#exit-investigation').click();
  await page.locator('#exit-confirm-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-07-exit-confirm.png');
  await page.locator('#exit-confirm').click();
  await page.locator('#investigation-cancelled-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-08-cancelled.png');
  await page.locator('#cancelled-restart').click();
  await page.locator('#investigation-cancelled-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#progress-count').getByText('0').waitFor({ state: 'visible' });
  await hit(246, 433);
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-09-post-cancel-playable.png');
  await page.locator('#evidence-close').click();
  await page.locator('#clue-reveal-modal').waitFor({ state: 'detached', timeout: 5000 });

  await page.locator('#cart-focus-object-lock').focus();
  await page.keyboard.press('Enter');
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-10-keyboard-reveal.png');
  await page.keyboard.press('Escape');
  await page.locator('#clue-reveal-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#case-utility').waitFor({ state: 'visible', timeout: 5000 });
  const focusAfterModalEscape = await page.evaluate(() => ({ id: document.activeElement?.id ?? '', tag: document.activeElement?.tagName ?? '' }));
  await page.keyboard.press('Escape');
  await page.locator('#exit-confirm-modal').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#exit-stay').click();
  await page.locator('#exit-confirm-modal').waitFor({ state: 'detached', timeout: 5000 });

  await page.setViewportSize({ width: 720, height: 800 });
  await page.waitForTimeout(200);
  const narrowRect = await rect();
  if (Math.abs(narrowRect.width / narrowRect.height - 1440 / 900) > 0.01) throw new Error('窄屏 Canvas 比例失配');
  await shot('S4-11-narrow.png');
  const touchPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
  touchPage.on('console', (message) => { if (message.type() === 'error') errors.push(`touch: ${message.text()}`); });
  touchPage.on('pageerror', (error) => errors.push(`touch: ${error.message}`));
  await touchPage.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await touchPage.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
  await touchPage.route('**/api/library/game-clue-investigation/manifest', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
  await touchPage.goto(`http://localhost:${dev.port}/?game=lib:game-clue-investigation`, { waitUntil: 'load' });
  await touchPage.locator('#case-heading').waitFor({ state: 'visible' });
  await touchPage.touchscreen.tap(933, 557);
  await touchPage.locator('#flavor-archive').getByText('茶杯').waitFor({ state: 'visible', timeout: 5000 });
  await touchPage.screenshot({ path: shotPath('S4-12-touch-flavor.png'), animations: 'disabled' });
  await touchPage.close();
  const motion = [];
  if (stage === 'S5') {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const preference of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion: preference });
      await hit(246, 433);
      await page.locator('#evidence-structure').waitFor({ state: 'visible' });
      const duration = await page.locator('#evidence-structure').evaluate((el) => getComputedStyle(el).animationDuration);
      if (duration !== (preference === 'reduce' ? '0s' : '0.24s')) throw new Error(`证物动效时长失配：${preference} ${duration}`);
      motion.push({ preference, duration });
      await page.locator('#evidence-close').click();
      await page.locator('#clue-reveal-modal').waitFor({ state: 'detached' });
    }
    await hit(933, 557);
    const archiveDuration = await page.locator('#flavor-archive').evaluate((el) => getComputedStyle(el).animationDuration);
    if (archiveDuration !== '0s') throw new Error(`减少动态效果下档案条仍运动：${archiveDuration}`);
    await shot('S4-13-reduced-motion.png');
  }
  if (errors.length) throw new Error(`浏览器错误：${errors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, stage, url: `http://localhost:${dev.port}/?game=lib:game-clue-investigation`, prototypeShots: 6, gameShots: stage === 'S5' ? 16 : 15, idleRect, flavorRect, narrowRect, focusAfterModalEscape, touch: 'cup→flavor', motion }));
} finally {
  try { await browser?.close(); } finally {
    stopDevServer(dev.proc);
    // 公共清理器的负 PID 进程组信号在 Windows 不生效；只补杀本探针持有的精确 Vite 子进程。
    if (process.platform === 'win32' && dev.proc.exitCode === null) dev.proc.kill('SIGTERM');
    dev.proc.stdout?.destroy();
    dev.proc.stderr?.destroy();
  }
}
