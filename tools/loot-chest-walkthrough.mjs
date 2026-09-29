import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const shots = resolve(root, 'docs/design/game-loot-chest/self-check/shots');
await mkdir(shots, { recursive: true });

const executablePath = process.env.UI_AUDIT_CHROMIUM || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const targetUrl = process.env.LOOT_CHEST_URL || 'http://127.0.0.1:5173/apps/game-loot-chest/index.html?preview=1';
const browser = await chromium.launch({
  executablePath,
  headless: true,
  ...(targetUrl.startsWith('file:') ? { args: ['--allow-file-access-from-files', '--disable-web-security'] } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 760 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(8_000);
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  console.log('loaded');
  await page.locator('#chest-stage').waitFor({ state: 'attached' });
  console.log(await page.locator('#chest-stage').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, style: element.getAttribute('style'), display: style.display, visibility: style.visibility, opacity: style.opacity };
  }));
  console.log('ready');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(shots, 'QTE-01-ready.png'), fullPage: true });

  await page.keyboard.press('Space');
  await page.locator('#qte-overlay').waitFor();
  console.log('playing');
  await page.waitForTimeout(190);
  await page.keyboard.press('Space');
  await page.waitForTimeout(90);
  await page.screenshot({ path: resolve(shots, 'QTE-02-miss.png'), fullPage: true });
  console.log('miss');

  const hit = async (index) => {
    await page.waitForFunction(() => {
      const rotor = document.getElementById('qte-needle-rotor');
      const match = rotor?.getAttribute('style')?.match(/rotate\(([-\d.]+)deg\)/);
      const angle = Number(match?.[1]);
      return Number.isFinite(angle) && angle >= 173 && angle <= 220;
    }, undefined, { timeout: 3000 });
    await page.locator('#qte-overlay').click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: resolve(shots, `QTE-0${index + 2}-hit-${index}.png`), fullPage: true });
    console.log(`hit-${index}`);
  };
  await hit(1);
  await hit(2);
  await hit(3);

  await page.locator('#opening-copy').waitFor();
  console.log('opening');
  await page.screenshot({ path: resolve(shots, 'QTE-06-opening.png'), fullPage: true });
  await page.locator('#claim-button').waitFor();
  console.log('revealed');
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(shots, 'QTE-07-revealed.png'), fullPage: true });
  await page.locator('#claim-button').click();
  await page.getByText('预览完成', { exact: true }).waitFor();
  console.log('claimed');
  await page.screenshot({ path: resolve(shots, 'QTE-08-claimed.png'), fullPage: true });
} finally {
  await browser.close();
}
