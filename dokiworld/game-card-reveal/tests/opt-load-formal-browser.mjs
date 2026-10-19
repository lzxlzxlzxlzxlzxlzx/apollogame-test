// Read-only, short-lived real-dist browser probe with controlled HTTPS image routes.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { detectBrowserRuntime } from '../../../scripts/lib/render-harness.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dist = resolve(appRoot, 'dist');
const hostWitness = resolve(appRoot, 'tests', 'host-witness.html');
const sdk = resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'src', 'index.js');
const shots = resolve(appRoot, '..', '..', 'docs', 'design', 'game-card-reveal', 'review');
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(`No isolated browser available: ${runtime.reason}`);
// Serve the verified dist itself. A stale witness-static copy cannot affect this probe.
const verification = spawnSync(process.execPath, [resolve(appRoot, 'scripts', 'verify-dist.mjs')], { cwd: appRoot, encoding: 'utf8' });
if (verification.status !== 0) throw new Error(`Current dist did not verify:\n${verification.stdout}\n${verification.stderr}`);
const distHtml = await readFile(resolve(dist, 'index.html'), 'utf8');
const bundleReferences = [...distHtml.matchAll(/<script\b[^>]*\bsrc="\.\/(assets\/[^"\s]+\.js)"/g)].map((match) => match[1]);
if (bundleReferences.length !== 1) throw new Error(`Expected one current dist bundle, got ${bundleReferences.length}`);
const bundle = bundleReferences[0];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const expectedBundleHash = sha256(await readFile(resolve(dist, bundle)));
const bundleUrlPath = `/apps/game-card-reveal/${bundle}`;
const mime = (path) => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json'
  : path.endsWith('.png') ? 'image/png' : path.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    let path;
    if (pathname === '/' || pathname === '/index.html') path = hostWitness;
    else if (pathname === '/vendor/dokiworlds-app-sdk/src/index.js') path = sdk;
    else if (pathname.startsWith('/apps/game-card-reveal/')) {
      path = resolve(dist, pathname.slice('/apps/game-card-reveal/'.length));
      const rel = relative(dist, path);
      if (rel === '..' || rel.startsWith(`..${sep}`)) { response.writeHead(403).end(); return; }
    } else { response.writeHead(404).end(); return; }
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
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1490, height: 1000 }, reducedMotion: 'no-preference' });
  const errors = [];
  const pending = [];
  const artRequests = [];
  const receivedBundles = [];
  let holdAll = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (request.url().includes('/art/')) artRequests.push(new URL(request.url()).pathname); });
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/apps/game-card-reveal/assets/') && path.endsWith('.js')) {
      receivedBundles.push(response.body().then((bytes) => ({ path, status: response.status(), sha256: sha256(bytes) })));
    }
  });
  await page.route('https://cards.example.invalid/**', (route) => {
    const url = new URL(route.request().url());
    const index = Number(url.pathname.match(/\/(\d+)\.png$/)?.[1] ?? -1);
    if (index === 0 && !holdAll) {
      void route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="390"><rect width="260" height="390" fill="#7acadd"/></svg>' });
    } else pending.push(route);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const canvas = page.frameLocator('#stage iframe').locator('canvas').first();
  const frame = () => page.frames().find((item) => item.url().includes('/apps/game-card-reveal/index.html'));
  const waitFrame = async () => {
    await canvas.waitFor();
    const child = frame();
    if (!child) throw new Error('Missing app iframe');
    await child.waitForFunction(() => performance.getEntriesByName('card-reveal:engine-start').length === 1);
    return child;
  };
  const waitOffset = (child, ms) => child.waitForFunction((offset) => performance.now() - performance.getEntriesByName('card-reveal:engine-start')[0].startTime >= offset, ms);
  const snap = (name) => canvas.screenshot({ path: resolve(shots, `OPT-CARD-REVEAL-LOAD-01-formal-${name}.png`), omitBackground: true });

  await page.locator('button[data-mode="natural"][data-count="3"]').click();
  const natural = await waitFrame();
  const firstBundles = await Promise.all(receivedBundles);
  if (firstBundles.length !== 1 || firstBundles[0].path !== bundleUrlPath || firstBundles[0].status !== 200 || firstBundles[0].sha256 !== expectedBundleHash) {
    throw new Error(`Browser did not execute the current dist bundle: ${JSON.stringify(firstBundles)}`);
  }
  if (pending.length !== 2) throw new Error(`Expected two controlled slow images, got ${pending.length}`);
  await waitOffset(natural, 500); await snap('P2');
  await natural.waitForFunction(() => performance.getEntriesByName('card-reveal:card-art-frozen').length === 1);
  await waitOffset(natural, 2600); await snap('P3');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('PASS natural N3'), undefined, { timeout: 12000 });
  const beforeLate = await snap('P5');
  const marks = await natural.evaluate(() => performance.getEntriesByType('mark').filter((entry) => entry.name.startsWith('card-reveal:')).map((entry) => ({ name: entry.name, ms: Math.round(entry.startTime) })));
  const engineStart = marks.find((entry) => entry.name === 'card-reveal:engine-start')?.ms;
  const freeze = marks.find((entry) => entry.name === 'card-reveal:card-art-frozen')?.ms;
  if (engineStart === undefined || freeze === undefined || freeze <= engineStart || freeze - engineStart > 3000) throw new Error('Natural freeze did not precede the P3 draw boundary');
  await Promise.all(pending.splice(0).map((route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="390"><rect width="260" height="390" fill="#f04772"/></svg>' })));
  await natural.waitForTimeout(250);
  const afterLate = await canvas.screenshot({ omitBackground: true });
  if (!beforeLate.equals(afterLate)) throw new Error('A late remote image changed frozen P5 pixels');

  await page.locator('button[data-mode="skipped"][data-count="3"]').click();
  const skipped = await waitFrame();
  await skipped.waitForTimeout(100);
  await skipped.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })));
  await skipped.waitForFunction(() => performance.getEntriesByName('card-reveal:card-art-frozen').length === 1);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('PASS skipped N3'), undefined, { timeout: 5000 });
  await snap('skip-P5');
  const skippedStatus = await page.locator('#status').textContent();

  holdAll = true;
  await page.locator('button[data-mode="natural"][data-count="5"]').click();
  const hidden = await waitFrame();
  if (pending.length < 2) throw new Error('pagehide fixture did not hold the two new images');
  await hidden.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await Promise.all(pending.splice(0).map((route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="390"><rect width="260" height="390" fill="#f04772"/></svg>' })));
  await hidden.waitForTimeout(250);
  if ((await page.locator('#status').textContent())?.includes('complete=')) throw new Error('Disposed page completed after a late image');
  if (!page.url().startsWith('http://127.0.0.1:')) throw new Error('Probe navigated outside local witness');
  if (artRequests.some((path) => path.endsWith('/pack-back.png') || /preview-[0-4]\.svg$/.test(path))) throw new Error('Formal mode requested noncritical local art');
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ result: 'PASS', url: page.url(), bundle: { path: bundle, sha256: expectedBundleHash }, distVerified: true, naturalMarks: marks, pendingAtEngineStart: 2,
    slowImagesFulfilledAfterP5: 2, noLatePixelChange: true, skippedStatus, pagehideLateImage: 'no complete',
    artRequests, browserClosed: 'after-finally' }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
