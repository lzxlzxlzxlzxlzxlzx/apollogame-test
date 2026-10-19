import { createHash } from 'node:crypto';
import { access, copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { engineAliases } from '../../../scripts/engine-aliases.mjs';
import { exportAppAssetClosure, rewritePortableRuntimeBases } from '../../../scripts/app-asset-closure.mjs';
import { exportAppDocumentation } from '../../../scripts/app-documentation-closure.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dist = resolve(appRoot, 'dist');
const manifest = JSON.parse(await readFile(resolve(appRoot, 'manifest.json'), 'utf8'));
await rm(dist, { recursive: true, force: true });
await build({ configFile: false, root: resolve(appRoot, 'src'), base: './', logLevel: 'warn', resolve: { alias: { ...engineAliases(repoRoot), 'dokiworlds-app-sdk': resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'src', 'index.js') } }, build: { outDir: dist, emptyOutDir: true, target: 'es2022', sourcemap: false } });
await copyFile(resolve(appRoot, 'manifest.json'), resolve(dist, 'manifest.json'));
await exportAppDocumentation({ manifest, appRoot, distRoot: dist });
await exportAppAssetClosure({ indexPath: resolve(repoRoot, 'public', 'games', 'game-potion-brewing', 'art', 'index.json'), sourceRoot: resolve(repoRoot, 'public', 'games', 'game-potion-brewing', 'art'), distRoot: dist, publicPrefix: '/games/game-potion-brewing/art/', outputPrefix: 'games/game-potion-brewing/art', extraTrees: [{ sourceRoot: resolve(repoRoot, 'public', 'ui-fonts'), outputPrefix: 'ui-fonts' }] });
await rewritePortableRuntimeBases(dist, { '/games/': 'games/', '/ui-fonts/': 'ui-fonts/' });
await access(resolve(dist, 'index.html'));
async function files(dir) { const out = []; for (const entry of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, entry.name); if (entry.isDirectory()) out.push(...await files(path)); else out.push(path); } return out; }
const sums = [];
for (const file of (await files(dist)).sort()) { const path = relative(dist, file).replaceAll('\\', '/'); if (path === 'SHA256SUMS.txt') continue; sums.push(`${createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase()}  ${path}`); }
await writeFile(resolve(dist, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
