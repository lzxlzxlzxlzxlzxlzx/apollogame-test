import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const url = pathToFileURL(path.join(root, 'docs/design/game-card-reveal/prototype.dc.html')).href;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, executablePath: edge });

const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const report = { url, standard: {}, reduced: {}, consoleErrors: [], pageErrors: [] };

async function configure(page) {
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__fullDemoReview));
  await page.evaluate(() => {
    document.getElementById('controls').style.visibility = 'hidden';
    document.getElementById('readout').style.visibility = 'hidden';
    document.getElementById('motion-note').style.visibility = 'hidden';
  });
}

async function canvasHash(page) {
  return digest(await page.locator('#art').screenshot({ omitBackground: true }));
}

async function clickAndWait(page, selector, waitMs) {
  await page.evaluate(value => document.querySelector(value).click(), selector);
  await page.waitForTimeout(waitMs);
  return await page.evaluate(() => window.__fullDemoReview.state());
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await configure(page);

  const boundaryChecks = [];
  await page.evaluate(() => window.__p2Review.setTime(2000));
  const p2End = await canvasHash(page);
  await page.evaluate(() => window.__p3Review.setTime(0));
  const p3Start = await canvasHash(page);
  boundaryChecks.push({ boundary: 'P2→P3', equal: p2End === p3Start, left: p2End, right: p3Start });

  await page.evaluate(() => window.__p3Review.setTime(1050));
  const p3End = await canvasHash(page);
  await page.evaluate(() => window.__p4Review.setTime(0));
  const p4Start = await canvasHash(page);
  boundaryChecks.push({ boundary: 'P3→P4', equal: p3End === p4Start, left: p3End, right: p4Start });

  await page.evaluate(() => window.__cardCountReview.set(5));
  const p4Duration = await page.evaluate(() => window.__p4Review.state().duration);
  await page.evaluate(t => window.__p4Review.setTime(t), p4Duration);
  const p4End = await canvasHash(page);
  await page.evaluate(() => window.__p5Review.setTime(0));
  const p5Start = await canvasHash(page);
  boundaryChecks.push({ boundary: 'P4→P5', equal: p4End === p5Start, left: p4End, right: p5Start });
  report.standard.boundaries = boundaryChecks;

  const p2Runs = [];
  for (let index = 0; index < 10; index += 1) {
    await page.evaluate(() => document.querySelector('[data-action="p2-replay"]').click());
    await page.waitForTimeout(2100);
    p2Runs.push(await page.evaluate(() => window.__p2Review.state()));
  }
  report.standard.p2Runs = p2Runs;

  const fullRuns = [];
  for (const count of [1, 3, 5]) {
    await page.evaluate(value => window.__cardCountReview.set(value), count);
    const expected = await page.evaluate(() => window.__fullDemoReview.state().duration);
    const state = await clickAndWait(page, '[data-action="full-replay"]', expected + 180);
    fullRuns.push({ count, expected, state });
  }
  report.standard.fullRuns = fullRuns;

  await page.evaluate(() => window.__cardCountReview.set(5));
  for (let index = 0; index < 20; index += 1) {
    await page.evaluate(() => document.querySelector('[data-action="full-replay"]').click());
  }
  const rapidExpected = await page.evaluate(() => window.__fullDemoReview.state().duration);
  await page.waitForTimeout(rapidExpected + 200);
  report.standard.rapidReplay = await page.evaluate(() => window.__fullDemoReview.state());
  await context.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await configure(reducedPage);
  const reducedRuns = [];
  for (const count of [1, 5]) {
    await reducedPage.evaluate(value => window.__cardCountReview.set(value), count);
    const expected = await reducedPage.evaluate(() => window.__fullDemoReview.state().duration);
    const state = await clickAndWait(reducedPage, '[data-action="full-replay"]', expected + 180);
    reducedRuns.push({ count, expected, state });
  }
  report.reduced.fullRuns = reducedRuns;
  await reducedContext.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
