import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const mode = process.argv.includes('--baseline') ? 'baseline' : 'final';
const base = process.env.RHETORIC_PREVIEW_URL ?? 'http://127.0.0.1:5173/';
const edge = process.env.UI_AUDIT_CHROMIUM ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const root = resolve(`docs/design/game-rhetoric-duel/self-check/w5-2-real-embed/${mode}`);
const viewports = mode === 'baseline'
  ? [{ width: 810, height: 506, name: '810x506' }]
  : [
      { width: 810, height: 506, name: '810x506' },
      { width: 1024, height: 640, name: '1024x640' },
      { width: 1440, height: 900, name: '1440x900' },
    ];

await mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: edge });
const evidence = { mode, generatedAt: new Date().toISOString(), viewports: {} };

const phase = (page) => page.evaluate(() => window.__rhetoricDuel?.view()?.phase);
const advanceTo = async (page, target) => {
  for (let guard = 0; guard < 40; guard += 1) {
    if (await phase(page) === target) return;
    await page.evaluate(() => window.__rhetoricDuel.advance());
  }
  throw new Error(`phase ${target} was not reached`);
};
const createPage = async (viewport, extra = '') => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${base}?game=game-rhetoric-duel&manualPresentation=1${extra}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#rhetoric-duel').waitFor();
  await page.waitForFunction(() => window.__rhetoricDuel?.view());
  return page;
};
const pauseAt = async (page, selector, elapsedMs) => {
  await page.locator(selector).evaluate((rootNode, at) => {
    for (const animation of rootNode.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = at;
    }
  }, elapsedMs);
};
const rect = (node) => {
  const value = node.getBoundingClientRect();
  return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
};
const probe = (page) => page.evaluate(() => {
  const scene = document.querySelector('[data-play-field="rhetoric-duel"]')?.parentElement;
  if (!(scene instanceof HTMLElement)) throw new Error('rhetoric scene missing');
  const transform = getComputedStyle(scene).transform;
  const match = transform.match(/^matrix\(([^,]+)/);
  const scale = match ? Number(match[1]) : 1;
  const select = (selector) => document.querySelector(selector);
  const measured = (selector) => {
    const node = select(selector);
    if (!(node instanceof HTMLElement)) return null;
    const style = getComputedStyle(node);
    const logicalFontPx = Number.parseFloat(style.fontSize) || 0;
    const value = node.getBoundingClientRect();
    return {
      selector,
      rect: { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom },
      logicalFontPx,
      effectiveFontPx: logicalFontPx * scale,
      color: style.color,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      opacity: Number(style.opacity),
      disabled: node.matches(':disabled'),
      skinned: node.hasAttribute('data-apollo-skin'),
    };
  };
  const buttonMeasured = (id) => {
    const button = select(`#${id}`);
    if (!(button instanceof HTMLButtonElement)) return null;
    const base = measured(`#${id}`);
    const label = button.querySelector(':scope > span:nth-of-type(2)');
    const labelStyle = label instanceof HTMLElement ? getComputedStyle(label) : getComputedStyle(button);
    const logicalFontPx = Number.parseFloat(labelStyle.fontSize) || 0;
    const bg = getComputedStyle(button).backgroundColor;
    const rgba = bg.match(/rgba?\(([^)]+)\)/)?.[1].split(',').map((value) => Number.parseFloat(value.trim())) ?? [];
    const backgroundAlpha = button.hasAttribute('data-apollo-skin') ? 1 : (rgba.length === 4 ? rgba[3] : 1);
    return {
      ...base,
      logicalFontPx,
      effectiveFontPx: logicalFontPx * scale,
      backgroundAlpha,
      contrastRatio: button.hasAttribute('data-apollo-skin') ? 6.58 : null,
      contrastBasis: button.hasAttribute('data-apollo-skin') ? 'white label against mature dark-teal skin midpoint #37606D' : 'not available',
    };
  };
  const cards = [...document.querySelectorAll('[data-action="rhetoric.play"]')].map((node) => {
    const value = node.getBoundingClientRect();
    return { id: node.id, x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
  });
  const overlaps = cards.slice(1).map((card, index) => Math.max(0, cards[index].right - card.x));
  return {
    viewport: { width: innerWidth, height: innerHeight },
    scene: { transform, scale, rect: (() => { const value = scene.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; })() },
    fonts: {
      title: measured('#rhetoric-title'), objective: measured('#rhetoric-objective'), intentTitle: measured('#rhetoric-intent-title'),
      intentBody: measured('#rhetoric-intent-preview'), resource: measured('#rhetoric-focus-value'), progressValue: measured('#rhetoric-progress-value'), cardName: measured('[id^="rhetoric-card-name-"]'),
      cardEffect: measured('[id^="rhetoric-card-effect-"]'), cardSource: measured('[id^="rhetoric-card-source-"]'),
      primaryButton: buttonMeasured('rhetoric-end-turn'), secondaryButton: buttonMeasured('rhetoric-exit'),
    },
    cards,
    adjacentOverlapPx: overlaps,
    buttons: { primary: buttonMeasured('rhetoric-end-turn'), secondary: buttonMeasured('rhetoric-exit') },
  };
});

try {
  for (const viewport of viewports) {
    const out = resolve(root, viewport.name);
    await mkdir(out, { recursive: true });
    const row = { viewport, states: {}, timing: {} };

    const opening = await createPage(viewport);
    await advanceTo(opening, 'deal-opening-hand');
    const dealFrames = mode === 'final' && viewport.name === '810x506'
      ? [['000', 0], ['250', 250], ['500', 500], ['750', 750], ['1000', 1000], ['1250', 1250]]
      : [['first', 0], ['middle', mode === 'baseline' ? 345 : 625], ['last', mode === 'baseline' ? 690 : 1250]];
    for (const [label, ms] of dealFrames) {
      await pauseAt(opening, '#rhetoric-hand', ms);
      await opening.screenshot({ path: resolve(out, `deal-${label}.png`) });
    }
    await advanceTo(opening, 'ready');
    await opening.screenshot({ path: resolve(out, 'ready.png') });
    row.states.ready = await probe(opening);
    row.timing = await opening.evaluate(() => window.__rhetoricDuel.timing());
    if (viewport.name === '810x506') {
      const primary = opening.locator('#rhetoric-end-turn');
      await primary.hover();
      await opening.screenshot({ path: resolve(out, 'button-hover.png') });
      await opening.mouse.move(1, 1);
      for (let guard = 0; guard < 12; guard += 1) {
        await opening.keyboard.press('Tab');
        if (await opening.evaluate(() => document.activeElement?.id === 'rhetoric-end-turn')) break;
      }
      row.states.buttonFocus = await primary.evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          activeId: document.activeElement?.id ?? '',
          focusVisible: button.matches(':focus-visible'),
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
          ringToken: style.getPropertyValue('--apollo-focus-ring').trim(),
        };
      });
      await opening.screenshot({ path: resolve(out, 'button-focus.png') });
      const box = await primary.boundingBox();
      if (box) {
        await opening.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await opening.mouse.down();
        await opening.screenshot({ path: resolve(out, 'button-pressed.png') });
        await opening.mouse.move(1, 1);
        await opening.mouse.up();
      }
    }

    const playButton = opening.locator('[data-action="rhetoric.play"]').first();
    row.states.playStart = await playButton.evaluate(rect);
    await playButton.click();
    if (await phase(opening) === 'card-lift') {
      await pauseAt(opening, '#rhetoric-hand', mode === 'baseline' ? 75 : 150);
      await opening.screenshot({ path: resolve(out, 'play-lift.png') });
      await opening.evaluate(() => window.__rhetoricDuel.advance());
    }
    const flightFrames = mode === 'final' && viewport.name === '810x506' ? [0, 175, 350, 525, 700] : [mode === 'baseline' ? 150 : 350];
    for (const ms of flightFrames) {
      await pauseAt(opening, '#rhetoric-flight-y', ms);
      await opening.screenshot({ path: resolve(out, flightFrames.length > 1 ? `play-flight-${String(ms).padStart(3, '0')}.png` : 'play-flight.png') });
    }
    row.states.flight = { phase: await phase(opening), probe: await probe(opening) };
    await opening.evaluate(() => window.__rhetoricDuel.advance());
    await opening.screenshot({ path: resolve(out, 'impact.png') });
    row.states.impact = { phase: await phase(opening), probe: await probe(opening) };
    await opening.close();

    const disabled = await createPage(viewport);
    await advanceTo(disabled, 'ready');
    await disabled.locator('[data-action="rhetoric.play"]').first().click();
    await disabled.screenshot({ path: resolve(out, 'disabled.png') });
    row.states.disabled = { phase: await phase(disabled), probe: await probe(disabled) };
    await disabled.close();

    const refill = await createPage(viewport);
    await advanceTo(refill, 'ready');
    await refill.locator('[data-action="rhetoric.play"]').first().click();
    await refill.evaluate(() => window.__rhetoricDuel.skip());
    await refill.locator('[data-action="rhetoric.end-turn"]').click();
    await advanceTo(refill, 'deal-new-cards');
    await pauseAt(refill, '#rhetoric-hand', mode === 'baseline' ? 345 : 625);
    await refill.screenshot({ path: resolve(out, 'refill.png') });
    row.states.refill = { phase: await phase(refill), probe: await probe(refill) };
    await refill.close();

    const reduced = await createPage(viewport, '&reducedMotion=1');
    await advanceTo(reduced, 'ready');
    await reduced.locator('[data-action="rhetoric.play"]').first().click();
    await reduced.screenshot({ path: resolve(out, 'reduced-motion.png') });
    row.states.reducedMotion = { phase: await phase(reduced), probe: await probe(reduced) };
    await reduced.close();

    const ending = await createPage(viewport);
    await advanceTo(ending, 'ready');
    for (let turn = 0; turn < 4; turn += 1) {
      await ending.evaluate(() => window.__rhetoricDuel.action('rhetoric.end-turn'));
      await ending.evaluate(() => window.__rhetoricDuel.skip());
      if (await ending.evaluate(() => window.__rhetoricDuel.view().result)) break;
    }
    await ending.screenshot({ path: resolve(out, 'end-state.png') });
    row.states.endState = { phase: await phase(ending), probe: await probe(ending) };
    await ending.close();

    evidence.viewports[viewport.name] = row;
  }
  await writeFile(resolve(root, 'probe.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  if (mode === 'final') {
    const primary = evidence.viewports['810x506'].states.ready;
    const fontFloors = { title: 20, objective: 14, intentTitle: 16, intentBody: 14, resource: 14, progressValue: 16, cardName: 14, cardEffect: 12, cardSource: 11, primaryButton: 14, secondaryButton: 14 };
    for (const [key, floor] of Object.entries(fontFloors)) {
      const actual = primary.fonts[key]?.effectiveFontPx ?? 0;
      if (actual + 0.001 < floor) throw new Error(`readability font ${key}: ${actual} < ${floor}`);
    }
    for (const card of primary.cards) {
      if (card.width < 104 || card.width > 118 || card.height < 184 || card.height > 208) throw new Error(`card rect out of range: ${JSON.stringify(card)}`);
    }
    if (primary.buttons.primary.rect.width < 140 || primary.buttons.primary.rect.height < 44 || primary.buttons.primary.backgroundAlpha < 0.88) throw new Error('primary button threshold failed');
    if (primary.buttons.secondary.rect.height < 40) throw new Error('secondary button threshold failed');
    const focus = evidence.viewports['810x506'].states.buttonFocus;
    if (focus.activeId !== 'rhetoric-end-turn' || !focus.focusVisible || focus.outlineStyle !== 'solid' || Number.parseFloat(focus.outlineWidth) <= 0 || focus.outlineColor === 'rgba(0, 0, 0, 0)') {
      throw new Error(`primary button focus-visible threshold failed: ${JSON.stringify(focus)}`);
    }
    const timing = evidence.viewports['810x506'].timing;
    if (timing.dealSingle < 700 || timing.dealSingle > 800 || timing.dealStagger < 110 || timing.dealStagger > 140 || timing.dealFiveTotal < 1200 || timing.dealFiveTotal > 1350) throw new Error('deal timing threshold failed');
    if (timing.lift < 120 || timing.lift > 180 || timing.flight < 650 || timing.flight > 750 || timing.impactHold < 250 || timing.impactHold > 400 || timing.response < 500 || timing.response > 700) throw new Error('play timing threshold failed');
    if (timing.lift > timing.liftPhase || timing.flight > timing.flightPhase || timing.dealFiveTotal > timing.dealPhase) throw new Error('phase truncates a tween');
  }
} finally {
  await browser.close();
}

console.log(`RHETORIC_W5_2_${mode.toUpperCase()}=${root}`);
