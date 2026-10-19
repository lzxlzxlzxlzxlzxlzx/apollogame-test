// Short-lived static-dist preview witness for OPT-CARD-REVEAL-LOAD-01.
// The HTTP server and isolated headless browser are closed in finally.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { detectBrowserRuntime } from '../../../scripts/lib/render-harness.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const witness = resolve(appRoot, 'witness-static');
const shots = resolve(appRoot, '..', '..', 'docs', 'design', 'game-card-reveal', 'review');
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(`No isolated browser available: ${runtime.reason}`);

const mime = (path) => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json'
  : path.endsWith('.png') ? 'image/png' : path.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const path = resolve(witness, pathname.slice(1) || 'index.html');
    const rel = relative(witness, path);
    if (rel === '..' || rel.startsWith(`..${sep}`)) { response.writeHead(403).end(); return; }
    const info = await stat(path);
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': mime(path), 'cache-control': 'no-store' });
    createReadStream(path).pipe(response);
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  const port = server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto(`http://127.0.0.1:${port}/apps/game-card-reveal/index.html?preview=1&cards=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => performance.getEntriesByName('card-reveal:engine-start').length === 1);
  const canvas = page.locator('canvas').first();
  if (await canvas.count() !== 1) throw new Error('Missing game canvas');
  for (const [name, offset] of [['P2', 500], ['P3', 2300], ['P5', 5400]]) {
    await page.waitForFunction((ms) => performance.now() - performance.getEntriesByName('card-reveal:engine-start')[0].startTime >= ms, offset);
    await canvas.screenshot({ path: resolve(shots, `OPT-CARD-REVEAL-LOAD-01-${name}.png`), omitBackground: true });
  }
  if (requests.some((path) => path.endsWith('/pack-back.png'))) throw new Error('pack.back was requested');
  if (requests.some((path) => /preview-[1-4]\.svg$/.test(path))) throw new Error('unused preview card was requested');
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  const marks = await page.evaluate(() => performance.getEntriesByType('mark').filter((entry) => entry.name.startsWith('card-reveal:')).map((entry) => ({ name: entry.name, ms: Math.round(entry.startTime) })));
  const measures = await page.evaluate(() => performance.getEntriesByType('measure').filter((entry) => entry.name.startsWith('card-reveal:')).map((entry) => ({ name: entry.name, ms: Math.round(entry.duration) })));
  console.log(JSON.stringify({ result: 'PASS', url: page.url(), shots: ['P2', 'P3', 'P5'], artRequests: requests.filter((path) => path.includes('/art/')), marks, measures, browserClosed: 'after-finally' }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
