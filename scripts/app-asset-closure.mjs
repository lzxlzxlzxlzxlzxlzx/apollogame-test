// Deterministic DokiWorld App asset closure exporter.
//
// Input: one game's local AssetIndex + optional explicit runtime trees (fonts, etc.).
// Output: copied bytes, a portable relative-path AssetIndex, and a machine-readable
// closure report. This is build-time Node glue; runtime AssetManager stays browser-only.
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const MATERIAL_KEYS = ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap', 'emissiveMap', 'ormMap'];
const LOCAL_ABSOLUTE = /^(?:[a-zA-Z]:[\\/]|\\\\|file:|\/(?:Users|home|var|tmp|private|opt|mnt)\/)/;

function invariant(condition, message) {
  if (!condition) throw new Error(`App asset closure: ${message}`);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeRelativePath(value, label) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  invariant(!value.includes('\\') && !value.includes('?') && !value.includes('#'), `${label} must be a plain POSIX path`);
  invariant(!value.startsWith('/') && !value.split('/').some((part) => part === '' || part === '.' || part === '..'), `${label} escapes its root`);
  return value;
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function portableJson(value, key = '') {
  if (typeof value === 'string') {
    if ((key === 'originalPath' || key === 'restoredFrom' || key.toLowerCase().endsWith('path')) && LOCAL_ABSOLUTE.test(value)) return undefined;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => portableJson(item)).filter((item) => item !== undefined);
  if (!record(value)) return value;
  const out = {};
  for (const [childKey, child] of Object.entries(value)) {
    const portable = portableJson(child, childKey);
    if (portable !== undefined) out[childKey] = portable;
  }
  return out;
}

export function planAppAssetClosure(rawIndex, options) {
  invariant(record(rawIndex) && Number.isInteger(rawIndex.version) && Array.isArray(rawIndex.assets), 'invalid AssetIndex root');
  const publicPrefix = options?.publicPrefix;
  const outputPrefix = safeRelativePath(options?.outputPrefix, 'outputPrefix').replace(/\/$/, '');
  invariant(typeof publicPrefix === 'string' && publicPrefix.startsWith('/') && publicPrefix.endsWith('/'), 'publicPrefix must start and end with /');

  const ids = new Set();
  const outputs = new Set();
  const files = [];
  const portableAssets = [];
  for (const asset of rawIndex.assets) {
    invariant(record(asset) && typeof asset.id === 'string' && asset.id.length > 0, 'every asset needs an id');
    invariant(!ids.has(asset.id), `duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    invariant(typeof asset.type === 'string' && typeof asset.status === 'string', `asset ${asset.id} lacks type/status`);

    const portable = portableJson(asset);
    if (asset.status === 'filled' && typeof asset.path === 'string') {
      invariant(!/^https?:\/\//i.test(asset.path), `remote runtime asset is forbidden: ${asset.id}`);
      invariant(asset.path.startsWith(publicPrefix), `asset ${asset.id} path must start with ${publicPrefix}`);
      const sourceRelative = safeRelativePath(asset.path.slice(publicPrefix.length), `asset ${asset.id} path`);
      const outputRelative = `${outputPrefix}/${sourceRelative}`;
      invariant(!outputs.has(outputRelative), `duplicate output path ${outputRelative}`);
      outputs.add(outputRelative);
      files.push({ id: asset.id, sourceRelative, outputRelative });
      portable.path = outputRelative;
    }
    portableAssets.push(portable);
  }

  for (const asset of rawIndex.assets) {
    if (asset.type !== 'material' || asset.status !== 'filled' || !record(asset.spec)) continue;
    for (const field of MATERIAL_KEYS) {
      const dependency = asset.spec[field];
      if (dependency !== undefined) invariant(typeof dependency === 'string' && ids.has(dependency), `material ${asset.id}.${field} has dangling key ${String(dependency)}`);
    }
  }

  return Object.freeze({
    index: { ...portableJson(rawIndex), assets: portableAssets },
    files: Object.freeze(files),
    outputPrefix,
  });
}

async function copyTree(sourceRoot, distRoot, outputPrefix, copied) {
  const prefix = safeRelativePath(outputPrefix, 'extra tree outputPrefix').replace(/\/$/, '');
  const walk = async (sourceDir, relativeDir = '') => {
    for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
      invariant(!entry.isSymbolicLink(), `symbolic links are forbidden in extra tree: ${entry.name}`);
      const source = resolve(sourceDir, entry.name);
      const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(source, rel);
      else if (entry.isFile()) {
        const outputRelative = `${prefix}/${safeRelativePath(rel.replaceAll('\\', '/'), 'extra tree file')}`;
        const target = resolve(distRoot, ...outputRelative.split('/'));
        invariant(inside(distRoot, target), `extra tree output escapes dist: ${outputRelative}`);
        await mkdir(resolve(target, '..'), { recursive: true });
        await copyFile(source, target);
        copied.push({ kind: 'extra', source, outputRelative });
      }
    }
  };
  await walk(sourceRoot);
}

export async function exportAppAssetClosure({
  indexPath,
  sourceRoot,
  distRoot,
  publicPrefix,
  outputPrefix,
  extraTrees = [],
  reportName = 'ASSET-CLOSURE.json',
}) {
  const roots = {
    source: resolve(sourceRoot),
    dist: resolve(distRoot),
  };
  const rawIndex = JSON.parse(await readFile(indexPath, 'utf8'));
  const plan = planAppAssetClosure(rawIndex, { publicPrefix, outputPrefix });
  const copied = [];

  for (const file of plan.files) {
    const source = resolve(roots.source, ...file.sourceRelative.split('/'));
    const target = resolve(roots.dist, ...file.outputRelative.split('/'));
    invariant(inside(roots.source, source), `source escapes art root: ${file.sourceRelative}`);
    invariant(inside(roots.dist, target), `output escapes dist: ${file.outputRelative}`);
    const info = await lstat(source).catch(() => null);
    invariant(info?.isFile(), `missing asset file ${file.sourceRelative}`);
    invariant(!info.isSymbolicLink(), `symbolic-link asset is forbidden: ${file.sourceRelative}`);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(source, target);
    copied.push({ kind: 'asset', id: file.id, source, outputRelative: file.outputRelative });
  }

  const portableIndexPath = resolve(roots.dist, ...plan.outputPrefix.split('/'), 'index.json');
  invariant(inside(roots.dist, portableIndexPath), 'portable index escapes dist');
  await mkdir(resolve(portableIndexPath, '..'), { recursive: true });
  await writeFile(portableIndexPath, `${JSON.stringify(plan.index, null, 2)}\n`);

  for (const tree of extraTrees) {
    await copyTree(resolve(tree.sourceRoot), roots.dist, tree.outputPrefix, copied);
  }

  const report = {
    version: 1,
    assetEntries: plan.index.assets.length,
    assetFiles: plan.files.length,
    extraFiles: copied.filter((entry) => entry.kind === 'extra').length,
    portableIndex: `${plan.outputPrefix}/index.json`,
    files: copied.map(({ kind, id, outputRelative }) => ({ kind, ...(id ? { id } : {}), path: outputRelative })).sort((a, b) => a.path.localeCompare(b.path)),
  };
  const reportRelative = safeRelativePath(reportName, 'reportName');
  const reportPath = resolve(roots.dist, ...reportRelative.split('/'));
  invariant(inside(roots.dist, reportPath), 'closure report escapes dist');
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return Object.freeze(report);
}

export async function rewritePortableRuntimeBases(distRoot, replacements) {
  const root = resolve(distRoot);
  const assetsDir = resolve(root, 'assets');
  const rewritten = Object.fromEntries(Object.keys(replacements).map((key) => [key, 0]));
  for (const file of await readdir(assetsDir)) {
    if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
    const path = resolve(assetsDir, file);
    let code = await readFile(path, 'utf8');
    for (const [from, to] of Object.entries(replacements)) {
      invariant(typeof from === 'string' && from.startsWith('/') && typeof to === 'string' && !to.startsWith('/'), 'runtime base rewrites must be absolute → relative');
      rewritten[from] += code.split(from).length - 1;
      code = code.replaceAll(from, to);
      invariant(!code.includes(from), `absolute runtime base remains in ${file}: ${from}`);
    }
    await writeFile(path, code);
  }
  for (const [from, count] of Object.entries(rewritten)) invariant(count > 0, `runtime rewrite anchor not found: ${from}`);
  return Object.freeze(rewritten);
}

