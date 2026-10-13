import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('空调试输入进入演示局，真实输入仍使用 0.2.0 生命周期', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /app\.connect\(\)/);
  assert.match(source, /app\.whenReady\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(source, /isEmptyPreviewInput\(input\.data\)/);
  assert.match(source, /config: DEFAULT_THEFT_CONFIG/);
  assert.match(source, /app\.complete\(output/);
  const gameSource = await readFile(new URL('../../../games/game-theft/game-theft.ts', import.meta.url), 'utf8');
  assert.match(gameSource, /container\.focus\(\{ preventScroll: true \}\)/);
  assert.match(gameSource, /document\.addEventListener\('keydown', onKeyDown, true\)/);
});
