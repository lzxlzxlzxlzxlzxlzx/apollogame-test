import { createHash } from 'node:crypto';
import { access, copyFile, lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { engineAliases } from '../../../scripts/engine-aliases.mjs';
import { exportAppDocumentation } from '../../../scripts/app-documentation-closure.mjs';
import { exportAppAssetClosure, rewritePortableRuntimeBases } from '../../../scripts/app-asset-closure.mjs';
import { validateManifest, validateSdkSource } from './package-identity.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dist = resolve(appRoot, 'dist');
const artRoot = resolve(repoRoot, 'public', 'games', 'game-card-reveal', 'art');
if (dirname(dist) !== appRoot || dist === appRoot || !dist.startsWith(`${appRoot}${sep}`)) throw new Error('Unsafe dist target');
const manifestBytes = await readFile(resolve(appRoot, 'manifest.json'));
const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')), JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf8')).version);
validateSdkSource(await readFile(resolve(appRoot, 'src', 'main.ts'), 'utf8'));
const sdkPackage = JSON.parse(await readFile(resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'package.json'), 'utf8'));
if (sdkPackage.version !== '0.2.0') throw new Error('Vendored SDK version must be 0.2.0');

// Never clean until the exact App-local target and source identity are checked.
await rm(dist, { recursive: true, force: true });
await build({
  configFile: false,
  root: resolve(appRoot, 'src'),
  base: './',
  logLevel: 'warn',
  resolve: { alias: { ...engineAliases(repoRoot), 'dokiworlds-app-sdk': resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'src', 'index.js') } },
  build: { outDir: dist, emptyOutDir: true, target: 'es2022', sourcemap: false },
});
await copyFile(resolve(appRoot, 'manifest.json'), resolve(dist, 'manifest.json'));
await exportAppDocumentation({ manifest, appRoot, distRoot: dist });
const closure = await exportAppAssetClosure({
  indexPath: resolve(artRoot, 'index.json'), sourceRoot: artRoot, distRoot: dist,
  publicPrefix: '/games/game-card-reveal/art/', outputPrefix: 'games/game-card-reveal/art',
});
// loadGameArtInto creates /games/<slug>/art/index.json dynamically, so rewrite its
// shared /games/ base; the portable index's filled paths are already relative.
const rewritten = await rewritePortableRuntimeBases(dist, { '/games/': 'games/' });
await access(resolve(dist, manifest.entry));
for (const item of Object.values(manifest.documentation)) await access(resolve(dist, item.path));
for (const item of closure.files) await access(resolve(dist, item.path));

async function listFiles(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Symlink in dist: ${path}`);
    if (info.isDirectory()) found.push(...await listFiles(path));
    else if (info.isFile()) found.push(path);
  }
  return found;
}
const sums = [];
for (const path of (await listFiles(dist)).sort()) {
  const name = relative(dist, path).replaceAll('\\', '/');
  if (name === 'SHA256SUMS.txt') continue;
  sums.push(`${createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase()}  ${name}`);
}
await writeFile(resolve(dist, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
console.log(`Built ${manifest.id}: ${sums.length} signed files; ${closure.assetFiles} art bytes; ${rewritten['/games/']} portable base rewrite(s).`);
