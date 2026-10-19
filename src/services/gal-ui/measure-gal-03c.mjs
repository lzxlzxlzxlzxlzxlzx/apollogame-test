// GAL-UI-03C evidence: same isolated 1440x900 browser for approved prototype and static LayoutNode.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const output = join(root, 'docs/design/galgame/review');
const temporary = await mkdtemp(join(tmpdir(), 'gal-03c-geometry-'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
const selectors = {
  prototype: {
    shell: '#gallery .panel-skin', heading: '#gallery .sys-heading', tabs: '#gallery .gallery-tabs',
    grid: '#gallery .memory-grid, #gallery .gallery-grid', cardFirst: '#gallery .memory-card:first-child, #gallery .gallery-card:first-child',
    cardLast: '#gallery .memory-card:last-child, #gallery .gallery-card:last-child',
    footer: '#gallery .sys-foot', footerActions: '#gallery .sys-foot-actions',
  },
  current: {
    shell: '#gal-gallery-shell', heading: '#gal-gallery-heading', tabs: '#gal-gallery-tabs',
    grid: '#gal-gallery-grid', cardFirst: '#gal-gallery-grid > :first-child',
    cardLast: '#gal-gallery-grid > :last-child', footer: '#gal-gallery-footer',
    footerActions: '#gal-gallery-nav',
  },
};
const structuralKeys = ['shell', 'heading', 'tabs', 'grid', 'cardFirst', 'cardLast', 'footer'];
const dimensions = ['x', 'y', 'width', 'height'];
async function boxes(page, mapping) {
  return page.evaluate(mapping => Object.fromEntries(Object.entries(mapping).map(([name, selector]) => {
    const candidates = [...document.querySelectorAll(selector)];
    const node = candidates.find(item => getComputedStyle(item).display !== 'none' && item.getBoundingClientRect().height > 0);
    const rect = node?.getBoundingClientRect();
    return [name, rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      right: rect.right, bottom: rect.bottom } : null];
  })), mapping);
}
try {
  browser = await chromium.launch({ executablePath: executable });
  const results = {};
  const prototype = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await prototype.goto(pathToFileURL(join(root, 'docs/design/galgame/gal-ui-complete-v2.dc.html')).href);
  await prototype.locator('#home [data-open="gallery"]').click();
  for (const tab of ['memories', 'cg']) {
    if (tab === 'cg') await prototype.locator('[data-gallery-tab="cg"]').click();
    const grid = tab === 'cg' ? '#gallery-grid' : '#memory-grid';
    await prototype.locator(`${grid} > :first-child`).waitFor();
    results[`prototype_${tab}`] = await boxes(prototype, {
      ...selectors.prototype, grid, cardFirst: `${grid} > :first-child`, cardLast: `${grid} > :last-child`,
    });
    await prototype.screenshot({ path: join(output, `gal-ui-03c-prototype-${tab}.png`) });
  }
  await prototype.close();
  for (const tab of ['memories', 'cg']) {
    const target = join(temporary, tab);
    const entry = tab === 'cg' ? 'gal-ui-gallery.audit.ts' : 'gal-ui-memories.audit.ts';
    await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
      build: { write: true, outDir: target, emptyOutDir: false,
        lib: { entry: join(root, 'src/services/gal-ui', entry), formats: ['iife'],
          name: 'GalGeometryAudit', fileName: () => 'audit.js' } } });
    await writeFile(join(target, 'index.html'),
      '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(target, 'index.html')).href);
    await page.locator('#gal-gallery-grid > :first-child').waitFor();
    results[`current_${tab}`] = await boxes(page, selectors.current);
    await page.screenshot({ path: join(output, `gal-ui-03c-current-${tab}.png`) });
    await page.close();
  }
  for (const tab of ['memories', 'cg']) {
    const prototypeBox = results[`prototype_${tab}`];
    const currentBox = results[`current_${tab}`];
    for (const key of structuralKeys) for (const axis of dimensions) {
      const delta = Math.abs(prototypeBox[key][axis] - currentBox[key][axis]);
      if (delta > 0.1) throw new Error(`${tab} ${key}.${axis} differs by ${delta}px`);
    }
    for (const axis of ['y', 'height', 'right']) {
      const delta = Math.abs(prototypeBox.footerActions[axis] - currentBox.footerActions[axis]);
      if (delta > 0.5) throw new Error(`${tab} footerActions.${axis} differs by ${delta}px`);
    }
  }
  const edgeTarget = join(temporary, 'edge');
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: edgeTarget, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-ui-gallery-edge.audit.ts'), formats: ['iife'],
        name: 'GalGeometryEdgeAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(edgeTarget, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  for (const edgeCase of ['empty', 'page2']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${pathToFileURL(join(edgeTarget, 'index.html')).href}?case=${edgeCase}`);
    await page.locator('#gal-gallery-footer').waitFor();
    results[`current_${edgeCase}`] = await boxes(page, selectors.current);
    const footer = results[`current_${edgeCase}`].footer;
    if (footer.y !== 782 || footer.width !== 1272 || footer.height !== 51)
      throw new Error(`${edgeCase} footer anchor drifted: ${JSON.stringify(footer)}`);
    if (edgeCase === 'page2' && !await page.locator('#gal-gallery-card-cg-7').count())
      throw new Error('Page 2 lost CG 7');
    if (edgeCase === 'empty' &&
        (await page.locator('#gal-gallery-card-cg-1').count() ||
         !await page.locator('#gal-gallery-empty').isVisible()))
      throw new Error('Empty catalog did not render its explicit empty state');
    await page.screenshot({ path: join(output, `gal-ui-03c-current-${edgeCase}.png`) });
    await page.close();
  }
  for (const state of ['memories-light', 'cg-light', 'cg-expanded-light']) {
    const target = join(temporary, state);
    await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
      build: { write: true, outDir: target, emptyOutDir: false,
        lib: { entry: join(root, `src/services/gal-ui/gal-ui-${state}.audit.ts`), formats: ['iife'],
          name: 'GalLightAudit', fileName: () => 'audit.js' } } });
    await writeFile(join(target, 'index.html'),
      '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(target, 'index.html')).href);
    await page.locator(state === 'cg-expanded-light' ? '#gal-cg-modal [role="dialog"]' : '#gal-gallery-grid').waitFor();
    await page.screenshot({ path: join(output, `gal-ui-03c-current-${state}.png`) });
    await page.close();
  }
  await writeFile(join(output, 'gal-ui-03c-geometry.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log('GAL-UI-03C geometry: prototype/current shell, heading, tabs, grid, first/last card, footer match <=0.1px in both tabs; footer actions y/height/right <=0.5px; empty/page-2 footer anchored — PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
