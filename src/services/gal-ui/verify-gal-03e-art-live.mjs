// Read-only S4/S5 separation probe: registered raw UI art over the corrected story geometry.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const index = JSON.parse(await readFile(join(root, 'public/games/gal-template/art/index.json'), 'utf8'));
const urls = ids => Object.fromEntries(index.assets.filter(asset => ids.includes(asset.id)).map(asset => {
  const local = join(root, 'public', asset.path.replace(/^\//, ''));
  if (!existsSync(local)) throw new Error(`Missing registered art: ${asset.id}`);
  return [asset.id, pathToFileURL(local).href];
}));
const artUrls = urls(['tex/gal-dialogue-panel', 'tex/gal-system-frame', 'tex/gal-button-default',
  'tex/gal-save-slot', 'tex/gal-slider-knob']);
const contentUrls = urls(['tex/gal-demo-backdrop', 'tex/gal-demo-portrait', 'tex/gal-demo-cg']);
const temporary = await mkdtemp(join(tmpdir(), 'gal-03e-art-'));
const output = join(root, 'docs/design/galgame/review');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  await build({ entryPoints: [join(root, 'src/services/gal-ui/gal-ui-art.audit.ts')],
    bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
    tsconfig: join(root, 'tsconfig.json'), outfile: join(temporary, 'audit.js'), logLevel: 'error' });
  await writeFile(join(temporary, 'index.html'),
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script>globalThis.__GAL_ART_URLS__=${JSON.stringify(artUrls)};globalThis.__GAL_CONTENT_URLS__=${JSON.stringify(contentUrls)}</script><script src="audit.js"></script>`);
  browser = await chromium.launchPersistentContext(join(temporary, 'browser-profile'), { executablePath,
    headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage();
    try {
      await page.goto(`${pathToFileURL(join(temporary, 'index.html')).href}#story:${theme}`);
      await page.waitForFunction(() => document.documentElement.dataset.galArtReady === 'true');
      const data = await page.evaluate(() => {
        const ids = ['gal-story-dialogue', 'gal-story-speaker', 'gal-story-text',
          'gal-story-portrait-placeholder', 'gal-story-portrait'];
        return Object.fromEntries(ids.map(id => {
          const element = document.getElementById(id);
          if (!element) return [id, null];
          const box = element.getBoundingClientRect();
          return [id, [box.x, box.y, box.width, box.height].map(Math.round)];
        }));
      });
      await page.screenshot({ path: join(output, `gal-ui-03e-art-${theme}.png`) });
      console.log(`${theme} ${JSON.stringify(data)}`);
      if (JSON.stringify(data['gal-story-dialogue']) !== JSON.stringify([20, 555, 1400, 345]))
        console.warn(`${theme} raw skin changed dialogue outer geometry: expected [20,555,1400,345]`);
    } finally { await page.close(); }
  }
  console.log('GAL-UI-03E art-overlay evidence captured; raw-skin geometry/occlusion is separate from fallback S4 verdict');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
