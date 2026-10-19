import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const mode = process.argv.includes('--baseline') ? 'baseline' : 'final';
const base = process.env.RHETORIC_PREVIEW_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve(`docs/design/game-rhetoric-duel/self-check/w5-1-shots/${mode}`);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: edge });
const metadata = { mode, viewport: { width: 1440, height: 900 }, deal: [], plays: [], states: [] };

const pageFor = async (extra = '') => {
  const page = await browser.newPage({ viewport: metadata.viewport, deviceScaleFactor: 1 });
  await page.goto(`${base}?game=game-rhetoric-duel&manualPresentation=1${extra}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#rhetoric-duel').waitFor();
  await page.waitForFunction(() => window.__rhetoricDuel?.view());
  return page;
};
const phase = (page) => page.evaluate(() => window.__rhetoricDuel.view().phase);
const advanceTo = async (page, target) => {
  for (let guard = 0; guard < 30; guard += 1) {
    if (await phase(page) === target) return;
    await page.evaluate(() => window.__rhetoricDuel.advance());
  }
  throw new Error(`phase ${target} was not reached`);
};
const rect = async (page, selector) => page.locator(selector).evaluate((node) => {
  const r = node.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
const shotAt = async (page, name, elapsedMs) => {
  await page.screenshot({ path: resolve(out, name), fullPage: false });
  return { file: name, requestedMs: elapsedMs, phase: await phase(page) };
};
const captureOffsets = async (page, prefix, offsets, selector = '#rhetoric-hand') => {
  const rows = [];
  await page.evaluate((target) => {
    const root = document.querySelector(target);
    if (!root) throw new Error(`animation root ${target} is missing`);
    for (const animation of root.getAnimations({ subtree: true })) animation.pause();
  }, selector);
  for (const offset of offsets) {
    const animationCount = await page.evaluate(({ target, at }) => {
      const root = document.querySelector(target);
      if (!root) throw new Error(`animation root ${target} is missing`);
      const animations = root.getAnimations({ subtree: true });
      for (const animation of animations) { animation.pause(); animation.currentTime = at; }
      return animations.length;
    }, { target: selector, at: offset });
    const row = await shotAt(page, `${prefix}-${String(offset).padStart(3, '0')}ms.png`, offset);
    rows.push({ ...row, animationCount });
  }
  return rows;
};

try {
  const opening = await pageFor();
  await advanceTo(opening, 'deal-opening-hand');
  metadata.deal = await captureOffsets(opening, 'deal-opening', [0, 150, 300, 450, 690]);
  await advanceTo(opening, 'ready');
  await opening.screenshot({ path: resolve(out, 'ready.png'), fullPage: false });
  metadata.states.push({
    name: 'ready', phase: await phase(opening),
    cards: await opening.locator('[data-action="rhetoric.play"]').evaluateAll((nodes) => nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { id: node.id, arg: node.getAttribute('data-arg'), x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    })),
    deck: await rect(opening, '#rhetoric-deck-back'),
  });
  await opening.close();

  for (const index of [0, 2, 4]) {
    const page = await pageFor();
    await advanceTo(page, 'ready');
    const buttons = page.locator('[data-action="rhetoric.play"]');
    const start = await buttons.nth(index).evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { arg: node.getAttribute('data-arg'), x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    await buttons.nth(index).click();
    const initialPhase = await phase(page);
    await page.screenshot({ path: resolve(out, `play-slot-${index + 1}-initial.png`), fullPage: false });
    if (initialPhase === 'card-lift') await page.evaluate(() => window.__rhetoricDuel.advance());
    const flightPhase = await phase(page);
    if (mode === 'final' && flightPhase === 'card-flight') {
      const frames = await captureOffsets(page, `play-slot-${index + 1}`, [0, 80, 160, 240, 320], '#rhetoric-flight-y');
      metadata.plays.push({ index, start, initialPhase, flightPhase, frames });
    } else {
      await page.screenshot({ path: resolve(out, `play-slot-${index + 1}-flight.png`), fullPage: false });
      metadata.plays.push({ index, start, initialPhase, flightPhase });
    }
    await page.close();
  }

  const refill = await pageFor();
  await advanceTo(refill, 'ready');
  await refill.locator('[data-action="rhetoric.play"]').first().click();
  await refill.evaluate(() => window.__rhetoricDuel.skip());
  await refill.locator('[data-action="rhetoric.end-turn"]').click();
  await advanceTo(refill, 'deal-new-cards');
  metadata.states.push({ name: 'deal-new-cards', frames: await captureOffsets(refill, 'deal-refill', [0, 690]) });
  await refill.close();

  const busy = await pageFor();
  await advanceTo(busy, 'ready');
  await busy.locator('[data-action="rhetoric.play"]').first().click();
  await busy.screenshot({ path: resolve(out, 'disabled-busy.png'), fullPage: false });
  metadata.states.push({ name: 'disabled-busy', phase: await phase(busy) });
  await busy.close();

  const reduced = await pageFor('&reducedMotion=1');
  await advanceTo(reduced, 'ready');
  await reduced.locator('[data-action="rhetoric.play"]').first().click();
  await reduced.screenshot({ path: resolve(out, 'reduced-motion.png'), fullPage: false });
  metadata.states.push({ name: 'reduced-motion', phase: await phase(reduced) });
  await reduced.close();

  await writeFile(resolve(out, 'timeline.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
} finally {
  await browser.close();
}

console.log(`RHETORIC_W5_1_${mode.toUpperCase()}=${out}`);
