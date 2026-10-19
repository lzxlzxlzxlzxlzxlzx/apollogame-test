// Local-only acceptance: this script WRITES an isolated real browser IndexedDB.
// AGENTS.md permits this local test; the profile is temporary and remote requests are blocked.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-preview-idb-owner-'));
const offset = relative(tmpdir(), temporary);
if (!offset || offset.startsWith('..') || isAbsolute(offset)) throw new Error('unsafe temporary path');
const profile = join(temporary, 'isolated-browser-profile');
const url = 'https://gal-preview.audit.invalid/index.html';
const expected = { status: 'ready', packageId: 'gal-preview-owner-audit', slot: 2,
  saveHash: '12345678', width: 8, height: 8, mimeType: 'image/png' };
let context;
try {
  await build({ entryPoints: [join(root, 'src/services/gal-save/gal-preview-idb-owner.audit.ts')],
    outfile: join(temporary, 'audit.js'), bundle: true, platform: 'browser', format: 'iife',
    logLevel: 'error' });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>GAL isolated IDB audit</title><script src="/audit.js"></script>');
  const pageSource = await readFile(join(temporary, 'index.html'));
  const scriptSource = await readFile(join(temporary, 'audit.js'));
  const open = async () => {
    context = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'block',
      ...(process.env.UI_AUDIT_CHROMIUM ? { executablePath: process.env.UI_AUDIT_CHROMIUM } : {}) });
    await context.route('**/*', async route => {
      const requested = new URL(route.request().url());
      if (requested.origin !== new URL(url).origin) { await route.abort(); return; }
      const path = requested.pathname;
      if (path === '/index.html') await route.fulfill({ status: 200, contentType: 'text/html', body: pageSource });
      else if (path === '/audit.js') await route.fulfill({ status: 200, contentType: 'text/javascript', body: scriptSource });
      else await route.abort();
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.__galOwnerIdbAudit), null, { timeout: 15000 });
    return page;
  };
  const first = await open();
  await first.evaluate(() => window.__galOwnerIdbAudit.write());
  const initial = await first.evaluate(() => window.__galOwnerIdbAudit.read());
  if (JSON.stringify(initial) !== JSON.stringify(expected)) throw new Error(`initial IDB read mismatch: ${JSON.stringify(initial)}`);
  await first.evaluate(() => window.__galOwnerIdbAudit.close());
  await context.close(); context = undefined;

  const second = await open();
  const reopened = await second.evaluate(() => window.__galOwnerIdbAudit.read());
  if (JSON.stringify(reopened) !== JSON.stringify(expected))
    throw new Error(`cross-session IDB read mismatch: ${JSON.stringify(reopened)}`);
  await second.evaluate(() => window.__galOwnerIdbAudit.corrupt());
  const damaged = await second.evaluate(() => window.__galOwnerIdbAudit.read());
  if (damaged.status !== 'damaged') throw new Error(`corrupt IDB fallback mismatch: ${JSON.stringify(damaged)}`);
  await second.evaluate(() => window.__galOwnerIdbAudit.delete());
  const missing = await second.evaluate(() => window.__galOwnerIdbAudit.read());
  if (missing.status !== 'missing') throw new Error(`IDB delete mismatch: ${JSON.stringify(missing)}`);
  await second.evaluate(() => window.__galOwnerIdbAudit.close());
  await context.close(); context = undefined;
  console.log('GAL OWNER IDB AUDIT: PASS', JSON.stringify({ initial, reopened, damaged, missing }));
} finally {
  try { await context?.close(); }
  finally {
    const current = relative(resolve(tmpdir()), resolve(temporary));
    if (!current || current.startsWith('..') || isAbsolute(current) ||
        !basename(temporary).startsWith('gal-preview-idb-owner-'))
      throw new Error(`refusing unsafe IDB profile cleanup: ${temporary}`);
    await rm(temporary, { recursive: true, force: true });
    if (existsSync(temporary)) throw new Error(`isolated IDB profile cleanup failed: ${temporary}`);
  }
}
