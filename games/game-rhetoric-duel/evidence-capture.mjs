import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RHETORIC_PREVIEW_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/shots');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: edge });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const shot = async (name) => page.screenshot({ path: resolve(out, name), fullPage: false });
const advanceTo = async (phase) => {
  for (let step = 0; step < 20; step += 1) {
    const current = await page.evaluate(() => window.__rhetoricDuel?.view().phase);
    if (current === phase) return;
    await page.evaluate(() => window.__rhetoricDuel?.advance());
  }
  throw new Error(`presentation did not reach ${phase}`);
};
const ready = async () => advanceTo('ready');
const skip = async () => page.getByRole('button', { name: '跳过演出' }).click();
const play = async (cardId) => {
  await page.locator(`[data-action="rhetoric.play"][data-arg="${cardId}"]`).first().click();
  await skip();
};
const endTurn = async () => { await page.getByRole('button', { name: '结束回合' }).click(); await skip(); };

try {
  await page.goto(`${base}?game=game-rhetoric-duel&manualPresentation=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#rhetoric-duel').waitFor();
  await shot('01-enter.png');
  await advanceTo('reveal-intent');
  await shot('01b-intent-reveal.png');
  await ready();
  await shot('02-opening-hand-ready.png');
  await page.locator('[data-action="rhetoric.play"]').first().click();
  await advanceTo('card-flight');
  await shot('03-card-flight.png');
  await advanceTo('impact');
  await shot('04-progress-impact.png');
  await ready();
  await page.getByRole('button', { name: '结束回合' }).click();
  await advanceTo('enemy-impact');
  await shot('05-enemy-impact.png');
  await advanceTo('focus-refresh');
  await shot('06-focus-refresh.png');
  await advanceTo('deal-new-cards');
  await shot('07-next-turn-draw.png');

  await page.goto(`${base}?game=game-rhetoric-duel&manualPresentation=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await play('catch-the-thread');
  await endTurn();
  await play('state-the-line');
  await play('catch-the-thread');
  await endTurn();
  await play('pin-down-detail');
  await play('probe-question');
  await endTurn();
  await page.locator('[data-action="rhetoric.play"][data-arg="pin-down-detail"]').first().click();
  await advanceTo('result-panel');
  await page.getByText('论证成立', { exact: true }).waitFor({ timeout: 10000 });
  await shot('08-victory.png');
  await page.getByRole('button', { name: '返回游戏库' }).click();
  await page.waitForURL((url) => !url.searchParams.has('game'), { timeout: 5000 });
  await shot('09-victory-exit.png');

  await page.goto(`${base}?game=game-rhetoric-duel&fixture=luo-zhanggui&manualPresentation=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  for (let turn = 0; turn < 3; turn += 1) await endTurn();
  await page.getByRole('button', { name: '结束回合' }).click();
  await advanceTo('result-panel');
  await page.getByText('交锋失利', { exact: true }).waitFor({ timeout: 10000 });
  await shot('10-defeat-turns.png');
  await page.getByRole('button', { name: '返回游戏库' }).click();
  await page.waitForURL((url) => !url.searchParams.has('game'), { timeout: 5000 });

  await page.goto(`${base}?game=game-rhetoric-duel&reducedMotion=1&manualPresentation=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await shot('11-reduced-motion.png');
  await shot('12-fallback-visual.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('13-narrow-ready.png');
} finally {
  await browser.close();
}

console.log(`RHETORIC_EVIDENCE=${out}`);
