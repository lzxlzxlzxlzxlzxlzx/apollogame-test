// Independent S5/S7 visual read-only probe against Owner's already-running 5173.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { cartProbeFixture, detectBrowserRuntime } from '../../../../scripts/lib/render-harness.mjs';

const root = resolve('.');
const fixture = cartProbeFixture(root, 'game-clue-investigation');
if (process.argv.includes('--revoke-brass')) {
  const hits = [];
  const visit = (node) => {
    if (node?.id === 'case-heading-brass-rule') hits.push(node);
    for (const child of node?.children ?? []) visit(child);
  };
  visit(fixture.manifest.presentation.ui);
  if (hits.length !== 1 || hits[0].layout?.width !== 5) throw new Error(`S5_S7_REVOKE_ANCHOR hits=${hits.length} width=${hits[0]?.layout?.width}`);
  console.error(`S5_S7_REVOKE_ANCHOR hits=${hits.length}`);
  hits[0].layout.width = 0;
}
const output = resolve('docs/design/game-clue-investigation/review/shots/S5-S7-refresh-2026-10-14');
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(runtime.reason);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/generate/providers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('http://localhost:4000/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/api/library', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.entries) }));
  await page.route('**/api/library/game-clue-investigation/manifest', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.manifest) }));
  await page.goto('http://127.0.0.1:5173/?game=lib:game-clue-investigation&s3Probe=1', { waitUntil: 'load', timeout: 30000 });
  await page.locator('#case-heading').waitFor({ state: 'visible', timeout: 10000 });
  const styles = await page.evaluate(() => {
    const ids = ['case-heading', 'case-progress', 'clue-ledger', 'case-utility', 'case-heading-brass-rule', 'ledger-title'];
    const result = {};
    for (const id of ids) {
      const element = document.getElementById(id);
      if (!element) throw new Error(`missing ${id}`);
      const css = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      result[id] = {
        borderTopWidth: css.borderTopWidth, borderTopColor: css.borderTopColor,
        backgroundColor: css.backgroundColor, backgroundImage: css.backgroundImage,
        backdropFilter: css.backdropFilter, webkitBackdropFilter: css.webkitBackdropFilter,
        width: box.width, height: box.height, x: box.x, y: box.y,
      };
    }
    const bullets = [...document.querySelectorAll('[id^="ledger-"][id$="-bullet"]')]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => ({ id: element.id, text: element.textContent?.trim() ?? '', x: element.getBoundingClientRect().x }));
    return { panels: result, bullets };
  });
  for (const id of ['case-heading', 'case-progress', 'clue-ledger', 'case-utility']) {
    const panel = styles.panels[id];
    if (panel.borderTopWidth !== '1px' || panel.borderTopColor !== 'rgb(139, 118, 82)' || panel.backdropFilter !== 'none') {
      throw new Error(`S7_HUD_BORDER_GLASS ${id}: ${JSON.stringify(panel)}`);
    }
  }
  const rule = styles.panels['case-heading-brass-rule'];
  if (rule.width !== 5 || rule.height !== 124 || rule.backgroundColor !== 'rgb(216, 174, 98)') {
    throw new Error(`S7_BRASS_RULE: ${JSON.stringify(rule)}`);
  }
  const title = styles.panels['ledger-title'];
  if (title.backgroundColor !== 'rgba(0, 0, 0, 0)' || title.borderTopColor !== 'rgba(0, 0, 0, 0)' || styles.bullets.length !== 3 || styles.bullets.some((bullet) => bullet.text !== '•')) {
    throw new Error(`S7_LEDGER_STYLE: ${JSON.stringify({ title, bullets: styles.bullets })}`);
  }
  await page.screenshot({ path: resolve(output, 'idle.png'), animations: 'disabled' });
  await page.locator('#ledger-title').click();
  await page.locator('#clue-ledger').waitFor({ state: 'detached' });
  await page.screenshot({ path: resolve(output, 'ledger-collapsed.png'), animations: 'disabled' });
  await page.locator('#view-records').click();
  await page.locator('#clue-ledger').waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(output, 'ledger-reopened.png'), animations: 'disabled' });
  await page.locator('#cart-focus-object-lock').focus();
  await page.keyboard.press('Enter');
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(output, 'reveal.png'), animations: 'disabled' });
  await page.locator('#lock-collect').click();
  await page.locator('#clue-collected-modal').waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(output, 'collected.png'), animations: 'disabled' });
  await page.locator('#clue-collected-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#cart-focus-object-prints').focus();
  await page.keyboard.press('Enter');
  await page.locator('#clue-reveal-modal').waitFor({ state: 'visible' });
  await page.locator('#prints-collect').click();
  await page.locator('#investigation-completed-modal').waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(output, 'completed.png'), animations: 'disabled' });
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, url: page.url(), output, screenshots: 6, styles, consoleErrors: 0 }));
} finally {
  await browser.close();
}
