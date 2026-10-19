#!/usr/bin/env node
// Short-lived, isolated Vite + Chromium witness for a cartridge's local PNG bridge.
// Usage: node scripts/cart-art-browser.mjs --game <slug> --manifest <candidate.json> [--out <png>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cartProbeFixture, detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const slug = option('--game');
const manifestFile = option('--manifest');
const output = option('--out');
if (!slug || !manifestFile || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  process.stderr.write('usage: node scripts/cart-art-browser.mjs --game <slug> --manifest <candidate.json> [--out <png>]\n');
  process.exit(2);
}
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(`no isolated browser: ${runtime.reason}`);
const fixture = cartProbeFixture(root, slug);
const candidate = JSON.parse(readFileSync(resolve(manifestFile), 'utf8'));
const { chromium } = await import('playwright');
let dev;
let browser;
try {
  dev = await startDevServer(root);
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pngs = new Map();
  const errors = [];
  const page = await context.newPage();
  let servedManifest = candidate;
  page.on('response', (response) => {
    if (response.url().includes(`/games/${slug}/art/`) && response.url().endsWith('.png')) pngs.set(response.url(), response.status());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
  await page.route(`**/api/library/${slug}/manifest`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(servedManifest) }));
  await page.goto(`http://localhost:${dev.port}/?game=lib:${slug}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('canvas') && !!window.__zcProbe?.actions().some((action) => action.surface === 'canvas'), undefined, { timeout: 20000 });
  await page.waitForTimeout(100);
  const canvas = page.locator('canvas').first();
  const candidatePixels = await canvas.evaluate((element) => element.toDataURL());
  if (!candidatePixels.startsWith('data:image/png;base64,')) throw new Error('canvas did not render PNG');
  if (output) writeFileSync(resolve(output), await page.screenshot());
  const target = await page.evaluate(() => window.__zcProbe?.actions().find((action) => action.surface === 'canvas' && /lock/.test(action.action)));
  if (!target || target.x === undefined || target.y === undefined) throw new Error('lock has no reachable real Canvas target');
  await page.mouse.click(target.x, target.y);
  await page.waitForSelector('[data-modal-dialog]', { timeout: 3000 });
  servedManifest = fixture.manifest;
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(100);
  const legacyPixels = await page.locator('canvas').first().evaluate((element) => element.toDataURL());
  if (candidatePixels === legacyPixels) throw new Error('asset-backed Canvas equals legacy placeholder Canvas');
  const imageStatuses = [...pngs.values()];
  if (!imageStatuses.length || imageStatuses.some((status) => status !== 200)) throw new Error(`PNG response failures: ${JSON.stringify(imageStatuses)}`);
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
  process.stdout.write(JSON.stringify({ ok: true, url: `http://localhost:${dev.port}/?game=lib:${slug}`, pngResponses: imageStatuses.length, canvasChangedFromLegacy: true, canvasTarget: target.action, modalAfterClick: true, screenshot: output ?? null }) + '\n');
  await context.close();
} finally {
  await browser?.close().catch(() => {});
  if (dev) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(dev.proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else stopDevServer(dev.proc);
  }
}
