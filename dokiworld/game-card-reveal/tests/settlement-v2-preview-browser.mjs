// Offline dist witness: every request is fulfilled from the built App directory.
// No HTTP server, owner browser profile, account, or network request is used.
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { detectBrowserRuntime } from '../../../scripts/lib/render-harness.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(appRoot, 'dist');
const shots = resolve(appRoot, '..', '..', 'docs', 'design', 'game-card-reveal', 'self-check', 'shots');
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(`No isolated browser available: ${runtime.reason}`);
const sourceIndex = process.argv.indexOf('--source-image');
const sourceImage = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : undefined;
if (sourceIndex >= 0 && !sourceImage) throw new Error('--source-image requires a local WebP path');
const mime = (path) => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json'
  : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.png') ? 'image/png'
    : path.endsWith('.webp') ? 'image/webp' : 'text/html';

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (sourceImage && url.pathname.endsWith('/preview-0.svg')) {
      await route.fulfill({ status: 200, contentType: 'image/webp', body: await readFile(sourceImage) }); return;
    }
    const path = resolve(dist, url.pathname.slice(1) || 'index.html');
    const rel = relative(dist, path);
    if (rel === '..' || rel.startsWith(`..${sep}`)) { await route.fulfill({ status: 403, body: '' }); return; }
    try {
      if (!(await stat(path)).isFile()) throw new Error('Not a file');
      await route.fulfill({ status: 200, contentType: mime(path), body: await readFile(path) });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto(`http://card-reveal.test/index.html?preview=1&settlement=${sourceImage ? 'source&cards=1' : '1&cards=3'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => performance.getEntriesByName('card-reveal:engine-start').length === 1);
  const canvas = page.locator('canvas').first();
  if (await canvas.count() !== 1) throw new Error('Missing game canvas');
  for (const [phase, ms] of [['P2', 1800], ['P3', 2350], ['P5', sourceImage ? 5700 : 7900]]) {
    await page.waitForFunction((offset) => performance.now() - performance.getEntriesByName('card-reveal:engine-start')[0].startTime >= offset, ms);
    await canvas.screenshot({ path: resolve(shots, `settlement-v2-${sourceImage ? 'source-' : ''}${phase}.png`), omitBackground: true });
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ result: 'PASS', preview: sourceImage ? 'source-backed-qa' : 'settlement-v2', shots: ['P2', 'P3', 'P5'], browserClosed: 'after-finally', serviceStarted: false }));
} finally { if (browser) await browser.close(); }
