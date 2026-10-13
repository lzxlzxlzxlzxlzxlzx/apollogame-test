#!/usr/bin/env node
// GAL-PUI-03B：短生命周期、隔离 profile 的真 Chromium WheelEvent 验收；不启动任何应用服务。
import { build } from 'vite';
import { chromium } from 'playwright';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.wheel-action-browser-tmp');
const bundledChromium = chromium.executablePath();
const executablePath = process.env.UI_AUDIT_CHROMIUM
  || (existsSync(bundledChromium) ? bundledChromium : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
let browser;
try {
  mkdirSync(tmp, { recursive: true });
  await build({
    configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { outDir: tmp, emptyOutDir: false, lib: { entry: join(root, 'tools/audits/wheel-action.audit.ts'), formats: ['iife'], name: 'WheelAudit', fileName: () => 'audit.js' } },
  });
  writeFileSync(join(tmp, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"><div id="root"></div><script src="./audit.js"></script>');
  browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
  await page.goto(`file://${join(tmp, 'index.html')}`);
  await page.waitForTimeout(80);
  const center = async (id) => page.locator(id).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  let point = await center('#wheel-story');
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, 120);
  let calls = await page.evaluate(() => window.__wheelAudit.calls);
  if (calls.join(',') !== 'wheel.up,wheel.down') throw new Error(`story wheel expected two actions, got ${calls.join(',')}`);
  point = await center('#wheel-history');
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, 120);
  calls = await page.evaluate(() => window.__wheelAudit.calls);
  if (calls.length !== 2) throw new Error(`inner scroll leaked a wheel action: ${calls.join(',')}`);
  await page.evaluate(() => window.__wheelAudit.openModal());
  point = await center('#wheel-story');
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, 120);
  calls = await page.evaluate(() => window.__wheelAudit.calls);
  if (calls.length !== 2) throw new Error(`open modal leaked a background action: ${calls.join(',')}`);
  await page.evaluate(() => {
    window.__wheelAudit.teardown();
    // teardown 后故意把旧 host 伪装成 wheel region；若监听残留会再入队，作为清理锚点。
    const host = document.getElementById('root');
    host.setAttribute('data-wheel-region', '');
    host.setAttribute('data-wheel-down', 'wheel.down');
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
  });
  calls = await page.evaluate(() => window.__wheelAudit.calls);
  if (calls.length !== 2) throw new Error(`teardown left a wheel listener behind: ${calls.join(',')}`);
  console.log('✅ WheelEvent browser audit passed: directions, scroll priority, modal block, teardown.');
} finally {
  await browser?.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
}
