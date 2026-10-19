import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../../..');
const appRoot = resolve(root, 'dokiworld/game-clue-investigation/dist');
const sdkPath = resolve(root, 'vendor/dokiworlds-app-sdk/src/index.js');
const docs = readFileSync(resolve(root, 'dokiworld/game-clue-investigation/docs/integration.zh-CN.md'), 'utf8');
const fence = String.fromCharCode(96).repeat(3);
const scenario = process.argv[2] ?? 'accepted';
const input = JSON.parse(docs.split(fence + 'json')[1].split(fence)[0]);
input.data.background.pixelWidth = 1;
input.data.background.pixelHeight = 1;
for (const item of input.data.objects) {
  for (const key of ['sceneImage', 'evidenceImage']) {
    if (item[key]) { item[key].pixelWidth = 1; item[key].pixelHeight = 1; }
  }
  item.hitMask = { encoding: 'bitset-hex-msb', width: 1, height: 1, rows: ['8'] };
  item.placement = { ...item.placement, x: 0.5, y: 0.5, width: 0.2, height: 0.2 };
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><iframe id="app" src="/app/index.html" style="width:1000px;height:720px;border:0"></iframe>');
    return;
  }
  const file = path === '/sdk.js' ? sdkPath : resolve(appRoot, '.' + path.slice(4));
  if (path !== '/sdk.js' && (!path.startsWith('/app/') || !file.startsWith(appRoot))) {
    res.writeHead(404); res.end(); return;
  }
  try {
    const type = extname(file) === '.js' ? 'text/javascript' : extname(file) === '.json' ? 'application/json' : 'text/html';
    res.writeHead(200, { 'content-type': type }); res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let exitCount = 0; let completeCount = 0; const output = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`console.${msg.type()}: ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    canvas.getContext('2d').fillRect(0, 0, 1, 1);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await page.route('https://assets.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png }));
  await page.goto(base + '/');
  const appFrame = page.frameLocator('#app');
  const start = await page.evaluate(async (payload) => {
    const { createAppHost } = await import('/sdk.js');
    const host = createAppHost({ appId: 'game-clue-investigation', runId: 'probe-run-1',
      target: document.querySelector('#app').contentWindow, input: payload,
      scope: window, expectedOrigin: location.origin });
    window.__probeHost = host;
    host.connect({ onComplete: (value) => { window.__probeOutputs ??= []; window.__probeOutputs.push(value); return { status: window.__probeScenario === 'rejected' ? 'rejected' : 'accepted' }; },
      onRequestExit: () => { window.__probeExits = (window.__probeExits ?? 0) + 1; } });
    return 'host-connected';
  }, input);
  await page.evaluate((value) => { window.__probeScenario = value; }, scenario);
  console.log('HOST', start, 'URL', base, 'SCENARIO', scenario);
  await appFrame.locator('#status').waitFor();
  await page.waitForTimeout(3000);
  console.log('STATUS', await appFrame.locator('#status').textContent());
  console.log('CANVASES', await appFrame.locator('canvas').count());
  console.log('BUTTONS', await appFrame.locator('button').allTextContents());
  if (scenario === 'cancelled') {
    await appFrame.getByRole('button', { name: '退出调查' }).click();
    await page.waitForTimeout(300);
    console.log('AFTER_EXIT_BUTTONS', await appFrame.locator('button').allTextContents());
    const confirm = appFrame.getByRole('button', { name: '确认取消调查' });
    await confirm.click();
    await page.waitForTimeout(700);
    console.log('AFTER_EXIT_STATUS', await appFrame.locator('#status').textContent());
  } else {
    const canvasBox = await appFrame.locator('canvas').boundingBox();
    console.log('CANVAS_BOX', canvasBox);
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.waitForTimeout(500);
    console.log('AFTER_INSPECT_BUTTONS', await appFrame.locator('button').allTextContents());
    await appFrame.getByRole('button', { name: '收录证物' }).click();
    await page.waitForTimeout(2000);
    console.log('AFTER_COLLECT_BUTTONS', await appFrame.locator('button').allTextContents());
    console.log('AFTER_COLLECT_STATUS', await appFrame.locator('#status').textContent());
    if (scenario === 'repeat') {
      await appFrame.getByRole('button', { name: '重新检查现场' }).click();
      await page.waitForTimeout(500);
      await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      await page.waitForTimeout(300);
      await appFrame.getByRole('button', { name: '收录证物' }).click();
      await page.waitForTimeout(2000);
      console.log('AFTER_REPEAT_STATUS', await appFrame.locator('#status').textContent());
    }
  }
  console.log('HOST_STATE', JSON.stringify(await page.evaluate(() => ({ exits: window.__probeExits ?? 0, outputs: window.__probeOutputs ?? [] }))));
  console.log('WARNINGS', JSON.stringify(errors));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log('CLEANUP browser-and-server-closed');
}
