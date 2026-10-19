// Static browser acceptance: product audio composition, native player gestures and decoded WAV state.
// Storage is an in-memory test seam; no server or database is started.
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../../..'), tempRoot = resolve(tmpdir());
const temporary = await mkdtemp(join(tempRoot, 'gal-audio-live-'));
const shots = process.argv.includes('--transient-shots') ? temporary : join(root, 'docs/design/galgame/review');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let browser;
try {
  const index = JSON.parse(await readFile(join(root, 'public/games/gal-template/art/index.json'), 'utf8'));
  const artUrls = {};
  for (const asset of index.assets.filter(row => row.type === 'texture' && row.status === 'filled' &&
      row.path?.startsWith('/games/gal-template/art/'))) {
    const file = resolve(root, 'public', '.' + asset.path);
    assert.ok(file.startsWith(resolve(root, 'public/games/gal-template/art') + sep));
    artUrls[asset.id] = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
  }
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    build: { write: true, outDir: temporary, emptyOutDir: false,
      lib: { entry: join(root, 'src/services/gal-ui/gal-audio-live.audit.ts'),
        formats: ['iife'], name: 'GalAudioAudit', fileName: () => 'audit.js' } } });
  await writeFile(join(temporary, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#070e17">' +
    '<div id="root" style="width:1440px;height:900px"></div><script>window.__galAudioUiUrls=' +
    JSON.stringify(artUrls).replaceAll('<', '\\u003c') + '</script><script src="audit.js"></script>');
  browser = await chromium.launch({ executablePath: executable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  const url = pathToFileURL(join(temporary, 'index.html')).href;
  await page.goto(url);
  await page.waitForFunction(() => window.__galAudioAudit || window.__galAudioAuditError);
  assert.equal(await page.evaluate(() => window.__galAudioAuditError), undefined);
  const media = () => page.evaluate(() => window.__galAudioAudit.media());
  const waitPage = value => page.waitForFunction(value => window.__galAudioAudit.page() === value, value);
  const waitRef = value => page.waitForFunction(value => window.__galAudioAudit.ref() === JSON.stringify(['a', value]), value);
  const shot = name => page.screenshot({ path: join(shots, `gal-04b-2d-${name}.png`) });
  const slider = async (channel, ratio) => {
    const input = page.locator(`#gal-setting-${channel}-control input`);
    const box = await input.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    const percent = Number(await input.inputValue());
    await page.waitForFunction(({ channel, percent }) => window.__galAudioAudit.prefs()[`${channel === 'voice' ? 'voice' : channel}Volume`] === percent / 100,
      { channel, percent });
    return percent;
  };

  assert.equal((await media()).length, 0);
  await page.locator('#starter-act-0').click(); await waitPage('story');
  await page.waitForFunction(() => window.__galAudioAudit.media().some(item => item.id === 'audio:theme' && !item.paused && item.ready >= 2 && item.time > 0));
  await page.waitForFunction(() => window.__galAudioAudit.media().some(item => item.id === 'audio:first' && !item.paused));
  assert.equal(await page.locator('#gal-story-voice-replay').isDisabled(), false);
  assert.equal((await media()).filter(item => item.id === 'audio:first').length, 1);
  assert.equal((await media()).find(item => item.id === 'audio:theme').volume, 0.4);
  await shot('playing');
  await page.locator('#gal-story-settings').click(); await waitPage('settings');
  await page.locator('#gal-settings-tab-audio').click();
  assert.ok((await media()).filter(item => item.id === 'audio:first').every(item => item.paused));
  const masterPercent = await slider('master', 0.5);
  const bgmPercent = await slider('bgm', 0.25), voicePercent = await slider('voice', 0.35), sfxPercent = await slider('sfx', 0.45);
  assert.ok(bgmPercent < 50 && voicePercent < 50 && sfxPercent < 60);
  assert.equal((await media()).find(item => item.id === 'audio:theme').volume, masterPercent / 100 * bgmPercent / 100 * 0.5);
  await page.locator('#gal-setting-audio-preview-control').click();
  await page.waitForFunction(() => window.__galAudioAudit.media().some(item => item.id === 'audio:bell' && !item.paused));
  assert.equal((await media()).filter(item => item.id === 'audio:bell').at(-1).volume, masterPercent / 100 * sfxPercent / 100);
  await page.locator('#gal-setting-focus-mute-control label').click();
  await page.waitForFunction(() => window.__galAudioAudit.prefs().focusMute === true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await media()).find(item => item.id === 'audio:theme').volume, 0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal((await media()).find(item => item.id === 'audio:theme').volume, masterPercent / 100 * bgmPercent / 100 * 0.5);
  await page.locator('#gal-setting-voice-auto-control label').click();
  await page.waitForFunction(() => window.__galAudioAudit.prefs().voiceAuto === false);
  for (const selector of ['#gal-settings-reset'])
    assert.equal(await page.locator(selector).isDisabled(), true);
  const box = await page.locator('#gal-settings-shell').boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height].map(Math.round), [18, 61, 1404, 824]);
  await shot('audio-settings');

  await page.evaluate(() => window.__galAudioAudit.failWrite(true));
  const failedSlider = await page.locator('#gal-setting-bgm-control input').boundingBox();
  await page.mouse.click(failedSlider.x + failedSlider.width * 0.9, failedSlider.y + failedSlider.height / 2);
  await page.waitForFunction(() => window.__galAudioAudit.feedback()?.includes('设置保存失败'));
  assert.equal(Number(await page.locator('#gal-setting-bgm-control input').inputValue()), bgmPercent);
  assert.equal((await media()).find(item => item.id === 'audio:theme').volume, masterPercent / 100 * bgmPercent / 100 * 0.5);
  await shot('failed-volume');
  await page.evaluate(() => window.__galAudioAudit.failWrite(false));
  await page.locator('#gal-settings-back').click(); await waitPage('story');
  assert.equal((await media()).filter(item => item.id === 'audio:first').length, 1);
  await page.locator('#gal-story-dialogue').click(); await waitRef('two');
  assert.equal((await media()).filter(item => item.id === 'audio:second').length, 0);
  await page.locator('#gal-story-voice-replay').click();
  await page.waitForFunction(() => window.__galAudioAudit.media().some(item => item.id === 'audio:second' && !item.paused));
  assert.equal((await media()).filter(item => item.id === 'audio:second').at(-1).volume, masterPercent / 100 * voicePercent / 100);
  await page.mouse.move(700, 760); await page.mouse.wheel(0, -120); await waitRef('one');
  assert.ok((await media()).filter(item => item.id === 'audio:second').every(item => item.paused));
  assert.equal((await media()).filter(item => item.id === 'audio:first').length, 1);
  await page.locator('#gal-story-voice-replay').click();
  assert.equal((await media()).filter(item => item.id === 'audio:first').length, 2);
  await shot('rolled-back');

  await page.locator('#gal-story-save').click(); await waitPage('slots');
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  await page.locator('#gal-confirm-yes').click();
  await page.waitForFunction(() => window.__galAudioAudit.feedback()?.includes('已保存'));
  await page.locator('#gal-slots-back').click(); await waitPage('story');
  await page.locator('#gal-story-load').click(); await waitPage('slots');
  await page.locator('#gal-slot-2').click(); await page.locator('#gal-slots-commit').click();
  await page.locator('#gal-confirm-yes').click(); await waitPage('story'); await waitRef('one');
  assert.equal((await media()).filter(item => item.id === 'audio:first').length, 2);
  await page.locator('#gal-story-voice-replay').click();
  assert.equal((await media()).filter(item => item.id === 'audio:first').length, 3);
  await shot('loaded-same-ref');

  await page.evaluate(() => window.__galAudioAudit.unlockReplay());
  await page.locator('#gal-story-settings').click();
  await page.locator('#gal-settings-nav-gallery').click(); await waitPage('gallery');
  const before = await page.evaluate(async () => [window.__galAudioAudit.hash(), await window.__galAudioAudit.profileJson()]);
  await page.locator('#gal-memory-play-memory').click(); await waitPage('story');
  await page.locator('#gal-story-dialogue').click(); await waitRef('two');
  await page.locator('#gal-replay-exit').click(); await waitPage('gallery');
  assert.deepEqual(await page.evaluate(async () => [window.__galAudioAudit.hash(), await window.__galAudioAudit.profileJson()]), before);
  await shot('replay-return');
  await page.evaluate(() => window.__galAudioAudit.reopen()); await waitPage('home');
  assert.deepEqual(await page.evaluate(() => {
    const p = window.__galAudioAudit.prefs(); return [p.masterVolume, p.bgmVolume, p.voiceVolume, p.sfxVolume, p.focusMute, p.voiceAuto];
  }), [masterPercent / 100, bgmPercent / 100, voicePercent / 100, sfxPercent / 100, true, false]);
  await shot('reopened');
  await page.evaluate(() => window.__galAudioAudit.close());
  assert.ok((await media()).every(item => item.paused));
  assert.deepEqual(errors, []);

  const missing = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await missing.goto(url + '?missing=voice');
  await missing.waitForFunction(() => window.__galAudioAudit || window.__galAudioAuditError);
  await missing.locator('#starter-act-0').click();
  await missing.waitForFunction(() => window.__galAudioAudit.status()?.unavailable.includes('voice:first'));
  assert.equal(await missing.locator('#gal-story-voice-replay').isDisabled(), true);
  await missing.locator('#gal-story-dialogue').click();
  await missing.waitForFunction(() => window.__galAudioAudit.ref() === JSON.stringify(['a', 'two']));
  await missing.evaluate(() => window.__galAudioAudit.close());
  console.log('GAL-UI-04B-2D static browser PASS: real WAV playback, master/3-channel sliders, focus mute, voice-auto off/manual replay, preview, failed-write rollback, wheel, same-ref load, isolated replay, reopen, missing voice and teardown.');
} finally {
  await browser?.close();
  assert.ok(temporary.startsWith(tempRoot + sep) && basename(temporary).startsWith('gal-audio-live-'));
  await rm(temporary, { recursive: true, force: true });
}
