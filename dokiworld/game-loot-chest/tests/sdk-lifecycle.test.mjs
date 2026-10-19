import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('loot chest consumes the latest 0.2.0 input lifecycle', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /targetOrigin:\s*['"]\*['"]/);
  assert.match(source, /app\.connect\(\)/);
  assert.match(source, /app\.whenReady\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(source, /app\.requestExit\(\)/);
  assert.doesNotMatch(source, /AppInitPayload|connect\(\{\s*onInit/);
});
