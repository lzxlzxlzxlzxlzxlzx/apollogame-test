import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RHETORIC_PREVIEW_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = resolve('docs/design/game-rhetoric-duel/self-check/w5-4-card-style');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: edge });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?game=game-rhetoric-duel&manualPresentation=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#rhetoric-duel').waitFor();
  await page.keyboard.press('Space');
  await page.locator('[data-action="rhetoric.play"]').first().waitFor();

  const card = page.locator('[data-action="rhetoric.play"]').first();
  await page.screenshot({ path: resolve(out, '01-ready.png') });
  await card.hover();
  await page.screenshot({ path: resolve(out, '02-hover.png') });
  await card.click();
  await page.screenshot({ path: resolve(out, '03-lift-disabled.png') });
  await page.evaluate(() => window.__rhetoricDuel.advance());
  await page.locator('#rhetoric-flight-y').waitFor();
  await page.locator('#rhetoric-flight-y').evaluate((root) => {
    for (const animation of root.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 500;
    }
  });
  await page.screenshot({ path: resolve(out, '04-flight.png') });
  await page.evaluate(() => window.__rhetoricDuel.advance());
  await page.screenshot({ path: resolve(out, '05-impact.png') });

  const probe = await page.locator('[id^="rhetoric-card-"]:not([id*="frame"]):not([id*="art"]):not([id*="cost"]):not([id*="row"]):not([id*="copy"]):not([id*="name"]):not([id*="source"]):not([id*="effect"]):not([id*="hotkey"]):not([id*="disabled"])').first().evaluate((root) => {
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
    };
    const metric = (selector) => {
      const node = root.querySelector(selector);
      const style = node ? getComputedStyle(node) : undefined;
      return node ? { rect: rect(node), fontSize: style?.fontSize, color: style?.color, opacity: style?.opacity, text: node.textContent } : null;
    };
    const frame = root.querySelector('[id^="rhetoric-card-frame-"]');
    return {
      card: rect(root),
      frame: frame ? { ...rect(frame), backgroundImage: getComputedStyle(frame).backgroundImage, skinned: frame.hasAttribute('data-apollo-skin') } : null,
      art: metric('[id^="rhetoric-card-art-"]'),
      cost: metric('[id^="rhetoric-card-cost-value-"]'),
      name: metric('[id^="rhetoric-card-name-"]'),
      source: metric('[id^="rhetoric-card-source-"]'),
      effect: metric('[id^="rhetoric-card-effect-"]'),
      hotkey: metric('[id^="rhetoric-card-hotkey-value-"]'),
    };
  });
  await writeFile(resolve(out, 'probe.json'), `${JSON.stringify(probe, null, 2)}\n`, 'utf8');
  console.log(`RHETORIC_W5_4_CARD_STYLE=${out}`);
} finally {
  await browser.close();
}
