import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('manifest matches the current DokiWorlds public/apps contract', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.id, 'game-loot-chest');
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.entry, 'index.html');
  assert.deepEqual(manifest.context, { requiredScopes: [], optionalScopes: [] });
  assert.equal(manifest.locales.en.name, 'Loot Chest');
  assert.equal(manifest.locales['zh-cn'].name, '开启宝箱');
  assert.deepEqual(manifest.documentation, {
    'zh-cn': { title: '开启宝箱调用文档', path: 'docs/integration.zh-CN.md' },
  });
  assert.match(await readFile(new URL('../docs/integration.zh-CN.md', import.meta.url), 'utf8'), /^# 开启宝箱/);
  assert.deepEqual(manifest.runtime.input, { contract: 'doki.game.chest-input', version: 2 });
  assert.deepEqual(manifest.runtime.outputs, [{ contract: 'doki.game.chest-result', version: 2 }]);
  assert.deepEqual(manifest.runtime.modules, []);
  assert.equal('inputs' in manifest, false);
  assert.equal('outputs' in manifest, false);
});

test('the entry page keeps the iframe canvas transparent before the module loads', async () => {
  const entry = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(entry, /background:transparent!important/);
  assert.match(entry, /color-scheme:normal/);
  assert.match(css, /color-scheme: normal/);
  assert.doesNotMatch(css, /color-scheme: dark/);
});
