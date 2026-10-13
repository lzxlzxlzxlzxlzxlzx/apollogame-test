import { createHash } from 'node:crypto';
import {
  lstatSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  type BigIntStats,
  type Stats,
} from 'node:fs';
import { isAbsolute, join, parse, resolve } from 'node:path';
import {
  LIFE_GENERATION_PROMPT_VERSION,
  LIFE_GENERATION_SCHEMA,
  canonicalLifeGenerationJson,
  checkLifeGenerationBundle,
  lifeGenerationPayload,
  sha256Canonical,
  type LifeGenerationBundleV1,
  type LifeGenerationDiagnostic,
} from './life-generation-bundle.js';

export const LIFE_GENERATION_SLICE_MANIFEST_SCHEMA = 'zerocraft.life-generation-slice-manifest.v1' as const;
export const LIFE_GENERATION_PATCH_SCHEMA = 'zerocraft.life-generation-patch.v1' as const;
export const LIFE_BUNDLE_CANDIDATE_FILE = 'bundle.candidate.json' as const;

type JsonObject = Record<string, unknown>;
type ComposeSource = 'manifest' | 'source' | 'slice' | 'bundle' | 'write';

export interface LifeBundleComposeDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly source: ComposeSource;
}

export interface LifeGenerationSliceManifestV1 {
  readonly schemaVersion: typeof LIFE_GENERATION_SLICE_MANIFEST_SCHEMA;
  readonly session: LifeGenerationBundleV1['session'];
  readonly slug: string;
  readonly world: string;
  readonly slices: readonly string[];
  readonly assetSlots: string;
}

export interface LifeBundleComposeResult {
  readonly schemaVersion: 'zerocraft.life-bundle-compose-result.v1';
  readonly ok: boolean;
  readonly mode: 'plan' | 'write-candidate';
  readonly writesPerformed: boolean;
  readonly writtenFiles: 0 | 1;
  readonly sourceRoot?: string;
  readonly targetPath?: string;
  readonly inputHash?: string;
  readonly bundleHash?: string;
  readonly candidateHash?: string;
  readonly candidateBytes?: number;
  readonly bundle?: LifeGenerationBundleV1;
  readonly diagnostics: readonly (LifeBundleComposeDiagnostic | LifeGenerationDiagnostic)[];
}

export interface LifeBundleComposeHooks {
  readonly beforeWrite?: (sourceRoot: string, targetPath: string) => void;
  readonly beforeRename?: (stagingPath: string, targetPath: string) => void;
  readonly afterRename?: (targetPath: string) => void;
}

export interface LifeBundleComposeOptions {
  readonly sourceRoot: string;
  readonly manifestFile: string;
  readonly writeCandidate?: boolean;
  readonly hooks?: LifeBundleComposeHooks;
}

interface EntryIdentity { readonly dev: bigint; readonly ino: bigint }
interface SourceSnapshot {
  readonly name: string;
  readonly path: string;
  readonly bytes: string;
  readonly identity: EntryIdentity;
  readonly value: unknown;
}

const record = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const safeSlug = /^game-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const safeId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const safeJsonBasename = /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.json$/;
const forbiddenPointerSegment = new Set(['__proto__', 'prototype', 'constructor']);
const allowedSliceRoots = new Set([
  'playerVisual', 'itemCatalog', 'playerInventory', 'cropCatalog', 'calendar',
  'relationships', 'dialogueCatalog', 'scenes', 'logic', 'constructionProjects',
  'quests', 'milestones',
]);

function identity(stat: BigIntStats): EntryIdentity { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(left: EntryIdentity, right: EntryIdentity): boolean {
  if ((left.dev === 0n && left.ino === 0n) || (right.dev === 0n && right.ino === 0n)) return false;
  return left.dev === right.dev && left.ino === right.ino;
}
function pathStillNames(path: string, expected: EntryIdentity, kind: 'file' | 'directory'): boolean {
  try {
    const stat = lstatSync(path, { bigint: true });
    return !stat.isSymbolicLink() && (kind === 'file' ? stat.isFile() : stat.isDirectory()) && sameIdentity(identity(stat), expected);
  } catch { return false; }
}
function rawSha256(bytes: string): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function pointerEscape(value: string): string { return value.replace(/~/g, '~0').replace(/\//g, '~1'); }
function stableDiagnostics(values: readonly (LifeBundleComposeDiagnostic | LifeGenerationDiagnostic)[]): Array<LifeBundleComposeDiagnostic | LifeGenerationDiagnostic> {
  return [...values].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.source.localeCompare(b.source) || a.message.localeCompare(b.message));
}

function addDiagnostic(out: LifeBundleComposeDiagnostic[], path: string, code: string, message: string, source: ComposeSource): void {
  out.push({ path, code, message, severity: 'error', source });
}

function closedObject(value: unknown, path: string, required: readonly string[], optional: readonly string[], out: LifeBundleComposeDiagnostic[], source: ComposeSource): value is JsonObject {
  if (!record(value)) { addDiagnostic(out, path, 'type', 'must be an object', source); return false; }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value).sort()) if (!allowed.has(key)) addDiagnostic(out, `${path}/${pointerEscape(key)}`, 'unknown_field', 'field is not allowed', source);
  for (const key of required) if (!(key in value)) addDiagnostic(out, `${path}/${pointerEscape(key)}`, 'missing_field', 'field is required', source);
  return true;
}

function validateBasename(value: unknown, path: string, out: LifeBundleComposeDiagnostic[]): value is string {
  if (typeof value !== 'string' || !safeJsonBasename.test(value) || parse(value).base !== value || value.includes('..') || value === LIFE_BUNDLE_CANDIDATE_FILE) {
    addDiagnostic(out, path, 'unsafe_source_name', 'must be a safe same-directory .json basename distinct from bundle.candidate.json', 'manifest');
    return false;
  }
  return true;
}

function validateManifest(raw: unknown, manifestFile: string, out: LifeBundleComposeDiagnostic[]): LifeGenerationSliceManifestV1 | undefined {
  if (!closedObject(raw, '/manifest', ['schemaVersion', 'session', 'slug', 'world', 'slices', 'assetSlots'], [], out, 'manifest')) return undefined;
  if (raw.schemaVersion !== LIFE_GENERATION_SLICE_MANIFEST_SCHEMA) addDiagnostic(out, '/manifest/schemaVersion', 'schema_version', `must equal ${LIFE_GENERATION_SLICE_MANIFEST_SCHEMA}`, 'manifest');
  if (!closedObject(raw.session, '/manifest/session', ['id', 'round', 'createdBy', 'promptContractVersion'], [], out, 'manifest')) return undefined;
  if (typeof raw.session.id !== 'string' || !safeId.test(raw.session.id)) addDiagnostic(out, '/manifest/session/id', 'id', 'must be a safe stable id', 'manifest');
  if (!Number.isInteger(raw.session.round) || Number(raw.session.round) < 0 || Number(raw.session.round) > 8) addDiagnostic(out, '/manifest/session/round', 'round', 'must be an integer from 0 to 8', 'manifest');
  if (!['human', 'model', 'mixed'].includes(String(raw.session.createdBy))) addDiagnostic(out, '/manifest/session/createdBy', 'enum', 'must be human|model|mixed', 'manifest');
  if (raw.session.promptContractVersion !== LIFE_GENERATION_PROMPT_VERSION) addDiagnostic(out, '/manifest/session/promptContractVersion', 'prompt_version', `must equal ${LIFE_GENERATION_PROMPT_VERSION}`, 'manifest');
  if (typeof raw.slug !== 'string' || !safeSlug.test(raw.slug)) addDiagnostic(out, '/manifest/slug', 'slug', 'must match game-<lowercase-kebab>', 'manifest');
  validateBasename(raw.world, '/manifest/world', out);
  validateBasename(raw.assetSlots, '/manifest/assetSlots', out);
  if (!Array.isArray(raw.slices) || raw.slices.length === 0 || raw.slices.length > 32) {
    addDiagnostic(out, '/manifest/slices', 'slice_count', 'must contain 1..32 ordered slice filenames', 'manifest');
  } else raw.slices.forEach((name, index) => validateBasename(name, `/manifest/slices/${index}`, out));
  const names = [manifestFile, raw.world, raw.assetSlots, ...(Array.isArray(raw.slices) ? raw.slices : [])].filter((name): name is string => typeof name === 'string');
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) addDiagnostic(out, '/manifest', 'duplicate_source', `source filename ${name} is duplicated`, 'manifest');
    seen.add(name);
  }
  return out.length === 0 ? raw as unknown as LifeGenerationSliceManifestV1 : undefined;
}

function decodePointer(path: unknown, diagnosticPath: string, out: LifeBundleComposeDiagnostic[]): string[] | undefined {
  if (typeof path !== 'string' || path === '' || !path.startsWith('/') || path.endsWith('/') || /~(?![01])/u.test(path)) {
    addDiagnostic(out, diagnosticPath, 'json_pointer', 'must be a non-root absolute JSON Pointer with valid escapes', 'slice');
    return undefined;
  }
  const segments = path.slice(1).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (segments.some((segment) => segment.length === 0 || forbiddenPointerSegment.has(segment))) {
    addDiagnostic(out, diagnosticPath, 'json_pointer_forbidden', 'empty and prototype-polluting pointer segments are forbidden', 'slice');
    return undefined;
  }
  if (!allowedSliceRoots.has(segments[0]!)) {
    addDiagnostic(out, diagnosticPath, 'json_pointer_scope', 'slice operations may only target approved actors/construction/plot roots', 'slice');
    return undefined;
  }
  return segments;
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    const ok = value.every((entry) => isJsonValue(entry, seen));
    seen.delete(value);
    return ok;
  }
  if (!record(value) || seen.has(value)) return false;
  seen.add(value);
  const ok = Object.entries(value).every(([key, entry]) => !forbiddenPointerSegment.has(key) && isJsonValue(entry, seen));
  seen.delete(value);
  return ok;
}

function applyOperation(document: unknown, operation: JsonObject, segments: readonly string[], path: string, out: LifeBundleComposeDiagnostic[]): void {
  let parent: unknown = document;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index]!;
    if (Array.isArray(parent)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment) || Number(segment) >= parent.length) { addDiagnostic(out, path, 'array_index', 'array parent index is out of bounds', 'slice'); return; }
      parent = parent[Number(segment)];
    } else if (record(parent) && Object.prototype.hasOwnProperty.call(parent, segment)) parent = parent[segment];
    else { addDiagnostic(out, path, 'missing_parent', 'JSON Pointer parent does not exist', 'slice'); return; }
  }
  const leaf = segments.at(-1)!;
  const op = operation.op;
  const value = structuredClone(operation.value);
  if (Array.isArray(parent)) {
    if (op === 'add' && leaf === '-') { parent.push(value); return; }
    if (!/^(?:0|[1-9]\d*)$/.test(leaf)) { addDiagnostic(out, path, 'array_index', 'array target must be a canonical index or add /-', 'slice'); return; }
    const index = Number(leaf);
    if (op === 'add') {
      if (index > parent.length) { addDiagnostic(out, path, 'array_index', 'add array index is out of bounds', 'slice'); return; }
      parent.splice(index, 0, value); return;
    }
    if (index >= parent.length) { addDiagnostic(out, path, 'array_index', 'replace array index is out of bounds', 'slice'); return; }
    parent[index] = value; return;
  }
  if (!record(parent)) { addDiagnostic(out, path, 'missing_parent', 'JSON Pointer parent is not a container', 'slice'); return; }
  const exists = Object.prototype.hasOwnProperty.call(parent, leaf);
  if (op === 'add' && exists) { addDiagnostic(out, path, 'add_exists', 'add target already exists', 'slice'); return; }
  if (op === 'replace' && !exists) { addDiagnostic(out, path, 'replace_missing', 'replace target does not exist', 'slice'); return; }
  parent[leaf] = value;
}

function validateAndApplySlice(raw: unknown, name: string, worldName: string, priorSlices: readonly string[], document: unknown, out: LifeBundleComposeDiagnostic[]): void {
  const base = `/sources/${pointerEscape(name)}`;
  if (!closedObject(raw, base, ['schemaVersion', 'baseWorld', 'operations'], ['requiresSlices'], out, 'slice')) return;
  if (raw.schemaVersion !== LIFE_GENERATION_PATCH_SCHEMA) addDiagnostic(out, `${base}/schemaVersion`, 'slice_schema', `must equal ${LIFE_GENERATION_PATCH_SCHEMA}`, 'slice');
  if (raw.baseWorld !== worldName) addDiagnostic(out, `${base}/baseWorld`, 'base_world', `must equal ${worldName}`, 'slice');
  const requires = raw.requiresSlices === undefined ? [] : raw.requiresSlices;
  // SIMLIFE-BUNDLE-05: every slice must depend on the entire approved prefix in exact order.
  if (!Array.isArray(requires) || requires.some((entry) => typeof entry !== 'string') || canonicalLifeGenerationJson(requires) !== canonicalLifeGenerationJson(priorSlices)) {
    addDiagnostic(out, `${base}/requiresSlices`, 'slice_dependencies', 'must exactly equal all preceding manifest slices in order', 'slice');
  }
  if (!Array.isArray(raw.operations) || raw.operations.length === 0 || raw.operations.length > 64) {
    addDiagnostic(out, `${base}/operations`, 'operation_count', 'must contain 1..64 operations', 'slice'); return;
  }
  const seenPaths = new Set<string>();
  raw.operations.forEach((operation, index) => {
    const opPath = `${base}/operations/${index}`;
    if (!closedObject(operation, opPath, ['op', 'path', 'value'], [], out, 'slice')) return;
    if (operation.op !== 'add' && operation.op !== 'replace') { addDiagnostic(out, `${opPath}/op`, 'operation', 'must be add|replace', 'slice'); return; }
    if (!isJsonValue(operation.value)) { addDiagnostic(out, `${opPath}/value`, 'json_value', 'must be a finite ordinary JSON value without prototype keys', 'slice'); return; }
    const segments = decodePointer(operation.path, `${opPath}/path`, out);
    if (!segments || typeof operation.path !== 'string') return;
    if (seenPaths.has(operation.path) && !operation.path.endsWith('/-')) { addDiagnostic(out, `${opPath}/path`, 'duplicate_operation', 'operation path is duplicated within the slice', 'slice'); return; }
    seenPaths.add(operation.path);
    applyOperation(document, operation, segments, opPath, out);
  });
}

function result(mode: 'plan' | 'write-candidate', diagnostics: readonly (LifeBundleComposeDiagnostic | LifeGenerationDiagnostic)[], fields: Partial<LifeBundleComposeResult> = {}): LifeBundleComposeResult {
  return {
    schemaVersion: 'zerocraft.life-bundle-compose-result.v1',
    ok: !diagnostics.some((entry) => entry.severity === 'error'),
    mode,
    writesPerformed: false,
    writtenFiles: 0,
    diagnostics: stableDiagnostics(diagnostics),
    ...fields,
  };
}

function loadSource(root: string, name: string, diagnosticPath: string, out: LifeBundleComposeDiagnostic[]): SourceSnapshot | undefined {
  const path = join(root, name);
  try {
    const stat = lstatSync(path, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile()) { addDiagnostic(out, diagnosticPath, 'unsafe_source', 'source must be a regular non-symlink file', 'source'); return undefined; }
    if (resolve(realpathSync(path)) !== resolve(path)) { addDiagnostic(out, diagnosticPath, 'source_escape', 'source real path must remain in source root', 'source'); return undefined; }
    const bytes = readFileSync(path, 'utf8');
    let value: unknown;
    try { value = JSON.parse(bytes) as unknown; }
    catch { addDiagnostic(out, diagnosticPath, 'invalid_json', 'source must contain valid JSON', 'source'); return undefined; }
    return { name, path, bytes, identity: identity(stat), value };
  } catch (error) {
    addDiagnostic(out, diagnosticPath, 'source_io', error instanceof Error ? error.message : String(error), 'source');
    return undefined;
  }
}

function sourcesUnchanged(sources: readonly SourceSnapshot[]): boolean {
  return sources.every((source) => pathStillNames(source.path, source.identity, 'file') && readFileSync(source.path, 'utf8') === source.bytes);
}

function verifyCandidate(path: string, expectedBytes: string): boolean {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || readFileSync(path, 'utf8') !== expectedBytes) return false;
  try { return checkLifeGenerationBundle(JSON.parse(expectedBytes) as unknown).ok; }
  catch { return false; }
}

/** Compose approved Life slices into a strict, directly materializable Bundle candidate. */
export function composeLifeGenerationBundle(options: LifeBundleComposeOptions): LifeBundleComposeResult {
  const mode = options.writeCandidate ? 'write-candidate' : 'plan';
  const diagnostics: LifeBundleComposeDiagnostic[] = [];
  if (!isAbsolute(options.sourceRoot)) return result(mode, [{ path: '/source-root', code: 'absolute_required', message: 'source root must be absolute', severity: 'error', source: 'source' }]);
  if (!validateBasename(options.manifestFile, '/manifest-file', diagnostics)) return result(mode, diagnostics);
  const sourceRoot = resolve(options.sourceRoot);
  let rootIdentity: EntryIdentity;
  try {
    const stat = lstatSync(sourceRoot, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory() || resolve(realpathSync(sourceRoot)) !== sourceRoot || sourceRoot === parse(sourceRoot).root) {
      addDiagnostic(diagnostics, '/source-root', 'unsafe_root', 'source root must be an existing canonical non-root directory', 'source');
      return result(mode, diagnostics);
    }
    rootIdentity = identity(stat);
  } catch (error) {
    addDiagnostic(diagnostics, '/source-root', 'source_io', error instanceof Error ? error.message : String(error), 'source');
    return result(mode, diagnostics);
  }
  const manifestSource = loadSource(sourceRoot, options.manifestFile, '/manifest-file', diagnostics);
  if (!manifestSource) return result(mode, diagnostics, { sourceRoot });
  const manifest = validateManifest(manifestSource.value, options.manifestFile, diagnostics);
  if (!manifest) return result(mode, diagnostics, { sourceRoot });
  const sourceNames = [manifest.world, ...manifest.slices, manifest.assetSlots];
  const sources = sourceNames.map((name, index) => loadSource(sourceRoot, name, `/sources/${index}`, diagnostics)).filter((entry): entry is SourceSnapshot => Boolean(entry));
  const allSources = [manifestSource, ...sources];
  if (sources.length !== sourceNames.length || diagnostics.length > 0) return result(mode, diagnostics, { sourceRoot });

  const world = structuredClone(sources[0]!.value);
  if (!record(world)) addDiagnostic(diagnostics, `/sources/${pointerEscape(manifest.world)}`, 'world_type', 'world source must be an object', 'source');
  for (let index = 0; index < manifest.slices.length && diagnostics.length === 0; index++) {
    validateAndApplySlice(sources[index + 1]!.value, manifest.slices[index]!, manifest.world, manifest.slices.slice(0, index), world, diagnostics);
  }
  const assetDraft = sources.at(-1)!.value as LifeGenerationBundleV1['assetSlots']['draft'];
  const partial = {
    schemaVersion: LIFE_GENERATION_SCHEMA,
    session: manifest.session,
    game: { slug: manifest.slug, lifePackage: world },
    assetSlots: { draft: assetDraft },
  };
  const bundle: LifeGenerationBundleV1 = {
    ...partial,
    provenance: {
      baseHash: sha256Canonical(lifeGenerationPayload(partial)),
      sourceHashes: { lifePackage: sha256Canonical(world), assetSlotsDraft: sha256Canonical(assetDraft) },
    },
  };
  const checked = diagnostics.length === 0 ? checkLifeGenerationBundle(bundle) : undefined;
  if (checked) diagnostics.push(...checked.diagnostics.filter((entry) => entry.severity === 'error').map((entry) => ({ path: entry.path, code: entry.code, message: entry.message, severity: entry.severity, source: 'bundle' as const })));
  const warnings = checked?.diagnostics.filter((entry) => entry.severity === 'warning') ?? [];
  const candidate = `${canonicalLifeGenerationJson(bundle)}\n`;
  const targetPath = join(sourceRoot, LIFE_BUNDLE_CANDIDATE_FILE);
  const fields = {
    sourceRoot,
    targetPath,
    inputHash: sha256Canonical({ manifest, sources: allSources.map((source) => ({ name: source.name, hash: rawSha256(source.bytes) })) }),
    bundleHash: bundle.provenance.baseHash,
    candidateHash: rawSha256(candidate),
    candidateBytes: Buffer.byteLength(candidate),
    bundle,
  };
  if (diagnostics.length > 0 || !checked?.ok) return result(mode, [...diagnostics, ...warnings], fields);
  if (!options.writeCandidate) return result(mode, warnings, fields);

  let stagingDirectory: string | undefined;
  let stagingDirectoryIdentity: EntryIdentity | undefined;
  let stagingPath: string | undefined;
  let stagingIdentity: EntryIdentity | undefined;
  let publishedIdentity: EntryIdentity | undefined;
  try {
    let targetStat: Stats | undefined;
    try { targetStat = lstatSync(targetPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (targetStat) {
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) return result(mode, [...warnings, { path: '/target', code: 'unsafe_target', message: 'candidate target must be a regular non-symlink file', severity: 'error', source: 'write' }], fields);
      if (!verifyCandidate(targetPath, candidate)) return result(mode, [...warnings, { path: '/target', code: 'target_conflict', message: 'existing candidate differs from current canonical bytes or fails strict verification', severity: 'error', source: 'write' }], fields);
      return result(mode, warnings, fields);
    }
    options.hooks?.beforeWrite?.(sourceRoot, targetPath);
    if (!pathStillNames(sourceRoot, rootIdentity, 'directory') || !sourcesUnchanged(allSources)) throw new Error('source_changed: source root or source bytes changed before candidate write');
    stagingDirectory = mkdtempSync(join(sourceRoot, '.bundle-candidate-stage-'));
    stagingDirectoryIdentity = identity(lstatSync(stagingDirectory, { bigint: true }));
    stagingPath = join(stagingDirectory, LIFE_BUNDLE_CANDIDATE_FILE);
    writeFileSync(stagingPath, candidate, { encoding: 'utf8', flag: 'wx' });
    stagingIdentity = identity(lstatSync(stagingPath, { bigint: true }));
    if (!verifyCandidate(stagingPath, candidate)) throw new Error('staging_verify: staged candidate failed strict verification');
    options.hooks?.beforeRename?.(stagingPath, targetPath);
    if (!pathStillNames(sourceRoot, rootIdentity, 'directory') || !sourcesUnchanged(allSources)) throw new Error('source_changed: source root or source bytes changed before publication');
    if (!stagingIdentity || !pathStillNames(stagingPath, stagingIdentity, 'file')) throw new Error('staging_race: staging file identity changed');
    try { lstatSync(targetPath); throw new Error('target_race: candidate target appeared before publication'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    // A same-directory hard-link publishes the fully verified bytes atomically and,
    // unlike rename(), fails with EEXIST instead of replacing a racing target.
    linkSync(stagingPath, targetPath);
    const publishedStat = lstatSync(targetPath, { bigint: true });
    if (publishedStat.isSymbolicLink() || !publishedStat.isFile() || !sameIdentity(identity(publishedStat), stagingIdentity)) throw new Error('target_race: published candidate identity changed');
    publishedIdentity = identity(publishedStat);
    unlinkSync(stagingPath);
    stagingPath = undefined;
    if (stagingDirectoryIdentity && pathStillNames(stagingDirectory, stagingDirectoryIdentity, 'directory')) rmSync(stagingDirectory, { recursive: true, force: true });
    stagingDirectory = undefined;
    options.hooks?.afterRename?.(targetPath);
    if (!pathStillNames(sourceRoot, rootIdentity, 'directory') || !sourcesUnchanged(allSources)) throw new Error('source_changed: source root or source bytes changed after candidate publication');
    if (!pathStillNames(targetPath, publishedIdentity, 'file') || !verifyCandidate(targetPath, candidate)) throw new Error('post_verify: published candidate failed strict verification');
    return result(mode, warnings, { ...fields, writesPerformed: true, writtenFiles: 1 });
  } catch (error) {
    if (stagingDirectory && stagingDirectoryIdentity && pathStillNames(stagingDirectory, stagingDirectoryIdentity, 'directory')) rmSync(stagingDirectory, { recursive: true, force: true });
    if (publishedIdentity && pathStillNames(targetPath, publishedIdentity, 'file')) rmSync(targetPath, { force: true });
    return result(mode, [...warnings, { path: '/write', code: 'io_failure', message: error instanceof Error ? error.message : String(error), severity: 'error', source: 'write' }], fields);
  }
}
