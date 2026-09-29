import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RHETORIC_BASE_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/w5-6-feedback');
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

  await playMostExpensive();
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'impact');
  await page.screenshot({ path: resolve(out, '01-player-impact-start.png') });
  await page.waitForTimeout(325);
  await page.screenshot({ path: resolve(out, '02-player-impact-mid.png') });
  const playerImpactMid = await page.evaluate(() => ({
    phase: window.__rhetoricDuel?.view().phase,
    progress: document.getElementById('rhetoric-progress-value-current')?.textContent,
  }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(out, '03-player-impact-settled.png') });
  const playerImpactSettled = await page.evaluate(() => ({
    phase: window.__rhetoricDuel?.view().phase,
    progress: document.getElementById('rhetoric-progress-value-current')?.textContent,
  }));
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'ready');

  await playMostExpensive();
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'ready');
  await page.screenshot({ path: resolve(out, '04-focus-insufficient.png') });
  const disabled = await page.locator('[id^="rhetoric-card-disabled-"]').evaluateAll((nodes) => nodes.map((node) => ({
    text: node.textContent,
    color: getComputedStyle(node).color,
    background: getComputedStyle(node.parentElement).backgroundColor,
  })));

  await page.locator('[data-action="rhetoric.end-turn"]').click();
  await page.waitForFunction(() => window.__rhetoricDuel?.view().phase === 'enemy-impact');
  await page.screenshot({ path: resolve(out, '05-enemy-impact-start.png') });
  await page.waitForTimeout(240);
  await page.screenshot({ path: resolve(out, '06-enemy-impact-mid.png') });
  const enemyImpact = await page.evaluate(() => ({
    phase: window.__rhetoricDuel?.view().phase,
    pressure: document.getElementById('rhetoric-pressure-value-current')?.textContent,
  }));

  await writeFile(resolve(out, 'probe.json'), `${JSON.stringify({ url: page.url(), playerImpactMid, playerImpactSettled, disabled, enemyImpact }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ playerImpactMid, playerImpactSettled, disabled, enemyImpact }));
} finally {
  await browser.close();
}
