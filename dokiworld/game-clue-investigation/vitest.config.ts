import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { engineAliases } from '../../scripts/engine-aliases.mjs';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(appRoot, '..', '..');

export default defineConfig({
  root: appRoot,
  resolve: { alias: { ...engineAliases(repoRoot) } },
  test: { include: ['tests/runtime-manifest.test.ts'], environment: 'node' },
});
