import { access, copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { engineAliases } from '../../../scripts/engine-aliases.mjs';
import { generateManifest } from './generate-manifest.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dist = resolve(appRoot, 'dist');

generateManifest();
await rm(dist, { recursive: true, force: true });

await build({
  configFile: false,
  root: resolve(appRoot, 'src'),
  base: './',
  logLevel: 'warn',
  resolve: {
    alias: [
      ...Object.entries(engineAliases(repoRoot)).map(([find, replacement]) => ({ find, replacement })),
      { find: '@games', replacement: resolve(repoRoot, 'games') },
      { find: /^@dokiworld\/app-sdk$/, replacement: resolve(appRoot, 'node_modules/@dokiworld/app-sdk/src/index.js') },
      { find: /^@dokiworld\/app-sdk\/(.+)$/, replacement: resolve(appRoot, 'node_modules/@dokiworld/app-sdk/src') + '/$1.js' },
    ],
  },
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: dist,
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
});

await copyFile(resolve(appRoot, 'manifest.json'), resolve(dist, 'manifest.json'));
await mkdir(resolve(dist, 'games'), { recursive: true });
await cp(resolve(repoRoot, 'public', 'games', 'game-105'), resolve(dist, 'games', 'game-105'), { recursive: true });
await cp(resolve(repoRoot, 'public', 'ui-fonts', 'cjk'), resolve(dist, 'ui-fonts', 'cjk'), { recursive: true });

const distManifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
await access(resolve(dist, distManifest.entry));
console.log(`Built game105 DokiWorld app to ${dist}`);
