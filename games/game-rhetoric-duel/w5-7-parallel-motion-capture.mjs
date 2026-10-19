import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RHETORIC_BASE_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/w5-7-parallel-motion');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: edge });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?game=game-rhetoric-duel`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'ready', undefined, { timeout: 15_000 });

  const playMostExpensive = async () => {
    const cards = page.locator('[data-action="rhetoric.play"]');
    const choices = await cards.evaluateAll((nodes) => nodes.map((node, index) => ({
      index,
      cost: Number(node.querySelector('[id*="rhetoric-card-cost-value-"]')?.textContent ?? 0),
    })).sort((a, b) => b.cost - a.cost));
    if (!choices[0]) return false;
    await cards.nth(choices[0].index).click();
    return true;
  };
  const geometry = async (label) => page.evaluate((sampleLabel) => ({
    label: sampleLabel,
    phase: window.__rhetoricDuel?.view().phase,
    progressTrackY: document.getElementById('rhetoric-progress-track')?.getBoundingClientRect().y,
    cards: Array.from(document.querySelectorAll('[id^="rhetoric-hand-x-"]')).map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.id, x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10 };
    }),
  }), label);

  const samples = [await geometry('ready')];
  await page.screenshot({ path: resolve(out, '01-ready.png') });
  await playMostExpensive();
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'card-flight');
  samples.push(await geometry('flight-start'));
  await page.screenshot({ path: resolve(out, '02-flight-hit-start.png') });
  await page.waitForTimeout(140);
  samples.push(await geometry('flight-mid'));
  await page.screenshot({ path: resolve(out, '03-flight-hit-mid.png') });
  await page.waitForTimeout(260);
  samples.push(await geometry('flight-late'));
  await page.screenshot({ path: resolve(out, '04-flight-hit-late.png') });
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'impact');
  samples.push(await geometry('impact'));
  await page.screenshot({ path: resolve(out, '05-impact-hold.png') });
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'ready');

  await playMostExpensive();
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'ready');
  await page.screenshot({ path: resolve(out, '06-focus-unavailable.png') });
  const unavailable = await page.evaluate(() => ({
    bands: document.querySelectorAll('[id^="rhetoric-card-unavailable-band-"]').length,
    warningCopy: document.querySelectorAll('[id^="rhetoric-card-disabled-"]').length,
    veils: document.querySelectorAll('[id^="rhetoric-card-unavailable-veil-"]').length,
  }));

  await writeFile(resolve(out, 'probe.json'), `${JSON.stringify({ url: page.url(), samples, unavailable }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ samples, unavailable }));
} finally {
  await browser.close();
}
