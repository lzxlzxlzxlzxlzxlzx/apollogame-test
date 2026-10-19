import { createHash } from 'node:crypto';
import { access, copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { engineAliases } from '../../../scripts/engine-aliases.mjs';
import { exportAppDocumentation } from '../../../scripts/app-documentation-closure.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dist = resolve(appRoot, 'dist');
const manifestPath = resolve(appRoot, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 3 || manifest.id !== 'game-clue-investigation'
  || manifest.version !== '0.2.1'
  || manifest.runtime?.protocol !== 'dokiworld.app' || manifest.runtime?.protocolVersion !== 2
  || manifest.documentation?.['zh-cn']?.path !== 'docs/integration.zh-CN.md') {
  throw new Error('Unexpected formal investigation manifest identity, protocol, version, or documentation path.');
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
await access(resolve(dist, manifest.entry));

async function listFiles(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, item.name);
    if (item.isDirectory()) files.push(...await listFiles(file));
    else if (item.isFile()) files.push(file);
  }
  return files;
}
const sums = [];
for (const file of (await listFiles(dist)).sort()) {
  const path = relative(dist, file).replaceAll('\\', '/');
  if (path === 'SHA256SUMS.txt') continue;
  sums.push(`${createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase()}  ${path}`);
}
await writeFile(resolve(dist, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
console.log(`Built DokiWorld investigation app to ${dist}`);
