import { build } from 'vite';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { engineAliases } from '../../../../scripts/engine-aliases.mjs';

const root = resolve('.');
const scratch = mkdtempSync(resolve(tmpdir(), 'demon-feedback-review-'));
let server, browser;
try {
  await build({ configFile: false, resolve: { alias: engineAliases(root) }, logLevel: 'error', plugins: [{
    name: 'independent-disabled-read-model', enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/scripts/audits/demon-castle-ui-runtime-02.fixture.ts')) return;
      const anchor = "mountUI(document.getElementById('root')!, tree, {}, STARTER_THEME);";
      assert.equal(source.split(anchor).length - 1, 1);
      console.log('Disabled LayoutNode fixture anchor=1; no source writes.');
      return source.replace(anchor, `const disableEntry = (node: any): void => { if (node.id === 'life-host-quest-open') node.props.disabled = true; node.children?.forEach(disableEntry); }; disableEntry(tree); ${anchor}`);
    },
  }], build: {
    outDir: scratch, emptyOutDir: false, copyPublicDir: false,
    lib: { entry: resolve(root, 'scripts/audits/demon-castle-ui-runtime-02.fixture.ts'), name: 'FeedbackReview', formats: ['iife'], fileName: () => 'probe.js' },
  } });
  server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}#root{position:relative;width:100vw;height:100vh}</style><div id="root"></div><script src="/probe.js"></script>'); return; }
    const base = path === '/probe.js' ? scratch : resolve(root, 'public');
    const target = resolve(base, path.slice(1));
    if (!target.startsWith(base + sep)) { res.statusCode = 403; res.end(); return; }
    try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(target)] ?? 'application/octet-stream'); res.end(readFileSync(target)); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe);
  await page.waitForFunction(() => document.getElementById('life-host-quest-open')?.hasAttribute('data-apollo-icon-loaded'));
  const button = page.locator('#life-host-quest-open');
  const settle = () => page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  const sample = () => button.evaluate(el => {
    const css = getComputedStyle(el), img = el.querySelector('img'), imageCss = getComputedStyle(img);
    return { transform: css.transform, filter: css.filter, boxShadow: css.boxShadow, background: css.backgroundColor, border: css.borderTopWidth,
      opacity: css.opacity, disabled: el.disabled, imageTransform: imageCss.transform, imageFilter: imageCss.filter };
  });
  await page.mouse.move(400, 700); await settle(); const baseline = await sample();
  await button.hover(); await settle(); const hover = await sample();
  await page.mouse.down(); await settle(); const pressed = await sample();
  await page.mouse.move(400, 700); await page.mouse.up(); await page.keyboard.press('Escape');
  await page.evaluate(() => window.lifeRuntimeProbe.fixture('status-long', 'quest'));
  await page.waitForFunction(() => document.getElementById('life-host-quest-open')?.hasAttribute('data-apollo-icon-loaded'));
  await settle(); const disabled = await sample();
  await button.evaluate(el => el.click());
  assert.equal(disabled.disabled, true);
  assert.equal(disabled.opacity, '0.4');
  console.log(JSON.stringify({ url, baseline, hover, pressed, disabledLayoutNode: disabled, errors,
    note: 'disabled is rendered from a temporary read-model LayoutNode props.disabled=true; no source/World writes; full journey is the separate 395-check probe' }, null, 2));
  await page.evaluate(() => window.lifeRuntimeProbe.dispose());
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  assert.ok(scratch.startsWith(resolve(tmpdir()) + sep) && scratch.includes('demon-feedback-review-'));
  rmSync(scratch, { recursive: true, force: true });
  console.log('Independent feedback browser/server closed; scratch removed.');
}
