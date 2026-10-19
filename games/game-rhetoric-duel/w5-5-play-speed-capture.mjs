import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RHETORIC_BASE_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/w5-5-play-speed');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: edge });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?game=game-rhetoric-duel`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'ready', undefined, { timeout: 15_000 });

  const playable = page.locator('[data-action="rhetoric.play"]:not([disabled])').first();
  await playable.waitFor({ state: 'visible' });
  const startedAt = Date.now();
  await playable.click();
  const samples = [];
  let previous = '';
  let flightShot = false;
  let impactShot = false;
  let flightStartedAt;

  while (Date.now() - startedAt < 8_000) {
    const phase = await page.evaluate(() => window.__rhetoricDuel?.view().phase ?? 'missing');
    const elapsedMs = Date.now() - startedAt;
    if (phase !== previous) {
      samples.push({ phase, elapsedMs });
      if (phase === 'card-flight') flightStartedAt = elapsedMs;
      previous = phase;
    }
    if (phase === 'card-lift' && samples.length === 1) {
      await page.screenshot({ path: resolve(out, '01-card-lift.png') });
    }
    if (phase === 'card-flight' && !flightShot && flightStartedAt !== undefined && elapsedMs - flightStartedAt >= 360) {
      await page.screenshot({ path: resolve(out, '02-card-flight-mid.png') });
      flightShot = true;
    }
    if (phase === 'impact' && !impactShot) {
      await page.screenshot({ path: resolve(out, '03-impact.png') });
      impactShot = true;
    }
    if (phase === 'ready' && samples.some((sample) => sample.phase === 'impact')) break;
    await page.waitForTimeout(10);
  }

  const timing = await page.evaluate(() => window.__rhetoricDuel?.timing());
  await writeFile(resolve(out, 'probe.json'), `${JSON.stringify({ url: page.url(), timing, samples }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ timing, samples }));
} finally {
  await browser.close();
}
