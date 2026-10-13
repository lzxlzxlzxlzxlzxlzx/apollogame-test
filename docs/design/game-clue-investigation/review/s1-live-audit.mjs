import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:4173/prototype.dc.html';
const OUT = 'docs/design/game-clue-investigation/review/artifacts';

function sameRect(a, b) {
  return ['x', 'y', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) < 0.1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`page:${error.message}`));
  await page.goto(URL, { waitUntil: 'networkidle' });

  assert(await page.title() === '现场搜证 · S1-P 原型', '页面标题正确');
  assert(await page.locator('.hotspot').count() === 7, '存在 7 个可调查热点');
  assert(await page.locator('#stateSelect option').count() === 9, '审阅控制覆盖九态');
  assert(await page.locator('.ai-background, .prop-art').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), '8 张 AI 图片全部解码');
  await page.screenshot({ path: `${OUT}/s1-live-initial.png`, fullPage: true });

  const stageBefore = await page.locator('#stage').boundingBox();
  await page.locator('[data-id="shelf"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#archiveBar.visible').waitFor();
  const stageDuringBar = await page.locator('#stage').boundingBox();
  assert(stageBefore && stageDuringBar && sameRect(stageBefore, stageDuringBar), '底部档案条不改变舞台位置或尺寸');
  await page.keyboard.press('Escape');
  assert(!await page.locator('#archiveBar').evaluate((node) => node.classList.contains('visible')), 'Escape 关闭档案条');

  await page.locator('[data-id="lock"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#evidenceVeil.open').waitFor();
  assert(await page.locator('#statusStrip').textContent() === 'STATE · clue-reveal', '键盘 Enter 进入线索特写');
  await page.keyboard.press('Escape');
  assert(await page.locator('#evidenceVeil').getAttribute('aria-hidden') === 'true', 'Escape 关闭线索特写');

  for (const state of ['scene-idle', 'object-hover', 'object-pressed', 'flavor-result', 'clue-reveal', 'clue-collected', 'completed', 'exit-confirm', 'disabled']) {
    await page.locator('#stateSelect').selectOption(state);
    assert(await page.locator('#statusStrip').textContent() === `STATE · ${state}`, `可直接审阅 ${state}`);
  }

  await page.locator('#resetBtn').click();
  await page.locator('#motionBtn').click();
  assert(await page.locator('#stage').evaluate((node) => node.classList.contains('reduced')), 'reduced-motion 开关生效');
  for (let run = 1; run <= 10; run += 1) {
    await page.locator('#resetBtn').click();
    await page.locator('#autoBtn').click();
    await page.waitForFunction(() => document.querySelector('#statusStrip')?.textContent === 'STATE · completed', undefined, { timeout: 3000 });
    assert(await page.locator('#progress').textContent() === '2 / 2', `自动链第 ${run} 次稳定收录 2 / 2`);
  }
  await page.screenshot({ path: `${OUT}/s1-live-completed.png`, fullPage: true });

  await page.locator('#restartBtn').click();
  await page.locator('#exitBtn').click();
  assert(await page.locator('#exitVeil').getAttribute('aria-hidden') === 'false', '退出入口打开 cancelled 确认');
  await page.locator('#exitCancel').click();
  assert(await page.locator('#exitVeil').getAttribute('aria-hidden') === 'true', '取消退出返回现场');
  assert(errors.length === 0, `页面控制台与 pageerror 为零${errors.length ? `：${errors.join(' | ')}` : ''}`);
  await context.close();
  console.log(`S1-LIVE-AUDIT: PASS url=${URL} browserClosed=true`);
} finally {
  await browser.close();
}
