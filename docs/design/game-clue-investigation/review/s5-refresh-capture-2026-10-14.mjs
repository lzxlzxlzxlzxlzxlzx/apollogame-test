import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { cartProbeFixture, detectBrowserRuntime, startDevServer, stopDevServer } from '../../../../scripts/lib/render-harness.mjs';

const out = resolve('docs/design/game-clue-investigation/review/shots/S5-refresh-2026-10-14');
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(runtime.reason);
mkdirSync(out, { recursive: true });
const root = resolve('.');
const fixture = cartProbeFixture(root, 'game-clue-investigation');
const dev = await startDevServer(root, { port: 5731 });
const browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('http://localhost:4000/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
  await page.route('**/api/library/game-clue-investigation/manifest', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
  await page.goto(`http://localhost:${dev.port}/?game=lib:game-clue-investigation&s3Probe=1`, { waitUntil: 'load' });
  await page.locator('#case-heading').waitFor({ state: 'visible' });
  const snap = (name) => page.screenshot({ path: resolve(out, name), animations: 'disabled' });
  await snap('idle.png');
  const canvas = page.locator('canvas').last();
  const hit = async (x, y) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas missing');
    await page.mouse.click(box.x + box.width * x / 1440, box.y + box.height * y / 900);
  };
  await hit(835, 492);
  await page.locator('#flavor-archive').waitFor({ state: 'visible' });
  await snap('flavor.png');
  await page.locator('#flavor-continue').click();
  await hit(246, 433);
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible' });
  await snap('reveal.png');
  await page.locator('#lock-collect').click();
  await page.locator('#clue-collected-modal').waitFor({ state: 'visible' });
  await snap('collected.png');
  if (errors.length) throw new Error(errors.join(' | '));
  console.log(JSON.stringify({ ok: true, url: page.url(), out, screenshots: 4, consoleErrors: 0 }));
} finally {
  try { await browser.close(); } finally { stopDevServer(dev.proc); }
}
