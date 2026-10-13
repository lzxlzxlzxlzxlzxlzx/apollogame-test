import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('SDK adapter derives seed from SDK metadata and never maps exit to failure', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /fnv1a32\(`\$\{app\.instanceId\}:\$\{app\.runId/);
  assert.match(source, /createAppClient\(\{ appId: 'game-lockpick', targetOrigin: '\*' \}\)/);
  assert.match(source, /app\.connect\(\)/); assert.match(source, /app\.whenReady\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(source, /app\.requestExit\(\)/); assert.doesNotMatch(source, /dispose[\s\S]{0,80}failure/);
});
