import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const source = fileURLToPath(new URL('../demon-castle-ui-revision-01.approved-2026-10-15.dc.html', import.meta.url));
const original = readFileSync(source, 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const before = hash(readFileSync(source));
const scratch = mkdtempSync(resolve(tmpdir(), 'demon-ui-review-'));
const shots = fileURLToPath(new URL('./DEMON-CASTLE-UI-REVISION-01-shots/', import.meta.url));
mkdirSync(shots, { recursive: true });
let browser;
const results = [];
function fixture(name, anchor, replacement) {
  if (anchor) assert.equal(original.split(anchor).length - 1, 1, name + ': unique sabotage anchor');
  const content = anchor ? original.replace(anchor, replacement) : original;
  const local = resolve(scratch, name + '.html');
  writeFileSync(local, content.replaceAll('./ui-refs/', new URL('../ui-refs/', import.meta.url).href).replaceAll('../../../public/', new URL('../../../../public/', import.meta.url).href));
  return pathToFileURL(local).href;
}
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1060, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const baseline = fixture('baseline');
  async function settle() { await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))); }); }
  async function clearance(url) {
    await page.goto(url);
    await page.locator('#entry-quest').click();
    await settle();
    return page.evaluate(() => ({ bottom: document.querySelector('.right-hud').getBoundingClientRect().bottom, top: document.querySelector('#side-panel').getBoundingClientRect().top }));
  }
  const green = await clearance(baseline);
  assert.ok(green.bottom <= green.top, 'baseline 1060: sidebar does not cover entry keys');
  await page.screenshot({ path: resolve(shots, '01-1060-sidebar.png') });
  const red = await clearance(fixture('sabotage-clearance', '@media(max-width:1320px){:root{--side-top:310px}}', '@media(max-width:1320px){:root{--side-top:286px}}'));
  assert.throws(() => assert.ok(red.bottom <= red.top, '1060: sidebar does not cover entry keys'), /1060: sidebar/);
  results.push({ mutation: 'side-top 310 -> 286', baseline: green, sabotage: red, detected: true });
  const trackAnchor = "state.tracked=i%3;state.long=false;";
  async function tracked(url) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    await page.locator('#entry-quest').click();
    await page.locator('[data-track="1"]').click();
    return page.locator('#tracked-title').textContent();
  }
  assert.equal(await tracked(baseline), '温室的裂纹');
  const badTrack = await tracked(fixture('sabotage-tracking', trackAnchor, 'state.tracked=0;state.long=false;'));
  assert.throws(() => assert.equal(badTrack, '温室的裂纹'), /Expected values/);
  results.push({ mutation: 'tracking i%3 -> 0', observed: badTrack, detected: true });
  async function disabled(url) {
    await page.goto(url);
    await page.locator('#review-tools summary').click();
    await page.locator('#button-state').selectOption('disabled');
    await page.locator('#review-tools summary').click();
    await page.keyboard.press('KeyC');
    return page.locator('#side-panel').isHidden();
  }
  assert.equal(await disabled(baseline), true);
  const badDisabled = await disabled(fixture('sabotage-disabled', 'if(trigger.disabled)return;', 'if(false)return;'));
  assert.throws(() => assert.equal(badDisabled, true), /Expected values/);
  results.push({ mutation: 'remove disabled entry guard', sidebarHidden: badDisabled, detected: true });
  for (const width of [1060, 760]) {
    await page.setViewportSize({ width, height: width === 1060 ? 760 : 900 });
    await page.goto(baseline);
    await page.locator('#review-tools summary').click();
    await page.locator('#demo-mode').selectOption('long');
    await page.locator('#review-tools summary').click();
    await settle();
    assert.ok(await page.locator('#tracked-progress').evaluate(e => e.scrollHeight <= e.clientHeight + 1));
    await page.screenshot({ path: resolve(shots, '02-' + width + '-long-tracker.png') });
    await page.locator('#entry-quest').click();
    await settle();
    await page.screenshot({ path: resolve(shots, '03-' + width + '-long-sidebar.png') });
  }
  assert.deepEqual(errors, []);
  assert.equal(hash(readFileSync(source)), before, 'shared prototype unchanged');
  console.log(JSON.stringify({ verdict: 'PASS', sourceSha256: before, mutations: results, errors, scratchCleanedInFinally: true, browserClosedInFinally: true }, null, 2));
} finally {
  if (browser) await browser.close();
  assert.ok(resolve(scratch).startsWith(resolve(tmpdir()) + sep) && basename(scratch).startsWith('demon-ui-review-'));
  rmSync(scratch, { recursive: true, force: true });
}
