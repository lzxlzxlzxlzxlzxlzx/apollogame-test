// GAL-ENG-06J: isolated real IndexedDB + real LayoutNode UI, no app service or remote request.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { engineAliases } from '../../../scripts/engine-aliases.mjs';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-preview-idb-live-'));
const offset = relative(tmpdir(), temporary);
if (!offset || offset.startsWith('..') || isAbsolute(offset)) throw new Error('unsafe temporary path');
const profile = join(temporary, 'isolated-browser-profile');
const url = 'https://gal-preview-live.audit.invalid/index.html';
let context;
try {
  const index = JSON.parse(await readFile(join(root, 'public/games/gal-template/art/index.json'), 'utf8'));
  const source = async id => {
    const asset = index.assets.find(row => row.id === id && row.type === 'texture' && row.status === 'filled');
    if (!asset?.path?.startsWith('/games/gal-template/art/textures/demo/'))
      throw new Error(`missing registered GAL demo source ${id}`);
    const artRoot = resolve(root, 'public/games/gal-template/art/textures/demo');
    const target = resolve(root, 'public', asset.path.slice(1));
    const inside = relative(artRoot, target);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error(`unsafe GAL demo source ${id}`);
    const bytes = await readFile(target);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  };
  const contentUrls = { 'tex/gal-demo-backdrop': await source('tex/gal-demo-backdrop'),
    'tex/gal-demo-portrait': await source('tex/gal-demo-portrait') };
  await build({ entryPoints: [join(root, 'src/services/gal-ui/gal-save-preview-idb-live.audit.ts')],
    outfile: join(temporary, 'audit.js'), bundle: true, platform: 'browser', format: 'iife',
    alias: engineAliases(root), logLevel: 'error' });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17">' +
    '<div id="root" style="width:1440px;height:900px"></div><script>window.__galIdbAuditAssets=' +
    JSON.stringify(contentUrls) + '</script><script src="/audit.js"></script>');
  const pageSource = await readFile(join(temporary, 'index.html'));
  const scriptSource = await readFile(join(temporary, 'audit.js'));
  const open = async (noSidecarStorage = false) => {
    context = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'block',
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
      ...(process.env.UI_AUDIT_CHROMIUM ? { executablePath: process.env.UI_AUDIT_CHROMIUM } : {}) });
    await context.addInitScript(mode => { window.__galIdbAuditNoSidecarStorage = mode; }, noSidecarStorage);
    await context.route('**/*', async route => {
      const requested = new URL(route.request().url());
      if (requested.origin !== new URL(url).origin) { await route.abort(); return; }
      if (requested.pathname === '/index.html')
        await route.fulfill({ status: 200, contentType: 'text/html', body: pageSource });
      else if (requested.pathname === '/audit.js')
        await route.fulfill({ status: 200, contentType: 'text/javascript', body: scriptSource });
      else await route.abort();
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.__galIdbAudit || window.__galIdbAuditError),
      null, { timeout: 20000 });
    const startupError = await page.evaluate(() => window.__galIdbAuditError ?? null);
    if (startupError) throw new Error(startupError);
    return page;
  };
  const close = async page => {
    await page.evaluate(() => window.__galIdbAudit.close());
    await context.close();
    context = undefined;
  };
  const enterSlots = async page => {
    await page.locator('#starter-act-0').click();
    await page.waitForFunction(() => window.__galIdbAudit.page() === 'story');
    await page.locator('#gal-story-load').click();
    await page.waitForFunction(() => window.__galIdbAudit.page() === 'slots');
  };
  const loadSlot2 = async page => {
    await page.locator('#gal-slot-2').click();
    await page.locator('#gal-slots-commit').click();
    await page.waitForFunction(() => window.__galIdbAudit.confirm() === 'load');
    await page.locator('#gal-confirm-yes').click();
    await page.waitForFunction(() => window.__galIdbAudit.page() === 'story');
    const ref = await page.evaluate(() => window.__galIdbAudit.visibleRef());
    if (ref !== '["a","intro"]') throw new Error(`GAL IDB load did not restore story ref: ${ref}`);
  };
  const inspect = page => page.evaluate(async () => {
    const audit = window.__galIdbAudit;
    const slot = audit.slot2(), preview = await audit.preview();
    const img = document.getElementById('gal-slot-2-preview-image');
    return { slotPreview: slot?.preview, canLoad: slot?.canLoad,
      authorityHash: await audit.currentHash(),
      previewStatus: preview.status,
      previewHash: preview.status === 'ready' ? preview.record.saveHash : null,
      width: img?.naturalWidth ?? 0, height: img?.naturalHeight ?? 0 };
  });

  const first = await open();
  await first.locator('#starter-act-0').click();
  await first.waitForFunction(() => window.__galIdbAudit.page() === 'story');
  await first.locator('#gal-story-save').click();
  await first.waitForFunction(() => window.__galIdbAudit.page() === 'slots');
  await first.locator('#gal-slot-2').click();
  await first.locator('#gal-slots-commit').click();
  await first.waitForFunction(() => window.__galIdbAudit.confirm() === 'save-empty');
  await first.locator('#gal-confirm-yes').click();
  await first.waitForFunction(() => window.__galIdbAudit.feedback()?.includes('已保存至 NO. 2'));
  await first.waitForFunction(() => window.__galIdbAudit.slot2()?.preview === 'ready', null, { timeout: 20000 });
  const saved = await inspect(first);
  if (saved.slotPreview !== 'ready' || !saved.authorityHash ||
      saved.previewHash !== saved.authorityHash || saved.width !== 320 || saved.height !== 180)
    throw new Error(`GAL IDB initial preview mismatch: ${JSON.stringify(saved)}`);
  // Use a real settings Toggle so the Profile port is exercised, not merely constructed.
  await first.locator('#gal-slots-settings').click();
  await first.waitForFunction(() => window.__galIdbAudit.page() === 'settings');
  await first.locator('#gal-settings-tab-confirm').click();
  await first.locator('#gal-confirm-toggle-exitGame').click();
  await first.waitForFunction(() => window.__galIdbAudit.exitConfirmation() === false);
  const firstKeys = await first.evaluate(() => window.__galIdbAudit.keys());
  if (!firstKeys.some(key => key.startsWith('snap:')) ||
      !firstKeys.some(key => key.startsWith('env:') && key !== 'env:__index__' && key !== 'env:__migrated__') ||
      !firstKeys.some(key => key.startsWith('gal-preview:v1:')))
    throw new Error(`GAL IDB three-port keys missing: ${JSON.stringify(firstKeys)}`);
  await close(first);

  const second = await open();
  const reopenedConfirmation = await second.evaluate(() => window.__galIdbAudit.exitConfirmation());
  if (reopenedConfirmation !== false)
    throw new Error(`GAL IDB Profile did not persist: ${reopenedConfirmation}`);
  await enterSlots(second);
  await second.waitForFunction(() => window.__galIdbAudit.slot2()?.preview === 'ready', null,
    { timeout: 20000 });
  const reopened = await inspect(second);
  if (reopened.slotPreview !== 'ready' || reopened.authorityHash !== saved.authorityHash ||
      reopened.previewHash !== saved.previewHash || reopened.width !== 320 || reopened.height !== 180)
    throw new Error(`GAL IDB cross-session preview mismatch: ${JSON.stringify(reopened)}`);
  await second.evaluate(() => window.__galIdbAudit.corruptImage());
  await loadSlot2(second);
  await close(second);

  const damagedPage = await open();
  await enterSlots(damagedPage);
  await damagedPage.waitForFunction(() => window.__galIdbAudit.slot2()?.preview === 'damaged', null,
    { timeout: 20000 });
  const damaged = await inspect(damagedPage);
  if (damaged.previewStatus !== 'damaged' || !damaged.canLoad ||
      damaged.authorityHash !== saved.authorityHash || damaged.width !== 0)
    throw new Error(`GAL IDB damaged image fallback mismatch: ${JSON.stringify(damaged)}`);
  await loadSlot2(damagedPage);
  await damagedPage.locator('#gal-story-auto').click();
  await damagedPage.waitForFunction(() => window.__galIdbAudit.visibleRef() === '["a","done"]',
    null, { timeout: 20000 });
  await close(damagedPage);

  const unavailablePage = await open(true);
  await enterSlots(unavailablePage);
  await unavailablePage.waitForFunction(() => window.__galIdbAudit.slot2()?.preview === 'unavailable', null,
    { timeout: 20000 });
  const unavailable = await inspect(unavailablePage);
  if (unavailable.previewStatus !== 'unavailable' || !unavailable.canLoad ||
      unavailable.authorityHash !== saved.authorityHash || unavailable.width !== 0)
    throw new Error(`GAL IDB no-sidecar fallback mismatch: ${JSON.stringify(unavailable)}`);
  await loadSlot2(unavailablePage);
  await close(unavailablePage);
  console.log('GAL LIVE IDB PREVIEW: PASS', JSON.stringify({
    saved, profileExitConfirmation: reopenedConfirmation, keys: firstKeys, reopened, damaged, unavailable,
  }));
} finally {
  try { await context?.close(); }
  finally {
    const current = relative(resolve(tmpdir()), resolve(temporary));
    if (!current || current.startsWith('..') || isAbsolute(current) ||
        !basename(temporary).startsWith('gal-preview-idb-live-'))
      throw new Error(`refusing unsafe GAL IDB audit cleanup: ${temporary}`);
    await rm(temporary, { recursive: true, force: true });
    if (existsSync(temporary)) throw new Error(`GAL IDB audit cleanup failed: ${temporary}`);
  }
}
