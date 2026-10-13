import { createHash } from 'node:crypto';
import { copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { engineAliases } from '../../../scripts/engine-aliases.mjs';
import { exportAppDocumentation } from '../../../scripts/app-documentation-closure.mjs';
import { exportAppAssetClosure, rewritePortableRuntimeBases } from '../../../scripts/app-asset-closure.mjs';
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'); const repoRoot = resolve(appRoot, '..', '..'); const dist = resolve(appRoot, 'dist');
const manifest = JSON.parse(await readFile(resolve(appRoot, 'manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 3 || manifest.id !== 'game-lockpick' || manifest.runtime?.input?.contract !== 'doki.game.lockpick-input' || manifest.runtime?.outputs?.[0]?.contract !== 'doki.game.lockpick-result') throw new Error('Invalid game-lockpick manifest.');
await rm(dist, { recursive: true, force: true });
await build({ configFile: false, root: resolve(appRoot, 'src'), base: './', logLevel: 'warn', resolve: { alias: { ...engineAliases(repoRoot), 'dokiworlds-app-sdk': resolve(repoRoot, 'vendor/dokiworlds-app-sdk/src/index.js') } }, build: { outDir: dist, emptyOutDir: true, target: 'es2022' } });
await copyFile(resolve(appRoot, 'manifest.json'), resolve(dist, 'manifest.json')); await exportAppDocumentation({ manifest, appRoot, distRoot: dist });
await exportAppAssetClosure({ indexPath: resolve(repoRoot, 'public/games/game-lockpick/art/index.json'), sourceRoot: resolve(repoRoot, 'public/games/game-lockpick/art'), distRoot: dist, publicPrefix: '/games/game-lockpick/art/', outputPrefix: 'art' });
await rewritePortableRuntimeBases(dist, { '/games/game-lockpick/art/': './art/' });
async function files(dir) { const out = []; for (const item of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, item.name); if (item.isDirectory()) out.push(...await files(path)); else out.push(path); } return out; }
const sums = []; for (const file of (await files(dist)).sort()) { const rel = relative(dist, file).replaceAll('\\', '/'); if (rel !== 'SHA256SUMS.txt') sums.push(`${createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase()}  ${rel}`); }
await writeFile(resolve(dist, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
