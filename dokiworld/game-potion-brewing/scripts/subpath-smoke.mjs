// Verify the built dist at the actual DokiWorld-style /apps/<id>/ path.
// The temporary Vite server and isolated browser are always closed.
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { detectBrowserRuntime, startDevServer, stopDevServer } from '../../../scripts/lib/render-harness.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const distRoot = resolve(repoRoot, 'dokiworld/game-potion-brewing/dist');
const appPath = '/apps/game-potion-brewing/';
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(runtime.reason);
const server = await startDevServer(repoRoot, { port: 5702 });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.url().includes(appPath) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.route(`**${appPath}**`, async route => {
    const url = new URL(route.request().url());
    const relative = decodeURIComponent(url.pathname.slice(appPath.length));
    if (!relative || relative.includes('..') || relative.includes('\\') || relative.startsWith('/')) {
      await route.fulfill({ status: 400, body: 'invalid path' });
      return;
    }
    const file = resolve(distRoot, relative);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/markdown' };
    try { await route.fulfill({ status: 200, contentType: types[extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
    catch { await route.fulfill({ status: 404, body: 'missing dist file' }); }
  });
  await page.route(`http://localhost:${server.port}/potion-subpath-host`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto(`http://localhost:${server.port}/potion-subpath-host`);
  await page.evaluate(async path => {
    const { createAppHost } = await import('/vendor/dokiworlds-app-sdk/src/index.js');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1440px;height:900px;border:0';
    document.body.append(frame);
    const host = createAppHost({ appId: 'game-potion-brewing', runId: 'subpath-smoke', target: frame.contentWindow, expectedOrigin: location.origin,
      input: { contract: 'doki.game.potion-brewing-input', version: 1, data: {} } });
    host.connect({ onComplete: () => { throw new Error('preview must not complete'); } });
    frame.src = path;
  }, appPath + 'index.html');
  const frame = page.frameLocator('iframe');
  await frame.locator('#app[data-preview="true"]').waitFor();
  await frame.locator('#potion-scene-host canvas').waitFor();
  const loaded = await frame.locator('body').evaluate(() => [...document.images].filter(img => img.src.includes('/apps/game-potion-brewing/')).every(img => img.complete && img.naturalWidth > 0));
  if (!loaded || failures.length) throw new Error(`subpath dist failed: loaded=${loaded}; ${failures.join(' | ')}`);
  console.log(JSON.stringify({ pass: true, path: appPath, browserErrors: 0 }));
} finally {
  await browser?.close();
  if (process.platform === 'win32' && !server.proc.killed) server.proc.kill('SIGTERM');
  stopDevServer(server.proc);
}
