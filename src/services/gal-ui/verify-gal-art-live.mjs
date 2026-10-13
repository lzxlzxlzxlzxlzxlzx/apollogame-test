// Short-lived static-file audit. No app server, database or Git access.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const indexPath = join(root, 'public/games/gal-template/art/index.json');
if (!existsSync(indexPath)) throw new Error('GAL asset index has not been registered yet');
const index = JSON.parse(await readFile(indexPath, 'utf8'));
const urls = Object.fromEntries(index.assets.filter(asset =>
  ['tex/gal-dialogue-panel', 'tex/gal-system-frame', 'tex/gal-button-default',
    'tex/gal-save-slot', 'tex/gal-slider-knob'].includes(asset.id)).map(asset => {
  const localPath = join(root, 'public', asset.path.replace(/^\//, ''));
  if (!existsSync(localPath)) throw new Error(`Registered asset missing: ${asset.id}`);
  return [asset.id, pathToFileURL(localPath).href];
}));
if (Object.keys(urls).length !== 5) throw new Error(`Expected five UI assets, got ${Object.keys(urls).length}`);
const contentUrls = Object.fromEntries(index.assets.filter(asset =>
  ['tex/gal-demo-backdrop', 'tex/gal-demo-portrait', 'tex/gal-demo-cg'].includes(asset.id))
  .map(asset => {
    const localPath = join(root, 'public', asset.path.replace(/^\//, ''));
    if (!existsSync(localPath)) throw new Error(`Registered demo asset missing: ${asset.id}`);
    return [asset.id, pathToFileURL(localPath).href];
  }));
if (Object.keys(contentUrls).length !== 3) throw new Error(`Expected three demo assets, got ${Object.keys(contentUrls).length}`);

const temporary = await mkdtemp(join(tmpdir(), 'gal-art-'));
const output = join(root, 'docs/design/galgame/review');
let browser;
try {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-art.audit.ts'), formats: ['iife'],
        name: 'GalArtAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script>globalThis.__GAL_ART_URLS__=${JSON.stringify(urls)};globalThis.__GAL_CONTENT_URLS__=${JSON.stringify(contentUrls)}</script><script src="audit.js"></script>`);
  const candidates = [process.env.UI_AUDIT_CHROMIUM, chromium.executablePath?.(),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
  const executablePath = candidates.find(path => existsSync(path));
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  for (const pageName of ['home', 'story-normal', 'story-choice', 'slots', 'slots-load', 'slots-fail',
    'settings-text', 'settings-audio', 'settings-display', 'settings-confirm',
    'gallery-memories', 'gallery-cg',
    'confirm-new-game', 'confirm-save-empty', 'confirm-overwrite', 'confirm-load', 'confirm-return-title']) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${pathToFileURL(join(temporary, 'index.html')).href}#${pageName}:${theme}`);
        await page.waitForFunction(() => document.documentElement.dataset.galArtReady === 'true');
        const count = await page.locator('html').getAttribute('data-gal-art-count');
        if (count !== (pageName === 'slots-fail' ? '4' : '5'))
          throw new Error(`${pageName}/${theme}: unexpected ${count} assets loaded`);
        const broken = await page.evaluate(() => Array.from(document.images).filter(image => !image.complete || image.naturalWidth === 0).map(image => image.id));
        if (broken.length) throw new Error(`${pageName}/${theme}: broken images ${broken.join(',')}`);
        if (pageName === 'slots-fail' && await page.locator('#gal-slot-2').getAttribute('data-apollo-skin'))
          throw new Error('Missing slot image did not fall back');
        if (pageName === 'slots' || pageName === 'slots-load') {
          const covered = await page.evaluate(() => ['number', 'meta', 'state'].filter(part => {
            const element = document.getElementById(`gal-slot-2-${part}`);
            if (!element) return true;
            const rect = element.getBoundingClientRect();
            return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
              ?.id === 'gal-slot-2-skin';
          }));
          if (covered.length) throw new Error(`${pageName}/${theme}: slot foreground covered by image: ${covered.join(',')}`);
        }
        if (pageName === 'story-normal' || pageName === 'story-choice') {
          const tools = [
            ['history', 'gal.history.open'], ['auto', 'gal.playback.auto'],
            ['skip', 'gal.playback.skip'], ['save', 'gal.story.save'],
            ['load', 'gal.story.load'], ['settings', 'gal.settings.open'],
            ['home', 'gal.story.home'],
          ];
          for (const [name, action] of tools) {
            const id = `gal-story-${name}`;
            const button = page.locator(`#${id}`);
            const appearance = await button.evaluate(element => {
              const rect = element.getBoundingClientRect();
              return { color: getComputedStyle(element).color, skinned: element.hasAttribute('data-apollo-skin'),
                hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id,
                disabled: element.disabled };
            });
            if (appearance.color !== 'rgb(232, 232, 244)' || appearance.skinned || appearance.hit !== id || appearance.disabled)
              throw new Error(`${pageName}/${theme}: ${id} is not a readable, unskinned, hittable V2 ghost: ${JSON.stringify(appearance)}`);
            await button.click();
            const emitted = await page.evaluate(() => globalThis.__GAL_ART_ACTIONS__?.at(-1));
            if (emitted !== action) throw new Error(`${pageName}/${theme}: ${id} emitted ${emitted}, expected ${action}`);
          }
        }
        if (pageName === 'gallery-cg' && await page.locator('#gal-gallery-image-cg-3').count())
          throw new Error('Locked CG rendered an image');
        const result = await page.evaluate(() => {
          const ids = ['gal-story-dialogue', 'gal-slots-shell', 'gal-settings-shell', 'gal-gallery-shell',
            'gal-slot-2', 'gal-confirm'];
          return Object.fromEntries(ids.map(id => { const element = document.getElementById(id); if (!element) return [id, null];
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return [id, { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
              slice: style.borderImageSlice, edge: style.borderTopWidth }]; }));
        });
        await page.screenshot({ path: join(output, `gal-art-01a-${pageName}-${theme}.png`) });
        process.stdout.write(`${pageName}/${theme} ${JSON.stringify(result)}\n`);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
