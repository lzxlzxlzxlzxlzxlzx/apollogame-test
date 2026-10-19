import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RHETORIC_PREVIEW_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/w5-shots');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: edge });

const makePage = async (fallback = false) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (fallback) await page.route('**/games/game-rhetoric-duel/art/**', (route) => route.abort());
  return page;
};
const shot = async (page, name) => page.screenshot({ path: resolve(out, name), fullPage: false });
const openGame = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#rhetoric-duel').waitFor();
  await page.waitForFunction(() => window.__rhetoricDuel?.view());
};
const advanceTo = async (page, phase) => {
  for (let step = 0; step < 24; step += 1) {
    const current = await page.evaluate(() => window.__rhetoricDuel?.view().phase);
    if (current === phase) return;
    await page.evaluate(() => window.__rhetoricDuel?.advance());
  }
  throw new Error(`presentation did not reach ${phase}`);
};
const ready = (page) => advanceTo(page, 'ready');
const skip = (page) => page.locator('[data-action="rhetoric.skip-presentation"]').click();
const play = async (page, cardId) => {
  await page.locator(`[data-action="rhetoric.play"][data-arg="${cardId}"]`).first().click();
  await skip(page);
};
const endTurn = async (page) => {
  await page.locator('[data-action="rhetoric.end-turn"]').click();
  await skip(page);
};

try {
  const page = await makePage();
  await openGame(page, `${base}?game=game-rhetoric-duel&manualPresentation=1`);
  await shot(page, 'D01-camera.png');
  await advanceTo(page, 'reveal-intent');
  await shot(page, 'D02-reveal.png');
  await ready(page);
  await shot(page, 'D03-opening-ready.png');
  await page.locator('[data-action="rhetoric.play"]').first().hover();
  await shot(page, 'D04-card-hover.png');
  await page.locator('[data-action="rhetoric.play"]').first().click();
  await advanceTo(page, 'card-flight');
  await page.waitForTimeout(260);
  await shot(page, 'D05-card-flight.png');
  await advanceTo(page, 'impact');
  await shot(page, 'D06-progress-impact.png');
  await ready(page);
  await page.locator('[data-action="rhetoric.end-turn"]').click();
  await advanceTo(page, 'enemy-intent');
  await shot(page, 'D08-enemy-intent.png');
  await advanceTo(page, 'enemy-impact');
  await shot(page, 'D07-pressure-impact.png');
  await advanceTo(page, 'focus-refresh');
  await shot(page, 'D09-focus-refresh.png');
  await advanceTo(page, 'deal-new-cards');
  await shot(page, 'D10-deal-new.png');
  await page.close();

  const victory = await makePage();
  await openGame(victory, `${base}?game=game-rhetoric-duel&manualPresentation=1`);
  await ready(victory);
  await play(victory, 'catch-the-thread');
  await endTurn(victory);
  await play(victory, 'state-the-line');
  await play(victory, 'catch-the-thread');
  await endTurn(victory);
  await play(victory, 'pin-down-detail');
  await play(victory, 'probe-question');
  await endTurn(victory);
  await victory.locator('[data-action="rhetoric.play"][data-arg="pin-down-detail"]').first().click();
  await advanceTo(victory, 'result-panel');
  await shot(victory, 'D11-victory.png');
  await victory.close();

  const loss = await makePage();
  await openGame(loss, `${base}?game=game-rhetoric-duel&fixture=luo-zhanggui&manualPresentation=1`);
  await ready(loss);
  for (let turn = 0; turn < 3; turn += 1) await endTurn(loss);
  await loss.locator('[data-action="rhetoric.end-turn"]').click();
  await advanceTo(loss, 'result-panel');
  await shot(loss, 'D12-loss.png');
  await loss.close();

  const fallback = await makePage(true);
  await openGame(fallback, `${base}?game=game-rhetoric-duel&manualPresentation=1`);
  await ready(fallback);
  await shot(fallback, 'D13-fallback.png');
  await fallback.close();

  const reduced = await makePage();
  await openGame(reduced, `${base}?game=game-rhetoric-duel&manualPresentation=1&reducedMotion=1`);
  await ready(reduced);
  await shot(reduced, 'D14-reduced-motion.png');
  await reduced.close();
} finally {
  await browser.close();
}

console.log(`RHETORIC_W5_EVIDENCE=${out}`);
