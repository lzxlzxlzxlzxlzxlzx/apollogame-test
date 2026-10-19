// Independent review probe: same real Canvas gesture/trace contract as the S3 gate,
// but prints evidence instead of writing the shared S3-click-gate.json artifact.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  cartProbeFixture, deepLinkQuery, detectBrowserRuntime, startDevServer, stopDevServer,
} from '../../../../scripts/lib/render-harness.mjs';
import { canvasClickTargets, interpretCanvasClickProbe } from '../../../../scripts/click-probe.mjs';

const root = join(fileURLToPath(new URL('../../../../', import.meta.url)));
const slug = 'game-clue-investigation';
const fixture = cartProbeFixture(root, slug);
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error('No isolated browser runtime');

let dev;
let browser;
const hits = [];
const consoleErrors = [];
let candidates = 0;
try {
  dev = await startDevServer(root, { port: 5733 });
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
  await page.route(`**/api/library/${slug}/manifest`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
  await page.goto(`http://localhost:${dev.port}/?${deepLinkQuery('cart', slug)}&s3Probe=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__ZEROCRAFT_S3_CLICK_TRACE__?.read === 'function', undefined, { timeout: 8000 });
  const canvas = await page.evaluate(() => {
    const back = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('返回架上'));
    const el = back?.parentElement?.querySelector('canvas');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, logicalWidth: el.width / dpr, logicalHeight: el.height / dpr };
  });
  if (!canvas) throw new Error('Canvas not mounted');
  const targets = canvasClickTargets(fixture.manifest, canvas.logicalWidth, canvas.logicalHeight);
  candidates = targets.length;
  for (const target of targets.slice(0, 12)) {
    const x = canvas.left + target.x * canvas.width / canvas.logicalWidth;
    const y = canvas.top + target.y * canvas.height / canvas.logicalHeight;
    if (x < 0 || y < 0 || x >= 1280 || y >= 800) continue;
    const reachable = await page.evaluate(({ x, y }) => {
      const back = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('返回架上'));
      return document.elementFromPoint(x, y) === back?.parentElement?.querySelector('canvas');
    }, { x, y });
    if (!reachable) { hits.push({ id: target.id, action: target.action, signalMatched: false, reason: 'covered' }); continue; }
    await page.mouse.click(x, y);
    const signalMatched = await page.waitForFunction(({ id, action }) => window.__ZEROCRAFT_S3_CLICK_TRACE__?.read().some(
      (event) => event.what === id && event.why === action,
    ), { id: target.id, action: target.action }, { timeout: 1200 }).then(() => true).catch(() => false);
    hits.push({ id: target.id, action: target.action, signalMatched });
    if (signalMatched) break;
  }
} catch (error) {
  consoleErrors.push(`probe: ${error.message}`);
} finally {
  await browser?.close();
  if (dev) {
    stopDevServer(dev.proc);
    // Windows detached child needs its own PID signalled and pipe handles closed.
    dev.proc.kill('SIGTERM');
    dev.proc.stdout?.destroy();
    dev.proc.stderr?.destroy();
  }
}
const verdict = interpretCanvasClickProbe({ candidates, hits, consoleErrors });
console.log(JSON.stringify({ url: `http://localhost:${dev?.port}/?${deepLinkQuery('cart', slug)}&s3Probe=1`, ...verdict, candidates, hits, consoleErrors, browserClosed: true, serverStopRequested: true }));
process.exitCode = verdict.exit;
