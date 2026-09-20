import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [], trace = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto('http://127.0.0.1:5186/?game=game-mcfight');
  await page.locator('#buy-vindicator').waitFor();
  const save = async name => { await page.screenshot({ path: `${out}${name}.png`, fullPage: true }); trace.push({ name, text: await page.locator('body').innerText() }); };
  await save('roundtrip-01-shop');
  await page.locator('#buy-vindicator').click();
  await page.waitForFunction(() => document.querySelector('#s4-budget')?.textContent?.includes('金币 25'));
  await save('roundtrip-02-purchase');
  await page.locator('#enter-deploy').click();
  await page.locator('#start-battle').waitFor();
  const box = await page.locator('canvas').boundingBox(); if (!box) throw new Error('Canvas missing');
  const point = (x,y) => ({ x: box.x + (480+x*18)*box.width/960, y: box.y + (360+y*18)*box.height/720 });
  const from = point(-15,14), to = point(-12,0);
  await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(to.x,to.y,{ steps: 12 }); await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('#start-battle')?.disabled);
  await save('roundtrip-03-pointer-deploy');
  await page.locator('#start-battle').click();
  await page.waitForFunction(() => document.querySelector('#phase-hint')?.textContent?.includes('战斗'));
  await save('roundtrip-04-battle');
  await page.locator('#result-continue').waitFor({ timeout: 195000 });
  await save('roundtrip-05-result');
  await page.locator('#result-continue').click();
  await page.waitForFunction(() => document.querySelector('#s4-budget')?.textContent?.includes('第 2 轮'));
  await save('roundtrip-06-next-shop');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  writeFileSync(`${out}browser-roundtrip.json`, JSON.stringify({ scope: 'real pointer and normal-clock roundtrip on current partial assembly; not six representative skills acceptance', errors, trace }, null, 2));
  await browser.close();
}

