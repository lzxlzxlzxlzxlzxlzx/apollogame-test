#!/usr/bin/env node
import { build } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = join(root, '.life-launcher-proof-tmp');
const output = join(root, 'docs', 'design', 'game-simlife', 'self-check', 'eng17e');
const executablePath = process.env.UI_AUDIT_CHROMIUM || '/opt/pw-browsers/chromium';
let browser;
try {
  mkdirSync(temp, { recursive: true }); mkdirSync(output, { recursive: true });
  await build({
    configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: true, outDir: temp, emptyOutDir: true, lib: { entry: join(root, 'tools', 'audits', 'life-launcher.audit.ts'), formats: ['iife'], name: 'LifeLauncherProof', fileName: () => 'proof.js' } },
  });
  writeFileSync(join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="./proof.js"></script>');
  browser = await chromium.launch({ executablePath });
  for (const [width, height] of [[640, 720], [1060, 760], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`file://${join(temp, 'index.html')}`);
    await page.waitForTimeout(700);
    if (errors.length > 0) throw new Error(`browser errors at ${width}x${height}: ${errors.join('; ')}`);
    if (await page.locator('canvas').count() !== 1) throw new Error(`expected one canvas at ${width}x${height}`);
    await page.screenshot({ path: join(output, `life-launcher-${width}x${height}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser?.close();
  rmSync(temp, { recursive: true, force: true });
}
