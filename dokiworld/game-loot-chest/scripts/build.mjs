import { createHash } from 'node:crypto';
import { access, copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { engineAliases } from '../../../scripts/engine-aliases.mjs';
import { exportAppAssetClosure } from '../../../scripts/app-asset-closure.mjs';
import { exportAppDocumentation } from '../../../scripts/app-documentation-closure.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dist = resolve(appRoot, 'dist');
const manifestPath = resolve(appRoot, 'manifest.json');
const appAssetRoot = resolve(appRoot, 'assets');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.schemaVersion !== 3 || manifest.id !== 'game-loot-chest' || manifest.version !== '1.1.0') {
  throw new Error('Unexpected DokiWorld loot chest manifest identity.');
}
if (manifest.entry !== 'index.html') throw new Error('Unexpected DokiWorld loot chest entry.');
if (!manifest.context || manifest.context.requiredScopes?.length !== 0 || manifest.context.optionalScopes?.length !== 0) {
  throw new Error('Unexpected DokiWorld loot chest context scopes.');
}
if (!manifest.locales?.en?.name || !manifest.locales?.en?.description
  || !manifest.locales?.['zh-cn']?.name || !manifest.locales?.['zh-cn']?.description) {
  throw new Error('Incomplete DokiWorld loot chest locales.');
}
if (manifest.runtime?.protocol !== 'dokiworld.app' || manifest.runtime?.protocolVersion !== 2) {
  throw new Error('Unexpected DokiWorld loot chest runtime protocol.');
}
if (manifest.runtime?.input?.contract !== 'doki.game.chest-input' || manifest.runtime?.input?.version !== 2) {
  throw new Error('Unexpected DokiWorld loot chest input contract.');
}
if (manifest.runtime?.outputs?.length !== 1
  || manifest.runtime.outputs[0]?.contract !== 'doki.game.chest-result'
  || manifest.runtime.outputs[0]?.version !== 2
  || !Array.isArray(manifest.runtime.modules)) {
  throw new Error('Unexpected DokiWorld loot chest output contract or modules.');
}

await rm(dist, { recursive: true, force: true });
await build({
  configFile: false,
  root: resolve(appRoot, 'src'),
  base: './',
  logLevel: 'warn',
  resolve: {
    alias: {
      ...engineAliases(repoRoot),
      'dokiworlds-app-sdk': resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'src', 'index.js'),
    },
  },
  build: { outDir: dist, emptyOutDir: true, target: 'es2022', sourcemap: false },
});

await copyFile(manifestPath, resolve(dist, 'manifest.json'));
await exportAppDocumentation({ manifest, appRoot, distRoot: dist });
await exportAppAssetClosure({
  indexPath: resolve(appRoot, 'assets', 'index.json'),
  sourceRoot: appAssetRoot,
  distRoot: dist,
  publicPrefix: '/apps/game-loot-chest/assets/',
  outputPrefix: 'assets',
});

await access(resolve(dist, manifest.entry));
const listFiles = async (dir) => {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) out.push(...await listFiles(path));
    else out.push(path);
  }
  return out;
};
const sums = [];
for (const file of (await listFiles(dist)).sort()) {
  const rel = relative(dist, file).replaceAll('\\', '/');
  if (rel === 'SHA256SUMS.txt') continue;
  const digest = createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase();
  sums.push(`${digest}  ${rel}`);
}
await writeFile(resolve(dist, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
console.log(`Built game-loot-chest DokiWorld app to ${dist}`);
