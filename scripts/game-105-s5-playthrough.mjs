import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBE = join(ROOT, 'public', 'games', 'game-105', 'probe');
const SHOTS = join(ROOT, 'docs', 'design', 'game-105', 'self-check', 'shots');
const requestedStage = process.env.GAME105_EVIDENCE_STAGE;
const evidenceStage = requestedStage && /^[A-Za-z0-9-]+$/.test(requestedStage) ? requestedStage : 'S4-extension';
const runtime = detectBrowserRuntime();
if (!runtime.ok) process.exit(3);
mkdirSync(PROBE, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const { chromium } = await import('playwright');
const dev = await startDevServer(ROOT);
const browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const shots = [];
let wrapBackground = '';
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

async function shot(name) {
  const file = join(PROBE, `${evidenceStage}-${name}.png`);
  await page.screenshot({ path: file });
  copyFileSync(file, join(SHOTS, `${evidenceStage}-${name}.png`));
  shots.push({ name, file });
}

async function openGame() {
  await page.goto(`http://localhost:${dev.port}/?game=game-105`, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
}

async function pullPlayerBlock() {
  await page.mouse.move(650, 220);
  await page.mouse.down();
  await page.mouse.move(650, 550, { steps: 24 });
  await page.mouse.up();
}

try {
  await openGame();
  await shot('01-opening');
  await pullPlayerBlock();
  const submit = page.locator('[data-action="tower.interaction.submit"]');
  await submit.waitFor({ state: 'visible', timeout: 9000 });
  await shot('02-player-card');
  await page.locator('[data-action="tower.response.quick"]').first().click();
  await submit.click();
  await page.waitForTimeout(180);
  await shot('03-ai-observe');
  await page.waitForTimeout(600);
  await shot('04-ai-turn');

  await openGame();
  // Calibration identifies g105-block-08-01 as a repeatable physical-collapse sample.
  // It is the centre block of layer 8 in the default camera, so this remains a real canvas drag.
  await page.mouse.move(650, 400);
  await page.mouse.down();
  await page.mouse.move(1200, 400, { steps: 36 });
  await page.waitForTimeout(8500);
  await page.mouse.up();
  const wrap = page.locator('#g105-wrap-card');
  await wrap.waitFor({ state: 'visible', timeout: 9000 });
  wrapBackground = await wrap.evaluate((element) => getComputedStyle(element).background);
  await shot('05-collapse');
  const restart = wrap.locator('[data-action="tower.restart"]');
  await restart.click();
  await page.waitForTimeout(4500);
  await shot('06-restart');

  const result = { ok: errors.length === 0, at: new Date().toISOString(), screenshots: shots, wrapBackground, consoleErrors: errors };
  writeFileSync(join(PROBE, `${evidenceStage}-playthrough.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ok: result.ok, shots: shots.length, consoleErrors: errors.length }));
  process.exitCode = result.ok ? 0 : 1;
} finally {
  await browser.close();
  stopDevServer(dev.proc);
}
