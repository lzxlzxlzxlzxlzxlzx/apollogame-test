import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('manifest matches the DokiWorlds public/apps catalog contract', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.id, 'game-physics-dice');
  assert.equal(manifest.version, '1.0.6');
  assert.equal(manifest.entry, 'index.html');
  assert.deepEqual(manifest.context, { requiredScopes: [], optionalScopes: [] });
  assert.equal(manifest.locales.en.name, 'Physics Dice');
  assert.equal(manifest.locales.en.description, 'A physics-based dice game.');
  assert.equal(manifest.locales['zh-cn'].name, '物理骰子');
  assert.equal(manifest.locales['zh-cn'].description, '一款物理骰子游戏。');
  assert.deepEqual(manifest.documentation, {
    'zh-cn': { title: '物理骰子调用文档', path: 'docs/integration.zh-CN.md' },
  });
  assert.match(await readFile(new URL('../docs/integration.zh-CN.md', import.meta.url), 'utf8'), /^# 物理骰子/);
  assert.equal(manifest.runtime.protocol, 'dokiworld.app');
  assert.equal(manifest.runtime.protocolVersion, 2);
  assert.deepEqual(manifest.runtime.input, { contract: 'doki.game.dice-input', version: 1 });
  assert.deepEqual(manifest.runtime.outputs, [{ contract: 'doki.game.result', version: 1 }]);
  assert.deepEqual(manifest.runtime.modules, []);
  assert.equal('inputs' in manifest, false);
  assert.equal('outputs' in manifest, false);
});

test('standalone shell uses the same border-box layout semantics as the engine preview', async () => {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.match(html, /\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box/);
});
