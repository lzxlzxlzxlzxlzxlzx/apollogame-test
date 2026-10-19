// Short-lived real-browser witness for DokiWorld material image URLs.
// Fake HTTPS assets are fulfilled locally; the browser and Vite probe close in finally.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(runtime.reason);
const dev = await startDevServer(root, { port: 5703 });
let browser;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const fetched = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`http://localhost:${dev.port}/potion-image-host`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>' }));
  await page.route('https://assets.example.invalid/**', (route) => {
    const name = new URL(route.request().url()).pathname;
    fetched.push(name);
    const color = name.includes('moon') ? '#ed274f' : '#1459ef';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="88"><rect width="80" height="88" fill="${color}"/><circle cx="40" cy="44" r="22" fill="#fff"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
  await page.goto(`http://localhost:${dev.port}/potion-image-host`);
  const materialRequests = Promise.all(['/moon.svg', '/blue.svg'].map((path) =>
    page.waitForEvent('requestfinished', { predicate: (request) => request.url() === `https://assets.example.invalid${path}` }),
  ));
  await page.evaluate(async (port) => {
    const { createAppHost } = await import('/vendor/dokiworlds-app-sdk/src/index.js');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1440px;height:900px;border:0;display:block';
    document.body.append(frame);
    const input = { contract: 'doki.game.potion-brewing-input', version: 1, data: {
      brewingId: 'image-probe', recipe: { recipeId: 'moon-dew', name: '月露安神剂',
        ingredients: [
          { ingredientId: 'moon-herb', name: '月露草', imageUrl: 'https://assets.example.invalid/moon.svg' },
          { ingredientId: 'host-blue', name: '蓝叶', imageUrl: 'https://assets.example.invalid/blue.svg' },
        ],
        steps: [{ kind: 'add', ingredientId: 'moon-herb', liquidColor: '#69adb1' }, { kind: 'stir', direction: 'clockwise', turns: 1, liquidColor: '#398f93' }],
      },
    } };
    const host = createAppHost({ appId: 'game-potion-brewing', runId: 'image-probe', target: frame.contentWindow, input, expectedOrigin: location.origin });
    host.connect({ onComplete: () => ({ status: 'accepted' }) });
    frame.src = `http://localhost:${port}/dokiworld/game-potion-brewing/dist/index.html`;
  }, dev.port);
  const frame = page.frameLocator('iframe');
  const canvas = frame.locator('#potion-scene-host canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.document.querySelector('#potion-material-host-blue') !== null, undefined, { timeout: 10_000 });
  await materialRequests;
  // Two render-frame fences after the remote responses, without a wall-clock sleep.
  await canvas.evaluate((element) => new Promise((resolve) => element.ownerDocument.defaultView.requestAnimationFrame(() =>
    element.ownerDocument.defaultView.requestAnimationFrame(resolve))));
  if (!fetched.includes('/moon.svg') || !fetched.includes('/blue.svg')) throw new Error(`宿主图片未加载: ${JSON.stringify(fetched)}`);
  if (errors.length) throw new Error(`浏览器错误: ${errors.join(' | ')}`);
  const shot = resolve(root, 'docs/design/game-potion-brewing/self-check/shots/S7-host-material-image-urls.png');
  await page.screenshot({ path: shot });
  console.log(JSON.stringify({ pass: true, fetched, browserErrors: 0, screenshot: shot }));
} finally {
  await browser?.close();
  if (process.platform === 'win32' && !dev.proc.killed) dev.proc.kill('SIGTERM');
  stopDevServer(dev.proc);
}
