import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RHETORIC_BASE_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/w5-8-state-motion');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: edge });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?game=game-rhetoric-duel&manualPresentation=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__rhetoricDuel));
  await page.evaluate(() => window.__rhetoricDuel.skip());
  await page.waitForFunction(() => window.__rhetoricDuel.view().phase === 'ready');

  const playable = page.locator('[data-action="rhetoric.play"]:not([disabled])');
  const choices = await playable.evaluateAll((nodes) => nodes.map((node, index) => ({
    index,
    cost: Number(node.querySelector('[id*="rhetoric-card-cost-value-"]')?.textContent ?? 0),
  })).sort((a, b) => b.cost - a.cost));
  await playable.nth(choices[0]?.index ?? 0).click();

  const focusSamples = [];
  for (const [phase, file] of [
    ['card-lift', '01-focus-card-lift.png'],
    ['card-flight', '02-fast-hit.png'],
  ]) {
    await page.waitForFunction((wanted) => window.__rhetoricDuel.view().phase === wanted, phase);
    focusSamples.push(await page.evaluate(() => ({
      phase: window.__rhetoricDuel.view().phase,
      focus: window.__rhetoricDuel.view().transition?.after.focus,
      veils: document.querySelectorAll('[id^="rhetoric-card-unavailable-veil-"]').length,
    })));
    await page.screenshot({ path: resolve(out, file) });
    await page.evaluate(() => window.__rhetoricDuel.advance());
  }

  await page.waitForFunction(() => window.__rhetoricDuel.view().phase === 'impact');
  await page.waitForTimeout(160);
  const discardMid = await page.evaluate(() => {
    const moving = document.getElementById('rhetoric-discard-flight')?.getBoundingClientRect();
    const target = document.getElementById('rhetoric-discard-target')?.getBoundingClientRect();
    return {
      phase: window.__rhetoricDuel.view().phase,
      veils: document.querySelectorAll('[id^="rhetoric-card-unavailable-veil-"]').length,
      moving: moving ? { x: moving.x, y: moving.y, width: moving.width, height: moving.height } : null,
      target: target ? { x: target.x, y: target.y, width: target.width, height: target.height } : null,
      spin: getComputedStyle(document.getElementById('rhetoric-discard-spin')).animationName,
    };
  });
  focusSamples.push({ phase: 'impact', focus: await page.evaluate(() => window.__rhetoricDuel.view().transition?.after.focus), veils: discardMid.veils });
  await page.screenshot({ path: resolve(out, '03-discard-flight.png') });
  await page.waitForTimeout(340);
  await page.evaluate(() => window.__rhetoricDuel.advance());
  await page.screenshot({ path: resolve(out, '04-discard-settled.png') });

  await page.evaluate(() => window.__rhetoricDuel.advance());
  await page.evaluate(() => window.__rhetoricDuel.action('rhetoric.end-turn'));
  await page.evaluate(() => window.__rhetoricDuel.advance());
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(out, '05-enemy-attack.png') });
  const enemyAttackPhase = await page.evaluate(() => window.__rhetoricDuel.view().phase);
  await page.evaluate(() => window.__rhetoricDuel.advance());
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(out, '06-enemy-impact-neutral.png') });
  const enemyImpactPhase = await page.evaluate(() => window.__rhetoricDuel.view().phase);

  await page.evaluate(() => window.__rhetoricDuel.advance());
  await page.evaluate(() => window.__rhetoricDuel.advance());
  const keptPositions = async () => page.evaluate(() => Array.from(document.querySelectorAll('[id^="rhetoric-hand-x-"]')).map((node) => {
    const rect = node.getBoundingClientRect();
    return { id: node.id, x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10 };
  }));
  const drawStart = await keptPositions();
  await page.screenshot({ path: resolve(out, '07-draw-reflow-start.png') });
  await page.waitForTimeout(180);
  const drawMid = await keptPositions();
  await page.screenshot({ path: resolve(out, '08-draw-reflow-mid.png') });

  const timing = await page.evaluate(() => window.__rhetoricDuel.timing());
  const probe = { url: page.url(), timing, focusSamples, discardMid, enemyAttackPhase, enemyImpactPhase, drawStart, drawMid };
  await writeFile(resolve(out, 'probe.json'), `${JSON.stringify(probe, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(probe));
} finally {
  await browser.close();
}
