// Offline v2 fake-host witness against the real built App. No service/network.
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { detectBrowserRuntime } from '../../../scripts/lib/render-harness.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dist = resolve(appRoot, 'dist');
const sdk = resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'src', 'index.js');
const shots = resolve(repoRoot, 'docs', 'design', 'game-card-reveal', 'self-check', 'shots');
const sourceIndex = process.argv.indexOf('--source-image');
const sourceImage = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : undefined;
if (!sourceImage) throw new Error('Pass --source-image with the DokiWorlds QA WebP path.');
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(`No isolated browser available: ${runtime.reason}`);
const mime = (path) => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json'
  : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.png') ? 'image/png' : 'text/html';

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/host.html') { await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:transparent"></body></html>' }); return; }
    if (url.pathname === '/vendor-sdk.js') { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(sdk) }); return; }
    if (url.hostname === 'source-qa.test') { await route.fulfill({ status: 200, contentType: 'image/webp', body: await readFile(sourceImage) }); return; }
    const path = resolve(dist, url.pathname.slice(1) || 'index.html');
    const rel = relative(dist, path);
    if (rel === '..' || rel.startsWith(`..${sep}`)) { await route.fulfill({ status: 403, body: '' }); return; }
    try {
      if (!(await stat(path)).isFile()) throw new Error('Not a file');
      await route.fulfill({ status: 200, contentType: mime(path), body: await readFile(path) });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://card-reveal.test/host.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { createAppHost } = await import('/vendor-sdk.js');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'display:block;width:1440px;height:900px;border:0';
    document.body.append(frame);
    const input = { contract: 'doki.game.card-reveal-input', version: 2, data: {
      presentationId: 'preview-clear', locale: 'zh-CN',
      pack: { packId: 'preview', title: '哈利·波特', coverImageUrl: 'https://source-qa.test/cover.webp', titleLogoUrl: null },
      cards: [{ id: 'preview-clear', kind: 'event', name: '哈利·波特 · 通关纪念', description: '完成全部主线',
        rarity: 'epic', imageUrl: 'https://source-qa.test/card.webp', worldTitle: '哈利·波特' }],
    } };
    const host = createAppHost({ appId: 'game-card-reveal', runId: 'v2-qa', target: frame.contentWindow,
      input, scope: window, expectedOrigin: location.origin });
    window.__v2Output = null;
    window.__v2Exit = 0;
    const disconnect = host.connect({ onComplete(output) { window.__v2Output = output; return { status: 'accepted' }; },
      onRequestExit() { window.__v2Exit++; } });
    window.addEventListener('pagehide', () => { disconnect(); host.dispose(); }, { once: true });
    frame.src = '/index.html';
  });
  await page.waitForFunction(() => window.__v2Output !== null, undefined, { timeout: 20_000 });
  const result = await page.evaluate(() => ({ output: window.__v2Output, exits: window.__v2Exit }));
  if (result.exits !== 0 || result.output?.contract !== 'doki.game.card-reveal-result' || result.output?.version !== 1
    || result.output?.data?.presentationId !== 'preview-clear' || result.output?.data?.outcome !== 'viewed'
    || result.output?.data?.completion !== 'natural') throw new Error(`Wrong formal v2 result: ${JSON.stringify(result)}`);
  await page.frameLocator('iframe').locator('canvas').first().screenshot({ path: resolve(shots, 'settlement-v2-formal-P5.png'), omitBackground: true });
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ result: 'PASS', inputVersion: 2, outputVersion: 1, completion: 'natural', browserClosed: 'after-finally', serviceStarted: false }));
} finally { if (browser) await browser.close(); }
