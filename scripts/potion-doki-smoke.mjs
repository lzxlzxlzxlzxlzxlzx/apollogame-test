// 短时本地假宿主：真实 vendored SDK host/client 握手与 complete，隔离浏览器/服务 finally 关闭。
import { fileURLToPath } from 'node:url';
import { detectBrowserRuntime, startDevServer, stopDevServer } from './lib/render-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = detectBrowserRuntime();
if (!runtime.ok) throw new Error(runtime.reason);
const dev = await startDevServer(root, { port: 5700 });
let browser;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, executablePath: runtime.execPath, args: ['--no-sandbox'] });
  for (const outcome of ['success', 'failure', 'rejected', 'preview', 'invalid', 'cancelled']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(`http://localhost:${dev.port}/potion-test-host`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>' }));
    await page.goto(`http://localhost:${dev.port}/potion-test-host`);
    await page.evaluate(async ({ port, outcome }) => {
      const { createAppHost } = await import('/vendor/dokiworlds-app-sdk/src/index.js');
      const frame = document.createElement('iframe');
      frame.style.cssText = 'width:1440px;height:900px;border:0;display:block';
      document.body.append(frame);
      const input = { contract: 'doki.game.potion-brewing-input', version: 1, data: outcome === 'preview' ? {} : outcome === 'invalid' ? { brewingId: 'invalid-without-recipe' } : {
        brewingId: `smoke-${outcome}`, recipe: { recipeId: 'moon-dew', name: '月露安神剂',
          ingredients: [{ ingredientId: 'moon-herb', name: '月露草' }, { ingredientId: 'silver-leaf', name: '银叶' }],
          steps: [{ kind: 'add', ingredientId: 'moon-herb', liquidColor: '#69adb1' }, { kind: 'stir', direction: 'clockwise', turns: 1, liquidColor: '#398f93' }],
        },
      } };
      window.__POTION_DOKI_OUTPUTS__ = [];
      window.__POTION_DOKI_EXITS__ = 0;
      const host = createAppHost({ appId: 'game-potion-brewing', runId: `run-${outcome}`, target: frame.contentWindow, input, expectedOrigin: location.origin });
      host.connect({ onComplete: (output) => { window.__POTION_DOKI_OUTPUTS__.push(output); return { status: outcome === 'rejected' ? 'rejected' : 'accepted' }; }, onRequestExit: () => { window.__POTION_DOKI_EXITS__++; } });
      window.__POTION_DOKI_HOST__ = host;
      frame.src = `http://localhost:${port}/dokiworld/game-potion-brewing/dist/index.html`;
    }, { port: dev.port, outcome });
    const frame = page.frameLocator('iframe');
    if (outcome === 'invalid') {
      await page.waitForFunction(() => window.__POTION_DOKI_EXITS__ === 1, undefined, { timeout: 10_000 });
      const state = await page.evaluate(() => ({ outputs: window.__POTION_DOKI_OUTPUTS__, exits: window.__POTION_DOKI_EXITS__ }));
      if (state.outputs.length !== 0 || state.exits !== 1) throw new Error(`非法输入退出语义不符: ${JSON.stringify(state)}`);
      await frame.locator('#app').getByText('启动失败').waitFor();
      await page.close();
      continue;
    }
    await frame.locator('#potion-scene-host canvas').waitFor();
    await frame.locator('#potion-recipe-progress').waitFor();
    await page.waitForTimeout(250);
    if (outcome === 'preview') {
      await frame.locator('#app[data-preview="true"]').waitFor();
      await page.waitForTimeout(200);
      if (await page.evaluate(() => window.__POTION_DOKI_OUTPUTS__.length) !== 0) throw new Error('空数据预览错误地提交结果');
      await page.close();
      continue;
    }
    if (outcome === 'cancelled') {
      await frame.locator('#potion-scene-host canvas').click({ position: { x: 720, y: 430 } });
      await page.keyboard.press('Escape');
      await frame.locator('#potion-exit-confirm-button').click();
      await page.waitForFunction(() => window.__POTION_DOKI_EXITS__ === 1, undefined, { timeout: 10_000 });
      const state = await page.evaluate(() => ({ outputs: window.__POTION_DOKI_OUTPUTS__, exits: window.__POTION_DOKI_EXITS__ }));
      if (state.outputs.length !== 0 || state.exits !== 1) throw new Error(`主动取消退出语义不符: ${JSON.stringify(state)}`);
      if (await frame.locator('#potion-result').count()) throw new Error('主动取消错误地进入炼制终局');
      if (errors.length) throw new Error(`取消分支浏览器错误: ${errors.join(' | ')}`);
      await page.close();
      continue;
    }
    const canvas = frame.locator('#potion-scene-host canvas');
    const point = async (x, y) => { const rect = await canvas.boundingBox(); if (!rect) throw new Error('未出现炼药画布'); return { x: rect.x + x * rect.width / 1440, y: rect.y + y * rect.height / 900 }; };
    const drag = async (from, to) => { const a = await point(...from), b = await point(...to); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 16 }); await page.mouse.up(); };
    if (outcome !== 'success') await drag([1325, 272], [760, 423]);
    else {
      await drag([1180, 272], [760, 423]);
      for (let attempt = 0; attempt < 3; attempt++) {
        const ring = await point(865, 423);
        await page.mouse.move(ring.x, ring.y); await page.mouse.down();
        for (let i = 0; i <= 40; i++) {
          const theta = i * Math.PI * 2 / 40;
          const target = await point(760 + 105 * Math.cos(theta), 423 + 43 * Math.sin(theta));
          await page.mouse.move(target.x, target.y); await page.waitForTimeout(20);
        }
        await page.mouse.up();
        if (await frame.locator('#potion-result').count()) break;
      }
    }
    await page.waitForFunction(() => window.__POTION_DOKI_OUTPUTS__?.length === 1, undefined, { timeout: 10_000 }).catch(async (error) => {
      const detail = { outputs: await page.evaluate(() => window.__POTION_DOKI_OUTPUTS__), progress: await frame.locator('#potion-recipe-progress').textContent() };
      throw new Error(`${outcome} 未向宿主交付: ${JSON.stringify(detail)}`, { cause: error });
    });
    const result = await page.evaluate(() => ({ outputs: window.__POTION_DOKI_OUTPUTS__, exits: window.__POTION_DOKI_EXITS__ }));
    const output = result.outputs[0];
    const expectedOutcome = outcome === 'success' ? 'success' : 'failure';
    if (output?.contract !== 'doki.game.potion-brewing-result' || output.version !== 1 || output.data.brewingId !== `smoke-${outcome}` || output.data.outcome !== expectedOutcome || result.exits !== 0) throw new Error(`宿主回执不符: ${JSON.stringify(result)}`);
    if (await frame.locator('#potion-result-restart').count()) throw new Error('终局仍含重开按钮');
    await frame.locator('#potion-result').waitFor();
    await page.keyboard.press('q'); await page.keyboard.press('e');
    await page.waitForTimeout(100);
    if (await page.evaluate(() => window.__POTION_DOKI_OUTPUTS__.length) !== 1) throw new Error('终局重复交付');
    if (errors.length) throw new Error(`浏览器错误: ${errors.join(' | ')}`);
    await page.close();
  }
  console.log(JSON.stringify({ pass: true, outcomes: ['success', 'failure'], rejectedRetainsTerminal: true, previewNoComplete: true, invalidRequestsExit: true, cancelledRequestsExit: true, invalidOrCancelledCompletes: 0, duplicates: 0 }));
} finally {
  await browser?.close();
  if (process.platform === 'win32' && !dev.proc.killed) dev.proc.kill('SIGTERM');
  stopDevServer(dev.proc);
}
