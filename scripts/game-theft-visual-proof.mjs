import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const output = new URL('../docs/design/game-theft/self-check/shots/', import.meta.url);
await mkdir(output, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, output));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 960 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/?game=game-theft', { waitUntil: 'networkidle' });
  await page.waitForTimeout(180);
  await page.screenshot({ path: shot('S4-1-start.png'), fullPage: true });
} finally {
  await browser.close();
}
