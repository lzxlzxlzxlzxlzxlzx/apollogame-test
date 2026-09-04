import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'games', 'game-105', 'probe');
const runtime = detectBrowserRuntime();
if (!runtime.ok) process.exit(3);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import('playwright');
const dev = await startDevServer(ROOT);
const browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const url = `http://localhost:${dev.port}/?game=game-105`;
const shots = [];
const shot = async (name) => { const file = join(OUT, `S4-local-ai-${name}.png`); await page.screenshot({ path: file }); shots.push({ name, file }); };
const status = () => page.locator('#g105-status').textContent().catch(() => '');
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(4500); await shot('01-opening');
  const canvas = page.locator('canvas');
  // Same real canvas gesture used by the S4 UI walkthrough; it never calls game internals.
  await page.mouse.move(650, 220); await page.mouse.down(); await page.mouse.move(650, 550, { steps: 24 }); await page.mouse.up();
  await page.waitForTimeout(3500); await shot('02-player-action');
  const complete = page.locator('[data-action="tower.interaction.complete"]');
  if (await complete.count()) {
    await complete.click();
    // The director visibly observes before its 24-frame pull startup, then keeps the joint live.
    await page.waitForTimeout(150); await shot('03-ai-observe');
    await page.waitForTimeout(400); await shot('04-ai-turn');
  }
  await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(4500);
  await page.mouse.move(610, 400); await page.mouse.down(); await page.mouse.move(1200, 400, { steps: 36 });
  // Keep the real player joint attached long enough for the loaded middle-layer body to catch up.
  await page.waitForTimeout(8500); await page.mouse.up();
  await page.waitForTimeout(4500); await shot('05-collapse');
  const restart = page.locator('[data-action="tower.restart"]');
  if (await restart.count()) { await restart.click(); await page.waitForTimeout(4500); await shot('06-restart'); }
  writeFileSync(join(OUT, 'S4-local-ai-playthrough.json'), JSON.stringify({ ok: errors.length === 0, at: new Date().toISOString(), statuses: { final: await status() }, screenshots: shots, consoleErrors: errors }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: errors.length === 0, shots: shots.length, consoleErrors: errors.length }));
} finally {
  await browser.close(); stopDevServer(dev.proc);
}
