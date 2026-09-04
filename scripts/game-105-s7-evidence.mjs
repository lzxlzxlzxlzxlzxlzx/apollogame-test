import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';
import { gameHash } from './game-pipeline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'game-105';
const HASH = gameHash(ROOT, SLUG);
const PREFIX = `S7-${HASH}`;
const PROBE = join(ROOT, 'public', 'games', SLUG, 'probe');
const SHOTS = join(ROOT, 'docs', 'design', SLUG, 'self-check', 'shots');
const runtime = detectBrowserRuntime();
if (!runtime.ok) process.exit(3);
mkdirSync(PROBE, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const { chromium } = await import('playwright');
const dev = await startDevServer(ROOT);
const browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
const errors = [];
const url = `http://localhost:${dev.port}/?game=${SLUG}`;

const saveShot = async (page, name) => {
  const file = join(PROBE, `${PREFIX}-${name}.png`);
  await page.screenshot({ path: file });
  copyFileSync(file, join(SHOTS, `${PREFIX}-${name}.png`));
  return file;
};

const open = async (viewport) => {
  const page = await browser.newPage({ viewport });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  return page;
};

async function pullPlayerBlock(page, from = { x: 650, y: 220 }, to = { x: 650, y: 550 }) {
  const scale = await page.evaluate(() => Math.min(innerWidth / 1280, innerHeight / 720));
  await page.mouse.move(from.x * scale, from.y * scale);
  await page.mouse.down();
  await page.mouse.move(to.x * scale, to.y * scale, { steps: 24 });
  await page.mouse.up();
}

let narrow = null;
let vfx = null;
let perf = null;
try {
  // Enter the card through the calibrated desktop canvas path, then resize that same real state.
  const narrowPage = await open({ width: 1280, height: 800 });
  await narrowPage.mouse.move(650, 220);
  await narrowPage.waitForTimeout(120);
  const hover = await narrowPage.locator('canvas').evaluate((canvas) => getComputedStyle(canvas).cursor);
  if (!hover.includes('hover-ring')) throw new Error(`hover ring missing: ${hover}`);
  await saveShot(narrowPage, 'hover');
  await pullPlayerBlock(narrowPage);
  await narrowPage.locator('[data-action="tower.interaction.submit"]').waitFor({ state: 'visible', timeout: 9000 });
  await narrowPage.setViewportSize({ width: 800, height: 450 });
  await narrowPage.waitForTimeout(180);
  await saveShot(narrowPage, 'narrow-player-card');
  narrow = await narrowPage.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const input = document.querySelector('#g105-response-input');
    const actions = [...document.querySelectorAll('#g105-interaction-card button[data-action]')];
    const wrapInput = document.querySelector('#g105-wrap-input');
    const measures = [input, ...actions, wrapInput].filter(Boolean).map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
      id: element.id || element.getAttribute('data-action'),
      rect: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height },
      fontSize: getComputedStyle(element).fontSize,
      visible: !!(element.offsetWidth || element.offsetHeight),
      };
    });
    return { viewport, measures };
  });
  const visibleMeasures = narrow.measures.filter((item) => item.visible);
  if (!visibleMeasures.length || visibleMeasures.some((item) => item.rect.height < 27 || item.rect.left < 0 || item.rect.top < 0 || item.rect.right > 800 || item.rect.bottom > 450)) {
    throw new Error(`narrow controls are not readable/tappable: ${JSON.stringify(narrow)}`);
  }
  await narrowPage.setViewportSize({ width: 1280, height: 800 });
  const quick = narrowPage.locator('[data-action="tower.response.quick"]').first();
  const submit = narrowPage.locator('[data-action="tower.interaction.submit"]');
  await quick.click();
  await submit.click();
  await narrowPage.waitForTimeout(80);
  const heart = await narrowPage.locator('#g105-heart').evaluate((element) => ({
    html: element.innerHTML,
    animation: getComputedStyle(element).animationName,
    spark: !!element.querySelector('img[src*="heart-spark"]'),
  }));
  if (!heart.spark) throw new Error('heart spark image missing after a real interaction');
  await saveShot(narrowPage, 'heart');
  perf = await narrowPage.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    for (let i = 0; i < 240; i++) {
      await new Promise((resolve) => requestAnimationFrame((now) => { frames.push(now - last); last = now; resolve(); }));
    }
    const sorted = [...frames].sort((a, b) => a - b);
    const at = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
    return { frames: frames.length, median_ms: at(.5), p95_ms: at(.95), max_ms: at(1), domNodes: document.querySelectorAll('*').length };
  });
  await narrowPage.close();
  if (perf.p95_ms > 34) throw new Error(`performance p95 exceeds two frames: ${JSON.stringify(perf)}`);

  const collapsePage = await open({ width: 1280, height: 800 });
  await collapsePage.mouse.move(650, 400);
  await collapsePage.mouse.down();
  await collapsePage.mouse.move(1200, 400, { steps: 36 });
  await collapsePage.mouse.up();
  const wrap = collapsePage.locator('#g105-wrap-card');
  await wrap.waitFor({ state: 'visible', timeout: 9000 });
  const collapseFx = await wrap.evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    boxShadow: getComputedStyle(element).boxShadow,
  }));
  await saveShot(collapsePage, 'collapse');
  await collapsePage.close();
  vfx = { hover, heart, collapse: collapseFx };

  writeFileSync(join(PROBE, `${PREFIX}-usability.json`), JSON.stringify({ ok: true, slug: SLUG, gameHash: HASH, narrow, errors }, null, 2) + '\n');
  writeFileSync(join(PROBE, `${PREFIX}-vfx.json`), JSON.stringify({ ok: true, slug: SLUG, gameHash: HASH, vfx, errors }, null, 2) + '\n');
  writeFileSync(join(PROBE, `${PREFIX}-perf.json`), JSON.stringify({ ok: true, slug: SLUG, gameHash: HASH, perf, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, gameHash: HASH, narrow, vfx, perf, consoleErrors: errors.length }));
} catch (error) {
  console.error(`S7 evidence failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  stopDevServer(dev.proc);
}
