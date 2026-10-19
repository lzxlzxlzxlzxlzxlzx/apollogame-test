import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { engineAliases } from '../../scripts/engine-aliases.mjs';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

export default defineConfig({
  resolve: { alias: engineAliases(repoRoot) },
  test: { include: ['tests/**/*.test.ts'] },
});
