// Diagnostic gate: expected to remain RED until the recorded visual gaps close.
import { build } from 'vite';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { engineAliases } from './engine-aliases.mjs';

const root = resolve('.');
const scratch = mkdtempSync(resolve(tmpdir(), 'demon-boundary-02-'));
const evidence = resolve(root, 'docs/design/game-demon-castle/self-check');
const shots = resolve(evidence, 'shots/DEMON-CASTLE-UI-RUNTIME-02-boundary');
const failures = [], pageErrors = [];
let browser, server;
try {
  await build({ configFile: false, resolve: { alias: engineAliases(root) }, logLevel: 'error',
    plugins: [{ name: 'legal-calendar-name-boundary-test-only', enforce: 'pre', transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/scripts/audits/demon-castle-ui-runtime-02.fixture.ts')) return;
      const anchor = "date: '蚀月季 第999日（第999天）', slot: '暮色'";
      assert.equal(code.split(anchor).length, 2, 'read-model fixture anchor must hit exactly once');
      console.log('Boundary fixture anchor=1; no shared source writes.');
      return code.replace(anchor, "date: '月'.repeat(64) + '·第999天', slot: '夜'.repeat(64)");
    } }],
    build: { outDir: scratch, emptyOutDir: false, copyPublicDir: false,
      lib: { entry: resolve(root, 'scripts/audits/demon-castle-ui-runtime-02.fixture.ts'), name: 'BoundaryProbe', formats: ['iife'], fileName: () => 'probe.js' } } });
  server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}#root{position:relative;width:100vw;height:100vh}</style><div id="root"></div><script src="/probe.js"></script>');
      return;
    }
    const base = path === '/probe.js' ? scratch : resolve(root, 'public');
    const target = resolve(base, path.slice(1));
    if (!target.startsWith(base + sep)) { res.statusCode = 403; res.end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(target)] ?? 'application/octet-stream');
      res.end(readFileSync(target));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log('Isolated diagnostic:', url, '(no StoragePort, no ZeroCraft services)');
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-quest-open')?.hasAttribute('data-apollo-icon-loaded'));
  const button = page.locator('#life-host-quest-open');
  const settle = () => page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  const sample = () => button.evaluate(el => {
    const css = getComputedStyle(el), img = el.querySelector('img'), imageCss = getComputedStyle(img);
    const filters = [css.filter, imageCss.filter];
    const translate = value => value === 'none' ? 0 : new DOMMatrixReadOnly(value).m42;
    const brightness = filters.reduce((product, value) => product * Number(value.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1), 1);
    return { transform: css.transform, filter: css.filter, boxShadow: css.boxShadow, background: css.backgroundColor, border: css.borderTopWidth,
      imageTransform: imageCss.transform, imageFilter: imageCss.filter,
      translateY: translate(css.transform) + translate(imageCss.transform), brightness,
      approvedGlow: filters.some(value => /drop-shadow\(rgb\(214, 182, 239\) 0px 0px 5px\)/.test(value)) };
  });
  mkdirSync(shots, { recursive: true });
  await page.mouse.move(400, 700); await settle(); const baseline = await sample();
  await button.hover(); await settle(); const hover = await sample();
  await page.screenshot({ path: resolve(shots, 'hover-1440.png') });
  await page.mouse.down(); await settle(); const pressed = await sample();
  await page.screenshot({ path: resolve(shots, 'pressed-1440.png') });
  await page.mouse.move(400, 700); await page.mouse.up(); await page.keyboard.press('Escape');
  if (Math.abs(hover.translateY + 3) > .01 || Math.abs(hover.brightness - 1.2) > .01 || !hover.approvedGlow) failures.push('hover differs from approved -3px / brightness1.2 / glow5px');
  if (Math.abs(pressed.translateY - 3) > .01 || Math.abs(pressed.brightness - .85) > .01) failures.push('pressed differs from approved +3px / brightness0.85');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.lifeRuntimeProbe.fixture('status-long', 'quest'));
  const extreme = await page.locator('#life-host-status-line').evaluate(el => {
    const css = getComputedStyle(el), b = el.getBoundingClientRect(), p = document.getElementById('life-host-status-ink').getBoundingClientRect();
    return { text: el.textContent, font: css.fontSize, lineHeight: css.lineHeight, width: b.width, height: b.height, contentWidth: p.width,
      oneLine: b.height <= parseFloat(css.lineHeight) + 1, inside: b.x >= p.x - 1 && b.right <= p.right + 1 };
  });
  await page.screenshot({ path: resolve(shots, 'calendar-64-64-375.png') });
  if (!extreme.oneLine) failures.push('legal 64/64 calendar names wrap instead of remaining one line at375');
  const result = { url, baseline, hover, pressed, extreme, pageErrors, failures, note: 'RED diagnostic, not an acceptance PASS; read-model fixture only, no World/save writes.' };
  writeFileSync(resolve(evidence, 'DEMON-CASTLE-UI-RUNTIME-02-boundary.measurements.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  assert.equal(pageErrors.length, 0);
  assert.equal(failures.length, 0, 'Unresolved visual gaps must not be marked PASS');
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  assert.ok(scratch.startsWith(resolve(tmpdir()) + sep) && scratch.includes('demon-boundary-02-'));
  rmSync(scratch, { recursive: true, force: true });
  console.log('Diagnostic browser/server closed; task scratch removed.');
}
