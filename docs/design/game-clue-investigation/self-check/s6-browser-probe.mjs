// 本游戏 S4/S5 真浏览器旅程：只启动短时局部 Vite + 隔离无头 Edge，finally 全部清理。
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { decodePNG, cartProbeFixture, detectBrowserRuntime, startDevServer, stopDevServer } from '../../../../scripts/lib/render-harness.mjs';

const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const out = join(root, 'docs/design/game-clue-investigation/self-check/shots');
const stage = 'S6';
const shotPath = (name) => join(out, name.replace(/^S4-/, `${stage}-`));
const fixture = cartProbeFixture(root, 'game-clue-investigation');
// Independent author-time PNG alpha oracle; no engine hit-map implementation is reused.
const index = JSON.parse(readFileSync(join(root, 'library/game-clue-investigation/art/index.json'), 'utf8'));
const samples = {};
for (const id of ['lock', 'shelf', 'clock', 'cup', 'rug', 'prints', 'letter']) {
  const entity = fixture.manifest.entities[`object-${id}`];
  const entry = index.assets.find(a => a.id === entity.Sprite.textureKey);
  const png = decodePNG(readFileSync(join(root, 'library/game-clue-investigation/art', entry.path.split('/art/')[1])));
  const scale = Math.min(entity.Sprite.width / png.width, entity.Sprite.height / png.height);
  if (png.channels !== 4) throw new Error(`Expected RGBA PNG: ${id}`);
  const alpha = (x, y) => png.pixels[(y * png.width + x) * 4 + 3];
  const found = {};
  // Pick robust opaque and transparent neighborhoods inside the actual drawn image.
  for (let y = 12; y < png.height - 12; y += 4) for (let x = 12; x < png.width - 12; x += 4) {
    const offsets = [-8, 0, 8];
    for (const [kind, test] of [['solid', a => a >= 200], ['transparent', a => a === 0]]) {
      if (found[kind] || !offsets.every(dy => offsets.every(dx => test(alpha(x + dx, y + dy))))) continue;
      const point = { x: entity.Transform.x + (x + .5 - png.width / 2) * scale, y: entity.Transform.y + (y + .5 - png.height / 2) * scale };
      // Avoid HUD and other foreground object overlap for these scene samples.
      if (point.y < 170 || point.y > 700 && point.x < 350) continue;
      found[kind] = point;
    }
  }
  if (!found.solid || !found.transparent) throw new Error(`No alpha samples: ${id}`);
  samples[id] = found;
}
const browserRuntime = detectBrowserRuntime();
if (!browserRuntime.ok) throw new Error(`无可用浏览器：${browserRuntime.reason}`);

const live = process.argv.includes('--live');
const dev = live ? { port: 5173 } : await startDevServer(root, { port: 5726 });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: browserRuntime.execPath, args: ['--no-sandbox'] });
  const prototypePage = await browser.newPage({ viewport: { width: 1480, height: 940 }, deviceScaleFactor: 1 });
  await prototypePage.goto(pathToFileURL(join(root, 'docs/design/game-clue-investigation/prototype.dc.html')).href, { waitUntil: 'load' });
  await prototypePage.locator('.prototype-panel').evaluate((element) => { element.style.display = 'none'; });
  await prototypePage.locator('.status-strip').evaluate((element) => { element.style.display = 'none'; });
  mkdirSync(out, { recursive: true });
  await prototypePage.locator('#stage').screenshot({ path: shotPath('S4-00-prototype-idle.png'), animations: 'disabled' });
  for (const [state, name] of [
    ['flavor-result', 'S4-00-prototype-flavor.png'],
    ['clue-reveal', 'S4-00-prototype-reveal.png'],
    ['clue-collected', 'S4-00-prototype-collected.png'],
    ['completed', 'S4-00-prototype-completed.png'],
    ['exit-confirm', 'S4-00-prototype-exit.png'],
  ]) {
    await prototypePage.locator('#stateSelect').evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, state);
    await prototypePage.locator('#stage').screenshot({ path: shotPath(name), animations: 'disabled' });
  }
  await prototypePage.close();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  if (!live) {
    // Isolated probe has no full workbench backend; this is DevTools metadata, not game state.
    await page.route('http://localhost:4000/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
    await page.route('**/api/library/game-clue-investigation/manifest', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
  }
  await page.goto(`http://localhost:${dev.port}/?game=lib:game-clue-investigation&s3Probe=1`, { waitUntil: 'load' });
  const canvas = page.locator('canvas').last();
  await canvas.waitFor({ state: 'visible' });
  await page.locator('#case-heading').waitFor({ state: 'visible' });

  const shot = async (name) => page.screenshot({ path: shotPath(name), animations: 'disabled' });
  const rect = async () => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas 无边界');
    return box;
  };
  const hit = async (x, y) => {
    const box = await rect();
    await page.mouse.click(box.x + box.width * x / 1440, box.y + box.height * y / 900);
  };
  const assertText = async (selector, text) => {
    await page.locator(selector).getByText(text, { exact: false }).waitFor({ state: 'visible', timeout: 4000 });
  };
  const idleRect = await rect();
  const alphaChecks = [];
  for (const size of [{ width: 1440, height: 900 }, { width: 720, height: 800 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    for (const id of ['lock', 'shelf', 'clock', 'cup', 'prints', 'letter', 'rug']) {
      const p = samples[id].transparent;
      const box = await rect();
      await page.mouse.move(box.x + box.width * p.x / 1440, box.y + box.height * p.y / 900);
      await page.waitForTimeout(40);
      const highlighted = await page.locator(`#cart-focus-object-${id}`).getAttribute('data-pointer-feedback-state');
      if (highlighted === 'hover') throw new Error(`transparent hover ${id}`);
      await hit(p.x, p.y);
      await page.waitForTimeout(280);
      if (await page.locator('#clue-reveal-modal, #flavor-archive').count()) throw new Error(`transparent click ${id}`);
      alphaChecks.push({ viewport: size, id, result: 'transparent inert' });
      const positive = samples[id].solid;
      await hit(positive.x, positive.y);
      if (['lock', 'prints', 'letter'].includes(id)) {
        await page.locator(`#evidence-${id}-image`).waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.locator('#clue-reveal-modal').waitFor({ state: 'detached' });
      } else {
        await page.locator('#flavor-archive').waitFor({ state: 'visible' });
        await page.locator('#flavor-continue').click();
        await page.locator('#flavor-archive').waitFor({ state: 'detached' });
      }
      alphaChecks.push({ viewport: size, id, result: 'solid reaches expected UI' });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.mouse.move(1400, 450);
  // Two fresh sessions cover every already-collected return button without suppressing completion.
  const revisitChecks=[];
  const collectOne=async id=>{await hit(samples[id].solid.x,samples[id].solid.y);await page.locator(`#${id}-collect`).click();await page.locator('#clue-collected-modal').waitFor();await page.locator('#clue-collected-modal').waitFor({state:'detached'});};
  const revisit=async(id,expected)=>{await hit(samples[id].solid.x,samples[id].solid.y);await page.locator(`#${id}-return`).waitFor();if(await page.locator(`#${id}-collect`).count())throw new Error(`duplicate collect button on revisit ${id}`);await page.locator(`#${id}-return`).click();await page.locator('#clue-reveal-modal').waitFor({state:'detached'});if((await page.locator('#progress-count').innerText()).trim()!==String(expected))throw new Error(`revisit count ${id}`);revisitChecks.push(id);};
  await collectOne('letter');await revisit('letter',0);
  await collectOne('lock');await revisit('lock',1);
  await collectOne('prints');await page.locator('#completed-restart').click();await page.locator('#investigation-completed-modal').waitFor({state:'detached'});
  await collectOne('prints');await revisit('prints',1);
  await collectOne('lock');await page.locator('#completed-restart').click();await page.locator('#investigation-completed-modal').waitFor({state:'detached'});
  const scenePixels = async () => decodePNG(Buffer.from(await canvas.evaluate(el => el.toDataURL('image/png').split(',')[1]), 'base64')).pixels;
  const beforeCollectionPixels = await scenePixels();
  await shot('S4-01-idle.png');
  await page.locator('#ledger-title').click();
  await page.locator('#clue-ledger').waitFor({ state: 'detached', timeout: 5000 });
  await shot('S4-01b-ledger-collapsed.png');
  await page.locator('#view-records').click();
  await page.locator('#clue-ledger').waitFor({ state: 'visible', timeout: 5000 });

  const cupPoint = { x: idleRect.x + idleRect.width * samples.cup.solid.x / 1440, y: idleRect.y + idleRect.height * samples.cup.solid.y / 900 };
  await page.mouse.move(cupPoint.x, cupPoint.y);
  await page.locator('#cart-focus-object-cup[data-pointer-feedback-state="hover"]').waitFor({ state: 'visible', timeout: 5000 });
  const pointerStyle=await page.locator('#cart-focus-object-cup').evaluate(el=>{const s=getComputedStyle(el);let a=el.parentElement;while(a&&!a.style.top)a=a.parentElement;return {top:a?.style.top,size:s.fontSize,color:s.color};});
  if(pointerStyle.top!=='504px'||pointerStyle.size!=='14px')throw new Error(`above label geometry ${JSON.stringify(pointerStyle)}`);
  await shot('S4-01c-cup-hover.png');
  await page.mouse.down();
  await page.locator('#cart-focus-object-cup[data-pointer-feedback-state="pressed"]').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-01d-cup-pressed.png');
  await page.mouse.up();
  await assertText('#flavor-archive', '茶杯');
  const flavorRect = await rect();
  if (stage === 'S6') {
    await page.waitForTimeout(260);
    const button = await page.locator('#flavor-continue').boundingBox();
    if (!button || Math.abs(button.x - 1284) > 1 || Math.abs(button.y - 833) > 1 || button.width !== 92 || button.height !== 41) throw new Error(`S4档案条按钮几何漂移：${JSON.stringify(button)}`);
  }
  if (Math.abs(flavorRect.x - idleRect.x) > 0.5 || Math.abs(flavorRect.y - idleRect.y) > 0.5) {
    throw new Error(`档案条使场景漂移：idle=${JSON.stringify(idleRect)}, flavor=${JSON.stringify(flavorRect)}`);
  }
  await shot('S4-02-flavor.png');
  await page.locator('[data-action="investigation.close"]').last().click();
  await page.locator('#flavor-archive').waitFor({ state: 'detached' });

  await hit(samples.lock.solid.x, samples.lock.solid.y);
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible' });
  if (stage === 'S6') {
    await page.waitForTimeout(300);
    const pose = await page.locator('#evidence-structure').evaluate((el) => getComputedStyle(el).transform);
    if (pose !== 'none' && pose !== 'matrix(1, 0, 0, 1, 0, 0)') throw new Error(`证物240ms后未归位：${pose}`);
    const imageSlot = await page.locator('#evidence-image-slot').boundingBox();
    const collect = await page.locator('#lock-collect').boundingBox();
    if (imageSlot?.width !== 716 || collect?.width !== 108 || collect?.height !== 47) throw new Error(`S4证物控件几何漂移：${JSON.stringify({ imageSlot, collect })}`);
  }
  await page.locator('#evidence-lock-image').evaluate(img => {
    if (!img.complete || img.naturalWidth === 0 || !img.src.includes('/games/game-clue-investigation/art/')) throw new Error('Evidence image not loaded');
  });
  await shot('S4-03-lock-reveal.png');
  const ui034=await page.evaluate(()=>{const css=id=>getComputedStyle(document.getElementById(id));return {imageBorder:css('evidence-image-slot').borderTopWidth,lineHeight:css('evidence-lock-text').lineHeight,buttonBorder:css('lock-collect').borderTopWidth,buttonOutline:css('lock-collect').outlineColor,buttonOffset:css('lock-collect').outlineOffset,innerAnimation:css('evidence-structure').animationDuration};});
  if(ui034.imageBorder!=='7px'||ui034.lineHeight!=='30.4px'||ui034.buttonBorder!=='2px'||ui034.innerAnimation!=='0s')throw new Error(`UI034 CSS mismatch ${JSON.stringify(ui034)}`);
  await page.locator('#lock-collect').click();
  await page.locator('#clue-collected-modal').waitFor({ state: 'visible' });
  // This is the true collection-busy interval, not a renamed stable preview.
  const busyCommits = await page.evaluate(() => window.__ZEROCRAFT_S3_CLICK_TRACE__.read().length);
  const busyProgress = await page.locator('#progress-count').innerText();
  if(busyProgress.trim()!=='1') throw new Error(`busy progress ${busyProgress}`);
  for(let i=0;i<3;i++){await page.mouse.click(1000,660);await page.keyboard.press('Enter');}
  const busyProgressAfter = await page.locator('#progress-count').innerText();
  const busyCommitsAfter = await page.evaluate(() => window.__ZEROCRAFT_S3_CLICK_TRACE__.read().length);
  if(busyProgressAfter.trim()!=='1'||busyCommitsAfter!==busyCommits)throw new Error('busy repeated input committed or double-counted');
  if(!busyCommits || !await page.locator('#clue-collected-modal').count())throw new Error('busy oracle missed the actual collection interval');
  const busyEvidence={progressBefore:busyProgress.trim(),progressAfter:busyProgressAfter.trim(),clickableCommitsBefore:busyCommits,clickableCommitsAfter:busyCommitsAfter,phase:'clue-collected',gesture:'3 real pointer clicks + 3 Enter',stableDisabledPreview:false};
  await shot('S4-04-lock-collected.png');
  await page.locator('#clue-collected-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.mouse.move(1400, 450);
  const afterCollectionPixels = await scenePixels();
  if (!beforeCollectionPixels.equals(afterCollectionPixels)) throw new Error('收录改变了现场Canvas像素（扣图/染色/绿幕）');

  await hit(samples.prints.solid.x, samples.prints.solid.y);
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible' });
  await page.locator('#prints-collect').click();
  await page.locator('#investigation-completed-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-05-completed.png');
  await page.locator('#completed-restart').click();
  await page.locator('#investigation-completed-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#progress-count').getByText('0').waitFor({ state: 'visible' });
  await shot('S4-06-restarted.png');

  await page.locator('#exit-investigation').click();
  await page.locator('#exit-confirm-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-07-exit-confirm.png');
  await page.locator('#exit-confirm').click();
  await page.locator('#investigation-cancelled-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-08-cancelled.png');
  let cancelTabCount=0;
  while(await page.evaluate(()=>document.activeElement?.id)!=='cancelled-restart'&&cancelTabCount<20){await page.keyboard.press('Tab');cancelTabCount++;}
  if(await page.evaluate(()=>document.activeElement?.id)!=='cancelled-restart')throw new Error('cancelled archive restart unreachable by keyboard');
  await page.keyboard.press('Enter');
  await page.locator('#investigation-cancelled-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#progress-count').getByText('0').waitFor({ state: 'visible' });
  await hit(246, 433);
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-09-post-cancel-playable.png');
  await page.keyboard.press('Escape');
  await page.locator('#clue-reveal-modal').waitFor({ state: 'detached', timeout: 5000 });

  await page.locator('#cart-focus-object-lock').focus();
  await page.keyboard.press('Enter');
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible', timeout: 5000 });
  await shot('S4-10-keyboard-reveal.png');
  await page.keyboard.press('Escape');
  await page.locator('#clue-reveal-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#case-utility').waitFor({ state: 'visible', timeout: 5000 });
  const focusAfterModalEscape = await page.evaluate(() => ({ id: document.activeElement?.id ?? '', tag: document.activeElement?.tagName ?? '' }));
  await page.keyboard.press('Escape');
  await page.locator('#exit-confirm-modal').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#exit-stay').click();
  await page.locator('#exit-confirm-modal').waitFor({ state: 'detached', timeout: 5000 });

  await page.setViewportSize({ width: 720, height: 800 });
  await page.waitForTimeout(200);
  const narrowRect = await rect();
  if (Math.abs(narrowRect.width / narrowRect.height - 1440 / 900) > 0.01) throw new Error('窄屏 Canvas 比例失配');
  await shot('S4-11-narrow.png');
  const touchPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, hasTouch: true });
  touchPage.on('console', (message) => { if (message.type() === 'error') errors.push(`touch: ${message.text()}`); });
  touchPage.on('pageerror', (error) => errors.push(`touch: ${error.message}`));
  await touchPage.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  if (!live) {
    await touchPage.route('http://localhost:4000/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    await touchPage.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
    await touchPage.route('**/api/library/game-clue-investigation/manifest', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
  }
  await touchPage.goto(`http://localhost:${dev.port}/?game=lib:game-clue-investigation`, { waitUntil: 'load' });
  await touchPage.locator('#case-heading').waitFor({ state: 'visible' });
  await touchPage.touchscreen.tap(samples.cup.solid.x, samples.cup.solid.y);
  await touchPage.locator('#flavor-archive').getByText('茶杯').waitFor({ state: 'visible', timeout: 5000 });
  await touchPage.screenshot({ path: shotPath('S4-12-touch-flavor.png'), animations: 'disabled' });
  await touchPage.close();
  const motion = [];
  if (stage === 'S6') {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const preference of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion: preference });
      await hit(246, 433);
      await page.locator('#evidence-structure').waitFor({ state: 'visible' });
      const duration = await page.locator('#clue-reveal-modal [data-modal-dialog]').evaluate((el) => getComputedStyle(el).animationDuration);
      if (duration !== (preference === 'reduce' ? '0s' : '0.24s')) throw new Error(`证物动效时长失配：${preference} ${duration}`);
      motion.push({ preference, duration });
      await page.keyboard.press('Escape');
      await page.locator('#clue-reveal-modal').waitFor({ state: 'detached' });
    }
    await hit(samples.cup.solid.x, samples.cup.solid.y);
    const archiveDuration = await page.locator('#flavor-archive').evaluate((el) => getComputedStyle(el).animationDuration);
    if (archiveDuration !== '0s') throw new Error(`减少动态效果下档案条仍运动：${archiveDuration}`);
    await shot('S4-13-reduced-motion.png');
  }
  if (errors.length) throw new Error(`浏览器错误：${errors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, stage, url: `http://localhost:${dev.port}/?game=lib:game-clue-investigation`, alphaChecks, samples, busyEvidence, revisitChecks,cancelTabCount, pointerStyle,ui034,touchDpr: 2, prototypeShots: 6, gameShots: stage === 'S6' ? 16 : 15, idleRect, flavorRect, narrowRect, focusAfterModalEscape, touch: 'cup→flavor', motion }));
} finally {
  try { await browser?.close(); } finally {
    if (dev.proc) stopDevServer(dev.proc);
    // 公共清理器的负 PID 进程组信号在 Windows 不生效；只补杀本探针持有的精确 Vite 子进程。
    if (process.platform === 'win32' && dev.proc && dev.proc.exitCode === null) dev.proc.kill('SIGTERM');
    dev.proc?.stdout?.destroy();
    dev.proc?.stderr?.destroy();
  }
}
