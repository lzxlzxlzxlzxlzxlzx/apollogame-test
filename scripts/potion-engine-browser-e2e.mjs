// G2–G4 isolated browser integration: real PointerEvents -> command stream -> World -> Canvas.
// This starts only a short-lived Vite test server and closes both it and Chromium in finally.
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { detectBrowserRuntime } from './lib/render-harness.mjs';
import { engineAliases } from './engine-aliases.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(runtime.reason);
let server;
let browser;
try {
  server = await createServer({
    configFile: false,
    root,
    publicDir: false,
    resolve: { alias: engineAliases(root) },
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 59431, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address !== 'string', 'isolated Vite address missing');
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const url = `http://127.0.0.1:${address.port}/scripts/fixtures/potion-engine-browser.html`;
  await page.goto(url, { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.potionProbe?.state().rod));
  const canvas = page.locator('#host canvas');
  const box = await canvas.boundingBox();
  assert(box, 'probe canvas not visible');
  const point = (x, y) => ({ x: box.x + x * box.width / 600, y: box.y + y * box.height / 400 });
  const ellipse = (degrees) => {
    const radians = degrees * Math.PI / 180;
    return point(380 + 80 * Math.cos(radians), 160 + 40 * Math.sin(radians));
  };
  const nextFrame = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));

  // Real mouse path: the rod visibly moves on the canvas and authority emits a clockwise turn.
  await page.mouse.move(...Object.values(ellipse(0)));
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    const p = ellipse(step * 45);
    await page.mouse.move(p.x, p.y);
    await nextFrame();
  }
  await page.mouse.up();
  await page.waitForFunction(() => window.potionProbe.state().clockwiseSeen);
  const clockwise = await page.evaluate(() => window.potionProbe.state());
  assert(Math.abs(clockwise.rod.x - 460) < 2 && Math.abs(clockwise.rod.y - 160) < 2, 'rod did not return to visible 0° position');

  // Chromium touch input (not synthetic RawInput injection) takes the same browser pointer path.
  const cdp = await context.newCDPSession(page);
  const sendTouch = async (type, p) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ id: 9, x: p.x, y: p.y }] });
    await nextFrame();
  };
  await sendTouch('touchStart', ellipse(0));
  for (let step = 1; step <= 8; step++) await sendTouch('touchMove', ellipse(-step * 45));
  await sendTouch('touchEnd', ellipse(-360));
  await page.waitForFunction(() => window.potionProbe.state().counterclockwiseSeen);
  assert.equal((await page.evaluate(() => window.potionProbe.state())).session.status, 'active');

  // Material image follows a real held pointer; pixel on transparent canvas proves it is visible.
  const material = point(100, 300), outside = point(530, 300);
  await page.mouse.move(material.x, material.y);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y, { steps: 8 });
  await page.waitForFunction(() => window.potionProbe.state().preview?.x > 500);
  await nextFrame();
  const held = await page.evaluate(() => {
    const state = window.potionProbe.state();
    const canvas = document.querySelector('#host canvas');
    const dpr = window.devicePixelRatio;
    const pixel = canvas.getContext('2d').getImageData(Math.round(state.preview.x * dpr), Math.round(state.preview.y * dpr), 1, 1).data;
    return { state, alpha: pixel[3] };
  });
  assert.equal(held.state.material.x, 100, 'authority material moved during preview');
  assert(held.alpha > 0, 'held preview has no visible canvas pixel');
  await page.screenshot({ path: join(root, 'docs/design/game-potion-brewing/self-check/g2-g4-browser-held.png') });
  await page.mouse.up();
  await page.waitForFunction(() => window.potionProbe.state().preview === null);
  assert.equal((await page.evaluate(() => window.potionProbe.state())).drop, null, 'outside drag committed a drop');
  assert.equal((await page.evaluate(() => window.potionProbe.state())).session.status, 'active', 'outside drag ended session');

  // AABB corner is outside the ellipse; center is accepted by the same authority path.
  const corner = point(470, 210);
  await page.mouse.move(material.x, material.y); await page.mouse.down();
  await page.mouse.move(corner.x, corner.y, { steps: 8 }); await page.mouse.up();
  await nextFrame();
  assert.equal((await page.evaluate(() => window.potionProbe.state())).drop, null, 'ellipse corner incorrectly accepted');
  assert.equal((await page.evaluate(() => window.potionProbe.state())).session.status, 'active', 'ellipse corner ended session');
  const center = point(380, 160);
  await page.mouse.move(material.x, material.y); await page.mouse.down();
  await page.mouse.move(center.x, center.y, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => window.potionProbe.state().drop === 'brew.add.silver');
  assert.equal((await page.evaluate(() => window.potionProbe.state())).session.status, 'success', 'G1 ordered action session did not complete');
  await page.screenshot({ path: join(root, 'docs/design/game-potion-brewing/self-check/g2-g4-browser-drop.png') });
  await page.waitForFunction(() => window.potionProbe.state().preview === null);
  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join('; ')}`);
  await page.evaluate(() => window.potionProbe.dispose());
  await context.close();
  console.log(`POTION-ENGINE-BROWSER: PASS · mouse clockwise · touch counterclockwise · visible preview · ellipse reject/accept · ordered session success · ${url}`);
} finally {
  await browser?.close();
  await server?.close();
}
