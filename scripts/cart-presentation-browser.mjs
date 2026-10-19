#!/usr/bin/env node
// Short-lived isolated Vite + headless browser acceptance for the opt-in cartridge UI host.
// Uses the real GCI S4 world data, but injects an in-memory presentation; never edits game files.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rt = detectBrowserRuntime();
if (!rt.ok) { console.error(`CART-PRESENTATION-BROWSER: NO_BROWSER ${rt.reason}`); process.exit(3); }
const { chromium } = await import('playwright');
const dev = await startDevServer(ROOT, { port: 5716 });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: rt.execPath });
  // The probe owns #app itself. Serving a document without launcher prevents React
  // from racing to reconcile children created by runBlueprintInto during teardown.
  const probeUrl = `http://localhost:${dev.port}/__cart_presentation_probe__`;
  const openProbePage = async (viewport) => {
    const page = await browser.newPage({ viewport });
    await page.route(probeUrl, (route) => route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>',
    }));
    await page.goto(probeUrl, { waitUntil: 'domcontentloaded' });
    if (await page.evaluate(() => !!window.__zcLauncherRoot)) throw new Error('probe document unexpectedly mounted React launcher');
    return page;
  };
  for (const size of [{ width: 1440, height: 900 }, { width: 1200, height: 800 }, { width: 720, height: 800 }, { width: 900, height: 900 }]) {
    const page = await openProbePage(size);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const setup = await page.evaluate(async () => {
      const { parseManifestDetailed } = await import('/src/assembly/manifest.ts');
      const { runBlueprintInto } = await import('/src/studio/cart-run-core.ts');
      const { QueuedInputSource } = await import('/src/net/host/queued-input.ts');
      const { fetchCartArtIndex, requireCartAssetIndex, assertCartMasksBound, loadCartArt } = await import('/src/assets/cart-art.ts');
      const originalEnqueue = QueuedInputSource.prototype.enqueueAction;
      window.__cartTestActions = [];
      QueuedInputSource.prototype.enqueueAction = function (name, value) {
        window.__cartTestActions.push(name);
        return originalEnqueue.call(this, name, value);
      };
      const res = await fetch('/library/game-clue-investigation/manifest.json');
      if (!res.ok) throw new Error(`GCI manifest HTTP ${res.status}`);
      const raw = await res.json();
      raw.presentation = {
        viewport: { width: 1440, height: 900 }, theme: 'apolloOnyx',
        flags: { 'flow.flavor': { kind: 'flow-is', id: 'investigation', value: 'flavor-result' } },
        focusTargets: [{ entity: 'object-cup', label: '调查茶杯', action: 'investigate.cup', when: 'interaction-enabled' }],
        shortcuts: [{ key: 'Escape', action: 'investigation.close', when: 'flow.flavor' }, { key: 'Escape', action: 'investigation.exit', when: 'interaction-enabled' }],
        ui: { type: 'Panel', id: 'cart-test-hud', props: {}, children: [
          { type: 'Button', id: 'cart-test-cup', props: { label: '调查茶杯', action: 'investigate.cup' } },
          { type: 'Label', id: 'cart-test-feedback', props: { text: '茶杯已查看' }, visibleWhen: 'viewed.cup' },
          { type: 'Label', id: 'cart-test-flavor', props: { text: '调查结果' }, visibleWhen: 'flow.flavor' },
        ] },
      };
      const index = requireCartAssetIndex(raw, 'game-clue-investigation', await fetchCartArtIndex('game-clue-investigation'));
      const parsed = parseManifestDetailed(raw, { assetIndex: index, assetKeys: new Set(index.assets.map((asset) => asset.id)) });
      assertCartMasksBound(parsed.blueprint);
      const art = await loadCartArt(index, parsed.blueprint.entities, parsed.presentation);
      const el = document.getElementById('app');
      el.style.cssText = 'position:relative;width:100vw;height:100vh;overflow:hidden';
      const cleanup = runBlueprintInto(el, parsed.blueprint, { w: 960, h: 600 }, parsed.presentation, art?.assets);
      window.__cartTestCleanup = () => { cleanup(); art?.dispose(); QueuedInputSource.prototype.enqueueAction = originalEnqueue; };
      const cupPoint = window.__zcProbe?.actions().find((action) => action.action === 'investigate.cup' && action.surface === 'canvas');
      return { canvas: !!el.querySelector('canvas'), initialFeedback: !!el.querySelector('#cart-test-feedback'), cupPoint };
    });
    if (!setup.canvas || setup.initialFeedback) throw new Error(`initial state wrong: ${JSON.stringify(setup)}`);
    const geometry = await page.evaluate(() => {
      const scene = document.querySelector('#app > div > div');
      const canvas = document.querySelector('#app canvas');
      const button = document.querySelector('#cart-test-cup');
      const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      return { scene: rect(scene), canvas: rect(canvas), button: rect(button) };
    });
    const expected = Math.min(size.width / 1440, size.height / 900);
    if (Math.abs(geometry.scene.w - 1440 * expected) > 2 || Math.abs(geometry.scene.h - 900 * expected) > 2
      || Math.abs(geometry.canvas.w - geometry.scene.w) > 2 || Math.abs(geometry.canvas.h - geometry.scene.h) > 2) {
      throw new Error(`viewport mismatch ${size.width}x${size.height}: ${JSON.stringify(geometry)}`);
    }
    if (geometry.button.x < geometry.scene.x || geometry.button.y < geometry.scene.y) throw new Error(`UI outside scene: ${JSON.stringify(geometry)}`);
    if (size.width === 1200) {
      if (!setup.cupPoint || setup.cupPoint.x < geometry.canvas.x || setup.cupPoint.y < geometry.canvas.y
        || setup.cupPoint.x >= geometry.canvas.x + geometry.canvas.w || setup.cupPoint.y >= geometry.canvas.y + geometry.canvas.h) {
        throw new Error(`Canvas cup point unavailable/outside viewport: ${JSON.stringify({ setup, geometry })}`);
      }
      await page.mouse.click(setup.cupPoint.x, setup.cupPoint.y);
    } else if (size.width !== 1440) {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const focusedId = await page.evaluate(() => document.activeElement?.id);
      if (focusedId !== 'cart-focus-object-cup') throw new Error(`Canvas focus target not Tab-reachable: ${focusedId}`);
      await page.keyboard.press(size.width === 720 ? 'Enter' : 'Space');
    } else await page.locator('#cart-test-cup').click();
    await page.locator('#cart-test-feedback').waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('#cart-test-flavor').waitFor({ state: 'visible', timeout: 3000 });
    if (size.width === 720 || size.width === 900) {
      const focusedOpacity = await page.locator('#cart-focus-object-cup').evaluate((el) => el.style.opacity);
      if (focusedOpacity !== '1' && focusedOpacity !== '0') throw new Error(`focus disclosure missing: ${focusedOpacity}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(180);
    const shortcut = await page.evaluate(() => ({ actions: window.__cartTestActions, active: document.activeElement?.id, dialogs: document.querySelectorAll('[data-modal-dialog]').length }));
    if (!shortcut.actions.includes('investigation.close')) throw new Error(`Escape did not enqueue close: ${JSON.stringify(shortcut)}`);
    const after = await page.evaluate(() => {
      window.__cartTestCleanup();
      return { canvas: !!document.querySelector('#app canvas'), action: !!document.querySelector('#cart-test-cup') };
    });
    if (after.canvas || after.action || errors.length) throw new Error(`cleanup/error ${size.width}x${size.height}: ${JSON.stringify({ after, errors })}`);
    const mode = size.width === 1440 ? 'UI pointer' : size.width === 1200 ? 'Canvas pointer' : `Tab/${size.width === 720 ? 'Enter' : 'Space'}`;
    console.log(`CART-PRESENTATION-BROWSER PASS ${size.width}x${size.height}: scale=${expected.toFixed(3)}, Canvas/UI aligned, ${mode}→world→HUD, Escape shortcut, cleanup`);
    await page.close();
  }
  // A modal without closeAction still owns its scrim: background Canvas clicks must not leak through.
  const modalPage = await openProbePage({ width: 1440, height: 900 });
  const modalHit = await modalPage.evaluate(async () => {
    const { parseManifestDetailed } = await import('/src/assembly/manifest.ts');
    const { runBlueprintInto } = await import('/src/studio/cart-run-core.ts');
    const raw = await (await fetch('/library/game-clue-investigation/manifest.json')).json();
    raw.presentation.ui = { type: 'Panel', id: 'modal-probe-root', props: {}, children: [
      { type: 'Modal', id: 'modal-probe', props: { title: '不可关闭' }, children: [
        { type: 'Label', id: 'modal-probe-label', props: { text: '背景必须阻断' } },
      ] },
    ] };
    const parsed = parseManifestDetailed(raw);
    const app = document.getElementById('app');
    app.style.cssText = 'position:relative;width:100vw;height:100vh;overflow:hidden';
    const cleanup = runBlueprintInto(app, parsed.blueprint, { w: 960, h: 600 }, parsed.presentation);
    const hit = document.elementFromPoint(20, 20);
    const result = { scrim: !!hit?.closest('[data-modal-scrim]'), tag: hit?.tagName, pointer: getComputedStyle(document.querySelector('[data-modal-scrim]')).pointerEvents };
    cleanup();
    return result;
  });
  await modalPage.close();
  if (!modalHit.scrim || modalHit.pointer !== 'auto') throw new Error(`Modal scrim let Canvas through: ${JSON.stringify(modalHit)}`);
  console.log('CART-PRESENTATION-BROWSER PASS modal scrim blocks background Canvas without closeAction');
  // Test the exact binary mask mapping in a browser without writing game data or requiring an external image.
  const maskPage = await openProbePage({ width: 1200, height: 800 });
  const maskSetup = await maskPage.evaluate(async () => {
    const { parseManifestDetailed } = await import('/src/assembly/manifest.ts');
    const { runBlueprintInto } = await import('/src/studio/cart-run-core.ts');
    const raw = await (await fetch('/library/game-clue-investigation/manifest.json')).json();
    raw.presentation = {
      viewport: { width: 1440, height: 900 }, theme: 'apolloOnyx',
      focusTargets: [{ entity: 'object-cup', label: '调查茶杯', action: 'investigate.cup', when: 'interaction-enabled' }],
      pointerFeedback: { tone: 'cyan', pressedMs: 145 },
      ui: { type: 'Panel', id: 'mask-probe-ui', props: {} },
    };
    const parsed = parseManifestDetailed(raw);
    const cup = parsed.blueprint.entities['object-cup'];
    cup.Sprite = { textureKey: 'probe.png', anchorX: 0.5, anchorY: 0.5, zOrder: 20, width: 90, height: 90, fit: 'contain' };
    cup.Clickable = { ...cup.Clickable, hitMaskKey: 'probe.mask', hitMask: {
      version: 1, width: 3, height: 3, threshold: 127, sourceTextureKey: 'probe.png', rows: ['010', '111', '010'],
    } };
    const app = document.getElementById('app');
    app.style.cssText = 'position:relative;width:100vw;height:100vh;overflow:hidden';
    window.__cartTestCleanup = runBlueprintInto(app, parsed.blueprint, { w: 960, h: 600 }, parsed.presentation);
    const rect = app.querySelector('canvas').getBoundingClientRect();
    return { cup: { x: cup.Transform.x, y: cup.Transform.y }, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
  });
  const maskPoint = (dx, dy) => ({ x: maskSetup.rect.x + (maskSetup.cup.x + dx) * maskSetup.rect.w / 1440, y: maskSetup.rect.y + (maskSetup.cup.y + dy) * maskSetup.rect.h / 900 });
  const transparent = maskPoint(-30, -30);
  const opaque = maskPoint(0, 0);
  const sampleMaskPixel = async (dx, dy) => maskPage.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#app canvas');
    return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
  }, { x: Math.round(maskSetup.cup.x + dx), y: Math.round(maskSetup.cup.y + dy) });
  const idleTransparentPixel = await sampleMaskPixel(-30, -30);
  const idleOpaquePixel = await sampleMaskPixel(0, 0);
  await maskPage.mouse.move(transparent.x, transparent.y);
  await maskPage.waitForTimeout(80);
  const transparentState = await maskPage.locator('#cart-focus-object-cup').getAttribute('data-pointer-feedback-state');
  if (transparentState) throw new Error(`transparent alpha pixel falsely disclosed hotspot: ${transparentState}`);
  const hoverTransparentPixel = await sampleMaskPixel(-30, -30);
  const pixelDelta = (a, b) => Math.max(...a.slice(0, 3).map((value, i) => Math.abs(value - b[i])));
  if (pixelDelta(hoverTransparentPixel, idleTransparentPixel) > 4) throw new Error(`transparent alpha pixel drew a false highlight: ${JSON.stringify({ idleTransparentPixel, hoverTransparentPixel })}`);
  await maskPage.mouse.move(opaque.x, opaque.y);
  await maskPage.locator('#cart-focus-object-cup[data-pointer-feedback-state="hover"]').waitFor({ state: 'attached', timeout: 3000 });
  const hoverOpaquePixel = await sampleMaskPixel(0, 0);
  if (pixelDelta(hoverOpaquePixel, idleOpaquePixel) < 20) throw new Error(`opaque alpha pixel did not draw a visible highlight: ${JSON.stringify({ idleOpaquePixel, hoverOpaquePixel })}`);
  await maskPage.mouse.down();
  await maskPage.locator('#cart-focus-object-cup[data-pointer-feedback-state="pressed"]').waitFor({ state: 'attached', timeout: 3000 });
  await maskPage.mouse.up();
  await maskPage.evaluate(() => window.__cartTestCleanup());
  await maskPage.close();
  console.log('CART-PRESENTATION-BROWSER PASS alpha-transparent hover rejected, opaque hover + press visible, cleanup');
  // Real consumer smoke: do not replace the game's authored LayoutNode data.
  const real = await openProbePage({ width: 1440, height: 900 });
  const realErrors = [];
  real.on('pageerror', (error) => realErrors.push(error.stack ?? error.message));
  const realSetup = await real.evaluate(async () => {
    const { parseManifestDetailed } = await import('/src/assembly/manifest.ts');
    const { runBlueprintInto } = await import('/src/studio/cart-run-core.ts');
    const { fetchCartArtIndex, requireCartAssetIndex, assertCartMasksBound, loadCartArt, resolveCartSkins } = await import('/src/assets/cart-art.ts');
    const raw = await (await fetch('/library/game-clue-investigation/manifest.json')).json();
    const index = requireCartAssetIndex(raw, 'game-clue-investigation', await fetchCartArtIndex('game-clue-investigation'));
    const parsed = parseManifestDetailed(raw, { assetIndex: index, assetKeys: new Set(index.assets.map((asset) => asset.id)) });
    assertCartMasksBound(parsed.blueprint);
    const presentation = resolveCartSkins(parsed.presentation, index);
    const art = await loadCartArt(index, parsed.blueprint.entities, parsed.presentation);
    const el = document.getElementById('app');
    el.style.cssText = 'position:relative;width:100vw;height:100vh;overflow:hidden';
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    window.__cartTestDrawn = [];
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image instanceof HTMLImageElement) window.__cartTestDrawn.push(image.currentSrc || image.src);
      return originalDrawImage.call(this, image, ...args);
    };
    const cleanup = runBlueprintInto(el, parsed.blueprint, { w: 960, h: 600 }, presentation, art?.assets);
    window.__cartTestCleanup = () => { cleanup(); CanvasRenderingContext2D.prototype.drawImage = originalDrawImage; art?.dispose(); };
    return { cupPoint: window.__zcProbe?.actions().find((a) => a.action === 'investigate.cup' && a.surface === 'canvas'), presentation: !!parsed.presentation,
      probeSupported: window.__zcProbe?.supported,
      probeCup: window.__zcProbe?.actions().some((a) => a.action === 'investigate.cup' && a.surface === 'canvas') };
  });
  if (!realSetup.presentation || !realSetup.probeSupported || !realSetup.probeCup) throw new Error(`real GCI dev probe did not expose Canvas action: ${JSON.stringify(realSetup)}`);
  await real.waitForFunction(() => window.__cartTestDrawn?.some((src) => src.includes('/games/game-clue-investigation/art/textures/cold-teacup-ai-v1.png')), undefined, { timeout: 3000 });
  await real.locator('#case-heading').waitFor({ state: 'visible' });
  const canvasRect = await real.locator('#app canvas').boundingBox();
  if (!realSetup.cupPoint || realSetup.cupPoint.x < canvasRect.x || realSetup.cupPoint.y < canvasRect.y
    || realSetup.cupPoint.x >= canvasRect.x + canvasRect.width || realSetup.cupPoint.y >= canvasRect.y + canvasRect.height) {
    throw new Error(`real GCI cup point outside Canvas: ${JSON.stringify({ realSetup, canvasRect })}`);
  }
  await real.mouse.click(realSetup.cupPoint.x, realSetup.cupPoint.y);
  await real.locator('#flavor-archive').waitFor({ state: 'visible', timeout: 3000 });
  await real.locator('#flavor-continue').click();
  await real.locator('#flavor-archive').waitFor({ state: 'detached', timeout: 3000 });
  await real.locator('#cart-focus-object-lock').focus();
  await real.keyboard.press('Enter');
  await real.locator('#clue-reveal-modal').waitFor({ state: 'visible', timeout: 3000 });
  await real.locator('#evidence-lock-image').waitFor({ state: 'visible', timeout: 3000 });
  const evidenceImage = await real.locator('#evidence-lock-image').evaluate(async (element) => {
    const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
    if (!image) return null;
    if (!image.complete) await new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); });
    return { src: image.getAttribute('src'), complete: image.complete, width: image.naturalWidth, height: image.naturalHeight };
  });
  if (!evidenceImage?.src?.startsWith('/games/game-clue-investigation/art/') || !evidenceImage.complete
    || evidenceImage.width < 1 || evidenceImage.height < 1) {
    throw new Error(`real GCI LayoutNode evidence image unresolved/unloaded: ${JSON.stringify(evidenceImage)}`);
  }
  await real.keyboard.press('Escape');
  await real.locator('#clue-reveal-modal').waitFor({ state: 'detached', timeout: 3000 });
  await real.locator('#case-utility').waitFor({ state: 'visible', timeout: 3000 });
  const focusAfterClose = await real.evaluate(() => ({ id: document.activeElement?.id ?? '', tag: document.activeElement?.tagName ?? '' }));
  await real.keyboard.press('Escape');
  await real.locator('#exit-confirm-modal').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {
    throw new Error(`second Escape after modal close did not open exit-confirm; focus=${JSON.stringify(focusAfterClose)}`);
  });
  await real.locator('#exit-stay').click();
  await real.locator('#exit-confirm-modal').waitFor({ state: 'detached', timeout: 3000 });
  const probeCleanup = await real.evaluate(async () => {
    window.__cartTestCleanup();
    const removed = !window.__zcProbe;
    const { parseManifestDetailed } = await import('/src/assembly/manifest.ts');
    const { runBlueprintInto } = await import('/src/studio/cart-run-core.ts');
    const raw = await (await fetch('/library/game-clue-investigation/manifest.json')).json();
    const parsed = parseManifestDetailed(raw);
    const unsupportedCleanup = runBlueprintInto(document.getElementById('app'), parsed.blueprint, { w: 960, h: 600 });
    const unsupported = window.__zcProbe?.supported === false && !!window.__zcProbe.reason && window.__zcProbe.actions().length === 0;
    unsupportedCleanup();
    return { removed, unsupported, removedAfterUnsupported: !window.__zcProbe };
  });
  if (!Object.values(probeCleanup).every(Boolean)) throw new Error(`dev probe lifecycle/unsupported diagnosis failed: ${JSON.stringify(probeCleanup)}`);
  if (realErrors.length) throw new Error(`real GCI page errors: ${realErrors.join(' | ')}`);
  await real.close();
  console.log('CART-PRESENTATION-BROWSER PASS real GCI manifest: Canvas cup→flavor→close; keyboard clue→Escape close→Escape exit-confirm');
} finally {
  await browser?.close();
  if (process.platform === 'win32') dev.proc.kill('SIGTERM');
  else stopDevServer(dev.proc);
}
