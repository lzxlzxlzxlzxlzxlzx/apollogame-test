// Life 素材候选批次：严格 AssetSlotBrief → 本地候选人审 / 2D AI pending。
// 用法：npm run life-asset-generate -- <asset-slots.json> [--provider <qwen|gpt-image>] [--generate [--real-provider]]
//       [--list-local | --approve-local <slotId> --reviewed-by <human> | --reject-local <slotId>]
// 默认只输出 plan、零写入；显式 --generate 才写待审区，显式 approve 才 vendor/register 正式本地素材。

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLifeAssetGenerationBatch,
  parseAssetIndex,
  projectRecords,
  stableAssetSlotJson,
} from '../src/assets/index.ts';
import {
  ADAPTERS,
  buildEntry,
  locations,
  resizePngExact,
  stagePendingAsset,
  validateTextureCandidate,
} from './ai-gen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIFE_PENDING_SCHEMA = 'zerocraft.life-asset-pending.v1';
export const LIFE_LOCAL_REVIEW_SCHEMA = 'zerocraft.life-local-asset-review.v1';
const LOCAL_SOURCE = 'project';
const SAFE_TEXTURE_EXTENSIONS = new Set(['.png']);

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64) || 'asset';
const stableFileStem = (value) => `${slug(value)}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 12)}`;
const bySlot = (a, b) => String(a.slotId).localeCompare(String(b.slotId));
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value, keys) => isRecord(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const safeGameId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(value);

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function localReviewFile(root, game) {
  return join(locations(root, game).finalDir, 'local', 'pending.json');
}

function localReviewItem(game, item, contentFingerprint = null) {
  return {
    schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA,
    game,
    slotId: item.slotId,
    assetKey: item.assetKey,
    reviewStatus: 'pending-human-review',
    candidate: {
      source: item.candidate.source,
      id: item.candidate.id,
      score: item.candidate.score,
      sourceFingerprint: item.candidate.sourceFingerprint,
      contentFingerprint,
    },
    spec: item.spec,
    anchor: item.anchor,
    consumers: item.consumers,
    briefFingerprint: item.briefFingerprint,
  };
}

export function readLifeLocalReviews({ root = ROOT, game }) {
  if (!safeGameId(game)) return { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game, pending: [], invalid: true };
  const file = localReviewFile(root, game);
  if (!existsSync(file)) return { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game, pending: [] };
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    const slots = new Set();
    if (!exactKeys(value, ['version', 'schemaVersion', 'game', 'pending']) || value.version !== 1 || value.schemaVersion !== LIFE_LOCAL_REVIEW_SCHEMA
      || value.game !== game || !Array.isArray(value.pending)) {
      return { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game, pending: [], invalid: true };
    }
    for (const item of value.pending) {
      if (!exactKeys(item, ['schemaVersion', 'game', 'slotId', 'assetKey', 'reviewStatus', 'candidate', 'spec', 'anchor', 'consumers', 'briefFingerprint'])
        || !exactKeys(item.candidate, ['source', 'id', 'score', 'sourceFingerprint', 'contentFingerprint'])
        || typeof item.slotId !== 'string' || slots.has(item.slotId)) {
        return { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game, pending: [], invalid: true };
      }
      slots.add(item.slotId);
    }
    return value;
  } catch {
    return { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game, pending: [], invalid: true };
  }
}

export function stageLifeLocalReviews({ root = ROOT, batch }) {
  if (!batch?.valid || !safeGameId(batch.game)) return { ok: false, error: 'local review batch is invalid or has an unsafe game id' };
  const pending = batch.items.filter((item) => item.action === 'local-review')
    .map((item) => {
      let contentFingerprint = null;
      if (item.candidate.source === LOCAL_SOURCE) {
        const trusted = readTrustedProjectIndex(root);
        const source = trusted.ok ? trusted.index.assets.find((entry) => entry.id === item.candidate.id) : undefined;
        const sourceFile = source ? safeTrustedSource(root, source.path) : undefined;
        if (sourceFile) {
          try { contentFingerprint = `sha256:${createHash('sha256').update(readFileSync(sourceFile)).digest('hex')}`; } catch { contentFingerprint = null; }
        }
      }
      return localReviewItem(batch.game, item, contentFingerprint);
    }).sort(bySlot);
  const manifest = { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game: batch.game, pending };
  writeJson(localReviewFile(root, batch.game), manifest);
  return { ok: true, game: batch.game, pending };
}

function safeTrustedSource(root, sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath || isAbsolute(sourcePath)
    || /^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(sourcePath) || sourcePath.includes('\0')) return undefined;
  const assetsRoot = resolve(root, 'assets');
  const sourceFile = resolve(assetsRoot, sourcePath);
  const lexical = relative(assetsRoot, sourceFile);
  if (!lexical || lexical.startsWith('..') || isAbsolute(lexical) || !existsSync(sourceFile)) return undefined;
  try {
    const realRoot = realpathSync(assetsRoot);
    const realSource = realpathSync(sourceFile);
    const physical = relative(realRoot, realSource);
    if (!physical || physical.startsWith('..') || isAbsolute(physical)) return undefined;
    return realSource;
  } catch {
    return undefined;
  }
}

function readTrustedProjectIndex(root) {
  const file = join(root, 'assets', 'index.json');
  if (!existsSync(file)) return { ok: false, error: 'trusted project asset index is missing' };
  try {
    return { ok: true, index: parseAssetIndex(JSON.parse(readFileSync(file, 'utf8'))) };
  } catch (error) {
    return { ok: false, error: `trusted project asset index is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function readGameIndex(file) {
  if (!existsSync(file)) return { ok: true, index: { version: 1, assets: [] } };
  try {
    return { ok: true, index: parseAssetIndex(JSON.parse(readFileSync(file, 'utf8'))) };
  } catch (error) {
    return { ok: false, error: `game AssetIndex is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function bindingFor(game, item) {
  return {
    schemaVersion: 'zerocraft.life-asset-slot-binding.v1',
    game,
    slotId: item.slotId,
    assetKey: item.assetKey,
    briefFingerprint: item.briefFingerprint,
  };
}

/** Local human-review gate. The pending item is only a safe reference; approval always rebuilds it from assets/index.json. */
export function reviewLifeLocalCandidate({
  root = ROOT,
  game,
  slotId,
  action,
  assetSlotManifest = undefined,
  reviewedBy = '',
}) {
  if (!safeGameId(game)) return { ok: false, error: 'local review game id is unsafe' };
  const queue = readLifeLocalReviews({ root, game });
  if (queue.invalid) return { ok: false, error: 'local review manifest is invalid' };
  const at = queue.pending.findIndex((item) => item?.slotId === slotId);
  if (at < 0) return { ok: false, error: `local review item does not exist: ${slotId}` };
  if (action === 'reject') {
    queue.pending.splice(at, 1);
    writeJson(localReviewFile(root, game), { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game, pending: queue.pending.sort(bySlot) });
    return { ok: true, action: 'reject', slotId };
  }
  if (action !== 'approve') return { ok: false, error: `unknown local review action: ${action}` };
  if (assetSlotManifest === undefined) return { ok: false, error: 'local asset approval requires the current AssetSlot manifest' };
  if (typeof reviewedBy !== 'string' || !reviewedBy.trim()) return { ok: false, error: 'local asset approval requires reviewedBy' };
  if (queue.pending[at]?.candidate?.source !== LOCAL_SOURCE) {
    return { ok: false, error: `unsupported local candidate source: ${String(queue.pending[at]?.candidate?.source)}` };
  }

  const trusted = readTrustedProjectIndex(root);
  if (!trusted.ok) return trusted;
  const records = projectRecords(trusted.index, '');
  const batch = buildLifeAssetGenerationBatch(assetSlotManifest, records);
  if (!batch.valid || batch.game !== game) return { ok: false, error: 'local review binding mismatch: current manifest/batch is invalid or cross-game' };
  const expected = batch.items.find((item) => item.slotId === slotId);
  if (!expected || expected.action !== 'local-review') return { ok: false, error: 'local review binding mismatch: slot no longer resolves to a local candidate' };
  const pending = queue.pending[at];
  if (expected.candidate.source !== LOCAL_SOURCE) return { ok: false, error: `unsupported local candidate source: ${expected.candidate.source}` };
  const source = trusted.index.assets.find((entry) => entry.id === expected.candidate.id);
  if (!source || source.status !== 'filled' || source.type !== 'texture') return { ok: false, error: 'trusted local candidate is missing or not a filled texture' };
  if (!source.license || source.style !== expected.spec.styleId) return { ok: false, error: 'trusted local candidate license/style mismatch' };
  const sourceFile = safeTrustedSource(root, source.path);
  if (!sourceFile) return { ok: false, error: 'trusted local candidate path is missing, outside assets/, or unreadable' };
  const extension = extname(source.path).toLowerCase();
  if (!SAFE_TEXTURE_EXTENSIONS.has(extension)) return { ok: false, error: `unsupported local texture extension: ${extension || '(none)'}` };

  let bytes;
  try { bytes = readFileSync(sourceFile); } catch { return { ok: false, error: 'trusted local candidate file cannot be read' }; }
  const sourceContentFingerprint = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const expectedPending = localReviewItem(game, expected, sourceContentFingerprint);
  if (stableAssetSlotJson(pending) !== stableAssetSlotJson(expectedPending)) {
    return { ok: false, error: 'local review binding mismatch: pending item does not match the trusted index, source bytes, and current manifest' };
  }
  const loc = locations(root, game);
  // slug() is intentionally lossy (for example hero.one and hero-one collide), so retain a stable identity suffix.
  const finalRel = `vendor/project/${stableFileStem(slotId)}${extension}`;
  const servedPath = loc.finalServed(finalRel);
  const spec = {
    ...(source.spec ?? {}),
    width: expected.spec.outputPx.width,
    height: expected.spec.outputPx.height,
    usage: expected.spec.usage,
    colorSpace: expected.spec.colorSpace,
    transparent: expected.spec.alpha === 'transparent',
    sampling: expected.spec.sampling,
  };
  const entry = {
    id: expected.assetKey,
    type: 'texture',
    description: source.description,
    status: 'filled',
    path: servedPath,
    spec,
    ...(source.category === undefined ? {} : { category: source.category }),
    ...(source.tags === undefined ? {} : { tags: source.tags }),
    style: source.style,
    license: source.license,
    source: source.source ?? 'shared-library',
    provenance: {
      ...(source.provenance ?? {}),
      vendoredFrom: { library: LOCAL_SOURCE, id: source.id },
      binding: bindingFor(game, expected),
      reviewedBy: reviewedBy.trim(),
      approvedAt: new Date().toISOString(),
      contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    },
  };
  const contractIssues = validateTextureCandidate(entry, bytes);
  if (contractIssues.length > 0) return { ok: false, error: `local asset bytes do not match slot spec: ${contractIssues.join('/')}` };
  const current = readGameIndex(loc.indexFile);
  if (!current.ok) return current;
  const byId = new Map(current.index.assets.map((value) => [value.id, value]));
  byId.set(entry.id, entry);
  const nextIndex = { version: current.index.version, assets: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  try { parseAssetIndex(nextIndex); } catch (error) {
    return { ok: false, error: `vendored AssetIndex entry is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }

  const finalFile = join(loc.finalDir, finalRel);
  mkdirSync(dirname(finalFile), { recursive: true });
  writeFileSync(finalFile, bytes);
  writeJson(loc.indexFile, nextIndex);
  queue.pending.splice(at, 1);
  writeJson(localReviewFile(root, game), { version: 1, schemaVersion: LIFE_LOCAL_REVIEW_SCHEMA, game, pending: queue.pending.sort(bySlot) });
  return { ok: true, action: 'approve', slotId, id: entry.id, servedPath, source: { kind: LOCAL_SOURCE, id: source.id } };
}

function workflowFor(game, item) {
  return {
    kind: 'life-asset-slot',
    schemaVersion: LIFE_PENDING_SCHEMA,
    game,
    slotId: item.slotId,
    assetKey: item.assetKey,
    briefFingerprint: item.briefFingerprint,
    provider: item.provider,
    spec: {
      usage: item.usage,
      colorSpace: item.colorSpace,
      outputPx: { width: item.outputPx.width, height: item.outputPx.height },
      alpha: item.alpha,
      sampling: item.sampling,
    },
    anchor: { x: item.anchor.x, y: item.anchor.y },
  };
}

/**
 * Executes only verified ai-generate items. All bytes are generated and checked before the first pending write,
 * so provider/spec failure cannot leave a partially staged batch. Local candidates become safe-reference review items;
 * they still do not copy files or touch AssetIndex until an explicit approve action.
 */
export async function executeLifeAssetGenerationBatch({
  root = ROOT,
  manifest,
  records = [],
  mock = true,
  allowRealProvider = false,
  provider = 'qwen',
  providersBySlot = undefined,
  env = process.env,
  generatedAt = new Date().toISOString(),
} = {}) {
  const batch = buildLifeAssetGenerationBatch(manifest, records, {
    provider,
    ...(providersBySlot === undefined ? {} : { providersBySlot }),
  });
  if (!batch.valid) return { ok: false, batch, results: [] };
  if (!safeGameId(batch.game)) return { ok: false, batch, results: [], error: 'local review batch has an unsafe game id' };
  if (!mock && !allowRealProvider) return { ok: false, batch, results: [], error: 'real provider requires explicit allowRealProvider' };
  if (!mock) {
    for (const providerId of [...new Set(batch.items.filter((item) => item.action === 'ai-generate').map((item) => item.provider))].sort()) {
      const adapter = ADAPTERS[providerId];
      if (!adapter) return { ok: false, batch, results: [], error: `unsupported provider in verified batch: ${providerId}` };
      if (!env[adapter.envKey]) return { ok: false, batch, results: [], error: `real provider requires ${adapter.envKey}` };
    }
  }

  const prepared = [];
  for (const item of batch.items) {
    if (item.action !== 'ai-generate') continue;
    const adapter = ADAPTERS[item.provider];
    if (!adapter) return { ok: false, batch, results: [], error: `unsupported provider in verified batch: ${item.provider}` };
    let generated;
    let candidateBytes;
    try {
      generated = await adapter.generate(item.prompt, {
        mock,
        allowRealProvider,
        apiKey: env[adapter.envKey],
        width: item.outputPx.width,
        height: item.outputPx.height,
        alpha: item.alpha,
      });
      candidateBytes = resizePngExact(generated.buffer, item.outputPx.width, item.outputPx.height);
    } catch (error) {
      return { ok: false, batch, results: [], error: `${item.provider} failed for ${item.slotId}: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!mock && generated.mock) return { ok: false, batch, results: [], error: `provider unexpectedly returned mock for ${item.slotId}` };
    const finalRel = `ai/${item.provider}/${slug(item.slotId)}.png`;
    const loc = locations(root, batch.game);
    const spec = {
      format: 'png',
      width: item.outputPx.width,
      height: item.outputPx.height,
      usage: item.usage,
      colorSpace: item.colorSpace,
      transparent: item.alpha === 'transparent',
      sampling: item.sampling,
    };
    const entry = buildEntry({
      adapter: item.provider,
      prompt: item.prompt,
      id: item.assetKey,
      kind: 'texture',
      spec,
      model: generated.model,
      license: adapter.license,
      mock: generated.mock,
      servedPath: loc.finalServed(finalRel),
      at: generatedAt,
    });
    const issues = validateTextureCandidate(entry, candidateBytes);
    if (issues.length > 0) return { ok: false, batch, results: [], error: `candidate contract mismatch for ${item.slotId}: ${issues.join('/')}` };
    prepared.push({ item, entry, buffer: candidateBytes, finalRel, pendingFile: `${item.provider}-${slug(item.slotId)}.png` });
  }

  const localReview = stageLifeLocalReviews({ root, batch });
  if (!localReview.ok) return { ok: false, batch, results: [], error: localReview.error };
  const results = batch.items.filter((item) => item.action === 'local-review').map((item) => ({
    slotId: item.slotId,
    assetKey: item.assetKey,
    status: 'pending-human-review',
    source: 'local',
    candidate: {
      source: item.candidate.source,
      id: item.candidate.id,
      score: item.candidate.score,
      sourceFingerprint: item.candidate.sourceFingerprint,
    },
  }));
  for (const value of prepared) {
    stagePendingAsset({
      root,
      game: batch.game,
      entry: value.entry,
      buffer: value.buffer,
      finalRel: value.finalRel,
      pendingFile: value.pendingFile,
      workflow: workflowFor(batch.game, value.item),
    });
    results.push({ slotId: value.item.slotId, assetKey: value.item.assetKey, status: 'pending-human-review', source: 'ai' });
  }
  results.sort((a, b) => a.slotId.localeCompare(b.slotId));
  return { ok: true, batch, results };
}

export function readLifeAssetLibraryRecords(indexFiles) {
  return indexFiles.flatMap((file) => projectRecords(parseAssetIndex(JSON.parse(readFileSync(file, 'utf8'))), ''));
}

function valuesAfter(argv, flag) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1]);
  return out;
}

export async function run(argv) {
  const valuedFlags = new Set(['--library-index', '--target-root', '--provider', '--approve-local', '--reject-local', '--reviewed-by']);
  for (let index = 0; index < argv.length; index++) {
    if (valuedFlags.has(argv[index]) && (!argv[index + 1] || argv[index + 1].startsWith('--'))) {
      throw new Error(`${argv[index]} requires a value`);
    }
  }
  const manifestArg = argv.find((value, index) => !value.startsWith('--') && !valuedFlags.has(argv[index - 1]));
  if (!manifestArg) throw new Error('life-asset-generate: missing <asset-slots.json>');
  const manifestFile = resolve(manifestArg);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const targetValue = valuesAfter(argv, '--target-root')[0];
  const targetRoot = targetValue ? resolve(targetValue) : ROOT;
  if (targetValue && (!isAbsolute(targetValue) || !existsSync(targetRoot))) throw new Error('--target-root must be an existing absolute directory');
  const explicitIndexes = valuesAfter(argv, '--library-index').map(resolve);
  const defaultIndex = join(targetRoot, 'assets', 'index.json');
  const indexFiles = explicitIndexes.length > 0 ? explicitIndexes : (existsSync(defaultIndex) ? [defaultIndex] : []);
  const records = readLifeAssetLibraryRecords(indexFiles);
  const provider = valuesAfter(argv, '--provider')[0] ?? 'qwen';
  const batch = buildLifeAssetGenerationBatch(manifest, records, { provider });
  const approveSlot = valuesAfter(argv, '--approve-local')[0];
  const rejectSlot = valuesAfter(argv, '--reject-local')[0];
  const reviewedBy = valuesAfter(argv, '--reviewed-by')[0] ?? '';
  if (argv.includes('--reviewed-by') && approveSlot === undefined) throw new Error('--reviewed-by is only valid with --approve-local');
  const actions = [argv.includes('--generate'), argv.includes('--list-local'), approveSlot !== undefined, rejectSlot !== undefined].filter(Boolean).length;
  if (actions > 1) throw new Error('choose only one of --generate|--list-local|--approve-local|--reject-local');
  let result;
  if (approveSlot !== undefined || rejectSlot !== undefined) result = reviewLifeLocalCandidate({
    root: targetRoot,
    game: String(manifest.game ?? ''),
    slotId: approveSlot ?? rejectSlot,
    action: approveSlot !== undefined ? 'approve' : 'reject',
    assetSlotManifest: approveSlot !== undefined ? manifest : undefined,
    reviewedBy,
  });
  else if (argv.includes('--list-local')) result = { ok: true, ...readLifeLocalReviews({ root: targetRoot, game: String(manifest.game ?? '') }) };
  else if (argv.includes('--generate')) result = await executeLifeAssetGenerationBatch({
      root: targetRoot,
      manifest,
      records,
      mock: !argv.includes('--real-provider'),
      allowRealProvider: argv.includes('--real-provider'),
      provider,
    });
  else result = { ok: batch.valid, batch, results: [] };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
