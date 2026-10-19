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
const output = process.env.GAL_ART_AUDIT_OUTPUT
  ? resolve(process.env.GAL_ART_AUDIT_OUTPUT) : join(root, 'docs/design/galgame/review');
let browser;
async function auditButtonStates(page, pageName, theme, output, suffix) {
  const buttons = await page.locator('button[id]').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { id: element.id, disabled: element.disabled, exposed: hit?.closest('button') === element };
  }));
  const results = [];
  for (const { id, disabled, exposed } of buttons) {
    if (!exposed) { results.push({ id, occluded: true }); continue; }
    const button = page.locator(`[id="${id.replaceAll('"', '\\"')}"]`);
    const state = async () => button.evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor,
        color: style.color, filter: style.filter, transform: style.transform,
        shadow: style.boxShadow, opacity: style.opacity };
    });
    const base = await state();
    if (disabled) {
      results.push({ id, disabled: true, base });
      continue;
    }
    await button.hover();
    await page.waitForTimeout(180);
    const hover = await state();
    const rect = await button.boundingBox();
    if (!rect) throw new Error(`${pageName}/${theme}: ${id} has no button box`);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(180);
    const pressed = await state();
    await page.mouse.up();
    results.push({ id, disabled: false, hoverChanged: JSON.stringify(hover) !== JSON.stringify(base),
      pressedChanged: JSON.stringify(pressed) !== JSON.stringify(hover), base, hover, pressed });
    if (results.filter(result => !result.disabled).length === 1 &&
      ['home', 'story-choice', 'slots', 'settings-text', 'gallery-memories', 'confirm-new-game'].includes(pageName)) {
      await button.hover();
      await page.waitForTimeout(180);
      await page.screenshot({ path: join(output, `gal-art-01a-${pageName}-${theme}-hover-${suffix}.png`) });
      await page.mouse.down();
      await page.waitForTimeout(180);
      await page.screenshot({ path: join(output, `gal-art-01a-${pageName}-${theme}-pressed-${suffix}.png`) });
      await page.mouse.up();
    }
  }
  return results;
}
async function captureMotionFrames(page, pageName, theme, output, suffix) {
  if (pageName !== 'story-normal' && pageName !== 'story-choice') return;
  const samples = pageName === 'story-normal' ? [0, 120, 240, 650, 1300] : [0, 120, 250, 340];
  for (const time of samples) {
    const frame = await page.evaluate(ms => {
      const ids = ['gal-story-text', 'gal-story-advance'];
      const elements = [...ids.map(id => document.getElementById(id)),
        ...Array.from(document.querySelectorAll('[id^="gal-choice#"]'))].filter(Boolean);
      return elements.map(element => {
        const animation = element.getAnimations()[0];
        if (!animation) return { id: element.id, animation: false };
        animation.pause();
        animation.currentTime = ms;
        const style = getComputedStyle(element);
        return { id: element.id, opacity: style.opacity, transform: style.transform,
          currentTime: animation.currentTime };
      });
    }, time);
    await page.screenshot({ path: join(output, `gal-art-01a-${pageName}-${theme}-frame-${String(time).padStart(4, '0')}-${suffix}.png`) });
    process.stdout.write(`${pageName}/${theme} frame ${time} ${JSON.stringify(frame)}\n`);
  }
}
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
  const pages = ['home', 'story-normal', 'story-choice', 'story-cg', 'story-cg-missing', 'slots', 'slots-load', 'slots-fail',
    'settings-text', 'settings-audio', 'settings-display', 'settings-confirm',
    'gallery-memories', 'gallery-memories-art', 'gallery-cg',
    'confirm-new-game', 'confirm-save-empty', 'confirm-overwrite', 'confirm-load', 'confirm-return-title'];
  const selected = process.env.GAL_ART_AUDIT_PAGES?.split(',').filter(Boolean) ?? pages;
  for (const pageName of selected) {
    if (!pages.includes(pageName)) throw new Error(`Unknown GAL art audit page: ${pageName}`);
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
        if (pageName === 'home') {
          const homeCopy = await page.evaluate(() => ({
            eyebrow: document.getElementById('gal-home-eyebrow')?.textContent,
            subtitle: document.getElementById('gal-home-subtitle')?.textContent,
            demoNotice: document.getElementById('gal-home-placeholder')?.textContent,
          }));
          if (homeCopy.eyebrow !== 'A STORY UNDER THE MOON' ||
              homeCopy.subtitle !== '在月色落下以前，翻开未完成的故事。' ||
              homeCopy.demoNotice !== '界面验证用演示场景；正式素材待审核')
            throw new Error(`${pageName}/${theme}: approved V2 home copy drifted: ${JSON.stringify(homeCopy)}`);
        }
        if (process.env.GAL_ART_AUDIT_FRAMES === '1')
          await captureMotionFrames(page, pageName, theme, output,
            process.env.GAL_ART_AUDIT_SUFFIX?.match(/^[a-z0-9-]{1,32}$/)?.[0] ?? 'frames');
        if (pageName === 'slots-fail' && await page.locator('#gal-slot-2').getAttribute('data-apollo-skin'))
          throw new Error('Missing slot image did not fall back');
        if (pageName === 'slots-fail' && await page.locator('#gal-slots-header #gal-slots-header-actions').count() !== 1)
          throw new Error('Missing slot image moved fallback navigation');
        if (pageName === 'slots' || pageName === 'slots-load') {
          const chrome = await page.evaluate(() => {
            const brand = document.getElementById('gal-slots-system-title');
            const back = document.getElementById('gal-slots-return');
            const commit = document.getElementById('gal-slots-commit');
            const box = element => { const rect = element?.getBoundingClientRect();
              return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
            return { brand: brand?.textContent,
              back: back?.textContent, brandY: brand?.getBoundingClientRect().y,
              commitBox: box(commit), backBox: box(back) };
          });
          if (!chrome.brand?.startsWith('✧ ') ||
              chrome.back !== '返回' || chrome.brandY !== 14 ||
              !chrome.commitBox || !chrome.backBox ||
              chrome.commitBox.x >= chrome.backBox.x || chrome.backBox.x + chrome.backBox.width > 1365)
            throw new Error(`${pageName}/${theme}: V2 slot chrome drifted: ${JSON.stringify(chrome)}`);
          process.stdout.write(`${pageName}/${theme} chrome ${JSON.stringify(chrome)}\n`);
          const emptyMeta = await page.locator('#gal-slot-1-meta').textContent();
          if (emptyMeta !== '空存档位')
            throw new Error(`${pageName}/${theme}: V2 empty slot footer drifted: ${emptyMeta}`);
          const navigation = await page.evaluate(() => {
            const frame = document.getElementById('gal-slots-shell')?.getBoundingClientRect();
            const button = document.getElementById('gal-slots-settings')?.getBoundingClientRect();
            return frame && button ? { frameTop: frame.top, buttonTop: button.top,
              buttonBottom: button.bottom } : null;
          });
          if (!navigation || navigation.buttonBottom > navigation.frameTop)
            throw new Error(`${pageName}/${theme}: V2 navigation is not above the frame: ${JSON.stringify(navigation)}`);
          for (const [id, action] of [['gal-slots-home', 'gal.slot.nav'],
            ['gal-slots-story', 'gal.slot.nav'], ['gal-slots-gallery', 'gal.slot.nav'],
            ['gal-slots-settings', 'gal.settings.open']]) {
            await page.locator(`#${id}`).click();
            const emitted = await page.evaluate(() => globalThis.__GAL_ART_ACTIONS__?.at(-1));
            if (emitted !== action) throw new Error(`${pageName}/${theme}: ${id} emitted ${emitted}`);
          }
          await page.locator('#gal-slots-return').click();
          if (await page.evaluate(() => globalThis.__GAL_ART_ACTIONS__?.at(-1)) !== 'gal.slot.back')
            throw new Error(`${pageName}/${theme}: footer return did not emit gal.slot.back`);
          const previewFill = await page.locator('#gal-slot-1-preview').evaluate(element =>
            getComputedStyle(element).backgroundColor);
          if (previewFill !== 'rgb(23, 33, 64)')
            throw new Error(`${pageName}/${theme}: V2 slot preview fill drifted: ${previewFill}`);
          const covered = await page.evaluate(() => ['number', 'meta', 'state'].filter(part => {
            const element = document.getElementById(`gal-slot-2-${part}`);
            if (!element) return true;
            const rect = element.getBoundingClientRect();
            return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
              ?.id === 'gal-slot-2-skin';
          }));
          if (covered.length) throw new Error(`${pageName}/${theme}: slot foreground covered by image: ${covered.join(',')}`);
        }
        if (pageName.startsWith('settings-')) {
          const preview = await page.locator('#gal-settings-preview-line').textContent();
          if (preview !== '预览 · 澪 「打开哪一封信？月光还停在窗沿。」')
            throw new Error(`${pageName}/${theme}: settings preview is not current package data: ${preview}`);
        }
        if (pageName === 'story-normal' || pageName === 'story-choice') {
          const textMotion = await page.locator('#gal-story-text').evaluate(element => {
            const style = getComputedStyle(element);
            return { name: style.animationName, duration: style.animationDuration };
          });
          if (textMotion.name !== 'apollo-flyIn' || textMotion.duration !== '0.24s')
            throw new Error(`${pageName}/${theme}: V2 line timing drifted: ${JSON.stringify(textMotion)}`);
          if (pageName === 'story-normal') {
            const cue = await page.locator('#gal-story-advance').evaluate(element => {
              const style = getComputedStyle(element);
              return { name: style.animationName, duration: style.animationDuration };
            });
            if (cue.name !== 'apollo-cue' || cue.duration !== '1.3s')
              throw new Error(`${pageName}/${theme}: V2 cue timing drifted: ${JSON.stringify(cue)}`);
            const middle = await page.locator('#gal-story-advance').evaluate(element => {
              const animation = element.getAnimations()[0];
              if (!animation) return null;
              animation.pause();
              animation.currentTime = 650;
              const style = getComputedStyle(element);
              return { opacity: style.opacity, transform: style.transform };
            });
            if (!middle || middle.opacity !== '0.35' ||
              !middle.transform.endsWith(', 4)'))
              throw new Error(`${pageName}/${theme}: V2 cue midpoint drifted: ${JSON.stringify(middle)}`);
          }
          if (pageName === 'story-choice') {
            const choiceMotion = await page.locator('[id^="gal-choice#"]').evaluateAll(elements =>
              elements.map(element => {
                const style = getComputedStyle(element);
                return { name: style.animationName, duration: style.animationDuration,
                  delay: style.animationDelay };
              }));
            if (choiceMotion.length !== 2 || choiceMotion.some((motion, index) =>
              motion.name !== 'apollo-flyIn' || motion.duration !== '0.25s' ||
              motion.delay !== (index === 0 ? '0s' : '0.09s')))
              throw new Error(`${pageName}/${theme}: V2 choice timing drifted: ${JSON.stringify(choiceMotion)}`);
            const choice = page.locator('[id^="gal-choice#"]').first();
            if (await choice.getAttribute('data-apollo-skin-feedback') === null)
              throw new Error(`${pageName}/${theme}: V2 choice skin feedback missing`);
            await choice.hover();
            await page.waitForTimeout(180);
            const feedback = await choice.evaluate(element => {
              const style = getComputedStyle(element);
              return { filter: style.filter, transition: style.transitionDuration };
            });
            if (!feedback.filter.includes('brightness(1.32)') ||
              !feedback.filter.includes('drop-shadow(') || !feedback.filter.includes('0px 0px 8px)') ||
              !feedback.transition.split(',').every(value => value.trim() === '0.16s'))
              throw new Error(`${pageName}/${theme}: V2 choice hover feedback drifted: ${JSON.stringify(feedback)}`);
          }
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
              const style = getComputedStyle(element);
              return { color: style.color, background: style.backgroundColor, border: style.borderTopColor,
                stateColors: element.hasAttribute('data-apollo-state-colors'),
                skinned: element.hasAttribute('data-apollo-skin'),
                hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id,
                disabled: element.disabled };
            });
            if (appearance.color !== 'rgb(232, 232, 244)' || appearance.background !== 'rgba(16, 26, 54, 0.81)' ||
              appearance.border !== 'rgba(228, 214, 170, 0.533)' || !appearance.stateColors ||
              appearance.skinned || appearance.hit !== id || appearance.disabled)
              throw new Error(`${pageName}/${theme}: ${id} is not a readable, unskinned, hittable V2 ghost: ${JSON.stringify(appearance)}`);
            await button.hover();
            await page.waitForTimeout(180);
            const hovered = await button.evaluate(element => ({ background: getComputedStyle(element).backgroundColor,
              color: getComputedStyle(element).color }));
            if (hovered.background !== 'rgb(83, 92, 145)' || hovered.color !== 'rgb(255, 255, 255)')
              throw new Error(`${pageName}/${theme}: ${id} hover state drifted: ${JSON.stringify(hovered)}`);
            await button.click();
            const emitted = await page.evaluate(() => globalThis.__GAL_ART_ACTIONS__?.at(-1));
            if (emitted !== action) throw new Error(`${pageName}/${theme}: ${id} emitted ${emitted}, expected ${action}`);
          }
        }
        if (pageName === 'story-cg' || pageName === 'story-cg-missing') {
          const visible = await page.evaluate(() => ({ cg: !!document.getElementById('gal-story-cg'),
            background: !!document.getElementById('gal-story-background'),
            portrait: !!document.getElementById('gal-story-portrait-placeholder'),
            missing: !!document.getElementById('gal-story-cg-unavailable'),
            dialogue: !!document.getElementById('gal-story-dialogue') }));
          const expected = pageName === 'story-cg';
          if (visible.cg !== expected || visible.missing === expected || visible.background || visible.portrait || !visible.dialogue)
            throw new Error(`${pageName}/${theme}: CG layer composition drifted: ${JSON.stringify(visible)}`);
        }
        if (pageName === 'gallery-cg' && await page.locator('#gal-gallery-image-cg-3').count())
          throw new Error('Locked CG rendered an image');
        if (pageName.startsWith('gallery-')) {
          const chrome = await page.evaluate(() => {
            const box = id => { const rect = document.getElementById(id)?.getBoundingClientRect();
              return rect && { x: rect.x, y: rect.y, right: rect.right }; };
            return { topbar: box('gal-gallery-topbar'), brand: box('gal-gallery-topbar-title'),
              heading: box('gal-gallery-heading'), tabs: box('gal-gallery-tabs'),
              progress: box('gal-gallery-progress'),
              progressText: document.getElementById('gal-gallery-progress')?.textContent };
          });
          if (!chrome.topbar || chrome.topbar.x !== 31 || chrome.topbar.y !== 14 ||
              !chrome.brand || chrome.brand.x !== 31 ||
              !chrome.heading ||
              !chrome.tabs || !chrome.progress || !chrome.progressText?.startsWith('已解锁 ') ||
              chrome.progress.y < chrome.tabs.y || chrome.progress.y > chrome.tabs.y + 44 ||
              chrome.progress.right > 1356)
            throw new Error(`${pageName}/${theme}: V2 gallery chrome drifted: ${JSON.stringify(chrome)}`);
          process.stdout.write(`${pageName}/${theme} chrome ${JSON.stringify(chrome)}\n`);
        }
        if (pageName.startsWith('confirm-')) {
          const modal = await page.locator('#gal-confirm [data-modal-dialog]').evaluate(element => {
            const rect = element.getBoundingClientRect();
            const title = element.querySelector('[id="gal-confirm-title"]');
            return { width: Math.round(rect.width), height: Math.round(rect.height),
              labelledBy: element.getAttribute('aria-labelledby'),
              titleSize: title ? getComputedStyle(title).fontSize : null };
          });
          if (modal.width !== 800 || modal.height !== 310 || modal.titleSize !== '30px' ||
            modal.labelledBy !== 'gal-confirm-title')
            throw new Error(`${pageName}/${theme}: V2 modal geometry/title drifted: ${JSON.stringify(modal)}`);
        }
        if (pageName === 'gallery-memories') {
          const card = await page.locator('#gal-gallery-card-memory-1').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { fill: getComputedStyle(element).backgroundColor,
              x: Math.round(rect.x), y: Math.round(rect.y), h: Math.round(rect.height) };
          });
          if (card.fill !== 'rgb(17, 27, 54)' || card.x !== 84 || Math.abs(card.y - 244) > 2 || card.h !== 151)
            throw new Error(`${pageName}/${theme}: V2 memory card drifted: ${JSON.stringify(card)}`);
          await page.locator('#gal-memory-play-memory-1').click();
          const emitted = await page.evaluate(() => globalThis.__GAL_ART_ACTIONS__?.at(-1));
          if (emitted !== 'gal.gallery.play-memory')
            throw new Error(`${pageName}/${theme}: memory replay emitted ${emitted}`);
        }
        if (pageName === 'gallery-memories-art') {
          const open = page.locator('#gal-gallery-memory-image-memory-1');
          const locked = page.locator('#gal-gallery-memory-image-memory-4');
          if (await open.count() !== 1 || await locked.count() !== 1 ||
              await page.locator('#gal-memory-play-memory-4').count() !== 0 ||
              await page.locator('#gal-gallery-placeholder-memory-1').count() !== 0)
            throw new Error(`${pageName}/${theme}: memory art state drifted`);
        }
        if (pageName === 'gallery-cg') {
          const image = await page.locator('#gal-gallery-image-cg-1').boundingBox();
          const card = await page.locator('#gal-gallery-card-cg-1').boundingBox();
          if (!image || !card || image.x < card.x || image.y < card.y ||
            image.x + image.width > card.x + card.width || image.y + image.height > card.y + card.height)
            throw new Error(`${pageName}/${theme}: CG image escaped its card`);
        }
        const result = await page.evaluate(() => {
          const ids = ['gal-story-dialogue', 'gal-slots-shell', 'gal-settings-shell', 'gal-gallery-shell',
            'gal-slot-2', 'gal-confirm'];
          return Object.fromEntries(ids.map(id => { const element = document.getElementById(id); if (!element) return [id, null];
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return [id, { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
              slice: style.borderImageSlice, edge: style.borderTopWidth }]; }));
        });
        const suffix = process.env.GAL_ART_AUDIT_SUFFIX?.match(/^[a-z0-9-]{1,32}$/)?.[0];
        if (process.env.GAL_ART_AUDIT_STATES === '1') {
          const states = await auditButtonStates(page, pageName, theme, output, suffix ?? 'states');
          const unchanged = states.filter(state => !state.disabled && !state.occluded &&
            (!state.hoverChanged || !state.pressedChanged));
          await writeFile(join(output, `gal-art-01a-${pageName}-${theme}-states-${suffix ?? 'states'}.json`),
            `${JSON.stringify(states, null, 2)}\n`);
          process.stdout.write(`${pageName}/${theme} buttons ${JSON.stringify({ total: states.length,
            occluded: states.filter(state => state.occluded).map(state => state.id),
            disabled: states.filter(state => state.disabled).map(state => state.id),
            noHoverChange: states.filter(state => !state.disabled && !state.occluded && !state.hoverChanged).map(state => state.id),
            noPressedChange: states.filter(state => !state.disabled && !state.occluded && !state.pressedChanged).map(state => state.id) })}\n`);
          if (unchanged.length) throw new Error(`${pageName}/${theme}: inert button visual states: ${unchanged.map(state => state.id).join(',')}`);
          await page.mouse.move(0, 0);
          await page.waitForTimeout(180);
        }
        await page.screenshot({ path: join(output, `gal-art-01a-${pageName}-${theme}${suffix ? `-${suffix}` : ''}.png`) });
        process.stdout.write(`${pageName}/${theme} ${JSON.stringify(result)}\n`);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
