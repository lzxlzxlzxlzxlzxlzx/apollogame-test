import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('game-lockpick manifest has the contracted DokiWorld identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.schemaVersion, 3); assert.equal(manifest.id, 'game-lockpick'); assert.equal(manifest.entry, 'index.html');
  assert.deepEqual(manifest.context, { requiredScopes: [], optionalScopes: [] });
  assert.equal(manifest.runtime.input.contract, 'doki.game.lockpick-input'); assert.equal(manifest.runtime.input.version, 1);
  assert.deepEqual(manifest.runtime.outputs, [{ contract: 'doki.game.lockpick-result', version: 1 }]);
});
