// Read-only verifier for the actual portable package, not the source tree.
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_PATH, validateManifest, validateSdkSource } from './package-identity.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
if (process.argv.length > 2 && (process.argv.length !== 4 || process.argv[2] !== '--dist')) throw new Error('Usage: verify-dist.mjs [--dist <test-copy-directory>]');
const dist = process.argv[2] === '--dist' ? resolve(process.argv[3]) : resolve(appRoot, 'dist');
const artRoot = resolve(repoRoot, 'public', 'games', 'game-card-reveal', 'art');
const fail = (message) => { throw new Error(`Card reveal dist invalid: ${message}`); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const cleanPath = (path) => typeof path === 'string' && path.length > 0 && !path.includes('\\')
  && !path.startsWith('/') && !path.includes('://') && !path.split('/').some((part) => !part || part === '.' || part === '..');
const contained = (root, path) => { const rel = relative(root, path); return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('/') && !/^[A-Za-z]:/.test(rel); };
const rootFile = (name) => {
  requireValue(cleanPath(name), `unsafe package path ${String(name)}`);
  const path = resolve(dist, ...name.split('/'));
  requireValue(contained(dist, path), `package path escapes dist: ${name}`);
  return path;
};
const bytes = (name) => readFile(rootFile(name));
const utf8 = async (name) => (await bytes(name)).toString('utf8');
const json = async (name) => JSON.parse(await utf8(name));

async function listFiles(dir = dist) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    const info = await lstat(path);
    requireValue(!info.isSymbolicLink(), `symbolic link: ${path}`);
    if (info.isDirectory()) found.push(...await listFiles(path));
    else if (info.isFile()) found.push(relative(dist, path).replaceAll('\\', '/'));
    else fail(`unsupported dist entry: ${path}`);
  }
  return found.sort();
}

// Source paths are only read via fixed resolved paths, never through rootFile.
const sourcePackage = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf8'));
const sourceManifest = JSON.parse(await readFile(resolve(appRoot, 'manifest.json'), 'utf8'));
const manifest = validateManifest(await json('manifest.json'), sourcePackage.version);
validateManifest(sourceManifest, sourcePackage.version);
validateSdkSource(await readFile(resolve(appRoot, 'src', 'main.ts'), 'utf8'));
requireValue(JSON.stringify(manifest) === JSON.stringify(sourceManifest), 'manifest differs from source; rebuild');
const sdkPackage = JSON.parse(await readFile(resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'package.json'), 'utf8'));
requireValue(sdkPackage.version === '0.2.0', 'vendored SDK version must be 0.2.0');
requireValue(manifest.documentation['zh-cn'].path === DOCUMENT_PATH, 'documentation path mismatch');

const files = await listFiles();
for (const required of ['index.html', 'manifest.json', DOCUMENT_PATH, 'ASSET-CLOSURE.json', 'SHA256SUMS.txt']) {
  requireValue(files.includes(required), `missing package-root ${required} (or package wrapped in an extra directory)`);
}
requireValue(!files.some((name) => name.endsWith('.map') || /(^|\/)(?:src|tests|node_modules|\.env)(\/|$)/.test(name) || name === 'app.manifest.json'), 'source/test/dependency/map/legacy manifest leaked into dist');
requireValue(files.filter((name) => name === 'manifest.json').length === 1 && !files.some((name) => name.endsWith('/manifest.json')), 'manifest must be unique at package root');
const bundleTimes = await Promise.all(files.filter((name) => name.endsWith('.js') || name === 'index.html').map(async (name) => (await stat(rootFile(name))).mtimeMs));
const bundleTime = Math.max(...bundleTimes);
async function ensureSourceOlder(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) await ensureSourceOlder(path);
    else if (item.isFile() && /\.(?:ts|tsx|js|mjs|html)$/.test(item.name)) {
      requireValue((await stat(path)).mtimeMs <= bundleTime + 2000, `bundle input newer than dist: ${relative(repoRoot, path)}`);
    }
  }
}
await ensureSourceOlder(resolve(appRoot, 'src'));
await ensureSourceOlder(resolve(repoRoot, 'games', 'game-card-reveal'));
await ensureSourceOlder(resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'src'));
const docBytes = await bytes(DOCUMENT_PATH);
requireValue(docBytes.equals(await readFile(resolve(appRoot, DOCUMENT_PATH))), 'dist documentation differs from source; rebuild');
const doc = docBytes.toString('utf8');
requireValue(doc.includes('## 12. 上线前核对清单') && doc.includes('doki.game.card-reveal-input') && doc.includes('doki.game.card-reveal-result'), 'integration document incomplete');

const html = await utf8('index.html');
const references = [
  ...[...html.matchAll(/<script\b[^>]*?\bsrc="([^"]+)"/g)].map((match) => match[1]),
  ...[...html.matchAll(/<link\b[^>]*?\brel="stylesheet"[^>]*?\bhref="([^"]+)"/g)].map((match) => match[1]),
];
requireValue(references.some((name) => name.endsWith('.js')), 'HTML lacks bundled script');
for (const reference of references) {
  requireValue(reference.startsWith('./') && cleanPath(reference.slice(2)), `non-relative HTML reference: ${reference}`);
  requireValue(files.includes(reference.slice(2)), `HTML reference missing: ${reference}`);
}
requireValue(!html.includes('type="module" src="/'), 'absolute module script');

const forbidden = [
  [/\b[A-Za-z]:[\\/]/, 'local drive path'], [/\\\\[^\\\s]+\\(?:Users|Desktop|projects)\\/, 'UNC workspace path'], [/[Ff][Ii][Ll][Ee]:/, 'file URL'],
  [/(?:localhost|127\.0\.0\.1)/i, 'localhost'], [/(?:^|[^.\w])\/games\/game-card-reveal\/art\//m, 'source absolute asset root'],
  [/\/src\//, 'source URL'], [/docs\/design\//, 'design source reference'], [/sourceMappingURL|\.map(?:["'\s]|$)/, 'source map'],
  [/https?:\/\/(?:fonts\.|[^/]*cdn\.)/i, 'remote font/CDN'],
];
for (const name of files.filter((path) => /\.(?:js|css|html|json|md|txt)$/.test(path) && path !== 'SHA256SUMS.txt')) {
  const text = await utf8(name);
  for (const [pattern, label] of forbidden) requireValue(!pattern.test(text), `${name} contains ${label}`);
}

const report = await json('ASSET-CLOSURE.json');
const indexPath = 'games/game-card-reveal/art/index.json';
requireValue(report.portableIndex === indexPath, 'portable AssetIndex path mismatch');
requireValue(files.includes(indexPath), 'portable AssetIndex missing');
requireValue(Array.isArray(report.files) && report.assetFiles === report.files.filter((item) => item.kind === 'asset').length
  && report.extraFiles === report.files.filter((item) => item.kind === 'extra').length, 'asset closure counts mismatch');
const closurePaths = new Set();
for (const item of report.files) {
  requireValue(cleanPath(item.path) && !closurePaths.has(item.path) && files.includes(item.path), `closure file missing/duplicate/unsafe: ${item.path}`);
  closurePaths.add(item.path);
}
const portable = await json(indexPath);
requireValue(Array.isArray(portable.assets) && portable.assets.length === report.assetEntries, 'portable index entry count mismatch');
const filled = portable.assets.filter((item) => item.status === 'filled' && typeof item.path === 'string');
requireValue(filled.length === report.assetFiles, 'portable filled asset count mismatch');
for (const item of filled) {
  requireValue(cleanPath(item.path) && item.path.startsWith('games/game-card-reveal/art/') && closurePaths.has(item.path), `unsafe/unclosed asset ${item.id}`);
  const source = resolve(artRoot, item.path.slice('games/game-card-reveal/art/'.length));
  requireValue(contained(artRoot, source), `asset source escapes art root: ${item.id}`);
  requireValue((await bytes(item.path)).equals(await readFile(source)), `asset ${item.id} differs from source; rebuild`);
}

const lines = (await utf8('SHA256SUMS.txt')).trimEnd().split('\n');
const expected = files.filter((name) => name !== 'SHA256SUMS.txt');
requireValue(lines.length === expected.length, 'SHA256SUMS file count mismatch');
const signed = new Set();
for (let i = 0; i < lines.length; i++) {
  const match = /^([0-9A-F]{64})  ([^\r\n]+)$/.exec(lines[i]);
  requireValue(!!match && cleanPath(match[2]), `malformed SHA256SUMS line ${i + 1}`);
  const name = match[2];
  requireValue(!signed.has(name) && name === expected[i], `SHA256SUMS missing/extra/duplicate/unsorted: ${name}`);
  signed.add(name);
  requireValue(createHash('sha256').update(await bytes(name)).digest('hex').toUpperCase() === match[1], `SHA mismatch: ${name}`);
}
console.log(`VERIFY: PASS — ${files.length} package files, ${report.assetFiles} art files, ${lines.length} SHA entries; source/manifest/docs/assets fresh.`);
