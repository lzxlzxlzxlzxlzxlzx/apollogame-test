import { build } from 'vite';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { engineAliases } from './engine-aliases.mjs';

const root = resolve('.');
const scratch = mkdtempSync(resolve(tmpdir(), 'demon-castle-ui-runtime-'));
const isolatedOutput = process.env.LIFE_HOST_PROBE_OUTPUT ? resolve(process.env.LIFE_HOST_PROBE_OUTPUT) : undefined;
const shots = isolatedOutput ?? resolve(root, 'docs/design/game-demon-castle/self-check/shots/DEMON-CASTLE-UI-RUNTIME-02');
mkdirSync(shots, { recursive: true });
let server, browser;
const checks = [];
const failures = [];
const check = (name, value) => { checks.push(name); if (!value) failures.push(name); };
try {
  await build({ configFile: false, resolve: { alias: engineAliases(root) }, logLevel: 'error',
    build: { outDir: scratch, emptyOutDir: false, copyPublicDir: false,
      lib: { entry: resolve(root, 'scripts/audits/demon-castle-ui-runtime-02.fixture.ts'), name: 'LifeRuntimeProbe', formats: ['iife'], fileName: () => 'probe.js' } } });
  server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}#root{position:relative;width:100vw;height:100vh}</style><div id="root"></div><script src="/probe.js"></script>'); return; }
    const base = path === '/probe.js' ? scratch : resolve(root, 'public');
    const target = resolve(base, path.slice(1));
    if (!target.startsWith(base + sep)) { res.statusCode = 403; res.end(); return; }
    try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(target)] ?? 'application/octet-stream'); res.end(readFileSync(target)); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log('Isolated static probe:', url, '(no ZeroCraft services, no persistence)');
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const keyboardDecisions = [];
  page.on('console', (message) => { if (message.text().startsWith('[Life keyboard]')) keyboardDecisions.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe);
  await page.waitForFunction(() => document.getElementById('life-host-world-status')?.getAttribute('style')?.includes('world-status-ribbon'));
  await page.evaluate(() => {
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'Tab') return;
      queueMicrotask(() => { window.lifeProbeLastTab = { target: event.target?.nodeName, focus: document.activeElement?.nodeName, id: document.activeElement?.id, prevented: event.defaultPrevented }; });
    });
  });
  const shot = async (name) => {
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))); });
    await page.screenshot({ path: resolve(shots, name + '.png') });
  };
  const metrics = async () => page.evaluate(() => {
    const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const groups = ['life-host-tracked-quest', 'life-host-world-status', 'life-host-resource-actions'].map(rect);
    const overlaps = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      if (Math.min(a.right, b.right) - Math.max(a.x, b.x) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 2) overlaps.push([i, j]);
    }
    return { width: innerWidth, height: innerHeight, groups, overlaps,
      status: ['life-host-status-ink'].map((id) => ({ id, background: getComputedStyle(document.getElementById(id)).backgroundColor,
        image: getComputedStyle(document.getElementById(id)).backgroundImage })),
      statusText: ['life-host-status-line'].map((id) => ({ id, ...rect(id), text: document.getElementById(id).textContent,
        fits: document.getElementById(id).scrollWidth <= document.getElementById(id).clientWidth + 1 })),
      images: [...document.querySelectorAll('#life-host-audit-root img')].map((i) => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 })),
      resourceText: [...document.querySelectorAll('[id^="life-host-resource-value-"]')].map((e) => e.textContent),
      mapTarget: document.elementFromPoint(80, innerHeight * .55)?.tagName,
    };
  });
  const report = { url, checks, failures, viewports: [] };
  for (const [width, height] of [[1440, 900], [1920, 1080], [1060, 760], [760, 900], [420, 900], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction((w) => Math.abs(document.getElementById('life-host-world-status').getBoundingClientRect().x + document.getElementById('life-host-world-status').getBoundingClientRect().width / 2 - w / 2) < 2, width);
    const m = await metrics();
    report.viewports.push(m); await shot('overview-' + width);
    check(width + ': centered ribbon >=56px', m.groups[1].height >= 56);
    check(width + ': ribbon content has no independent background', m.status.every((s) => s.background === 'rgba(0, 0, 0, 0)' && s.image === 'none'));
    check(width + ': status text stays inside ribbon', m.statusText.every((r) => r.fits && r.x >= m.groups[1].x && r.right <= m.groups[1].right && r.y >= m.groups[1].y && r.bottom <= m.groups[1].bottom));
    check(width + ': status is exact authored Chinese with real date', m.statusText[0].text === '月影庭院 · 月相季·第1天 · 黎明');
    check(width + ': status occupies one line', await page.locator('#life-host-status-line').evaluate((el) => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1));
    check(width + ': resources left of entries on one row', await page.evaluate(() => {
      const resources = document.getElementById('life-host-resources').getBoundingClientRect();
      const entries = document.getElementById('life-host-panel-entries').getBoundingClientRect();
      return resources.right <= entries.x + 1 && Math.abs(resources.y - entries.y) < 2;
    }));
    check(width + ': HUD no overlap', m.overlaps.length === 0);
    check(width + ': HUD in viewport', m.groups.every((r) => r.x >= 0 && r.right <= width + 1 && r.bottom <= height));
    check(width + ': HUD image loads', m.images.every((i) => i.loaded));
    check(width + ': exactly two authoritative resource values', JSON.stringify(m.resourceText) === JSON.stringify(['30', '20']));
    check(width + ': map pointer-through', m.mapTarget === 'CANVAS');
    const before = await page.evaluate(() => window.lifeRuntimeProbe.hash());
    for (const [kind, key] of [['quest', 'j'], ['inventory', 'i'], ['profile', 'c']]) {
      const entry = page.locator(`#life-host-${kind}-open`);
      await page.waitForFunction((id) => document.getElementById(id)?.hasAttribute('data-apollo-icon-loaded'), 'life-host-' + kind + '-open');
      check(width + ': ' + kind + ' native button', await entry.evaluate((el) => el.tagName === 'BUTTON' && el.getAttribute('type') === 'button' && !!el.getAttribute('aria-label')?.trim()));
      check(width + ': ' + kind + ' loaded entry icon', await entry.locator('img').evaluate((el) => el.complete && el.naturalWidth === 512));
      check(width + ': ' + kind + ' approved local icon, no emoji', await entry.locator('img').evaluate((el, name) => el.getAttribute('src') === '/games/game-demon-castle/art/ui/entry-' + name + '.png' && el.alt === '' && el.getAttribute('aria-hidden') === 'true', { quest: 'quest-scroll', inventory: 'backpack', profile: 'profile' }[kind]));
      check(width + ': ' + kind + ' hides only visible label after load', !await entry.locator('[data-apollo-icon-label]').isVisible());
      check(width + ': ' + kind + ' frameless approved image size', await entry.evaluate((el, size) => {
        const r = el.getBoundingClientRect();
        const css = getComputedStyle(el);
        return Math.abs(r.width - size) < 1 && Math.abs(r.height - size) < 1 && parseFloat(css.borderRadius) === 0 && parseFloat(css.borderTopWidth) === 0 && css.backgroundColor === 'rgba(0, 0, 0, 0)' && css.boxShadow === 'none';
      }, width <= 760 ? 50 : 60));
      // Use real Tab navigation (not focus()) before native keyboard activation.
      let reached = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        await page.keyboard.press('Tab');
        if (attempt === 0 && width === 1440 && kind === 'quest') {
          report.firstTab = await page.evaluate(() => ({ ...window.lifeProbeLastTab, settledFocus: document.activeElement?.id,
            insideHud: document.getElementById('life-host-top-hud').contains(document.activeElement) }));
          check('first Tab from body enters HUD without pointer or focus setup', report.firstTab.target === 'BODY' && !report.firstTab.prevented && report.firstTab.insideHud);
        }
        if (await entry.evaluate((el) => el === document.activeElement)) { reached = true; break; }
      }
      check(width + ': ' + kind + ' Tab reachable', reached);
      check(width + ': ' + kind + ' keyboard focus has a visible ring', await entry.evaluate((el) => {
        const css = getComputedStyle(el);
        return el.matches(':focus-visible') && css.outlineStyle === 'solid' && parseFloat(css.outlineWidth) >= 3;
      }));
      await page.keyboard.press('Enter');
      check(width + ': ' + kind + ' Enter opens exactly once', await page.locator('#life-host-' + kind + '-drawer').count() === 1);
      await page.keyboard.press('Escape');
      await entry.focus();
      await page.keyboard.press('Space');
      check(width + ': ' + kind + ' Space opens exactly once', await page.locator('#life-host-' + kind + '-drawer').count() === 1);
      await page.keyboard.press('Escape');
      await entry.hover();
      check(width + ': ' + kind + ' hover exposes full native name', await page.locator(`#life-host-${kind}-entry-tip [data-tooltip-bubble]`).evaluate((el, name) => getComputedStyle(el).display !== 'none' && el.textContent === name, await entry.getAttribute('aria-label')));
      await page.locator(`[data-action="life.host.${kind}.toggle"]`).click();
      check(width + ': ' + kind + ' pointer open', await page.locator('#life-host-' + kind + '-drawer').count() === 1);
      check(width + ': mutually exclusive sidebar', await page.locator('[id$="-drawer"]').count() === 1);
      await shot(kind + '-' + width);
      const bounds = await page.locator('#life-host-' + kind + '-frame').boundingBox();
      check(width + ': ' + kind + ' sidebar inside', bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      check(width + ': ' + kind + ' not covering keys', m.groups[2].bottom <= bounds.y);
      await page.keyboard.press('Escape');
      check(width + ': ' + kind + ' Escape close', await page.locator('#life-host-' + kind + '-drawer').count() === 0);
      await page.keyboard.press(key);
      await page.locator(`[data-action="life.host.${kind}.close"]`).click();
      check(width + ': ' + kind + ' key opens and button closes', await page.locator('#life-host-' + kind + '-drawer').count() === 0);
    }
    if (width === 1440) {
      await page.locator('[data-action="life.host.quest.toggle"]').click();
      await page.locator('[data-arg="quest:completed"]').click();
      check('real quest completed tab shows empty', await page.locator('#life-host-quest-empty-label').textContent() === '暂无已完成任务');
      await page.locator('[data-arg="quest:active"]').click();
      check('real quest tab returns to authoritative task', await page.locator('#life-host-quest-item-0').isVisible());
      await page.locator('[data-action="life.host.inventory.toggle"]').click();
      await page.locator('[data-arg="inventory:seed"]').click();
      await page.locator('[data-arg="inventory:all"]').click();
      const inspect = page.locator('[data-action="life.host.inventory.inspect"]');
      check('real inventory has inspectable items', await inspect.count() > 0);
      const selectedTitle = await inspect.last().textContent();
      await inspect.last().click();
      check('real inventory selection updates detail', await page.locator('#life-host-inventory-detail-title').textContent() === selectedTitle);
      await shot('inventory-selected');
      await page.locator('[data-action="life.host.profile.toggle"]').click();
      await page.locator('[data-arg="profile:relationships"]').click();
      check('real profile relationships tab', (await page.locator('#life-host-profile-body').textContent()).includes('工匠盟约'));
      await page.locator('[data-arg="profile:attributes"]').click();
      check('real profile all attributes tab', (await page.locator('#life-host-profile-body').textContent()).includes('魔王威仪'));
      await page.locator('[data-arg="profile:character"]').click();
      await page.locator('[data-action="life.host.profile.close"]').click();
    }
    check(width + ': UI does not change persistent hash', before === await page.evaluate(() => window.lifeRuntimeProbe.hash()));
  }
  // Real semantic calendar commands, not prototype demo values or a World hook.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-status-line')?.textContent.includes('第1天'));
  await page.keyboard.press('t');
  await page.waitForFunction(() => document.getElementById('life-host-status-line')?.textContent.includes('夜晚'));
  check('real advance-time uses authored Chinese night without changing the day', (await page.locator('#life-host-status-line').textContent()).includes('月相季·第1天 · 夜晚'));
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.getElementById('life-host-status-line')?.textContent.includes('第2天'));
  check('real advance-day reads current day rather than frozen demo day five', !(await page.locator('#life-host-status-line').textContent()).includes('第5天'));

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-status-line'));
  await page.locator('#life-host-profile-open').hover();
  check('375 tooltip is completely inside the scroll rail and viewport', await page.evaluate(() => {
    const rail = document.getElementById('life-host-resource-actions').getBoundingClientRect();
    const tip = document.querySelector('#life-host-profile-entry-tip [data-tooltip-bubble]');
    const r = tip.getBoundingClientRect();
    return getComputedStyle(tip).display !== 'none' && r.x >= rail.x && r.right <= rail.right && r.y >= rail.y && r.bottom <= rail.bottom;
  }));
  await shot('narrow-hover');
  await page.evaluate(() => window.lifeRuntimeProbe.fixture('resources-long', 'quest'));
  check('375 long numeric fixture actually overflows without wrapping', await page.locator('#life-host-resource-actions').evaluate((el) => el.scrollWidth > el.clientWidth));
  await page.locator('#life-host-resource-actions').hover();
  await page.mouse.wheel(1000, 0);
  await page.waitForFunction(() => document.getElementById('life-host-resource-actions').scrollLeft > 0);
  check('375 real horizontal wheel scrolls the same row', await page.locator('#life-host-resource-actions').evaluate((el) => el.scrollLeft > 0));
  await shot('narrow-scroll');
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-status-line'));
  await page.evaluate(() => window.lifeRuntimeProbe.fixture('long', 'quest'));
  check('375 long tracker leaves sidebar clear by at least 18px', await page.evaluate(() => {
    const tracker = document.getElementById('life-host-tracked-quest').getBoundingClientRect();
    const side = document.getElementById('life-host-quest-frame').getBoundingClientRect();
    return tracker.bottom + 18 <= side.y;
  }));
  await shot('narrow-long');

  // Fail a single approved texture in this isolated test, never change the index.
  await page.route('**/entry-backpack.png', (route) => route.abort());
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-world-status')?.getAttribute('style')?.includes('world-status-ribbon'));
  const fallback = page.locator('#life-host-inventory-open');
  check('missing entry texture retains visible native name', await fallback.evaluate((el) => el.tagName === 'BUTTON' && el.textContent.trim() === '魔王行囊' && !el.hasAttribute('data-apollo-icon-only')));
  check('missing entry texture retains independent key badge', await page.locator('#life-host-inventory-key').textContent() === 'I');
  const fallbackHash = await page.evaluate(() => window.lifeRuntimeProbe.hash());
  await fallback.click();
  check('missing entry texture still opens actual inventory', await page.locator('#life-host-inventory-drawer').count() === 1);
  await page.keyboard.press('Escape');
  check('missing entry fallback does not change World hash', fallbackHash === await page.evaluate(() => window.lifeRuntimeProbe.hash()));
  await shot('missing-entry-icon');
  await page.unroute('**/entry-backpack.png');
  // Reach a real farm menu by a real held movement key. The precondition is
  // deliberately gameplay, not a writable World test hook or synthetic Signal.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-world-status')?.getAttribute('style')?.includes('world-status-ribbon'));
  await page.keyboard.down('a');
  await page.waitForFunction(() => window.lifeRuntimeProbe.position().x <= 6);
  await page.keyboard.up('a');
  await page.waitForFunction(() => window.lifeRuntimeProbe.availableActions().includes('till'));
  await page.keyboard.press('e'); // single real affordance: till
  await page.waitForFunction(() => window.lifeRuntimeProbe.availableActions().includes('water'));
  await page.keyboard.press('e'); // single real affordance: water
  await page.waitForFunction(() => window.lifeRuntimeProbe.availableActions().includes('plant'));
  await page.keyboard.press('e');
  await page.waitForSelector('#life-host-world-menu');
  check('real farm world menu opens after movement', await page.locator('#life-host-world-menu').isVisible());
  const hudEntry = page.locator('#life-host-quest-open');
  await hudEntry.focus(); // World-menu arbitration setup, not evidence of first-Tab reachability.
  const menuBeforeTab = await page.locator('#life-host-world-menu').innerHTML();
  await page.keyboard.press('Tab');
  check('active world menu retains Tab instead of moving HUD focus', await hudEntry.evaluate((el) => document.activeElement === el));
  const menuBeforeEnter = await page.locator('#life-host-world-menu').innerHTML();
  await page.keyboard.press('Enter');
  // Host redraw is scheduled by the run loop; observe committed DOM feedback,
  // not an immediate pre-rAF snapshot (the screenshot exposed that race).
  const feedback = await page.waitForFunction(({ beforeTab, beforeEnter }) => {
    const menu = document.getElementById('life-host-world-menu');
    return !menu || beforeTab !== beforeEnter || menu.innerHTML !== beforeEnter;
  }, { beforeTab: menuBeforeTab, beforeEnter: menuBeforeEnter }, { timeout: 3000 }).then(() => true, () => false);
  check('active world menu consumes Enter instead of opening HUD', await page.locator('#life-host-quest-drawer').count() === 0);
  check('world-menu Tab or Enter gives visible world interaction feedback', feedback);
  await shot('world-menu-keyboard-priority');
  await page.keyboard.press('Escape');
  // Empty/long content are deliberate UI fixtures, not claimed as real gameplay.
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const mode of ['long', 'empty']) for (const kind of ['quest', 'inventory', 'profile']) {
    await page.goto(url);
    await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-world-status')?.getAttribute('style')?.includes('world-status-ribbon'));
    await page.evaluate(({ mode, kind }) => window.lifeRuntimeProbe.fixture(mode, kind), { mode, kind });
    const body = page.locator('#life-host-' + kind + '-body');
    if (mode === 'long') {
      await body.hover(); await page.mouse.wheel(0, 1400);
      await page.waitForFunction((kind) => document.getElementById('life-host-' + kind + '-body').scrollTop > 0, kind);
      check(kind + ': long fixture really scrolls', await body.evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0));
      check(kind + ': long tracked title not cropped', await page.locator('#life-host-tracked-quest-title').evaluate((el) => el.scrollHeight <= el.clientHeight + 1));
    } else {
      const emptyId = { quest: 'life-host-quest-empty-label', inventory: 'life-host-inventory-empty-label', profile: 'life-host-profile-empty-label' }[kind];
      check(kind + ': actual empty message is visible', await page.locator('#' + emptyId).isVisible());
    }
    await shot(mode + '-' + kind);
  }
  for (const width of [1440, 760]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await page.waitForFunction(() => !!window.lifeRuntimeProbe && document.getElementById('life-host-world-status')?.getAttribute('style')?.includes('world-status-ribbon'));
    await page.evaluate(() => window.lifeRuntimeProbe.fixture('status-long', 'quest'));
    const m = await metrics();
    check(width + ': long status stays single line within ribbon', m.statusText.every((r) => r.fits && r.x >= m.groups[1].x && r.right <= m.groups[1].right && r.y >= m.groups[1].y && r.bottom <= m.groups[1].bottom));
    check(width + ': long status remains transparent', m.status.every((s) => s.background === 'rgba(0, 0, 0, 0)' && s.image === 'none'));
    await shot('long-status-' + width);
  }
  check('no page errors', errors.length === 0);
  report.errors = errors;
  report.keyboardDecisions = keyboardDecisions;
  writeFileSync(isolatedOutput ? resolve(shots, 'measurements.json') : resolve(shots, '../../DEMON-CASTLE-UI-RUNTIME-02.measurements.json'), JSON.stringify(report, null, 2) + '\n');
  await page.evaluate(() => window.lifeRuntimeProbe.dispose());
  console.log('RUNTIME PROBE:', failures.length ? 'FAIL' : 'PASS', checks.length, 'checks', failures);
  assert.equal(failures.length, 0, 'runtime assertions failed; see measurements failures');
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  assert.ok(scratch.startsWith(resolve(tmpdir()) + sep) && scratch.includes('demon-castle-ui-runtime-'));
  rmSync(scratch, { recursive: true, force: true });
  console.log('Probe browser/server closed; task scratch removed.');
}

