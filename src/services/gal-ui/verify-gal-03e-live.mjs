// Static, isolated browser geometry probe: no app server, Git, or persistent browser profile.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-03e-'));
const output = join(root, 'docs/design/galgame/review');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
const selectors = {
  dialogue: '#gal-story-dialogue', portrait: '#gal-story-portrait-placeholder',
  speaker: '#gal-story-speaker', line: '#gal-story-text',
  hint: '#gal-story-hint', cue: '#gal-story-advance',
  options: '#gal-story-options', note: '#gal-story-choice-note',
};
const prototypeSelectors = {
  dialogue: '#story .story-dialogue', portrait: '#story .portrait',
  speaker: '#story .speaker', line: '#story .line',
  hint: '#story .story-hint', cue: '#story .advance-cue',
  options: '#story #choices', note: '#story .choice-note',
};
const rect = box => box && [box.x, box.y, box.width, box.height].map(Math.round);
const boxes = async (page, mapping) => Object.fromEntries(await Promise.all(
  Object.entries(mapping).map(async ([key, selector]) => {
    const locator = page.locator(selector).first();
    return [key, await locator.count() ? rect(await locator.boundingBox()) : null];
  })));
let browser;
try {
  await build({ entryPoints: [join(root, 'src/services/gal-ui/gal-ui-story-03e.audit.ts')],
    bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
    tsconfig: join(root, 'tsconfig.json'), outfile: join(temporary, 'audit.js'),
    logLevel: 'error' });
  await writeFile(join(temporary, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17"><div id="root" style="width:1440px;height:900px"></div><script src="audit.js"></script>');
  browser = await chromium.launchPersistentContext(join(temporary, 'browser-profile'), { executablePath,
    headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const prototype = await browser.newPage();
  await prototype.goto(pathToFileURL(join(root, 'docs/design/galgame/gal-ui-complete-v2.dc.html')).href);
  await prototype.locator('#start').click();
  const protoLine = await boxes(prototype, prototypeSelectors);
  for (let i = 0; i < 3; i++) await prototype.locator('#dialogue').click();
  const protoChoice = await boxes(prototype, prototypeSelectors);
  const report = { prototype: { line: protoLine, choice: protoChoice }, actual: {} };
  for (const variant of ['normal', 'choice', 'rechoice', 'long']) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage();
      try {
        await page.goto(`${pathToFileURL(join(temporary, 'index.html')).href}#${variant}:${theme}`);
        await page.waitForFunction(() => document.documentElement.dataset.galReady === 'true');
        const key = `${variant}-${theme}`;
        report.actual[key] = await boxes(page, selectors);
        if (!process.argv.includes('--transient-shots'))
          await page.screenshot({ path: join(output, `gal-ui-03e-${key}.png`) });
      } finally { await page.close(); }
    }
  }
  console.log(JSON.stringify(report, null, 2));
  const target = [20, 555, 1400, 345];
  for (const [key, value] of Object.entries(report.actual)) {
    if (JSON.stringify(value.dialogue) !== JSON.stringify(target))
      throw new Error(`${key} dialogue ${JSON.stringify(value.dialogue)} != ${JSON.stringify(target)}`);
    if (!value.line || value.line[0] !== 126 || value.line[1] !== 698)
      throw new Error(`${key} line origin ${JSON.stringify(value.line)}`);
    if (!value.portrait || value.portrait[0] !== 675 || value.portrait[1] !== 38)
      throw new Error(`${key} portrait origin ${JSON.stringify(value.portrait)}`);
    if (JSON.stringify(value.portrait) !== JSON.stringify([675, 38, 563, 845]))
      throw new Error(`${key} portrait extent ${JSON.stringify(value.portrait)}`);
    if (!value.speaker || value.speaker[0] !== 122 || value.speaker[1] !== 625)
      throw new Error(`${key} speaker origin ${JSON.stringify(value.speaker)}`);
    if (!value.hint || value.hint[0] !== 60 || value.hint[1] !== 867)
      throw new Error(`${key} hint origin ${JSON.stringify(value.hint)}`);
    if (value.line[1] + value.line[3] >= value.hint[1])
      throw new Error(`${key} text collides with bottom hint`);
    if (key.startsWith('choice') || key.startsWith('rechoice')) {
      if (JSON.stringify(value.options) !== JSON.stringify([365, 296, 710, 147]) ||
        !value.note || value.note[0] !== 365 || value.note[1] !== 265 ||
        value.note[2] !== 710 || value.note[1] + value.note[3] >= value.options[1] ||
        value.options[1] + value.options[3] >= value.dialogue[1] || value.cue !== null)
        throw new Error(`${key} choices/note/cue ${JSON.stringify(value)}`);
    } else if (!value.cue || value.cue[0] !== 1312 || value.cue[1] !== 840) {
      throw new Error(`${key} cue origin ${JSON.stringify(value.cue)}`);
    }
  }
  console.log('GAL-UI-03E fallback 1440×900 geometry: PASS');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
