import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [], trace = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto('http://localhost:5173/games/game-mcfight/s4-preview.html');
  await page.locator('#buy-vindicator').waitFor();
  const save = async name => { await page.screenshot({ path: `${out}${name}.png`, fullPage: true }); trace.push({ name, text: await page.locator('body').innerText() }); };
  await save('preview-01-shop');
  await page.locator('#buy-vindicator').click();
  await page.waitForFunction(() => document.querySelector('#s4-budget')?.textContent?.includes('金币 25'));
  await save('preview-02-purchased');
  await page.locator('#enter-deploy').click();
  await page.locator('#start-battle').waitFor();
  await save('preview-03-deploy');
  const canvas = page.locator('canvas'), box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas missing');
  const point = (x,y) => ({ x: box.x + (480+x*18)*box.width/960, y: box.y + (360+y*18)*box.height/720 });
  const from = point(-15,14), to = point(-12,0);
  await page.mouse.move(from.x,from.y); await page.mouse.down();
  await page.mouse.move(to.x,to.y,{ steps: 12 }); await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('#start-battle')?.disabled);
  await save('preview-04-real-pointer-drop');
  await page.locator('#back-shop').click();
  await page.locator('#enter-deploy').waitFor();
  await save('preview-05-back-shop');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  writeFileSync(`${out}browser-preview.json`, JSON.stringify({ scope: 'shop/purchase/deploy/pointer/back only; not full battle acceptance', errors, trace }, null, 2));
  await browser.close();
}
