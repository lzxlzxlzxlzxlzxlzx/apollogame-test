// S4 真浏览器自玩：仅短时局部 Vite + 隔离 Edge，finally 关闭；不连业务后端。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const stage = process.argv.includes('--stage=S6') ? 'S6' : process.argv.includes('--stage=S5') ? 'S5' : 'S4';
const externalPort = process.argv.includes('--existing-5173') ? 5173 : undefined;
const out = join(root, 'docs', 'design', 'game-potion-brewing', 'self-check', 'shots', ...(externalPort ? ['owner-5173'] : []));
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(`无隔离浏览器: ${runtime.reason}`);
const dev = externalPort ? { port: externalPort } : await startDevServer(root, { port: 5700 });
let browser;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location().url}`); });
  page.on('requestfailed', (request) => { errors.push(`${request.failure()?.errorText} @ ${request.url()}`); });
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('http://localhost:4000/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`http://localhost:${dev.port}/?game=game-potion-brewing`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#potion-scene-host canvas');
  await page.evaluate(async () => {
    const { Engine } = await import('/src/runtime/engine.ts');
    const original = Engine.prototype.step;
    Engine.prototype.step = function () {
      const result = original.call(this);
      const session = this.world.getComponent('cauldron', 'OrderedActionSession');
      if (session) { const rod = this.world.getComponent('rod', 'Transform'); const gesture = this.world.getComponent('rod', 'AngularGesture'); window.__POTION_S4_PROBE__ = { status: session.status, stepIndex: session.stepIndex, confirmedCount: session.confirmedCount, rod: rod && { x: rod.x, y: rod.y }, angle: gesture?.angleMilliDegrees, held: gesture?.heldSource }; }
      return result;
    };
  });
  const canvas = page.locator('#potion-scene-host canvas');
  const point = async (x, y) => {
    const rect = await canvas.boundingBox();
    if (!rect) throw new Error('canvas 未显示');
    return { x: rect.x + x * rect.width / 1440, y: rect.y + y * rect.height / 900 };
  };
  const drag = async (from, to) => {
    const a = await point(...from), b = await point(...to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.mouse.up();
  };
  const stir = async (start = [912, 235], direction = 1) => {
    const head = await point(...start);
    await page.mouse.move(head.x, head.y);
    await page.mouse.down();
    for (let i = 0; i <= 32; i++) {
      const theta = -Math.PI / 2 + direction * i * Math.PI * 2 / 32;
      const target = await point(760 + 105 * Math.cos(theta), 423 + 43 * Math.sin(theta));
      await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(18);
    }
    await page.mouse.up();
  };
  const expectState = async (status, stepIndex, confirmedCount) => {
    try { await page.waitForFunction(({ status, stepIndex, confirmedCount }) => {
      const s = window.__POTION_S4_PROBE__;
      return s?.status === status && s?.stepIndex === stepIndex && (confirmedCount === undefined || s?.confirmedCount === confirmedCount);
    }, { status, stepIndex, confirmedCount }, { timeout: 4000 }); }
    catch (error) { throw new Error(`Expected ${status}/${stepIndex}/${confirmedCount}; got ${JSON.stringify(await page.evaluate(() => window.__POTION_S4_PROBE__))}; browser errors ${JSON.stringify(errors)}`, { cause: error }); }
  };
  mkdirSync(out, { recursive: true });
  const shot = async (name) => page.screenshot({ path: join(out, `${stage}-${name}.png`), omitBackground: true });
  await expectState('active', 0, 0);
  if (stage === 'S6') await page.waitForTimeout(350);
  await shot('01-start');
  if (stage === 'S6') {
    const hoverPoint = await point(1180, 272);
    await page.mouse.move(hoverPoint.x, hoverPoint.y);
    await page.waitForFunction(() => document.querySelector('#potion-material-moon-herb')?.getAttribute('style')?.includes('#59604a'));
    await shot('15-material-hover');
    const clearHover = await point(760, 423);
    await page.mouse.move(clearHover.x, clearHover.y);
    await page.waitForFunction(() => !document.querySelector('#potion-material-moon-herb')?.getAttribute('style')?.includes('#59604a'));
    await page.setViewportSize({ width: 2500, height: 1250 });
    const bounds = await page.locator('#potion-root').boundingBox();
    if (!bounds || Math.abs(bounds.x - (2500 - bounds.width) / 2) > 2) throw new Error(`宽屏舞台未居中: ${JSON.stringify(bounds)}`);
    await shot('14-wide-centered');
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await drag([1180, 272], [760, 705]);
  await expectState('active', 0, 0);
  await drag([1180, 272], [760, 423]);
  await expectState('active', 1, 0);
  if (stage === 'S6') {
    const glow = await page.locator('[id^="potion-liquid-glow-"]').getAttribute('style');
    if (!glow?.includes('#8ffff0bb')) throw new Error(`投料后液面未提亮: ${glow}`);
    const previous = page.locator('#potion-liquid-previous');
    await previous.waitFor();
    const opacity = () => previous.evaluate((el) => Number(getComputedStyle(el).opacity));
    const early = await opacity();
    await shot('02a-add-fade-start');
    await page.waitForTimeout(180);
    const middle = await opacity();
    await shot('02b-add-fade-middle');
    await page.waitForTimeout(180);
    const late = await opacity();
    if (!(early > middle && middle > late && late < 0.5)) throw new Error(`投料后汤色未连续交叠: ${JSON.stringify({ early, middle, late })}`);
  }
  if (await page.locator('[id^="potion-material-count-"], [id^="potion-material-select-"]').count()) throw new Error('无限取料版本仍显示份数控件');
  await shot('02-add');
  await page.keyboard.press('e');
  await page.keyboard.press('q');
  await expectState('active', 1, 0);
  await stir();
  await expectState('active', 1, 1);
  if (stage === 'S6') {
    const glow = await page.locator('[id^="potion-liquid-glow-"]').getAttribute('style');
    const water = await page.locator('#potion-liquid [data-liq-water]').getAttribute('style');
    if (!glow?.includes('#8ffff0bb') || !water?.includes('color-mix(in srgb')) throw new Error(`搅拌后汤色未逐圈混合: ${JSON.stringify({ glow, water })}`);
  }
  await shot('03-stir');
  await stir();
  await expectState('active', 2, 0);
  await drag([1325, 272], [760, 423]);
  await expectState('active', 3, 0);
  await shot('04-second-add');
  const lastRod = await page.evaluate(() => window.__POTION_S4_PROBE__?.rod);
  await stir([lastRod.x + 47, lastRod.y - 188], -1);
  await expectState('success', 4, 0);
  if (stage === 'S6') {
    await page.waitForTimeout(120);
    if (await page.locator('#potion-result').count()) throw new Error('成功结算过早盖住成品汤色停留帧');
  }
  await page.waitForSelector('#potion-result');
  if (stage === 'S6') await page.waitForSelector('#potion-result-bottle');
  if (stage === 'S6') {
    const center = async () => {
      const scene = await page.locator('#potion-root').boundingBox();
      const dialog = await page.locator('#potion-result [data-modal-dialog]').boundingBox();
      if (!scene || !dialog || Math.abs((scene.x + scene.width / 2) - (dialog.x + dialog.width / 2)) > 2 || Math.abs((page.viewportSize().width / 2) - (dialog.x + dialog.width / 2)) > 2) throw new Error(`结算框未相对舞台及视口居中: ${JSON.stringify({ scene, dialog, viewport: page.viewportSize() })}`);
    };
    await center();
    await page.setViewportSize({ width: 2500, height: 1250 });
    await center();
    await shot('16-wide-result-centered');
    await page.setViewportSize({ width: 1135, height: 886 });
    await center();
    await shot('17-narrow-result-centered');
    await page.setViewportSize({ width: 1440, height: 900 });
    await center();
  }
  await shot('05-success');
  if (await page.locator('#potion-result-restart').count()) throw new Error('终局仍显示重新炼制');
  if (await page.locator('#potion-current-status').textContent()?.then((text) => text.includes('Q/E') || text.includes('投入锅口'))) throw new Error('状态栏仍含旧快捷键/按钮提示');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#potion-scene-host canvas');
  await page.evaluate(async () => { const { Engine } = await import('/src/runtime/engine.ts'); const original = Engine.prototype.step; Engine.prototype.step = function () { const result = original.call(this); const session = this.world.getComponent('cauldron', 'OrderedActionSession'); if (session) window.__POTION_S4_PROBE__ = { status: session.status, stepIndex: session.stepIndex, confirmedCount: session.confirmedCount }; return result; }; });
  await expectState('active', 0, 0);
  await drag([1180, 458], [760, 423]);
  await expectState('failure', 0, 0);
  if (stage === 'S6') {
    await page.waitForTimeout(120);
    if (await page.locator('#potion-result').count()) throw new Error('失败结算过早盖住紫汤停留帧');
    const purple = await page.locator('#potion-liquid [data-liq-water]').evaluate((node) => node.getAttribute('style') ?? '');
    if (!purple.includes('#615366') && !purple.includes('97, 83, 102')) throw new Error(`失败停留帧未显示紫汤: ${purple}`);
    await shot('06-purple-before-result');
  }
  await page.waitForSelector('#potion-result');
  await shot('06-failure');
  const cloudCount = await page.locator('#potion-result-symbol').count();
  if (cloudCount !== 1) throw new Error(`失败标识数量错误: ${cloudCount}`);
  if (await page.locator('#potion-result-restart').count()) throw new Error('失败终局仍显示重开');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#potion-scene-host canvas');
  await page.evaluate(async () => { const { Engine } = await import('/src/runtime/engine.ts'); const original = Engine.prototype.step; Engine.prototype.step = function () { const result = original.call(this); const session = this.world.getComponent('cauldron', 'OrderedActionSession'); if (session) window.__POTION_S4_PROBE__ = { status: session.status, stepIndex: session.stepIndex, confirmedCount: session.confirmedCount }; return result; }; });
  await expectState('active', 0, 0);
  const material = await point(1180, 272);
  await page.mouse.click(material.x, material.y);
  const pot = await point(760, 423);
  await page.mouse.click(pot.x, pot.y);
  await expectState('active', 1, 0);
  await shot('07-select-and-pot');
  // 从可见棒头而非锅口圆环起握。
  await stir();
  await expectState('active', 1, 1);
  await shot('08-pointer-stir');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#potion-exit-confirm');
  await shot('09-exit-confirm');
  await page.click('#potion-exit-continue');
  await page.waitForSelector('#potion-exit-confirm', { state: 'detached' });
  await expectState('active', 1, 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#potion-exit-confirm');
  await page.click('#potion-exit-confirm-button');
  await page.waitForSelector('#potion-root', { state: 'detached' });
  await shot('10-cancel-exit');
  const touchContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
  try {
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror', (e) => errors.push(`touch: ${e.message}`));
    await touchPage.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await touchPage.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await touchPage.goto(`http://localhost:${dev.port}/?game=game-potion-brewing`, { waitUntil: 'networkidle' });
    await touchPage.waitForSelector('#potion-scene-host canvas');
    await touchPage.evaluate(() => {
      window.__POTION_TOUCH_EVENTS__ = [];
      const canvas = document.querySelector('#potion-scene-host canvas');
      for (const kind of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
        canvas.addEventListener(kind, (event) => window.__POTION_TOUCH_EVENTS__.push({ kind, x: event.clientX, y: event.clientY, target: event.target?.tagName }));
      }
    });
    await touchPage.evaluate(async () => {
      const { Engine } = await import('/src/runtime/engine.ts');
      const original = Engine.prototype.step;
      Engine.prototype.step = function () {
        const result = original.call(this);
        const session = this.world.getComponent('cauldron', 'OrderedActionSession');
        if (session) window.__POTION_S4_PROBE__ = { status: session.status, stepIndex: session.stepIndex, confirmedCount: session.confirmedCount };
        return result;
      };
    });
    const rect = await touchPage.locator('#potion-scene-host canvas').boundingBox();
    if (!rect) throw new Error('触屏 canvas 未显示');
    const screen = (x, y) => ({ x: rect.x + x * rect.width / 1440, y: rect.y + y * rect.height / 900 });
    const cdp = await touchContext.newCDPSession(touchPage);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ ...screen(x, y), id: 1, radiusX: 2, radiusY: 2 }],
    });
    await touch('touchStart', 1180, 272);
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', 1180 + (760 - 1180) * i / 12, 272 + (423 - 272) * i / 12);
      await touchPage.waitForTimeout(15);
    }
    await touch('touchEnd', 760, 423);
    await touchPage.waitForFunction(() => window.__POTION_S4_PROBE__?.stepIndex === 1, undefined, { timeout: 4000 }).catch(async () => {
      const details = await touchPage.evaluate(() => ({ state: window.__POTION_S4_PROBE__, events: window.__POTION_TOUCH_EVENTS__, at: document.elementFromPoint(1180, 272)?.id }));
      throw new Error(`触控投料未推进: ${JSON.stringify(details)}`);
    });
    await touchPage.screenshot({ path: join(out, `${stage}-11-touch-add.png`), omitBackground: true });
    await touch('touchStart', 865, 423);
    for (let i = 1; i <= 25; i++) {
      const theta = i * Math.PI * 2 / 24;
      await touch('touchMove', 760 + 105 * Math.cos(theta), 423 + 43 * Math.sin(theta));
      await touchPage.waitForTimeout(18);
    }
    await touch('touchEnd', 865, 423);
    await touchPage.waitForFunction(() => window.__POTION_S4_PROBE__?.stepIndex === 1 && window.__POTION_S4_PROBE__?.confirmedCount === 1, undefined, { timeout: 4000 });
    await touchPage.screenshot({ path: join(out, `${stage}-12-touch-stir.png`), omitBackground: true });
  } finally { await touchContext.close(); }
  if (stage === 'S6') {
    const reduceContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    try {
      const reducePage = await reduceContext.newPage();
      reducePage.on('pageerror', (error) => errors.push(`reduce: ${error.message}`));
      await reducePage.route('http://localhost:4000/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await reducePage.goto(`http://localhost:${dev.port}/?game=game-potion-brewing`, { waitUntil: 'networkidle' });
      await reducePage.keyboard.press('1');
      await reducePage.waitForFunction(() => document.querySelector('#potion-recipe-progress')?.textContent?.includes('第 2 /'));
      await reducePage.waitForSelector('[id^="potion-liquid-glow-"]');
      const motion = await reducePage.evaluate(() => ({
        bubbles: document.querySelectorAll('#potion-liquid [data-liq-bub]').length,
        ridgeAnimation: getComputedStyle(document.querySelector('#potion-liquid [data-liq-ridge]')).animationName,
      }));
      if (motion.bubbles !== 0 || motion.ridgeAnimation !== 'none') throw new Error(`reduced-motion 液面仍在运动：${JSON.stringify(motion)}`);
      await reducePage.screenshot({ path: join(out, `${stage}-13-reduced-motion.png`), omitBackground: true });
    } finally { await reduceContext.close(); }
  }
  if (errors.length) throw new Error(`浏览器错误: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ pass: true, shots: stage === 'S6' ? 20 : 12, errorCount: 0, out }));
} finally {
  await browser?.close();
  // Windows 不支持 harness 的负 PID 进程组信号；明确关闭本探针持有的子进程。
  if (dev.proc) {
    if (process.platform === 'win32' && !dev.proc.killed) dev.proc.kill('SIGTERM');
    stopDevServer(dev.proc);
  }
}
